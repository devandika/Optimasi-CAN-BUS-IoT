import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin, ensureDefaultAdminExists } from "@/lib/supabaseAdmin";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const trimmedUser = String(username || "").trim();
    const cleanUsername = trimmedUser.toLowerCase();

    if (!trimmedUser) {
      return NextResponse.json(
        { success: false, field: "username", message: "Wajib diisi" },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { success: false, field: "password", message: "Wajib diisi" },
        { status: 400 }
      );
    }

    // Pastikan admin default tersedia
    if (cleanUsername === "admin") {
      await ensureDefaultAdminExists();
    }

    // Periksa apakah username terdaftar
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("[Login API] Error listUsers:", listErr);
    }

    const userFound = users?.find(
      (u) =>
        u.email === `${cleanUsername}@cat950l.local` ||
        u.user_metadata?.username?.toLowerCase() === cleanUsername
    );

    // Jika username tidak ditemukan di database
    if (!userFound) {
      return NextResponse.json(
        {
          success: false,
          field: "username",
          message: "Username tidak ditemukan",
        },
        { status: 401 }
      );
    }

    // Username ditemukan, coba autentikasi password
    const email = userFound.email || `${cleanUsername}@cat950l.local`;
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: String(password),
    });

    // Jika password salah
    if (error || !data.user || !data.session) {
      return NextResponse.json(
        {
          success: false,
          field: "password",
          message: "Password salah",
        },
        { status: 401 }
      );
    }

    const rawRole =
      data.user.user_metadata?.role ||
      (cleanUsername === "admin" ? "Admin" : "User");
    const role: "Admin" | "User" =
      rawRole.toLowerCase() === "admin" ? "Admin" : "User";
    const actualUsername = data.user.user_metadata?.username || cleanUsername;

    // Sinkronkan ke tabel public.users jika tabel sudah dibuat
    try {
      await supabaseAdmin.from("users").upsert(
        {
          id: data.user.id,
          username: actualUsername,
          role,
          last_sign_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" }
      );
    } catch {
      // Abaikan jika tabel public.users belum di-create
    }

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
