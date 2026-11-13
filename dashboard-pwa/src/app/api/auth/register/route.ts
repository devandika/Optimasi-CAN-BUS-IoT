import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, confirmPassword } = body;

    const trimmedUsername = String(username || "").trim();
    const cleanUsername = trimmedUsername.toLowerCase();

    if (!trimmedUsername) {
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

    if (confirmPassword !== undefined && !confirmPassword) {
      return NextResponse.json(
        { success: false, field: "confirmPassword", message: "Wajib diisi" },
        { status: 400 }
      );
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return NextResponse.json(
        { success: false, field: "username", message: "Username harus 3–30 karakter." },
        { status: 400 }
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return NextResponse.json(
        {
          success: false,
          field: "username",
          message: "Hanya boleh huruf, angka, dan underscore (_).",
        },
        { status: 400 }
      );
    }

    if (cleanUsername === "admin") {
      return NextResponse.json(
        { success: false, field: "username", message: "Username 'admin' sudah digunakan." },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json(
        { success: false, field: "password", message: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return NextResponse.json(
        { success: false, field: "confirmPassword", message: "Konfirmasi password tidak cocok." },
        { status: 400 }
      );
    }

    // Periksa apakah username sudah ada
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("[Register API] Gagal list users:", listErr);
      return NextResponse.json(
        { success: false, message: "Gagal memeriksa ketersediaan username." },
        { status: 500 }
      );
    }

    const email = `${cleanUsername}@cat950l.local`;
    const exists = users.some(
      (u) =>
        u.email === email ||
        u.user_metadata?.username?.toLowerCase() === cleanUsername
    );

    if (exists) {
      return NextResponse.json(
        { success: false, field: "username", message: "Username sudah digunakan." },
        { status: 400 }
      );
    }

    // Role registrasi mandiri selalu dikunci sebagai 'User'
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: String(password),
      user_metadata: {
        username: trimmedUsername,
        role: "User",
      },
      email_confirm: true,
    });

    if (createErr || !created.user) {
      console.error("[Register API] Gagal membuat user:", createErr);
      return NextResponse.json(
        { success: false, message: createErr?.message || "Gagal membuat akun." },
        { status: 500 }
      );
    }

    // Sinkronkan akun baru ke tabel public.users jika tabel sudah dibuat
    try {
      await supabaseAdmin.from("users").upsert(
        {
          id: created.user.id,
          username: trimmedUsername,
          role: "User",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" }
      );
    } catch {
      // Abaikan jika tabel public.users belum di-create
    }

    // Auto-login untuk mendapatkan sesi
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data: loginData } = await supabaseClient.auth.signInWithPassword({
      email,
      password: String(password),
    });

    return NextResponse.json({
      success: true,
      message: "Pendaftaran berhasil",
      token: loginData?.session?.access_token || "",
      user: {
        id: created.user.id,
        username: trimmedUsername,
        role: "User",
      },
    });
  } catch (err: unknown) {
    console.error("[Register API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal server saat registrasi." },
      { status: 500 }
    );
  }
}
