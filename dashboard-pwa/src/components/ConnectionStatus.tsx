"use client";

import React, { useEffect, useState } from "react";
import { Download, Activity } from "lucide-react";

interface ConnectionStatusProps {
  mqttConnected: boolean;
  gatewayOnline: boolean;
  brokerHost: string;
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

  const fresh = secondsSinceData !== null && secondsSinceData <= 5;
  const deviceOk = gatewayOnline && fresh;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="glass-subtle min-h-[42px] px-3.5 py-1.5 flex items-center gap-3 text-sm"
        title={`Server: ${brokerHost}`}
      >
        <span className="flex items-center gap-2">
          <span
            className={`relative w-2.5 h-2.5 rounded-full ${
              mqttConnected ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            Broker{" "}
            <strong
              className={
                mqttConnected
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
            >
              {mqttConnected ? "terhubung" : "terputus"}
            </strong>
          </span>
        </span>

        <span className="h-4 w-px" style={{ backgroundColor: "var(--glass-border-strong)" }} />

        <span className="flex items-center gap-2">
          <span
            className={`relative w-2.5 h-2.5 rounded-full ${
              deviceOk ? "bg-emerald-500 live-dot" : "bg-slate-400"
            }`}
          />
          <span style={{ color: deviceOk ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {describeAge(secondsSinceData)}
          </span>
        </span>

        {packetCount > 0 && (
          <>
            <span className="h-4 w-px hidden sm:inline-block" style={{ backgroundColor: "var(--glass-border-strong)" }} />
            <span className="hidden sm:inline-flex items-center gap-1.5 font-medium tabular-nums text-xs" style={{ color: "var(--text-secondary)" }}>
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
          className="min-h-[42px] px-4 rounded-lg bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 font-bold text-sm inline-flex items-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          Install
        </button>
      )}
    </div>
  );
};
