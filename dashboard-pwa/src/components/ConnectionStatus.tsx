"use client";

import React, { useEffect, useState } from "react";
import { Download, Activity } from "lucide-react";

interface ConnectionStatusProps {
  mqttConnected: boolean;
  gatewayOnline: boolean;
  brokerHost: string;
  topicName?: string;
  /** Detik sejak data terakhir masuk, null jika belum pernah */
  secondsSinceData: number | null;
  packetCount?: number;
  packetRate?: number;
}

function describeAge(sec: number | null) {
  if (sec === null) return "Belum ada data";
  if (sec <= 2) return "Data masuk";
  if (sec < 60) return `Data terakhir ${sec} detik lalu`;
  const m = Math.floor(sec / 60);
  return `Data terakhir ${m} menit lalu`;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  mqttConnected,
  gatewayOnline,
  brokerHost,
  topicName,
  secondsSinceData,
  packetCount = 0,
  packetRate = 0,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Status Broker Online HANYA jika terhubung dan ada data aktif dari topik yang di-subscribe
  const hasSubscribedData = mqttConnected && secondsSinceData !== null && secondsSinceData <= 5;

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <div
        className="glass-subtle min-h-[34px] sm:min-h-[42px] px-2.5 sm:px-3.5 py-1 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm"
        title={`Server: ${brokerHost}${topicName ? ` · Topik: ${topicName}` : ""}`}
      >
        <span className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={`relative w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
              hasSubscribedData ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            <span className="hidden sm:inline">Broker </span>
            <strong
              className={
                hasSubscribedData
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
            >
              {hasSubscribedData ? "Online" : "Offline"}
            </strong>
          </span>
        </span>

        <span className="h-3.5 sm:h-4 w-px" style={{ backgroundColor: "var(--glass-border-strong)" }} />

        <span className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={`relative w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
              hasSubscribedData ? "bg-emerald-500 live-dot" : "bg-slate-400"
            }`}
          />
          <span style={{ color: hasSubscribedData ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {describeAge(secondsSinceData)}
          </span>
        </span>

        {packetCount > 0 && (
          <>
            <span className="h-3.5 sm:h-4 w-px hidden md:inline-block" style={{ backgroundColor: "var(--glass-border-strong)" }} />
            <span className="hidden md:inline-flex items-center gap-1.5 font-medium tabular-nums text-xs" style={{ color: "var(--text-secondary)" }}>
              <Activity className="w-3.5 h-3.5 text-cat-yellow" />
              <span>{packetCount.toLocaleString()} pkt</span>
              {packetRate > 0 && (
                <span style={{ color: "var(--text-muted)" }}>({packetRate.toFixed(1)}/s)</span>
              )}
            </span>
          </>
        )}
      </div>

      {isInstallable && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[34px] sm:min-h-[42px] px-3 sm:px-4 rounded-lg bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 transition-colors"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Install App</span>
        </button>
      )}
    </div>
  );
};
