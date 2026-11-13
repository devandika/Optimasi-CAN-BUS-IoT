import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuth } from "@/lib/serverAuth";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  const authCheck = await verifyAuth(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Password saat ini dan password baru wajib diisi." },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json(
        { success: false, message: "Password baru harus minimal 6 karakter." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, message: "Password baru tidak boleh sama dengan password saat ini." },
        { status: 400 }
      );
    }

    // Verifikasi password saat ini dengan mencoba sign in
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { error: verifyErr } = await supabaseClient.auth.signInWithPassword({
      email: authCheck.user.email,
      password: String(currentPassword),
    });

    if (verifyErr) {
      return NextResponse.json(
        { success: false, message: "Password saat ini salah." },
        { status: 400 }
      );
    }

    // Update ke password baru via admin
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      authCheck.user.id,
      {
        password: String(newPassword),
      }
    );

    if (updateErr) {
      return NextResponse.json(
        { success: false, message: updateErr.message || "Gagal mengubah kata sandi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kata sandi Anda berhasil diperbarui.",
    });
  } catch (err: unknown) {
    console.error("[ChangePassword API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat mengubah password." },
      { status: 500 }
    );
  }
}

