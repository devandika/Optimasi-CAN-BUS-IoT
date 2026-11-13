import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fuuacsjkbtjekdrnmjmg.supabase.co";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!serviceRoleKey) {
  console.warn(
    "[SupabaseAdmin] SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment."
  );
}

/**
 * Supabase Admin Client dengan Service Role Key.
 * HANYA boleh dipanggil di sisi server (API Route Handlers / Server Actions),
 * TIDAK PERNAH di-bundle ke browser client.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const ADMIN_USERNAME = "admin";
export const ADMIN_DEFAULT_PASSWORD = "admin123";

/**
 * Memastikan akun default Admin ada di Supabase Auth.
 */
export async function ensureDefaultAdminExists() {
  try {
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("[ensureDefaultAdminExists] Gagal list users:", listErr.message);
      return;
    }

    const adminUser = users.find(
      (u) =>
        u.user_metadata?.username?.toLowerCase() === ADMIN_USERNAME ||
        u.email === `${ADMIN_USERNAME}@cat950l.local`
    );

    if (!adminUser) {
      console.log("[ensureDefaultAdminExists] Akun admin belum ada. Membuat akun admin default...");
      const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: `${ADMIN_USERNAME}@cat950l.local`,
        password: ADMIN_DEFAULT_PASSWORD,
        user_metadata: {
          username: ADMIN_USERNAME,
          role: "Admin",
        },
        email_confirm: true,
      });

      if (createErr) {
        console.error("[ensureDefaultAdminExists] Gagal membuat admin:", createErr.message);
      } else {
        console.log("[ensureDefaultAdminExists] Akun admin berhasil dibuat:", data.user?.id);
      }
    }
  } catch (err: unknown) {
    console.error("[ensureDefaultAdminExists] Error inisialisasi:", err);
  }
}

