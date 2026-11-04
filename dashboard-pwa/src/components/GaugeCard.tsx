"use client";

import React from "react";
import type { Level } from "@/lib/thresholds";
import { LEVEL_LABEL } from "@/lib/thresholds";

export interface GaugeCardProps {
  title: string;
  subtitle?: string;
  /** Kalimat batas aman yang mudah dibaca, contoh: "di bawah 2200 RPM" */
  safeRangeText?: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  warnThreshold: number;
  alarmThreshold: number;
  /** Batas bawah zona dingin (khusus suhu) */
  coldThreshold?: number;
  /** Batas bawah zona waspada/bahaya (khusus tegangan aki) */
  lowWarnThreshold?: number;
  lowAlarmThreshold?: number;
  state: Level;
  /** true jika belum ada data atau data sudah basi */
  noData?: boolean;
  isFloat?: boolean;
  size?: "lg" | "sm";
  className?: string;
}

const COLORS: Record<Level, { ring: string; text: string }> = {
  0: { ring: "#0EA5E9", text: "text-sky-600 dark:text-sky-400" },
  1: { ring: "#10B981", text: "text-emerald-600 dark:text-emerald-400" },
  2: { ring: "#F59E0B", text: "text-amber-600 dark:text-amber-400" },
  3: { ring: "#E11D48", text: "text-rose-600 dark:text-rose-400" },
};

// Geometri busur: mulai kiri bawah, searah jarum jam, berakhir kanan bawah.
const CX = 100;
const CY = 98;
const R = 78;
const STROKE = 14;
const START = -125;
const SWEEP = 250;

function polar(deg: number, radius = R) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function arc(fromRatio: number, toRatio: number, radius = R) {
  const a = START + SWEEP * fromRatio;
  const b = START + SWEEP * toRatio;
  const s = polar(a, radius);
  const e = polar(b, radius);
  const large = b - a > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export const GaugeCard: React.FC<GaugeCardProps> = ({
  title,
  subtitle,
  safeRangeText,
  value,
  unit,
  min,
  max,
  warnThreshold,
  alarmThreshold,
  coldThreshold,
  lowWarnThreshold,
  lowAlarmThreshold,
  state,
  noData = false,
  isFloat = false,
  size = "sm",
  className = "",
}) => {
  const span = Math.max(0.0001, max - min);
  const toRatio = (v: number) => Math.max(0, Math.min(1, (v - min) / span));

  const ratio = noData ? 0 : toRatio(value);
  const color = COLORS[state];
  const ringColor = noData ? "var(--text-muted)" : color.ring;

  // Panjang busur untuk animasi isi
  const arcLength = 2 * Math.PI * R * (SWEEP / 360);
  const filled = arcLength * ratio;

  const startPt = polar(START, R);
  const endPt = polar(START + SWEEP, R);

  const display = noData ? "–" : isFloat ? value.toFixed(1) : Math.round(value).toString();
  const isLarge = size === "lg";

  return (
    <section
      className={`glass-card flex flex-col min-h-0 ${isLarge ? "p-3 sm:p-5" : "p-2.5 sm:p-4"} ${className}`}
      aria-label={`${title}: ${noData ? "belum ada data" : `${display} ${unit}, ${LEVEL_LABEL[state]}`}`}
    >
      {/* Judul + status */}
      <header className="flex items-start justify-between gap-1.5 shrink-0">
        <div className="min-w-0">
          <h2
            className="font-bold leading-tight truncate text-xs sm:text-base lg:text-lg"
            style={{ color: "var(--text-primary)" }}
            title={title}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-0.5 leading-snug truncate text-[11px] sm:text-xs text-[var(--text-muted)] hidden sm:block"
            >
              {subtitle}
            </p>
          )}
        </div>

        <span
          className={`shrink-0 font-bold text-[10px] sm:text-xs ${noData ? "" : color.text}`}
          style={noData ? { color: "var(--text-muted)" } : undefined}
        >
          {noData ? "Belum ada" : LEVEL_LABEL[state]}
        </span>
      </header>

      {/* Indikator lingkaran */}
      <div className="relative flex-1 min-h-[90px] sm:min-h-[130px] my-1">
        <svg
          viewBox="0 0 200 178"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-hidden="true"
        >
          {/* Lintasan dasar */}
          <path
            d={arc(0, 1)}
            fill="none"
            stroke="var(--track-bg)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />

          {/* Zona batas (di sisi dalam cincin) */}
          {coldThreshold !== undefined && toRatio(coldThreshold) > 0 && (
            <path
              d={arc(0, toRatio(coldThreshold), R - 13)}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="3.5"
              opacity="0.75"
            />
          )}
          {lowAlarmThreshold !== undefined && toRatio(lowAlarmThreshold) > 0 && (
            <path
              d={arc(0, toRatio(lowAlarmThreshold), R - 13)}
              fill="none"
              stroke="#E11D48"
              strokeWidth="3.5"
              opacity="0.8"
            />
          )}
          {lowWarnThreshold !== undefined && (
            <path
              d={arc(
                lowAlarmThreshold !== undefined ? toRatio(lowAlarmThreshold) : 0,
                toRatio(lowWarnThreshold),
                R - 13
              )}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="3.5"
              opacity="0.8"
            />
          )}
          {toRatio(alarmThreshold) > toRatio(warnThreshold) && (
            <path
              d={arc(toRatio(warnThreshold), toRatio(alarmThreshold), R - 13)}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="3.5"
              opacity="0.8"
            />
          )}
          {toRatio(alarmThreshold) < 1 && (
            <path
              d={arc(toRatio(alarmThreshold), 1, R - 13)}
              fill="none"
              stroke="#E11D48"
              strokeWidth="3.5"
              opacity="0.8"
            />
          )}

          {/* Isi nilai */}
          {!noData && ratio > 0 && (
            <path
              d={arc(0, 1)}
              fill="none"
              stroke={ringColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${arcLength}`}
              style={{ transition: "stroke-dasharray 300ms ease-out, stroke 300ms ease-out" }}
            />
          )}

          {/* Angka utama */}
          <text
            x={CX}
            y={CY + 8}
            textAnchor="middle"
            className="font-display"
            fontSize={display.length > 4 ? 38 : 46}
            fontWeight="700"
            fill={noData ? "var(--text-muted)" : "var(--text-primary)"}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {display}
          </text>
          <text
            x={CX}
            y={CY + 34}
            textAnchor="middle"
            fontSize="14"
            fontWeight="600"
            fill="var(--text-muted)"
          >
            {unit}
          </text>

          {/* Skala min / max di ujung busur */}
          <text x={startPt.x} y={startPt.y + 24} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-muted)">
            {min}
          </text>
          <text x={endPt.x} y={endPt.y + 24} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-muted)">
            {max}
          </text>
        </svg>
      </div>

      {/* Keterangan batas aman, kalimat biasa */}
      {safeRangeText && (
        <p className="text-[10px] sm:text-xs leading-tight truncate shrink-0 mt-auto text-[var(--text-secondary)]">
          Normal: {safeRangeText}
        </p>
      )}
    </section>
  );
};
