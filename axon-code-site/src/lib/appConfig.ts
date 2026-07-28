import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DOWNLOADS_ENABLED as FALLBACK_DOWNLOADS } from "../config";

/* ============================================================
   Live switches, read from Supabase at runtime.
   If the table doesn't exist yet (or we're offline) everything
   falls back to the compile-time defaults, so the site never
   breaks because of a missing row.
   ============================================================ */

export interface AppConfig {
  downloads_enabled: boolean;
  latest_app_version: string;
  latest_model_tag: string;
  update_notes: string;
  launch_month_on: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  downloads_enabled: FALLBACK_DOWNLOADS,
  latest_app_version: "1.0.0",
  latest_model_tag: "laro-med",
  update_notes: "",
  launch_month_on: true,
};

let cache: AppConfig | null = null;

export async function loadAppConfig(force = false): Promise<AppConfig> {
  if (cache && !force) return cache;
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("downloads_enabled,latest_app_version,latest_model_tag,update_notes,launch_month_on")
      .eq("id", 1)
      .single();
    if (error || !data) throw error || new Error("no row");
    cache = { ...DEFAULT_CONFIG, ...(data as AppConfig) };
  } catch {
    cache = DEFAULT_CONFIG; // table missing / offline — safe defaults
  }
  return cache;
}

export async function saveAppConfig(patch: Partial<AppConfig>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("app_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  cache = { ...(cache || DEFAULT_CONFIG), ...patch };
  return { ok: true };
}

/** Load the live config once per mount. Falls back to defaults instantly
    so nothing on the page ever waits on the network. */
export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(cache || DEFAULT_CONFIG);
  useEffect(() => {
    let alive = true;
    loadAppConfig().then((c) => alive && setCfg(c));
    return () => { alive = false; };
  }, []);
  return cfg;
}
