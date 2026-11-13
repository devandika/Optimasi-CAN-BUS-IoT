"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { Eye, EyeOff, Lock, User, AlertCircle, Loader2, ArrowRight, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { user, register, isLoading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Jika sudah login, redirect ke dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanUser = username.trim();
    if (!cleanUser || !password || !confirmPassword) {
      setErrorMessage("Semua kolom formulir pendaftaran wajib diisi.");
      return;
    }

    if (cleanUser.length < 3 || cleanUser.length > 30) {
      setErrorMessage("Username harus antara 3 hingga 30 karakter.");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
      setErrorMessage("Username hanya boleh mengandung huruf, angka, dan underscore (_).");
      return;
    }

    if (cleanUser.toLowerCase() === "admin") {
      setErrorMessage("Username 'admin' telah dicadangkan untuk Super Admin.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password minimal 6 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok dengan password yang dimasukkan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(cleanUser, password, confirmPassword);
      if (res.success) {
        router.replace("/");
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau server saat mendaftar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* ─── Ambient Glow Backdrop ─── */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 205, 0, 0.25) 0%, rgba(14, 165, 233, 0.15) 50%, transparent 80%)",
        }}
      />

      {/* ─── Kartu Registrasi Glassmorphism ─── */}
      <div className="w-full max-w-md glass-card p-6 sm:p-8 space-y-6 shadow-2xl relative z-10 border border-[var(--glass-border)] rounded-2xl">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2.5">
            <span
              className="w-1.5 h-7 rounded-sm bg-cat-yellow shrink-0"
              aria-hidden="true"
            />
            <h1
              className="font-display text-lg sm:text-xl font-bold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Wheel Loader CAT 950L
            </h1>
          </div>
          <p
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Sistem Pemantauan Telemetri IoT SAE J1939
          </p>
          <div className="pt-2">
            <h2
              className="font-display text-base sm:text-lg font-bold flex items-center justify-center gap-2"
              style={{ color: "var(--text-primary)" }}
            >
              <UserPlus className="w-5 h-5 text-cat-yellow" />
              <span>Buat Akun Pengguna</span>
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Daftar untuk mengakses pemantauan instrumen
            </p>
          </div>
        </div>

        {/* Pesan Kesalahan */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-medium flex items-center gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Registrasi */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="reg-username"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Contoh: operator_lapangan"
                className="w-full glass-input pl-10 pr-4 py-2.5 text-sm font-medium"
                required
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              3–30 karakter (huruf, angka, atau underscore).
            </p>
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full glass-input pl-10 pr-11 py-2.5 text-sm font-medium"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-confirm-password"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Konfirmasi Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="reg-confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password di atas"
                className="w-full glass-input pl-10 pr-11 py-2.5 text-sm font-medium"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
                aria-label="Toggle confirm password visibility"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-98 disabled:opacity-50 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mendaftarkan Akun...</span>
              </>
            ) : (
              <>
                <span>Daftar Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Kembali ke Login */}
        <div className="pt-2 border-t border-[var(--glass-border)] text-center space-y-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-bold text-cat-yellow hover:underline transition-all"
            >
              Masuk di sini
            </Link>
          </p>

          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            *Akun yang didaftarkan mandiri otomatis memiliki peran sebagai Pengguna (User).
          </p>
        </div>
      </div>
    </div>
  );
}

