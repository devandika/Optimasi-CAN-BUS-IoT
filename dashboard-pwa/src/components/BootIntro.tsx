"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CheckCircle2, Cpu, Wifi, Activity, Terminal, ShieldCheck } from "lucide-react";

interface BootIntroProps {
  onComplete?: () => void;
}

interface SensorCheck {
  code: string;
  label: string;
  nominal: string;
  threshold: number; // progress percentage at which this sensor marks OK
}

const SENSORS: SensorCheck[] = [
  { code: "RPM", label: "Engine Speed", nominal: "< 2200 RPM", threshold: 18 },
  { code: "LOAD", label: "Engine Load", nominal: "< 95%", threshold: 34 },
  { code: "TEMP", label: "Coolant Temp", nominal: "71 - 104°C", threshold: 50 },
  { code: "MAP", label: "Boost Pressure", nominal: "< 165 kPa", threshold: 66 },
  { code: "SPD", label: "Ground Speed", nominal: "< 39 km/h", threshold: 80 },
  { code: "VOLT", label: "24V Battery", nominal: "23.0 - 28.5V", threshold: 92 },
];

export const BootIntro: React.FC<BootIntroProps> = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 320);
  }, [onComplete]);

  // Keyboard shortcut listener: ESC untuk lewati langsung
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDismiss]);

  // Animasi progress 60 FPS dengan kurva akselerasi-deselerasi presisi tinggi
  useEffect(() => {
    const startTime = performance.now();
    const duration = 2100; // 2.1 detik: punchy, profesional, tidak membuang waktu
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      // Custom smooth easing: cepat dan responsif di awal, presisi melambat di akhir
      // Easing curve: Quartic ease-out untuk feel instrumen digital OEM
      const ease = 1 - Math.pow(1 - t, 4);
      const currentPct = Math.round(ease * 100);

      setProgress(currentPct);

      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        // Tahan 250ms saat 100% untuk kepuasan visual "SYSTEM READY"
        setTimeout(() => {
          setIsClosing(true);
          setTimeout(() => {
            setVisible(false);
            onComplete?.();
          }, 320);
        }, 260);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [onComplete]);

  // Teks diagnostik teknis seiring berjalannya POST (Power-On Self Test)
  const diagStatus = useMemo(() => {
    if (progress < 25) {
      return {
        step: "01/04",
        subsystem: "CAN 2.0B TRANSCEIVER",
        log: "Verifying SN65HVD230 differential bus @ 500 kbps",
        icon: Cpu,
        color: "text-amber-400",
      };
    } else if (progress < 55) {
      return {
        step: "02/04",
        subsystem: "SAE J1939 PROTOCOL STACK",
        log: "Mapping Engine PGNs: 61444 (EEC1) • 61443 (EEC2) • 65262 (ET1)",
        icon: Activity,
        color: "text-cat-yellow",
      };
    } else if (progress < 85) {
      return {
        step: "03/04",
        subsystem: "ESP32 IOT GATEWAY & MQTT",
        log: "Syncing UART2 115200 baud link & EMQX Cloud broker duplex",
        icon: Wifi,
        color: "text-sky-400",
      };
    } else if (progress < 100) {
      return {
        step: "04/04",
        subsystem: "TELEMETRY MATRIX CALIBRATION",
        log: "Calibrating 6-channel powertrain limits and threshold alarms",
        icon: Terminal,
        color: "text-amber-300",
      };
    }
    return {
      step: "READY",
      subsystem: "SYSTEM OPERATIONAL",
      log: "All powertrain subsystems nominal • Display cluster online",
      icon: CheckCircle2,
      color: "text-emerald-400",
    };
  }, [progress]);

  const DiagIcon = diagStatus.icon;

  if (!visible) return null;

  return (
    <aside
      aria-label="Caterpillar 950L Instrument Cluster Initialization"
      onClick={handleDismiss}
      className={`fixed inset-0 z-50 flex flex-col justify-between p-6 sm:p-10 select-none cursor-pointer overflow-hidden transition-all duration-300 ${
        isClosing
          ? "opacity-0 scale-[0.99] blur-[2px] pointer-events-none"
          : "opacity-100 scale-100 pointer-events-auto"
      }`}
      style={{
        backgroundColor: "#070A10",
        backgroundImage: `
          radial-gradient(circle at 50% 20%, rgba(255, 205, 0, 0.08) 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, rgba(14, 165, 233, 0.04) 0%, transparent 50%),
          linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
      }}
    >
      {/* ─── 1. TOP BAR: STATUS INSTRUMEN & TOMBOL LEWATI ─── */}
      <header className="w-full flex items-center justify-between text-xs font-mono tracking-wider">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-white/[0.04] border border-white/10 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                progress === 100
                  ? "bg-emerald-400 shadow-[0_0_8px_#34D399]"
                  : "bg-cat-yellow animate-pulse shadow-[0_0_8px_#FFCD00]"
              }`}
            />
            <span className="font-semibold text-white">CAT 950L POST</span>
          </div>
          <span className="hidden sm:inline text-slate-500 font-medium">
            SAE J1939 HEAVY-DUTY TELEMETRY
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="group flex items-center gap-2 px-3 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all text-xs font-mono"
        >
          <span>LEWATI</span>
          <span className="text-[10px] px-1 py-0.5 rounded bg-white/10 text-slate-300 group-hover:text-white">
            ESC
          </span>
        </button>
      </header>

      {/* ─── 2. HERO CENTER: CATERPILLAR WORDMARK & CALIBRATION HUD ─── */}
      <main className="w-full max-w-2xl mx-auto flex flex-col items-center text-center my-auto py-6">
        {/* Authentic Caterpillar Emblem SVG */}
        <div className="relative mb-6">
          <div className="relative flex items-center justify-center">
            <svg
              className="w-36 h-20 sm:w-44 sm:h-24 drop-shadow-[0_4px_24px_rgba(255,205,0,0.25)]"
              viewBox="0 0 160 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Authentic Cat Yellow Triangle positioned under the 'A' */}
              <polygon points="56,72 104,72 80,32" fill="#FFCD00" />
              {/* Heavy Bold Industrial CAT Typography */}
              <text
                x="80"
                y="63"
                textAnchor="middle"
                fill="#FFFFFF"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="900"
                fontSize="44"
                letterSpacing="4"
              >
                CAT
              </text>
            </svg>
          </div>

          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white font-display">
              950L
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-cat-yellow" />
            <span className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-400 font-mono">
              WHEEL LOADER
            </span>
          </div>
        </div>

        {/* Large Crisp Tabular Percentage Indicator */}
        <div className="flex items-baseline justify-center gap-1.5 my-2">
          <span className="text-5xl sm:text-6xl font-extrabold font-display tabular-nums tracking-tight text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
            {progress}
          </span>
          <span className="text-2xl font-bold text-cat-yellow font-display">%</span>
        </div>

        {/* Precision Cockpit Laser Calibration Bar with Micro-ticks */}
        <div className="w-full max-w-lg mt-3 mb-6">
          {/* Graduation Scale Markers */}
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1.5 px-0.5">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>

          {/* Track Bar with Subtle Inner Glow */}
          <div className="relative w-full h-2 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ease-out ${
                progress === 100
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_16px_rgba(52,211,153,0.6)]"
                  : "bg-gradient-to-r from-amber-500 via-cat-yellow to-yellow-300 shadow-[0_0_16px_rgba(255,205,0,0.6)]"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Micro-tick Ruler Beneath */}
          <div className="flex justify-between w-full px-1 mt-1 opacity-25">
            {Array.from({ length: 21 }).map((_, i) => (
              <span
                key={i}
                className={`w-[1px] bg-white ${i % 5 === 0 ? "h-2" : "h-1"}`}
              />
            ))}
          </div>
        </div>

        {/* Telemetry POST Diagnostic Ticker */}
        <div className="w-full max-w-lg flex items-center justify-between px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-left">
          <div className="flex items-center gap-3 overflow-hidden">
            <DiagIcon className={`w-4 h-4 shrink-0 ${diagStatus.color}`} />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                  {diagStatus.step}
                </span>
                <span className={`text-xs font-bold tracking-wide font-mono ${diagStatus.color}`}>
                  {diagStatus.subsystem}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                {diagStatus.log}
              </p>
            </div>
          </div>

          <span className="shrink-0 text-[11px] font-mono font-bold text-slate-300 ml-3">
            {progress === 100 ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> OK
              </span>
            ) : (
              <span className="text-cat-yellow animate-pulse">TESTING</span>
            )}
          </span>
        </div>
      </main>

      {/* ─── 3. BOTTOM BAR: 6-CHANNEL SENSOR TAPE (MINIMALIST HUD) ─── */}
      <footer className="w-full max-w-4xl mx-auto border-t border-white/10 pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {SENSORS.map((s) => {
            const isPassed = progress >= s.threshold;
            return (
              <div
                key={s.code}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[11px] font-mono transition-all duration-200 ${
                  isPassed
                    ? "bg-white/[0.04] border-cat-yellow/30 text-white"
                    : "bg-transparent border-white/5 text-slate-600"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      isPassed ? "bg-cat-yellow shadow-[0_0_6px_#FFCD00]" : "bg-slate-700"
                    }`}
                  />
                  <span className="font-bold">{s.code}</span>
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    isPassed ? "text-emerald-400" : "text-slate-600"
                  }`}
                >
                  {isPassed ? "NOMINAL" : "INIT"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-3 px-1">
          <span>DUAL-NODE CAN-BUS SIMULATOR • ESP32 FREERTOS</span>
          <span className="hidden sm:inline">KLIK DI MANA SAJA UNTUK MEMBUKA CLUSTER</span>
        </div>
      </footer>
    </aside>
  );
};
