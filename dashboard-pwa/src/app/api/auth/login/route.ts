import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureDefaultAdminExists } from "@/lib/supabaseAdmin";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Username dan Password wajib diisi." },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim().toLowerCase();
    
    // Pastikan admin default tersedia
    if (cleanUsername === "admin") {
      await ensureDefaultAdminExists();
    }

    const email = `${cleanUsername}@cat950l.local`;
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: String(password),
    });

    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { success: false, message: "Username atau password salah." },
        { status: 401 }
      );
    }

    const rawRole = data.user.user_metadata?.role || (cleanUsername === "admin" ? "Admin" : "User");
    const role: "Admin" | "User" = rawRole.toLowerCase() === "admin" ? "Admin" : "User";
    const actualUsername = data.user.user_metadata?.username || cleanUsername;

    return NextResponse.json({
      success: true,
      message: "Login berhasil",
      token: data.session.access_token,
      user: {
        id: data.user.id,
        username: actualUsername,
        role,
      },
    });
  } catch (err: unknown) {
    console.error("[Login API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal server saat login." },
      { status: 500 }
    );
  }
}

