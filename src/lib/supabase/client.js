import { createClient } from "@supabase/supabase-js";

let cachedClient = null;
const REQUIRED_SUPABASE_ENV_KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

export function getSupabaseConfigDiagnostics() {
  const missing = REQUIRED_SUPABASE_ENV_KEYS.filter((key) => !import.meta.env[key]);

  return {
    isConfigured: missing.length === 0,
    missing,
    clientAvailable: Boolean(cachedClient) || missing.length === 0,
  };
}

export function getSupabaseConfigurationMessage() {
  const diagnostics = getSupabaseConfigDiagnostics();
  if (diagnostics.isConfigured) return "";

  if (!import.meta.env.DEV) {
    return "Supabase is not configured.";
  }

  return [
    "Supabase is not configured.",
    `Missing: ${diagnostics.missing.join(", ")}`,
    "Add them to your Vite env file and restart the dev server.",
  ].join(" ");
}

export function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const diagnostics = getSupabaseConfigDiagnostics();
  if (!diagnostics.isConfigured) {
    return null;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}

export function isSupabaseConfigured() {
  return getSupabaseConfigDiagnostics().isConfigured;
}
