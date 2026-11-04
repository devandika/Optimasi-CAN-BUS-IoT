"use client";

import React, { useEffect, useState, useRef } from "react";

interface BootIntroProps {
  onComplete?: () => void;
}

/* ── Fasa animasi bertahap yang smooth & profesional ──
   Setiap fasa muncul secara berurutan menggunakan CSS opacity + transform.
   Tidak ada tombol lewati — layar ini singkat (3 detik) dan intentional. */

export const BootIntro: React.FC<BootIntroProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const rafRef = useRef<number>(0);

  /* ── Animasi progress 60 FPS ── */
  useEffect(() => {
    const t0 = performance.now();
    const DURATION = 2600;

    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / DURATION);
      /* Quartic ease-out: responsif di awal, presisi di akhir */
      const ease = 1 - Math.pow(1 - t, 4);
      setProgress(Math.round(ease * 100));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Tahapan visual reveal ── */
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),   // Logo CAT muncul
      setTimeout(() => setPhase(2), 500),   // Nama model + teks
      setTimeout(() => setPhase(3), 800),   // Progress bar
      setTimeout(() => setPhase(4), 1100),  // Sensor channels
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  /* ── Auto-exit setelah progress 100% ── */
  useEffect(() => {
    if (progress < 100) return;
    const t1 = setTimeout(() => setExiting(true), 400);
    const t2 = setTimeout(() => {
      setGone(true);
      onComplete?.();
    }, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [progress, onComplete]);

  if (gone) return null;

  /* ── SVG Gauge Arc (sama persis dengan GaugeCard) ── */
  const CX = 100, CY = 98, R = 78, STROKE = 12;
  const START_DEG = -125, SWEEP_DEG = 250;
  const arcLen = 2 * Math.PI * R * (SWEEP_DEG / 360);
  const filled = arcLen * (progress / 100);

  function polar(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  const s = polar(START_DEG);
  const e = polar(START_DEG + SWEEP_DEG);
  const arcPath = `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 1 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;

  /* ── Kelas transisi per-fasa ── */
  const show = (p: number) =>
    phase >= p
      ? "opacity-100 translate-y-0 blur-0"
      : "opacity-0 translate-y-3 blur-[2px]";

  const sensors = ["RPM", "LOAD", "TEMP", "MAP", "SPD", "VOLT"] as const;
  const sensorThresholds = [15, 30, 45, 60, 75, 90];

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        exiting ? "opacity-0 scale-[1.02]" : "opacity-100 scale-100"
      }`}
      style={{ backgroundColor: "#0B101B" }}
    >
      {/* Ambient glow — persis seperti body di globals.css dark mode */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 12% 10%, rgba(255,205,0,0.07) 0%, transparent 45%),
            radial-gradient(circle at 88% 15%, rgba(56,189,248,0.07) 0%, transparent 45%),
            radial-gradient(circle at 50% 90%, rgba(16,185,129,0.05) 0%, transparent 50%)
          `,
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6 select-none">

        {/* ─── 1. LOGO CAT ─── */}
        <div className={`transition-all duration-700 ease-out ${show(1)} mb-8`}>
          <div className="flex flex-col items-center">
            {/* Segitiga CAT Yellow khas Caterpillar */}
            <svg
              viewBox="0 0 120 50"
              className="w-28 sm:w-32 mb-2"
              fill="none"
            >
              <polygon
                points="38,46 82,46 60,14"
                fill="#FFCD00"
                opacity="0.9"
              />
              <text
                x="60"
                y="42"
                textAnchor="middle"
                fill="white"
                fontFamily="'Outfit', system-ui, sans-serif"
                fontWeight="800"
                fontSize="32"
                letterSpacing="3"
              >
                CAT
              </text>
            </svg>

            <div className="flex items-center gap-2.5">
              <span className="text-[28px] sm:text-[32px] font-extrabold tracking-tight text-white"
                    style={{ fontFamily: "var(--font-display)" }}>
                950L
              </span>
              <div className="w-[3px] h-5 rounded-full bg-[#FFCD00]" />
              <span className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase"
                    style={{ fontFamily: "var(--font-sans)" }}>
                Wheel Loader
              </span>
            </div>
          </div>
        </div>

        {/* ─── 2. GAUGE ARC (reuse GaugeCard geometry) ─── */}
        <div className={`transition-all duration-700 ease-out ${show(2)} w-52 h-44 relative mb-4`}>
          <svg viewBox="0 0 200 170" className="w-full h-full">
            {/* Track latar */}
            <path
              d={arcPath}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={STROKE}
              strokeLinecap="round"
            />

            {/* Isi progress */}
            <path
              d={arcPath}
              fill="none"
              stroke={progress >= 100 ? "#10B981" : "#FFCD00"}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${arcLen}`}
              style={{
                transition: "stroke-dasharray 80ms linear, stroke 300ms ease-out",
                filter: progress >= 100
                  ? "drop-shadow(0 0 8px rgba(16,185,129,0.5))"
                  : "drop-shadow(0 0 6px rgba(255,205,0,0.35))",
              }}
            />

            {/* Angka persentase besar */}
            <text
              x={CX}
              y={CY + 6}
              textAnchor="middle"
              fill="white"
              fontSize="46"
              fontWeight="700"
              style={{
                fontFamily: "var(--font-display)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {progress}
            </text>
            <text
              x={CX}
              y={CY + 30}
              textAnchor="middle"
              fill={progress >= 100 ? "#10B981" : "#94A3B8"}
              fontSize="13"
              fontWeight="600"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {progress >= 100 ? "SYSTEM READY" : "INITIALIZING"}
            </text>

            {/* Skala 0 / 100 di ujung busur */}
            <text x={s.x} y={s.y + 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">0</text>
            <text x={e.x} y={e.y + 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">100</text>
          </svg>
        </div>

        {/* ─── 3. PROGRESS BAR ─── */}
        <div className={`transition-all duration-700 ease-out ${show(3)} w-full mb-6`}>
          <div className="w-full h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: progress >= 100
                  ? "linear-gradient(90deg, #10B981, #14B8A6)"
                  : "linear-gradient(90deg, #D97706, #FFCD00)",
                boxShadow: progress >= 100
                  ? "0 0 12px rgba(16,185,129,0.5)"
                  : "0 0 12px rgba(255,205,0,0.4)",
                transition: "width 80ms linear, background 300ms ease-out",
              }}
            />
          </div>

          <p className="text-center text-[11px] font-medium tracking-wide mt-2.5"
             style={{ color: "#64748B", fontFamily: "var(--font-sans)" }}>
            CAN Bus Telemetry · SAE J1939 · MQTT Gateway
          </p>
        </div>

        {/* ─── 4. SENSOR STATUS ROW ─── */}
        <div className={`transition-all duration-700 ease-out ${show(4)} w-full`}>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {sensors.map((code, i) => {
              const active = progress >= sensorThresholds[i];
              return (
                <div key={code} className="flex items-center gap-1.5">
                  <span
                    className="w-[6px] h-[6px] rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: active ? "#FFCD00" : "rgba(255,255,255,0.12)",
                      boxShadow: active ? "0 0 6px rgba(255,205,0,0.5)" : "none",
                    }}
                  />
                  <span
                    className="text-[11px] font-semibold tracking-wide transition-colors duration-300"
                    style={{
                      color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {code}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
