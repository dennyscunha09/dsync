// ===== CONFIGURAÇÃO DO SUPABASE =====
// ATENÇÃO: A URL é a do projeto, a KEY é a chave anon.
// Pegue a URL correta no painel do Supabase em: Project Settings > API > Project URL

const SUPABASE_URL = 'https://ydwywfqtysdcybldzdqe.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd3l3ZnF0eXNkY3libGR6ZHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDYxNjQsImV4cCI6MjEwODI4MjE2NH0.j8wyP2K9GWRA8m56RQuA-d7Gu9_xqAH771JSyr9-akg';

// Aguarda a biblioteca carregar
function inicializarSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.log('⏳ Aguardando Supabase carregar...');
    setTimeout(inicializarSupabase, 300);
    return;
  }
  
  // Cria o cliente usando as variáveis corretas
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      lock: async (name, acquireTimeout, fn) => await fn()
    }
  });

  // Deixa o cliente disponível globalmente
  window.supabase = supabaseClient;
  console.log('✅ Supabase inicializado com sucesso!');
}

// Inicia quando a página carregar
window.addEventListener('load', inicializarSupabase);

// Variável global para guardar o usuário logado
let usuarioSupabase = null;
