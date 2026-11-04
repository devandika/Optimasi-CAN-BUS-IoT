"use client";

import React from "react";
import { FileSpreadsheet, FileJson, Trash2, Clock } from "lucide-react";
import { levelOf, type Level, type ParamKey } from "@/lib/thresholds";

export interface HistoryRow {
  rpm: number;
  load: number;
  temp: number;
  map: number;
  spd: number;
  volt: number;
  updatedAt: number;
}

interface HistoryTableProps {
  rows: HistoryRow[];
  isRecording: boolean;
  onExportCsv: () => void;
  onExportJson: () => void;
  onClear: () => void;
  className?: string;
}

/** Jumlah baris yang ditampilkan di layar. Semua baris tetap ikut diunduh. */
const VISIBLE_ROWS = 300;

const COLUMNS: { key: ParamKey; label: string; unit: string; float?: boolean }[] = [
  { key: "rpm", label: "RPM", unit: "RPM" },
  { key: "temp", label: "Temp", unit: "°C" },
  { key: "load", label: "Engine Load", unit: "%" },
  { key: "map", label: "Boost Pressure", unit: "kPa" },
  { key: "spd", label: "Speed", unit: "km/j" },
  { key: "volt", label: "Voltage", unit: "V", float: true },
];

const CELL_STYLE: Record<Level, string> = {
  0: "text-sky-700 dark:text-sky-300 bg-sky-500/10",
  1: "",
  2: "text-amber-800 dark:text-amber-300 bg-amber-500/15 font-bold",
  3: "text-rose-700 dark:text-rose-300 bg-rose-500/15 font-bold",
};

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  rows,
  isRecording,
  onExportCsv,
  onExportJson,
  onClear,
  className = "",
}) => {
  const visible = rows.slice(-VISIBLE_ROWS).reverse();
  const hasRows = rows.length > 0;

  return (
    <section className={`glass-card flex flex-col min-h-0 overflow-hidden ${className}`}>
      {/* Judul + tombol unduh */}
      <header className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-3 landscape:py-2 landscape:px-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-lg landscape:text-xs font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
            Riwayat per detik
          </h2>
          <p className="text-xs sm:text-sm mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isRecording ? "Mencatat per detik" : "Menunggu data"}</span>
            <span className="sm:hidden">{isRecording ? "Aktif" : "Menunggu"}</span>
            {hasRows && <span>· {rows.length} baris</span>}
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!hasRows}
            className="min-h-[34px] sm:min-h-[40px] px-2.5 sm:px-3.5 rounded-lg text-xs sm:text-sm font-bold bg-cat-yellow hover:bg-cat-yellowHover text-slate-950 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Unduh semua riwayat sebagai file Excel (CSV)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={onExportJson}
            disabled={!hasRows}
            className="min-h-[34px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold glass-subtle inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--text-primary)" }}
            title="Unduh semua riwayat sebagai file JSON"
          >
            <FileJson className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>JSON</span>
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!hasRows}
            className="min-h-[34px] min-w-[34px] sm:min-h-[40px] sm:min-w-[40px] rounded-lg glass-subtle inline-flex items-center justify-center hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--text-muted)" }}
            title="Hapus riwayat"
            aria-label="Hapus riwayat"
          >
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </header>

      {/* Tabel */}
      <div className="flex-1 min-h-[140px] sm:min-h-[260px] overflow-auto border-t border-[var(--glass-outline)]">
        {hasRows ? (
          <table className="w-full text-xs sm:text-sm tabular-nums border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: "var(--glass-bg-elevated)" }}>
              <tr className="border-b border-[var(--glass-outline)]">
                <th scope="col" className="text-left font-semibold px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Jam
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="text-right font-semibold px-1.5 sm:px-2.5 py-1.5 sm:py-2 whitespace-nowrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {c.label}
                    <span className="block text-[10px] sm:text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {c.unit}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={row.updatedAt}
                  className={`border-b border-[var(--glass-outline)] ${i === 0 ? "bg-[var(--glass-bg-subtle)]" : ""}`}
                >
                  <td className="px-2 sm:px-3 py-1 sm:py-1.5 whitespace-nowrap font-medium text-[11px] sm:text-sm" style={{ color: "var(--text-muted)" }}>
                    {formatClock(row.updatedAt)}
                  </td>
                  {COLUMNS.map((c) => {
                    const v = row[c.key];
                    const level = levelOf(c.key, v);
                    return (
                      <td
                        key={c.key}
                        className={`px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-right font-semibold whitespace-nowrap text-[11px] sm:text-sm ${CELL_STYLE[level]}`}
                        style={level === 1 ? { color: "var(--text-primary)" } : undefined}
                      >
                        {c.float ? v.toFixed(1) : Math.round(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 gap-2">
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Belum ada data yang tercatat
            </p>
            <p className="text-sm max-w-xs" style={{ color: "var(--text-muted)" }}>
              Tabel akan terisi otomatis setiap detik begitu alat terhubung dan mengirim data.
            </p>
          </div>
        )}
      </div>

      {/* Keterangan warna untuk orang awam */}
      <footer
        className="px-4 py-2.5 border-t border-[var(--glass-outline)] flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] shrink-0"
        style={{ color: "var(--text-secondary)" }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500/40" /> Warning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-500/40" /> Danger
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-sky-500/30" /> Cold
        </span>
        {rows.length > VISIBLE_ROWS && (
          <span style={{ color: "var(--text-muted)" }}>
            Menampilkan {VISIBLE_ROWS} terbaru, semua ikut diunduh
          </span>
        )}
      </footer>
    </section>
  );
};

