import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(req?: NextRequest): string {
  if (!req) return "unknown";
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim() || "unknown";
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  if (rateLimitStore.size > 1000) {
    rateLimitStore.forEach((entry, key) => {
      if (now >= entry.resetAt) {
        rateLimitStore.delete(key);
      }
    });
  }

  const existing = rateLimitStore.get(ip);
  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  return existing.count > MAX_REQUESTS_PER_WINDOW;
}

function isFiniteInRange(val: unknown, min: number, max: number): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= min && val <= max;
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak permintaan. Silakan coba lagi nanti." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Layanan penyimpanan riwayat belum dikonfigurasi." },
      { status: 503 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "Payload telemetri harus berupa objek JSON yang valid." },
        { status: 400 }
      );
    }

    const payload = body as Record<string, unknown>;
    const rpm = payload.rpm;
    const load = payload.load;
    const temp = payload.temp;
    const map_kpa = payload.map;
    const speed = payload.spd;
    const volt = payload.volt;
    const state_level = payload.st === undefined ? 1 : payload.st;

    // Validasi ketat tipe numerik dan rentang fisik SAE J1939
    if (
      !isFiniteInRange(rpm, 0, 10000) ||
      !isFiniteInRange(load, 0, 100) ||
      !isFiniteInRange(temp, -40, 215) ||
      !isFiniteInRange(map_kpa, 0, 500) ||
      !isFiniteInRange(speed, 0, 250) ||
      !isFiniteInRange(volt, 0, 60) ||
      !isFiniteInRange(state_level, 0, 3) ||
      !Number.isInteger(state_level)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Data telemetri di luar rentang fisik SAE J1939 atau tipe data tidak valid.",
        },
        { status: 400 }
      );
    }

    // Simpan ke Supabase telemetry_history
    const { data, error } = await supabase
      .from("telemetry_history")
      .insert([
        {
          rpm: Math.round(rpm),
          load_pct: Math.round(load),
          temp_c: Math.round(temp),
          map_kpa: Math.round(map_kpa),
          speed_kmh: Math.round(speed),
          volt_v: Math.round(volt * 10) / 10,
          state_level,
        },
      ])
      .select();

    if (error) {
      console.error("[API Telemetry POST] Supabase insert error:", error);
      return NextResponse.json(
        { success: false, error: "Gagal menyimpan data telemetri ke server." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      records: data,
      count: Array.isArray(data) ? data.length : 0,
    });
  } catch (err: unknown) {
    console.error("[API Telemetry POST] Request parse/execution error:", err);
    return NextResponse.json(
      { success: false, error: "Format permintaan telemetri tidak valid." },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak permintaan. Silakan coba lagi nanti." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Layanan penyimpanan riwayat belum dikonfigurasi." },
      { status: 503 }
    );
  }

  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 50));

    const { data, error } = await supabase
      .from("telemetry_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[API Telemetry GET] Supabase query error:", error);
      return NextResponse.json(
        { success: false, error: "Gagal mengambil riwayat data telemetri." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      records: data,
      count: Array.isArray(data) ? data.length : 0,
    });
  } catch (err: unknown) {
    console.error("[API Telemetry GET] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal pada server." },
      { status: 500 }
    );
  }
}

