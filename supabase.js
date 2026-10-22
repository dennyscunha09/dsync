// Configuração do Supabase
const SUPABASE_URL = 'SUA_URL_AQUI';
const SUPABASE_KEY = 'SUA_ANON_KEY_AQUI';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variável global para guardar o usuário logado
let usuarioSupabase = null;
