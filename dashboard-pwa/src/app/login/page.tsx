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
  const [errorMessage, setErrorMessage] = useState("");

  // Jika sudah terautentikasi, alihkan langsung ke dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!username.trim() || !password) {
      setErrorMessage("Username dan password wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      if (res.success) {
        router.replace("/");
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau server.");
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

      {/* ─── Logo CAT di atas kotak ─── */}
      <div className="mb-4 sm:mb-5 z-10 flex items-center justify-center">
        <div className="bg-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center justify-center hover:scale-105 transition-all">
          <img
            src="/cat-logo.png"
            alt="Caterpillar CAT Logo"
            className="h-10 sm:h-12 w-auto object-contain"
          />
        </div>
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

        {/* Pesan Kesalahan */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-medium flex items-center gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
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
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username Anda"
                className="w-full glass-input pl-10 pr-4 py-2.5 text-sm font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
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
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password Anda"
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
