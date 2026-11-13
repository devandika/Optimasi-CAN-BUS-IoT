import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuth } from "@/lib/serverAuth";

export async function POST(request: Request) {
  const authCheck = await verifyAuth(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  const userId = authCheck.user.id;
  let action = "heartbeat";

  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.action === "string") {
      action = body.action;
    }
  } catch {
    // default to heartbeat
  }

  const isGoingOffline = action === "offline";
  const nowIso = new Date().toISOString();

  try {
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (targetUser?.user) {
      const currentMeta = targetUser.user.user_metadata || {};
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...currentMeta,
          is_online: !isGoingOffline,
          last_seen_at: isGoingOffline
            ? new Date(Date.now() - 5 * 60 * 1000).toISOString()
            : nowIso,
        },
      });
    }

    // Sinkronkan ke public.users jika tabel sudah tersedia
    try {
      await supabaseAdmin
        .from("users")
        .update({
          last_sign_in_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", userId);
    } catch {
      // Abaikan jika tabel public.users belum dibuat
    }

    return NextResponse.json({
      success: true,
      is_online: !isGoingOffline,
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    console.error("[Heartbeat API] Error updating status:", err);
    return NextResponse.json(
      { success: false, message: "Gagal memperbarui status presensi pengguna." },
      { status: 500 }
    );
  }
}

