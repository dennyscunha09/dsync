// Configuração do Supabase
const SUPABASE_URL = 'sb_publishable_Q0XqzW2Vfo2LNHczSUdwnQ_en2vwiRi';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd3l3ZnF0eXNkY3libGR6ZHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDYxNjQsImV4cCI6MjEwODI4MjE2NH0.j8wyP2K9GWRA8m56RQuA-d7Gu9_xqAH771JSyr9-akg';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variável global para guardar o usuário logado
let usuarioSupabase = null;
