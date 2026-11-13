import { NextResponse } from "next/server";
import { supabaseAdmin, ADMIN_USERNAME } from "@/lib/supabaseAdmin";
import { verifyAdmin } from "@/lib/serverAuth";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Hanya admin yang boleh menghapus pengguna
  const authCheck = await verifyAdmin(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  const userId = params.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "ID Pengguna tidak valid." },
      { status: 400 }
    );
  }

  try {
    const { data: targetUser, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (getErr || !targetUser.user) {
      return NextResponse.json(
        { success: false, message: "Pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    const username = (
      targetUser.user.user_metadata?.username ||
      targetUser.user.email?.replace(/@cat950l\.local$/, "") ||
      ""
    ).toLowerCase();

    // Proteksi Super Admin
    if (username === ADMIN_USERNAME || targetUser.user.email === `${ADMIN_USERNAME}@cat950l.local`) {
      return NextResponse.json(
        { success: false, message: "Tidak dapat menghapus akun Super Admin." },
        { status: 403 }
      );
    }

    // Mencegah admin menghapus akunnya sendiri yang sedang aktif
    if (targetUser.user.id === authCheck.user.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Anda tidak dapat menghapus akun Anda sendiri saat sedang masuk.",
        },
        { status: 400 }
      );
    }

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      return NextResponse.json(
        { success: false, message: delErr.message || "Gagal menghapus pengguna." },
        { status: 500 }
      );
    }

    // Hapus juga dari tabel public.users
    try {
      await supabaseAdmin.from("users").delete().eq("id", userId);
    } catch {
      // Abaikan jika tabel belum ada
    }

    return NextResponse.json({
      success: true,
      message: `Pengguna '${username}' berhasil dihapus.`,
    });
  } catch (err: unknown) {
    console.error("[Users DELETE API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat menghapus pengguna." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await verifyAdmin(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  const userId = params.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "ID Pengguna tidak valid." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { role, password } = body;

    const { data: targetUser, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (getErr || !targetUser.user) {
      return NextResponse.json(
        { success: false, message: "Pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    const currentUsername = (
      targetUser.user.user_metadata?.username ||
      targetUser.user.email?.replace(/@cat950l\.local$/, "") ||
      ""
    ).toLowerCase();

    const isSuperAdmin = currentUsername === ADMIN_USERNAME;

    // Super Admin tidak boleh diubah rolenya menjadi User
    if (isSuperAdmin && role && String(role).toLowerCase() !== "admin") {
      return NextResponse.json(
        { success: false, message: "Tidak dapat mengubah role Super Admin." },
        { status: 403 }
      );
    }

    const updatePayload: {
      user_metadata?: Record<string, unknown>;
      password?: string;
    } = {};

    if (role) {
      const formattedRole = String(role).toLowerCase() === "admin" ? "Admin" : "User";
      updatePayload.user_metadata = {
        ...targetUser.user.user_metadata,
        role: formattedRole,
      };
    }

    if (password) {
      if (String(password).length < 6) {
        return NextResponse.json(
          { success: false, message: "Password minimal 6 karakter." },
          { status: 400 }
        );
      }
      updatePayload.password = String(password);
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updatePayload
    );

    if (updateErr) {
      return NextResponse.json(
        { success: false, message: updateErr.message || "Gagal memperbarui pengguna." },
        { status: 500 }
      );
    }

    // Sinkronkan ke tabel public.users
    try {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (role) {
        updates.role = String(role).toLowerCase() === "admin" ? "Admin" : "User";
      }
      await supabaseAdmin.from("users").update(updates).eq("id", userId);
    } catch {
      // Abaikan jika tabel belum ada
    }

    return NextResponse.json({
      success: true,
      message: `Data pengguna '${currentUsername}' berhasil diperbarui.`,
    });
  } catch (err: unknown) {
    console.error("[Users PATCH API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat memperbarui pengguna." },
      { status: 500 }
    );
  }
}

