import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER_SUPABASE_URL = "https://your-project.supabase.co";
const PLACEHOLDER_SUPABASE_KEY = "your-anon-key";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_SUPABASE_KEY;

/**
 * Checks whether Supabase environment variables are genuinely configured
 * and not using fallback placeholder values.
 */
export function isSupabaseConfigured(): boolean {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !rawKey) {
    return false;
  }

  if (
    rawUrl === PLACEHOLDER_SUPABASE_URL ||
    rawKey === PLACEHOLDER_SUPABASE_KEY
  ) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface TelemetryRecord {
  id?: string;
  created_at?: string;
  rpm: number;
  load_pct: number;
  temp_c: number;
  map_kpa: number;
  speed_kmh: number;
  volt_v: number;
  state_level: number;
}

export interface AlarmRecord {
  id?: string;
  created_at?: string;
  event_type: string;
  parameter_name: string;
  trigger_value: number;
  threshold_value: number;
  severity: "WARNING" | "CRITICAL";
  message: string;
}

