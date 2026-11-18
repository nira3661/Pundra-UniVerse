/**
 * PUB Hub — Supabase JS v2 CDN client.
 * Load the Supabase CDN script before this file, then load auth.js.
 */
const SUPABASE_URL = "https://huxfzpkjpjwvzbvzsprl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HDsUisSkosdJOeUCl6ru4w_3HwGTkXO";

(function initializeSupabase() {
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== "function") {
    console.error("PUB Hub: Supabase JS v2 CDN was not loaded before supabaseClient.js.");
    return;
  }

  const client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window._supabaseCdn = sdk;
  window.supabaseClient = client;
  // Keep the standard window.supabase name as the initialized client for app scripts.
  window.supabase = client;
})();
