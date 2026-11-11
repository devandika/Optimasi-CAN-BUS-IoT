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
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  state,
  waiting = false,
}) => {
  const config = waiting
    ? {
        title: "Menunggu data",
        tone: "border-slate-400/30 bg-slate-500/[0.06]",
        titleColor: "",
        Icon: PlugZap,
        iconColor: "text-slate-500",
      }
    : state === 3
    ? {
        title: "Bahaya",
        tone: "border-rose-500/50 bg-rose-500/[0.12]",
        titleColor: "text-rose-700 dark:text-rose-300",
        Icon: AlertOctagon,
        iconColor: "text-rose-600 dark:text-rose-400",
      }
    : state === 2
    ? {
        title: "Warning",
        tone: "border-amber-500/45 bg-amber-500/[0.10]",
        titleColor: "text-amber-800 dark:text-amber-300",
        Icon: AlertTriangle,
        iconColor: "text-amber-600 dark:text-amber-400",
      }
    : state === 0
    ? {
        title: "Dingin",
        tone: "border-sky-500/35 bg-sky-500/[0.08]",
        titleColor: "text-sky-700 dark:text-sky-300",
        Icon: ThermometerSnowflake,
        iconColor: "text-sky-600 dark:text-sky-400",
      }
    : {
        title: "Aman",
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
      className={`glass-card px-3 py-2.5 sm:px-4 sm:py-3 landscape:py-1.5 landscape:px-3 flex items-center gap-2.5 sm:gap-3 ${config.tone}`}
    >
      <Icon className={`w-5 h-5 sm:w-6 sm:h-6 landscape:w-4 landscape:h-4 shrink-0 ${config.iconColor}`} />
      <h2
        className={`text-sm sm:text-base lg:text-lg landscape:text-xs font-bold leading-tight ${config.titleColor}`}
        style={config.titleColor ? undefined : { color: "var(--text-primary)" }}
      >
        {config.title}
      </h2>
    </div>
  );
};
