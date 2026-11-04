"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { GaugeCard } from "@/components/GaugeCard";
import { HistoryTable } from "@/components/HistoryTable";
import { AlertBanner } from "@/components/AlertBanner";
import { levelOf, overallLevel, type Level } from "@/lib/thresholds";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import {
  createBrowserMqttClient,
  validateBrokerConfig,
  sanitizeTelemetryPayload,
  sanitizeAlertMessage,
} from "@/lib/mqttClient";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { soundAlarm } from "@/lib/soundAlarm";
import { BootIntro } from "@/components/BootIntro";
import {
  Settings,
  X,
  Sun,
  Moon,
  Server,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";

interface TelemetryState {
  rpm: number;
  load: number;
  temp: number;
  map: number;
  spd: number;
  volt: number;
  st: number;
  updatedAt: number;
}

interface ActiveBrokerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

// Riwayat per detik: 3600 baris = 1 jam terakhir dalam memori
const MAX_LOG_SAMPLES = 3600;
// Jumlah baris yang dipulihkan / disimpan ke sessionStorage
const PERSIST_LOG_LIMIT = 100;
// Data dianggap basi jika tidak ada kiriman baru selama 5 detik
const STALE_AFTER_MS = 5000;

const DEFAULT_BROKER: ActiveBrokerConfig = {
  host:
    process.env.NEXT_PUBLIC_EMQX_BROKER_HOST ||
    process.env.NEXT_PUBLIC_EMQX_HOST ||
    "broker.emqx.io",
  port:
    Number(
      process.env.NEXT_PUBLIC_EMQX_BROKER_PORT ||
        process.env.NEXT_PUBLIC_EMQX_PORT
    ) || 8084,
  username:
    process.env.NEXT_PUBLIC_EMQX_USERNAME ||
    process.env.NEXT_PUBLIC_EMQX_USER ||
    "",
  password:
    process.env.NEXT_PUBLIC_EMQX_PASSWORD ||
    process.env.NEXT_PUBLIC_EMQX_PASS ||
    "",
};

function getStateLabel(st: number): string {
  switch (st) {
    case 0:
      return "COLD";
    case 1:
      return "NOMINAL";
    case 2:
      return "WARNING";
    case 3:
      return "CRITICAL";
    default:
      return "STANDBY";
  }
}

function formatFileTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function DashboardPage() {
  // Live Telemetry State (Hardware Real Data)
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    rpm: 0,
    load: 0,
    temp: 28,
    map: 101,
    spd: 0,
    volt: 24.5,
    st: 1,
    updatedAt: Date.now(),
  });

  // Riwayat per detik (sumber tabel kanan dan file unduhan)
  const [recordedLog, setRecordedLog] = useState<TelemetryState[]>([]);

  // Waktu data terakhir masuk (null = belum pernah) dan jam yang berdetak tiap detik
  const [lastDataAt, setLastDataAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const telemetryRef = useRef<TelemetryState | null>(null);
  const lastDataAtRef = useRef<number | null>(null);

  // Theme State (Default Light Frosted Glass)
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Connection & Packet Stats
  const [mqttConnected, setMqttConnected] = useState(false);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [lastAlert, setLastAlert] = useState<string>("");
  const [packetCount, setPacketCount] = useState(0);
  const [packetRate, setPacketRate] = useState(0);
  const packetCountRef = useRef(0);
  const packetsInWindowRef = useRef(0);
  const lastRateCalcRef = useRef(Date.now());

  // Audio Alarm Mute State
  const [isMuted, setIsMuted] = useState<boolean>(() => soundAlarm.isMuted());

  // UI Modal Controls
  const [showConfig, setShowConfig] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Active Broker Config
  const [activeBroker, setActiveBroker] =
    useState<ActiveBrokerConfig>(DEFAULT_BROKER);

  // Draft Form Inputs inside Broker Modal
  const [draftHost, setDraftHost] = useState(DEFAULT_BROKER.host);
  const [draftPort, setDraftPort] = useState(String(DEFAULT_BROKER.port));
  const [draftUser, setDraftUser] = useState(DEFAULT_BROKER.username);
  const [draftPass, setDraftPass] = useState(DEFAULT_BROKER.password);
  const [configError, setConfigError] = useState<string>("");
  const [configSavedMsg, setConfigSavedMsg] = useState<string>("");

  const mqttClientRef = useRef<any>(null);
  const lastDbSaveRef = useRef<number>(0);

  // Tandai bahwa data baru masuk dari hardware Node 3
  const markDataReceived = useCallback((snapshot: TelemetryState) => {
    telemetryRef.current = snapshot;
    lastDataAtRef.current = snapshot.updatedAt;
    setLastDataAt(snapshot.updatedAt);
  }, []);

  // Pulihkan riwayat (maks 100 baris) dari sessionStorage atau Supabase saat awal muat
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("cat950l-recorded-log");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecordedLog(parsed.slice(-PERSIST_LOG_LIMIT));
          return;
        }
      }

      // Jika sessionStorage kosong, coba muat dari database melalui API
      fetch("/api/telemetry?limit=100")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.records && Array.isArray(data.records) && data.records.length > 0) {
            const mapped: TelemetryState[] = data.records.map((r: any) => ({
              rpm: Number(r.rpm ?? 0),
              load: Number(r.load_pct ?? r.load ?? 0),
              temp: Number(r.temp_c ?? r.temp ?? 0),
              map: Number(r.map_kpa ?? r.map ?? 0),
              spd: Number(r.speed_kmh ?? r.spd ?? 0),
              volt: Number(r.volt_v ?? r.volt ?? 0),
              st: Number(r.state_level ?? r.st ?? 1),
              updatedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            }));
            const trimmed = mapped.slice(-PERSIST_LOG_LIMIT);
            setRecordedLog(trimmed);
            sessionStorage.setItem("cat950l-recorded-log", JSON.stringify(trimmed));
          }
        })
        .catch(() => {});
    } catch {}
  }, []);

  // Pencatat riwayat: tepat 1 baris per detik selama data masih segar + hitung packet rate
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setNowTick(now);

      // Hitung packet rate (packets / detik)
      const elapsedSec = Math.max(1, (now - lastRateCalcRef.current) / 1000);
      const rate = packetsInWindowRef.current / elapsedSec;
      setPacketRate(rate);
      packetsInWindowRef.current = 0;
      lastRateCalcRef.current = now;

      const last = lastDataAtRef.current;
      const snap = telemetryRef.current;
      if (!snap || last === null || now - last > STALE_AFTER_MS) return;

      setRecordedLog((prev) => {
        const next = [...prev, { ...snap, updatedAt: now }];
        const trimmed =
          next.length > MAX_LOG_SAMPLES
            ? next.slice(next.length - MAX_LOG_SAMPLES)
            : next;

        // Sinkronkan 100 baris terbaru ke sessionStorage
        try {
          sessionStorage.setItem(
            "cat950l-recorded-log",
            JSON.stringify(trimmed.slice(-PERSIST_LOG_LIMIT))
          );
        } catch {}

        return trimmed;
      });
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // Initialize Theme & Saved Broker from storage
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("cat950l-theme");
      const resolvedTheme = savedTheme === "dark" ? "dark" : "light";
      setTheme(resolvedTheme);
      document.documentElement.setAttribute("data-theme", resolvedTheme);

      const savedBroker = localStorage.getItem("cat950l-broker");
      const savedPass = sessionStorage.getItem("cat950l-broker-pass") || "";
      if (savedBroker) {
        const parsed = JSON.parse(savedBroker);
        const check = validateBrokerConfig(parsed.host, Number(parsed.port));
        if (check.valid) {
          const restored: ActiveBrokerConfig = {
            host: check.sanitizedHost,
            port: check.sanitizedPort,
            username:
              typeof parsed.username === "string" ? parsed.username : "",
            password: savedPass,
          };
          setActiveBroker(restored);
          setDraftHost(restored.host);
          setDraftPort(String(restored.port));
          setDraftUser(restored.username);
          setDraftPass(savedPass);
        }
      }
    } catch {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  // Toggle Light / Dark Theme
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    try {
      localStorage.setItem("cat950l-theme", nextTheme);
    } catch {}
  };

  // Toggle Audio Alarm Mute
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundAlarm.setMuted(next);
  };

  // Close active pop-up on Escape key
  useEffect(() => {
    if (!showConfig && !showClearConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfig(false);
        setShowClearConfirm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfig, showClearConfirm]);

  // Apply & Validate Broker Config
  const handleApplyBroker = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError("");
    setConfigSavedMsg("");

    const validation = validateBrokerConfig(draftHost, Number(draftPort));
    if (!validation.valid) {
      setConfigError(validation.error || "Konfigurasi broker tidak valid.");
      return;
    }

    const nextConfig: ActiveBrokerConfig = {
      host: validation.sanitizedHost,
      port: validation.sanitizedPort,
      username: draftUser.trim(),
      password: draftPass,
    };

    setActiveBroker(nextConfig);
    setDraftHost(nextConfig.host);
    setDraftPort(String(nextConfig.port));

    try {
      localStorage.setItem(
        "cat950l-broker",
        JSON.stringify({
          host: nextConfig.host,
          port: nextConfig.port,
          username: nextConfig.username,
        })
      );
      if (nextConfig.password) {
        sessionStorage.setItem("cat950l-broker-pass", nextConfig.password);
      } else {
        sessionStorage.removeItem("cat950l-broker-pass");
      }
    } catch {}

    setConfigSavedMsg(
      `Terhubung ulang ke ${nextConfig.host}:${nextConfig.port} (WSS)`
    );
  };

  const handleSelectPreset = (presetHost: string, presetPort: number) => {
    setDraftHost(presetHost);
    setDraftPort(String(presetPort));
    setConfigError("");
    setConfigSavedMsg("");
  };

  // Export Telemetry Log to CSV (Excel-ready with UTF-8 BOM)
  const handleExportCsv = () => {
    const samples = recordedLog.length > 0 ? recordedLog : [telemetry];
    const headers = [
      "No",
      "ISO_Timestamp",
      "Waktu_Lokal",
      "Engine_RPM_SPN190",
      "Engine_Load_Pct_SPN92",
      "Coolant_Temp_C_SPN110",
      "Intake_MAP_kPa_SPN102",
      "Vehicle_Speed_kmh_SPN84",
      "Battery_Volt_V_SPN168",
      "State_Code",
      "Status_Label",
    ];

    const csvRows = samples.map((item, idx) => {
      const d = new Date(item.updatedAt);
      const iso = d.toISOString();
      const localTime = d.toLocaleTimeString("id-ID", { hour12: false });
      return [
        idx + 1,
        iso,
        localTime,
        item.rpm,
        item.load,
        item.temp,
        item.map,
        item.spd,
        item.volt.toFixed(1),
        item.st,
        getStateLabel(item.st),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...csvRows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cat950l-telemetry-${formatFileTimestamp(Date.now())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Telemetry Log to JSON
  const handleExportJson = () => {
    const samples = recordedLog.length > 0 ? recordedLog : [telemetry];
    const exportPayload = {
      equipment: "Caterpillar 950L Wheel Loader",
      protocol: "SAE J1939 (CAN 2.0B 29-bit @ 250 kbps)",
      broker: `${activeBroker.host}:${activeBroker.port}`,
      exportedAt: new Date().toISOString(),
      totalSamples: samples.length,
      records: samples.map((item, index) => ({
        seq: index + 1,
        timestamp: new Date(item.updatedAt).toISOString(),
        rpm_spn190: item.rpm,
        load_pct_spn92: item.load,
        coolant_temp_c_spn110: item.temp,
        intake_map_kpa_spn102: item.map,
        vehicle_speed_kmh_spn84: item.spd,
        battery_volt_v_spn168: item.volt,
        state_level: item.st,
        status: getStateLabel(item.st),
      })),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cat950l-telemetry-${formatFileTimestamp(Date.now())}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    setRecordedLog([]);
    try {
      sessionStorage.removeItem("cat950l-recorded-log");
    } catch {}
  };

  // Status per parameter (satu sumber kebenaran, sama dengan tabel riwayat)
  const stateRpm = levelOf("rpm", telemetry.rpm);
  const stateLoad = levelOf("load", telemetry.load);
  const stateTemp = levelOf("temp", telemetry.temp);
  const stateMap = levelOf("map", telemetry.map);
  const stateSpeed = levelOf("spd", telemetry.spd);
  const stateVolt = levelOf("volt", telemetry.volt);

  const secondsSinceData =
    lastDataAt === null ? null : Math.max(0, Math.floor((nowTick - lastDataAt) / 1000));
  const noData = lastDataAt === null || nowTick - lastDataAt > STALE_AFTER_MS;
  const isRecording = !noData;

  const overall: Level = overallLevel(telemetry);
  const problemNames = (
    [
      ["Engine Speed (RPM)", stateRpm],
      ["Engine Temp", stateTemp],
      ["Engine Load", stateLoad],
      ["Boost Pressure", stateMap],
      ["Speed", stateSpeed],
      ["System Voltage", stateVolt],
    ] as [string, Level][]
  )
    .filter(([, lv]) => lv === overall && lv >= 2)
    .map(([name]) => name);

  // Audio Alarm Controller: bersuara jika warning (lv 2) atau critical (lv 3)
  useEffect(() => {
    if (noData) {
      soundAlarm.updateAlarm(1);
    } else {
      soundAlarm.updateAlarm(overall);
    }
  }, [overall, noData]);

  // MQTT over WebSocket Client (Data Real dari Hardware Node 3)
  useEffect(() => {
    try {
      const client = createBrowserMqttClient({
        host: activeBroker.host,
        port: activeBroker.port,
        username: activeBroker.username || undefined,
        password: activeBroker.password || undefined,
      });

      mqttClientRef.current = client;

      client.on("connect", () => {
        setMqttConnected(true);
        client.subscribe(
          ["cat950l/telemetry", "cat950l/alerts", "cat950l/status"],
          { qos: 1 }
        );
      });

      client.on("message", (topic, message) => {
        const payloadStr = message.toString();

        if (topic === "cat950l/status") {
          try {
            const stObj = JSON.parse(payloadStr);
            setGatewayOnline(stObj?.status === "online");
          } catch {
            setGatewayOnline(payloadStr.includes("online"));
          }
        }

        if (topic === "cat950l/telemetry") {
          const clean = sanitizeTelemetryPayload(payloadStr);
          const now = Date.now();
          const snapshot: TelemetryState = {
            ...clean,
            updatedAt: now,
          };

          // Increment telemetry packet counters
          packetCountRef.current += 1;
          packetsInWindowRef.current += 1;
          setPacketCount(packetCountRef.current);

          setTelemetry(snapshot);
          markDataReceived(snapshot);
          setGatewayOnline(true);

          // Simpan ke Supabase via backend route (dibatasi 1x per 5 detik)
          if (now - lastDbSaveRef.current > 5000 && isSupabaseConfigured()) {
            lastDbSaveRef.current = now;
            fetch("/api/telemetry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rpm: clean.rpm,
                load: clean.load,
                temp: clean.temp,
                map: clean.map,
                spd: clean.spd,
                volt: clean.volt,
                st: overallLevel(clean),
              }),
            }).catch(() => {});
          }
        }

        if (topic === "cat950l/alerts") {
          try {
            const alertObj = JSON.parse(payloadStr);
            const rawText =
              typeof alertObj?.event === "string"
                ? `${alertObj.event}: ${JSON.stringify(alertObj.raw ?? "")}`
                : payloadStr;
            setLastAlert(sanitizeAlertMessage(rawText));
          } catch {
            setLastAlert(sanitizeAlertMessage(payloadStr));
          }
        }
      });

      client.on("close", () => setMqttConnected(false));
      client.on("error", () => {
        setMqttConnected(false);
      });

      return () => {
        if (client) client.end();
      };
    } catch {
      setMqttConnected(false);
    }
  }, [activeBroker, markDataReceived]);

  const btn =
    "min-h-[42px] px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors";

  return (
    <div className="min-h-screen lg:h-screen lg:w-screen lg:overflow-hidden flex flex-col">
      {/* ─── Caterpillar 950L Boot Animation (Hanya muncul sekali per sesi) ─── */}
      <BootIntro />

      {/* ─── Header ─── */}
      <header className="glass-elevated shrink-0 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-9 rounded-sm bg-cat-yellow shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Wheel Loader Caterpillar 950L
            </h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              SAE J1939 CAN-Bus Real-Time Telemetry
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConnectionStatus
            mqttConnected={mqttConnected}
            gatewayOnline={gatewayOnline}
            brokerHost={activeBroker.host}
            secondsSinceData={secondsSinceData}
            packetCount={packetCount}
            packetRate={packetRate}
          />

          {/* Tombol Mute / Unmute Audio Alarm */}
          <button
            type="button"
            onClick={toggleMute}
            className={`${btn} glass-subtle`}
            style={{ color: "var(--text-primary)" }}
            aria-label={isMuted ? "Aktifkan suara alarm" : "Bisukan suara alarm"}
            title={
              isMuted
                ? "Suara alarm dibisukan (klik untuk aktifkan)"
                : "Suara alarm aktif (klik untuk bisukan)"
            }
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-500" />
            )}
            <span className="hidden sm:inline">
              {isMuted ? "Mute" : "Audio"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowConfig(true);
              setConfigError("");
              setConfigSavedMsg("");
            }}
            className={`${btn} glass-subtle`}
            style={{ color: "var(--text-primary)" }}
            title="Pengaturan server"
            aria-label="Pengaturan server"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">Pengaturan Broker</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={`${btn} glass-subtle`}
            style={{ color: "var(--text-primary)" }}
            aria-label={theme === "light" ? "Ganti ke tampilan gelap" : "Ganti ke tampilan terang"}
            title={theme === "light" ? "Tampilan gelap" : "Tampilan terang"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </header>

      {/* ─── Isi utama: PC 1 layar penuh, HP bisa digulir ─── */}
      <main className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-12 gap-3.5 p-3.5 sm:p-4 overflow-y-auto lg:overflow-hidden">
        {/* Kiri: status + indikator lingkaran */}
        <div className="lg:col-span-7 flex flex-col gap-3.5 min-h-0">
          <div className="shrink-0">
            <AlertBanner
              state={overall}
              waiting={noData}
              problemNames={problemNames}
              lastAlertMessage={lastAlert}
            />
          </div>

          {/* Dua indikator utama (besar) di atas, empat pendukung di bawah */}
          <div className="flex-1 min-h-0 grid grid-cols-2 lg:grid-cols-4 lg:grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3.5">
            <GaugeCard
              size="lg"
              className="col-span-2"
              title="Engine Speed (RPM)"
              safeRangeText="< 2200 RPM"
              value={telemetry.rpm}
              unit="RPM"
              min={0}
              max={3000}
              warnThreshold={2200}
              alarmThreshold={2400}
              state={stateRpm}
              noData={noData}
            />

            <GaugeCard
              size="lg"
              className="col-span-2"
              title="Engine Temp"
              safeRangeText="71 - 104 °C"
              value={telemetry.temp}
              unit="°C"
              min={0}
              max={120}
              coldThreshold={71}
              warnThreshold={105}
              alarmThreshold={108}
              state={stateTemp}
              noData={noData}
            />

            <GaugeCard
              title="Engine Load"
              safeRangeText="< 95%"
              value={telemetry.load}
              unit="%"
              min={0}
              max={100}
              warnThreshold={95}
              alarmThreshold={100}
              state={stateLoad}
              noData={noData}
            />

            <GaugeCard
              title="Boost Pressure"
              safeRangeText="< 165 kPa"
              value={telemetry.map}
              unit="kPa"
              min={0}
              max={255}
              warnThreshold={165}
              alarmThreshold={200}
              state={stateMap}
              noData={noData}
            />

            <GaugeCard
              title="Speed"
              safeRangeText="< 39 km/jam"
              value={telemetry.spd}
              unit="km/jam"
              min={0}
              max={60}
              warnThreshold={39}
              alarmThreshold={42}
              state={stateSpeed}
              noData={noData}
            />

            <GaugeCard
              title="System Voltage"
              safeRangeText="23.0 - 28.5 Volt"
              value={telemetry.volt}
              unit="Volt"
              min={0}
              max={35}
              lowAlarmThreshold={18}
              lowWarnThreshold={22.9}
              warnThreshold={28.5}
              alarmThreshold={32}
              state={stateVolt}
              noData={noData}
              isFloat
            />
          </div>
        </div>

        {/* Kanan: riwayat per detik */}
        <div className="lg:col-span-5 flex flex-col min-h-0">
          <HistoryTable
            rows={recordedLog}
            isRecording={isRecording}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onClear={() => setShowClearConfirm(true)}
            className="flex-1 min-h-0"
          />
        </div>
      </main>

      {/* ═══════════ POP-UP KONFIRMASI HAPUS RIWAYAT DATA ═══════════ */}
      <div
        data-open={showClearConfirm}
        aria-hidden={!showClearConfirm}
        onClick={() => setShowClearConfirm(false)}
        className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-history-modal-title"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-panel glass-card w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h2
                  id="clear-history-modal-title"
                  className="font-display text-lg font-bold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Hapus Riwayat Data?
                </h2>
                <p
                  className="text-xs sm:text-sm font-medium mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Konfirmasi penghapusan tabel
                </p>
              </div>
            </div>
          </div>

          <p
            className="text-sm sm:text-[15px] leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Sebanyak{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {recordedLog.length} baris
            </strong>{" "}
            riwayat pada tabel akan dihapus. Pastikan Anda sudah
            mengunduh file Excel atau JSON jika data ini masih diperlukan.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--glass-border)]">
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="min-h-[42px] px-4 py-2 rounded-lg text-sm font-semibold glass-subtle hover:border-[var(--glass-border-strong)]"
              style={{ color: "var(--text-secondary)" }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                handleClearHistory();
                setShowClearConfirm(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
            >
              Hapus
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════ MODAL OVERLAY FOR SERVER/BROKER CONFIGURATION ═══════════ */}
      <div
        data-open={showConfig}
        aria-hidden={!showConfig}
        onClick={() => setShowConfig(false)}
        className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="broker-modal-title"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-panel glass-card w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2
                  id="broker-modal-title"
                  className="font-display text-lg sm:text-xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Pengaturan Koneksi Server (MQTT)
                </h2>
                <p
                  className="text-xs sm:text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Server aktif: {activeBroker.host}:{activeBroker.port}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="min-h-[40px] min-w-[40px] p-2 rounded-lg glass-subtle hover:border-[var(--glass-border-strong)] inline-flex items-center justify-center"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Tutup pengaturan server"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleApplyBroker} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="text-xs sm:text-sm font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Pilihan Server Bawaan:
              </span>
              <button
                type="button"
                onClick={() => handleSelectPreset("broker.emqx.io", 8084)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold glass-subtle hover:border-[var(--glass-border-strong)] inline-flex items-center gap-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Gunakan Server Default (broker.emqx.io:8084)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="broker-host"
                  className="block text-xs sm:text-sm font-semibold mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Alamat Server (Host / Domain)
                </label>
                <input
                  id="broker-host"
                  type="text"
                  value={draftHost}
                  onChange={(e) => setDraftHost(e.target.value)}
                  placeholder="broker.emqx.io"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="broker-port"
                  className="block text-xs sm:text-sm font-semibold mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Port WebSocket (WSS)
                </label>
                <input
                  id="broker-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={draftPort}
                  onChange={(e) => setDraftPort(e.target.value)}
                  placeholder="8084"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="broker-user"
                  className="block text-xs sm:text-sm font-semibold mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Nama Pengguna (Opsional)
                </label>
                <input
                  id="broker-user"
                  type="text"
                  value={draftUser}
                  onChange={(e) => setDraftUser(e.target.value)}
                  placeholder="Kosongkan jika publik"
                  autoComplete="username"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="broker-pass"
                  className="block text-xs sm:text-sm font-semibold mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Kata Sandi (Opsional)
                </label>
                <input
                  id="broker-pass"
                  type="password"
                  value={draftPass}
                  onChange={(e) => setDraftPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full glass-input px-3.5 py-2.5 text-sm font-medium"
                />
              </div>
            </div>

            {configError && (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{configError}</span>
              </div>
            )}

            {configSavedMsg && (
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{configSavedMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-[var(--glass-border)]">
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-lg text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 transition-colors"
              >
                Simpan & Hubungkan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
