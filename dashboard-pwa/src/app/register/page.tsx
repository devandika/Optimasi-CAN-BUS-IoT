"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { Eye, EyeOff, Lock, User, AlertCircle, Loader2, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { user, register, isLoading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error spesifik per field langsung di atas kotak isian
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  // Jika sudah login, redirect ke dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    setPasswordError("");
    setConfirmError("");

    let hasClientError = false;
    const cleanUser = username.trim();

    // Validasi isian kosong langsung di atas kotak masing-masing
    if (!cleanUser) {
      setUsernameError("Wajib diisi");
      hasClientError = true;
    }

    if (!password) {
      setPasswordError("Wajib diisi");
      hasClientError = true;
    }

    if (!confirmPassword) {
      setConfirmError("Wajib diisi");
      hasClientError = true;
    }

    if (hasClientError) {
      return;
    }

    // Validasi aturan input
    if (cleanUser.length < 3 || cleanUser.length > 30) {
      setUsernameError("Username harus 3–30 karakter");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
      setUsernameError("Hanya boleh huruf, angka, underscore (_)");
      return;
    }

    if (cleanUser.toLowerCase() === "admin") {
      setUsernameError("Username 'admin' sudah digunakan");
      return;
    }

    if (password.length < 6) {
      setPasswordError("Minimal 6 karakter");
      return;
    }

    if (password !== confirmPassword) {
      setConfirmError("Konfirmasi password tidak cocok");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(cleanUser, password, confirmPassword);
      if (res.success) {
        router.replace("/");
      } else {
        if (res.field === "username") {
          setUsernameError(res.message);
        } else if (res.field === "password") {
          setPasswordError(res.message);
        } else if (res.field === "confirmPassword") {
          setConfirmError(res.message);
        } else {
          // Fallback
          if (res.message.toLowerCase().includes("username")) {
            setUsernameError(res.message);
          } else {
            setPasswordError(res.message);
          }
        }
      }
    } catch {
      setPasswordError("Terjadi kesalahan jaringan atau server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* ─── Ambient Glow Backdrop ─── */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 205, 0, 0.25) 0%, rgba(14, 165, 233, 0.15) 50%, transparent 80%)",
        }}
      />

      {/* ─── Logo CAT di atas kotak (No Background) ─── */}
      <div className="mb-4 sm:mb-5 z-10 flex items-center justify-center">
        <img
          src="/cat-logo.png"
          alt="Caterpillar CAT Logo"
          className="h-10 sm:h-12 w-auto object-contain dark:hidden drop-shadow-sm transition-transform hover:scale-105"
        />
        <img
          src="/cat-logo-dark.png"
          alt="Caterpillar CAT Logo"
          className="h-10 sm:h-12 w-auto object-contain hidden dark:block drop-shadow-sm transition-transform hover:scale-105"
        />
      </div>

      {/* ─── Kartu Registrasi Glassmorphism (Ukuran presisi sama dengan Login: max-w-[420px]) ─── */}
      <div className="w-full max-w-[420px] glass-card p-6 sm:p-8 space-y-5 shadow-2xl relative z-10 border border-[var(--glass-border)] rounded-2xl">
        {/* Di dalam kotak, bagian paling atas HANYA tulisan Daftar */}
        <div className="text-center pb-2 border-b border-[var(--glass-border)]">
          <h1
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Daftar
          </h1>
        </div>

        {/* Form Registrasi (noValidate) */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Kotak Isian Username */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="reg-username"
                className="block text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Username
              </label>
              {usernameError && (
                <span className="text-xs font-bold text-rose-500 animate-shake flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {usernameError}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) setUsernameError("");
                }}
                placeholder="Contoh: operator1"
                className={`w-full glass-input pl-10 pr-4 py-2.5 text-sm font-medium transition-all ${usernameError
                    ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/[0.03]"
                    : ""
                  }`}
              />
            </div>
          </div>

          {/* Kotak Isian Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="reg-password"
                className="block text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Password
              </label>
              {passwordError && (
                <span className="text-xs font-bold text-rose-500 animate-shake flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {passwordError}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Minimal 6 karakter"
                className={`w-full glass-input pl-10 pr-11 py-2.5 text-sm font-medium transition-all ${passwordError
                    ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/[0.03]"
                    : ""
                  }`}
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

          {/* Kotak Isian Konfirmasi Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="reg-confirm-password"
                className="block text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Konfirmasi Password
              </label>
              {confirmError && (
                <span className="text-xs font-bold text-rose-500 animate-shake flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {confirmError}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="reg-confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmError) setConfirmError("");
                }}
                placeholder="Ulangi password di atas"
                className={`w-full glass-input pl-10 pr-11 py-2.5 text-sm font-medium transition-all ${confirmError
                    ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/[0.03]"
                    : ""
                  }`}
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
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-98 disabled:opacity-50 mt-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mendaftarkan Akun...</span>
              </>
            ) : (
              <>
                <span>Daftar</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Kembali ke Login */}
        <div className="pt-2 border-t border-[var(--glass-border)] text-center">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-bold text-cat-yellow hover:underline transition-all"
            >
              Masuk di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
