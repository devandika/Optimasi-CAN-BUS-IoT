"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  LogOut,
  ChevronLeft,
  User,
  Radio,
} from "lucide-react";
import { AuthUser } from "@/lib/authContext";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  activePath?: "/" | "/users";
  theme?: string;
  onToggleTheme?: () => void;
  onOpenBrokerSettings?: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export function SideMenu({
  isOpen,
  onClose,
  user,
  activePath = "/",
  theme,
  onOpenChangePassword,
  onLogout,
}: SideMenuProps) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Tutup menu saat menekan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showLogoutConfirm) {
          setShowLogoutConfirm(false);
        } else if (isOpen) {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, showLogoutConfirm]);

  const isAdmin = user?.role === "Admin";

  return (
    <div
      className={`fixed inset-0 z-50 transition-visibility duration-300 ${
        isOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"
      }`}
      aria-hidden={!isOpen}
    >
      {/* ─── Backdrop Gelap Blur (Overlay di atas halaman) ─── */}
      <div
        onClick={() => {
          if (!showLogoutConfirm) onClose();
        }}
        className={`fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ─── Drawer Panel Side Menu (Slide Animation dari Kiri) ─── */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`fixed inset-y-0 left-0 w-72 sm:w-80 glass-elevated border-r border-[var(--glass-border)] shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundColor:
            theme === "dark"
              ? "rgba(18, 26, 42, 0.94)"
              : "rgba(255, 255, 255, 0.94)",
        }}
      >
        {/* Header Drawer */}
        <div className="p-4 sm:p-5 border-b border-[var(--glass-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center shrink-0">
              <img
                src="/cat-logo.png"
                alt="CAT Logo"
                className="h-6 w-auto object-contain dark:hidden"
              />
              <img
                src="/cat-logo-dark.png"
                alt="CAT Logo"
                className="h-6 w-auto object-contain hidden dark:block"
              />
            </div>
            <div>
              <h2
                className="font-display text-sm sm:text-base font-bold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Caterpillar 950L
              </h2>
              <p
                className="text-[10px] sm:text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                SAE J1939 Telemetry Menu
              </p>
            </div>
          </div>

          {/* Tombol Tutup: Menggunakan Simbol '<' Sesuai Permintaan */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg glass-subtle hover:bg-slate-500/10 active:scale-95 transition-all text-cat-yellow min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
            aria-label="Tutup Menu"
            title="Tutup Menu"
          >
            <ChevronLeft className="w-5 h-5 text-cat-yellow" />
          </button>
        </div>

        {/* Profil Akun Sederhana & Profesional */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-500/[0.05] dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70">
            <div className="w-10 h-10 rounded-lg bg-slate-200/80 dark:bg-slate-700/60 flex items-center justify-center shrink-0">
              {isAdmin ? (
                <KeyRound className="w-5 h-5 text-cat-yellow" />
              ) : (
                <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-bold truncate leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {user?.username || "Pengguna"}
              </div>
              <div
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {isAdmin ? "Admin" : "User"}
              </div>
            </div>
          </div>
        </div>

        {/* Navigasi Utama */}
        <nav className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5">
          <Link
            href="/"
            onClick={onClose}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activePath === "/"
                ? "bg-cat-yellow text-slate-950 shadow-md font-bold"
                : "hover:bg-slate-500/10 active:scale-98"
            }`}
            style={{
              color: activePath === "/" ? "#020617" : "var(--text-primary)",
            }}
          >
            <LayoutDashboard className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
            <span>Dashboard Telemetri</span>
          </Link>

          {/* Menu Manajemen Pengguna: HANYA TAMPIL JIKA ROLE ADMIN (Kotak 'Admin' dihapus) */}
          {isAdmin && (
            <Link
              href="/users"
              onClick={onClose}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activePath === "/users"
                  ? "bg-cat-yellow text-slate-950 shadow-md font-bold"
                  : "hover:bg-slate-500/10 active:scale-98"
              }`}
              style={{
                color: activePath === "/users" ? "#020617" : "var(--text-primary)",
              }}
            >
              <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
              <span>Manajemen Pengguna</span>
            </Link>
          )}

          <div className="pt-2 pb-1">
            <div className="border-t border-[var(--glass-border)]" />
          </div>

          {/* Ubah Kata Sandi */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenChangePassword();
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-500/10 active:scale-98 transition-all text-left cursor-pointer"
            style={{ color: "var(--text-primary)" }}
          >
            <KeyRound className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-cat-yellow shrink-0" />
            <span>Ubah Kata Sandi</span>
          </button>
        </nav>

        {/* Footer Drawer & Tombol Logout (1 Warna Merah Terang Solid) */}
        <div className="p-3 sm:p-4 border-t border-[var(--glass-border)] space-y-3">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/25 transition-all active:scale-98 min-h-[42px] cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Keluar / Logout</span>
          </button>

          <div
            className="text-[10px] text-center font-medium flex items-center justify-center gap-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span>CAT 950L IoT Telemetry v1.0</span>
          </div>
        </div>
      </aside>

      {/* ─── Modal Konfirmasi Logout (Langsung Inti & Minimalis) ─── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="relative w-full max-w-xs glass-card p-5 rounded-2xl shadow-2xl border border-[var(--glass-border)] z-10 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3
                className="font-display text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Konfirmasi Keluar
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Apakah Anda yakin ingin logout?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold glass-subtle hover:bg-slate-500/15 transition-all cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onClose();
                  onLogout();
                }}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Ya, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

