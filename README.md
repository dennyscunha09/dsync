📦 DC Sync - Sistema de Estoque

DC Sync é um sistema completo de gerenciamento de estoque desenvolvido em HTML, CSS e JavaScript puro. Perfeito para controle de prateleiras, separação de pedidos e gestão de carga.

---

🎯 VISÃO GERAL

O DC Sync foi criado para facilitar o gerenciamento de estoque em armazéns, lojas e centros de distribuição. Com uma interface intuitiva e responsiva, você pode:

· 📋 Organizar produtos em prateleiras personalizadas (A-Z)
· 🚛 Gerenciar separação de pedidos com sistema de carga
· 📊 Visualizar estoque com gráficos interativos
· ⚠️ Receber alertas de estoque baixo
· 🔗 Compartilhar dados com sua equipe

---

✨ FUNCIONALIDADES

📋 Prateleiras

· Criação de prateleiras de A até Z
· Cada prateleira possui 12 posições numeradas (1-12)
· Cores personalizáveis por prateleira e posição
· Busca rápida de produtos

➕ Cadastro de Produtos

· Cadastro com nome, quantidade, prateleira e posição
· Código de barras opcional
· Lista completa de produtos cadastrados
· Remoção fácil de produtos

🚛 Sistema de Carga

· Adicionar produtos à carga (sem subtrair do estoque)
· Sinalização visual de produtos reservados
· Badge com quantidade reservada
· Gerenciamento de quantidades na carga

📊 Gráficos

· Visualização do estoque por produto
· Gráficos em barras, rosca e pizza
· Cores vibrantes e únicas para cada item
· Tabela detalhada com totais

⚠️ Alertas

· Configuração de limites de estoque (baixo e crítico)
· Alertas visuais nos cards das prateleiras
· Aba dedicada para visualização de alertas
· Ações rápidas para separar produtos em alerta

🔗 Compartilhamento

· Compartilhamento via link com todos os dados
· Exportação e importação de dados em JSON
· Backup manual dos dados
· Persistência local com localStorage

---

🚀 COMO USAR

Instalação Rápida

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/dc-sync.git

# 2. Abra a pasta
cd dc-sync

# 3. Abra o index.html no navegador
# Ou use um servidor local como Live Server
```

Estrutura de Arquivos

```
dc-sync/
├── index.html          # Página principal
├── style.css           # Estilos do sistema
├── script.js           # Lógica JavaScript
└── README.md           # Documentação
```

---

🎨 CORES E IDENTIDADE VISUAL

Cor Código Uso
Azul Marinho #1A2B4C Header, botões principais
Laranja #F59E0B Logo, destaques, reservas
Cinza Claro #f8f9fa Fundo dos cards
Branco #FFFFFF Fundo geral

---

📱 COMPATIBILIDADE

· ✅ Desktop (Windows, macOS, Linux)
· ✅ Tablet (Android, iPad)
· ✅ Mobile (Android, iOS)
· ✅ Todos os navegadores modernos

---

🛠️ TECNOLOGIAS UTILIZADAS

Tecnologia Versão Uso
HTML5 - Estrutura
CSS3 - Estilos e layout
JavaScript ES6+ Lógica e interatividade
Chart.js 4.4.0 Gráficos interativos
QuaggaJS - Scanner de código de barras (opcional)

---

📖 GUIA RÁPIDO

Adicionar uma Prateleira

1. Clique em "📋 Prateleiras"
2. Clique em "➕ Adicionar Prateleira"
3. A nova prateleira será criada automaticamente (A-Z)

Cadastrar Produto

1. Clique em "➕ Cadastro"
2. Preencha os campos obrigatórios
3. Selecione a prateleira e posição disponível
4. Clique em "✅ Cadastrar"

Separar Produto

1. Vá para "📋 Prateleiras"
2. Localize o produto desejado
3. Clique em "📦 Separar"
4. Escolha a quantidade
5. Confirme a separação

Adicionar à Carga

1. Vá para "📋 Prateleiras"
2. Localize o produto desejado
3. Clique em "🚛 Carga"
4. Escolha a quantidade
5. O produto será adicionado à carga (estoque mantido)

---

🔧 CONFIGURAÇÕES

Alertas de Estoque

· Estoque Baixo: Padrão 5 unidades
· Estoque Crítico: Padrão 2 unidades
· Acesse "⚠️ Alertas" > "⚙️ Configurar"

Persistência

· Os dados são salvos automaticamente no localStorage do navegador
· Ao fechar e reabrir, os dados permanecem

---

🤝 COMO CONTRIBUIR

1. Faça um fork do projeto
2. Crie uma branch para sua feature (git checkout -b feature/nova-funcionalidade)
3. Commit suas mudanças (git commit -m 'Adiciona nova funcionalidade')
4. Push para a branch (git push origin feature/nova-funcionalidade)
5. Abra um Pull Request

---

📄 LICENÇA

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

---

🆘 SUPORTE

Problemas Comuns

Problema Solução
Dados não salvam Verifique se o localStorage está habilitado
Gráfico não aparece Verifique a conexão com a internet (Chart.js)
Scanner não funciona Acesse via HTTPS ou localhost
Compartilhamento falha Use a opção "Exportar" para enviar o JSON

Contato

· 📧 Email: seu-email@dominio.com
· 🐛 Issues: GitHub Issues

---

🎯 ROADMAP

☐ Scanner de código de barras integrado
☐ Impressão de etiquetas
☐ Histórico de movimentações
☐ Múltiplos usuários
☐ Notificações por email
☐ Aplicativo PWA
☐ Integração com APIs externas
☐ Relatórios personalizados

---

⭐ AGRADECIMENTOS

A todos que contribuíram para o desenvolvimento do DC Sync!

---

Feito com ❤️ por [Seu Nome]

---

📸 PRINTS DO SISTEMA

Tela Principal - Prateleiras

```
📋 Prateleiras | ➕ Cadastro | 🚛 Carga | 📊 Gráfico | ⚠️ Alertas
┌─────────────────────────────────────────────────────────────┐
│  Prateleira A                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │ A1    │ │ A2    │ │ A3    │ │ A4    │ │ A5    │          │
│  │ Prod1 │ │ Prod2 │ │ Prod3 │ │ Vazio │ │ Prod5 │          │
│  │ 150 un│ │ 80 un │ │ 45 un │ │ 0 un  │ │ 12 un │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
└─────────────────────────────────────────────────────────────┘
```

Tela de Cadastro

```
📝 Cadastrar Produto
┌─────────────────────────────────────────────────────────────┐
│  Nome do Produto *                                         │
│  [Parafuso 3x20            ]                               │
│                                                             │
│  Quantidade *                                              │
│  [150                      ]                               │
│                                                             │
│  Prateleira *                                              │
│  [▼ Prateleira A           ]                               │
│                                                             │
│  Posição *                                                 │
│  [▼ A1 (Vazio)             ]                               │
│                                                             │
│  Código de Barras                                          │
│  [7891234567890            ]                               │
│                                                             │
│  [✅ Cadastrar]                                             │
└─────────────────────────────────────────────────────────────┘
```

Tela de Gráfico

```
📊 Estoque por Produto
┌─────────────────────────────────────────────────────────────┐
│  [Barras ▼] [🔄]                                           │
│                                                             │
│  200 ┤   ████████                                          │
│  150 ┤   ████████  ████████                                │
│  100 ┤   ████████  ████████  ████████                      │
│   50 ┤   ████████  ████████  ████████  ████████            │
│    0 ┤   ────────  ────────  ────────  ────────            │
│        Prod1      Prod2      Prod3      Prod4              │
│                                                             │
│  📊 Estatísticas                                           │
│  Produtos: 4  |  Unidades: 287  |  Média: 71              │
└────────────────────────────────────────────────────────────
Aproveite o DC Sync! 🚀