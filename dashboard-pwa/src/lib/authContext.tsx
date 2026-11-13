"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface AuthUser {
  id: string;
  username: string;
  role: "Admin" | "User";
}

export interface AuthResult {
  success: boolean;
  message: string;
  field?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (
    username: string,
    password: string,
    confirmPassword?: string
  ) => Promise<AuthResult>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "cat950l_auth_token";
const USER_KEY = "cat950l_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Muat status autentikasi dari localStorage saat mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("[AuthProvider] Gagal membaca session dari storage:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (res.ok && data.success && data.token && data.user) {
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setToken(data.token);
          setUser(data.user);
          return { success: true, message: data.message || "Login berhasil." };
        }

        return {
          success: false,
          field: data.field,
          message: data.message || "Gagal masuk. Periksa username dan password Anda.",
        };
      } catch (err: unknown) {
        console.error("[login] Error:", err);
        return {
          success: false,
          message: "Tidak dapat terhubung ke server autentikasi.",
        };
      }
    },
    []
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      confirmPassword?: string
    ): Promise<AuthResult> => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, confirmPassword }),
        });

        const data = await res.json();

        if (res.ok && data.success && data.token && data.user) {
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setToken(data.token);
          setUser(data.user);
          return { success: true, message: data.message || "Pendaftaran berhasil." };
        }

        return {
          success: false,
          field: data.field,
          message: data.message || "Gagal melakukan pendaftaran.",
        };
      } catch (err: unknown) {
        console.error("[register] Error:", err);
        return {
          success: false,
          message: "Tidak dapat terhubung ke server autentikasi.",
        };
      }
    },
    []
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const refreshUser = useCallback(() => {
    try {
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // ignore
    }
  }, []);

  const isAdmin = user?.role === "Admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAdmin,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider");
  }
  return context;
}

