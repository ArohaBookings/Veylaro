/* ============================================================
   REMOTE CONFIG — the live switches Leo flips on the website admin
   panel, read by the app at runtime.

   The app reads the PUBLIC app_config row straight from Supabase's
   REST endpoint (the "anyone reads config" policy makes it anon-
   readable, so no login and no @supabase/supabase-js dependency is
   needed). Everything falls back to safe defaults when offline, so
   the app never blocks on the network.

   This is what makes the admin "Unlimited for EVERYONE" kill-switch
   actually take effect inside the app — the moment Leo flips it, the
   next config poll uncaps every running client.
   ============================================================ */

const SUPABASE_URL = "https://ockumizfxvzdkcjgmqcl.supabase.co";
const SUPABASE_ANON = "sb_publishable_cAdwcUIwQODeXaTZs__oSA_1ti8EPsw";

export interface RemoteConfig {
  downloads_enabled: boolean;
  unlimited_for_all: boolean;
  launch_month_on: boolean;
  latest_app_version: string;
  latest_model_tag: string;
}

export const REMOTE_DEFAULTS: RemoteConfig = {
  downloads_enabled: false,
  unlimited_for_all: false,
  launch_month_on: true,
  latest_app_version: "1.0.0",
  latest_model_tag: "laro-med",
};

let cache: RemoteConfig = REMOTE_DEFAULTS;

export function remoteConfig(): RemoteConfig {
  return cache;
}

export async function refreshRemoteConfig(): Promise<RemoteConfig> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/app_config` +
      `?id=eq.1&select=downloads_enabled,unlimited_for_all,launch_month_on,latest_app_version,latest_model_tag`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) cache = { ...REMOTE_DEFAULTS, ...row };
  } catch {
    /* offline or table missing — keep safe defaults, never block the app */
  }
  return cache;
}
