"use client";

import React, { useState } from "react";
import { KeyRound, X, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  token,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleReset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMsg("");
    setSuccessMsg("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Semua kolom kata sandi wajib diisi.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("Kata sandi baru minimal 6 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMsg("Kata sandi baru tidak boleh sama dengan kata sandi lama.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "Kata sandi berhasil diubah!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          handleReset();
        }, 1500);
      } else {
        setErrorMsg(data.message || "Gagal mengubah kata sandi.");
      }
    } catch (err: unknown) {
      setErrorMsg("Terjadi kesalahan jaringan atau server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-pwd-title"
      onClick={handleReset}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel glass-card w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl relative"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cat-yellow/15 border border-cat-yellow/30 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-cat-yellow" />
            </div>
            <div>
              <h2
                id="change-pwd-title"
                className="font-display text-lg font-bold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Ubah Kata Sandi
              </h2>
              <p
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Perbarui kata sandi akun Anda
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-lg hover:bg-slate-500/10 active:scale-95 transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="current-password"
              className="block text-xs font-semibold mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Kata Sandi Saat Ini
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Masukkan kata sandi lama"
                className="w-full glass-input px-3.5 py-2.5 text-sm font-medium pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Toggle password"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full glass-input px-3.5 py-2.5 text-sm font-medium pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Toggle password"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Konfirmasi Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi baru"
                className="w-full glass-input px-3.5 py-2.5 text-sm font-medium pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Toggle password"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--glass-border)]">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold glass-subtle hover:bg-slate-500/10 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[42px] px-5 py-2 rounded-lg text-xs font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Simpan Kata Sandi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

