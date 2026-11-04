import mqtt, { MqttClient } from "mqtt";

export interface MqttConfig {
  host: string;
  port: number;
  path?: string;
  username?: string;
  password?: string;
}

export interface BrokerValidationResult {
  valid: boolean;
  error?: string;
  sanitizedHost: string;
  sanitizedPort: number;
}

export interface SanitizedTelemetryPayload {
  rpm: number;
  load: number;
  temp: number;
  map: number;
  spd: number;
  volt: number;
  st: number;
}

const DEFAULT_BROKER_HOST = "broker.emqx.io";
const DEFAULT_BROKER_PORT = 8084;
const DEFAULT_BROKER_PATH = "/mqtt";

const HOSTNAME_REGEX = /^[a-zA-Z0-9.-]+$/;
const SAFE_PATH_REGEX = /^\/[a-zA-Z0-9/_-]*$/;

/**
 * Validates and sanitizes MQTT WebSocket broker host and port to prevent
 * SSRF / arbitrary WebSocket URL injection via user-controlled inputs.
 */
export function validateBrokerConfig(
  host: string,
  port: number
): BrokerValidationResult {
  const trimmedHost = typeof host === "string" ? host.trim() : "";
  const numericPort = Number(port);
  const isPortValid =
    Number.isInteger(numericPort) && numericPort >= 1 && numericPort <= 65535;
  const sanitizedPort = isPortValid ? numericPort : DEFAULT_BROKER_PORT;

  if (
    trimmedHost.length < 3 ||
    trimmedHost.length > 253 ||
    !HOSTNAME_REGEX.test(trimmedHost) ||
    trimmedHost.includes("..") ||
    trimmedHost.startsWith(".") ||
    trimmedHost.endsWith(".") ||
    trimmedHost.startsWith("-") ||
    trimmedHost.endsWith("-")
  ) {
    return {
      valid: false,
      error: "Hostname broker tidak valid (gunakan domain atau IPv4 yang sah).",
      sanitizedHost: DEFAULT_BROKER_HOST,
      sanitizedPort,
    };
  }

  if (!isPortValid) {
    return {
      valid: false,
      error: "Port WSS harus berupa bilangan bulat antara 1 hingga 65535.",
      sanitizedHost: trimmedHost,
      sanitizedPort: DEFAULT_BROKER_PORT,
    };
  }

  return {
    valid: true,
    sanitizedHost: trimmedHost,
    sanitizedPort: numericPort,
  };
}

function sanitizeBrokerPath(path?: string): string {
  if (!path || typeof path !== "string") {
    return DEFAULT_BROKER_PATH;
  }
  const trimmed = path.trim();
  if (!SAFE_PATH_REGEX.test(trimmed) || trimmed.includes("..")) {
    return DEFAULT_BROKER_PATH;
  }
  return trimmed;
}

function clampFinite(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  isFloat = false
): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;

  if (!Number.isFinite(num)) {
    return fallback;
  }

  const clamped = Math.min(max, Math.max(min, num));
  return isFloat ? Math.round(clamped * 10) / 10 : Math.round(clamped);
}

/**
 * Safely parses and clamps incoming MQTT telemetry JSON payload to valid
 * SAE J1939 physical ranges, preventing NaN/Infinity propagation and prototype pollution.
 */
export function sanitizeTelemetryPayload(
  raw: unknown
): SanitizedTelemetryPayload {
  let parsed: Record<string, unknown> = {};

  if (typeof raw === "string") {
    try {
      const json = JSON.parse(raw);
      if (typeof json === "object" && json !== null && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
  } else if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>;
  }

  const getOwn = (key: string): unknown =>
    Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : undefined;

  return {
    rpm: clampFinite(getOwn("rpm"), 0, 10000, 0),
    load: clampFinite(getOwn("load"), 0, 100, 0),
    temp: clampFinite(getOwn("temp"), -40, 215, 0),
    map: clampFinite(getOwn("map"), 0, 500, 0),
    spd: clampFinite(getOwn("spd"), 0, 250, 0),
    volt: clampFinite(getOwn("volt"), 0, 60, 0, true),
    st: clampFinite(getOwn("st"), 0, 3, 1),
  };
}

/**
 * Strips ASCII/Unicode control characters from incoming alert strings and
 * caps length at 240 characters to prevent UI/log injection or DOM bloat.
 */
export function sanitizeAlertMessage(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function createBrowserMqttClient(config: MqttConfig): MqttClient {
  // Port 8084 dan 443 adalah port Secure WebSocket (WSS/TLS).
  // Di browser, wss:// dapat diakses baik dari https:// maupun http://localhost.
  const isSecurePort = config.port === 8084 || config.port === 443;
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const protocol = isSecurePort || isHttpsPage ? "wss" : "ws";

  const validation = validateBrokerConfig(config.host, config.port);
  if (!validation.valid) {
    throw new Error(validation.error || "Konfigurasi broker MQTT tidak valid.");
  }

  const safePath = sanitizeBrokerPath(config.path);
  // Format WebSocket URL: wss://broker.emqx.io:8084/mqtt
  const wsUrl = `${protocol}://${validation.sanitizedHost}:${validation.sanitizedPort}${safePath}`;

  const client = mqtt.connect(wsUrl, {
    clientId: `WebDashboard_${Math.random().toString(16).substring(2, 10)}`,
    username: config.username || undefined,
    password: config.password || undefined,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  });

  return client;
}

