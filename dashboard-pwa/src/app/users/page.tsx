"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, AuthUser } from "@/lib/authContext";
import { SideMenu } from "@/components/SideMenu";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import {
  Users,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Search,
  Filter,
  Trash2,
  Pencil,
  RotateCcw,
  Menu,
  Sun,
  Moon,
  ArrowLeft,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from "lucide-react";

interface ManagedUser {
  id: string;
  username: string;
  role: "Admin" | "User";
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_super_admin: boolean;
}

interface UserStats {
  total: number;
  admin: number;
  user: number;
}

export default function UsersManagementPage() {
  const router = useRouter();
  const { user, token, isLoading, isAdmin, logout } = useAuth();

  // State Halaman
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<UserStats>({ total: 0, admin: 0, user: 0 });
  const [isFetching, setIsFetching] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string>("");

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "Admin" | "User">("ALL");

  // Side Menu & Modal States
  const [sideMenuOpen, setSideMenuOpen] = useState<boolean>(false);
  const [showChangePwdModal, setShowChangePwdModal] = useState<boolean>(false);

  // Modal Tambah User
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addUsername, setAddUsername] = useState<string>("");
  const [addPassword, setAddPassword] = useState<string>("");
  const [addRole, setAddRole] = useState<"Admin" | "User">("User");
  const [addError, setAddError] = useState<string>("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);

  // Modal Edit User
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState<"Admin" | "User">("User");
  const [editNewPassword, setEditNewPassword] = useState<string>("");
  const [editError, setEditError] = useState<string>("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Modal Konfirmasi Hapus User
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Feedback Toast / Banner
  const [feedbackSuccess, setFeedbackSuccess] = useState<string>("");

  // Tema
  const [theme, setTheme] = useState<string>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cat950l-theme");
      const current = saved === "dark" || saved === "light" ? saved : "light";
      setTheme(current);
      document.documentElement.setAttribute("data-theme", current);
    } catch {
      setTheme("light");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("cat950l-theme", next);
      document.documentElement.setAttribute("data-theme", next);
    } catch {
      // ignore
    }
  }, [theme]);

  // Route Guard: Harus Login & Harus Admin
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (!isAdmin) {
        router.replace("/");
      }
    }
  }, [user, isLoading, isAdmin, router]);

  // Fetch Daftar Pengguna
  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setIsFetching(true);
    setFetchError("");

    try {
      const res = await fetch("/api/auth/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUsersList(data.users || []);
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        setFetchError(data.message || "Gagal memuat data pengguna.");
      }
    } catch (err: unknown) {
      setFetchError("Gagal terhubung ke server untuk memuat pengguna.");
    } finally {
      setIsFetching(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && isAdmin) {
      fetchUsers();
    }
  }, [token, isAdmin, fetchUsers]);

  // Filter & Search Logic
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [usersList, searchQuery, roleFilter]);

  // Submit Tambah Pengguna Baru
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");

    if (!addUsername.trim() || !addPassword) {
      setAddError("Username dan password wajib diisi.");
      return;
    }

    if (addPassword.length < 6) {
      setAddError("Password minimal 6 karakter.");
      return;
    }

    setIsSubmittingAdd(true);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: addUsername.trim(),
          password: addPassword,
          role: addRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowAddModal(false);
        setAddUsername("");
        setAddPassword("");
        setAddRole("User");
        setFeedbackSuccess(data.message || "Pengguna baru berhasil ditambahkan.");
        setTimeout(() => setFeedbackSuccess(""), 4000);
        fetchUsers();
      } else {
        setAddError(data.message || "Gagal menambahkan pengguna.");
      }
    } catch {
      setAddError("Terjadi kesalahan jaringan atau server.");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Submit Edit Pengguna
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError("");

    if (editNewPassword && editNewPassword.length < 6) {
      setEditError("Password baru minimal 6 karakter.");
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/auth/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: editRole,
          password: editNewPassword || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowEditModal(false);
        setEditingUser(null);
        setEditNewPassword("");
        setFeedbackSuccess(data.message || "Data pengguna berhasil diperbarui.");
        setTimeout(() => setFeedbackSuccess(""), 4000);
        fetchUsers();
      } else {
        setEditError(data.message || "Gagal memperbarui pengguna.");
      }
    } catch {
      setEditError("Terjadi kesalahan jaringan atau server.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Submit Hapus Pengguna
  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/auth/users/${deletingUser.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowDeleteModal(false);
        setDeletingUser(null);
        setFeedbackSuccess(data.message || "Pengguna berhasil dihapus.");
        setTimeout(() => setFeedbackSuccess(""), 4000);
        fetchUsers();
      } else {
        alert(data.message || "Gagal menghapus pengguna.");
      }
    } catch {
      alert("Terjadi kesalahan saat menghapus pengguna.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4">
        <div className="glass-card p-6 rounded-2xl flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-cat-yellow animate-spin" />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Memverifikasi hak akses Administrator...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-canvas">
      {/* ─── Top Header Bar ─── */}
      <header className="glass-elevated shrink-0 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-20 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setSideMenuOpen(true)}
            className="p-2 rounded-lg glass-subtle hover:bg-white/10 active:scale-95 transition-all text-slate-800 dark:text-slate-100 flex items-center justify-center min-w-[40px] min-h-[40px]"
            aria-label="Buka Menu Samping"
            title="Menu Samping"
          >
            <Menu className="w-5 h-5 text-cat-yellow" />
          </button>

          {/* Logo CAT */}
          <div className="bg-white px-2 py-1 rounded-lg shadow-sm border border-slate-200/90 flex items-center justify-center shrink-0">
            <img
              src="/cat-logo.png"
              alt="CAT Logo"
              className="h-5 sm:h-6 w-auto object-contain"
            />
          </div>

          <span className="w-1.5 h-6 sm:h-7 rounded-sm bg-cat-yellow shrink-0" aria-hidden="true" />
          <div>
            <h1
              className="font-display text-sm sm:text-base lg:text-lg font-bold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Manajemen Pengguna
            </h1>
            <p className="text-[10px] sm:text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Kelola akun operator dan hak akses Caterpillar 950L
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-slate-500/10 active:scale-95 transition-all text-xs font-semibold flex items-center gap-1.5 min-h-[38px]"
            style={{ color: "var(--text-primary)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kembali ke Dashboard</span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg glass-subtle hover:bg-slate-500/10 active:scale-95 transition-all min-w-[38px] min-h-[38px] flex items-center justify-center"
            style={{ color: "var(--text-primary)" }}
            aria-label="Ganti Tema"
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </header>

      {/* ─── Konten Utama ─── */}
      <main className="flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto space-y-4 sm:space-y-6">
        {/* Banner Sukses */}
        {feedbackSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-sm animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {/* ─── Tiga Kartu Statistik (KPI Cards) ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="glass-card p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[var(--glass-border)] shadow-sm">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Total Pengguna
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>
                {stats.total}
              </h3>
              <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Akun terdaftar dalam sistem
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-500 shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="glass-card p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[var(--glass-border)] shadow-sm">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Administrator
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold mt-1 text-cat-yellow">
                {stats.admin}
              </h3>
              <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Hak akses penuh & manajemen
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cat-yellow/15 border border-cat-yellow/30 flex items-center justify-center text-cat-yellow shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="glass-card p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[var(--glass-border)] shadow-sm">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Pengguna Biasa
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold mt-1 text-emerald-500">
                {stats.user}
              </h3>
              <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Hak akses monitoring telemetri
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* ─── Action & Filter Bar ─── */}
        <div className="glass-card p-3 sm:p-4 rounded-2xl border border-[var(--glass-border)] flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari berdasarkan username..."
                className="w-full glass-input pl-9 pr-3.5 py-2 text-xs sm:text-sm font-medium"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "ALL" | "Admin" | "User")}
                className="glass-input px-3 py-2 text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                <option value="ALL">Semua Role</option>
                <option value="Admin">Hanya Admin</option>
                <option value="User">Hanya User</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchUsers}
              disabled={isFetching}
              className="p-2 sm:px-3 sm:py-2 rounded-xl glass-subtle hover:bg-slate-500/10 active:scale-95 transition-all text-xs font-semibold flex items-center gap-1.5 min-h-[40px]"
              style={{ color: "var(--text-secondary)" }}
              title="Segarkan Data"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>

            {/* Tombol Tambah Pengguna Baru (Khusus Admin) */}
            <button
              type="button"
              onClick={() => {
                setAddUsername("");
                setAddPassword("");
                setAddRole("User");
                setAddError("");
                setShowAddModal(true);
              }}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center gap-2 shadow-md active:scale-95 min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Pengguna</span>
            </button>
          </div>
        </div>

        {/* ─── Tabel Daftar Pengguna ─── */}
        <div className="glass-card rounded-2xl border border-[var(--glass-border)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)] bg-slate-500/5">
                  <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Pengguna
                  </th>
                  <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Peran / Role
                  </th>
                  <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
                    Waktu Terdaftar
                  </th>
                  <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider hidden lg:table-cell" style={{ color: "var(--text-muted)" }}>
                    Terakhir Masuk
                  </th>
                  <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-right" style={{ color: "var(--text-muted)" }}>
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-border)]">
                {isFetching && usersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-cat-yellow animate-spin" />
                        <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                          Memuat data pengguna...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center">
                      <p className="text-xs sm:text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                        Tidak ada pengguna yang cocok dengan kriteria pencarian.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-500/5 transition-colors">
                        <td className="py-3.5 px-4 font-semibold">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                                u.role === "Admin"
                                  ? "bg-cat-yellow/20 text-cat-yellow border border-cat-yellow/40"
                                  : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {u.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                                  {u.username}
                                </span>
                                {isSelf && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400 font-bold">
                                    Anda
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] block text-muted font-normal">
                                {u.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              u.role === "Admin"
                                ? "bg-cat-yellow/20 text-cat-yellow border border-cat-yellow/40"
                                : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.role === "Admin" ? "bg-cat-yellow" : "bg-emerald-500"
                              }`}
                            />
                            {u.role}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 hidden md:table-cell text-xs" style={{ color: "var(--text-secondary)" }}>
                          {new Date(u.created_at).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>

                        <td className="py-3.5 px-4 hidden lg:table-cell text-xs" style={{ color: "var(--text-secondary)" }}>
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString("id-ID", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "-"}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Tombol Edit Peran & Sandi */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(u);
                                setEditRole(u.role);
                                setEditNewPassword("");
                                setEditError("");
                                setShowEditModal(true);
                              }}
                              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg glass-subtle hover:bg-slate-500/10 active:scale-95 transition-all text-xs font-semibold flex items-center gap-1"
                              style={{ color: "var(--text-primary)" }}
                              title="Edit Pengguna"
                            >
                              <Pencil className="w-3.5 h-3.5 text-sky-500" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>

                            {/* Tombol Hapus Pengguna (Khusus Admin, Super Admin diproteksi) */}
                            <button
                              type="button"
                              disabled={u.is_super_admin || isSelf}
                              onClick={() => {
                                setDeletingUser(u);
                                setShowDeleteModal(true);
                              }}
                              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg transition-all text-xs font-semibold flex items-center gap-1 ${
                                u.is_super_admin || isSelf
                                  ? "opacity-30 cursor-not-allowed text-slate-400"
                                  : "text-rose-500 hover:bg-rose-500/15 active:scale-95"
                              }`}
                              title={
                                u.is_super_admin
                                  ? "Super Admin tidak dapat dihapus"
                                  : isSelf
                                  ? "Tidak dapat menghapus akun sendiri saat login"
                                  : "Hapus Pengguna"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ─── Modal Tambah Pengguna Baru ─── */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAddModal(false)}
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel glass-card w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cat-yellow/15 border border-cat-yellow/30 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5 text-cat-yellow" />
                </div>
                <div>
                  <h2 className="font-display text-base sm:text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    Tambah Pengguna Baru
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Khusus dibuat oleh Administrator
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              {addError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Username
                </label>
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="Contoh: operator1"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Pilihan Peran / Role
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "Admin" | "User")}
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <option value="User">User (Pengguna Monitoring)</option>
                  <option value="Admin">Admin (Administrator Sistem)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold glass-subtle hover:bg-slate-500/10 transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingAdd && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Pengguna</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Edit Pengguna ─── */}
      {showEditModal && editingUser && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowEditModal(false)}
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel glass-card w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <h2 className="font-display text-base sm:text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    Edit Akun: {editingUser.username}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Ubah peran atau reset password akun
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Peran / Role
                </label>
                <select
                  disabled={editingUser.is_super_admin}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "Admin" | "User")}
                  className={`w-full glass-input px-3.5 py-2.5 text-sm font-medium ${
                    editingUser.is_super_admin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}
                  style={{ color: "var(--text-primary)" }}
                >
                  <option value="User">User (Pengguna Monitoring)</option>
                  <option value="Admin">Admin (Administrator Sistem)</option>
                </select>
                {editingUser.is_super_admin && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    *Peran Super Admin tidak dapat diubah ke User.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Reset Password Baru (Opsional)
                </label>
                <input
                  type="password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold glass-subtle hover:bg-slate-500/10 transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Perbarui Pengguna</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Konfirmasi Hapus Pengguna ─── */}
      {showDeleteModal && deletingUser && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowDeleteModal(false)}
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel glass-card w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl relative"
          >
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--glass-border)]">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  Hapus Pengguna?
                </h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Tindakan ini tidak dapat dibatalkan
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Apakah Anda yakin ingin menghapus akun pengguna{" "}
              <strong className="text-cat-yellow font-bold">@{deletingUser.username}</strong> ({deletingUser.role})? Pengguna tidak akan dapat masuk lagi.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--glass-border)]">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold glass-subtle hover:bg-slate-500/10 transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Ubah Kata Sandi Mandiri ─── */}
      <ChangePasswordModal
        isOpen={showChangePwdModal}
        onClose={() => setShowChangePwdModal(false)}
        token={token}
      />

      {/* ─── Side Menu Overlay (Di atas halaman, tanpa pergeseran) ─── */}
      <SideMenu
        isOpen={sideMenuOpen}
        onClose={() => setSideMenuOpen(false)}
        user={user}
        activePath="/users"
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenBrokerSettings={() => router.push("/")}
        onOpenChangePassword={() => setShowChangePwdModal(true)}
        onLogout={logout}
      />
    </div>
  );
}

