// Configuração do Supabase
const SUPABASE_URL = 'sb_publishable_Q0XqzW2Vfo2LNHczSUdwnQ_en2vwiRi';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd3l3ZnF0eXNkY3libGR6ZHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDYxNjQsImV4cCI6MjEwODI4MjE2NH0.j8wyP2K9GWRA8m56RQuA-d7Gu9_xqAH771JSyr9-akg';

// Verifica se a biblioteca foi carregada
const supabaseLib = window.supabase;

if (!supabaseLib) {
  console.error('❌ ERRO: Biblioteca do Supabase não carregou!');
} else {
  // Cria o cliente com a configuração para não travar no celular
  const supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      lock: async (name, acquireTimeout, fn) => {
        return await fn();
      }
    }
  });
}
