"use client";

import React, { useEffect, useState } from "react";
import { Cpu, Wifi, Activity } from "lucide-react";

interface BootIntroProps {
  onComplete?: () => void;
}

export const BootIntro: React.FC<BootIntroProps> = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(15);
  const [step, setStep] = useState(1);

  useEffect(() => {
    // Check if already shown in this tab session
    try {
      if (sessionStorage.getItem("cat950l-intro-shown")) {
        setVisible(false);
        onComplete?.();
        return;
      }
    } catch {}

    const t1 = setTimeout(() => {
      setProgress(55);
      setStep(2);
    }, 400);

    const t2 = setTimeout(() => {
      setProgress(90);
      setStep(3);
    }, 850);

    const t3 = setTimeout(() => {
      setProgress(100);
    }, 1200);

    const t4 = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem("cat950l-intro-shown", "true");
      } catch {}
      onComplete?.();
    }, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090D14] text-white transition-opacity duration-300"
      style={{ opacity: progress === 100 ? 0 : 1, pointerEvents: progress === 100 ? "none" : "auto" }}
    >
      <div className="max-w-md w-full px-6 flex flex-col items-center text-center">
        {/* CAT 950L Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-7 rounded-sm bg-cat-yellow" />
          <span className="text-xs uppercase tracking-widest font-black text-cat-yellow">
            CATERPILLAR 950L
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          IoT Telemetry Ecosystem
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mb-6">
          SAE J1939 CAN-Bus · FreeRTOS Dual-Core · MQTT QoS 1
        </p>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800/80 rounded-full h-2 mb-4 overflow-hidden border border-slate-700">
          <div
            className="bg-cat-yellow h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Status Steps */}
        <div className="w-full flex justify-between text-[11px] text-slate-400 font-mono">
          <span className={`flex items-center gap-1 ${step >= 1 ? "text-cat-yellow font-semibold" : ""}`}>
            <Cpu className="w-3.5 h-3.5" /> Hardware
          </span>
          <span className={`flex items-center gap-1 ${step >= 2 ? "text-cat-yellow font-semibold" : ""}`}>
            <Wifi className="w-3.5 h-3.5" /> Network
          </span>
          <span className={`flex items-center gap-1 ${step >= 3 ? "text-emerald-400 font-semibold" : ""}`}>
            <Activity className="w-3.5 h-3.5" /> Ready
          </span>
        </div>
      </div>
    </div>
  );
};
