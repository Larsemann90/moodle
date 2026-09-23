// Trage hier die Werte aus deinem Supabase-Projekt ein:
// Dashboard -> Project Settings -> API
const SUPABASE_URL = "https://gfdshnmwrfttgathadsf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eBpYLGhBk9EZr5l1WpUrWw_HUMnWcUA";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
