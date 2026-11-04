"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ThermometerSnowflake,
  PlugZap,
} from "lucide-react";
import type { Level } from "@/lib/thresholds";

interface AlertBannerProps {
  /** Status terburuk dari semua parameter */
  state: Level;
  /** true jika belum ada data atau data sudah basi */
  waiting?: boolean;
  /** Nama parameter yang sedang bermasalah, contoh: ["Suhu mesin", "Putaran mesin"] */
  problemNames?: string[];
  lastAlertMessage?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  state,
  waiting = false,
  problemNames = [],
  lastAlertMessage,
}) => {
  const list = problemNames.join(" dan ");

  const config = waiting
    ? {
        title: "Menunggu data dari alat",
        desc: "Belum ada data masuk. Pastikan alat ESP32 menyala dan terhubung ke internet.",
        tone: "border-slate-400/30 bg-slate-500/[0.06]",
        titleColor: "",
        Icon: PlugZap,
        iconColor: "text-slate-500",
      }
    : state === 3
    ? {
        title: "DANGER (Bahaya Merah)",
        desc: `${list || "Ada parameter"} melewati batas aman kritis! Segera kurangi beban atau periksa mesin.${
          lastAlertMessage ? ` (${lastAlertMessage})` : ""
        }`,
        tone: "border-rose-500/50 bg-rose-500/[0.12]",
        titleColor: "text-rose-700 dark:text-rose-300",
        Icon: AlertOctagon,
        iconColor: "text-rose-600 dark:text-rose-400",
      }
    : state === 2
    ? {
        title: "WARNING (Peringatan Kuning)",
        desc: `${list || "Ada parameter"} mendekati ambang batas peringatan. Pantau terus kondisi mesin.`,
        tone: "border-amber-500/45 bg-amber-500/[0.10]",
        titleColor: "text-amber-800 dark:text-amber-300",
        Icon: AlertTriangle,
        iconColor: "text-amber-600 dark:text-amber-400",
      }
    : state === 0
    ? {
        title: "Mesin masih dingin",
        desc: "Engine Temp di bawah 71°C. Biarkan mesin menyala beberapa menit sebelum dipakai kerja berat.",
        tone: "border-sky-500/35 bg-sky-500/[0.08]",
        titleColor: "text-sky-700 dark:text-sky-300",
        Icon: ThermometerSnowflake,
        iconColor: "text-sky-600 dark:text-sky-400",
      }
    : {
        title: "Semua normal",
        desc: "Keenam sensor berada dalam batas aman. Mesin siap bekerja.",
        tone: "border-emerald-500/35 bg-emerald-500/[0.07]",
        titleColor: "text-emerald-800 dark:text-emerald-300",
        Icon: CheckCircle2,
        iconColor: "text-emerald-600 dark:text-emerald-400",
      };

  const Icon = config.Icon;

  return (
    <div
      role={!waiting && state >= 2 ? "alert" : "status"}
      aria-live="polite"
      className={`glass-card px-3 py-2 sm:px-4 sm:py-3.5 landscape:py-1.5 landscape:px-3 flex items-start gap-2.5 sm:gap-3 ${config.tone}`}
    >
      <Icon className={`w-5 h-5 sm:w-6 sm:h-6 landscape:w-4 landscape:h-4 shrink-0 mt-0.5 ${config.iconColor}`} />
      <div className="min-w-0">
        <h2
          className={`text-sm sm:text-base lg:text-lg landscape:text-xs font-bold leading-tight ${config.titleColor}`}
          style={config.titleColor ? undefined : { color: "var(--text-primary)" }}
        >
          {config.title}
        </h2>
        <p className="text-xs sm:text-sm lg:text-[15px] landscape:text-[11px] leading-snug sm:leading-relaxed mt-0.5 line-clamp-1 landscape:line-clamp-1 sm:line-clamp-none" style={{ color: "var(--text-secondary)" }}>
          {config.desc}
        </p>
      </div>
    </div>
  );
};
