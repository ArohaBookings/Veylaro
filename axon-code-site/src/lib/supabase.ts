import { createClient } from "@supabase/supabase-js";

// Veylaro Supabase project (publishable key — safe to ship client-side).
const SUPABASE_URL = "https://ockumizfxvzdkcjgmqcl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cAdwcUIwQODeXaTZs__oSA_1ti8EPsw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // completes the email-confirmation redirect
  },
});

/** Accounts allowed into Mission Control. */
export const SUPER_ADMINS = ["support@arohacalls.com"];
