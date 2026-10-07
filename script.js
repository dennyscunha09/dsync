// ============================================================
// D.Sync - SISTEMA COMPLETO REFATORADO + EXPORTAÇÃO PDF
// ============================================================

const state = {
  produtos: [],
  prateleiras: [],
  carga: [],
  historico: [],
  usuarios: [],
  usuarioAtual: null,
  chart: null,
  codigosLidos: [],
  currentEdit: null,
  currentSeparacao: null,
  currentCargaEdit: null,
  modalType: '',
  backupInterval: null,
  pedidoAtual: {},
  pedidoSeparacaoAtual: { codigo: null, itens: {} },
  pedidosSeparar: [],
  pedidosFinalizados: [],
  limiteBaixo: 5,
  limiteCritico: 2,
  html5QrCode: null,
  currentPosicaoEdit: null,
  undoStack: [],
  pedidoCargaAtual: { ativo: false, codigo: '', itens: {} },
  insumos: { caixaModeloA: 8000, caixaModeloB: 8000, embalagem40x50: 0, embalagens: {} },
  configInsumos: {
    caixasPorProduto: 1,
    alertaCaixaModeloA: 500,
    alertaCaixaModeloB: 500,
    alertaEmbalagem40x50: 500,
    alertaEmbalagemPadrao: 100,
    alertaEmbalagemPorProduto: {}
  },
  produtoInsumoMap: {},
  injecao: [],
  injetando: [],
  injetados: [],
  materiaPrima: { tipos: ['PP', 'PE', 'PET', 'PS', 'PVC', 'ECO'], estoque: {} }
};

const CARGA_PEDIDO_TAG = '__carga__';

const STORAGE_KEYS = {
  produtos: 'produtos', prateleiras: 'prateleiras', carga: 'carga',
  historico: 'historico', usuarios: 'usuarios', sessao: 'sessao',
  tema: 'theme', limiteBaixo: 'limiteBaixo', limiteCritico: 'limiteCritico',
  logAcessos: 'logAcessos', backupAuto: 'backup_auto', insumos: 'insumos',
  configInsumos: 'configInsumos', produtoInsumoMap: 'produtoInsumoMap',
  pedidosSeparar: 'pedidosSeparar', pedidosFinalizados: 'pedidosFinalizados',
  injecao: 'injecao', injetando: 'injetando', injetados: 'injetados',
  materiaPrima: 'materiaPrima', initialized: 'dsync_initialized',
  pedidoCarga: 'pedidoCargaAtual'
};

// ===== HELPERS =====
function getData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function setData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error(e); mostrarToast('⚠️ Erro ao salvar (armazenamento cheio?)', 'warning'); }
}

function saveData() {
  setData(STORAGE_KEYS.produtos, state.produtos);
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.carga, state.carga);
  setData(STORAGE_KEYS.historico, state.historico);
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  setData(STORAGE_KEYS.pedidosFinalizados, state.pedidosFinalizados);
  setData(STORAGE_KEYS.injecao, state.injecao);
  setData(STORAGE_KEYS.injetando, state.injetando);
  setData(STORAGE_KEYS.injetados, state.injetados);
  setData(STORAGE_KEYS.materiaPrima, state.materiaPrima);
}

function salvarInsumos() {
  setData(STORAGE_KEYS.insumos, state.insumos);
  setData(STORAGE_KEYS.configInsumos, state.configInsumos);
  setData(STORAGE_KEYS.produtoInsumoMap, state.produtoInsumoMap);
}

function registrarHistorico(produtoNome, acao, quantidade, detalhes) {
  state.historico.unshift({
    produto: produtoNome, acao, quantidade, detalhes,
    data: new Date().toLocaleString()
  });
  if (state.historico.length > 1000) state.historico = state.historico.slice(0, 1000);
  setData(STORAGE_KEYS.historico, state.historico);
}

// ===== VÍNCULOS DE INJEÇÃO E 40x50 =====
function autoDetectarVinculo(nome) {
  if (!nome) return '';
  const map = [
    { test: /^1,0-/, valor: 'C1N' },
    { test: /^1,5-/, valor: 'C15N' },
    { test: /^2,0-/, valor: 'C2N' },
    { test: /^3,0-/, valor: 'C3N' },
    { test: /^CUNHA-/i, valor: 'CUNHA(V)' },
    { test: /^♻️1,0-/, valor: 'C1E' },
    { test: /^♻️1,5-/, valor: 'C15E' },
    { test: /^♻️2,0-/, valor: 'C2E' },
    { test: /^♻️3,0-/, valor: 'C3E' },
    { test: /^♻️CUNHA-/i, valor: 'CUNHA(E)' }
  ];
  for (const m of map) if (m.test.test(nome)) return m.valor;
  return '';
}

function autoDetectarEmbalagem(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('kit')) return '40x50';
  if (/-(500|200)$/.test(nome || '')) return '40x50';
  return 'individual';
}

function getVinculosInjecao(produto) {
  if (!produto) return [];
  const nome = (produto.nome || '').toLowerCase();
  if (nome.includes('kit')) {
    return [
      { injetado: 'C2N', multiplicador: 1 },
      { injetado: 'CUNHA(V)', multiplicador: 0.2 }
    ];
  }
  if (produto.injecaoVinculo) {
    return [{ injetado: produto.injecaoVinculo, multiplicador: 1 }];
  }
  return [];
}

function descontarInjetadosPorFamilia(produto, quantidadeCaixas) {
  if (!produto) return 0;
  const vinculos = getVinculosInjecao(produto);
  if (vinculos.length === 0) return 0;
  let total = 0;
  vinculos.forEach(v => {
    let resto = quantidadeCaixas * v.multiplicador;
    if (resto <= 0) return;
    const regs = state.injetados
      .filter(i => i.nome === v.injetado || i.codigoExtra === v.injetado)
      .sort((a, b) => new Date(a.data) - new Date(b.data));
    for (const r of regs) {
      if (resto <= 0) break;
      const d = Math.min(r.quantidade, resto);
      r.quantidade -= d;
      resto -= d;
      total += d;
    }
  });
  state.injetados = state.injetados.filter(i => i.quantidade > 0);
  saveData();
  renderizarInjetados();
  return total;
}

function usaEmbalagem40x50(produto) {
  if (!produto) return false;
  const config = state.produtoInsumoMap[produto.id];
  if (config && config.tipoEmbalagem) return config.tipoEmbalagem === '40x50';
  return autoDetectarEmbalagem(produto.nome) === '40x50';
}

function migrarProdutosParaInjecao() {
  let alterou = false;
  state.produtos.forEach(p => {
    if (p.injecaoVinculo === undefined) {
      p.injecaoVinculo = autoDetectarVinculo(p.nome);
      alterou = true;
    }
    if (!state.produtoInsumoMap[p.id]) {
      state.produtoInsumoMap[p.id] = {
        modeloCaixa: 'A',
        embalagemPorCaixa: p.pacotesPorVolume || 25,
        tipoEmbalagem: autoDetectarEmbalagem(p.nome)
      };
      alterou = true;
      return;
    }
    const config = state.produtoInsumoMap[p.id];
    if (!config.tipoEmbalagem) {
      config.tipoEmbalagem = autoDetectarEmbalagem(p.nome);
      alterou = true;
    }
    if (!config.modeloCaixa) {
      config.modeloCaixa = 'A';
      alterou = true;
    }
    if (!config.embalagemPorCaixa || isNaN(parseInt(config.embalagemPorCaixa))) {
      config.embalagemPorCaixa = p.pacotesPorVolume || 25;
      alterou = true;
    }
  });
  if (alterou) {
    setData(STORAGE_KEYS.produtos, state.produtos);
    salvarInsumos();
  }
}

// ===== PEDIDO DE CARGA PERSISTENTE =====
function salvarPedidoCarga() {
  setData(STORAGE_KEYS.pedidoCarga, state.pedidoCargaAtual);
}

function carregarPedidoCarga() {
  const salvo = getData(STORAGE_KEYS.pedidoCarga, null);
  if (!salvo || typeof salvo !== 'object') return;
  if (salvo.ativo !== undefined && salvo.itens !== undefined) {
    state.pedidoCargaAtual = salvo;
    if (!state.pedidoCargaAtual.itens) state.pedidoCargaAtual.itens = {};
  } else {
    const itens = {};
    Object.values(salvo).forEach(item => {
      if (item && item.produtoId) {
        itens[item.produtoId] = {
          produtoId: item.produtoId,
          nome: item.nome,
          codigoInterno: item.codigoInterno || '',
          quantidadePedida: item.quantidade || 0,
          quantidadeProduzida: 0
        };
      }
    });
    state.pedidoCargaAtual = { ativo: Object.keys(itens).length > 0, codigo: '', itens };
  }
}

function getReservadoCargaAtual(pid) {
  return state.carga
    .filter(c => c.id === pid && c.pedidoCodigo === CARGA_PEDIDO_TAG)
    .reduce((a, c) => a + c.quantidade, 0);
}

function getFaltaCargaAtual(item) {
  const reservado = getReservadoCargaAtual(item.produtoId);
  const produzido = item.quantidadeProduzida || 0;
  return Math.max(0, item.quantidadePedida - reservado - produzido);
}

function isProdutoNaCargaAtual(pid) {
  return state.pedidoCargaAtual.ativo && state.pedidoCargaAtual.itens && state.pedidoCargaAtual.itens[pid];
}

function tentarAutoReservarCarga(pid, shelfId, posicao, quantidadeAdicionada) {
  if (!isProdutoNaCargaAtual(pid)) return 0;
  const item = state.pedidoCargaAtual.itens[pid];
  const falta = getFaltaCargaAtual(item);
  if (falta <= 0) return 0;
  const reservar = Math.min(quantidadeAdicionada, falta);
  if (reservar <= 0) return 0;
  state.carga.push({
    uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    id: pid,
    quantidade: reservar,
    prateleira: shelfId,
    posicao: posicao.toString(),
    pedidoCodigo: CARGA_PEDIDO_TAG
  });
  return reservar;
}

// ===== UNDO =====
function salvarEstadoParaUndo() {
  const snapshot = {
    produtos: JSON.parse(JSON.stringify(state.produtos)),
    prateleiras: JSON.parse(JSON.stringify(state.prateleiras)),
    carga: JSON.parse(JSON.stringify(state.carga)),
    historico: JSON.parse(JSON.stringify(state.historico)),
    insumos: JSON.parse(JSON.stringify(state.insumos)),
    configInsumos: JSON.parse(JSON.stringify(state.configInsumos)),
    produtoInsumoMap: JSON.parse(JSON.stringify(state.produtoInsumoMap)),
    pedidosSeparar: JSON.parse(JSON.stringify(state.pedidosSeparar)),
    pedidosFinalizados: JSON.parse(JSON.stringify(state.pedidosFinalizados)),
    injecao: JSON.parse(JSON.stringify(state.injecao)),
    injetando: JSON.parse(JSON.stringify(state.injetando)),
    injetados: JSON.parse(JSON.stringify(state.injetados)),
    materiaPrima: JSON.parse(JSON.stringify(state.materiaPrima)),
    pedidoCargaAtual: JSON.parse(JSON.stringify(state.pedidoCargaAtual))
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 50) state.undoStack.shift();
}

function desfazer() {
  if (state.undoStack.length === 0) { mostrarToast('Nada para desfazer', 'info'); return; }
  const s = state.undoStack.pop();
  state.produtos = s.produtos;
  state.prateleiras = s.prateleiras;
  state.carga = s.carga;
  state.historico = s.historico;
  state.insumos = s.insumos;
  state.configInsumos = s.configInsumos;
  state.produtoInsumoMap = s.produtoInsumoMap;
  state.pedidosSeparar = s.pedidosSeparar;
  state.pedidosFinalizados = s.pedidosFinalizados;
  state.injecao = s.injecao;
  state.injetando = s.injetando;
  state.injetados = s.injetados;
  state.materiaPrima = s.materiaPrima;
  if (s.pedidoCargaAtual) state.pedidoCargaAtual = s.pedidoCargaAtual;
  saveData(); salvarInsumos(); salvarPedidoCarga();
  atualizarTudo();
  renderizarInsumos(); atualizarListasPedidos();
  renderizarInjecao(); renderizarInjetar(); renderizarInjetando();
  renderizarInjetados(); renderizarMateriaPrima();
  atualizarPedidoCarga();
  mostrarToast('↩️ Ação desfeita', 'success');
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    const alvo = e.target;
    const dentroDeCampo = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
    if (dentroDeCampo) return;
    e.preventDefault();
    desfazer();
  }
});

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function () {
  console.log('🚀 Inicializando D.Sync...');
  carregarDados();
  carregarInsumos();
  carregarPedidoCarga();
  const sessao = getData(STORAGE_KEYS.sessao, null);
  if (sessao) {
    state.usuarioAtual = state.usuarios.find(u => u.id === sessao.usuarioId);
    if (state.usuarioAtual) { entrarApp(); return; }
  }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
});

function carregarDados() {
  state.produtos = getData(STORAGE_KEYS.produtos, []);
  state.prateleiras = getData(STORAGE_KEYS.prateleiras, []);
  state.carga = getData(STORAGE_KEYS.carga, []);
  state.historico = getData(STORAGE_KEYS.historico, []);
  state.usuarios = getData(STORAGE_KEYS.usuarios, []);
  state.limiteBaixo = getData(STORAGE_KEYS.limiteBaixo, 5);
  state.limiteCritico = getData(STORAGE_KEYS.limiteCritico, 2);
  state.pedidosSeparar = getData(STORAGE_KEYS.pedidosSeparar, []);
  state.pedidosFinalizados = getData(STORAGE_KEYS.pedidosFinalizados, []);
  state.injecao = getData(STORAGE_KEYS.injecao, []);
  state.injetando = getData(STORAGE_KEYS.injetando, []);
  state.injetados = getData(STORAGE_KEYS.injetados, []);
  state.materiaPrima = getData(STORAGE_KEYS.materiaPrima, { tipos: ['PP','PE','PET','PS','PVC','ECO'], estoque: {} });

  if (state.usuarios.length === 0) {
    state.usuarios = [{ id: 'admin', nome: 'admin', senha: 'admin123', tipo: 'admin' }];
    setData(STORAGE_KEYS.usuarios, state.usuarios);
  }

  state.prateleiras = state.prateleiras.map(shelf => {
    const produtos = (shelf.produtos || []).map(prod => {
      if (prod.posicao && typeof prod.posicao === 'string') {
        const m = prod.posicao.match(/(\d+)$/);
        if (m) prod.posicao = m[1];
      }
      return prod;
    });
    return { ...shelf, numPosicoes: shelf.numPosicoes || 12, produtos };
  });

  state.carga = state.carga.map(item => ({
    uid: item.uid || ('c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
    id: item.id, quantidade: item.quantidade || 0,
    prateleira: item.prateleira || null,
    posicao: item.posicao || null,
    pedidoCodigo: item.pedidoCodigo || null
  }));

  state.produtos = state.produtos.map(p => {
    let pac = parseInt(p.pacotesPorVolume);
    if (isNaN(pac) || pac <= 0) { pac = 25; p.pacotesPorVolume = pac; }
    return p;
  });

  state.injetando = state.injetando.map(m => {
    if (!m.ultimoTick) m.ultimoTick = Date.now();
    if (typeof m.produzido !== 'number' || isNaN(m.produzido)) m.produzido = 0;
    return m;
  });

  atualizarCodigosPrateleiras();
  atualizarListasPedidos();
}

// ===== LOGIN =====
function fazerLogin() {
  const u = document.getElementById('loginUsuario').value.trim();
  const s = document.getElementById('loginSenha').value.trim();
  const msg = document.getElementById('mensagemLogin');
  if (!u || !s) { msg.textContent = '⚠️ Preencha todos os campos!'; msg.style.display = 'block'; return; }
  const user = state.usuarios.find(x => x.nome === u && x.senha === s);
  if (!user) { msg.textContent = '❌ Usuário ou senha incorretos!'; msg.style.display = 'block'; return; }
  state.usuarioAtual = user;
  setData(STORAGE_KEYS.sessao, { usuarioId: user.id });
  const log = getData(STORAGE_KEYS.logAcessos, []);
  log.unshift({ usuario: user.nome, acao: 'Login', data: new Date().toLocaleString() });
  setData(STORAGE_KEYS.logAcessos, log.slice(0, 200));
  entrarApp();
}

function entrarApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  document.getElementById('perfilUsuario').textContent = '👤 ' + state.usuarioAtual.nome;
  document.getElementById('perfilNivel').textContent = state.usuarioAtual.tipo === 'admin' ? '👑 Admin' : '👤 Usuário';
  document.getElementById('tabUsuarios').style.display = state.usuarioAtual.tipo === 'admin' ? 'inline-block' : 'none';

  document.body.classList.remove('tab-dashboard', 'tab-estoque', 'tab-pedidos', 'tab-injecao', 'tab-usuarios');
  document.body.classList.add('tab-dashboard');

  carregarTema();
  carregarPedidoCarga();
  inicializarApp();
  iniciarBackupAutomatico();
  iniciarTimerProducao();
}

function fazerLogout() {
  if (state.usuarioAtual) {
    const log = getData(STORAGE_KEYS.logAcessos, []);
    log.unshift({ usuario: state.usuarioAtual.nome, acao: 'Logout', data: new Date().toLocaleString() });
    setData(STORAGE_KEYS.logAcessos, log.slice(0, 200));
  }
  localStorage.removeItem(STORAGE_KEYS.sessao);
  state.usuarioAtual = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
}

function mostrarCriarConta() { document.getElementById('loginForm').style.display = 'none'; document.getElementById('criarContaForm').style.display = 'block'; document.getElementById('mensagemLogin').style.display = 'none'; }
function mostrarLogin() { document.getElementById('loginForm').style.display = 'block'; document.getElementById('criarContaForm').style.display = 'none'; document.getElementById('mensagemLogin').style.display = 'none'; }

function criarConta() {
  const u = document.getElementById('novoUsuario').value.trim();
  const s = document.getElementById('novaSenha').value;
  const c = document.getElementById('confirmarSenha').value;
  const msg = document.getElementById('mensagemLogin');
  if (!u || !s || !c) { msg.textContent = '⚠️ Preencha todos os campos!'; msg.style.display = 'block'; return; }
  if (s.length < 4) { msg.textContent = '⚠️ Senha deve ter pelo menos 4 caracteres!'; msg.style.display = 'block'; return; }
  if (s !== c) { msg.textContent = '❌ Senhas não coincidem!'; msg.style.display = 'block'; return; }
  if (state.usuarios.find(x => x.nome === u)) { msg.textContent = '❌ Usuário já existe!'; msg.style.display = 'block'; return; }
  salvarEstadoParaUndo();
  state.usuarios.push({ id: Date.now().toString(), nome: u, senha: s, tipo: state.usuarios.length === 0 ? 'admin' : 'user' });
  setData(STORAGE_KEYS.usuarios, state.usuarios);
  msg.textContent = '✅ Conta criada! Faça login.';
  msg.style.display = 'block'; msg.style.color = '#2ecc71';
  setTimeout(() => { mostrarLogin(); document.getElementById('loginUsuario').value = u; msg.style.display = 'none'; msg.style.color = '#e74c3c'; }, 2000);
}

function toggleSenha(id, el) {
  const i = document.getElementById(id);
  if (i.type === 'password') { i.type = 'text'; el.textContent = '🙈'; }
  else { i.type = 'password'; el.textContent = '👁️'; }
}

// ===== TEMA =====
function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const t = document.getElementById('themeToggle');
  const isDark = document.body.classList.contains('dark-mode');
  t.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_KEYS.tema, isDark ? 'dark' : 'light');
}
function carregarTema() {
  const s = localStorage.getItem(STORAGE_KEYS.tema);
  const t = document.getElementById('themeToggle');
  const isDark = s === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  if (t) t.textContent = isDark ? '☀️' : '🌙';
}

// ===== TOAST =====
function mostrarToast(mensagem, tipo = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = mensagem;
  t.className = 'toast';
  if (['success','error','warning'].includes(tipo)) t.classList.add(tipo);
  t.style.display = 'block';
  clearTimeout(t.timeout);
  t.timeout = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

// ===== BACKUP AUTOMÁTICO =====
function iniciarBackupAutomatico() {
  if (state.backupInterval) clearInterval(state.backupInterval);
  state.backupInterval = setInterval(() => {
    saveData(); salvarInsumos(); salvarPedidoCarga();
    setData(STORAGE_KEYS.backupAuto, {
      data: new Date().toISOString(),
      produtos: state.produtos, prateleiras: state.prateleiras,
      carga: state.carga, historico: state.historico,
      insumos: state.insumos, configInsumos: state.configInsumos,
      produtoInsumoMap: state.produtoInsumoMap,
      pedidosSeparar: state.pedidosSeparar, pedidosFinalizados: state.pedidosFinalizados,
      injecao: state.injecao, injetando: state.injetando,
      injetados: state.injetados, materiaPrima: state.materiaPrima,
      pedidoCargaAtual: state.pedidoCargaAtual
    });
  }, 300000);
}

// ===== PRODUÇÃO AUTOMÁTICA =====
let producaoInterval = null;

function valorLiveProduzido(m) {
  const base = m.produzido || 0;
  if (m.status !== 'ativa') return base;
  if (!m.ultimoTick) return base;
  if (!m.caixasPorHora || m.caixasPorHora <= 0) return base;
  const segundos = Math.max(0, (Date.now() - m.ultimoTick) / 1000);
  const incremento = (m.caixasPorHora / 3600) * segundos;
  return base + incremento;
}

function commitProducao(m) {
  if (m.status !== 'ativa') { m.ultimoTick = Date.now(); return; }
  const valor = valorLiveProduzido(m);
  m.produzido = valor;
  m.ultimoTick = Date.now();
}

function recalcularProducaoOffline() {
  let mudou = false;
  const finalizarIds = [];
  state.injetando.forEach(m => {
    if (m.status !== 'ativa') { m.ultimoTick = Date.now(); return; }
    if (!m.ultimoTick) { m.ultimoTick = Date.now(); mudou = true; return; }
    const valor = valorLiveProduzido(m);
    m.produzido = valor;
    m.ultimoTick = Date.now();
    mudou = true;
    if (m.limite > 0 && m.produzido >= m.limite) {
      m.produzido = m.limite;
      finalizarIds.push(m.id);
    }
  });
  if (mudou) saveData();
  finalizarIds.forEach(id => finalizarMaquina(id, true));
  if (finalizarIds.length > 0) {
    setTimeout(() => {
      mostrarToast(`✅ ${finalizarIds.length} máquina(s) finalizada(s) durante sua ausência!`, 'success');
    }, 1500);
  }
}

function iniciarTimerProducao() {
  if (producaoInterval) clearInterval(producaoInterval);
  recalcularProducaoOffline();
  producaoInterval = setInterval(() => {
    let mudou = false;
    const finalizarIds = [];
    state.injetando.forEach(m => {
      if (m.status !== 'ativa') return;
      commitProducao(m);
      mudou = true;
      if (m.limite > 0 && m.produzido >= m.limite) {
        m.produzido = m.limite;
        finalizarIds.push(m.id);
      }
    });
    finalizarIds.forEach(id => finalizarMaquina(id, true));
    if (mudou) {
      saveData();
      renderizarInjetando();
      const el = document.getElementById('dashInjetados');
      if (el) el.textContent = state.injetados.reduce((a, i) => a + i.quantidade, 0).toFixed(0);
    }
  }, 2000);
}

// ===== INICIALIZAR APP =====
function inicializarApp() {
  carregarInsumos();
  const inicializado = getData(STORAGE_KEYS.initialized, false);
  if (state.prateleiras.length === 0) criarPrateleirasPadrao();
  if (state.produtos.length === 0 && !inicializado) criarProdutosExemplo();
  setData(STORAGE_KEYS.initialized, true);
  if (state.usuarioAtual && state.usuarioAtual.tipo === 'admin') { carregarUsuarios(); carregarLogAcesso(); }
  atualizarTudo();
  verificarEstoque();
  renderizarInsumos();
  verificarAlertasInsumos();
  mostrarToast('✅ Bem-vindo, ' + state.usuarioAtual.nome + '!', 'success');
}

// ===== INSUMOS =====
function carregarInsumos() {
  const insumosSalvos = getData(STORAGE_KEYS.insumos, null);
  const configSalvos = getData(STORAGE_KEYS.configInsumos, null);
  const mapaSalvo = getData(STORAGE_KEYS.produtoInsumoMap, null);

  state.insumos = { caixaModeloA: 8000, caixaModeloB: 8000, embalagem40x50: 0, embalagens: {} };
  state.configInsumos = { caixasPorProduto: 1, alertaCaixaModeloA: 500, alertaCaixaModeloB: 500, alertaEmbalagem40x50: 500, alertaEmbalagemPadrao: 100, alertaEmbalagemPorProduto: {} };
  state.produtoInsumoMap = {};

  if (insumosSalvos) {
    state.insumos.caixaModeloA = insumosSalvos.caixaModeloA !== undefined ? insumosSalvos.caixaModeloA : 8000;
    state.insumos.caixaModeloB = insumosSalvos.caixaModeloB !== undefined ? insumosSalvos.caixaModeloB : 8000;
    state.insumos.embalagem40x50 = insumosSalvos.embalagem40x50 !== undefined ? insumosSalvos.embalagem40x50 : 0;
    state.insumos.embalagens = insumosSalvos.embalagens || {};
  }
  if (configSalvos) {
    state.configInsumos.caixasPorProduto = configSalvos.caixasPorProduto || 1;
    state.configInsumos.alertaCaixaModeloA = configSalvos.alertaCaixaModeloA !== undefined ? configSalvos.alertaCaixaModeloA : 500;
    state.configInsumos.alertaCaixaModeloB = configSalvos.alertaCaixaModeloB !== undefined ? configSalvos.alertaCaixaModeloB : 500;
    state.configInsumos.alertaEmbalagem40x50 = configSalvos.alertaEmbalagem40x50 !== undefined ? configSalvos.alertaEmbalagem40x50 : 500;
    state.configInsumos.alertaEmbalagemPadrao = configSalvos.alertaEmbalagemPadrao !== undefined ? configSalvos.alertaEmbalagemPadrao : 100;
    state.configInsumos.alertaEmbalagemPorProduto = configSalvos.alertaEmbalagemPorProduto || {};
  }
  if (mapaSalvo) state.produtoInsumoMap = mapaSalvo;

  state.produtos.forEach(p => {
    if (state.insumos.embalagens[p.id] === undefined) state.insumos.embalagens[p.id] = 0;
  });

  migrarProdutosParaInjecao();
  salvarInsumos();
}

function calcularInsumosNecessarios(produtoId, quantidadeCaixas) {
  const produto = state.produtos.find(p => p.id === produtoId);
  if (!produto) return { caixas: 0, embalagens: 0, modeloCaixa: 'A', embalagemPorCaixa: 0, usa40x50: false };

  const config = state.produtoInsumoMap[produtoId] || { modeloCaixa: 'A', embalagemPorCaixa: 25, tipoEmbalagem: 'individual' };
  let embalagemPorCaixa = parseInt(config.embalagemPorCaixa);
  if (isNaN(embalagemPorCaixa) || embalagemPorCaixa <= 0) embalagemPorCaixa = 25;

  const usa40 = usaEmbalagem40x50(produto);

  return {
    caixas: quantidadeCaixas,
    modeloCaixa: config.modeloCaixa || 'A',
    embalagens: quantidadeCaixas * embalagemPorCaixa,
    embalagemPorCaixa,
    usa40x50: usa40
  };
}

function descontarInsumos(produtoId, quantidadeCaixas) {
  const n = calcularInsumosNecessarios(produtoId, quantidadeCaixas);

  if (n.modeloCaixa === 'B') {
    state.insumos.caixaModeloB = Math.max(0, state.insumos.caixaModeloB - n.caixas);
  } else {
    state.insumos.caixaModeloA = Math.max(0, state.insumos.caixaModeloA - n.caixas);
  }

  if (n.usa40x50) {
    state.insumos.embalagem40x50 = Math.max(0, (state.insumos.embalagem40x50 || 0) - n.embalagens);
  } else {
    state.insumos.embalagens[produtoId] = Math.max(0, (state.insumos.embalagens[produtoId] || 0) - n.embalagens);
  }

  salvarInsumos();
  verificarAlertasInsumos();
  return n;
}

function devolverInsumos(produtoId, quantidadeCaixas) {
  const n = calcularInsumosNecessarios(produtoId, quantidadeCaixas);

  if (n.modeloCaixa === 'B') state.insumos.caixaModeloB += n.caixas;
  else state.insumos.caixaModeloA += n.caixas;

  if (n.usa40x50) {
    state.insumos.embalagem40x50 = (state.insumos.embalagem40x50 || 0) + n.embalagens;
  } else {
    state.insumos.embalagens[produtoId] = (state.insumos.embalagens[produtoId] || 0) + n.embalagens;
  }

  salvarInsumos();
}

function verificarInsumosSuficientes(produtoId, quantidadeCaixas) {
  const n = calcularInsumosNecessarios(produtoId, quantidadeCaixas);

  const dispCx = n.modeloCaixa === 'B' ? state.insumos.caixaModeloB : state.insumos.caixaModeloA;
  const caixasSuf = dispCx >= n.caixas;

  let dispEmb, embSuf;
  if (n.usa40x50) {
    dispEmb = state.insumos.embalagem40x50 || 0;
  } else {
    dispEmb = state.insumos.embalagens[produtoId] || 0;
  }
  embSuf = dispEmb >= n.embalagens;

  return {
    caixasSuficientes: caixasSuf,
    embalagensSuficientes: embSuf,
    usa40x50: n.usa40x50,
    necessario: n,
    disponivel: { caixas: dispCx, embalagens: dispEmb }
  };
}

function verificarAlertasInsumos() {
  const alertas = [];
  if (state.insumos.caixaModeloA <= state.configInsumos.alertaCaixaModeloA) alertas.push(`📦 Caixa A: ${state.insumos.caixaModeloA}`);
  if (state.insumos.caixaModeloB <= state.configInsumos.alertaCaixaModeloB) alertas.push(`📦 Caixa B: ${state.insumos.caixaModeloB}`);
  if ((state.insumos.embalagem40x50 || 0) <= state.configInsumos.alertaEmbalagem40x50) alertas.push(`🛍️ 40x50: ${state.insumos.embalagem40x50 || 0}`);

  state.produtos.forEach(p => {
    if (usaEmbalagem40x50(p)) return;
    const q = state.insumos.embalagens[p.id] || 0;
    const a = state.configInsumos.alertaEmbalagemPorProduto?.[p.id] !== undefined ? state.configInsumos.alertaEmbalagemPorProduto[p.id] : state.configInsumos.alertaEmbalagemPadrao;
    if (q <= a) alertas.push(`📦 ${p.nome}: ${q} emb`);
  });

  const banner = document.getElementById('alertaInsumosBanner');
  if (banner) {
    if (alertas.length > 0) {
      document.getElementById('alertaInsumosText').textContent = `⚠️ INSUMOS BAIXOS: ${alertas.join(' | ')}`;
      banner.classList.add('active');
    } else banner.classList.remove('active');
  }
  return alertas;
}

function abrirModalInsumos() {
  let linhas = '';
  state.produtos.forEach(p => {
    const config = state.produtoInsumoMap[p.id] || { modeloCaixa: 'A', embalagemPorCaixa: p.pacotesPorVolume || 25, tipoEmbalagem: 'individual' };
    const alerta = state.configInsumos.alertaEmbalagemPorProduto?.[p.id] !== undefined ? state.configInsumos.alertaEmbalagemPorProduto[p.id] : state.configInsumos.alertaEmbalagemPadrao;
    const usa40 = config.tipoEmbalagem === '40x50';
    const estoqueIndividual = state.insumos.embalagens[p.id] || 0;

    linhas += `
      <tr>
        <td>
          <div class="insumo-nome">${p.nome}</div>
          <div class="insumo-codigo">${p.codigoInterno || '-'}</div>
        </td>
        <td>
          <select data-pid="${p.id}" data-field="modeloCaixa" class="input-insumo-modal select-insumo">
            <option value="A" ${config.modeloCaixa === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${config.modeloCaixa === 'B' ? 'selected' : ''}>B</option>
          </select>
        </td>
        <td>
          <select data-pid="${p.id}" data-field="tipoEmbalagem" class="input-insumo-modal select-insumo" style="width:90px;">
            <option value="individual" ${!usa40 ? 'selected' : ''}>Individual</option>
            <option value="40x50" ${usa40 ? 'selected' : ''}>40x50</option>
          </select>
        </td>
        <td>
          <input type="number" data-pid="${p.id}" data-field="embalagemPorCaixa" class="input-insumo-modal input-insumo" value="${config.embalagemPorCaixa}" min="1">
        </td>
        <td>
          <input type="number" data-pid="${p.id}" data-field="estoque" class="input-insumo-modal input-insumo" value="${estoqueIndividual}" min="0" ${usa40 ? 'disabled' : ''} style="width:80px;">
        </td>
        <td>
          <input type="number" data-pid="${p.id}" data-field="alerta" class="input-insumo-modal input-insumo" value="${alerta}" min="0" ${usa40 ? 'disabled' : ''}>
        </td>
      </tr>`;
  });

  document.getElementById('modalInsumosBody').innerHTML = `
    <div>
      <div class="modal-block modal-block-primary">
        <h4 style="color:#3498db;">📦 CAIXA MODELO A</h4>
        <label>Estoque:</label>
        <input type="number" id="editCaixaModeloA" value="${state.insumos.caixaModeloA}" min="0">
        <label>Alerta mínimo:</label>
        <input type="number" id="editAlertaCaixaA" value="${state.configInsumos.alertaCaixaModeloA}" min="0">
      </div>

      <div class="modal-block" style="background:var(--bg-subtle);border-left:4px solid #e67e22;">
        <h4 style="color:#e67e22;">📦 CAIXA MODELO B</h4>
        <label>Estoque:</label>
        <input type="number" id="editCaixaModeloB" value="${state.insumos.caixaModeloB}" min="0">
        <label>Alerta mínimo:</label>
        <input type="number" id="editAlertaCaixaB" value="${state.configInsumos.alertaCaixaModeloB}" min="0">
      </div>

      <div class="modal-block modal-block-purple">
        <h4 style="color:var(--purple);">🛍️ EMBALAGEM 40x50</h4>
        <label>Estoque:</label>
        <input type="number" id="editEmbalagem40x50" value="${state.insumos.embalagem40x50 || 0}" min="0">
        <label>Alerta mínimo:</label>
        <input type="number" id="editAlerta40x50" value="${state.configInsumos.alertaEmbalagem40x50}" min="0">
      </div>

      <div class="modal-block modal-block-info">
        <h4 style="color:var(--text);">📋 Configuração por Produto</h4>
        <div style="max-height:400px;overflow-y:auto;" class="insumos-tabela-wrap">
          <table class="insumos-tabela">
            <thead>
              <tr>
                <th style="text-align:left;">Produto</th>
                <th>Caixa</th>
                <th>Embalagem</th>
                <th>Emb/cx</th>
                <th>Estoque</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <small style="color:var(--text-muted);font-size:11px;display:block;margin-top:8px;">
          💡 Produtos com "Embalagem = 40x50" consomem do estoque compartilhado. Os campos Estoque/Alerta ficam desabilitados.
        </small>
      </div>
    </div>`;

  document.querySelectorAll('select[data-field="tipoEmbalagem"]').forEach(sel => {
    sel.addEventListener('change', function() {
      const linha = this.closest('tr');
      const is40 = this.value === '40x50';
      const inputEstoque = linha.querySelector('input[data-field="estoque"]');
      const inputAlerta = linha.querySelector('input[data-field="alerta"]');
      inputEstoque.disabled = is40;
      inputAlerta.disabled = is40;
    });
  });

  document.getElementById('modalInsumos').style.display = 'flex';
}

function salvarModalInsumos() {
  const cA = parseInt(document.getElementById('editCaixaModeloA').value);
  const cB = parseInt(document.getElementById('editCaixaModeloB').value);
  const e40 = parseInt(document.getElementById('editEmbalagem40x50').value);
  const aA = parseInt(document.getElementById('editAlertaCaixaA').value);
  const aB = parseInt(document.getElementById('editAlertaCaixaB').value);
  const a40 = parseInt(document.getElementById('editAlerta40x50').value);

  if ([cA, cB, e40, aA, aB, a40].some(v => isNaN(v) || v < 0)) {
    mostrarToast('❌ Valores inválidos!', 'error'); return;
  }

  salvarEstadoParaUndo();
  state.insumos.caixaModeloA = cA;
  state.insumos.caixaModeloB = cB;
  state.insumos.embalagem40x50 = e40;
  state.configInsumos.alertaCaixaModeloA = aA;
  state.configInsumos.alertaCaixaModeloB = aB;
  state.configInsumos.alertaEmbalagem40x50 = a40;

  document.querySelectorAll('.input-insumo-modal').forEach(el => {
    const pid = el.dataset.pid;
    const field = el.dataset.field;
    if (!state.produtoInsumoMap[pid]) {
      state.produtoInsumoMap[pid] = { modeloCaixa: 'A', embalagemPorCaixa: 25, tipoEmbalagem: 'individual' };
    }
    const config = state.produtoInsumoMap[pid];

    if (field === 'modeloCaixa') {
      config.modeloCaixa = el.value;
    } else if (field === 'tipoEmbalagem') {
      config.tipoEmbalagem = el.value;
    } else if (field === 'embalagemPorCaixa') {
      const v = parseInt(el.value);
      config.embalagemPorCaixa = isNaN(v) ? 25 : Math.max(1, v);
    } else if (field === 'estoque') {
      if (!el.disabled) {
        const v = parseInt(el.value);
        state.insumos.embalagens[pid] = isNaN(v) ? 0 : Math.max(0, v);
      }
    } else if (field === 'alerta') {
      if (!el.disabled) {
        const v = parseInt(el.value);
        if (!state.configInsumos.alertaEmbalagemPorProduto) state.configInsumos.alertaEmbalagemPorProduto = {};
        state.configInsumos.alertaEmbalagemPorProduto[pid] = isNaN(v) ? state.configInsumos.alertaEmbalagemPadrao : Math.max(0, v);
      }
    }
  });

  state.produtos.forEach(p => {
    if (usaEmbalagem40x50(p) && state.insumos.embalagens[p.id] === undefined) {
      state.insumos.embalagens[p.id] = 0;
    }
  });

  salvarInsumos();
  closeModalInsumos();
  renderizarInsumos();
  verificarAlertasInsumos();
  atualizarDashboard();
  mostrarToast('✅ Insumos salvos!', 'success');
}

function closeModalInsumos() { document.getElementById('modalInsumos').style.display = 'none'; }

function renderizarInsumos() {
  const container = document.getElementById('insumosContainer');
  if (!container) return;

  let linhasProdutos = '';
  state.produtos.forEach(p => {
    const config = state.produtoInsumoMap[p.id] || { modeloCaixa: 'A', embalagemPorCaixa: 25, tipoEmbalagem: 'individual' };
    const usa40 = usaEmbalagem40x50(p);
    const q = usa40 ? (state.insumos.embalagem40x50 || 0) : (state.insumos.embalagens[p.id] || 0);
    const alerta = usa40
      ? state.configInsumos.alertaEmbalagem40x50
      : (state.configInsumos.alertaEmbalagemPorProduto?.[p.id] !== undefined ? state.configInsumos.alertaEmbalagemPorProduto[p.id] : state.configInsumos.alertaEmbalagemPadrao);
    const baixo = q <= alerta;
    const badge40 = usa40
      ? '<span class="badge-emb-40x50">🛍️ 40x50</span>'
      : '<span class="badge-emb-individual">INDIV</span>';
    linhasProdutos += `
      <tr class="${baixo ? 'baixo' : ''}">
        <td><strong>${p.nome}</strong></td>
        <td><span class="badge-caixa">Caixa ${config.modeloCaixa}</span></td>
        <td>${badge40}</td>
        <td><strong>${config.embalagemPorCaixa} /cx</strong></td>
        <td class="${baixo ? 'valor-baixo' : 'valor-ok'}">${q}</td>
        <td style="color:var(--text-muted);font-size:11px;">${alerta}</td>
      </tr>`;
  });

  const alertaA = state.insumos.caixaModeloA <= state.configInsumos.alertaCaixaModeloA;
  const alertaB = state.insumos.caixaModeloB <= state.configInsumos.alertaCaixaModeloB;
  const alerta40 = (state.insumos.embalagem40x50 || 0) <= state.configInsumos.alertaEmbalagem40x50;

  container.innerHTML = `
    <div style="background:var(--bg-card);border-radius:12px;padding:20px;box-shadow:var(--shadow-sm);border:1px solid var(--border);">
      <div class="insumos-header">
        <h3>📦 Estoque de Insumos</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-md" onclick="abrirModalInsumos()">✏️ Editar Insumos</button>
          <button class="btn btn-info btn-md" onclick="exportarInsumosPDF()">📄 Exportar PDF</button>
        </div>
      </div>

      <div class="insumos-cards">
        <div class="insumo-card caixa-a ${alertaA ? 'baixo' : ''}">
          <div class="insumo-icon">📦</div>
          <div class="insumo-valor">${state.insumos.caixaModeloA}</div>
          <div class="insumo-label">Caixas Modelo A</div>
          ${alertaA ? '<div class="insumo-alerta-baixo">⚠️ BAIXO!</div>' : ''}
        </div>
        <div class="insumo-card caixa-b ${alertaB ? 'baixo' : ''}">
          <div class="insumo-icon">📦</div>
          <div class="insumo-valor">${state.insumos.caixaModeloB}</div>
          <div class="insumo-label">Caixas Modelo B</div>
          ${alertaB ? '<div class="insumo-alerta-baixo">⚠️ BAIXO!</div>' : ''}
        </div>
        <div class="insumo-card embalagem-40x50 ${alerta40 ? 'baixo' : ''}">
          <div class="insumo-icon">🛍️</div>
          <div class="insumo-valor">${state.insumos.embalagem40x50 || 0}</div>
          <div class="insumo-label">Embalagem 40x50</div>
          ${alerta40 ? '<div class="insumo-alerta-baixo">⚠️ BAIXO!</div>' : ''}
        </div>
      </div>

      <h4 style="color:var(--text);margin:0 0 10px 0;">📋 Configuração por Produto (${state.produtos.length})</h4>
      <div class="insumos-tabela-wrap">
        <table class="insumos-tabela">
          <thead>
            <tr>
              <th style="text-align:left;">Produto</th>
              <th>Caixa</th>
              <th>Embalagem</th>
              <th>Emb/cx</th>
              <th>Estoque</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>${linhasProdutos || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-muted);">Nenhum produto.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// ===== PRATELEIRAS =====
function renderPosicaoOcupada(shelf, posNum, pos) {
  const info = state.produtos.find(p => p.id === pos.id);
  if (!info) return '';
  const reservado = state.carga
    .filter(c => c.id === pos.id && c.prateleira === shelf.id && c.posicao === pos.posicao)
    .reduce((a, c) => a + c.quantidade, 0);
  const disponivel = pos.quantidade - reservado;
  const cardClass = reservado > 0 ? 'reservado' : '';
  const corFundo = pos.cor && pos.cor !== '#FFFFFF' && pos.cor !== '#ffffff' ? `style="background:${pos.cor};"` : '';
  const corBorda = shelf.cor ? `style="border-color:${shelf.cor};"` : '';

  return `
    <div class="position-card ${cardClass}" ${corFundo} ${corBorda}>
      <div class="position-number">Posição ${posNum}</div>
      <div class="position-product">${info.nome}</div>
      <div class="position-quantity">${pos.quantidade} cx</div>
      ${reservado > 0 ? `<div class="position-reserved">🚛 Reservado: ${reservado} cx</div>` : ''}
      <div class="position-available">Disponível: ${disponivel} cx</div>
      <div class="position-actions">
        <button class="btn btn-xs btn-orange" onclick="abrirSeparacao('${shelf.id}','${pos.id}','${pos.posicao}')" title="Reservar">📦</button>
        ${disponivel > 0 ? `<button class="btn btn-xs btn-success" onclick="adicionarCarga('${shelf.id}','${pos.id}','${pos.posicao}')" title="Enviar p/ carga">🚛</button>` : ''}
        <button class="btn btn-xs btn-yellow" onclick="editarCorPosicao('${shelf.id}','${pos.id}')">🎨</button>
        <button class="btn btn-xs btn-info" onclick="abrirEditarPosicao('${shelf.id}','${pos.id}','${pos.posicao}')">✏️</button>
        <button class="btn btn-xs btn-danger" onclick="removerDaPrateleira('${shelf.id}','${pos.id}','${pos.posicao}')">🗑️</button>
      </div>
    </div>`;
}

function renderPosicaoVazia(shelf, posNum) {
  return `
    <div class="position-card position-card-vazia">
      <div class="position-number">Posição ${posNum}</div>
      <div class="position-empty-text">Vazio</div>
      <button class="btn btn-xs btn-success" style="margin-top:8px;" onclick="abrirAdicionarPosicao('${shelf.id}', ${posNum})">➕</button>
    </div>`;
}

function renderPosicao(shelf, posNum) {
  const p = shelf.produtos.find(x => parseInt(x.posicao) === posNum);
  return p ? renderPosicaoOcupada(shelf, posNum, p) : renderPosicaoVazia(shelf, posNum);
}

function renderPrateleira(shelf) {
  const div = document.createElement('div');
  div.className = 'shelf';
  if (shelf.cor) div.style.borderLeft = `5px solid ${shelf.cor}`;

  const n = shelf.numPosicoes || 12;
  let posHtml = '';
  for (let i = 1; i <= n; i++) posHtml += renderPosicao(shelf, i);

  const codigoHtml = shelf.codigoBarras ? `<span class="shelf-title-code">(${shelf.codigoBarras})</span>` : '';

  div.innerHTML = `
    <div class="shelf-header">
      <h2 class="shelf-title">📦 ${shelf.nome} ${codigoHtml}</h2>
      <div class="shelf-actions">
        <button class="btn btn-sm btn-green" onclick="adicionarPosicaoPrateleira('${shelf.id}')">➕ Posição</button>
        <button class="btn btn-sm btn-orange" onclick="removerPosicaoPrateleira('${shelf.id}')">➖ Posição</button>
        <button class="btn btn-sm btn-yellow" onclick="editarCorPrateleira('${shelf.id}')">🎨</button>
        <button class="btn btn-sm btn-info" onclick="editarNomePrateleira('${shelf.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="removerPrateleira('${shelf.id}')">🗑️</button>
      </div>
    </div>
    <div class="shelf-positions-grid">${posHtml}</div>`;
  return div;
}

function carregarPrateleiras() {
  const c = document.getElementById('shelvesContainer');
  if (!c) return;
  c.innerHTML = '';
  if (!state.prateleiras || state.prateleiras.length === 0) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Nenhuma prateleira criada.</div>';
    return;
  }
  state.prateleiras.forEach(s => c.appendChild(renderPrateleira(s)));
}

function addShelf() {
  const nome = prompt('Nome da nova prateleira:');
  if (!nome) return;
  const id = nome.trim().toUpperCase();
  if (state.prateleiras.some(s => s.id === id)) { mostrarToast('❌ Já existe!', 'error'); return; }
  const numStr = prompt('Quantidade de posições (ex: 12, 20, 30...):', '12');
  let num = parseInt(numStr);
  if (isNaN(num) || num < 1) { mostrarToast('⚠️ Inválido! Usando 12.', 'warning'); num = 12; }
  const codigo = prompt('Código de barras (opcional):', gerarCodigoPrateleira(id));
  salvarEstadoParaUndo();
  state.prateleiras.push({ id, nome: id, cor: '#1A2B4C', numPosicoes: num, produtos: [], codigoBarras: codigo || gerarCodigoPrateleira(id) });
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  atualizarTudo();
  mostrarToast('✅ Prateleira criada!', 'success');
}

function adicionarPosicaoPrateleira(id) {
  const s = state.prateleiras.find(x => x.id === id);
  if (!s) return;
  const q = prompt(`Quantas posições adicionar? (atual: ${s.numPosicoes || 12})`, '1');
  const n = parseInt(q);
  if (!n || n < 1) return;
  salvarEstadoParaUndo();
  s.numPosicoes = (s.numPosicoes || 12) + n;
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  carregarPrateleiras();
  mostrarToast(`✅ ${n} posição(ões) adicionada(s)!`, 'success');
}

function removerPosicaoPrateleira(shelfId) {
  const shelf = state.prateleiras.find(s => s.id === shelfId);
  if (!shelf) return;
  const total = shelf.numPosicoes || 12;
  const ocupadas = shelf.produtos.map(p => parseInt(p.posicao));
  const maiorOcupada = ocupadas.length > 0 ? Math.max(...ocupadas) : 0;
  const resp = prompt(
    `Remover posições da prateleira "${shelf.nome}"\n\n` +
    `Total atual: ${total} posições\n` +
    `Última posição com produto: ${maiorOcupada || 'nenhuma'}\n\n` +
    `Quantas posições deseja remover do final?`,
    '1'
  );
  if (resp === null) return;
  const qtd = parseInt(resp);
  if (isNaN(qtd) || qtd <= 0) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }
  if (qtd >= total) { mostrarToast('❌ Não é possível remover todas as posições!', 'error'); return; }
  if (total - qtd < maiorOcupada) {
    mostrarToast(`❌ Há produtos na(s) posição(ões) ${maiorOcupada}. Mova-os antes.`, 'error');
    return;
  }
  salvarEstadoParaUndo();
  shelf.numPosicoes = total - qtd;
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  carregarPrateleiras();
  mostrarToast(`✅ ${qtd} posição(ões) removida(s)!`, 'success');
}

function removerPrateleira(id) {
  if (!confirm('Remover prateleira?')) return;
  salvarEstadoParaUndo();
  state.prateleiras = state.prateleiras.filter(s => s.id !== id);
  state.carga = state.carga.filter(c => c.prateleira !== id);
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast('🗑️ Removida!', 'warning');
}

function editarNomePrateleira(id) {
  const shelf = state.prateleiras.find(s => s.id === id);
  if (!shelf) return;
  const novoNome = prompt('Novo nome:', shelf.nome);
  if (!novoNome) return;
  const novoId = novoNome.trim().toUpperCase();
  const idAntigo = shelf.id;
  if (novoId !== idAntigo && state.prateleiras.some(s => s.id === novoId)) {
    mostrarToast('❌ Já existe uma prateleira com esse nome!', 'error');
    return;
  }
  const codigo = prompt('Novo código de barras:', shelf.codigoBarras || gerarCodigoPrateleira(novoId));
  const numStr = prompt('Nova quantidade de posições (deixe em branco para manter):', shelf.numPosicoes || 12);
  salvarEstadoParaUndo();
  shelf.id = novoId;
  shelf.nome = novoId;
  if (codigo) shelf.codigoBarras = codigo;
  if (numStr !== null && numStr.trim() !== '') {
    const n = parseInt(numStr);
    if (!isNaN(n) && n >= 1) shelf.numPosicoes = n;
    else mostrarToast('⚠️ Valor inválido para posições. Mantendo anterior.', 'warning');
  }
  if (idAntigo !== novoId) {
    state.carga.forEach(c => { if (c.prateleira === idAntigo) c.prateleira = novoId; });
    setData(STORAGE_KEYS.carga, state.carga);
  }
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  atualizarTudo();
  mostrarToast('✅ Prateleira atualizada!', 'success');
}

function abrirModalCor({ tipo, titulo, valorAtual, currentEditData }) {
  state.currentEdit = currentEditData;
  state.modalType = tipo;
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modalBody').innerHTML = `<input type="color" id="colorInput" value="${valorAtual}" style="width:100%;height:50px;cursor:pointer;">`;
  document.getElementById('modal').style.display = 'flex';
}

function editarCorPrateleira(id) {
  const s = state.prateleiras.find(x => x.id === id);
  if (!s) return;
  abrirModalCor({ tipo: 'shelfColor', titulo: '🎨 Cor', valorAtual: s.cor || '#1A2B4C', currentEditData: { shelfId: id } });
}

function editarCorPosicao(shelfId, produtoId) {
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === produtoId);
  if (!p) return;
  abrirModalCor({ tipo: 'positionColor', titulo: '🎨 Cor Posição', valorAtual: p.cor || '#FFFFFF', currentEditData: { shelfId, produtoId } });
}

function salvarCorPrateleira() {
  const s = state.prateleiras.find(x => x.id === state.currentEdit.shelfId);
  if (!s) return;
  salvarEstadoParaUndo();
  s.cor = document.getElementById('colorInput').value;
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  carregarPrateleiras();
}

function salvarCorPosicao() {
  const s = state.prateleiras.find(x => x.id === state.currentEdit.shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === state.currentEdit.produtoId);
  if (!p) return;
  salvarEstadoParaUndo();
  p.cor = document.getElementById('colorInput').value;
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  carregarPrateleiras();
}// ===== POSIÇÕES =====
function abrirAdicionarPosicao(shelfId, posNum) {
  state.currentPosicaoEdit = { shelfId, posicaoNum: posNum, produtoId: null };
  document.getElementById('modalPosicaoTitle').textContent = `➕ Posição ${posNum}`;
  document.getElementById('modalPosicaoBody').innerHTML = `
    <label>Produto</label>
    <select id="posProdutoSelect"><option value="">Selecione...</option>${state.produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
    <label>Quantidade (caixas)</label>
    <input type="number" id="posQuantidade" value="1" min="1" step="1">
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">ℹ️ Insira a quantidade em caixas.</p>`;
  document.getElementById('modalPosicao').style.display = 'flex';
}

function abrirEditarPosicao(shelfId, produtoId, posicao) {
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === produtoId && x.posicao === posicao);
  if (!p) return;
  state.currentPosicaoEdit = { shelfId, posicaoNum: posicao, produtoId, quantidadeAtual: p.quantidade };
  document.getElementById('modalPosicaoTitle').textContent = `✏️ Posição ${posicao}`;
  document.getElementById('modalPosicaoBody').innerHTML = `
    <label>Produto</label>
    <select id="posProdutoSelect" disabled>${state.produtos.map(x => `<option value="${x.id}" ${x.id === produtoId ? 'selected' : ''}>${x.nome}</option>`).join('')}</select>
    <label>Quantidade (caixas)</label>
    <input type="number" id="posQuantidade" value="${p.quantidade}" min="0" step="1">
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">ℹ️ Altere a quantidade em caixas.</p>`;
  document.getElementById('modalPosicao').style.display = 'flex';
}

function salvarPosicao() {
  if (!state.currentPosicaoEdit) return;
  const { shelfId, posicaoNum, produtoId } = state.currentPosicaoEdit;
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const nq = parseInt(document.getElementById('posQuantidade').value) || 0;
  if (nq < 0) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }

  if (produtoId === null) {
    const sel = document.getElementById('posProdutoSelect');
    const pid = sel.value;
    if (!pid) { mostrarToast('❌ Selecione um produto!', 'error'); return; }
    if (nq <= 0) { mostrarToast('❌ Quantidade deve ser maior que zero!', 'error'); return; }
    if (s.produtos.find(x => parseInt(x.posicao) === parseInt(posicaoNum))) { mostrarToast('❌ Posição já ocupada!', 'error'); return; }
    const produto = state.produtos.find(x => x.id === pid);
    if (!produto) return;

    const ins = verificarInsumosSuficientes(pid, nq);
    if (!ins.caixasSuficientes || !ins.embalagensSuficientes) {
      let m = `⚠️ INSUMOS INSUFICIENTES!\n\n`;
      if (!ins.caixasSuficientes) m += `📦 Faltam ${ins.necessario.caixas - ins.disponivel.caixas} caixas Modelo ${ins.necessario.modeloCaixa}\n`;
      if (!ins.embalagensSuficientes) {
        const nomeEmb = ins.usa40x50 ? '40x50' : 'individuais';
        m += `🛍️ Faltam ${ins.necessario.embalagens - ins.disponivel.embalagens} embalagens ${nomeEmb}\n`;
      }
      if (!confirm(m + '\nContinuar?')) return;
    }
    salvarEstadoParaUndo();
    const desc = descontarInsumos(pid, nq);
    s.produtos.push({ id: pid, posicao: posicaoNum.toString(), quantidade: nq, cor: '#FFFFFF', modeloCaixa: desc.modeloCaixa });
    produto.quantidade = (produto.quantidade || 0) + nq;
    descontarInjetadosPorFamilia(produto, nq);

    const resAuto = tentarAutoReservarCarga(pid, shelfId, posicaoNum, nq);
    if (resAuto > 0) {
      setData(STORAGE_KEYS.carga, state.carga);
      salvarPedidoCarga();
      registrarHistorico(produto.nome, 'Auto-reserva para Carga', resAuto, `${s.nome}-${posicaoNum} | Pedido: ${state.pedidoCargaAtual.codigo}`);
    }

    registrarHistorico(produto.nome, 'Adicionado à prateleira', nq,
      `${s.nome}-${posicaoNum} | Caixa ${desc.modeloCaixa}: -${desc.caixas} | ${desc.usa40x50 ? '40x50' : 'Emb'}: -${desc.embalagens}`);
  } else {
    const idx = s.produtos.findIndex(x => x.id === produtoId && x.posicao === posicaoNum);
    if (idx === -1) { mostrarToast('❌ Posição não encontrada!', 'error'); return; }
    const p = s.produtos[idx];
    const diff = nq - p.quantidade;

    if (nq === 0) s.produtos.splice(idx, 1);
    else p.quantidade = nq;

    const produto = state.produtos.find(x => x.id === produtoId);
    if (produto) {
      produto.quantidade = Math.max(0, (produto.quantidade || 0) + diff);
      if (diff > 0) {
        const ins = verificarInsumosSuficientes(produtoId, diff);
        if (!ins.caixasSuficientes || !ins.embalagensSuficientes) {
          let m = `⚠️ INSUMOS INSUFICIENTES para o aumento!\n\n`;
          if (!ins.caixasSuficientes) m += `📦 Faltam ${ins.necessario.caixas - ins.disponivel.caixas} caixas\n`;
          if (!ins.embalagensSuficientes) m += `🛍️ Faltam ${ins.necessario.embalagens - ins.disponivel.embalagens} embalagens\n`;
          if (!confirm(m + '\nContinuar?')) return;
        }
        salvarEstadoParaUndo();
        descontarInsumos(produtoId, diff);
        descontarInjetadosPorFamilia(produto, diff);
        const resAuto = tentarAutoReservarCarga(produtoId, shelfId, posicaoNum, diff);
        if (resAuto > 0) setData(STORAGE_KEYS.carga, state.carga);
        registrarHistorico(produto.nome, 'Ajuste de quantidade', diff, `${s.nome}-${posicaoNum} | Insumos descontados`);
      } else if (diff < 0) {
        salvarEstadoParaUndo();
        devolverInsumos(produtoId, -diff);
        registrarHistorico(produto.nome, 'Redução de quantidade', -diff, `${s.nome}-${posicaoNum} | Insumos devolvidos`);
      }
    }
  }
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.produtos, state.produtos);
  closeModalPosicao();
  atualizarTudo();
  mostrarToast('✅ Posição salva!', 'success');
}

function closeModalPosicao() { document.getElementById('modalPosicao').style.display = 'none'; state.currentPosicaoEdit = null; }

function removerDaPrateleira(shelfId, produtoId, posicao) {
  if (!confirm('Remover da prateleira?')) return;
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  salvarEstadoParaUndo();
  const idx = s.produtos.findIndex(x => x.id === produtoId && x.posicao === posicao);
  if (idx !== -1) {
    const p = s.produtos[idx];
    const produto = state.produtos.find(x => x.id === produtoId);
    if (produto) produto.quantidade = Math.max(0, (produto.quantidade || 0) - p.quantidade);
    devolverInsumos(produtoId, p.quantidade);
    state.carga = state.carga.filter(c => !(c.id === produtoId && c.prateleira === shelfId && c.posicao === posicao));
    setData(STORAGE_KEYS.carga, state.carga);
    registrarHistorico(produto?.nome || 'Produto', 'Remoção da prateleira', p.quantidade, `${s.nome}-${posicao} | Insumos devolvidos`);
    s.produtos.splice(idx, 1);
  }
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.produtos, state.produtos);
  atualizarTudo();
  mostrarToast('🗑️ Removido!', 'warning');
}

// ===== SEPARAÇÃO =====
function abrirSeparacao(shelfId, produtoId, posicao) {
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === produtoId && x.posicao === posicao);
  if (!p) return;
  const produto = state.produtos.find(x => x.id === produtoId);
  if (!produto) return;
  const reservado = state.carga
    .filter(c => c.id === produtoId && c.prateleira === shelfId && c.posicao === posicao)
    .reduce((a, c) => a + c.quantidade, 0);
  const disponivel = p.quantidade - reservado;
  state.currentSeparacao = { shelfId, produtoId, posicao };
  document.getElementById('modalSeparacaoBody').innerHTML = `
    <h3>${produto.nome}</h3>
    <p>Disponível na posição ${posicao}: <strong>${disponivel} cx</strong> (Total: ${p.quantidade} cx, Reservado: ${reservado} cx)</p>
    <label>Quantidade (caixas):</label>
    <input type="number" id="qtdSeparar" value="${disponivel}" min="1" max="${disponivel}">`;
  document.getElementById('modalSeparacao').style.display = 'flex';
}

function confirmarSeparacao() {
  if (!state.currentSeparacao) return;
  const { shelfId, produtoId, posicao } = state.currentSeparacao;
  const q = parseInt(document.getElementById('qtdSeparar').value) || 0;
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === produtoId && x.posicao === posicao);
  if (!p) return;
  const reservado = state.carga
    .filter(c => c.id === produtoId && c.prateleira === shelfId && c.posicao === posicao)
    .reduce((a, c) => a + c.quantidade, 0);
  const disponivel = p.quantidade - reservado;
  if (q <= 0 || q > disponivel) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }

  salvarEstadoParaUndo();
  state.carga.push({
    uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    id: produtoId, quantidade: q, prateleira: shelfId, posicao: posicao,
    pedidoCodigo: null
  });
  setData(STORAGE_KEYS.carga, state.carga);
  closeModalSeparacao();
  atualizarTudo();
  mostrarToast('✅ Reservado!', 'success');
}

function closeModalSeparacao() { document.getElementById('modalSeparacao').style.display = 'none'; state.currentSeparacao = null; }

// ===== PRODUTOS =====
function cadastrarProdutoBanco() {
  const nome = document.getElementById('nomeProdutoBanco').value.trim();
  const codigo = document.getElementById('codigoInterno').value.trim().toUpperCase();
  const pac = parseInt(document.getElementById('pacotesPorVolume').value) || 50;
  const bar = document.getElementById('barcodeProdutoBanco').value.trim();
  if (!nome || !codigo) { mostrarToast('❌ Preencha nome e código!', 'error'); return; }
  if (state.produtos.some(p => p.codigoInterno === codigo)) { mostrarToast('⚠️ Código já existe!', 'warning'); return; }
  if (isNaN(pac) || pac <= 0) { mostrarToast('⚠️ Pacotes/Volume > 0!', 'error'); return; }

  salvarEstadoParaUndo();
  const novo = {
    id: 'p' + Date.now(),
    nome, codigoInterno: codigo,
    pacotesPorVolume: pac, quantidade: 0, barcode: bar,
    injecaoVinculo: autoDetectarVinculo(nome)
  };
  state.produtos.push(novo);
  setData(STORAGE_KEYS.produtos, state.produtos);

  state.insumos.embalagens[novo.id] = 0;
  state.produtoInsumoMap[novo.id] = {
    modeloCaixa: 'A',
    embalagemPorCaixa: pac,
    tipoEmbalagem: autoDetectarEmbalagem(nome)
  };
  salvarInsumos();

  carregarProdutos();
  atualizarSelects();
  mostrarToast('✅ Produto cadastrado!', 'success');
}

function carregarProdutos() {
  const lista = document.getElementById('bancoProdutosLista');
  if (!lista) return;
  if (state.produtos.length === 0) { lista.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum produto.</div>'; return; }
  let html = '<table><thead><tr><th>Produto</th><th>Código</th><th>Disponível</th><th>Localização</th><th>Ações</th></tr></thead><tbody>';
  state.produtos.forEach(p => {
    const loc = getProductLocations(p.id);
    const locStr = loc.map(l => `${l.prateleira}${l.posicao} (${l.quantidade} cx)`).join(', ') || '-';
    html += `<tr><td><strong>${p.nome}</strong></td><td>${p.codigoInterno || '-'}</td><td>${p.quantidade || 0}</td><td>${locStr}</td><td>
      <button class="btn btn-xs btn-info" onclick="editarProduto('${p.id}')">✏️</button>
      <button class="btn btn-xs btn-danger" onclick="removerProduto('${p.id}')">🗑️</button></td></tr>`;
  });
  html += '</tbody></table>';
  lista.innerHTML = html;
}

function editarProduto(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;

  const config = state.produtoInsumoMap[id] || { modeloCaixa: 'A', embalagemPorCaixa: p.pacotesPorVolume || 25, tipoEmbalagem: autoDetectarEmbalagem(p.nome) };

  const injecaoOptions = ['<option value="">(nenhum - não desconta)</option>']
    .concat(state.injecao.map(i => `<option value="${i.nome}" ${p.injecaoVinculo === i.nome ? 'selected' : ''}>${i.nome} (${i.codigoExtra})</option>`))
    .join('');

  const isKit = (p.nome || '').toLowerCase().includes('kit');

  document.getElementById('modalTitle').textContent = '✏️ Editar Produto';
  document.getElementById('modalBody').innerHTML = `
    <label>Nome</label><input type="text" id="editProdNome" value="${p.nome}">
    <label>Código</label><input type="text" id="editProdCodigo" value="${p.codigoInterno || ''}">
    <label>Pacotes/Volume (embalagens por caixa)</label><input type="number" id="editProdPacotes" value="${p.pacotesPorVolume || 50}">
    <label>Código de Barras</label>
    <div class="form-flex-row">
      <input type="text" id="editProdBarcode" value="${p.barcode || ''}" style="flex:1;">
      <button class="btn btn-info btn-md" type="button" onclick="abrirCameraParaCampo('editProdBarcode')">📷</button>
    </div>

    <div class="modal-block modal-block-primary">
      <label style="font-weight:bold;">📦 Modelo da Caixa</label>
      <select id="editProdModeloCaixa">
        <option value="A" ${config.modeloCaixa === 'A' ? 'selected' : ''}>Caixa Modelo A</option>
        <option value="B" ${config.modeloCaixa === 'B' ? 'selected' : ''}>Caixa Modelo B</option>
      </select>
      <small class="form-hint">A caixa é sempre debitada quando o produto é adicionado à prateleira.</small>
    </div>

    <div class="modal-block modal-block-purple">
      <label style="font-weight:bold;">🛍️ Tipo de Embalagem Interna</label>
      <select id="editProdTipoEmbalagem">
        <option value="individual" ${config.tipoEmbalagem !== '40x50' ? 'selected' : ''}>Individual (contador próprio)</option>
        <option value="40x50" ${config.tipoEmbalagem === '40x50' ? 'selected' : ''}>40x50 (compartilhada)</option>
      </select>
      <small class="form-hint">Padrão automático: termina em <strong>-500</strong>, <strong>-200</strong> ou é <strong>Kit</strong> → usa 40x50.</small>
    </div>

    <div class="modal-block modal-block-warning">
      <label style="font-weight:bold;">💉 Injetado vinculado (para desconto automático)</label>
      ${isKit
        ? `<div class="info-box">
            <strong>Kit</strong> desconta automaticamente:<br>
            • 1× C2N por caixa<br>
            • 0.2× CUNHA(V) por caixa (5 Kit = 1 Cunha)
          </div>`
        : `<select id="editProdInjecaoVinculo">${injecaoOptions}</select>`}
    </div>
  `;

  state.currentEdit = { produtoId: id };
  state.modalType = 'editarProduto';
  document.getElementById('modal').style.display = 'flex';
}

function salvarEdicaoProduto() {
  const id = state.currentEdit.produtoId;
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;

  const novoCodigo = document.getElementById('editProdCodigo').value.trim().toUpperCase();
  if (novoCodigo && novoCodigo !== p.codigoInterno && state.produtos.some(x => x.id !== id && x.codigoInterno === novoCodigo)) {
    mostrarToast('⚠️ Já existe outro produto com esse código!', 'warning');
    return;
  }

  salvarEstadoParaUndo();

  const novoPac = parseInt(document.getElementById('editProdPacotes').value) || 50;
  p.nome = document.getElementById('editProdNome').value.trim();
  p.codigoInterno = novoCodigo;
  p.pacotesPorVolume = novoPac;
  p.barcode = document.getElementById('editProdBarcode').value.trim();

  const isKit = (p.nome || '').toLowerCase().includes('kit');
  if (!isKit) {
    const sel = document.getElementById('editProdInjecaoVinculo');
    if (sel) p.injecaoVinculo = sel.value || '';
  }

  if (!state.produtoInsumoMap[id]) {
    state.produtoInsumoMap[id] = { modeloCaixa: 'A', embalagemPorCaixa: novoPac, tipoEmbalagem: 'individual' };
  }
  const config = state.produtoInsumoMap[id];
  config.embalagemPorCaixa = novoPac;

  const selMod = document.getElementById('editProdModeloCaixa');
  if (selMod) config.modeloCaixa = selMod.value;

  const selEmb = document.getElementById('editProdTipoEmbalagem');
  if (selEmb) config.tipoEmbalagem = selEmb.value;

  if (state.insumos.embalagens[id] === undefined) state.insumos.embalagens[id] = 0;

  setData(STORAGE_KEYS.produtos, state.produtos);
  salvarInsumos();
  carregarProdutos();
  renderizarInsumos();
  mostrarToast('✅ Atualizado!', 'success');
}

function removerProduto(id) {
  if (!confirm('Remover produto?')) return;
  salvarEstadoParaUndo();
  state.prateleiras.forEach(s => { s.produtos = s.produtos.filter(p => p.id !== id); });
  state.carga = state.carga.filter(c => c.id !== id);
  state.produtos = state.produtos.filter(p => p.id !== id);
  delete state.insumos.embalagens[id];
  delete state.produtoInsumoMap[id];
  if (state.configInsumos.alertaEmbalagemPorProduto) delete state.configInsumos.alertaEmbalagemPorProduto[id];
  if (state.pedidoCargaAtual.itens && state.pedidoCargaAtual.itens[id]) {
    delete state.pedidoCargaAtual.itens[id];
    salvarPedidoCarga();
  }
  setData(STORAGE_KEYS.produtos, state.produtos);
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.carga, state.carga);
  salvarInsumos();
  carregarProdutos();
  atualizarSelects();
  mostrarToast('🗑️ Removido!', 'warning');
}

function saveModal() {
  const handlers = { shelfColor: salvarCorPrateleira, positionColor: salvarCorPosicao, editarProduto: salvarEdicaoProduto };
  if (state.modalType === 'busca') { cancelarEdicao(); return; }
  const h = handlers[state.modalType];
  if (h) h();
  cancelarEdicao();
}

function cancelarEdicao() {
  document.getElementById('modal').style.display = 'none';
  state.currentEdit = null;
  state.modalType = '';
}

function adicionarProdutoExistente() {
  const pid = document.getElementById('produtoAddExistente').value;
  const sid = document.getElementById('shelfAddExistente').value;
  const pos = document.getElementById('posicaoAddExistente').value;
  const q = parseInt(document.getElementById('qtdAddExistente').value);
  if (!pid || !sid || !pos || !q || q <= 0) { mostrarToast('⚠️ Preencha todos os campos!', 'error'); return; }
  const produto = state.produtos.find(p => p.id === pid);
  const shelf = state.prateleiras.find(s => s.id === sid);
  if (!produto || !shelf) return;
  if (shelf.produtos.some(p => p.posicao === pos)) { mostrarToast('❌ Posição ocupada!', 'error'); return; }

  const ins = verificarInsumosSuficientes(pid, q);
  if (!ins.caixasSuficientes || !ins.embalagensSuficientes) {
    let m = `⚠️ INSUMOS INSUFICIENTES para "${produto.nome}"!\n\n`;
    if (!ins.caixasSuficientes) m += `📦 Faltam ${ins.necessario.caixas - ins.disponivel.caixas} caixas\n`;
    if (!ins.embalagensSuficientes) m += `🛍️ Faltam ${ins.necessario.embalagens - ins.disponivel.embalagens} embalagens\n`;
    if (!confirm(m + '\nContinuar?')) return;
  }
  salvarEstadoParaUndo();
  const desc = descontarInsumos(pid, q);
  shelf.produtos.push({ id: pid, posicao: pos, quantidade: q, cor: '#FFFFFF', modeloCaixa: desc.modeloCaixa });
  produto.quantidade = (produto.quantidade || 0) + q;
  descontarInjetadosPorFamilia(produto, q);

  const resAuto = tentarAutoReservarCarga(pid, sid, pos, q);
  if (resAuto > 0) {
    setData(STORAGE_KEYS.carga, state.carga);
    salvarPedidoCarga();
    registrarHistorico(produto.nome, 'Auto-reserva para Carga', resAuto, `${shelf.nome}-${pos} | Pedido: ${state.pedidoCargaAtual.codigo}`);
  }

  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.produtos, state.produtos);
  registrarHistorico(produto.nome, 'Endereçamento', q,
    `${shelf.nome}-${pos} | Caixa ${desc.modeloCaixa}: -${desc.caixas} | ${desc.usa40x50 ? '40x50' : 'Emb'}: -${desc.embalagens}`);
  atualizarTudo();
  mostrarToast('✅ Adicionado! Insumos descontados.', 'success');
}

function atualizarSelects() {
  const sp = document.getElementById('produtoAddExistente');
  if (sp) { sp.innerHTML = '<option value="">Selecione...</option>'; state.produtos.forEach(p => sp.innerHTML += `<option value="${p.id}">${p.nome}</option>`); }
  const ss = document.getElementById('shelfAddExistente');
  if (ss) {
    ss.innerHTML = '<option value="">Selecione...</option>';
    state.prateleiras.forEach(s => ss.innerHTML += `<option value="${s.id}">${s.nome}</option>`);
    atualizarPosicoesAddExistente();
  }
}

function atualizarPosicoesAddExistente() {
  const sid = document.getElementById('shelfAddExistente').value;
  const sp = document.getElementById('posicaoAddExistente');
  sp.innerHTML = '<option value="">Selecione...</option>';
  if (!sid) return;
  const s = state.prateleiras.find(x => x.id === sid);
  if (!s) return;
  const ocup = s.produtos.map(p => p.posicao);
  for (let i = 1; i <= (s.numPosicoes || 12); i++) {
    if (!ocup.includes(i.toString())) sp.innerHTML += `<option value="${i}">Posição ${i}</option>`;
  }
}

// ===== CARGA =====
function adicionarCarga(shelfId, produtoId, posicao) {
  const produto = state.produtos.find(p => p.id === produtoId);
  if (!produto) return;
  const s = state.prateleiras.find(x => x.id === shelfId);
  if (!s) return;
  const p = s.produtos.find(x => x.id === produtoId && x.posicao === posicao);
  if (!p) return;
  const reservado = state.carga
    .filter(c => c.id === produtoId && c.prateleira === shelfId && c.posicao === posicao)
    .reduce((a, c) => a + c.quantidade, 0);
  const disp = p.quantidade - reservado;
  if (disp <= 0) { mostrarToast('❌ Sem disponível!', 'error'); return; }
  const q = prompt(`Quantos "${produto.nome}" reservar? (Disponível: ${disp} cx)`, '1');
  if (!q) return;
  const qn = parseInt(q);
  if (!qn || qn <= 0 || qn > disp) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }
  salvarEstadoParaUndo();
  state.carga.push({
    uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    id: produtoId, quantidade: qn, prateleira: shelfId, posicao: posicao,
    pedidoCodigo: null
  });
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast(`✅ ${qn} cx reservadas!`, 'success');
}

function adicionarTodosCarga() {
  salvarEstadoParaUndo();
  state.prateleiras.forEach(s => {
    s.produtos.forEach(p => {
      if (p.quantidade > 0) {
        const res = state.carga
          .filter(c => c.id === p.id && c.prateleira === s.id && c.posicao === p.posicao)
          .reduce((a, c) => a + c.quantidade, 0);
        const disp = p.quantidade - res;
        if (disp > 0) {
          state.carga.push({
            uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            id: p.id, quantidade: disp, prateleira: s.id, posicao: p.posicao,
            pedidoCodigo: null
          });
        }
      }
    });
  });
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast('✅ Tudo reservado!', 'success');
}

function zerarCarga() {
  if (!confirm('Limpar todas as reservas?')) return;
  salvarEstadoParaUndo();
  state.carga = [];
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast('🧹 Reservas limpas!', 'success');
}

function removerDaCarga(uid) {
  salvarEstadoParaUndo();
  state.carga = state.carga.filter(c => c.uid !== uid);
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast('🗑️ Removida!', 'warning');
}

function finalizarCarga() {
  if (state.carga.length === 0) { mostrarToast('📭 Nada para finalizar!', 'info'); return; }
  if (!confirm('⚠️ Finalizar carga? Isso remove as quantidades das prateleiras.')) return;
  salvarEstadoParaUndo();
  state.carga.forEach(item => {
    const s = state.prateleiras.find(x => x.id === item.prateleira);
    if (s) {
      const idx = s.produtos.findIndex(p => p.id === item.id && p.posicao === item.posicao);
      if (idx !== -1) {
        s.produtos[idx].quantidade -= item.quantidade;
        if (s.produtos[idx].quantidade <= 0) s.produtos.splice(idx, 1);
      }
    }
    const produto = state.produtos.find(p => p.id === item.id);
    if (produto) produto.quantidade = Math.max(0, (produto.quantidade || 0) - item.quantidade);
    registrarHistorico(produto?.nome || 'Produto', 'Carga Finalizada', item.quantidade, `${item.prateleira}${item.posicao}`);
  });
  state.carga = [];
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.produtos, state.produtos);
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarTudo();
  mostrarToast('🚛 Carga finalizada!', 'success');
}

function carregarCarga() {
  const c = document.getElementById('cargaContainer');
  if (!c) return;
  let html = `
    <div class="controls">
      <button class="warning" onclick="finalizarCarga()">🚛 Finalizar Carga</button>
      <button class="danger" onclick="zerarCarga()">🗑️ Limpar Reservas</button>
      <button class="info" onclick="exportarCargaPDF()">📄 Exportar PDF</button>
    </div>`;
  if (state.carga.length === 0) {
    html += '<div style="text-align:center;padding:40px;color:var(--text-muted);">🚛 Nenhuma reserva.</div>';
    c.innerHTML = html;
    document.getElementById('totalCargaProdutos').textContent = '0';
    document.getElementById('totalCargaItens').textContent = '0';
    return;
  }
  let total = 0;
  state.carga.forEach(item => {
    const produto = state.produtos.find(p => p.id === item.id);
    if (produto) {
      total += item.quantidade;
      const nome = state.prateleiras.find(s => s.id === item.prateleira)?.nome || '?';
      const loc = item.prateleira && item.posicao ? `📍 ${nome}${item.posicao}` : '📍 Sem local';
      const isCarga = item.pedidoCodigo === CARGA_PEDIDO_TAG;
      const badgeStyle = isCarga ? 'background:var(--accent);' : 'background:var(--info);';
      const ped = item.pedidoCodigo ? ` <span style="${badgeStyle}color:white;font-size:10px;padding:2px 6px;border-radius:8px;">${isCarga ? '🚛 CARGA' : '📋 ' + item.pedidoCodigo}</span>` : '';
      html += `
        <div class="carga-card" style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:8px;">
          <div><strong>${produto.nome}</strong> - ${item.quantidade} cx${ped}
            <div style="font-size:12px;color:var(--text-muted);">${loc}</div>
          </div>
          <button class="btn btn-xs btn-danger" onclick="removerDaCarga('${item.uid}')">🗑️</button>
        </div>`;
    }
  });
  c.innerHTML = html;
  document.getElementById('totalCargaProdutos').textContent = state.carga.length;
  document.getElementById('totalCargaItens').textContent = total;
}

// ===== LEITOR DE PEDIDOS =====
function extrairCodigoEQuantidade(valor) {
  let codigo = valor.trim().toUpperCase();
  let qtd = 1;
  for (const sep of [':', 'X', '*']) {
    if (codigo.includes(sep)) {
      const partes = codigo.split(sep);
      codigo = partes[0].trim();
      const q = parseInt(partes[1].trim());
      if (!isNaN(q) && q > 0) qtd = q;
      break;
    }
  }
  return { codigo, quantidade: qtd };
}

function adicionarCodigoLido() {
  const input = document.getElementById('codigoLido');
  const { codigo, quantidade } = extrairCodigoEQuantidade(input.value);
  if (!codigo) { mostrarToast('❌ Digite um código!', 'error'); return; }
  const produto = state.produtos.find(p => (p.codigoInterno && p.codigoInterno.toUpperCase() === codigo) || (p.barcode && p.barcode.toUpperCase() === codigo));
  const pac = produto ? (produto.pacotesPorVolume || 50) : 50;
  if (state.pedidoAtual[codigo]) state.pedidoAtual[codigo].qtd += quantidade;
  else state.pedidoAtual[codigo] = { codigo, nome: produto ? produto.nome : '❌ Não encontrado', pacotesPorVolume: pac, qtd: quantidade, encontrado: !!produto };
  input.value = '';
  input.focus();
  atualizarLeitor();
  mostrarToast('✅ Adicionado!', 'success');
}

function simularLeitura() {
  const codigos = ['CP1-100:200', 'PARAF01:50'];
  document.getElementById('codigoLido').value = codigos[Math.floor(Math.random() * codigos.length)];
  adicionarCodigoLido();
}

function removerItemPedido(codigo) { delete state.pedidoAtual[codigo]; atualizarLeitor(); }
function limparPedido() { state.pedidoAtual = {}; atualizarLeitor(); }

function atualizarLeitor() {
  const container = document.getElementById('codigosLidosContainer');
  const resumo = document.getElementById('resumoPedido');
  const detalhamento = document.getElementById('detalhamentoPedido');
  const codigos = Object.keys(state.pedidoAtual);
  if (codigos.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);">Aguardando códigos...</span>';
    resumo.innerHTML = '<p style="color:var(--text-muted);">Nenhum item</p>';
    detalhamento.innerHTML = '<div style="text-align:center;color:var(--text-muted);">Nenhum item</div>';
    document.getElementById('totalPacotes').textContent = '0';
    document.getElementById('totalVolumes').textContent = '0';
    document.getElementById('totalItensUnicos').textContent = '0';
    document.getElementById('totalProdutosEncontrados').textContent = '0';
    return;
  }
  container.innerHTML = codigos.map(cod => {
    const item = state.pedidoAtual[cod];
    const bg = item.encontrado ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    return `<span style="display:inline-block;padding:6px 12px;border-radius:20px;margin:4px;background:${bg};color:var(--text);">
      ${cod} <strong>${item.qtd}</strong><span onclick="removerItemPedido('${cod}')" style="cursor:pointer;margin-left:6px;color:var(--danger);">✖</span></span>`;
  }).join('');
  resumo.innerHTML = codigos.map(cod => {
    const i = state.pedidoAtual[cod];
    const v = Math.floor(i.qtd / i.pacotesPorVolume);
    const s = i.qtd % i.pacotesPorVolume;
    return `<div>${i.encontrado ? '✅' : '❌'} ${cod}: ${i.qtd} pacotes → ${v} caixas${s > 0 ? ` + ${s}` : ''}</div>`;
  }).join('');
  detalhamento.innerHTML = `<table><thead><tr><th>Código</th><th>Produto</th><th>Pacotes</th><th>Caixas</th></tr></thead><tbody>
    ${codigos.map(cod => {
      const i = state.pedidoAtual[cod];
      return `<tr><td>${cod}</td><td>${i.nome}</td><td>${i.qtd}</td><td>${Math.floor(i.qtd / i.pacotesPorVolume)}</td></tr>`;
    }).join('')}</tbody></table>`;
  let tp = 0, tv = 0, te = 0;
  codigos.forEach(cod => {
    const i = state.pedidoAtual[cod];
    tp += i.qtd;
    tv += Math.floor(i.qtd / i.pacotesPorVolume);
    if (i.encontrado) te++;
  });
  document.getElementById('totalPacotes').textContent = tp;
  document.getElementById('totalVolumes').textContent = tv;
  document.getElementById('totalItensUnicos').textContent = codigos.length;
  document.getElementById('totalProdutosEncontrados').textContent = te;
}

function exportarPedido() {
  const codigos = Object.keys(state.pedidoAtual);
  if (codigos.length === 0) { mostrarToast('❌ Nenhum item!', 'error'); return; }
  const dados = codigos.map(cod => {
    const i = state.pedidoAtual[cod];
    return { 'Código': cod, 'Produto': i.nome, 'Pacotes': i.qtd, 'Caixas': Math.floor(i.qtd / i.pacotesPorVolume), 'Encontrado': i.encontrado ? 'Sim' : 'Não' };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dados);
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
  XLSX.writeFile(wb, `pedido_${new Date().toISOString().split('T')[0]}.xlsx`);
  mostrarToast('📥 Exportado!', 'success');
}

function escanearCodigoPedido() { abrirCameraParaCampo('codigoLido', () => adicionarCodigoLido()); }

// ===== CÂMERA =====
let html5QrCodeCamera = null;

function abrirCameraParaCampo(campoId, callback) {
  const container = document.getElementById('cameraContainer');
  container.style.display = 'flex';
  if (html5QrCodeCamera) {
    html5QrCodeCamera.stop().then(() => { html5QrCodeCamera.clear(); html5QrCodeCamera = null; iniciarCamera(campoId, callback); }).catch(() => { html5QrCodeCamera = null; iniciarCamera(campoId, callback); });
  } else iniciarCamera(campoId, callback);
}

function iniciarCamera(campoId, callback) {
  html5QrCodeCamera = new Html5Qrcode("cameraReader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  html5QrCodeCamera.start({ facingMode: "environment" }, config,
    (text) => {
      document.getElementById(campoId).value = text;
      fecharCamera();
      mostrarToast('✅ Código capturado!', 'success');
      if (typeof callback === 'function') callback();
    },
    () => {}
  ).catch(() => { fecharCamera(); mostrarToast('❌ Erro ao acessar câmera', 'error'); });
}

function fecharCamera() {
  document.getElementById('cameraContainer').style.display = 'none';
  if (html5QrCodeCamera) {
    html5QrCodeCamera.stop().then(() => { html5QrCodeCamera.clear(); html5QrCodeCamera = null; }).catch(() => { html5QrCodeCamera = null; });
  }
}

// ===== DASHBOARD =====
function atualizarDashboard() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('dashTotalProdutos', state.produtos.length);
  set('dashProdutosBanco', state.produtos.filter(p => p.quantidade > 0).length);
  set('dashProdutosPrateleira', state.prateleiras.reduce((a, s) => a + s.produtos.reduce((x, p) => x + p.quantidade, 0), 0));
  set('dashProdutosCarga', state.carga.reduce((a, c) => a + c.quantidade, 0));
  set('dashCaixasPapelao', state.insumos.caixaModeloA + state.insumos.caixaModeloB);
  set('dashEmbalagens', Object.values(state.insumos.embalagens).reduce((a, b) => a + (b || 0), 0) + (state.insumos.embalagem40x50 || 0));
  set('dashTotalUnidades', state.produtos.reduce((a, p) => a + (p.quantidade || 0), 0));
  set('dashAlertas', state.produtos.filter(p => p.quantidade > 0 && p.quantidade <= state.limiteCritico).length);
  set('dashInjetados', state.injetados.reduce((a, i) => a + i.quantidade, 0).toFixed(0));
}

// ===== GRÁFICO =====
function atualizarGrafico() {
  const canvas = document.getElementById('estoqueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tipo = document.getElementById('tipoGrafico').value;
  if (state.chart) state.chart.destroy();
  const com = state.produtos.filter(p => p.quantidade > 0);
  const labels = com.map(p => p.nome);
  const data = com.map(p => p.quantidade);
  document.getElementById('totalProdutosGraf').textContent = labels.length;
  document.getElementById('totalUnidadesGraf').textContent = data.reduce((a, b) => a + b, 0);
  document.getElementById('totalReservadoGraf').textContent = state.carga.reduce((a, c) => a + c.quantidade, 0);
  document.getElementById('mediaGraf').textContent = labels.length > 0 ? Math.round(data.reduce((a, b) => a + b, 0) / labels.length) : 0;
  const tab = document.getElementById('graficoTabela');
  if (tab) {
    let h = '<table><thead><tr><th>Produto</th><th>Total</th><th>Localizações</th></tr></thead><tbody>';
    state.produtos.forEach(p => {
      const loc = getProductLocations(p.id);
      if (loc.length > 0 || p.quantidade > 0) {
        const ls = loc.map(l => `${l.prateleira}${l.posicao} (${l.quantidade} cx)`).join(', ') || '-';
        h += `<tr><td>${p.nome}</td><td>${p.quantidade || 0}</td><td>${ls}</td></tr>`;
      }
    });
    h += '</tbody></table>';
    tab.innerHTML = h;
  }
  if (labels.length === 0) return;
  const cores = labels.map(() => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
  const chartType = tipo === 'doughnut' ? 'doughnut' : tipo === 'pie' ? 'pie' : 'bar';
  const config = {
    type: chartType,
    data: { labels, datasets: [{ label: 'Quantidade', data, backgroundColor: cores, borderColor: cores, borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: chartType === 'pie' || chartType === 'doughnut', position: 'bottom' } } }
  };
  if (tipo === 'horizontalBar') config.options.indexAxis = 'y';
  state.chart = new Chart(ctx, config);
}

// ===== ALERTAS =====
function verificarEstoque() {
  const container = document.getElementById('alertasContainer');
  const baixos = state.produtos.filter(p => p.quantidade > 0 && p.quantidade <= state.limiteBaixo);
  const criticos = state.produtos.filter(p => p.quantidade > 0 && p.quantidade <= state.limiteCritico);
  document.getElementById('totalBaixo').textContent = baixos.length;
  document.getElementById('totalCritico').textContent = criticos.length;
  if (criticos.length === 0 && baixos.length === 0) {
    container.innerHTML = '<p class="alert-box-success">✅ Estoque adequado!</p>';
    document.getElementById('alertBanner').classList.remove('active');
    return;
  }
  let h = '';
  criticos.forEach(p => h += `<div class="alert-box alert-box-danger"><strong>${p.nome}</strong> - ${p.quantidade} cx (CRÍTICO)</div>`);
  baixos.filter(p => p.quantidade > state.limiteCritico).forEach(p => h += `<div class="alert-box alert-box-warning"><strong>${p.nome}</strong> - ${p.quantidade} cx (BAIXO)</div>`);
  container.innerHTML = h;
  document.getElementById('alertBanner').classList.add('active');
}

function configurarAlertas() {
  document.getElementById('limiteBaixo').value = state.limiteBaixo;
  document.getElementById('limiteCritico').value = state.limiteCritico;
  document.getElementById('modalConfig').style.display = 'flex';
}

function saveConfig() {
  state.limiteBaixo = parseInt(document.getElementById('limiteBaixo').value) || 5;
  state.limiteCritico = parseInt(document.getElementById('limiteCritico').value) || 2;
  localStorage.setItem(STORAGE_KEYS.limiteBaixo, state.limiteBaixo);
  localStorage.setItem(STORAGE_KEYS.limiteCritico, state.limiteCritico);
  document.getElementById('modalConfig').style.display = 'none';
  verificarEstoque();
  mostrarToast('✅ Salvo!', 'success');
}

function closeModalConfig() { document.getElementById('modalConfig').style.display = 'none'; }

// ===== HISTÓRICO =====
function carregarHistorico() {
  const c = document.getElementById('historicoContainer');
  if (!c) return;
  if (state.historico.length === 0) { c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">📭 Vazio</div>'; return; }
  c.innerHTML = state.historico.map(h => `
    <div class="historico-item">
      <strong>${h.produto}</strong> - ${h.acao} (${h.quantidade} cx)
      ${h.detalhes ? `<br><small style="color:var(--text-muted);">${h.detalhes}</small>` : ''}
      <br><small class="historico-date">${h.data}</small>
    </div>`).join('');
}

function limparHistorico() { if (!confirm('Limpar?')) return; salvarEstadoParaUndo(); state.historico = []; setData(STORAGE_KEYS.historico, state.historico); carregarHistorico(); mostrarToast('🗑️ Limpo!', 'warning'); }

function exportarHistoricoExcel() {
  if (state.historico.length === 0) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(state.historico);
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
  XLSX.writeFile(wb, `historico_${new Date().toISOString().split('T')[0]}.xlsx`);
  mostrarToast('📥 Exportado!', 'success');
}

// ===== USUÁRIOS =====
function carregarUsuarios() {
  const lista = document.getElementById('listaUsuarios');
  if (!lista) return;
  lista.innerHTML = '';
  state.usuarios.forEach(u => {
    lista.innerHTML += `<div style="padding:8px;border-bottom:1px solid var(--border);color:var(--text);"><strong>${u.nome}</strong> - ${u.tipo === 'admin' ? '👑 Admin' : '👤 Usuário'} ${u.id !== 'admin' ? `<button class="btn btn-xs btn-danger" onclick="removerUsuario('${u.id}')">🗑️</button>` : ''}</div>`;
  });
}

function carregarLogAcesso() {
  const c = document.getElementById('logAcessosContainer');
  if (!c) return;
  const log = getData(STORAGE_KEYS.logAcessos, []);
  c.innerHTML = log.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum acesso</div>' : log.slice(0, 50).map(l => `<div style="padding:6px;border-bottom:1px solid var(--border);color:var(--text);font-size:13px;">${l.usuario} - ${l.acao} - ${l.data}</div>`).join('');
}

function abrirModalUsuario() { document.getElementById('modalUsuario').style.display = 'flex'; }

function salvarUsuario() {
  const nome = document.getElementById('editUsuarioNome').value.trim();
  const senha = document.getElementById('editUsuarioSenha').value;
  const tipo = document.getElementById('editUsuarioTipo').value;
  if (!nome || !senha) { mostrarToast('❌ Preencha!', 'error'); return; }
  if (state.usuarios.some(u => u.nome === nome)) { mostrarToast('❌ Usuário já existe!', 'error'); return; }
  salvarEstadoParaUndo();
  state.usuarios.push({ id: Date.now().toString(), nome, senha, tipo });
  setData(STORAGE_KEYS.usuarios, state.usuarios);
  document.getElementById('modalUsuario').style.display = 'none';
  carregarUsuarios();
  mostrarToast('✅ Adicionado!', 'success');
}

function removerUsuario(id) {
  if (!confirm('Remover?')) return;
  salvarEstadoParaUndo();
  state.usuarios = state.usuarios.filter(u => u.id !== id);
  setData(STORAGE_KEYS.usuarios, state.usuarios);
  carregarUsuarios();
}

function limparLogAcesso() { setData(STORAGE_KEYS.logAcessos, []); carregarLogAcesso(); }
function closeModalUsuario() { document.getElementById('modalUsuario').style.display = 'none'; }

// ===== EXPORTAR / IMPORTAR =====
function abrirExportar() {
  const dados = {
    produtos: state.produtos, prateleiras: state.prateleiras, carga: state.carga,
    historico: state.historico, insumos: state.insumos, configInsumos: state.configInsumos,
    produtoInsumoMap: state.produtoInsumoMap, pedidosSeparar: state.pedidosSeparar,
    pedidosFinalizados: state.pedidosFinalizados, injecao: state.injecao,
    injetando: state.injetando, injetados: state.injetados, materiaPrima: state.materiaPrima,
    pedidoCargaAtual: state.pedidoCargaAtual
  };
  const t = document.getElementById('dadosTextarea');
  t.value = JSON.stringify(dados, null, 2);
  t.readOnly = true;
  document.getElementById('modalDadosTitle').textContent = '📥 Exportar Dados';
  document.getElementById('dadosInfo').innerHTML = '<strong>📌 Instruções:</strong> Copie o texto ou clique em "Baixar Arquivo".';
  document.getElementById('btnImportarAcao').style.display = 'none';
  document.getElementById('modalDados').style.display = 'flex';
}

function abrirImportar() {
  const t = document.getElementById('dadosTextarea');
  t.value = '';
  t.readOnly = false;
  t.placeholder = 'Cole aqui o JSON do backup... (Ctrl+V)';
  document.getElementById('modalDadosTitle').textContent = '📤 Importar Dados';
  document.getElementById('dadosInfo').innerHTML = `
    <strong>📌 Instruções:</strong> Cole o JSON ou selecione um arquivo.<br>
    <input type="file" id="importFileInput" accept=".json" style="margin-top:10px;">
    <button class="btn btn-info btn-md" onclick="lerArquivoImportacao()">📂 Ler Arquivo</button>
    <button class="btn btn-info btn-md" onclick="colarDoClipboard()">📋 Colar</button>`;
  document.getElementById('btnImportarAcao').style.display = 'inline-block';
  document.getElementById('modalDados').style.display = 'flex';
  setTimeout(() => t.focus(), 300);
}

function lerArquivoImportacao() {
  const fi = document.getElementById('importFileInput');
  if (!fi || !fi.files || fi.files.length === 0) { mostrarToast('❌ Selecione um arquivo!', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('dadosTextarea').value = e.target.result; mostrarToast('✅ Arquivo carregado!', 'success'); };
  reader.readAsText(fi.files[0]);
}

async function colarDoClipboard() {
  const t = document.getElementById('dadosTextarea');
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) { t.value = text; mostrarToast('✅ Colado!', 'success'); }
    else mostrarToast('❌ Clipboard vazio!', 'error');
  } catch { mostrarToast('⚠️ Use Ctrl+V', 'warning'); t.focus(); }
}

function fecharModalDados() { document.getElementById('modalDados').style.display = 'none'; }
function copiarDados() { const t = document.getElementById('dadosTextarea'); t.select(); document.execCommand('copy'); mostrarToast('📋 Copiado!', 'success'); }
function baixarArquivo() {
  const t = document.getElementById('dadosTextarea');
  const blob = new Blob([t.value], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dsync_backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  mostrarToast('💾 Baixado!', 'success');
}

function importarDados() {
  const str = document.getElementById('dadosTextarea').value.trim();
  if (!str) { mostrarToast('❌ Cole os dados!', 'error'); return; }
  try {
    const imp = JSON.parse(str);
    if (!confirm('⚠️ Substituirá TODOS os dados. Continuar?')) return;
    if (imp.produtos === undefined || imp.prateleiras === undefined) { mostrarToast('❌ JSON inválido!', 'error'); return; }
    salvarEstadoParaUndo();
    state.produtos = imp.produtos || [];
    state.prateleiras = imp.prateleiras || [];
    state.carga = imp.carga || [];
    state.historico = imp.historico || [];
    state.insumos = imp.insumos || state.insumos;
    if (state.insumos.embalagem40x50 === undefined) state.insumos.embalagem40x50 = 0;
    state.configInsumos = imp.configInsumos || state.configInsumos;
    if (state.configInsumos.alertaEmbalagem40x50 === undefined) state.configInsumos.alertaEmbalagem40x50 = 500;
    state.produtoInsumoMap = imp.produtoInsumoMap || {};
    state.pedidosSeparar = imp.pedidosSeparar || [];
    state.pedidosFinalizados = imp.pedidosFinalizados || [];
    state.injecao = imp.injecao || [];
    state.injetando = (imp.injetando || []).map(m => {
      if (!m.ultimoTick) m.ultimoTick = Date.now();
      if (typeof m.produzido !== 'number') m.produzido = 0;
      return m;
    });
    state.injetados = imp.injetados || [];
    state.materiaPrima = imp.materiaPrima || { tipos: ['PP','PE','PET','PS','PVC','ECO'], estoque: {} };
    state.pedidoCargaAtual = imp.pedidoCargaAtual || { ativo: false, codigo: '', itens: {} };
    if (!state.pedidoCargaAtual.itens) state.pedidoCargaAtual.itens = {};
    state.produtos = state.produtos.map(p => {
      let pac = parseInt(p.pacotesPorVolume);
      if (isNaN(pac) || pac <= 0) { pac = 25; p.pacotesPorVolume = pac; }
      return p;
    });
    state.carga = state.carga.map(item => ({
      uid: item.uid || ('c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      id: item.id, quantidade: item.quantidade || 0,
      prateleira: item.prateleira || null, posicao: item.posicao || null,
      pedidoCodigo: item.pedidoCodigo || null
    }));
    setData(STORAGE_KEYS.initialized, true);
    migrarProdutosParaInjecao();
    saveData(); salvarInsumos(); salvarPedidoCarga();
    fecharModalDados();
    atualizarTudo();
    renderizarInsumos(); verificarAlertasInsumos(); atualizarListasPedidos();
    renderizarInjecao(); renderizarInjetar(); renderizarInjetando();
    renderizarInjetados(); renderizarMateriaPrima();
    recalcularProducaoOffline();
    atualizarPedidoCarga();
    mostrarToast(`✅ Importado! ${state.produtos.length} produtos.`, 'success');
  } catch (e) {
    console.error(e);
    mostrarToast(`❌ Erro: ${e.message}`, 'error');
  }
}

function exportarExcel() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(state.produtos.map(p => ({ 'Produto': p.nome, 'Código': p.codigoInterno, 'Disponível': p.quantidade })));
  XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
  XLSX.writeFile(wb, `estoque_${new Date().toISOString().split('T')[0]}.xlsx`);
  mostrarToast('📥 Exportado!', 'success');
}

function fazerBackup() { abrirExportar(); }

function searchProducts() {
  const term = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!term) return;
  const res = state.produtos.filter(p => p.nome.toLowerCase().includes(term) || (p.codigoInterno && p.codigoInterno.toLowerCase().includes(term)));
  if (res.length === 0) { mostrarToast('❌ Nada encontrado!', 'error'); return; }
  let h = '<div style="max-height:400px; overflow-y:auto;">';
  res.forEach(p => {
    const loc = getProductLocations(p.id);
    const ls = loc.map(l => `${l.prateleira}${l.posicao} (${l.quantidade} cx)`).join(', ') || 'Não armazenado';
    h += `<div style="border-bottom:1px solid var(--border); padding:10px;">
      <strong>${p.nome}</strong> (${p.codigoInterno || 'sem código'})<br>
      <span style="color:var(--text-secondary);">Disponível: ${p.quantidade || 0} cx</span><br>
      <span style="color:var(--primary);">📍 ${ls}</span></div>`;
  });
  h += '</div>';
  document.getElementById('modalTitle').textContent = '🔍 Resultados';
  document.getElementById('modalBody').innerHTML = h;
  document.getElementById('modal').style.display = 'flex';
  state.modalType = 'busca';
}

function resetAll() { if (!confirm('Resetar TUDO? Isso apaga todos os dados!')) return; localStorage.clear(); location.reload(); }

function limparEstoqueCompleto() {
  if (!confirm('Limpar estoque?')) return;
  salvarEstadoParaUndo();
  state.produtos.forEach(p => p.quantidade = 0);
  state.prateleiras.forEach(s => s.produtos = []);
  state.carga = [];
  saveData();
  atualizarTudo();
  mostrarToast('✅ Limpo!', 'success');
}

function limparEstoqueBaixo() {
  const baixos = state.produtos.filter(p => p.quantidade > 0 && p.quantidade <= state.limiteBaixo);
  if (baixos.length === 0) { mostrarToast('✅ Nenhum baixo!', 'success'); return; }
  if (!confirm(`Zerar ${baixos.length} produto(s) e remover das prateleiras?`)) return;
  salvarEstadoParaUndo();
  const ids = new Set(baixos.map(p => p.id));
  baixos.forEach(p => p.quantidade = 0);
  state.prateleiras.forEach(s => { s.produtos = s.produtos.filter(pos => !ids.has(pos.id)); });
  state.carga = state.carga.filter(c => !ids.has(c.id));
  saveData();
  atualizarTudo();
  mostrarToast('✅ Zerado!', 'success');
}

function limparEstoqueProdutoEspecifico(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Zerar "${p.nome}" e remover das prateleiras?`)) return;
  salvarEstadoParaUndo();
  p.quantidade = 0;
  state.prateleiras.forEach(s => { s.produtos = s.produtos.filter(pos => pos.id !== id); });
  state.carga = state.carga.filter(c => c.id !== id);
  saveData();
  atualizarTudo();
  mostrarToast('✅ Zerado!', 'success');
}// ===== NAVEGAÇÃO =====
function switchTab(tab) {
  document.body.classList.remove('tab-dashboard', 'tab-estoque', 'tab-pedidos', 'tab-injecao', 'tab-usuarios');
  document.body.classList.add('tab-' + tab);
  atualizarIndicadorAba(tab);

  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById(`tab-${tab}`);
  if (target) target.classList.add('active');
  const btn = document.querySelector(`.tab[onclick="switchTab('${tab}')"]`);
  if (btn) btn.classList.add('active');

  if (tab === 'estoque') {
    const ativa = document.querySelector('#tab-estoque .sub-tab.active');
    if (!ativa) mostrarSubAba('prateleiras');
  } else if (tab === 'pedidos') {
    const ativa = document.querySelector('#tab-pedidos .sub-tab.active');
    if (!ativa) mostrarSubAba('pedidonovo');
  } else if (tab === 'injecao') {
    const ativa = document.querySelector('#tab-injecao .sub-tab.active');
    if (!ativa) mostrarSubAba('injecao');
    renderizarInjecao(); renderizarInjetar(); renderizarInjetando();
    renderizarInjetados(); renderizarMateriaPrima();
  } else if (tab === 'dashboard') {
    atualizarDashboard();
  } else if (tab === 'usuarios') {
    carregarUsuarios(); carregarLogAcesso();
  }
}

function atualizarIndicadorAba(tab) {
  let el = document.getElementById('tabIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tabIndicator';
    el.className = 'tab-indicator';
    document.body.appendChild(el);
  }
  const nomes = {
    dashboard: '📊 Dashboard',
    estoque: '📦 Estoque',
    pedidos: '📋 Pedidos',
    injecao: '💉 Injeção',
    usuarios: '👥 Usuários'
  };
  el.textContent = nomes[tab] || tab;

  if (tab === 'dashboard') {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
  } else {
    el.style.opacity = '0.9';
    el.style.transform = 'translateY(0)';
  }
}

function mostrarSubAba(subAba) {
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.querySelector(`.sub-tab[data-subaba="${subAba}"]`);
  if (btn) btn.classList.add('active');
  const content = document.getElementById(`sub-tab-${subAba}`);
  if (content) content.classList.add('active');

  if (subAba === 'prateleiras') carregarPrateleiras();
  else if (subAba === 'cadastro') { carregarProdutos(); atualizarSelects(); }
  else if (subAba === 'insumos') { renderizarInsumos(); verificarAlertasInsumos(); }
  else if (subAba === 'alertas') verificarEstoque();
  else if (subAba === 'grafico') atualizarGrafico();
  else if (subAba === 'pedidonovo') atualizarPedidoNovo();
  else if (subAba === 'separar') atualizarListasPedidos();
  else if (subAba === 'finalizado') atualizarListasPedidos();
  else if (subAba === 'carga') { carregarPedidoCarga(); montarPedidoCarga(); }
  else if (subAba === 'injecao') renderizarInjecao();
  else if (subAba === 'injetar') renderizarInjetar();
  else if (subAba === 'injetando') renderizarInjetando();
  else if (subAba === 'injetados') renderizarInjetados();
  else if (subAba === 'materiaprima') renderizarMateriaPrima();
}

// ===== INJEÇÃO =====
function renderizarInjecao() {
  const c = document.getElementById('injecaoContainer');
  if (!c) return;
  if (state.injecao.length === 0) { c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:30px;">Nenhum produto cadastrado.</p>'; return; }
  let h = '<table class="tabela-injecao"><thead><tr><th>Produto</th><th>Código Extra</th><th>Matéria Prima</th><th>Consumo/Cx</th><th>Meta</th><th>Produzido</th><th>Ações</th></tr></thead><tbody>';
  state.injecao.forEach(p => {
    const prod = state.injetados.filter(i => i.codigoExtra === p.codigoExtra).reduce((a, i) => a + i.quantidade, 0);
    h += `<tr>
      <td><strong>${p.nome}</strong></td>
      <td>${p.codigoExtra || '-'}</td>
      <td>${p.materiaPrima}</td>
      <td>${p.consumoPorCaixa}</td>
      <td>${p.meta}</td>
      <td>${prod.toFixed(2)} / ${p.meta}</td>
      <td>
        <button class="btn btn-xs btn-info" onclick="editarProdutoInjecao('${p.id}')">✏️</button>
        <button class="btn btn-xs btn-danger" onclick="removerProdutoInjecao('${p.id}')">🗑️</button>
      </td></tr>`;
  });
  h += '</tbody></table>';
  c.innerHTML = h;
}

function abrirModalInjecao(produtoId) {
  if (produtoId) {
    const p = state.injecao.find(x => x.id === produtoId);
    if (!p) return;
    const ops = state.materiaPrima.tipos.map(t => `<option value="${t}" ${t === p.materiaPrima ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('modalInjecaoTitle').textContent = '✏️ Editar Produto';
    document.getElementById('modalInjecaoBody').innerHTML = `
      <label>Nome *</label><input type="text" id="injNome" value="${p.nome}">
      <label>Código Extra *</label><input type="text" id="injCodigoExtra" value="${p.codigoExtra}">
      <label>Matéria Prima</label><select id="injMateriaPrima">${ops}</select>
      <label>Consumo/Caixa *</label><input type="number" id="injConsumo" value="${p.consumoPorCaixa}" step="0.1" min="0.1">
      <label>Meta *</label><input type="number" id="injMeta" value="${p.meta}" min="1">`;
    state.currentEditInjecao = produtoId;
  } else {
    const ops = state.materiaPrima.tipos.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('modalInjecaoTitle').textContent = '➕ Cadastrar Produto';
    document.getElementById('modalInjecaoBody').innerHTML = `
      <label>Nome *</label><input type="text" id="injNome" placeholder="Ex: c2-N">
      <label>Código Extra *</label><input type="text" id="injCodigoExtra" placeholder="Ex: PP-2.0">
      <label>Matéria Prima</label><select id="injMateriaPrima">${ops}</select>
      <label>Consumo/Caixa *</label><input type="number" id="injConsumo" value="1.5" step="0.1" min="0.1">
      <label>Meta *</label><input type="number" id="injMeta" value="35" min="1">`;
    state.currentEditInjecao = null;
  }
  document.getElementById('modalInjecao').style.display = 'flex';
}

function salvarProdutoInjecao() {
  const nome = document.getElementById('injNome').value.trim();
  const codigo = document.getElementById('injCodigoExtra').value.trim().toUpperCase();
  const mp = document.getElementById('injMateriaPrima').value;
  const consumo = parseFloat(document.getElementById('injConsumo').value);
  const meta = parseInt(document.getElementById('injMeta').value);
  if (!nome || !codigo || !consumo || !meta) { mostrarToast('❌ Preencha todos!', 'error'); return; }
  salvarEstadoParaUndo();
  if (state.currentEditInjecao) {
    const p = state.injecao.find(x => x.id === state.currentEditInjecao);
    if (p) { p.nome = nome; p.codigoExtra = codigo; p.materiaPrima = mp; p.consumoPorCaixa = consumo; p.meta = meta; }
    state.currentEditInjecao = null;
  } else {
    state.injecao.push({ id: 'inj' + Date.now(), nome, codigoExtra: codigo, materiaPrima: mp, consumoPorCaixa: consumo, meta });
  }
  saveData();
  fecharModalInjecao();
  renderizarInjecao();
  renderizarInjetar();
  mostrarToast('✅ Salvo!', 'success');
}

function fecharModalInjecao() { document.getElementById('modalInjecao').style.display = 'none'; state.currentEditInjecao = null; }
function editarProdutoInjecao(id) { abrirModalInjecao(id); }

function removerProdutoInjecao(id) {
  if (!confirm('Remover produto?')) return;
  salvarEstadoParaUndo();
  state.injecao = state.injecao.filter(p => p.id !== id);
  saveData();
  renderizarInjecao();
  renderizarInjetar();
  mostrarToast('🗑️ Removido!', 'warning');
}

function renderizarInjetar() {
  const c = document.getElementById('injetarContainer');
  if (!c) return;
  const pendentes = state.injecao.filter(p => !state.injetando.some(m => m.produtoId === p.id && (m.status === 'ativa' || m.status === 'pausada')));
  if (pendentes.length === 0) { c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:30px;">Nenhum produto aguardando.</p>'; return; }
  let h = '<table class="tabela-injecao"><thead><tr><th>Produto</th><th>Código</th><th>Matéria Prima</th><th>Meta</th><th>Produzido</th><th>Ação</th></tr></thead><tbody>';
  pendentes.forEach(p => {
    const prod = state.injetados.filter(i => i.codigoExtra === p.codigoExtra).reduce((a, i) => a + i.quantidade, 0);
    h += `<tr>
      <td><strong>${p.nome}</strong></td><td>${p.codigoExtra || '-'}</td><td>${p.materiaPrima}</td>
      <td>${p.meta}</td><td>${prod.toFixed(2)} / ${p.meta}</td>
      <td><button class="btn btn-xs btn-success" onclick="iniciarProducaoProduto('${p.id}')">▶️ Iniciar</button></td>
    </tr>`;
  });
  h += '</tbody></table>';
  c.innerHTML = h;
}

function iniciarProducaoProduto(produtoId) {
  const maqOciosa = state.injetando.find(m => m.status === 'ociosa');
  if (!maqOciosa) { mostrarToast('❌ Nenhuma máquina ociosa!', 'error'); return; }
  abrirModalMaquina(produtoId, maqOciosa.id);
}

function abrirModalMaquina(produtoId, maquinaId) {
  const ops = state.injecao.map(p => `<option value="${p.id}" ${produtoId && p.id === produtoId ? 'selected' : ''}>${p.nome}</option>`).join('');
  let num = '', op = '', cph = '1.5', tp = '8', lim = '35';
  if (maquinaId) {
    const m = state.injetando.find(x => x.id === maquinaId);
    if (m) { num = m.numero; op = m.operador; cph = m.caixasPorHora; tp = m.tempoPrevisto; lim = m.limite; }
  }
  document.getElementById('modalMaquinaTitle').textContent = '⚙️ Configurar Máquina';
  document.getElementById('modalMaquinaBody').innerHTML = `
    <label>Número Máquina *</label>
    <input type="number" id="maqNumero" value="${num}" min="1" max="17" ${maquinaId ? 'readonly' : ''}>
    <label>Produto *</label><select id="maqProduto">${ops}</select>
    <label>Operador *</label><input type="text" id="maqOperador" value="${op}">
    <label>Caixas/hora *</label><input type="number" id="maqCaixasHora" value="${cph}" step="0.1" min="0.1">
    <label>Tempo (horas) *</label><input type="number" id="maqTempo" value="${tp}" step="0.1" min="0.1">
    <label>Limite Caixas</label><input type="number" id="maqLimite" value="${lim}" min="1">`;
  state.currentMaquinaEdit = maquinaId || null;
  document.getElementById('modalMaquina').style.display = 'flex';
}

function salvarModalMaquina() {
  const num = parseInt(document.getElementById('maqNumero').value);
  const pid = document.getElementById('maqProduto').value;
  const op = document.getElementById('maqOperador').value.trim();
  const cph = parseFloat(document.getElementById('maqCaixasHora').value);
  const tp = parseFloat(document.getElementById('maqTempo').value);
  const lim = parseInt(document.getElementById('maqLimite').value);
  if (!num || !pid || !op || !cph || !tp || !lim) { mostrarToast('❌ Preencha todos!', 'error'); return; }
  if (state.currentMaquinaEdit) {
    const m = state.injetando.find(x => x.id === state.currentMaquinaEdit);
    if (m) {
      m.produtoId = pid; m.operador = op; m.caixasPorHora = cph;
      m.tempoPrevisto = tp; m.limite = lim; m.status = 'ativa'; m.produzido = 0;
      m.ultimoTick = Date.now();
    }
    state.currentMaquinaEdit = null;
  } else {
    if (state.injetando.some(m => m.numero === num)) { mostrarToast('❌ Máquina já existe!', 'error'); return; }
    salvarEstadoParaUndo();
    state.injetando.push({
      id: 'maq' + Date.now(), numero: num, produtoId: pid, operador: op,
      caixasPorHora: cph, tempoPrevisto: tp, limite: lim, produzido: 0,
      status: 'ativa', dataInicio: new Date().toLocaleString(),
      ultimoTick: Date.now()
    });
  }
  saveData();
  fecharModalMaquina();
  renderizarInjetando();
  renderizarInjetar();
  mostrarToast('✅ Máquina salva!', 'success');
}

function fecharModalMaquina() { document.getElementById('modalMaquina').style.display = 'none'; state.currentMaquinaEdit = null; }

function renderizarInjetando() {
  const c = document.getElementById('injetandoContainer');
  if (!c) return;
  if (state.injetando.length === 0) { c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:30px;">Nenhuma máquina.</p>'; return; }
  let h = '';
  state.injetando.forEach(m => {
    const p = state.injecao.find(x => x.id === m.produtoId);
    let cls = 'ativa', lbl = '▶️ ATIVA';
    if (m.status === 'pausada') { cls = 'pausada'; lbl = '⏸️ PAUSADA'; }
    else if (m.status === 'ociosa') { cls = 'ociosa'; lbl = '⏸️ OCIOSA'; }

    let acoes = '';
    if (m.status === 'ociosa') {
      acoes = `<button class="btn btn-sm btn-success" onclick="iniciarProducaoMaquina('${m.id}')">▶️ Iniciar</button>`;
    } else {
      acoes += m.status === 'pausada'
        ? `<button class="btn btn-sm btn-success" onclick="retomarMaquina('${m.id}')">▶️ Retomar</button>`
        : `<button class="btn btn-sm btn-warning" onclick="pausarMaquina('${m.id}')">⏸️ Pausar</button>`;
      acoes += `<button class="btn btn-sm btn-danger" onclick="finalizarMaquina('${m.id}')">✅ Finalizar</button>`;
    }

    const produzidoLive = valorLiveProduzido(m);
    const limite = m.limite || 0;
    const pct = limite > 0 ? Math.min(100, (produzidoLive / limite) * 100) : 0;
    const restante = Math.max(0, limite - produzidoLive);

    let estimativa = '—';
    if (m.status === 'ativa' && m.caixasPorHora > 0 && restante > 0) {
      const horasRestantes = restante / m.caixasPorHora;
      const minutos = Math.round(horasRestantes * 60);
      if (minutos < 60) estimativa = `${minutos} min`;
      else {
        const h2 = Math.floor(minutos / 60);
        const m2 = minutos % 60;
        estimativa = `${h2}h ${m2}min`;
      }
    }

    h += `
      <div class="maquina-card ${cls}" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="min-width:120px;">
          <div class="maquina-num">Máquina ${m.numero}</div>
          <div class="status ${cls}">${lbl}</div>
        </div>
        <div style="flex:1; min-width:220px;">
          ${p ? `
            <strong style="font-size:15px;color:var(--text);">${p.nome}</strong><br>
            <span style="font-size:12px;color:var(--text-muted);">Operador: ${m.operador} · ${m.caixasPorHora} cx/h</span>
            <div style="margin-top:8px;">
              <div class="progress-info">
                <span><strong>${produzidoLive.toFixed(2)}</strong> / ${limite} cx</span>
                <span>${pct.toFixed(1)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-bar-fill" style="width:${pct}%;"></div>
              </div>
              <div class="progress-remaining">
                ${m.status === 'ativa'
                  ? `⏳ Faltam ${restante.toFixed(2)} cx · estimativa ${estimativa}`
                  : (m.status === 'pausada' ? '⏸️ Pausada' : 'Sem produção')}
              </div>
            </div>
          ` : '<span style="color:var(--text-muted);">Sem produção ativa</span>'}
        </div>
        <div style="display:flex; gap:5px; flex-direction:column; min-width:120px;">${acoes}</div>
      </div>`;
  });
  c.innerHTML = h;
}

function pausarMaquina(id) {
  salvarEstadoParaUndo();
  const m = state.injetando.find(x => x.id === id);
  if (!m) return;
  commitProducao(m);
  m.status = 'pausada';
  saveData();
  renderizarInjetando();
}

function retomarMaquina(id) {
  salvarEstadoParaUndo();
  const m = state.injetando.find(x => x.id === id);
  if (!m) return;
  m.status = 'ativa';
  m.ultimoTick = Date.now();
  saveData();
  renderizarInjetando();
}

function iniciarProducaoMaquina(maquinaId) {
  const m = state.injetando.find(x => x.id === maquinaId);
  if (!m || m.status !== 'ociosa') { mostrarToast('❌ Máquina não está ociosa!', 'error'); return; }
  abrirModalMaquina(null, maquinaId);
}

function finalizarMaquina(id, silencioso) {
  const m = state.injetando.find(x => x.id === id);
  if (!m) return;
  if (m.status === 'ativa') commitProducao(m);
  salvarEstadoParaUndo();
  if (m.produzido > 0) {
    const p = state.injecao.find(x => x.id === m.produtoId);
    state.injetados.push({
      id: 'inj' + Date.now(), nome: p ? p.nome : 'Produto',
      codigoExtra: p ? p.codigoExtra : '?',
      quantidade: Math.round(m.produzido * 100) / 100,
      data: new Date().toLocaleString(), maquina: m.numero
    });
    if (p) {
      const cons = m.produzido * p.consumoPorCaixa;
      if (!state.materiaPrima.estoque[p.materiaPrima]) state.materiaPrima.estoque[p.materiaPrima] = 0;
      state.materiaPrima.estoque[p.materiaPrima] = Math.max(0, state.materiaPrima.estoque[p.materiaPrima] - cons);
    }
  }
  m.produtoId = null; m.operador = ''; m.caixasPorHora = 0; m.tempoPrevisto = 0;
  m.limite = 0; m.produzido = 0; m.status = 'ociosa'; m.ultimoTick = Date.now();
  saveData();
  renderizarInjetando(); renderizarInjetados(); renderizarMateriaPrima();
  if (!silencioso) mostrarToast('✅ Finalizada!', 'success');
}

function renderizarInjetados() {
  const c = document.getElementById('injetadosContainer');
  if (!c) return;
  if (state.injetados.length === 0) { c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:30px;">Nenhum produto injetado.</p>'; return; }
  const grupos = {};
  state.injetados.forEach(i => {
    if (!grupos[i.codigoExtra]) grupos[i.codigoExtra] = { nome: i.nome, codigoExtra: i.codigoExtra, quantidade: 0 };
    grupos[i.codigoExtra].quantidade += i.quantidade;
  });
  let h = '<table class="injetados-tabela"><thead><tr><th>Produto</th><th>Código Extra</th><th>Quantidade</th></tr></thead><tbody>';
  Object.values(grupos).forEach(g => { h += `<tr><td>${g.nome}</td><td>${g.codigoExtra}</td><td>${g.quantidade.toFixed(2)}</td></tr>`; });
  h += '</tbody></table>';
  c.innerHTML = h;
}

function limparInjetados() {
  if (!confirm('Limpar histórico?')) return;
  salvarEstadoParaUndo();
  state.injetados = [];
  saveData();
  renderizarInjetados();
  mostrarToast('🧹 Limpo!', 'success');
}

function renderizarMateriaPrima() {
  const c = document.getElementById('materiaPrimaContainer');
  if (!c) return;
  let h = '<h3 style="color:var(--text);">🧪 Estoque de Matéria Prima (sacos)</h3><div class="mp-grid">';
  state.materiaPrima.tipos.forEach(t => {
    const q = state.materiaPrima.estoque[t] || 0;
    h += `<div class="mp-card">
      <strong class="mp-card-nome">${t}</strong>
      <span class="mp-card-valor">${q}</span> <span class="mp-card-unidade">sacos</span>
    </div>`;
  });
  h += '</div>';
  c.innerHTML = h;
}

function abrirModalEntradaMateriaPrima() {
  const ops = state.materiaPrima.tipos.map(t => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('modalMateriaPrimaTitle').textContent = '➕ Entrada';
  document.getElementById('modalMateriaPrimaBody').innerHTML = `
    <label>Tipo</label><select id="mpTipo">${ops}</select>
    <label>Quantidade (sacos) *</label><input type="number" id="mpQuantidade" min="1">`;
  document.getElementById('modalMateriaPrima').style.display = 'flex';
}

function salvarModalMateriaPrima() {
  const tipo = document.getElementById('mpTipo').value;
  const q = parseInt(document.getElementById('mpQuantidade').value);
  if (!q || q <= 0) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }
  salvarEstadoParaUndo();
  if (!state.materiaPrima.estoque[tipo]) state.materiaPrima.estoque[tipo] = 0;
  state.materiaPrima.estoque[tipo] += q;
  saveData();
  fecharModalMateriaPrima();
  renderizarMateriaPrima();
  mostrarToast('✅ Registrado!', 'success');
}

function fecharModalMateriaPrima() { document.getElementById('modalMateriaPrima').style.display = 'none'; }

function verificarAlertasInjecao() {
  const produtosSemMaquina = state.injecao.filter(p => !state.injetando.some(m => m.produtoId === p.id && (m.status === 'ativa' || m.status === 'pausada')));
  console.log(`🔔 ${produtosSemMaquina.length} produto(s) aguardando injeção`);
}

// ===== PEDIDOS DE SEPARAÇÃO =====
let pedidoAtualEmEdicao = null;

function novoPedido() {
  const codigo = document.getElementById('codigoPedidoInput').value.trim();
  if (!codigo) { mostrarToast('❌ Digite um código!', 'error'); return; }
  if (state.pedidosSeparar.some(p => p.codigo === codigo)) {
    mostrarToast('❌ Já existe um pedido com esse código!', 'error');
    return;
  }
  const novo = { codigo, itens: {}, dataCriacao: new Date().toLocaleString(), status: 'separar' };
  state.pedidosSeparar.push(novo);
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  pedidoAtualEmEdicao = novo;
  document.getElementById('codigoPedidoInput').value = '';
  atualizarPedidoNovo();
  atualizarListasPedidos();
  mostrarToast(`✅ Pedido ${codigo} criado!`, 'success');
}

function adicionarItemPedidoSeparacao() {
  if (!pedidoAtualEmEdicao) { mostrarToast('❌ Crie um pedido primeiro!', 'error'); return; }
  const pid = document.getElementById('pedidoNovoProdutoSelect').value;
  const q = parseInt(document.getElementById('pedidoNovoQuantidadeInput').value);
  if (!pid || !q || q <= 0) { mostrarToast('❌ Dados inválidos!', 'error'); return; }
  const produto = state.produtos.find(p => p.id === pid);
  if (!produto) return;
  salvarEstadoParaUndo();
  const disp = buscarDisponibilidadeProduto(pid);
  let resto = q;
  const reservas = [];
  disp.locais.forEach(l => {
    if (resto <= 0) return;
    const qr = Math.min(resto, l.disponivel);
    if (qr > 0) { reservas.push({ prateleiraId: l.prateleiraId, posicao: l.posicao, quantidade: qr }); resto -= qr; }
  });
  reservas.forEach(r => {
    state.carga.push({
      uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      id: pid, quantidade: r.quantidade, prateleira: r.prateleiraId, posicao: r.posicao,
      pedidoCodigo: pedidoAtualEmEdicao.codigo
    });
  });
  if (!pedidoAtualEmEdicao.itens[pid]) {
    pedidoAtualEmEdicao.itens[pid] = { produtoId: pid, nome: produto.nome, codigoInterno: produto.codigoInterno || '', pacotes: 0, caixas: 0 };
  }
  pedidoAtualEmEdicao.itens[pid].pacotes += q;
  pedidoAtualEmEdicao.itens[pid].caixas += q;
  setData(STORAGE_KEYS.carga, state.carga);
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  atualizarPedidoNovo();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  if (resto > 0) mostrarToast(`⚠️ Faltam ${resto} cx de ${produto.nome}!`, 'warning');
  else mostrarToast(`✅ ${q} caixas adicionadas`, 'success');
}

function removerItemPedidoSeparacao(produtoId) {
  if (!pedidoAtualEmEdicao) return;
  const item = pedidoAtualEmEdicao.itens[produtoId];
  if (!item) return;
  salvarEstadoParaUndo();
  state.carga = state.carga.filter(c => !(c.id === produtoId && c.pedidoCodigo === pedidoAtualEmEdicao.codigo));
  delete pedidoAtualEmEdicao.itens[produtoId];
  setData(STORAGE_KEYS.carga, state.carga);
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  atualizarPedidoNovo();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('🗑️ Removido!', 'warning');
}

function _finalizarPedido(pedido) {
  Object.values(pedido.itens).forEach(item => {
    const pid = item.produtoId;
    const reservas = state.carga.filter(c => c.id === pid && c.pedidoCodigo === pedido.codigo);
    reservas.forEach(r => {
      const s = state.prateleiras.find(x => x.id === r.prateleira);
      if (s) {
        const idx = s.produtos.findIndex(p => p.id === pid && p.posicao === r.posicao);
        if (idx !== -1) {
          s.produtos[idx].quantidade -= r.quantidade;
          if (s.produtos[idx].quantidade <= 0) s.produtos.splice(idx, 1);
        }
      }
      const produto = state.produtos.find(p => p.id === pid);
      if (produto) produto.quantidade = Math.max(0, (produto.quantidade || 0) - r.quantidade);
    });
    state.carga = state.carga.filter(c => !(c.id === pid && c.pedidoCodigo === pedido.codigo));
  });
  state.pedidosSeparar = state.pedidosSeparar.filter(p => p.codigo !== pedido.codigo);
  pedido.status = 'finalizado';
  pedido.dataFinalizacao = new Date().toLocaleString();
  state.pedidosFinalizados.push(pedido);
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  setData(STORAGE_KEYS.pedidosFinalizados, state.pedidosFinalizados);
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.carga, state.carga);
  setData(STORAGE_KEYS.produtos, state.produtos);
  registrarHistorico(`Pedido ${pedido.codigo}`, 'Pedido Finalizado', 0, `Itens: ${Object.values(pedido.itens).map(i => `${i.nome}: ${i.pacotes} cx`).join(', ')}`);
}

function finalizarPedidoSeparacao() {
  if (!pedidoAtualEmEdicao) { mostrarToast('❌ Nenhum pedido em edição!', 'error'); return; }
  if (Object.keys(pedidoAtualEmEdicao.itens).length === 0) { mostrarToast('❌ Pedido vazio!', 'error'); return; }
  if (!confirm(`Finalizar pedido ${pedidoAtualEmEdicao.codigo}?`)) return;
  salvarEstadoParaUndo();
  _finalizarPedido(pedidoAtualEmEdicao);
  pedidoAtualEmEdicao = null;
  atualizarPedidoNovo();
  atualizarListasPedidos();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('✅ Finalizado!', 'success');
}

function atualizarPedidoNovo() {
  const c = document.getElementById('pedidoNovoItens');
  if (!c) return;
  if (!pedidoAtualEmEdicao) { c.innerHTML = '<p style="color:var(--text-muted);">Inicie um pedido para adicionar itens.</p>'; return; }
  const itens = pedidoAtualEmEdicao.itens;
  const itensHtml = Object.values(itens).map(item => {
    const res = state.carga.filter(c => c.id === item.produtoId && c.pedidoCodigo === pedidoAtualEmEdicao.codigo).reduce((a, c) => a + c.quantidade, 0);
    const falta = Math.max(0, item.pacotes - res);
    const locais = state.carga.filter(c => c.id === item.produtoId && c.pedidoCodigo === pedidoAtualEmEdicao.codigo).map(c => `${c.prateleira}${c.posicao}`).join(', ');
    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);color:var(--text);">
      <span><strong>${item.nome}</strong> (${item.codigoInterno || 'sem código'})<br>
      <small style="color:var(--text-muted);">Pedido: ${item.pacotes} cx | Reservado: ${res} (${locais || 'nenhum'}) | Produzir: ${falta}</small></span>
      <button class="btn btn-xs btn-danger" onclick="removerItemPedidoSeparacao('${item.produtoId}')">🗑️</button>
    </div>`;
  }).join('');
  const totalCx = Object.values(itens).reduce((a, i) => a + i.pacotes, 0);
  c.innerHTML = `
    <h4 style="color:var(--text);">Pedido: ${pedidoAtualEmEdicao.codigo}</h4>
    <p style="color:var(--text);"><strong>Total:</strong> ${totalCx} caixas</p>
    ${itensHtml || '<p style="color:var(--text-muted);">Nenhum item.</p>'}
    <div style="display:flex; gap:10px; margin-top:15px; flex-wrap:wrap;">
      <select id="pedidoNovoProdutoSelect" style="flex:2; min-width:200px;">
        <option value="">Selecione...</option>
        ${state.produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}
      </select>
      <input type="number" id="pedidoNovoQuantidadeInput" placeholder="Qtd (cx)" min="1" style="flex:1; min-width:120px;">
      <button class="btn btn-md btn-success" onclick="adicionarItemPedidoSeparacao()">➕ Adicionar</button>
      <button class="btn btn-md btn-primary" onclick="finalizarPedidoSeparacao()">✅ Finalizar</button>
    </div>`;
}

function atualizarListasPedidos() {
  const ls = document.getElementById('listaPedidosSeparar');
  const lf = document.getElementById('listaPedidosFinalizados');
  if (ls) {
    ls.innerHTML = state.pedidosSeparar.map(p => {
      const tc = Object.values(p.itens).reduce((a, i) => a + i.pacotes, 0);
      const tv = Object.values(p.itens).reduce((a, i) => a + i.caixas, 0);
      return `<div class="pedido-card">
        <div class="pedido-codigo">📋 ${p.codigo}</div>
        <div class="pedido-itens">${Object.values(p.itens).map(i => {
          const res = state.carga.filter(c => c.id === i.produtoId && c.pedidoCodigo === p.codigo).reduce((a, c) => a + c.quantidade, 0);
          const falta = Math.max(0, i.pacotes - res);
          return `${i.nome}: ${i.pacotes} cx (Reserv: ${res}, Produzir: ${falta})`;
        }).join('; ') || 'Nenhum item'}</div>
        <div class="pedido-total-caixas">📦 ${tv} vol(s) | ${tc} caixas</div>
        <div class="pedido-acoes">
          <button class="btn btn-sm btn-info" onclick="editarPedido('${p.codigo}')">✏️ Editar</button>
          <button class="btn btn-sm btn-success" onclick="finalizarPedidoDaLista('${p.codigo}')">✅ Separar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirPedido('${p.codigo}', 'separar')">🗑️ Excluir</button>
        </div></div>`;
    }).join('') || '<p style="color:var(--text-muted);">Nenhum pedido pendente.</p>';
  }
  if (lf) {
    lf.innerHTML = state.pedidosFinalizados.map(p => {
      const tc = Object.values(p.itens).reduce((a, i) => a + i.pacotes, 0);
      const tv = Object.values(p.itens).reduce((a, i) => a + i.caixas, 0);
      return `<div class="pedido-card">
        <div class="pedido-codigo">✅ ${p.codigo}</div>
        <div class="pedido-itens">${Object.values(p.itens).map(i => `${i.nome}: ${i.pacotes} cx`).join('; ') || 'Nenhum item'}</div>
        <div class="pedido-total-caixas">📦 ${tv} vol(s) | ${tc} caixas</div>
        <div style="font-size:12px;color:var(--text-muted);">Finalizado: ${p.dataFinalizacao}</div>
        <div class="pedido-acoes">
          <button class="btn btn-sm btn-danger" onclick="excluirPedido('${p.codigo}', 'finalizado')">🗑️ Excluir</button>
        </div></div>`;
    }).join('') || '<p style="color:var(--text-muted);">Nenhum pedido finalizado.</p>';
  }
}

function editarPedido(codigo) {
  const p = state.pedidosSeparar.find(x => x.codigo === codigo);
  if (!p) { mostrarToast('❌ Pedido não encontrado!', 'error'); return; }
  pedidoAtualEmEdicao = p;
  switchTab('pedidos');
  mostrarSubAba('pedidonovo');
  atualizarPedidoNovo();
}

function finalizarPedidoDaLista(codigo) {
  const p = state.pedidosSeparar.find(x => x.codigo === codigo);
  if (!p) return;
  if (!confirm(`Finalizar pedido ${codigo}?`)) return;
  salvarEstadoParaUndo();
  _finalizarPedido(p);
  atualizarListasPedidos();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('✅ Separado!', 'success');
}

function excluirPedido(codigo, tipo) {
  if (!confirm(`Excluir pedido ${codigo}?`)) return;
  salvarEstadoParaUndo();
  if (tipo === 'separar') {
    state.carga = state.carga.filter(c => c.pedidoCodigo !== codigo);
    setData(STORAGE_KEYS.carga, state.carga);
    state.pedidosSeparar = state.pedidosSeparar.filter(x => x.codigo !== codigo);
  } else {
    state.pedidosFinalizados = state.pedidosFinalizados.filter(x => x.codigo !== codigo);
  }
  setData(STORAGE_KEYS.pedidosSeparar, state.pedidosSeparar);
  setData(STORAGE_KEYS.pedidosFinalizados, state.pedidosFinalizados);
  atualizarListasPedidos();
  carregarPrateleiras();
  carregarCarga();
  mostrarToast('🗑️ Excluído!', 'warning');
}

// ===== PEDIDO DE CARGA PERSISTENTE =====
function montarPedidoCarga() {
  carregarPedidoCarga();
  const c = document.getElementById('pedidoCargaContainer');
  if (!c) return;

  if (!state.pedidoCargaAtual.ativo) {
    c.innerHTML = `
      <div class="pedido-carga-wrap" style="text-align:center;">
        <h3 style="color:var(--text);">🚛 Montar Pedido de Carga</h3>
        <p style="color:var(--text-muted);margin:15px 0;">Nenhum pedido de carga ativo.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:15px;">
          <input type="text" id="codigoCargaInput" placeholder="Código do Pedido (ex: CARGA-001)" style="min-width:250px;padding:12px 15px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);">
          <button class="btn btn-lg btn-success" onclick="criarPedidoCarga()">➕ Criar Pedido de Carga</button>
        </div>
      </div>`;
  } else {
    renderizarCargaAtiva();
  }
}

function criarPedidoCarga() {
  const codigo = (document.getElementById('codigoCargaInput')?.value || '').trim() || ('CARGA-' + Date.now().toString().slice(-4));
  state.pedidoCargaAtual = { ativo: true, codigo, itens: {} };
  salvarPedidoCarga();
  atualizarPedidoCarga();
  mostrarToast(`✅ Pedido ${codigo} criado!`, 'success');
}

function renderizarCargaAtiva() {
  const c = document.getElementById('pedidoCargaContainer');
  if (!c) return;
  const itens = state.pedidoCargaAtual.itens || {};
  const temItens = Object.keys(itens).length > 0;

  c.innerHTML = `
    <div class="pedido-carga-wrap">
      <div class="pedido-carga-header">
        <h3>🚛 Pedido de Carga: <span class="pedido-carga-codigo">${state.pedidoCargaAtual.codigo}</span></h3>
        <div class="pedido-carga-actions">
          <button class="btn btn-md btn-success" onclick="finalizarPedidoCargaCompleto()">✅ Finalizar Pedido</button>
          <button class="btn btn-md btn-danger" onclick="cancelarPedidoCarga()">🗑️ Cancelar</button>
        </div>
      </div>
      <div class="pedido-carga-add">
        <select id="produtoPedidoCargaSelect" style="flex:2;min-width:200px;">
          <option value="">Selecione o produto...</option>
          ${state.produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}
        </select>
        <input type="number" id="qtdPedidoCarga" placeholder="Qtd (cx)" min="1" style="flex:1;min-width:100px;">
        <button class="btn btn-md btn-info" onclick="adicionarProdutoPedidoCarga()">➕ Adicionar ao Pedido</button>
      </div>
      <div id="pedidoCargaLista" class="pedido-carga-lista">
        ${temItens ? renderizarTabelaCargaAtiva(itens) : '<div style="text-align:center;padding:30px;color:var(--text-muted);">📦 Nenhum produto no pedido. Adicione acima.</div>'}
      </div>
      <div id="pedidoCargaResumo" style="margin-top:20px;display:${temItens ? 'block' : 'none'};">
        <div id="pedidoCargaTotais">${temItens ? renderizarTotaisCarga(itens) : ''}</div>
      </div>
    </div>`;
}

function renderizarTabelaCargaAtiva(itens) {
  let h = '<table class="tabela-carga"><thead><tr><th>Produto</th><th>Pedida</th><th>Reservado</th><th>Produzido</th><th>Falta</th><th>Ações</th></tr></thead><tbody>';
  Object.values(itens).forEach(item => {
    const reservado = getReservadoCargaAtual(item.produtoId);
    const produzido = item.quantidadeProduzida || 0;
    const falta = getFaltaCargaAtual(item);
    const completo = falta <= 0;
    const rowClass = completo ? 'completo' : (falta <= 5 ? 'pendente' : '');
    h += `<tr class="${rowClass}">
      <td><strong>${item.nome}</strong>${completo ? ' ✅' : ''}</td>
      <td>${item.quantidadePedida}</td>
      <td class="valor-reservado">${reservado}</td>
      <td class="valor-produzido">${produzido}</td>
      <td class="${completo ? 'valor-completo' : 'valor-falta'}">${completo ? '0 ✅' : falta}</td>
      <td>
        ${!completo ? `<button class="btn btn-xs btn-warning" onclick="registrarProducaoCarga('${item.produtoId}')" style="margin-right:3px;">🏭 Produzir</button>` : ''}
        <button class="btn btn-xs btn-info" onclick="editarQuantidadeCarga('${item.produtoId}')" style="margin-right:3px;">✏️</button>
        <button class="btn btn-xs btn-danger" onclick="removerProdutoPedidoCarga('${item.produtoId}')">🗑️</button>
      </td>
    </tr>`;
  });
  h += '</tbody></table>';
  return h;
}

function renderizarTotaisCarga(itens) {
  let tp = 0, tReservado = 0, tProduzido = 0, tFalta = 0;
  Object.values(itens).forEach(i => {
    tp++;
    tReservado += getReservadoCargaAtual(i.produtoId);
    tProduzido += i.quantidadeProduzida || 0;
    tFalta += getFaltaCargaAtual(i);
  });
  const completo = tFalta === 0 && tp > 0;
  return `
    <div class="pedido-carga-totais">
      <div class="total-box"><div class="total-numero">${tp}</div><div class="total-label">Produtos</div></div>
      <div class="total-box reservado"><div class="total-numero">${tReservado}</div><div class="total-label">Reservado</div></div>
      <div class="total-box produzido"><div class="total-numero">${tProduzido}</div><div class="total-label">Produzido</div></div>
      <div class="total-box ${completo ? 'completo' : 'falta'}"><div class="total-numero">${completo ? '✅ 0' : tFalta}</div><div class="total-label">Falta</div></div>
    </div>
    ${completo ? '<div class="aviso-completo">🎉 PEDIDO COMPLETO! Clique em "Finalizar Pedido" para baixar das prateleiras.</div>' : ''}
  `;
}

function atualizarPedidoCarga() {
  carregarPedidoCarga();
  if (state.pedidoCargaAtual.ativo) renderizarCargaAtiva();
  else montarPedidoCarga();
}

function adicionarProdutoPedidoCarga() {
  const pid = document.getElementById('produtoPedidoCargaSelect').value;
  const q = parseInt(document.getElementById('qtdPedidoCarga').value);
  if (!pid || !q || q <= 0) { mostrarToast('❌ Selecione produto e quantidade!', 'error'); return; }
  const produto = state.produtos.find(p => p.id === pid);
  if (!produto) return;

  if (!state.pedidoCargaAtual.ativo) { mostrarToast('❌ Crie um pedido primeiro!', 'error'); return; }

  salvarEstadoParaUndo();

  if (state.pedidoCargaAtual.itens[pid]) {
    state.pedidoCargaAtual.itens[pid].quantidadePedida += q;
  } else {
    state.pedidoCargaAtual.itens[pid] = {
      produtoId: pid,
      nome: produto.nome,
      codigoInterno: produto.codigoInterno || '',
      quantidadePedida: q,
      quantidadeProduzida: 0
    };
  }

  const item = state.pedidoCargaAtual.itens[pid];
  const falta = getFaltaCargaAtual(item);
  let restante = falta;
  if (restante > 0) {
    const disp = buscarDisponibilidadeProduto(pid);
    disp.locais.forEach(l => {
      if (restante <= 0) return;
      const qr = Math.min(restante, l.disponivel);
      if (qr > 0) {
        state.carga.push({
          uid: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          id: pid, quantidade: qr,
          prateleira: l.prateleiraId, posicao: l.posicao,
          pedidoCodigo: CARGA_PEDIDO_TAG
        });
        restante -= qr;
      }
    });
  }

  saveData();
  salvarPedidoCarga();
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarPedidoCarga();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();

  const reservado = getReservadoCargaAtual(pid);
  const produzir = Math.max(0, item.quantidadePedida - reservado - (item.quantidadeProduzida || 0));
  if (produzir > 0) mostrarToast(`✅ Adicionado! Reservado: ${reservado} · Falta produzir: ${produzir}`, 'success');
  else mostrarToast('✅ Adicionado e completamente reservado!', 'success');
}

function removerProdutoPedidoCarga(produtoId) {
  if (!state.pedidoCargaAtual.itens[produtoId]) return;
  salvarEstadoParaUndo();
  state.carga = state.carga.filter(c => !(c.id === produtoId && c.pedidoCodigo === CARGA_PEDIDO_TAG));
  delete state.pedidoCargaAtual.itens[produtoId];
  setData(STORAGE_KEYS.carga, state.carga);
  salvarPedidoCarga();
  atualizarPedidoCarga();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('🗑️ Removido!', 'warning');
}

function registrarProducaoCarga(produtoId) {
  const item = state.pedidoCargaAtual.itens[produtoId];
  if (!item) { mostrarToast('❌ Item não está no pedido!', 'error'); return; }

  const reservado = getReservadoCargaAtual(produtoId);
  const falta = getFaltaCargaAtual(item);
  if (falta <= 0) { mostrarToast('✅ Este item já está completo!', 'success'); return; }

  const resp = prompt(
    `🏭 Registrar produção de "${item.nome}"\n\n` +
    `Pedida: ${item.quantidadePedida} cx\n` +
    `Reservada (prateleira): ${reservado} cx\n` +
    `Já produzida: ${item.quantidadeProduzida || 0} cx\n` +
    `Falta produzir: ${falta} cx\n\n` +
    `Quantas caixas você produziu?`,
    falta
  );
  if (resp === null) return;
  let q = parseInt(resp);
  if (isNaN(q) || q <= 0) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }
  q = Math.min(q, falta);

  const ins = verificarInsumosSuficientes(produtoId, q);
  if (!ins.caixasSuficientes || !ins.embalagensSuficientes) {
    let m = `⚠️ INSUMOS INSUFICIENTES!\n\n`;
    if (!ins.caixasSuficientes) m += `📦 Faltam ${ins.necessario.caixas - ins.disponivel.caixas} caixas Modelo ${ins.necessario.modeloCaixa}\n`;
    if (!ins.embalagensSuficientes) m += `🛍️ Faltam ${ins.necessario.embalagens - ins.disponivel.embalagens} embalagens\n`;
    m += '\nContinuar mesmo assim?';
    if (!confirm(m)) return;
  }

  salvarEstadoParaUndo();
  const desc = descontarInsumos(produtoId, q);
  item.quantidadeProduzida = (item.quantidadeProduzida || 0) + q;

  registrarHistorico(item.nome, 'Produção para Carga', q,
    `Caixa ${desc.modeloCaixa}: -${desc.caixas} | ${desc.usa40x50 ? '40x50' : 'Emb'}: -${desc.embalagens}`);

  saveData();
  salvarPedidoCarga();
  salvarInsumos();
  atualizarPedidoCarga();
  atualizarDashboard();
  renderizarInsumos();
  mostrarToast(`✅ ${q} caixas produzidas! Insumos descontados.`, 'success');
}

function editarQuantidadeCarga(produtoId) {
  const item = state.pedidoCargaAtual.itens[produtoId];
  if (!item) return;
  const reservado = getReservadoCargaAtual(produtoId);
  const produzido = item.quantidadeProduzida || 0;
  const minPedida = reservado + produzido;

  const resp = prompt(
    `✏️ Editar quantidade de "${item.nome}"\n\n` +
    `Pedida atual: ${item.quantidadePedida} cx\n` +
    `Já reservado: ${reservado} cx\n` +
    `Já produzido: ${produzido} cx\n\n` +
    `Nova quantidade pedida (mínimo ${minPedida}):`,
    item.quantidadePedida
  );
  if (resp === null) return;
  const q = parseInt(resp);
  if (isNaN(q) || q < minPedida) {
    mostrarToast(`❌ Valor inválido! Mínimo: ${minPedida}`, 'error');
    return;
  }
  salvarEstadoParaUndo();
  item.quantidadePedida = q;
  salvarPedidoCarga();
  atualizarPedidoCarga();
  mostrarToast('✅ Quantidade atualizada!', 'success');
}

function finalizarPedidoCargaCompleto() {
  if (!state.pedidoCargaAtual.ativo) { mostrarToast('❌ Nenhum pedido de carga ativo!', 'error'); return; }
  const itens = Object.values(state.pedidoCargaAtual.itens || {});
  if (itens.length === 0) { mostrarToast('❌ Pedido vazio!', 'error'); return; }

  const incompletos = itens.filter(i => getFaltaCargaAtual(i) > 0);
  if (incompletos.length > 0) {
    const msg = `⚠️ Existem ${incompletos.length} item(ns) com falta:\n\n` +
      incompletos.map(i => `• ${i.nome}: falta ${getFaltaCargaAtual(i)} cx`).join('\n') +
      `\n\nFinalizar mesmo assim? (as reservas serão baixadas das prateleiras)`;
    if (!confirm(msg)) return;
  } else {
    if (!confirm('✅ Pedido completo! Finalizar agora?\n\nAs reservas serão baixadas das prateleiras.')) return;
  }

  salvarEstadoParaUndo();

  const reservas = state.carga.filter(c => c.pedidoCodigo === CARGA_PEDIDO_TAG);
  reservas.forEach(item => {
    const s = state.prateleiras.find(x => x.id === item.prateleira);
    if (s) {
      const idx = s.produtos.findIndex(p => p.id === item.id && p.posicao === item.posicao);
      if (idx !== -1) {
        s.produtos[idx].quantidade -= item.quantidade;
        if (s.produtos[idx].quantidade <= 0) s.produtos.splice(idx, 1);
      }
    }
    const produto = state.produtos.find(p => p.id === item.id);
    if (produto) produto.quantidade = Math.max(0, (produto.quantidade || 0) - item.quantidade);
  });

  state.carga = state.carga.filter(c => c.pedidoCodigo !== CARGA_PEDIDO_TAG);

  const codigo = state.pedidoCargaAtual.codigo || 'CARGA';
  const totalPedida = itens.reduce((a, i) => a + i.quantidadePedida, 0);
  registrarHistorico(`Pedido ${codigo}`, 'Carga Finalizada', totalPedida,
    `Itens: ${itens.map(i => `${i.nome}: ${i.quantidadePedida} cx`).join(', ')}`);

  state.pedidoCargaAtual = { ativo: false, codigo: '', itens: {} };
  salvarPedidoCarga();
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  setData(STORAGE_KEYS.produtos, state.produtos);
  setData(STORAGE_KEYS.carga, state.carga);

  atualizarPedidoCarga();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('🚛 Pedido de carga finalizado!', 'success');
}

function cancelarPedidoCarga() {
  if (!state.pedidoCargaAtual.ativo) return;
  if (!confirm('⚠️ Cancelar o pedido de carga? As reservas da carga serão liberadas.')) return;
  salvarEstadoParaUndo();
  state.carga = state.carga.filter(c => c.pedidoCodigo !== CARGA_PEDIDO_TAG);
  state.pedidoCargaAtual = { ativo: false, codigo: '', itens: {} };
  salvarPedidoCarga();
  setData(STORAGE_KEYS.carga, state.carga);
  atualizarPedidoCarga();
  carregarPrateleiras();
  carregarCarga();
  atualizarDashboard();
  mostrarToast('🗑️ Pedido cancelado!', 'warning');
}

// ===== AUXILIARES =====
function buscarDisponibilidadeProduto(produtoId) {
  const locais = [];
  let total = 0;
  state.prateleiras.forEach(pr => {
    pr.produtos.forEach(pos => {
      if (pos.id === produtoId && pos.quantidade > 0) {
        const res = state.carga
          .filter(c => c.id === produtoId && c.prateleira === pr.id && c.posicao === pos.posicao && !c.pedidoCodigo)
          .reduce((a, c) => a + c.quantidade, 0);
        const disp = pos.quantidade - res;
        if (disp > 0) {
          locais.push({ prateleiraId: pr.id, prateleiraNome: pr.nome, posicao: pos.posicao, quantidadeTotal: pos.quantidade, reservado: res, disponivel: disp });
          total += disp;
        }
      }
    });
  });
  return { locais, totalDisponivel: total };
}

function exportarPedidoCarga() {
  if (!state.pedidoCargaAtual.ativo || !state.pedidoCargaAtual.itens) return;
  const dados = Object.values(state.pedidoCargaAtual.itens).map(i => {
    const res = getReservadoCargaAtual(i.produtoId);
    const prod = i.quantidadeProduzida || 0;
    return { 'Produto': i.nome, 'Código': i.codigoInterno, 'Pedida': i.quantidadePedida, 'Reservado': res, 'Produzido': prod, 'Falta': Math.max(0, i.quantidadePedida - res - prod) };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dados);
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido Carga');
  XLSX.writeFile(wb, `pedido_carga_${new Date().toISOString().split('T')[0]}.xlsx`);
  mostrarToast('📥 Exportado!', 'success');
}

function getProductLocations(produtoId) {
  const locais = [];
  state.prateleiras.forEach(pr => {
    pr.produtos.forEach(pos => {
      if (pos.id === produtoId && pos.quantidade > 0) {
        locais.push({ prateleira: pr.nome, posicao: pos.posicao, quantidade: pos.quantidade });
      }
    });
  });
  locais.sort((a, b) => a.prateleira.localeCompare(b.prateleira) || parseInt(a.posicao) - parseInt(b.posicao));
  return locais;
}

function atualizarTudo() {
  carregarPrateleiras();
  carregarProdutos();
  carregarCarga();
  carregarHistorico();
  atualizarDashboard();
  atualizarSelects();
  atualizarGrafico();
  renderizarInsumos();
  renderizarInjecao();
  renderizarInjetar();
  renderizarInjetando();
  renderizarInjetados();
  renderizarMateriaPrima();
  saveData();
}

// ===== PRATELEIRAS PADRÃO =====
function criarPrateleirasPadrao() {
  state.prateleiras = [
    { id: 'A', nome: 'A', cor: '#FF6B6B', numPosicoes: 12, produtos: [], codigoBarras: 'PRAT-A' },
    { id: 'B', nome: 'B', cor: '#4ECDC4', numPosicoes: 12, produtos: [], codigoBarras: 'PRAT-B' },
    { id: 'C', nome: 'C', cor: '#45B7D1', numPosicoes: 12, produtos: [], codigoBarras: 'PRAT-C' },
    { id: 'D', nome: 'D', cor: '#96CEB4', numPosicoes: 12, produtos: [], codigoBarras: 'PRAT-D' }
  ];
  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
}

function criarProdutosExemplo() {
  const base = [
    { id: 'p1', nome: 'Parafuso 3x20', codigoInterno: 'PARAF01', pacotesPorVolume: 50, quantidade: 0, barcode: '' },
    { id: 'p2', nome: 'Porca M8', codigoInterno: 'PORCA02', pacotesPorVolume: 100, quantidade: 0, barcode: '' },
    { id: 'p3', nome: 'Arruela 1/2', codigoInterno: 'ARRU03', pacotesPorVolume: 200, quantidade: 0, barcode: '' },
    { id: 'p4', nome: 'Martelo 500g', codigoInterno: 'MARTE04', pacotesPorVolume: 20, quantidade: 0, barcode: '' },
    { id: 'p5', nome: 'CP1-100', codigoInterno: 'CP1-100', pacotesPorVolume: 25, quantidade: 0, barcode: '' },
    { id: 'p6', nome: 'CPP1-500', codigoInterno: 'CPP1-500', pacotesPorVolume: 5, quantidade: 0, barcode: '' }
  ];
  base.forEach(n => { if (!state.produtos.some(p => p.codigoInterno === n.codigoInterno)) state.produtos.push(n); });
  setData(STORAGE_KEYS.produtos, state.produtos);
}

// ===== CÓDIGO DE BARRAS DAS PRATELEIRAS =====
function gerarCodigoPrateleira(id) { return `PRAT-${id}`; }

function atualizarCodigosPrateleiras() {
  let alt = false;
  state.prateleiras.forEach(p => {
    if (!p.codigoBarras) { p.codigoBarras = gerarCodigoPrateleira(p.id); alt = true; }
  });
  if (alt) setData(STORAGE_KEYS.prateleiras, state.prateleiras);
}

function imprimirEtiquetas() {
  atualizarCodigosPrateleiras();
  let html = `<html><head><title>Etiquetas</title><style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .etiqueta { display: inline-block; border: 1px solid #000; padding: 15px; margin: 10px; text-align: center; width: 200px; }
    .etiqueta .nome { font-weight: bold; font-size: 18px; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <h2>Etiquetas de Prateleiras</h2>
  <button class="no-print" onclick="window.print()">Imprimir</button><div>`;
  state.prateleiras.forEach(p => {
    const c = p.codigoBarras || gerarCodigoPrateleira(p.id);
    html += `<div class="etiqueta"><div class="nome">${p.nome}</div>
      <svg id="barcode-${p.id}"></svg><div>${c}</div></div>
      <script>JsBarcode("#barcode-${p.id}", "${c}", {format:"CODE128", width:2, height:50, displayValue:false});<\/script>`;
  });
  html += '</div></body></html>';
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ===== MOVIMENTAÇÃO =====
let movimentacaoOrigem = null;
let movimentacaoDestino = null;

function abrirMovimentacao() {
  movimentacaoOrigem = null; movimentacaoDestino = null;
  document.getElementById('movOrigemInput').value = '';
  document.getElementById('movPosicoesOrigem').innerHTML = '';
  document.getElementById('movDestinoContainer').style.display = 'none';
  document.getElementById('modalMovimentacao').style.display = 'flex';
}

function closeModalMovimentacao() {
  document.getElementById('modalMovimentacao').style.display = 'none';
  movimentacaoOrigem = null; movimentacaoDestino = null;
}

function buscarPosicoesOrigem() {
  const cod = document.getElementById('movOrigemInput').value.trim().toUpperCase();
  if (!cod) { mostrarToast('❌ Digite o código!', 'error'); return; }
  const p = state.prateleiras.find(x => (x.codigoBarras && x.codigoBarras.toUpperCase() === cod) || x.id.toUpperCase() === cod || x.nome.toUpperCase() === cod);
  if (!p) { mostrarToast('❌ Prateleira não encontrada!', 'error'); return; }
  movimentacaoOrigem = p;
  const c = document.getElementById('movPosicoesOrigem');
  c.innerHTML = '<h4 style="color:var(--text);">Selecione a origem:</h4>';
  p.produtos.forEach(pos => {
    const prod = state.produtos.find(x => x.id === pos.id);
    c.innerHTML += `<div style="border:1px solid var(--border); border-radius:6px; padding:8px; margin-bottom:6px;color:var(--text);background:var(--bg-subtle);">
      <input type="radio" name="movPosicaoOrigem" value="${pos.posicao}" data-produto="${pos.id}" data-quantidade="${pos.quantidade}">
      <strong>Posição ${pos.posicao}</strong> - ${prod ? prod.nome : '?'} (${pos.quantidade} cx)</div>`;
  });
  document.getElementById('movDestinoContainer').style.display = 'block';
}

function buscarPosicoesDestino() {
  const cod = document.getElementById('movDestinoInput').value.trim().toUpperCase();
  if (!cod) { mostrarToast('❌ Digite o código!', 'error'); return; }
  const p = state.prateleiras.find(x => (x.codigoBarras && x.codigoBarras.toUpperCase() === cod) || x.id.toUpperCase() === cod || x.nome.toUpperCase() === cod);
  if (!p) { mostrarToast('❌ Prateleira destino não encontrada!', 'error'); return; }
  movimentacaoDestino = p;
  const c = document.getElementById('movPosicoesDestino');
  c.innerHTML = '<h4 style="color:var(--text);">Selecione o destino:</h4>';
  const ocup = p.produtos.map(x => x.posicao);
  const sel = document.querySelector('input[name="movPosicaoOrigem"]:checked');
  const pid = sel ? sel.dataset.produto : null;
  for (let i = 1; i <= (p.numPosicoes || 12); i++) {
    const posStr = i.toString();
    const isOcup = ocup.includes(posStr);
    const prodPos = p.produtos.find(x => x.posicao === posStr);
    const pode = !isOcup || (prodPos && prodPos.id === pid);
    if (!pode) continue;
    c.innerHTML += `<div style="border:1px solid var(--border); border-radius:6px; padding:8px; margin-bottom:6px;color:var(--text);background:var(--bg-subtle);">
      <input type="radio" name="movPosicaoDestino" value="${posStr}" ${isOcup ? 'disabled' : ''}>
      <strong>Posição ${i}</strong> ${isOcup ? '(ocupada)' : '(vazia)'}</div>`;
  }
}

function confirmarMovimentacao() {
  const so = document.querySelector('input[name="movPosicaoOrigem"]:checked');
  const sd = document.querySelector('input[name="movPosicaoDestino"]:checked');
  const qStr = prompt('Quantidade a movimentar?', '1');
  if (!so || !sd || !qStr) { mostrarToast('❌ Preencha tudo!', 'error'); return; }
  const q = parseInt(qStr);
  if (!q || q <= 0) { mostrarToast('❌ Quantidade inválida!', 'error'); return; }

  const pid = so.dataset.produto;
  const po = so.value;
  const qo = parseInt(so.dataset.quantidade);
  const pd = sd.value;

  if (q > qo) { mostrarToast('❌ Qtd maior que disponível!', 'error'); return; }
  const pro = movimentacaoOrigem;
  const pde = movimentacaoDestino;
  if (!pro || !pde) { mostrarToast('❌ Selecione prateleiras!', 'error'); return; }
  if (pro.id === pde.id && po === pd) { mostrarToast('❌ Origem = destino!', 'error'); return; }

  const itemDest = pde.produtos.find(x => x.posicao === pd);
  if (itemDest && itemDest.id !== pid) { mostrarToast('❌ Destino ocupado por outro produto!', 'error'); return; }

  salvarEstadoParaUndo();
  const itemOrig = pro.produtos.find(x => x.id === pid && x.posicao === po);
  itemOrig.quantidade -= q;
  if (itemOrig.quantidade <= 0) {
    pro.produtos = pro.produtos.filter(x => !(x.id === pid && x.posicao === po));
  }
  if (itemDest) itemDest.quantidade += q;
  else pde.produtos.push({ id: pid, posicao: pd, quantidade: q, cor: '#FFFFFF', modeloCaixa: itemOrig.modeloCaixa || 'A' });

  setData(STORAGE_KEYS.prateleiras, state.prateleiras);
  registrarHistorico(state.produtos.find(x => x.id === pid)?.nome || 'Produto', 'Movimentação', q, `De ${pro.nome}-${po} para ${pde.nome}-${pd}`);
  closeModalMovimentacao();
  atualizarTudo();
  mostrarToast('✅ Movimentado!', 'success');
}

// ============================================================
// EXPORTAÇÃO PDF (jsPDF + autoTable)
// ============================================================

function getJSDateStr() {
  return new Date().toLocaleString('pt-BR');
}
function getJSDateSlug() {
  return new Date().toISOString().split('T')[0];
}

// ===== Sanitização de texto pra PDF =====
function sanitizarParaPDF(texto) {
  if (texto === null || texto === undefined) return '';
  let s = String(texto);

  s = s.replace(/♻️?/g, '(REC)');
  s = s.replace(/⚠️?/g, '!');
  s = s.replace(/✅ ?/g, '');
  s = s.replace(/🛍️?/g, '');
  s = s.replace(/📦/g, '');
  s = s.replace(/📋/g, '');
  s = s.replace(/📄/g, '');
  s = s.replace(/🚛/g, '');
  s = s.replace(/📊/g, '');
  s = s.replace(/💉/g, '');
  s = s.replace(/👥/g, '');
  s = s.replace(/⏸️?/g, '');
  s = s.replace(/▶️?/g, '');
  s = s.replace(/⏳/g, '');
  s = s.replace(/🎉/g, '');
  s = s.replace(/💡/g, '');
  s = s.replace(/🔔/g, '');
  s = s.replace(/📭/g, '');
  s = s.replace(/🔄/g, '');
  s = s.replace(/🔍/g, '');
  s = s.replace(/👑/g, '');
  s = s.replace(/👤/g, '');

  s = s.replace(/[^\x00-\xFF]/g, '');
  s = s.replace(/&/g, '&amp;');
  s = s.replace(/</g, '&lt;');
  s = s.replace(/>/g, '&gt;');

  return s.trim();
}

// Wrapper do autoTable que sanitiza automaticamente
function autoTableSeguro(doc, options) {
  const opts = Object.assign({}, options);
  if (opts.head) opts.head = opts.head.map(row => row.map(cell => sanitizarParaPDF(cell)));
  if (opts.body) opts.body = opts.body.map(row => row.map(cell => sanitizarParaPDF(cell)));
  if (opts.foot) opts.foot = opts.foot.map(row => row.map(cell => sanitizarParaPDF(cell)));
  return doc.autoTable(opts);
}

// ===== PDF: ESTOQUE =====
function exportarEstoquePDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(26, 43, 76);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio de Estoque', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  const totalProdutos = state.produtos.length;
  const totalUnidades = state.produtos.reduce((a, p) => a + (p.quantidade || 0), 0);
  const comEstoque = state.produtos.filter(p => (p.quantidade || 0) > 0).length;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de produtos cadastrados: ${totalProdutos}`, 14, 40);
  doc.text(`Produtos com estoque: ${comEstoque}`, 14, 46);
  doc.text(`Total de unidades no estoque: ${totalUnidades}`, 14, 52);

  let yOffset = 60;
  state.prateleiras.forEach(shelf => {
    const produtosShelf = shelf.produtos || [];
    if (produtosShelf.length === 0) return;

    doc.setFillColor(240, 242, 245);
    doc.rect(14, yOffset - 5, 182, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 43, 76);
    doc.text(sanitizarParaPDF(`Prateleira ${shelf.nome}`), 16, yOffset);
    yOffset += 2;

    const linhas = produtosShelf
      .sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao))
      .map(p => {
        const prod = state.produtos.find(x => x.id === p.id);
        return [
          `Posicao ${p.posicao}`,
          prod ? prod.nome : '(removido)',
          prod ? (prod.codigoInterno || '-') : '-',
          String(p.quantidade),
          p.modeloCaixa ? `Caixa ${p.modeloCaixa}` : '-'
        ];
      });

    autoTableSeguro(doc, {
      startY: yOffset + 3,
      head: [['Posicao', 'Produto', 'Codigo', 'Qtd (cx)', 'Caixa']],
      body: linhas,
      theme: 'grid',
      headStyles: { fillColor: [26, 43, 76], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 30 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    yOffset = doc.lastAutoTable.finalY + 10;
    if (yOffset > 250) { doc.addPage(); yOffset = 20; }
  });

  const semEstoque = state.produtos.filter(p => !getProductLocations(p.id).length);
  if (semEstoque.length > 0) {
    if (yOffset > 220) { doc.addPage(); yOffset = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(sanitizarParaPDF('Produtos sem localizacao definida'), 14, yOffset);
    yOffset += 3;

    const linhas = semEstoque.map(p => [p.nome, p.codigoInterno || '-', String(p.quantidade || 0)]);

    autoTableSeguro(doc, {
      startY: yOffset + 3,
      head: [['Produto', 'Codigo', 'Disponivel']],
      body: linhas,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 30 },
      margin: { left: 14, right: 14 },
    });
  }

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync - Sistema de Estoque', 14, 290);
  }

  doc.save(`estoque_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF do estoque gerado!', 'success');
}

// ===== PDF: INSUMOS =====
function exportarInsumosPDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(26, 43, 76);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio de Insumos', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Estoque Consolidado', 14, 42);

  autoTableSeguro(doc, {
    startY: 45,
    head: [['Insumo', 'Estoque', 'Alerta Minimo', 'Situacao']],
    body: [
      ['Caixa Modelo A', String(state.insumos.caixaModeloA), String(state.configInsumos.alertaCaixaModeloA),
        state.insumos.caixaModeloA <= state.configInsumos.alertaCaixaModeloA ? 'BAIXO' : 'OK'],
      ['Caixa Modelo B', String(state.insumos.caixaModeloB), String(state.configInsumos.alertaCaixaModeloB),
        state.insumos.caixaModeloB <= state.configInsumos.alertaCaixaModeloB ? 'BAIXO' : 'OK'],
      ['Embalagem 40x50', String(state.insumos.embalagem40x50 || 0), String(state.configInsumos.alertaEmbalagem40x50),
        (state.insumos.embalagem40x50 || 0) <= state.configInsumos.alertaEmbalagem40x50 ? 'BAIXO' : 'OK'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [26, 43, 76], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: 30 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' } },
  });

  let yOffset = doc.lastAutoTable.finalY + 12;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Configuracao por Produto', 14, yOffset);
  yOffset += 3;

  const linhasProdutos = state.produtos.map(p => {
    const config = state.produtoInsumoMap[p.id] || { modeloCaixa: 'A', embalagemPorCaixa: 25, tipoEmbalagem: 'individual' };
    const usa40 = usaEmbalagem40x50(p);
    const estoque = usa40 ? (state.insumos.embalagem40x50 || 0) : (state.insumos.embalagens[p.id] || 0);
    const alerta = usa40
      ? state.configInsumos.alertaEmbalagem40x50
      : (state.configInsumos.alertaEmbalagemPorProduto?.[p.id] !== undefined ? state.configInsumos.alertaEmbalagemPorProduto[p.id] : state.configInsumos.alertaEmbalagemPadrao);
    const baixo = estoque <= alerta;
    return [
      p.nome,
      `Caixa ${config.modeloCaixa}`,
      usa40 ? '40x50' : 'Individual',
      String(config.embalagemPorCaixa),
      String(estoque),
      String(alerta),
      baixo ? 'BAIXO' : 'OK'
    ];
  });

  autoTableSeguro(doc, {
    startY: yOffset + 3,
    head: [['Produto', 'Caixa', 'Embalagem', 'Emb/cx', 'Estoque', 'Alerta', 'Status']],
    body: linhasProdutos,
    theme: 'grid',
    headStyles: { fillColor: [26, 43, 76], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: 30 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center', fontStyle: 'bold' }
    },
  });

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync - Sistema de Insumos', 14, 290);
  }

  doc.save(`insumos_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF dos insumos gerado!', 'success');
}

// ===== PDF: GRÁFICO =====
function exportarGraficoPDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  if (!state.chart) { mostrarToast('❌ Nenhum gráfico gerado ainda!', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(26, 43, 76);
  doc.rect(0, 0, 297, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio Grafico de Estoque', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  try {
    const imgData = state.chart.toBase64Image('image/png', 1);
    doc.addImage(imgData, 'PNG', 14, 38, 200, 130);
  } catch (e) {
    doc.setTextColor(200, 0, 0);
    doc.text('Nao foi possivel capturar o grafico.', 14, 45);
  }

  const com = state.produtos.filter(p => p.quantidade > 0);
  const totalUnid = com.reduce((a, p) => a + p.quantidade, 0);
  const totalReservado = state.carga.reduce((a, c) => a + c.quantidade, 0);
  const media = com.length > 0 ? Math.round(totalUnid / com.length) : 0;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 43, 76);
  doc.text('Estatisticas', 222, 45);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Produtos com estoque: ${com.length}`, 222, 55);
  doc.text(`Total de unidades: ${totalUnid}`, 222, 62);
  doc.text(`Reservado para carga: ${totalReservado}`, 222, 69);
  doc.text(`Media por produto: ${media}`, 222, 76);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 43, 76);
  doc.text('Detalhamento por Produto', 14, 180);

  const linhas = state.produtos
    .filter(p => (p.quantidade || 0) > 0)
    .sort((a, b) => (b.quantidade || 0) - (a.quantidade || 0))
    .map(p => {
      const locais = getProductLocations(p.id);
      const locStr = locais.map(l => `${l.prateleira}${l.posicao} (${l.quantidade})`).join(', ') || '-';
      return [p.nome, p.codigoInterno || '-', String(p.quantidade || 0), locStr];
    });

  autoTableSeguro(doc, {
    startY: 183,
    head: [['Produto', 'Codigo', 'Qtd', 'Localizacao']],
    body: linhas,
    theme: 'grid',
    headStyles: { fillColor: [26, 43, 76], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: 30 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    columnStyles: { 2: { halign: 'center' } },
  });

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 290, 200, { align: 'right' });
    doc.text('D.Sync - Sistema de Estoque', 14, 200);
  }

  doc.save(`grafico_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF do gráfico gerado!', 'success');
}

// ===== PDF: CARGA (completo) =====
function exportarCargaPDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(26, 43, 76);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio de Carga', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  const reservasCarga = state.carga.filter(c => c.pedidoCodigo === CARGA_PEDIDO_TAG);
  const reservasPedido = state.carga.filter(c => c.pedidoCodigo && c.pedidoCodigo !== CARGA_PEDIDO_TAG);
  const reservasAvulsas = state.carga.filter(c => !c.pedidoCodigo);

  const totalReservas = state.carga.length;
  const totalCx = state.carga.reduce((a, c) => a + c.quantidade, 0);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo Geral', 14, 40);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total de reservas: ${totalReservas}`, 14, 46);
  doc.text(`Total de caixas reservadas: ${totalCx}`, 14, 52);
  doc.text(`Reservas do Pedido de Carga: ${reservasCarga.length}`, 14, 58);
  doc.text(`Reservas de Pedidos de Separacao: ${reservasPedido.length}`, 14, 64);
  doc.text(`Reservas avulsas (sem pedido): ${reservasAvulsas.length}`, 14, 70);

  let yOffset = 78;

  if (state.pedidoCargaAtual.ativo && Object.keys(state.pedidoCargaAtual.itens || {}).length > 0) {
    if (yOffset > 220) { doc.addPage(); yOffset = 20; }

    doc.setFillColor(26, 43, 76);
    doc.rect(14, yOffset - 5, 182, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(sanitizarParaPDF(`Pedido de Carga: ${state.pedidoCargaAtual.codigo}`), 16, yOffset);
    yOffset += 3;

    const itens = Object.values(state.pedidoCargaAtual.itens);
    let totalPedida = 0, totalReservado = 0, totalProduzido = 0, totalFalta = 0;

    const linhas = itens.map(item => {
      const reservado = getReservadoCargaAtual(item.produtoId);
      const produzido = item.quantidadeProduzida || 0;
      const falta = getFaltaCargaAtual(item);
      totalPedida += item.quantidadePedida;
      totalReservado += reservado;
      totalProduzido += produzido;
      totalFalta += falta;
      return [
        item.nome,
        item.codigoInterno || '-',
        String(item.quantidadePedida),
        String(reservado),
        String(produzido),
        String(falta),
        falta === 0 ? 'OK' : 'PENDENTE'
      ];
    });

    linhas.push(['TOTAL', '', String(totalPedida), String(totalReservado), String(totalProduzido), String(totalFalta), totalFalta === 0 ? 'OK' : '']);

    autoTableSeguro(doc, {
      startY: yOffset + 3,
      head: [['Produto', 'Codigo', 'Pedida', 'Reserv.', 'Produz.', 'Falta', 'Status']],
      body: linhas,
      theme: 'grid',
      headStyles: { fillColor: [26, 43, 76], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: 30 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        2: { halign: 'center' }, 3: { halign: 'center' },
        4: { halign: 'center' }, 5: { halign: 'center' },
        6: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: function(data) {
        if (data.row.index === linhas.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 242, 245];
        }
        if (data.column.index === 5 && data.row.index !== linhas.length - 1) {
          const valor = parseInt(data.cell.raw);
          if (!isNaN(valor) && valor > 0) { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
          else if (valor === 0) { data.cell.styles.textColor = [16, 185, 129]; }
        }
        if (data.column.index === 6 && data.row.index !== linhas.length - 1) {
          const txt = String(data.cell.raw);
          if (txt === 'PENDENTE') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
          else if (txt === 'OK') { data.cell.styles.textColor = [16, 185, 129]; data.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    yOffset = doc.lastAutoTable.finalY + 12;
  }

  const pedidosComReserva = {};
  reservasPedido.forEach(r => {
    if (!pedidosComReserva[r.pedidoCodigo]) pedidosComReserva[r.pedidoCodigo] = [];
    pedidosComReserva[r.pedidoCodigo].push(r);
  });

  Object.entries(pedidosComReserva).forEach(([codigoPedido, reservas]) => {
    if (yOffset > 220) { doc.addPage(); yOffset = 20; }

    doc.setFillColor(5, 150, 105);
    doc.rect(14, yOffset - 5, 182, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(sanitizarParaPDF(`Pedido de Separacao: ${codigoPedido}`), 16, yOffset);
    yOffset += 3;

    const porProduto = {};
    reservas.forEach(r => {
      if (!porProduto[r.id]) {
        const prod = state.produtos.find(p => p.id === r.id);
        porProduto[r.id] = {
          nome: prod ? prod.nome : '(removido)',
          codigo: prod ? (prod.codigoInterno || '-') : '-',
          reservada: 0,
          locais: []
        };
      }
      porProduto[r.id].reservada += r.quantidade;
      const nomePrat = state.prateleiras.find(s => s.id === r.prateleira)?.nome || '?';
      porProduto[r.id].locais.push(`${nomePrat}${r.posicao}(${r.quantidade})`);
    });

    const pedidoSalvo = state.pedidosSeparar.find(p => p.codigo === codigoPedido);

    const linhas = Object.entries(porProduto).map(([pid, dados]) => {
      const itemPedido = pedidoSalvo?.itens?.[pid];
      const pedida = itemPedido ? itemPedido.pacotes : dados.reservada;
      const falta = Math.max(0, pedida - dados.reservada);
      return [
        dados.nome,
        dados.codigo,
        String(pedida),
        String(dados.reservada),
        String(falta),
        dados.locais.join(', ')
      ];
    });

    autoTableSeguro(doc, {
      startY: yOffset + 3,
      head: [['Produto', 'Codigo', 'Pedida', 'Reserv.', 'Falta', 'Local']],
      body: linhas,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: 30 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: function(data) {
        if (data.column.index === 4) {
          const valor = parseInt(data.cell.raw);
          if (!isNaN(valor) && valor > 0) { data.cell.styles.textColor = [220, 38, 38]; }
          else if (valor === 0) { data.cell.styles.textColor = [16, 185, 129]; }
        }
      }
    });

    yOffset = doc.lastAutoTable.finalY + 12;
  });

  if (reservasAvulsas.length > 0) {
    if (yOffset > 220) { doc.addPage(); yOffset = 20; }

    doc.setFillColor(245, 158, 11);
    doc.rect(14, yOffset - 5, 182, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Reservas Avulsas (sem pedido)', 16, yOffset);
    yOffset += 3;

    const linhas = reservasAvulsas.map(item => {
      const produto = state.produtos.find(p => p.id === item.id);
      const nomePrat = state.prateleiras.find(s => s.id === item.prateleira)?.nome || '?';
      const local = item.prateleira && item.posicao ? `${nomePrat}${item.posicao}` : '-';
      return [
        produto ? produto.nome : '(removido)',
        produto ? (produto.codigoInterno || '-') : '-',
        String(item.quantidade),
        local
      ];
    });

    autoTableSeguro(doc, {
      startY: yOffset + 3,
      head: [['Produto', 'Codigo', 'Qtd (cx)', 'Local']],
      body: linhas,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: 30 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' } }
    });

    yOffset = doc.lastAutoTable.finalY + 12;
  }

  if (totalReservas === 0) {
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(11);
    doc.text('Nenhuma reserva de carga no momento.', 14, yOffset);
  }

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync - Sistema de Carga', 14, 290);
  }

  doc.save(`carga_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF da carga gerado!', 'success');
}

// ===== PDF: PEDIDOS PARA SEPARAR =====
function exportarPedidosSepararPDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Pedidos para Separar', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  const total = state.pedidosSeparar.length;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de pedidos pendentes: ${total}`, 14, 40);

  if (total === 0) {
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(11);
    doc.text('Nenhum pedido pendente no momento.', 14, 52);
  } else {
    let yOffset = 48;
    state.pedidosSeparar.forEach((pedido) => {
      if (yOffset > 240) { doc.addPage(); yOffset = 20; }

      doc.setFillColor(240, 253, 244);
      doc.rect(14, yOffset - 5, 182, 8, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text(sanitizarParaPDF(`Pedido: ${pedido.codigo}`), 16, yOffset);
      yOffset += 2;

      const totalCx = Object.values(pedido.itens).reduce((a, i) => a + i.pacotes, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Criado em: ${pedido.dataCriacao || '-'} - Total: ${totalCx} caixas`, 16, yOffset + 4);
      yOffset += 5;

      const linhas = Object.values(pedido.itens).map(item => {
        const res = state.carga
          .filter(c => c.id === item.produtoId && c.pedidoCodigo === pedido.codigo)
          .reduce((a, c) => a + c.quantidade, 0);
        const falta = Math.max(0, item.pacotes - res);
        return [
          item.nome,
          item.codigoInterno || '-',
          String(item.pacotes),
          String(res),
          String(falta),
          falta === 0 ? 'OK' : 'FALTANDO'
        ];
      });

      autoTableSeguro(doc, {
        startY: yOffset + 3,
        head: [['Produto', 'Codigo', 'Pedido', 'Reservado', 'Falta', 'Status']],
        body: linhas,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5, textColor: 30 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          2: { halign: 'center' }, 3: { halign: 'center' },
          4: { halign: 'center' }, 5: { halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
          if (data.column.index === 5 && data.row.index >= 0) {
            const txt = String(data.cell.raw);
            if (txt === 'FALTANDO') { data.cell.styles.textColor = [220, 38, 38]; }
            else if (txt === 'OK') { data.cell.styles.textColor = [16, 185, 129]; }
          }
        }
      });

      yOffset = doc.lastAutoTable.finalY + 12;
    });
  }

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync - Pedidos para Separar', 14, 290);
  }

  doc.save(`pedidos_separar_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF dos pedidos gerado!', 'success');
}

// ===== PDF: PEDIDOS FINALIZADOS =====
function exportarPedidosFinalizadosPDF() {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(71, 85, 105);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Pedidos Finalizados', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  const total = state.pedidosFinalizados.length;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de pedidos finalizados: ${total}`, 14, 40);

  if (total === 0) {
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(11);
    doc.text('Nenhum pedido finalizado ainda.', 14, 52);
  } else {
    let yOffset = 48;
    const ordenados = [...state.pedidosFinalizados].reverse();
    ordenados.forEach(pedido => {
      if (yOffset > 240) { doc.addPage(); yOffset = 20; }

      doc.setFillColor(241, 245, 249);
      doc.rect(14, yOffset - 5, 182, 8, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(sanitizarParaPDF(`Pedido: ${pedido.codigo}`), 16, yOffset);
      yOffset += 2;

      const totalCx = Object.values(pedido.itens).reduce((a, i) => a + i.pacotes, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Finalizado em: ${pedido.dataFinalizacao || '-'} - Total: ${totalCx} caixas`, 16, yOffset + 4);
      yOffset += 5;

      const linhas = Object.values(pedido.itens).map(item => [
        item.nome,
        item.codigoInterno || '-',
        String(item.pacotes)
      ]);

      autoTableSeguro(doc, {
        startY: yOffset + 3,
        head: [['Produto', 'Codigo', 'Qtd (cx)']],
        body: linhas,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5, textColor: 30 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
        columnStyles: { 2: { halign: 'center' } },
      });

      yOffset = doc.lastAutoTable.finalY + 12;
    });
  }

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync - Pedidos Finalizados', 14, 290);
  }

  doc.save(`pedidos_finalizados_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF dos finalizados gerado!', 'success');
}

// ===== PDF: PEDIDO INDIVIDUAL =====
function exportarPedidoIndividualPDF(codigo, tipo) {
  if (!window.jspdf) { mostrarToast('❌ Biblioteca PDF ainda carregando...', 'error'); return; }
  const lista = tipo === 'finalizado' ? state.pedidosFinalizados : state.pedidosSeparar;
  const pedido = lista.find(p => p.codigo === codigo);
  if (!pedido) { mostrarToast('❌ Pedido não encontrado!', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const corFundo = tipo === 'finalizado' ? [71, 85, 105] : [5, 150, 105];
  doc.setFillColor(...corFundo);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('D.Sync', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(tipo === 'finalizado' ? 'Pedido Finalizado' : 'Pedido de Separacao', 14, 19);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text(`Emitido em: ${getJSDateStr()}`, 14, 32);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...corFundo);
  doc.text(sanitizarParaPDF(`Pedido: ${pedido.codigo}`), 14, 44);

  const totalCx = Object.values(pedido.itens).reduce((a, i) => a + i.pacotes, 0);
  const totalVol = Object.values(pedido.itens).reduce((a, i) => a + i.caixas, 0);
  const totalItens = Object.values(pedido.itens).length;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Criado em: ${pedido.dataCriacao || '-'}`, 14, 52);
  if (tipo === 'finalizado') {
    doc.text(`Finalizado em: ${pedido.dataFinalizacao || '-'}`, 14, 58);
  }
  doc.text(`Itens diferentes: ${totalItens}`, 14, tipo === 'finalizado' ? 64 : 58);
  doc.text(`Total de volumes (caixas): ${totalVol}`, 14, tipo === 'finalizado' ? 70 : 64);
  doc.text(`Total de caixas pedidas: ${totalCx}`, 14, tipo === 'finalizado' ? 76 : 70);

  const linhas = Object.values(pedido.itens).map(item => {
    if (tipo === 'finalizado') {
      return [item.nome, item.codigoInterno || '-', String(item.pacotes)];
    }
    const res = state.carga
      .filter(c => c.id === item.produtoId && c.pedidoCodigo === pedido.codigo)
      .reduce((a, c) => a + c.quantidade, 0);
    const falta = Math.max(0, item.pacotes - res);
    return [
      item.nome,
      item.codigoInterno || '-',
      String(item.pacotes),
      String(res),
      String(falta),
      falta === 0 ? 'OK' : 'FALTANDO'
    ];
  });

  const headers = tipo === 'finalizado'
    ? [['Produto', 'Codigo', 'Qtd (cx)']]
    : [['Produto', 'Codigo', 'Pedido', 'Reservado', 'Falta', 'Status']];

  autoTableSeguro(doc, {
    startY: tipo === 'finalizado' ? 84 : 78,
    head: headers,
    body: linhas,
    theme: 'grid',
    headStyles: { fillColor: corFundo, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 30 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    columnStyles: tipo === 'finalizado'
      ? { 2: { halign: 'center' } }
      : { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center', fontStyle: 'bold' } },
    didParseCell: function(data) {
      if (tipo !== 'finalizado' && data.column.index === 5) {
        const txt = String(data.cell.raw);
        if (txt === 'FALTANDO') { data.cell.styles.textColor = [220, 38, 38]; }
        else if (txt === 'OK') { data.cell.styles.textColor = [16, 185, 129]; }
      }
      if (tipo !== 'finalizado' && data.column.index === 4) {
        const valor = parseInt(data.cell.raw);
        if (!isNaN(valor) && valor > 0) data.cell.styles.textColor = [220, 38, 38];
        else if (valor === 0) data.cell.styles.textColor = [16, 185, 129];
      }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 20;
  if (finalY < 260) {
    doc.setDrawColor(150, 150, 150);
    doc.line(14, finalY, 90, finalY);
    doc.line(120, finalY, 196, finalY);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Responsavel pela separacao', 14, finalY + 4);
    doc.text('Conferente', 120, finalY + 4);
  }

  const totalPag = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPag; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pagina ${i} de ${totalPag}`, 200, 290, { align: 'right' });
    doc.text('D.Sync', 14, 290);
  }

  doc.save(`pedido_${pedido.codigo}_${getJSDateSlug()}.pdf`);
  mostrarToast('📄 PDF do pedido gerado!', 'success');
}

// ===== Injeção de botões PDF nas telas =====
function injetarBotoesPDF() {
  // Estoque → Prateleiras
  const shelfControls = document.querySelector('#sub-tab-prateleiras .controls');
  if (shelfControls && !document.getElementById('btnPDFEstoque')) {
    const btn = document.createElement('button');
    btn.id = 'btnPDFEstoque';
    btn.className = 'info';
    btn.textContent = '📄 Exportar PDF';
    btn.onclick = exportarEstoquePDF;
    shelfControls.appendChild(btn);
  }

  // Estoque → Gráfico
  const graficoControls = document.querySelector('.grafico-controls');
  if (graficoControls && !document.getElementById('btnPDFGrafico')) {
    const btn = document.createElement('button');
    btn.id = 'btnPDFGrafico';
    btn.textContent = '📄 Exportar PDF';
    btn.onclick = exportarGraficoPDF;
    graficoControls.appendChild(btn);
  }

  // Pedidos → Separar
  const separarContainer = document.querySelector('#sub-tab-separar .pedido-lista-container');
  if (separarContainer && !document.getElementById('btnPDFSeparar')) {
    const btn = document.createElement('button');
    btn.id = 'btnPDFSeparar';
    btn.className = 'btn btn-info btn-md';
    btn.style.marginBottom = '15px';
    btn.textContent = '📄 Exportar Lista em PDF';
    btn.onclick = exportarPedidosSepararPDF;
    separarContainer.insertBefore(btn, separarContainer.querySelector('#listaPedidosSeparar'));
  }

  // Pedidos → Finalizado
  const finalContainer = document.querySelector('#sub-tab-finalizado .pedido-lista-container');
  if (finalContainer && !document.getElementById('btnPDFFinal')) {
    const btn = document.createElement('button');
    btn.id = 'btnPDFFinal';
    btn.className = 'btn btn-info btn-md';
    btn.style.marginBottom = '15px';
    btn.textContent = '📄 Exportar Lista em PDF';
    btn.onclick = exportarPedidosFinalizadosPDF;
    finalContainer.insertBefore(btn, finalContainer.querySelector('#listaPedidosFinalizados'));
  }

  // Botões individuais em cada pedido (separar)
  document.querySelectorAll('#listaPedidosSeparar .pedido-card').forEach(card => {
    if (card.querySelector('.btn-pdf-pedido')) return;
    const codigo = card.querySelector('.pedido-codigo')?.textContent.replace('📋', '').trim();
    if (!codigo) return;
    const acoes = card.querySelector('.pedido-acoes');
    if (!acoes) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-pdf-pedido';
    btn.style.background = '#7c3aed';
    btn.style.color = 'white';
    btn.textContent = '📄 PDF';
    btn.onclick = () => exportarPedidoIndividualPDF(codigo, 'separar');
    acoes.appendChild(btn);
  });

  // Botões individuais em cada pedido (finalizado)
  document.querySelectorAll('#listaPedidosFinalizados .pedido-card').forEach(card => {
    if (card.querySelector('.btn-pdf-pedido')) return;
    const codigo = card.querySelector('.pedido-codigo')?.textContent.replace('✅', '').trim();
    if (!codigo) return;
    const acoes = card.querySelector('.pedido-acoes');
    if (!acoes) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-pdf-pedido';
    btn.style.background = '#7c3aed';
    btn.style.color = 'white';
    btn.textContent = '📄 PDF';
    btn.onclick = () => exportarPedidoIndividualPDF(codigo, 'finalizado');
    acoes.appendChild(btn);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  setTimeout(injetarBotoesPDF, 500);
});

// Envolve as funções que atualizam listas para reinjetar botões
const _atualizarListasPedidosOriginal = typeof atualizarListasPedidos === 'function' ? atualizarListasPedidos : null;
if (_atualizarListasPedidosOriginal) {
  window.atualizarListasPedidos = function() {
    _atualizarListasPedidosOriginal();
    setTimeout(injetarBotoesPDF, 50);
  };
}

const _carregarCargaOriginal = typeof carregarCarga === 'function' ? carregarCarga : null;
if (_carregarCargaOriginal) {
  window.carregarCarga = function() {
    _carregarCargaOriginal();
    setTimeout(injetarBotoesPDF, 50);
  };
}

const _mostrarSubAbaOriginal = typeof mostrarSubAba === 'function' ? mostrarSubAba : null;
if (_mostrarSubAbaOriginal) {
  window.mostrarSubAba = function(sub) {
    _mostrarSubAbaOriginal(sub);
    setTimeout(injetarBotoesPDF, 50);
  };
}

// ===== INICIAR =====
console.log('🚀 D.Sync - Sistema completo + PDFs!');
