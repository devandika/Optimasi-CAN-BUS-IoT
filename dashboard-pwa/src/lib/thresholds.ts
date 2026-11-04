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
  // Normal: 700 - 2200 RPM
  rpm: {
    min: 0,
    max: 3000,
    lowAlarmThreshold: 500,
    lowWarnThreshold: 700,
    warnThreshold: 2200,
    alarmThreshold: 2400,
    safeRangeText: "700 - 2200 RPM",
  },
  // Normal: 71 - 104 °C (< 71 °C = Dingin, 105-107 °C = Waspada, >= 108 °C = Bahaya)
  temp: {
    min: 0,
    max: 120,
    coldThreshold: 71,
    warnThreshold: 105,
    alarmThreshold: 108,
    safeRangeText: "71 - 104 °C",
  },
  // Normal: < 95% (95-98% = Waspada, >= 99% = Bahaya)
  load: {
    min: 0,
    max: 100,
    warnThreshold: 95,
    alarmThreshold: 99,
    safeRangeText: "<95%",
  },
  // Normal: < 165 kPa (165-199 kPa = Waspada, >= 200 kPa = Bahaya)
  map: {
    min: 0,
    max: 255,
    warnThreshold: 165,
    alarmThreshold: 200,
    safeRangeText: "<165 kPa",
  },
  // Normal: < 39 km/jam (39-41 km/jam = Waspada, >= 42 km/jam = Bahaya)
  spd: {
    min: 0,
    max: 60,
    warnThreshold: 39,
    alarmThreshold: 42,
    safeRangeText: "<39 km/jam",
  },
  // Normal: 24 - 28 Volt (< 22V atau >= 30V = Bahaya, 22-23.9V atau 28.1-29.9V = Waspada)
  volt: {
    min: 0,
    max: 35,
    lowAlarmThreshold: 22,
    lowWarnThreshold: 24,
    warnThreshold: 28,
    alarmThreshold: 30,
    safeRangeText: "24 - 28 Volt",
  },
};

export function levelOf(key: ParamKey, v: number): Level {
  switch (key) {
    case "rpm":
      if (v < 500 || v >= 2400) return 3;
      if (v < 700 || v >= 2200) return 2;
      return 1;
    case "load":
      if (v >= 99) return 3;
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
      if (v < 22.0 || v >= 30.0) return 3;
      if (v < 24.0 || v > 28.0) return 2;
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
  1: "Aman",
  2: "Waspada",
  3: "Bahaya",
};
