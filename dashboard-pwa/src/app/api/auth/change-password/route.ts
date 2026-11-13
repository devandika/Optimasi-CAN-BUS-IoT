import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuth } from "@/lib/serverAuth";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, currentPassword, newPassword } = body;

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

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    let targetUserId = "";
    let targetEmail = "";
    let targetUsername = "";
    let isAlreadyVerified = false;

    // 1. Coba autentikasi via Bearer token
    const authCheck = await verifyAuth(request);
    if (authCheck.success) {
      targetUserId = authCheck.user.id;
      targetEmail = authCheck.user.email;
      targetUsername = authCheck.user.username;
    } else if (username) {
      // 2. Fallback: jika token kedaluwarsa, verifikasi langsung menggunakan username & currentPassword
      const cleanUsername = String(username).trim().toLowerCase();
      targetEmail = `${cleanUsername}@cat950l.local`;
      targetUsername = cleanUsername;

      const { data: signData, error: signErr } = await supabaseClient.auth.signInWithPassword({
        email: targetEmail,
        password: String(currentPassword),
      });

      if (signErr || !signData.user) {
        return NextResponse.json(
          { success: false, message: "Password saat ini salah." },
          { status: 400 }
        );
      }

      targetUserId = signData.user.id;
      isAlreadyVerified = true;
    } else {
      return authCheck.response;
    }

    // 3. Verifikasi password saat ini jika belum diverifikasi di fallback
    if (!isAlreadyVerified) {
      const { error: verifyErr } = await supabaseClient.auth.signInWithPassword({
        email: targetEmail,
        password: String(currentPassword),
      });

      if (verifyErr) {
        return NextResponse.json(
          { success: false, message: "Password saat ini salah." },
          { status: 400 }
        );
      }
    }

    // 4. Update password ke Supabase Auth via Admin API
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      {
        password: String(newPassword),
      }
    );

    if (updateErr) {
      console.error("[ChangePassword API] Error updateUserById:", updateErr);
      return NextResponse.json(
        { success: false, message: updateErr.message || "Gagal mengubah kata sandi." },
        { status: 500 }
      );
    }

    // 5. Sinkronisasi ke tabel public.users jika tabel sudah dibuat di Supabase
    try {
      await supabaseAdmin
        .from("users")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", targetUserId);
    } catch {
      // Abaikan jika tabel public.users belum di-create oleh user
    }

    // 6. Terbitkan token baru dengan kata sandi yang baru diperbarui
    let freshToken = "";
    try {
      const { data: newSession } = await supabaseClient.auth.signInWithPassword({
        email: targetEmail,
        password: String(newPassword),
      });
      if (newSession?.session?.access_token) {
        freshToken = newSession.session.access_token;
      }
    } catch {
      // fallback
    }

    return NextResponse.json({
      success: true,
      message: "Kata sandi Anda berhasil diperbarui.",
      token: freshToken,
    });
  } catch (err: unknown) {
    console.error("[ChangePassword API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat mengubah password." },
      { status: 500 }
    );
  }
}
