// Trage hier die Werte aus deinem Supabase-Projekt ein:
// Dashboard -> Project Settings -> API
const SUPABASE_URL = "https://gfdshnmwrfttgathadsf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZHNobm13cmZ0dGdhdGhhZHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MTMyMTQsImV4cCI6MjEwNTM4OTIxNH0.ku4p6MwXlV3kl6hGCbKoI9mkLMXcXV4a07Q7paK484E";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
