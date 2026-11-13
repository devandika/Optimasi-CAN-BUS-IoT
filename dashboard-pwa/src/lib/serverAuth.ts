import { NextResponse } from "next/server";
import { supabaseAdmin, ADMIN_USERNAME } from "@/lib/supabaseAdmin";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "Admin" | "User";
  email: string;
}

/**
 * Memverifikasi token JWT dari header Authorization: Bearer <token>
 */
export async function verifyAuth(request: Request): Promise<
  | { success: true; user: AuthenticatedUser }
  | { success: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message: "Akses ditolak. Token autentikasi tidak ditemukan." },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message: "Akses ditolak. Token tidak valid." },
        { status: 401 }
      ),
    };
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message: "Sesi telah kedaluwarsa atau tidak valid. Silakan login kembali." },
        { status: 401 }
      ),
    };
  }

  const username =
    user.user_metadata?.username ||
    user.email?.replace(/@cat950l\.local$/, "") ||
    "User";

  const rawRole =
    user.user_metadata?.role ||
    (username.toLowerCase() === ADMIN_USERNAME ? "Admin" : "User");

  const role: "Admin" | "User" =
    rawRole.toLowerCase() === "admin" ? "Admin" : "User";

  return {
    success: true,
    user: {
      id: user.id,
      username,
      role,
      email: user.email || "",
    },
  };
}

/**
 * Memverifikasi apakah pengguna memiliki hak akses role Admin
 */
export async function verifyAdmin(request: Request): Promise<
  | { success: true; user: AuthenticatedUser }
  | { success: false; response: NextResponse }
> {
  const authRes = await verifyAuth(request);
  if (!authRes.success) {
    return authRes;
  }

  if (authRes.user.role !== "Admin") {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          message: "Akses terlarang. Fitur ini hanya dapat diakses oleh Administrator.",
        },
        { status: 403 }
      ),
    };
  }

  return authRes;
}

