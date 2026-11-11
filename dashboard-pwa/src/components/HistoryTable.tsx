"use client";

import React from "react";
import { FileSpreadsheet, Trash2, Clock } from "lucide-react";
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
  onExportJson?: () => void;
  onClear: () => void;
  className?: string;
}

/** Jumlah baris yang ditampilkan di layar. Semua baris tetap ikut diunduh. */
const VISIBLE_ROWS = 300;

interface ColumnDef {
  key: ParamKey;
  line1?: string;
  line2: string;
  unit: string;
  float?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "rpm", line2: "RPM", unit: "RPM" },
  { key: "temp", line2: "Temp", unit: "°C" },
  { key: "load", line1: "Engine", line2: "Load", unit: "%" },
  { key: "map", line1: "Boost", line2: "Pressure", unit: "kPa" },
  { key: "spd", line2: "Speed", unit: "km/j" },
  { key: "volt", line2: "Voltage", unit: "V", float: true },
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
            Riwayat Data
          </h2>
          <p className="text-xs sm:text-sm mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isRecording
                ? "Mencatat per detik"
                : hasRows
                  ? "Riwayat database (offline)"
                  : "Menunggu data"}
            </span>
            <span className="sm:hidden">
              {isRecording ? "Aktif" : hasRows ? "Riwayat offline" : "Menunggu"}
            </span>
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
      <div className="flex-1 min-h-[160px] sm:min-h-[280px] landscape:min-h-0 overflow-auto border-t border-[var(--glass-outline)]">
        {hasRows ? (
          <table className="w-full table-fixed min-w-[580px] text-xs sm:text-sm tabular-nums border-collapse">
            <colgroup>
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
              <col className="w-[14.285%]" />
            </colgroup>
            <thead className="sticky top-0 z-10" style={{ background: "var(--glass-bg-elevated)" }}>
              <tr className="border-b border-[var(--glass-outline)]">
                <th
                  scope="col"
                  className="w-[14.285%] text-left font-semibold px-2 sm:px-2.5 py-1.5 sm:py-2 align-bottom"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <div className="flex flex-col justify-end text-left">
                    <span className="text-[10px] sm:text-xs font-normal opacity-0 select-none leading-tight" aria-hidden="true">
                      &nbsp;
                    </span>
                    <span className="text-xs sm:text-[13px] font-bold leading-tight">
                      Jam
                    </span>
                    <span className="text-[10px] sm:text-xs font-normal opacity-0 select-none leading-tight" aria-hidden="true">
                      -
                    </span>
                  </div>
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="w-[14.285%] text-right font-semibold px-2 sm:px-2.5 py-1.5 sm:py-2 align-bottom"
                    style={{ color: "var(--text-secondary)" }}
                    title={`${c.line1 ? `${c.line1} ` : ""}${c.line2} (${c.unit})`}
                  >
                    <div className="flex flex-col justify-end text-right">
                      {c.line1 ? (
                        <span className="text-xs sm:text-[13px] font-bold leading-tight truncate">
                          {c.line1}
                        </span>
                      ) : (
                        <span className="text-xs sm:text-[13px] font-normal opacity-0 select-none leading-tight" aria-hidden="true">
                          &nbsp;
                        </span>
                      )}
                      <span className="text-xs sm:text-[13px] font-bold leading-tight truncate">
                        {c.line2}
                      </span>
                      <span className="text-[10px] sm:text-xs font-medium text-[var(--text-muted)] leading-tight">
                        {c.unit}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={`${row.updatedAt}-${i}`}
                  className={`border-b border-[var(--glass-outline)] ${i === 0 ? "bg-[var(--glass-bg-subtle)]" : ""
                    }`}
                >
                  <td
                    className="w-[14.285%] px-2 sm:px-2.5 py-1.5 sm:py-2 text-left whitespace-nowrap font-medium text-[11px] sm:text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatClock(row.updatedAt)}
                  </td>
                  {COLUMNS.map((c) => {
                    const v = row[c.key];
                    const level = levelOf(c.key, v);
                    return (
                      <td
                        key={c.key}
                        className={`w-[14.285%] px-2 sm:px-2.5 py-1.5 sm:py-2 text-right font-semibold whitespace-nowrap text-[11px] sm:text-sm ${CELL_STYLE[level]}`}
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
          <span className="w-3 h-3 rounded-sm bg-sky-500/30" /> Dingin
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

