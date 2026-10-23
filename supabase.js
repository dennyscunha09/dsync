// Configuração do Supabase
const SUPABASE_URL = 'sb_publishable_Q0XqzW2Vfo2LNHczSUdwnQ_en2vwiRi';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd3l3ZnF0eXNkY3libGR6ZHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDYxNjQsImV4cCI6MjEwODI4MjE2NH0.j8wyP2K9GWRA8m56RQuA-d7Gu9_xqAH771JSyr9-akg';
// Verifica se a biblioteca carregou
if (typeof supabase === 'undefined') {
  console.error('❌ ERRO CRÍTICO: A biblioteca do Supabase não carregou! Verifique o link no index.html.');
  alert('Erro: A biblioteca do Supabase não foi carregada. Verifique o link no HTML.');
} else {
  // Cria o cliente
  const supabaseClient = supabase.createClient(
    'SUA_URL_AQUI',
    'SUA_ANON_KEY_AQUI',
    {
      auth: {
        // Desativa a trava que causa congelamento no celular
        lock: async (name, acquireTimeout, fn) => {
          return await fn();
        }
      }
    }
  );

  // Deixa o cliente disponível globalmente para o resto do código
  window.supabase = supabaseClient;
}
