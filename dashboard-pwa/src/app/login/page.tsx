"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { Eye, EyeOff, Lock, User, AlertCircle, Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, login, isLoading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error spesifik per field yang muncul tepat di atas kotak isian
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Jika sudah terautentikasi, alihkan langsung ke dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    setPasswordError("");

    let hasClientError = false;

    // Validasi isian kosong langsung di atas masing-masing kotak
    if (!username.trim()) {
      setUsernameError("Wajib diisi");
      hasClientError = true;
    }

    if (!password) {
      setPasswordError("Wajib diisi");
      hasClientError = true;
    }

    if (hasClientError) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      if (res.success) {
        router.replace("/");
      } else {
        // Peringatan kesalahan tepat di atas kotak terkait
        if (res.field === "username") {
          setUsernameError(res.message);
        } else if (res.field === "password") {
          setPasswordError(res.message);
        } else {
          // Fallback cerdas berdasarkan pesan
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
      {/* ─── Ambient Glow Backdrop (Serasi dengan Dashboard) ─── */}
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

      {/* ─── Kartu Login Glassmorphism (Ukuran presisi max-w-[420px]) ─── */}
      <div className="w-full max-w-[420px] glass-card p-6 sm:p-8 space-y-5 shadow-2xl relative z-10 border border-[var(--glass-border)] rounded-2xl">
        {/* Di dalam kotak, bagian paling atas HANYA tulisan Login */}
        <div className="text-center pb-2 border-b border-[var(--glass-border)]">
          <h1
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Login
          </h1>
        </div>

        {/* Form Login (noValidate agar browser tidak memunculkan tooltip balon default) */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Kotak Isian Username */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="username"
                className="block text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Username
              </label>
              {/* Peringatan langsung di atas kotak isian username */}
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
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) setUsernameError("");
                }}
                placeholder="Masukkan username Anda"
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
                htmlFor="password"
                className="block text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Password
              </label>
              {/* Peringatan langsung di atas kotak isian password */}
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
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Masukkan password Anda"
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-98 disabled:opacity-50 mt-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <span>Login</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Daftar */}
        <div className="pt-2 border-t border-[var(--glass-border)] text-center">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Belum punya akun?{" "}
            <Link
              href="/register"
              className="font-bold text-cat-yellow hover:underline transition-all"
            >
              Daftar di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
