"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  Server,
  Sun,
  Moon,
  LogOut,
  X,
  Shield,
  User,
  Radio,
} from "lucide-react";
import { AuthUser } from "@/lib/authContext";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  activePath?: "/" | "/users";
  theme: string;
  onToggleTheme: () => void;
  onOpenBrokerSettings: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export function SideMenu({
  isOpen,
  onClose,
  user,
  activePath = "/",
  theme,
  onToggleTheme,
  onOpenBrokerSettings,
  onOpenChangePassword,
  onLogout,
}: SideMenuProps) {
  // Tutup menu saat menekan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      // Cegah scrolling pada background ketika drawer terbuka
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

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
        onClick={onClose}
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
            <span
              className="w-1.5 h-7 rounded-sm bg-cat-yellow shrink-0"
              aria-hidden="true"
            />
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

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-500/10 active:scale-95 transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Tutup Menu"
            title="Tutup Menu"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Profil Akun Aktif */}
        <div className="p-4 border-b border-[var(--glass-border)]">
          <div className="glass-subtle p-3 rounded-xl border border-[var(--glass-outline)] flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isAdmin
                  ? "bg-cat-yellow/15 border-cat-yellow/30 text-cat-yellow"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {isAdmin ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-xs sm:text-sm font-bold truncate leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {user?.username || "Pengguna"}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? "bg-cat-yellow/20 text-cat-yellow border border-cat-yellow/40"
                      : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isAdmin ? "bg-cat-yellow" : "bg-emerald-500"
                    }`}
                  />
                  {user?.role || "User"}
                </span>
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

          {/* Menu Manajemen Pengguna: HANYA TAMPIL JIKA ROLE ADMIN */}
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
              <div className="flex items-center justify-between flex-1">
                <span>Manajemen Pengguna</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cat-yellow/20 text-cat-yellow font-bold uppercase tracking-wider border border-cat-yellow/30">
                  Admin
                </span>
              </div>
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
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-500/10 active:scale-98 transition-all text-left"
            style={{ color: "var(--text-primary)" }}
          >
            <KeyRound className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-cat-yellow shrink-0" />
            <span>Ubah Kata Sandi</span>
          </button>

          {/* Pengaturan Broker MQTT */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenBrokerSettings();
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-500/10 active:scale-98 transition-all text-left"
            style={{ color: "var(--text-primary)" }}
          >
            <Server className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-sky-500 shrink-0" />
            <span>Pengaturan Broker</span>
          </button>

          {/* Toggle Tema */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-500/10 active:scale-98 transition-all text-left"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="flex items-center gap-3">
              {theme === "light" ? (
                <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-indigo-500 shrink-0" />
              ) : (
                <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400 shrink-0" />
              )}
              <span>Tampilan Tema</span>
            </div>
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {theme === "light" ? "Terang" : "Gelap"}
            </span>
          </button>
        </nav>

        {/* Footer Drawer & Tombol Logout */}
        <div className="p-3 sm:p-4 border-t border-[var(--glass-border)] space-y-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-rose-500/15 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white border border-rose-500/30 transition-all active:scale-98 min-h-[42px]"
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
    </div>
  );
}

