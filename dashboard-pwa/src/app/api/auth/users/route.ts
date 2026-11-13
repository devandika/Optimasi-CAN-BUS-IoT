import { NextResponse } from "next/server";
import { supabaseAdmin, ADMIN_USERNAME } from "@/lib/supabaseAdmin";
import { verifyAdmin } from "@/lib/serverAuth";

export async function GET(request: Request) {
  const authCheck = await verifyAdmin(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      console.error("[Users GET API] Gagal list users:", error);
      return NextResponse.json(
        { success: false, message: "Gagal memuat daftar pengguna." },
        { status: 500 }
      );
    }

    const now = Date.now();
    // Toleransi aktif heartbeat: 2 menit (120 detik)
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

    const formattedUsers = users.map((u) => {
      const username =
        u.user_metadata?.username ||
        u.email?.replace(/@cat950l\.local$/, "") ||
        "Unknown";
      const isSuperAdmin = username.toLowerCase() === ADMIN_USERNAME;
      const rawRole = u.user_metadata?.role || (isSuperAdmin ? "Admin" : "User");
      const role = rawRole.toLowerCase() === "admin" ? "Admin" : "User";

      const lastSeenAt =
        (u.user_metadata?.last_seen_at as string) ||
        u.last_sign_in_at ||
        null;
      const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const isSelf = u.id === authCheck.user.id;
      const isExplicitlyOffline = u.user_metadata?.is_online === false;
      const isOnline = isSelf || (!isExplicitlyOffline && (now - lastSeenMs) < ONLINE_THRESHOLD_MS);

      return {
        id: u.id,
        username,
        role,
        email: u.email || "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        last_seen_at: lastSeenAt,
        is_online: isOnline,
        is_super_admin: isSuperAdmin,
      };
    });

    // Urutkan admin di atas, lalu berdasarkan created_at desc
    formattedUsers.sort((a, b) => {
      if (a.is_super_admin) return -1;
      if (b.is_super_admin) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const total = formattedUsers.length;
    const adminCount = formattedUsers.filter((u) => u.role === "Admin").length;
    const userCount = formattedUsers.filter((u) => u.role === "User").length;
    const onlineCount = formattedUsers.filter((u) => u.is_online).length;

    // Sinkronisasi otomatis ke public.users jika tabel sudah dibuat
    try {
      const recordsToUpsert = formattedUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
        updated_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from("users").upsert(recordsToUpsert, { onConflict: "username" });
    } catch {
      // Abaikan jika tabel belum ada
    }

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      stats: {
        total,
        admin: adminCount,
        user: userCount,
        online: onlineCount,
      },
    });
  } catch (err: unknown) {
    console.error("[Users GET API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat mengambil data pengguna." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Hanya admin yang boleh menambah pengguna
  const authCheck = await verifyAdmin(request);
  if (!authCheck.success) {
    return authCheck.response;
  }

  try {
    const body = await request.json();
    const { username, password, role } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Username dan Password wajib diisi." },
        { status: 400 }
      );
    }

    const trimmedUsername = String(username).trim();
    const cleanUsername = trimmedUsername.toLowerCase();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return NextResponse.json(
        { success: false, message: "Username harus antara 3 hingga 30 karakter." },
        { status: 400 }
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return NextResponse.json(
        {
          success: false,
          message: "Username hanya boleh berupa huruf, angka, dan underscore (_).",
        },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json(
        { success: false, message: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    const selectedRole: "Admin" | "User" =
      String(role).toLowerCase() === "admin" ? "Admin" : "User";

    // Cek apakah username sudah ada
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return NextResponse.json(
        { success: false, message: "Gagal memverifikasi username pengguna." },
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
        { success: false, message: "Username sudah digunakan." },
        { status: 400 }
      );
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: String(password),
      user_metadata: {
        username: trimmedUsername,
        role: selectedRole,
      },
      email_confirm: true,
    });

    if (createErr || !created.user) {
      return NextResponse.json(
        { success: false, message: createErr?.message || "Gagal membuat pengguna baru." },
        { status: 500 }
      );
    }

    // Sinkronkan ke tabel public.users
    try {
      await supabaseAdmin.from("users").upsert(
        {
          id: created.user.id,
          username: trimmedUsername,
          role: selectedRole,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" }
      );
    } catch {
      // Abaikan jika tabel belum ada
    }

    return NextResponse.json({
      success: true,
      message: `Pengguna '${trimmedUsername}' berhasil ditambahkan sebagai ${selectedRole}.`,
      user: {
        id: created.user.id,
        username: trimmedUsername,
        role: selectedRole,
      },
    });
  } catch (err: unknown) {
    console.error("[Users POST API] Error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal saat membuat pengguna." },
      { status: 500 }
    );
  }
}

