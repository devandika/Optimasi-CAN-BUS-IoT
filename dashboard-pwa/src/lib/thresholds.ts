// Batas aman tiap parameter. Dipakai bersama oleh gauge, banner, dan tabel riwayat
// supaya status dan lingkaran batas warna kuning/merah selalu sinkron.

export type ParamKey = "rpm" | "temp" | "load" | "map" | "spd" | "volt";

/** 0 = dingin, 1 = aman, 2 = waspada (kuning), 3 = bahaya (merah) */
export type Level = 0 | 1 | 2 | 3;

export interface TelemetryValues {
  rpm: number;
  load: number;
  temp: number;
  map: number;
  spd: number;
  volt: number;
}

export interface ParamThresholdConfig {
  min: number;
  max: number;
  coldThreshold?: number;
  lowAlarmThreshold?: number;
  lowWarnThreshold?: number;
  warnThreshold: number;
  alarmThreshold: number;
  safeRangeText: string;
}

export const PARAM_LIMITS: Record<ParamKey, ParamThresholdConfig> = {
  // Normal: < 2200 RPM (2200 - 2399 = Waspada, >= 2400 = Bahaya) - SAMA PERSIS TFT
  rpm: {
    min: 0,
    max: 3000,
    warnThreshold: 2200,
    alarmThreshold: 2400,
    safeRangeText: "< 2200 RPM",
  },
  // Normal: 71 - 104 °C (< 71 °C = Dingin, 105-107 °C = Waspada, >= 108 °C = Bahaya) - SAMA PERSIS TFT
  temp: {
    min: 0,
    max: 120,
    coldThreshold: 71,
    warnThreshold: 105,
    alarmThreshold: 108,
    safeRangeText: "71 - 104 °C",
  },
  // Normal: < 95% (95-99% = Waspada, >= 100% = Bahaya) - SAMA PERSIS TFT
  load: {
    min: 0,
    max: 100,
    warnThreshold: 95,
    alarmThreshold: 100,
    safeRangeText: "< 95%",
  },
  // Normal: < 165 kPa (165-199 kPa = Waspada, >= 200 kPa = Bahaya) - SAMA PERSIS TFT
  map: {
    min: 0,
    max: 255,
    warnThreshold: 165,
    alarmThreshold: 200,
    safeRangeText: "< 165 kPa",
  },
  // Normal: < 39 km/jam (39-41 km/jam = Waspada, >= 42 km/jam = Bahaya) - SAMA PERSIS TFT
  spd: {
    min: 0,
    max: 60,
    warnThreshold: 39,
    alarmThreshold: 42,
    safeRangeText: "< 39 km/jam",
  },
  // Normal: 23.0 - 28.5 Volt (Batas bawah 22.9V, batas atas 28.5V)
  // Waspada: <= 22.9V atau > 28.5V
  // Bahaya: < 18.0V atau >= 32.0V
  volt: {
    min: 0,
    max: 35,
    lowAlarmThreshold: 18,
    lowWarnThreshold: 22.9,
    warnThreshold: 28.5,
    alarmThreshold: 32,
    safeRangeText: "23.0 - 28.5 Volt",
  },
};

export function levelOf(key: ParamKey, v: number): Level {
  switch (key) {
    case "rpm":
      if (v >= 2400) return 3;
      if (v >= 2200) return 2;
      return 1;
    case "load":
      if (v >= 100) return 3;
      if (v >= 95) return 2;
      return 1;
    case "temp":
      if (v >= 108) return 3;
      if (v >= 105) return 2;
      if (v < 71) return 0;
      return 1;
    case "map":
      if (v >= 200) return 3;
      if (v >= 165) return 2;
      return 1;
    case "spd":
      if (v >= 42) return 3;
      if (v >= 39) return 2;
      return 1;
    case "volt":
      if (v < 18.0 || v >= 32.0) return 3;
      if (v <= 22.9 || v > 28.5) return 2;
      return 1;
  }
}

/** Status keseluruhan = kondisi terburuk dari semua parameter. */
export function overallLevel(t: TelemetryValues): Level {
  const levels = (Object.keys(LEVEL_KEYS) as ParamKey[]).map((k) =>
    levelOf(k, t[k])
  );
  if (levels.includes(3)) return 3;
  if (levels.includes(2)) return 2;
  if (levels.includes(0)) return 0;
  return 1;
}

const LEVEL_KEYS: Record<ParamKey, true> = {
  rpm: true,
  load: true,
  temp: true,
  map: true,
  spd: true,
  volt: true,
};

export const LEVEL_LABEL: Record<Level, string> = {
  0: "Dingin",
  1: "Normal",
  2: "Warning",
  3: "Danger",
};

export type AlertSeverity = "warning" | "danger";

export interface ParameterAlertItem {
  key: ParamKey;
  severity: AlertSeverity;
  title: "Warning" | "Bahaya";
  message: string;
}

export const PARAM_ORDER: ParamKey[] = [
  "rpm",
  "temp",
  "load",
  "map",
  "spd",
  "volt",
];

const PARAM_DISPLAY_NAME: Record<ParamKey, string> = {
  rpm: "Engine Speed",
  temp: "Engine Temp",
  load: "Engine Load",
  map: "Boost Pressure",
  spd: "Speed",
  volt: "System Voltage",
};

/**
 * Mengevaluasi satu parameter apakah berada pada level Warning (2) atau Bahaya (3).
 * Mengembalikan null jika Aman (1) atau Dingin (0).
 */
export function evaluateParameterAlert(
  key: ParamKey,
  value: number
): ParameterAlertItem | null {
  const lv = levelOf(key, value);
  if (lv < 2) return null;

  const isDanger = lv === 3;
  const severity: AlertSeverity = isDanger ? "danger" : "warning";
  const title: "Warning" | "Bahaya" = isDanger ? "Bahaya" : "Warning";

  if (key === "volt") {
    let message: string;
    if (value < 18.0) {
      message = "System Voltage rendah";
    } else if (value <= 22.9) {
      message = "System Voltage mendekati minimal";
    } else if (isDanger) {
      message = "System Voltage tinggi";
    } else {
      message = "System Voltage mendekati maksimal";
    }
    return { key, severity, title, message };
  }

  const label = PARAM_DISPLAY_NAME[key];
  const message = isDanger ? `${label} tinggi` : `${label} mendekati maksimal`;
  return { key, severity, title, message };
}

/** Mengembalikan seluruh parameter yang sedang dalam kondisi Warning atau Bahaya. */
export function getActiveParameterAlerts(
  t: TelemetryValues
): ParameterAlertItem[] {
  const alerts: ParameterAlertItem[] = [];
  for (const key of PARAM_ORDER) {
    const item = evaluateParameterAlert(key, t[key]);
    if (item) alerts.push(item);
  }
  return alerts;
}
