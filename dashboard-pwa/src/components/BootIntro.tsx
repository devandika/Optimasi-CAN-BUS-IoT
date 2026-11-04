"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Cpu,
  Wifi,
  Activity,
  CheckCircle2,
  Radio,
  Zap,
  Gauge,
  Sparkles,
} from "lucide-react";

interface BootIntroProps {
  onComplete?: () => void;
}

interface ChannelStatus {
  id: string;
  name: string;
  unit: string;
  nominal: string;
  checkAt: number; // Persentase ketika sensor ini dinyatakan OK
}

const SENSOR_CHANNELS: ChannelStatus[] = [
  { id: "rpm", name: "Engine RPM", unit: "RPM", nominal: "< 2200", checkAt: 25 },
  { id: "load", name: "Engine Load", unit: "%", nominal: "< 95%", checkAt: 40 },
  { id: "temp", name: "Coolant Temp", unit: "°C", nominal: "71 - 104", checkAt: 55 },
  { id: "map", name: "Boost Press", unit: "kPa", nominal: "< 165", checkAt: 70 },
  { id: "spd", name: "Vehicle Speed", unit: "km/h", nominal: "< 39", checkAt: 82 },
  { id: "volt", name: "System Volt", unit: "V", nominal: "23.0 - 28.5", checkAt: 92 },
];

export const BootIntro: React.FC<BootIntroProps> = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Jalankan timer animasi halus ~60 FPS dari 0 hingga 100%
    const startTime = performance.now();
    const duration = 2400; // 2.4 detik total intro yang mulus
    let animId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = Math.min(1, elapsed / duration);

      // Kurva Easing Cubic yang lembut (lembut di awal, mengalir, lembut di akhir)
      const ease =
        rawProgress < 0.5
          ? 4 * rawProgress * rawProgress * rawProgress
          : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;

      const currentPct = Math.round(ease * 100);
      setProgress(currentPct);

      if (rawProgress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        // Selesai 100%: tunggu sejenak agar efek READY terlihat lalu fade out
        setTimeout(() => {
          setIsClosing(true);
          setTimeout(() => {
            setVisible(false);
            onComplete?.();
          }, 450);
        }, 400);
      }
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [onComplete]);

  // Radius dan kalkulasi arc SVG untuk lingkaran HUD di tengah
  const circleRadius = 58;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const currentStage = useMemo(() => {
    if (progress < 30) {
      return {
        step: 1,
        title: "INITIALIZING CAN FIELDBUS",
        subtitle: "Memverifikasi Bus CAN 2.0B 500 kbps & Node 1 ECU...",
        icon: Cpu,
        color: "text-amber-400",
      };
    } else if (progress < 70) {
      return {
        step: 2,
        title: "SYNCHRONIZING IOT GATEWAY",
        subtitle: "Sinkronisasi Serial UART2 ESP 2 & EMQX Cloud MQTT...",
        icon: Wifi,
        color: "text-cat-yellow",
      };
    } else if (progress < 100) {
      return {
        step: 3,
        title: "CALIBRATING 6-CH ENGINE SENSORS",
        subtitle: "Memetakan parameter SAE J1939 & rentang operasional...",
        icon: Activity,
        color: "text-amber-400",
      };
    }
    return {
      step: 4,
      title: "ALL SYSTEMS OPERATIONAL",
      subtitle: "Simulator CAN-Bus Caterpillar 950L Siap Beroperasi",
      icon: CheckCircle2,
      color: "text-emerald-400",
    };
  }, [progress]);

  const StageIcon = currentStage.icon;

  if (!visible) return null;

  return (
    <aside
      aria-label="Memuat Sistem Telemetri Caterpillar 950L"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 select-none overflow-hidden transition-all duration-400 ${
        isClosing
          ? "opacity-0 scale-[1.02] pointer-events-none backdrop-blur-none"
          : "opacity-100 scale-100 pointer-events-auto"
      }`}
      style={{
        backgroundColor: "rgba(11, 16, 27, 0.94)",
        backdropFilter: "blur(18px)",
      }}
    >
      {/* Efek Ambient Glow Halus di Background (Khas Alat Berat) */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[130px] pointer-events-none -top-20 -left-20 animate-pulse" />
      <div className="absolute w-[450px] h-[450px] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none -bottom-20 -right-20" />

      {/* Grid Pattern Industri Transparan */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Card Utama Glassmorphism yang Selaras dengan Dashboard */}
      <div className="relative w-full max-w-xl glass-card rounded-2xl p-6 sm:p-8 border border-[var(--glass-border)] shadow-2xl flex flex-col items-center text-center overflow-hidden">
        {/* Tombol Lewati Cepat di Pojok Kanan Atas */}
        <button
          type="button"
          onClick={() => {
            setIsClosing(true);
            setTimeout(() => {
              setVisible(false);
              onComplete?.();
            }, 300);
          }}
          className="absolute top-4 right-4 text-xs font-semibold px-2.5 py-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
        >
          Lewati Esc
        </button>

        {/* 1. Badge Caterpillar Industrial Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-cat-yellow text-xs font-black tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-cat-yellow animate-ping" />
            <span>CAT 950L</span>
          </div>
          <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider">
            HEAVY EQUIPMENT TELEMETRY
          </span>
        </div>

        {/* 2. Judul Utama Presisi */}
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight mb-1">
          CAN BUS SIMULATOR
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-medium mb-6">
          SAE J1939 Engine Cluster · FreeRTOS Dual-Core · MQTT Gateway
        </p>

        {/* 3. Circular Orbital Telemetry Dial (Menyerupai Gauge Dashboard) */}
        <div className="relative w-44 h-44 my-1 flex items-center justify-center">
          {/* Cincin Luar Berputar Lambat (Tekstur Dial Teknis) */}
          <svg className="absolute inset-0 w-full h-full animate-[spin_18s_linear_infinite] opacity-25">
            <circle
              cx="88"
              cy="88"
              r="76"
              fill="none"
              stroke="#FFCD00"
              strokeWidth="1.5"
              strokeDasharray="4 8"
            />
          </svg>

          {/* Cincin Dial SVG Utama */}
          <svg className="w-full h-full -rotate-90">
            {/* Track Latar Belakang */}
            <circle
              cx="88"
              cy="88"
              r={circleRadius}
              fill="none"
              stroke="var(--track-bg)"
              strokeWidth={strokeWidth}
            />
            {/* Busur Progres Dinamis (Gradien Halus) */}
            <circle
              cx="88"
              cy="88"
              r={circleRadius}
              fill="none"
              stroke={progress === 100 ? "#10B981" : "#FFCD00"}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-75 ease-out"
            />
          </svg>

          {/* Isi Konten di Dalam Lingkaran Dial */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`font-display text-4xl font-extrabold tabular-nums tracking-tight transition-colors duration-200 ${
                progress === 100 ? "text-emerald-400" : "text-[var(--text-primary)]"
              }`}
            >
              {progress}
              <span className="text-lg text-[var(--text-muted)] font-normal ml-0.5">
                %
              </span>
            </span>

            <span
              className={`text-[10px] font-mono tracking-widest uppercase font-bold mt-0.5 flex items-center gap-1 ${
                progress === 100 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {progress === 100 ? (
                <>
                  <Sparkles className="w-3 h-3" /> ONLINE
                </>
              ) : (
                "SYNCING"
              )}
            </span>
          </div>
        </div>

        {/* 4. Bar Status Interaktif Aktif */}
        <div className="w-full mt-3 mb-5 px-2">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <StageIcon className={`w-4 h-4 ${currentStage.color} animate-pulse`} />
            <h2 className={`text-xs sm:text-sm font-bold tracking-wide ${currentStage.color}`}>
              {currentStage.title}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] line-clamp-1">
            {currentStage.subtitle}
          </p>
        </div>

        {/* 5. Matrix Status 6-Channel Engine Sensor (Menyala Berurutan Sesuai Dashboard) */}
        <div className="w-full grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {SENSOR_CHANNELS.map((ch) => {
            const isReady = progress >= ch.checkAt;
            return (
              <div
                key={ch.id}
                className={`flex flex-col items-center p-2 rounded-lg border transition-all duration-300 ${
                  isReady
                    ? "bg-amber-500/10 border-amber-500/35 text-[var(--text-primary)]"
                    : "bg-black/20 border-white/5 text-[var(--text-muted)] opacity-50"
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isReady ? "bg-cat-yellow" : "bg-slate-600"
                    }`}
                  />
                  <span>{ch.id.toUpperCase()}</span>
                </div>
                <span className="text-[11px] font-mono font-semibold text-[var(--text-secondary)]">
                  {isReady ? "OK" : "..."}
                </span>
              </div>
            );
          })}
        </div>

        {/* 6. Garis Progres Tipis Presisi di Bagian Bawah */}
        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/10 relative">
          <div
            className={`h-full rounded-full transition-all duration-100 ease-out ${
              progress === 100
                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                : "bg-gradient-to-r from-amber-500 to-cat-yellow shadow-[0_0_12px_rgba(255,205,0,0.5)]"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 7. Footer Keterangan Singkat */}
        <div className="w-full flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] mt-3 px-1">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-cat-yellow" /> CAN 2.0B 29-bit
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-cyan-400" /> Dual-Core FreeRTOS
          </span>
          <span className="flex items-center gap-1.5">
            <Gauge className="w-3 h-3 text-emerald-400" /> EMQX MQTT QoS 1
          </span>
        </div>
      </div>
    </aside>
  );
};
