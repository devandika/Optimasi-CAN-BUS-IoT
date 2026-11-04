-- ==============================================================================
-- SKEMA BASIS DATA SUPABASE (POSTGRESQL)
-- PROJEK : Simulator Dual-Node CAN-Bus ECU Caterpillar 950L IoT Telemetry
-- ==============================================================================

-- 1. TABEL RIWAYAT TELEMETRI (TIME-SERIES TELEMETRY)
CREATE TABLE IF NOT EXISTS public.telemetry_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    rpm INTEGER NOT NULL CHECK (rpm BETWEEN 0 AND 10000),
    load_pct INTEGER NOT NULL CHECK (load_pct BETWEEN 0 AND 100),
    temp_c INTEGER NOT NULL CHECK (temp_c BETWEEN -40 AND 215),
    map_kpa INTEGER NOT NULL CHECK (map_kpa BETWEEN 0 AND 500),
    speed_kmh INTEGER NOT NULL CHECK (speed_kmh BETWEEN 0 AND 250),
    volt_v NUMERIC(4, 1) NOT NULL CHECK (volt_v BETWEEN 0 AND 60),
    state_level SMALLINT NOT NULL DEFAULT 1 CHECK (state_level BETWEEN 0 AND 3) -- 0: Cold, 1: Normal, 2: Warning, 3: Critical Alarm
);

-- Indeks performa kueri time-series
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON public.telemetry_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_state ON public.telemetry_history (state_level);

-- 2. TABEL LOG ALARM & KEGAGALAN MESIN (ALARM / FAULT LOGS)
CREATE TABLE IF NOT EXISTS public.alarm_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    event_type VARCHAR(50) NOT NULL,          -- 'WARNING_ALERT', 'CRITICAL_ALARM'
    parameter_name VARCHAR(50) NOT NULL,      -- 'RPM', 'LOAD', 'TEMP', 'MAP', 'SPEED', 'VOLT'
    trigger_value NUMERIC(8, 2) NOT NULL,
    threshold_value NUMERIC(8, 2) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')), -- 'WARNING', 'CRITICAL'
    message TEXT NOT NULL CHECK (char_length(message) <= 500)
);

-- Indeks riwayat alarm
CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON public.alarm_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_severity ON public.alarm_logs (severity);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.telemetry_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarm_logs ENABLE ROW LEVEL SECURITY;

-- 4. KEBIJAKAN AKSES (POLICIES)
-- Mengizinkan pembacaan publik (anon key) untuk dashboard Next.js
CREATE POLICY "Allow public read access on telemetry_history"
    ON public.telemetry_history FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow public read access on alarm_logs"
    ON public.alarm_logs FOR SELECT
    TO anon, authenticated
    USING (true);

-- Mengizinkan insert data telemetri dari API Ingestion Next.js / Edge Function
-- dengan validasi rentang fisik SAE J1939 pada level kebijakan RLS
CREATE POLICY "Allow insert access on telemetry_history"
    ON public.telemetry_history FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        rpm BETWEEN 0 AND 10000
        AND load_pct BETWEEN 0 AND 100
        AND temp_c BETWEEN -40 AND 215
        AND map_kpa BETWEEN 0 AND 500
        AND speed_kmh BETWEEN 0 AND 250
        AND volt_v BETWEEN 0 AND 60
        AND state_level BETWEEN 0 AND 3
    );

CREATE POLICY "Allow insert access on alarm_logs"
    ON public.alarm_logs FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        severity IN ('WARNING', 'CRITICAL')
        AND char_length(message) <= 500
    );

-- 5. VIEW AGREGASI REKAP TERAKHIR (LATEST TELEMETRY SNAPSHOT)
CREATE OR REPLACE VIEW public.latest_telemetry AS
SELECT * FROM public.telemetry_history
ORDER BY created_at DESC
LIMIT 1;

