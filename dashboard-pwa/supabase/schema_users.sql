-- ==============================================================================
-- TABEL PENGGUNA & ADMIN (CATERPILLAR 950L TELEMETRY)
-- Salin dan jalankan skrip ini di SQL Editor Supabase Anda
-- Dashboard Supabase -> Project -> SQL Editor -> New Query -> Run
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'User' CHECK (role IN ('Admin', 'User')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_sign_in_at TIMESTAMPTZ
);

-- Indeks performa pencarian
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- Aktifkan Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses Baca (Anon & Authenticated)
DROP POLICY IF EXISTS "Allow public read access on users" ON public.users;
CREATE POLICY "Allow public read access on users"
    ON public.users FOR SELECT
    TO anon, authenticated
    USING (true);

-- Kebijakan Akses Penuh untuk Service Role (Backend API)
DROP POLICY IF EXISTS "Allow service role full access on users" ON public.users;
CREATE POLICY "Allow service role full access on users"
    ON public.users FOR ALL
    TO service_role
    USING (true);

-- Masukkan Akun Default Super Admin 'admin'
INSERT INTO public.users (username, role)
VALUES ('admin', 'Admin')
ON CONFLICT (username) DO UPDATE
SET role = 'Admin', updated_at = now();
