/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node CAN-Bus ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 2 - Display Hub, Multi-Page Digital Cluster & UART Forwarder
 * STANDAR: Heavy-Duty SAE J1939 Protocol (250/500 kbps, 29-Bit Extended ID)
 * HARDWARE: ESP32 DevKit V1 (30-Pin) + Transceiver SN65HVD230 + TFT 3.5" ILI9488 + Buzzer + IO Modul 3 Button
 * ==============================================================================
 * MAPPING PIN HARDWARE (ESP32 DevKit V1 30-Pin):
 * - TWAI CAN TX      : GPIO 21 (ke SN65HVD230 CTX)
 * - TWAI CAN RX      : GPIO 22 (ke SN65HVD230 CRX)
 * - TFT SPI SCK      : GPIO 18
 * - TFT SPI MOSI     : GPIO 23
 * - TFT SPI MISO     : GPIO 19
 * - TFT CS           : GPIO 15
 * - TFT DC           : GPIO 2
 * - TFT RESET        : GPIO 4
 * - BUZZER ALARM     : GPIO 13 (Active-LOW, Hi-Z saat hening/muted)
 * - UART2 TX         : GPIO 17 (Kirim JSON ke Node 3 RX2 pin 16)
 * - UART2 RX         : GPIO 16 (Terima Status dari Node 3 TX2 pin 17)
 * - TOMBOL BIT 0 (PREV): GPIO 14 (Input Pull-up, Pin 3 IO Modul) -> Mundur Halaman (5 <- 4 <- 3 <- 2 <- 1 <- 5)
 * - TOMBOL BIT 1 (OK)  : GPIO 32 (Input Pull-up, Pin 4 IO Modul) -> Aksi Halaman (Mute / Reset / Refresh / Ganti Fault)
 * - TOMBOL BIT 2 (NEXT): GPIO 27 (Input Pull-up, Pin 5 IO Modul) -> Maju Halaman (1 -> 2 -> 3 -> 4 -> 5 -> 1)
 * - BOOT BUTTON      : GPIO 0  (Tekan saat startup jika ingin Wi-Fi OTA)
 * ==============================================================================
 */

#include "driver/twai.h"
#include "page1_assets.h"
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <FS.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Update.h>
#include <WebServer.h>
#include <math.h>

// ------------------------------------------------------------------------------
// KONFIGURASI WIFI OTA (OVER-THE-AIR)
// ------------------------------------------------------------------------------
const char *wifi_ssid = "CAT950L_HOTSPOT";
const char *wifi_password = "caterpillar950l";
const char *ota_hostname = "CAT950L-Node2-Display";

WebServer otaServer(80);
bool otaInitialized = false;
bool wifiOtaEnabled = false;
unsigned long wifiConnectStart = 0;

#define PIN_BOOT_BTN 0

// ------------------------------------------------------------------------------
// KONFIGURASI PIN PERIFERAL & TOMBOL NAVIGASI
// ------------------------------------------------------------------------------
#define TX_PIN 21
#define RX_PIN 22
#define PIN_BUZZER 13

#define UART2_TX 17
#define UART2_RX 16

// 3 PUSH BUTTON (IO MODUL 4 BUTTON & 4 LED - ACTIVE LOW)
#define PIN_BTN_PREV 14 // Bit 0 -> Tombol PREV
#define PIN_BTN_OK   32 // Bit 1 -> Tombol OK / ACTION
#define PIN_BTN_NEXT 27 // Bit 2 -> Tombol NEXT

TFT_eSPI tft = TFT_eSPI();

// ------------------------------------------------------------------------------
// PARAMETER GROUP NUMBER (PGN) PROTOKOL SAE J1939
// ------------------------------------------------------------------------------
#define PGN_REQUEST 59904 // 0xEA00 - Request PGN (PDU1)
#define PGN_EEC1    61444 // 0xF004 - Electronic Engine Controller 1 (RPM, SPN 190)
#define PGN_EEC2    61443 // 0xF003 - Electronic Engine Controller 2 (Load, SPN 92)
#define PGN_ET1     65262 // 0xFEEE - Engine Temperature 1 (Coolant Temp, SPN 110)
#define PGN_IC1     65270 // 0xFEF6 - Intake/Exhaust Conditions 1 (MAP Boost, SPN 102)
#define PGN_CCVS    65265 // 0xFEF1 - Cruise Control / Vehicle Speed (Speed, SPN 84)
#define PGN_VEP1    65271 // 0xFEF7 - Vehicle Electrical Power 1 (Voltage, SPN 168)
#define PGN_GW_STAT 65280 // 0xFF00 - Proprietary B Gateway Status dari Node 3
#define PGN_GW_NET  65281 // 0xFF01 - Proprietary B Gateway IPv4 & 32-bit TX Count
#define PGN_GW_SSID 65282 // 0xFF02 - Proprietary B Gateway Wi-Fi SSID (Chunked)

const uint32_t J1939_PGN_LIST[6] = {
  PGN_EEC1, PGN_EEC2, PGN_ET1, PGN_IC1, PGN_CCVS, PGN_VEP1
};
const char* const PGN_NAMES[6] = {
  "EEC1", "EEC2", "ET1 ", "IC1 ", "CCVS", "VEP1"
};
const char* const PGN_UNITS[6] = {
  "rpm", "%", "C", "kPa", "km/h", "V"
};

// ------------------------------------------------------------------------------
// STRUKTUR GEOMETRI HALAMAN 1 (GAUGE CLUSTER)
// ------------------------------------------------------------------------------
const int Y_LINE[7] = {30, 74, 118, 162, 206, 250, 294};
const int Y_ROW[6]  = {40, 84, 128, 172, 216, 260};
const int VLINE_1 = 100, VLINE_2 = 240, VLINE_3 = 435;

// Cache nilai terakhir yang digambar di TFT Halaman 1
uint16_t last_rpm = 65535;
uint8_t  last_load = 255, last_eng = 255, last_map = 255, last_speed = 255;
float    last_volt = 255.0f;
int      last_seg_count[6] = {-1, -1, -1, -1, -1, -1};
uint8_t  last_icon_state[6] = {255, 255, 255, 255, 255, 255};

// Target nilai sensor dari bus CAN & Variabel Smooth Interpolation (Lerp)
uint16_t target_rpm = 0;
float    smooth_rpm = 0.0f;
bool     sync_rpm = false;

uint8_t  target_load = 0;
float    smooth_load = 0.0f;
bool     sync_load = false;

uint8_t  target_eng = 0;
float    smooth_eng = 0.0f;
bool     sync_eng = false;

uint8_t  target_map = 0;
float    smooth_map = 0.0f;
bool     sync_map = false;

uint8_t  target_speed = 0;
float    smooth_speed = 0.0f;
bool     sync_speed = false;

float    target_volt = 0.0f;
float    smooth_volt = 0.0f;
bool     sync_volt = false;

uint8_t current_rpm_state = 1, current_load_state = 1, current_eng_state = 0;
uint8_t current_map_state = 1, current_speed_state = 1, current_volt_state = 1;

// ------------------------------------------------------------------------------
// BUFFER DATA RAW SAE J1939 & STATISTIK (UNTUK HALAMAN 2)
// ------------------------------------------------------------------------------
uint8_t  rawCanPayload[6][8];
uint32_t rawCanCanId[6] = {
  0x0CF00400, 0x0CF00300, 0x18FEEE00, 0x18FEF600, 0x18FEF100, 0x18FEF700
};
uint32_t lastPgnRxTime[6] = {0};
uint32_t totalCanFrames = 0;
uint32_t totalCanErrors = 0;
uint16_t canRxRateHz = 0;
uint32_t frameCounterSec = 0;
unsigned long lastRateCalcTime = 0;

// ------------------------------------------------------------------------------
// STATUS IOT GATEWAY DARI NODE 3 (UNTUK HALAMAN 3)
// ------------------------------------------------------------------------------
bool     node3_online = false;
bool     node3_wifi_connected = false;
bool     node3_mqtt_connected = false;
int      node3_rssi = -100;
uint32_t node3_tx_count = 0;
char     node3_ip[20] = "Connecting...";
char     node3_ssid[32] = "Waiting...";
bool     node3_has_full_ip = false;
char     node3_ssid_rx_buf[32] = "";
uint8_t  node3_ssid_chunk_mask = 0;
unsigned long lastNode3RxTime = 0;

// ------------------------------------------------------------------------------
// MANAJEMEN HALAMAN & TOMBOL FISIK
// ------------------------------------------------------------------------------
constexpr uint8_t TOTAL_PAGES = 7;
constexpr uint8_t PAGE_COVER  = 1;
constexpr uint8_t PAGE_TEAM   = 2;
constexpr uint8_t PAGE_GAUGES = 3;
constexpr uint8_t PAGE_J1939  = 4;
constexpr uint8_t PAGE_IOT    = 5;
constexpr uint8_t PAGE_LIMITS = 6;
constexpr uint8_t PAGE_FAULTS = 7;

uint8_t currentPage = PAGE_COVER;
bool buzzerMuted = false;

// State & Cache Halaman 5 (Fault Code Monitor)
uint8_t selectedFaultSlot = 0;
int8_t  previewSpnIdx = -1; // -1: Live Monitor, 0..5: Preview SPN saat tidak ada fault
int8_t  lastFaultRenderedMode = -1; // 0: No Fault, 1: Active Fault, 2: Preview SPN
uint8_t lastFaultRenderedCount = 255;
uint8_t lastFaultRenderedSlot = 255;
int8_t  lastFaultRenderedId = -1;
uint8_t lastFaultRenderedSeverity = 255;
uint8_t lastFaultRenderedSubDir = 255; // Untuk membedakan Volt rendah vs tinggi
uint32_t lastFaultRenderedSig = 0xFFFFFFFFUL;
int32_t lastFaultRenderedValInt = -999999;

// Debouncing & Edge-triggered tombol
int lastPrevState = HIGH;
int lastOkState   = HIGH;
int lastNextState = HIGH;
unsigned long lastDebounceTimePrev = 0;
unsigned long lastDebounceTimeOk   = 0;
unsigned long lastDebounceTimeNext = 0;
const unsigned long DEBOUNCE_COOLDOWN_MS = 220; // Anti-rebound & non-blocking

// Timer sistem
bool hasReceivedCanData = false;
unsigned long lastCanRxTime = 0;
unsigned long lastSmoothStep = 0;
unsigned long lastPageRenderStep = 0;
unsigned long lastWatchdogCheck = 0;
unsigned long blinkTimer = 0;
bool blinkState = false;

unsigned long lastRequestTime = 0;
uint8_t pgnReqIndex = 0;
unsigned long lastForwardTime = 0;

// Status LED Header
uint8_t lastHeaderEcuState = 255;
uint8_t lastHeaderCanState = 255;
uint8_t lastHeaderCloudState = 255;

// Buffer Serial2 (Node 3 Link)
String node3SerialBuffer = "";

// Forward Declarations
void switchPage(uint8_t newPage);
void drawHeader();
void updateHeaderStatus(bool forceRedraw = false);
void drawFooter();
void updateTelemetryStates();
void drawPageCover_Static();
void drawPageTeam_Static();
void drawPage1_Static();
void drawPage2_Static();
void updatePage2_Dynamic();
void drawPage3_Static();
void updatePage3_Dynamic();
void drawPage4_Static();
void drawPage5_Static();
void updatePage5_Dynamic(bool forceRedraw = false);
uint8_t collectActiveFaults(uint8_t outParams[6], uint8_t outStates[6]);
void resetTWAI();
void initTWAI();

// ------------------------------------------------------------------------------
// INISIALISASI & RESET DRIVER TWAI CAN
// ------------------------------------------------------------------------------
void initTWAI() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(
      (gpio_num_t)TX_PIN, (gpio_num_t)RX_PIN, TWAI_MODE_NORMAL);
  g_config.tx_queue_len = 5;
  g_config.rx_queue_len = 25;
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  twai_driver_install(&g_config, &t_config, &f_config);
  twai_start();
}

void resetTWAI() {
  twai_stop();
  twai_driver_uninstall();
  delay(2);
  initTWAI();
}

// ------------------------------------------------------------------------------
// FUNGSI REQUEST PGN SAE J1939 (PGN 59904 / 0xEA00, 29-BIT EXTENDED)
// ------------------------------------------------------------------------------
void requestJ1939PGN(uint32_t targetPgn) {
  twai_clear_transmit_queue();
  twai_message_t tx_msg = {};
  tx_msg.extd = 1;
  tx_msg.rtr = 0;
  tx_msg.data_length_code = 3;
  // Format: Priority 6, PF 0xEA, PS 0x00 (Destination Engine ECU), SA 0x28 (Cluster Display)
  tx_msg.identifier = 0x18EA0028;
  tx_msg.data[0] = (uint8_t)(targetPgn & 0xFF);
  tx_msg.data[1] = (uint8_t)((targetPgn >> 8) & 0xFF);
  tx_msg.data[2] = (uint8_t)((targetPgn >> 16) & 0xFF);
  twai_transmit(&tx_msg, pdMS_TO_TICKS(5));
}

// ------------------------------------------------------------------------------
// LOGIKA EVALUASI STATE TELEMETRI
// ------------------------------------------------------------------------------
uint8_t getNormalState(int val, int warn_val, int alarm_val) {
  if (val >= alarm_val) return 3;
  if (val >= warn_val)  return 2;
  return 1;
}

uint8_t getTempState(int val, int cold_val, int warn_val, int alarm_val) {
  if (val >= alarm_val) return 3;
  if (val >= warn_val)  return 2;
  if (val < cold_val)   return 0;
  return 1;
}

uint8_t getVoltState(float val) {
  if (val < 18.0f || val >= 32.0f) return 3;
  if (val <= 22.9f || val > 28.5f) return 2;
  return 1;
}

uint16_t stateToColor(uint8_t state) {
  if (state == 0) return tft.color565(0, 191, 255); // Cold: Sky Blue
  if (state == 1) return TFT_GREEN;                 // Normal: Green
  if (state == 2) return TFT_ORANGE;                // Warning: Orange
  if (state == 3) return TFT_RED;                   // Alarm: Red
  return TFT_WHITE;
}

// ------------------------------------------------------------------------------
// FUNGSI VISUAL BAR DIFERENSIAL HALAMAN 1 (BEBAS FLICKER)
// ------------------------------------------------------------------------------
void drawDynamicStairBar(int row_idx, int x, int y, int val, int max_val,
                         int warn_val, int alarm_val, int cold_val = -1) {
  int max_segments = 20;
  int filled_segments = map(val, 0, max_val, 0, max_segments);
  if (filled_segments > max_segments) filled_segments = max_segments;
  if (filled_segments < 0) filled_segments = 0;

  if (filled_segments == last_seg_count[row_idx]) return;
  last_seg_count[row_idx] = filled_segments;

  for (int i = 0; i < max_segments; i++) {
    int seg_height = 6 + (i * 1);
    int y_offset = y + (25 - seg_height);
    int seg_val = (i + 1) * max_val / max_segments;
    uint16_t seg_color = TFT_GREEN;

    if (seg_val >= alarm_val)
      seg_color = TFT_RED;
    else if (seg_val >= warn_val)
      seg_color = TFT_ORANGE;
    else if (cold_val != -1 && seg_val < cold_val)
      seg_color = tft.color565(0, 191, 255);

    if (i < filled_segments)
      tft.fillRect(x + (i * 9), y_offset, 7, seg_height, seg_color);
    else
      tft.fillRect(x + (i * 9), y_offset, 7, seg_height, TFT_DARKGREY);
  }
}

void drawVoltStairBar(int x, int y, float val) {
  int max_segments = 20;
  float max_volt_scale = 35.0f;
  int filled_segments = (int)((val / max_volt_scale) * max_segments);
  if (filled_segments > max_segments) filled_segments = max_segments;
  if (filled_segments < 0) filled_segments = 0;

  if (filled_segments == last_seg_count[5]) return;
  last_seg_count[5] = filled_segments;

  for (int i = 0; i < max_segments; i++) {
    int seg_height = 6 + (i * 1);
    int y_offset = y + (25 - seg_height);
    float seg_val = (i + 1) * max_volt_scale / max_segments;
    uint16_t seg_color;

    if (seg_val < 18.0f || seg_val >= 32.0f)
      seg_color = TFT_RED;
    else if (seg_val <= 22.9f || seg_val > 28.5f)
      seg_color = TFT_ORANGE;
    else
      seg_color = TFT_GREEN;

    if (i < filled_segments)
      tft.fillRect(x + (i * 9), y_offset, 7, seg_height, seg_color);
    else
      tft.fillRect(x + (i * 9), y_offset, 7, seg_height, TFT_DARKGREY);
  }
}

void drawAlertIcon(int row_idx, uint8_t state, bool blinkChanged) {
  if (state == last_icon_state[row_idx] && !(state == 3 && blinkChanged))
    return;
  last_icon_state[row_idx] = state;

  int radius = 12;
  int center_x = VLINE_3 + ((480 - VLINE_3) / 2);
  int center_y = Y_ROW[row_idx] + 10;
  if (state == 0 || state == 1) {
    tft.fillCircle(center_x, center_y, radius, TFT_BLACK);
  } else if (state == 2) {
    tft.fillCircle(center_x, center_y, radius, TFT_ORANGE);
    tft.setTextColor(TFT_BLACK, TFT_ORANGE);
    tft.setTextSize(2);
    tft.drawString("!", center_x - 5, center_y - 7);
  } else if (state == 3) {
    if (blinkState) {
      tft.fillCircle(center_x, center_y, radius, TFT_RED);
      tft.setTextColor(TFT_WHITE, TFT_RED);
      tft.setTextSize(2);
      tft.drawString("!", center_x - 5, center_y - 7);
    } else {
      tft.fillCircle(center_x, center_y, radius, TFT_BLACK);
    }
  }
}

void renderRowNumberInt(int row_idx, int val, uint8_t state) {
  char buf[8];
  snprintf(buf, sizeof(buf), "%-4d", val);
  tft.setTextSize(3);
  tft.setTextColor(stateToColor(state), TFT_BLACK);
  tft.drawString(buf, VLINE_1 + 5, Y_ROW[row_idx]);
}

void renderRowNumberFloat(int row_idx, float val, uint8_t state) {
  char buf[8];
  snprintf(buf, sizeof(buf), "%-4.1f", val);
  tft.setTextSize(3);
  tft.setTextColor(stateToColor(state), TFT_BLACK);
  tft.drawString(buf, VLINE_1 + 5, Y_ROW[row_idx]);
}

float stepLerp(float current, float target, float factor, float snapThreshold) {
  float diff = target - current;
  if (fabsf(diff) <= snapThreshold) return target;
  return current + (diff * factor);
}

void updateTelemetryStates() {
  if (sync_rpm) {
    smooth_rpm = stepLerp(smooth_rpm, (float)target_rpm, 0.35f, 1.5f);
    uint16_t disp_rpm = (uint16_t)(smooth_rpm + 0.5f);
    current_rpm_state = getNormalState(disp_rpm, 2200, 2400);
  }
  if (sync_load) {
    smooth_load = stepLerp(smooth_load, (float)target_load, 0.35f, 0.6f);
    uint8_t disp_load = (uint8_t)(smooth_load + 0.5f);
    current_load_state = getNormalState(disp_load, 95, 100);
  }
  if (sync_eng) {
    smooth_eng = stepLerp(smooth_eng, (float)target_eng, 0.35f, 0.6f);
    uint8_t disp_eng = (uint8_t)(smooth_eng + 0.5f);
    current_eng_state = getTempState(disp_eng, 71, 105, 108);
  }
  if (sync_map) {
    smooth_map = stepLerp(smooth_map, (float)target_map, 0.35f, 0.8f);
    uint8_t disp_map = (uint8_t)(smooth_map + 0.5f);
    current_map_state = getNormalState(disp_map, 165, 200);
  }
  if (sync_speed) {
    smooth_speed = stepLerp(smooth_speed, (float)target_speed, 0.35f, 0.6f);
    uint8_t disp_speed = (uint8_t)(smooth_speed + 0.5f);
    current_speed_state = getNormalState(disp_speed, 39, 42);
  }
  if (sync_volt) {
    smooth_volt = stepLerp(smooth_volt, target_volt, 0.35f, 0.05f);
    float disp_volt = ((int)(smooth_volt * 10.0f + 0.5f)) / 10.0f;
    current_volt_state = getVoltState(disp_volt);
  }
}

void updateSmoothDisplay() {
  if (currentPage != PAGE_GAUGES) return; // Hanya gambar jika sedang di Halaman Gauges (Hal 3)

  // 1. RPM
  uint16_t disp_rpm = (uint16_t)(smooth_rpm + 0.5f);
  if (disp_rpm != last_rpm) {
    renderRowNumberInt(0, disp_rpm, current_rpm_state);
    drawDynamicStairBar(0, VLINE_2 + 8, Y_ROW[0] - 2, disp_rpm, 3000, 2200, 2400);
    last_rpm = disp_rpm;
  }

  // 2. ENGINE LOAD
  uint8_t disp_load = (uint8_t)(smooth_load + 0.5f);
  if (disp_load != last_load) {
    renderRowNumberInt(1, disp_load, current_load_state);
    drawDynamicStairBar(1, VLINE_2 + 8, Y_ROW[1] - 2, disp_load, 100, 95, 100);
    last_load = disp_load;
  }

  // 3. ENGINE TEMP
  uint8_t disp_eng = (uint8_t)(smooth_eng + 0.5f);
  if (disp_eng != last_eng) {
    renderRowNumberInt(2, disp_eng, current_eng_state);
    drawDynamicStairBar(2, VLINE_2 + 8, Y_ROW[2] - 2, disp_eng, 120, 102, 108, 71);
    last_eng = disp_eng;
  }

  // 4. MAP BOOST
  uint8_t disp_map = (uint8_t)(smooth_map + 0.5f);
  if (disp_map != last_map) {
    renderRowNumberInt(3, disp_map, current_map_state);
    drawDynamicStairBar(3, VLINE_2 + 8, Y_ROW[3] - 2, disp_map, 255, 165, 200);
    last_map = disp_map;
  }

  // 5. SPEED
  uint8_t disp_speed = (uint8_t)(smooth_speed + 0.5f);
  if (disp_speed != last_speed) {
    renderRowNumberInt(4, disp_speed, current_speed_state);
    drawDynamicStairBar(4, VLINE_2 + 8, Y_ROW[4] - 2, disp_speed, 60, 39, 42);
    last_speed = disp_speed;
  }

  // 6. SYSTEM VOLTAGE
  float disp_volt = ((int)(smooth_volt * 10.0f + 0.5f)) / 10.0f;
  if (fabsf(disp_volt - last_volt) >= 0.09f) {
    renderRowNumberFloat(5, disp_volt, current_volt_state);
    drawVoltStairBar(VLINE_2 + 8, Y_ROW[5] - 2, disp_volt);
    last_volt = disp_volt;
  }
}

// ------------------------------------------------------------------------------
// RENDER HEADER STATIS & STATUS INDIKATOR BULAT (ECU, CAN, IOT)
// ------------------------------------------------------------------------------
void drawHeader() {
  if (currentPage == PAGE_COVER || currentPage == PAGE_TEAM) return;

  tft.fillRect(0, 0, 480, 30, tft.color565(18, 24, 38)); // Dark Navy Bar
  tft.drawFastHLine(0, 30, 480, tft.color565(55, 65, 85));

  // Badge Indikator Halaman
  tft.setTextSize(2);
  tft.setTextColor(tft.color565(255, 205, 0), tft.color565(18, 24, 38));
  char pageBadge[10];
  snprintf(pageBadge, sizeof(pageBadge), "[%d/%d]", currentPage, TOTAL_PAGES);
  tft.drawString(pageBadge, 8, 7);

  // Judul
  tft.setTextColor(TFT_WHITE, tft.color565(18, 24, 38));
  tft.drawString("CAT 950L MONITOR", 86, 7);

  // Label Header Virtual LEDs
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(170, 185, 205), tft.color565(18, 24, 38));
  tft.drawString("ECU", 330, 11);
  tft.drawString("CAN", 380, 11);
  tft.drawString("IOT", 430, 11);

  // Paksa render ulang status bulatan
  updateHeaderStatus(true);
}

void updateHeaderStatus(bool forceRedraw) {
  if (currentPage == PAGE_COVER || currentPage == PAGE_TEAM) return;

  unsigned long now = millis();

  // Status ECU: Berdasarkan alarm/warning sensor
  uint8_t ecuState = 1; // 1: Normal, 2: Warning, 3: Alarm
  if (current_rpm_state == 3 || current_load_state == 3 || current_eng_state == 3 ||
      current_map_state == 3 || current_speed_state == 3 || current_volt_state == 3) {
    ecuState = 3;
  } else if (current_rpm_state == 2 || current_load_state == 2 || current_eng_state == 2 ||
             current_map_state == 2 || current_speed_state == 2 || current_volt_state == 2) {
    ecuState = 2;
  }

  // Status CAN: Hijau jika ada frame diterima < 600 ms, merah jika timeout
  uint8_t canState = (hasReceivedCanData && (now - lastCanRxTime < 600)) ? 1 : 3;

  // Status IoT Gateway: Hijau jika online & MQTT connected, kuning jika WiFi only, merah jika offline
  uint8_t cloudState = 3;
  if (node3_online && (now - lastNode3RxTime < 4000)) {
    if (node3_mqtt_connected) cloudState = 1;
    else if (node3_wifi_connected) cloudState = 2;
  }

  if (forceRedraw || ecuState != lastHeaderEcuState) {
    tft.fillCircle(355, 15, 6, stateToColor(ecuState));
    lastHeaderEcuState = ecuState;
  }
  if (forceRedraw || canState != lastHeaderCanState) {
    tft.fillCircle(405, 15, 6, (canState == 1) ? TFT_GREEN : TFT_RED);
    lastHeaderCanState = canState;
  }
  if (forceRedraw || cloudState != lastHeaderCloudState) {
    tft.fillCircle(455, 15, 6, stateToColor(cloudState));
    lastHeaderCloudState = cloudState;
  }
}

// ------------------------------------------------------------------------------
// RENDER FOOTER PETUNJUK TOMBOL DINAMIS
// ------------------------------------------------------------------------------
void drawFooter() {
  if (currentPage == PAGE_COVER || currentPage == PAGE_TEAM) return;

  const uint16_t footerBg = tft.color565(15, 20, 30);
  tft.fillRect(0, 295, 480, 25, footerBg);
  tft.drawFastHLine(0, 295, 480, tft.color565(45, 55, 75));

  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, footerBg);

  const uint8_t prevPage = (currentPage == 1) ? TOTAL_PAGES : (currentPage - 1);
  const uint8_t nextPage = (currentPage % TOTAL_PAGES) + 1;
  char navBuf[16];

  snprintf(navBuf, sizeof(navBuf), "[<] HAL %d", prevPage);
  tft.drawString(navBuf, 10, 303);

  if (currentPage == PAGE_GAUGES) {
    if (buzzerMuted) {
      tft.setTextColor(TFT_RED, footerBg);
      tft.drawString("[●] BUZZER: MUTED (HENING)", 160, 303);
    } else {
      tft.setTextColor(TFT_GREEN, footerBg);
      tft.drawString("[●] BUZZER: AKTIF (NORMAL)", 160, 303);
    }
  } else if (currentPage == PAGE_J1939) {
    tft.setTextColor(tft.color565(255, 205, 0), footerBg);
    tft.drawString("[●] TEKAN OK: RESET RX COUNTER", 155, 303);
  } else if (currentPage == PAGE_IOT) {
    tft.setTextColor(tft.color565(0, 230, 118), footerBg);
    tft.drawString("[●] TEKAN OK: REFRESH STATUS IOT", 150, 303);
  } else if (currentPage == PAGE_LIMITS) {
    tft.setTextColor(tft.color565(180, 195, 215), footerBg);
    tft.drawString("BATAS KERJA PARAMETER OPERASIONAL", 141, 303);
  } else if (currentPage == PAGE_FAULTS) {
    tft.setTextColor(tft.color565(255, 205, 0), footerBg);
    tft.drawString("[●] OK: GANTI / PREVIEW FAULT", 153, 303);
  }

  tft.setTextColor(TFT_WHITE, footerBg);
  snprintf(navBuf, sizeof(navBuf), "[>] HAL %d", nextPage);
  tft.drawString(navBuf, 420, 303);
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 1 (GAUGE CLUSTER TELEMETRI)
// ------------------------------------------------------------------------------
void drawPage1_Static() {
  for (int i = 0; i < 7; i++)
    tft.drawLine(0, Y_LINE[i], 480, Y_LINE[i], TFT_DARKGREY);
  tft.drawLine(VLINE_1, 30, VLINE_1, 294, TFT_DARKGREY);
  tft.drawLine(VLINE_2, 30, VLINE_2, 294, TFT_DARKGREY);
  tft.drawLine(VLINE_3, 30, VLINE_3, 294, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("RPM", 5, Y_ROW[0]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("REV", VLINE_2 - 45, Y_ROW[0]);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("ENG LOAD", 5, Y_ROW[1]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("%", VLINE_2 - 35, Y_ROW[1]);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("ENG TMP", 5, Y_ROW[2]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("C", VLINE_2 - 35, Y_ROW[2]);
  tft.drawCircle(VLINE_2 - 42, Y_ROW[2] + 2, 2, TFT_WHITE);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("MAP BST", 5, Y_ROW[3]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("kPa", VLINE_2 - 45, Y_ROW[3]);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("SPEED", 5, Y_ROW[4]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("KM/H", VLINE_2 - 60, Y_ROW[4]);
  tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("SYS VOLT", 5, Y_ROW[5]);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("V", VLINE_2 - 35, Y_ROW[5]);

  // Reset cache agar seluruh gauge ter-render penuh saat kembali ke Halaman 1
  last_rpm = 65535;
  last_load = 255; last_eng = 255; last_map = 255; last_speed = 255;
  last_volt = 255.0f;
  for (int i = 0; i < 6; i++) {
    last_seg_count[i] = -1;
    last_icon_state[i] = 255;
  }
  updateSmoothDisplay();
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 2 (SAE J1939 NETWORK HEALTH & MONITOR FRAME)
// ------------------------------------------------------------------------------
void drawPage2_Static() {
  // Banner Info Status Bus Atas
  tft.fillRect(5, 34, 470, 26, tft.color565(25, 32, 48));
  tft.drawRect(5, 34, 470, 26, tft.color565(50, 65, 95));

  tft.setTextSize(1);
  tft.setTextColor(tft.color565(0, 230, 118), tft.color565(25, 32, 48));
  tft.drawString("BUS: SAE J1939 (500K EXT-ID)", 12, 43);

  // Header Tabel Kolom
  tft.fillRect(5, 64, 470, 18, tft.color565(35, 45, 68));
  tft.setTextColor(tft.color565(255, 205, 0), tft.color565(35, 45, 68));
  tft.drawString("PGN", 10, 69);
  tft.drawString("NAME", 55, 69);
  tft.drawString("29-BIT ID", 100, 69);
  tft.drawString("PAYLOAD DATA (HEX 8-BYTE)", 185, 69);
  tft.drawString("VALUE", 410, 69);

  // Baris Statis Tabel (6 PGN)
  for (int i = 0; i < 6; i++) {
    int y = 86 + (i * 32);
    tft.drawFastHLine(5, y + 28, 470, tft.color565(40, 50, 70));

    tft.setTextSize(1);
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    char pgnBuf[10];
    snprintf(pgnBuf, sizeof(pgnBuf), "%-5u", J1939_PGN_LIST[i]);
    tft.drawString(pgnBuf, 10, y + 8);

    tft.setTextColor(tft.color565(0, 210, 255), TFT_BLACK);
    tft.drawString(PGN_NAMES[i], 55, y + 8);

    tft.setTextColor(tft.color565(170, 180, 200), TFT_BLACK);
    char idBuf[12];
    snprintf(idBuf, sizeof(idBuf), "0x%08X", rawCanCanId[i]);
    tft.drawString(idBuf, 95, y + 8);
  }

  updatePage2_Dynamic();
}

void updatePage2_Dynamic() {
  if (currentPage != PAGE_J1939) return;

  // Update Summary Info Atas
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, tft.color565(25, 32, 48));
  char statBuf[40];
  snprintf(statBuf, sizeof(statBuf), "RX: %-6u | RATE: %2u Hz", totalCanFrames, canRxRateHz);
  tft.drawString(statBuf, 275, 43);

  // Update 6 Baris Hex Payload & Nilai Terakhir
  for (int i = 0; i < 6; i++) {
    int y = 86 + (i * 32);

    // Format 8-Byte Hex
    char hexBuf[30];
    snprintf(hexBuf, sizeof(hexBuf), "%02X %02X %02X %02X %02X %02X %02X %02X",
             rawCanPayload[i][0], rawCanPayload[i][1], rawCanPayload[i][2], rawCanPayload[i][3],
             rawCanPayload[i][4], rawCanPayload[i][5], rawCanPayload[i][6], rawCanPayload[i][7]);

    tft.setTextSize(1);
    tft.setTextColor(tft.color565(255, 230, 120), TFT_BLACK);
    tft.drawString(hexBuf, 185, y + 8);

    // Nilai Terurai (Value)
    char valBuf[16];
    uint16_t col = TFT_GREEN;
    switch (i) {
      case 0: snprintf(valBuf, sizeof(valBuf), "%-4u rpm", target_rpm); col = stateToColor(current_rpm_state); break;
      case 1: snprintf(valBuf, sizeof(valBuf), "%-3u %%  ", target_load); col = stateToColor(current_load_state); break;
      case 2: snprintf(valBuf, sizeof(valBuf), "%-3u C  ", target_eng);  col = stateToColor(current_eng_state); break;
      case 3: snprintf(valBuf, sizeof(valBuf), "%-3u kPa", target_map);  col = stateToColor(current_map_state); break;
      case 4: snprintf(valBuf, sizeof(valBuf), "%-3u kmh", target_speed);col = stateToColor(current_speed_state); break;
      case 5: snprintf(valBuf, sizeof(valBuf), "%-4.1f V ", target_volt); col = stateToColor(current_volt_state); break;
    }
    tft.setTextColor(col, TFT_BLACK);
    tft.drawString(valBuf, 405, y + 8);
  }
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 3 (STATUS IOT GATEWAY & CLOUD INTEGRATION)
// ------------------------------------------------------------------------------
void drawPage3_Static() {
  // Panel 1: WI-FI NETWORK (NODE 3)
  tft.fillRect(10, 36, 225, 115, tft.color565(20, 26, 40));
  tft.drawRect(10, 36, 225, 115, tft.color565(50, 65, 95));
  tft.fillRect(10, 36, 225, 22, tft.color565(30, 42, 65));
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(255, 205, 0), tft.color565(30, 42, 65));
  tft.drawString("WI-FI GATEWAY (NODE 3)", 18, 42);

  tft.setTextColor(tft.color565(160, 175, 195), tft.color565(20, 26, 40));
  tft.drawString("SSID   :", 18, 66);
  tft.drawString("IP ADDR:", 18, 86);
  tft.drawString("SIGNAL :", 18, 106);
  tft.drawString("LINK   :", 18, 126);

  // Panel 2: MQTT BROKER (EMQX CLOUD)
  tft.fillRect(245, 36, 225, 115, tft.color565(20, 26, 40));
  tft.drawRect(245, 36, 225, 115, tft.color565(50, 65, 95));
  tft.fillRect(245, 36, 225, 22, tft.color565(30, 42, 65));
  tft.setTextColor(tft.color565(0, 230, 118), tft.color565(30, 42, 65));
  tft.drawString("EMQX CLOUD BROKER", 253, 42);

  tft.setTextColor(tft.color565(160, 175, 195), tft.color565(20, 26, 40));
  tft.drawString("BROKER :", 253, 66);
  tft.drawString("PORT   :", 253, 86);
  tft.drawString("TOPIC  :", 253, 106);
  tft.drawString("STATUS :", 253, 126);

  // Data statis broker
  tft.setTextColor(TFT_WHITE, tft.color565(20, 26, 40));
  tft.drawString("broker.emqx.io", 312, 66);
  tft.drawString("1883 (TCP / QoS 1)", 312, 86);
  tft.drawString("cat950l/telemetry", 312, 106);

  // Panel 3: STATISTIK TELEMETRI & KONTRAK DATA
  tft.fillRect(10, 160, 460, 125, tft.color565(20, 26, 40));
  tft.drawRect(10, 160, 460, 125, tft.color565(50, 65, 95));
  tft.fillRect(10, 160, 460, 22, tft.color565(30, 42, 65));
  tft.setTextColor(tft.color565(0, 210, 255), tft.color565(30, 42, 65));
  tft.drawString("TELEMETRY METRICS & NODE 3 HEALTH", 18, 166);

  tft.setTextColor(tft.color565(160, 175, 195), tft.color565(20, 26, 40));
  tft.drawString("DATA CONTRACT     : Contract-First v2.1 (CAN + MQTT)", 18, 192);
  tft.drawString("INGESTION BUS     : SAE J1939 Multi-Node CAN (500K)", 18, 212);
  tft.drawString("PACKETS UPLOADED  :", 18, 232);
  tft.drawString("LAST NODE 3 SYNC  :", 18, 252);

  updatePage3_Dynamic();
}

void updatePage3_Dynamic() {
  if (currentPage != PAGE_IOT) return;
  unsigned long now = millis();

  bool gwFresh = node3_online && (lastNode3RxTime > 0) && ((now - lastNode3RxTime) < 4000);
  bool wifiActive = gwFresh && node3_wifi_connected;
  bool mqttActive = gwFresh && node3_wifi_connected && node3_mqtt_connected;

  // Dynamic Wi-Fi Info
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, tft.color565(20, 26, 40));

  char ssidBuf[28];
  snprintf(ssidBuf, sizeof(ssidBuf), "%-25.25s",
           wifiActive ? node3_ssid : (gwFresh ? "Connecting WiFi..." : "Waiting Node 3..."));
  tft.drawString(ssidBuf, 75, 66);

  char ipBuf[24];
  snprintf(ipBuf, sizeof(ipBuf), "%-20.20s",
           wifiActive ? node3_ip : (gwFresh ? "Acquiring IP..." : "Disconnected"));
  tft.drawString(ipBuf, 75, 86);

  char sigBuf[24];
  if (wifiActive) {
    snprintf(sigBuf, sizeof(sigBuf), "%-4d dBm            ", node3_rssi);
  } else {
    snprintf(sigBuf, sizeof(sigBuf), "-- dBm              ");
  }
  tft.drawString(sigBuf, 75, 106);

  if (wifiActive) {
    tft.setTextColor(TFT_GREEN, tft.color565(20, 26, 40));
    tft.drawString("ONLINE (STA)        ", 75, 126);
  } else if (gwFresh) {
    tft.setTextColor(TFT_ORANGE, tft.color565(20, 26, 40));
    tft.drawString("CONNECTING...       ", 75, 126);
  } else {
    tft.setTextColor(TFT_RED, tft.color565(20, 26, 40));
    tft.drawString("DISCONNECTED        ", 75, 126);
  }

  // Dynamic MQTT Status
  if (mqttActive) {
    tft.setTextColor(TFT_GREEN, tft.color565(20, 26, 40));
    tft.drawString("CONNECTED (ACTIVE)  ", 312, 126);
  } else if (wifiActive) {
    tft.setTextColor(TFT_ORANGE, tft.color565(20, 26, 40));
    tft.drawString("RECONNECTING...     ", 312, 126);
  } else {
    tft.setTextColor(TFT_RED, tft.color565(20, 26, 40));
    tft.drawString("DISCONNECTED        ", 312, 126);
  }

  // Dynamic Metrics
  tft.setTextColor(tft.color565(255, 205, 0), tft.color565(20, 26, 40));
  char txBuf[32];
  snprintf(txBuf, sizeof(txBuf), "%-7lu Frames         ", (unsigned long)node3_tx_count);
  tft.drawString(txBuf, 155, 232);

  char syncBuf[40];
  if (lastNode3RxTime == 0) {
    snprintf(syncBuf, sizeof(syncBuf), "%-35.35s", "Waiting Node 3 heartbeat...");
    tft.setTextColor(TFT_ORANGE, tft.color565(20, 26, 40));
  } else if (gwFresh) {
    unsigned long age = (now - lastNode3RxTime) / 1000;
    char rawSync[40];
    snprintf(rawSync, sizeof(rawSync), "%lu sec ago (Active)", age);
    snprintf(syncBuf, sizeof(syncBuf), "%-35.35s", rawSync);
    tft.setTextColor(TFT_GREEN, tft.color565(20, 26, 40));
  } else {
    unsigned long age = (now - lastNode3RxTime) / 1000;
    char rawSync[40];
    snprintf(rawSync, sizeof(rawSync), "%lu sec ago (Timeout / Offline)", age);
    snprintf(syncBuf, sizeof(syncBuf), "%-35.35s", rawSync);
    tft.setTextColor(TFT_RED, tft.color565(20, 26, 40));
  }
  tft.drawString(syncBuf, 155, 252);
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 4 (TABEL BATAS KERJA PARAMETER - 5 KOLOM)
// ------------------------------------------------------------------------------
void drawTableCellLines(int x, int y, int w, int h, uint16_t bgColor, uint16_t fgColor,
                        const char *line1, const char *line2) {
  tft.fillRect(x, y, w, h, bgColor);
  tft.setTextSize(1);
  tft.setTextColor(fgColor, bgColor);
  if (line2 != nullptr && line2[0] != '\0') {
    tft.drawString(line1, x + 6, y + 8);
    tft.drawString(line2, x + 6, y + 21);
  } else {
    tft.drawString(line1, x + 6, y + 14);
  }
}

void drawPage4_Static() {
  struct ParamLimitRow {
    const char *param;
    const char *idle1;
    const char *idle2;
    const char *norm1;
    const char *norm2;
    const char *warn1;
    const char *warn2;
    const char *crit1;
    const char *crit2;
  };

  const ParamLimitRow rows[6] = {
    {"Engine Speed",   "700-800",   "RPM",      "< 2200 RPM", "",  "2200-2399", "RPM",      ">= 2400 RPM", ""},
    {"Engine Load",    "0-15 %",    "",         "< 95 %",     "",  "95-99 %",   "",         ">= 100 %",    ""},
    {"Engine Temp",    "< 71 C",    "(Cold)",   "71-104 C",   "",  "105-107 C", "",         ">= 108 C",    ""},
    {"Boost Pressure", "0 kPa",     "(Idle)",   "< 165 kPa",  "",  "165-199",   "kPa",      ">= 200 kPa",  ""},
    {"Speed",          "0 km/h",    "",         "< 39 km/h",  "",  "39-41",     "km/h",     ">= 42 km/h",  ""},
    {"System Voltage", ">= 23.0 V", "(Min)",    "23.0-28.5",  "V", "<= 22.9 V", "> 28.5 V", "< 18.0 V",    ">= 32.0 V"}
  };

  const int colX[5] = {0, 110, 194, 288, 382};
  const int colW[5] = {110, 84, 94, 94, 98};
  const char *colTitles[5] = {"PARAMETER", "IDLE / MIN", "NORMAL", "WARNING", "CRITICAL"};

  const uint16_t titleBg   = tft.color565(24, 34, 52);
  const uint16_t hdrBg[5]  = {
    tft.color565(180, 188, 200),
    tft.color565(134, 239, 172),
    tft.color565(74, 222, 128),
    tft.color565(250, 204, 21),
    tft.color565(205, 32, 32)
  };
  const uint16_t hdrFg[5]  = {TFT_BLACK, TFT_BLACK, TFT_BLACK, TFT_BLACK, TFT_WHITE};

  const uint16_t cellBg[5] = {
    tft.color565(232, 236, 242), // Parameter: Abu-abu terang bersih
    tft.color565(167, 243, 208), // Idle/Min : Hijau muda lembut
    tft.color565(134, 239, 172), // Normal   : Hijau muda
    tft.color565(253, 224, 71),  // Warning  : Kuning
    tft.color565(220, 38, 38)    // Critical : Merah
  };
  const uint16_t cellFg[5] = {TFT_BLACK, TFT_BLACK, TFT_BLACK, TFT_BLACK, TFT_WHITE};
  const uint16_t borderCol = tft.color565(45, 55, 72);

  // Strip judul atas tabel (Y: 31..50)
  tft.fillRect(0, 31, 480, 20, titleBg);
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(255, 205, 0), titleBg);
  tft.drawString("TABEL BATAS KERJA PARAMETER OPERASIONAL (CAT 950L)", 90, 37);

  // Header kolom tabel (Y: 51..71)
  for (int c = 0; c < 5; c++) {
    tft.fillRect(colX[c], 51, colW[c], 21, hdrBg[c]);
    tft.setTextColor(hdrFg[c], hdrBg[c]);
    tft.drawString(colTitles[c], colX[c] + 6, 58);
  }

  // 6 baris parameter (Y: 72..293, tinggi 37 px per baris)
  for (int r = 0; r < 6; r++) {
    const int y = 72 + (r * 37);
    drawTableCellLines(colX[0], y, colW[0], 37, cellBg[0], cellFg[0], rows[r].param, "");
    drawTableCellLines(colX[1], y, colW[1], 37, cellBg[1], cellFg[1], rows[r].idle1, rows[r].idle2);
    drawTableCellLines(colX[2], y, colW[2], 37, cellBg[2], cellFg[2], rows[r].norm1, rows[r].norm2);
    drawTableCellLines(colX[3], y, colW[3], 37, cellBg[3], cellFg[3], rows[r].warn1, rows[r].warn2);
    drawTableCellLines(colX[4], y, colW[4], 37, cellBg[4], cellFg[4], rows[r].crit1, rows[r].crit2);
    tft.drawFastHLine(0, y, 480, borderCol);
  }

  // Garis pemisah horizontal header & vertikal kolom
  tft.drawFastHLine(0, 51, 480, borderCol);
  tft.drawFastHLine(0, 72, 480, borderCol);
  tft.drawFastHLine(0, 294, 480, borderCol);
  for (int c = 1; c < 5; c++) {
    tft.drawFastVLine(colX[c], 51, 243, borderCol);
  }
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 5 (FAULT CODE MONITOR SAE J1939)
// ------------------------------------------------------------------------------
struct FaultDisplayMeta {
  const char *spnCode;
  const char *paramName;
  const char *safeLimit;
  const char *warnLine1;
  const char *warnLine2;
  const char *warnAction;
  const char *critLine1;
  const char *critLine2;
  const char *critAction;
};

static const FaultDisplayMeta FAULT_SPECS[6] = {
  {
    "SPN 190",
    "Engine Speed",
    "Batas Aman: < 2200 RPM",
    "Kondisi : Putaran mesin mendekati batas maksimal (2200-2399 RPM).",
    "Indikasi: Beban kerja berat atau bukaan throttle terlalu tinggi.",
    "Aksi    : Kurangi gas agar putaran mesin turun di bawah 2200 RPM.",
    "Kondisi : Putaran mesin melebihi batas / overspeed (>= 2400 RPM).",
    "Indikasi: Kehilangan kendali RPM atau risiko kerusakan mekanis.",
    "Aksi    : Turunkan RPM segera dan periksa sensor/kendali throttle!"
  },
  {
    "SPN 92",
    "Engine Load",
    "Batas Aman: < 95 %",
    "Kondisi : Beban mesin mendekati kapasitas penuh (95-99 %).",
    "Indikasi: Mesin bekerja ekstra berat saat mendorong atau menggali.",
    "Aksi    : Kurangi beban kerja hidrolik/bucket agar mesin stabil.",
    "Kondisi : Beban mesin melebihi batas maksimal (>= 100% / overload).",
    "Indikasi: Beban tidak valid atau gangguan komunikasi antar modul.",
    "Aksi    : Kurangi beban unit segera untuk mencegah stall & overheat!"
  },
  {
    "SPN 110",
    "Engine Temp",
    "Batas Aman: 71 - 104 C",
    "Kondisi : Suhu coolant tinggi mendekati batas (105-107 C).",
    "Indikasi: Pendinginan mulai kurang optimal akibat beban berat.",
    "Aksi    : Kurangi beban kerja dan pantau suhu serta kipas radiator.",
    "Kondisi : Suhu mesin terlalu tinggi / OVERHEAT (>= 108 C).",
    "Indikasi: Risiko kerusakan mesin akibat overheat atau sensor rusak.",
    "Aksi    : Hentikan kerja berat, idle mesin & cek radiator/coolant!"
  },
  {
    "SPN 102",
    "Boost Pressure",
    "Batas Aman: < 165 kPa",
    "Kondisi : Tekanan turbo (intake manifold) tinggi (165-199 kPa).",
    "Indikasi: Tekanan udara masuk mendekati batas atas turbocharger.",
    "Aksi    : Kurangi akselerasi mendadak & pantau tekanan boost.",
    "Kondisi : Tekanan turbo terlalu tinggi / OVERBOOST (>= 200 kPa).",
    "Indikasi: Tekanan intake berlebih (wastegate atau aktuator turbo).",
    "Aksi    : Turunkan RPM segera, cek wastegate & sensor MAP boost!"
  },
  {
    "SPN 84",
    "Speed",
    "Batas Aman: < 39 km/h",
    "Kondisi : Kecepatan unit mendekati batas maksimal (39-41 km/h).",
    "Indikasi: Laju alat berat terlalu cepat untuk kondisi operasi.",
    "Aksi    : Kurangi kecepatan kendaraan sesuai batas aman area kerja.",
    "Kondisi : Kecepatan unit melebihi batas aman (>= 42 km/h).",
    "Indikasi: Overspeed unit atau sinyal Vehicle Speed Sensor error.",
    "Aksi    : Lakukan pengereman bertahap, turun gigi & cek sensor VSS!"
  },
  {
    "SPN 168",
    "System Voltage",
    "Batas Aman: 23.0 - 28.5 V",
    "Kondisi : Tegangan sistem aki keluar batas aman (Warning).",
    "Indikasi: Pengisian alternator lemah atau tegangan mulai berlebih.",
    "Aksi    : Periksa alternator, kondisi baterai & beban kelistrikan.",
    "Kondisi : Tegangan sistem aki berada pada level bahaya (Critical).",
    "Indikasi: Aki drop parah (< 18.0 V) atau overvoltage (>= 32.0 V).",
    "Aksi    : Cek aki, terminal kabel & regulator sebelum ECU rusak!"
  }
};

uint8_t collectActiveFaults(uint8_t outParams[6], uint8_t outStates[6]) {
  const bool synced[6] = {sync_rpm, sync_load, sync_eng, sync_map, sync_speed, sync_volt};
  const uint8_t states[6] = {
    current_rpm_state, current_load_state, current_eng_state,
    current_map_state, current_speed_state, current_volt_state
  };

  uint8_t count = 0;
  // Prioritaskan Critical (state == 3) lebih dulu, lalu Warning (state == 2)
  for (uint8_t sev = 3; sev >= 2; sev--) {
    for (uint8_t p = 0; p < 6; p++) {
      if (synced[p] && states[p] == sev) {
        outParams[count] = p;
        outStates[count] = sev;
        count++;
      }
    }
  }
  return count;
}

void drawPage5_TopStaticFrames() {
  const uint16_t cardBg    = tft.color565(18, 24, 38);
  const uint16_t hdrBg     = tft.color565(30, 42, 65);
  const uint16_t borderCol = tft.color565(55, 70, 100);

  // Kiri Atas: FAULT CODE (X: 6..235, Y: 34..127)
  tft.fillRect(6, 34, 230, 94, cardBg);
  tft.drawRect(6, 34, 230, 94, borderCol);
  tft.fillRect(7, 35, 228, 18, hdrBg);
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(255, 205, 0), hdrBg);
  tft.drawString("FAULT CODE", 14, 40);

  // Kanan Atas: PARAMETER (X: 244..473, Y: 34..127)
  tft.fillRect(244, 34, 230, 94, cardBg);
  tft.drawRect(244, 34, 230, 94, borderCol);
  tft.fillRect(245, 35, 228, 18, hdrBg);
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(0, 210, 255), hdrBg);
  tft.drawString("PARAMETER", 252, 40);
}

void drawPage5_BottomFrame(bool showActiveStrip) {
  const uint16_t cardBg    = tft.color565(18, 24, 38);
  const uint16_t hdrBg     = tft.color565(30, 42, 65);
  const uint16_t borderCol = tft.color565(55, 70, 100);
  const int boxH = showActiveStrip ? 126 : 156;

  // Bersihkan area bawah dari Y: 133 s/d 293 agar bebas sisa piksel transisi mode
  tft.fillRect(0, 133, 480, 161, TFT_BLACK);

  tft.fillRect(6, 134, 468, boxH, cardBg);
  tft.drawRect(6, 134, 468, boxH, borderCol);
  tft.fillRect(7, 135, 466, 18, hdrBg);
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(255, 205, 0), hdrBg);
  tft.drawString("PENJELASAN FAULT CODE", 14, 140);
}

void drawPage5_Static() {
  drawPage5_TopStaticFrames();

  // Reset cache render Halaman 5 agar langsung ter-render penuh
  lastFaultRenderedMode = -1;
  lastFaultRenderedCount = 255;
  lastFaultRenderedSlot = 255;
  lastFaultRenderedId = -1;
  lastFaultRenderedSeverity = 255;
  lastFaultRenderedSubDir = 255;
  lastFaultRenderedSig = 0xFFFFFFFFUL;
  lastFaultRenderedValInt = -999999;

  updatePage5_Dynamic(true);
}

void drawPage5_ActiveStrip(const uint8_t activeParams[6], const uint8_t activeStates[6],
                           uint8_t activeCount, uint8_t selectedSlot) {
  tft.fillRect(6, 264, 468, 27, TFT_BLACK);
  const int chipW = 74;
  const int gap = 4;

  for (uint8_t i = 0; i < activeCount && i < 6; i++) {
    const int x = 6 + (i * (chipW + gap));
    const bool isCrit = (activeStates[i] == 3);
    const uint16_t fillCol = isCrit ? tft.color565(210, 32, 32) : tft.color565(250, 204, 21);
    const uint16_t txtCol  = isCrit ? TFT_WHITE : TFT_BLACK;

    tft.fillRoundRect(x, 265, chipW, 24, 3, fillCol);
    if (i == selectedSlot) {
      tft.drawRoundRect(x, 265, chipW, 24, 3, TFT_WHITE);
      tft.drawRoundRect(x + 1, 266, chipW - 2, 22, 2, tft.color565(255, 205, 0));
    }

    tft.setTextSize(1);
    tft.setTextColor(txtCol, fillCol);
    const char *spnTxt = FAULT_SPECS[activeParams[i]].spnCode;
    int textX = x + ((chipW - (int)strlen(spnTxt) * 6) / 2);
    tft.drawString(spnTxt, textX, 273);
  }
}

void formatFaultLiveValue(uint8_t paramId, char *outBuf, size_t bufLen, int32_t &outValKey) {
  switch (paramId) {
    case 0: {
      uint16_t v = (uint16_t)(smooth_rpm + 0.5f);
      snprintf(outBuf, bufLen, "%u RPM", v);
      outValKey = (int32_t)v;
      break;
    }
    case 1: {
      uint8_t v = (uint8_t)(smooth_load + 0.5f);
      snprintf(outBuf, bufLen, "%u %%", v);
      outValKey = (int32_t)v;
      break;
    }
    case 2: {
      uint8_t v = (uint8_t)(smooth_eng + 0.5f);
      snprintf(outBuf, bufLen, "%u C", v);
      outValKey = (int32_t)v;
      break;
    }
    case 3: {
      uint8_t v = (uint8_t)(smooth_map + 0.5f);
      snprintf(outBuf, bufLen, "%u kPa", v);
      outValKey = (int32_t)v;
      break;
    }
    case 4: {
      uint8_t v = (uint8_t)(smooth_speed + 0.5f);
      snprintf(outBuf, bufLen, "%u km/h", v);
      outValKey = (int32_t)v;
      break;
    }
    case 5:
    default: {
      float v = ((int)(smooth_volt * 10.0f + 0.5f)) / 10.0f;
      snprintf(outBuf, bufLen, "%.1f V", v);
      outValKey = (int32_t)(v * 10.0f + 0.5f);
      break;
    }
  }
}

void updatePage5_Dynamic(bool forceRedraw) {
  if (currentPage != PAGE_FAULTS) return;

  const uint16_t cardBg = tft.color565(18, 24, 38);
  const uint16_t hdrBg  = tft.color565(30, 42, 65);

  uint8_t activeParams[6] = {0};
  uint8_t activeStates[6] = {0};
  uint8_t activeCount = collectActiveFaults(activeParams, activeStates);

  if (activeCount > 0) {
    previewSpnIdx = -1; // Fault nyata langsung menggantikan mode preview
    if (selectedFaultSlot >= activeCount) {
      selectedFaultSlot = 0;
    }
  } else {
    selectedFaultSlot = 0;
  }

  // Mode: 0 = No Fault, 1 = Active Fault, 2 = Preview SPN
  int8_t mode = 0;
  int8_t focusParam = -1;
  uint8_t focusSeverity = 1;
  uint8_t subDir = 0; // Khusus Volt (1: Low, 2: High)
  int32_t valKey = 0;

  if (activeCount > 0) {
    mode = 1;
    focusParam = (int8_t)activeParams[selectedFaultSlot];
    focusSeverity = activeStates[selectedFaultSlot];
  } else if (previewSpnIdx >= 0 && previewSpnIdx < 6) {
    mode = 2;
    focusParam = previewSpnIdx;
    focusSeverity = 0; // Penanda preview
  }

  char liveValStr[20] = "";
  if (mode == 1) {
    formatFaultLiveValue((uint8_t)focusParam, liveValStr, sizeof(liveValStr), valKey);
    if (focusParam == 5) {
      float dv = ((int)(smooth_volt * 10.0f + 0.5f)) / 10.0f;
      subDir = (dv <= 22.9f) ? 1 : 2;
    }
  } else if (mode == 2) {
    formatFaultLiveValue((uint8_t)focusParam, liveValStr, sizeof(liveValStr), valKey);
  }

  uint32_t activeSig = 0;
  for (uint8_t i = 0; i < activeCount && i < 6; i++) {
    activeSig = (activeSig << 5) | ((uint32_t)(activeParams[i] & 0x07) << 2) | (uint32_t)(activeStates[i] & 0x03);
  }

  const bool modeTransition = forceRedraw ||
                              (mode != lastFaultRenderedMode) ||
                              ((mode == 1) != (lastFaultRenderedMode == 1));
  const bool faultIdentityChanged = modeTransition ||
                                    (focusParam != lastFaultRenderedId) ||
                                    (focusSeverity != lastFaultRenderedSeverity) ||
                                    (subDir != lastFaultRenderedSubDir) ||
                                    (activeCount != lastFaultRenderedCount) ||
                                    (selectedFaultSlot != lastFaultRenderedSlot);
  const bool stripChanged = (mode == 1) && (faultIdentityChanged || (activeSig != lastFaultRenderedSig));
  const bool valueChanged = (valKey != lastFaultRenderedValInt);

  if (!faultIdentityChanged && !stripChanged && !valueChanged) return;

  if (modeTransition) {
    drawPage5_BottomFrame(mode == 1);
  }

  // 1. Update Kiri Atas (FAULT CODE) & Badge Counter Header Kanan Atas
  if (faultIdentityChanged) {
    tft.fillRect(8, 54, 224, 72, cardBg);
    tft.fillRect(365, 36, 106, 15, hdrBg);

    if (mode == 0) {
      tft.setTextSize(3);
      tft.setTextColor(TFT_GREEN, cardBg);
      tft.drawString("NO FAULT", 18, 60);

      const uint16_t okBg = tft.color565(22, 163, 74);
      tft.fillRoundRect(16, 96, 208, 22, 4, okBg);
      tft.setTextSize(1);
      tft.setTextColor(TFT_WHITE, okBg);
      tft.drawString("[OK] SEMUA PARAMETER NORMAL", 34, 103);

      tft.setTextColor(TFT_GREEN, hdrBg);
      tft.drawString("0 FAULT AKTIF", 386, 40);
    } else if (mode == 1) {
      const bool isCrit = (focusSeverity == 3);
      const uint16_t codeCol = isCrit ? tft.color565(255, 85, 85) : tft.color565(253, 224, 71);
      const uint16_t pillBg  = isCrit ? tft.color565(210, 32, 32) : tft.color565(250, 204, 21);
      const uint16_t pillFg  = isCrit ? TFT_WHITE : TFT_BLACK;

      tft.setTextSize(3);
      tft.setTextColor(codeCol, cardBg);
      tft.drawString(FAULT_SPECS[focusParam].spnCode, 18, 60);

      tft.fillRoundRect(16, 96, 208, 22, 4, pillBg);
      tft.setTextSize(1);
      tft.setTextColor(pillFg, pillBg);
      tft.drawString(isCrit ? "[!] CRITICAL / BAHAYA" : "[!] WARNING / WASPADA", 52, 103);

      char cntBuf[20];
      snprintf(cntBuf, sizeof(cntBuf), "FAULT %u/%u", (unsigned)(selectedFaultSlot + 1), (unsigned)activeCount);
      tft.setTextColor(codeCol, hdrBg);
      tft.drawString(cntBuf, 405, 40);
    } else {
      const uint16_t prevCol = tft.color565(56, 189, 248);
      const uint16_t pillBg  = tft.color565(14, 116, 144);

      tft.setTextSize(3);
      tft.setTextColor(prevCol, cardBg);
      tft.drawString(FAULT_SPECS[focusParam].spnCode, 18, 60);

      tft.fillRoundRect(16, 96, 208, 22, 4, pillBg);
      tft.setTextSize(1);
      tft.setTextColor(TFT_WHITE, pillBg);
      tft.drawString("MODE PREVIEW REFERENSI", 45, 103);

      char prevBuf[20];
      snprintf(prevBuf, sizeof(prevBuf), "PREVIEW %d/6", (int)(focusParam + 1));
      tft.setTextColor(prevCol, hdrBg);
      tft.drawString(prevBuf, 398, 40);
    }
  }

  // 2. Update Kanan Atas (PARAMETER & LIVE VALUE)
  if (faultIdentityChanged || valueChanged) {
    tft.fillRect(246, 54, 224, 72, cardBg);

    if (mode == 0) {
      tft.setTextSize(2);
      tft.setTextColor(TFT_WHITE, cardBg);
      tft.drawString("All 6 Params", 254, 58);
      tft.setTextColor(TFT_GREEN, cardBg);
      tft.drawString("NORMAL", 254, 82);
      tft.setTextSize(1);
      tft.setTextColor(tft.color565(170, 185, 205), cardBg);
      tft.drawString("6 Parameter J1939 Terpantau", 254, 107);
    } else {
      const uint16_t valCol = (mode == 2)
                                ? tft.color565(56, 189, 248)
                                : ((focusSeverity == 3) ? tft.color565(255, 85, 85) : tft.color565(253, 224, 71));
      tft.setTextSize(2);
      tft.setTextColor(TFT_WHITE, cardBg);
      tft.drawString(FAULT_SPECS[focusParam].paramName, 254, 58);

      tft.setTextColor(valCol, cardBg);
      tft.drawString(liveValStr, 254, 82);

      tft.setTextSize(1);
      tft.setTextColor(tft.color565(170, 185, 205), cardBg);
      tft.drawString(FAULT_SPECS[focusParam].safeLimit, 254, 107);
    }
  }

  // 3. Update Bawah (PENJELASAN FAULT CODE & STRIP AKTIF JIKA ADA FAULT)
  if (faultIdentityChanged) {
    const int explainH = (mode == 1) ? 104 : 134;
    tft.fillRect(8, 154, 464, explainH, cardBg);
    tft.setTextSize(1);

    if (mode == 0) {
      tft.setTextColor(TFT_GREEN, cardBg);
      tft.drawString("Status  : Tidak ada Fault Code aktif saat ini.", 16, 166);
      tft.setTextColor(TFT_WHITE, cardBg);
      tft.drawString("Pantauan: Engine Speed (SPN 190), Engine Load (SPN 92),", 16, 188);
      tft.drawString("          Engine Temp (SPN 110), Boost Pressure (SPN 102),", 16, 204);
      tft.drawString("          Speed (SPN 84), dan System Voltage (SPN 168).", 16, 220);
      tft.setTextColor(tft.color565(255, 205, 0), cardBg);
      tft.drawString("Tips    : Tekan tombol OK untuk preview penjelasan 6 SPN.", 16, 248);
    } else {
      const FaultDisplayMeta &spec = FAULT_SPECS[focusParam];
      const bool isCrit = (mode == 1 && focusSeverity == 3);
      const char *line1 = isCrit ? spec.critLine1 : spec.warnLine1;
      const char *line2 = isCrit ? spec.critLine2 : spec.warnLine2;
      const char *act   = isCrit ? spec.critAction : spec.warnAction;

      if (focusParam == 5 && mode == 1) {
        if (subDir == 1) {
          line1 = isCrit
                    ? "Kondisi : Tegangan sistem terlalu rendah / LOW VOLT (< 18.0 V)."
                    : "Kondisi : Tegangan sistem rendah di bawah batas aman (<= 22.9 V).";
          line2 = "Indikasi: Daya aki lemah atau pengisian alternator tidak optimal.";
          act   = "Aksi    : Segera cek kondisi aki, terminal, dan alternator!";
        } else {
          line1 = isCrit
                    ? "Kondisi : Tegangan sistem terlalu tinggi / OVERVOLT (>= 32.0 V)."
                    : "Kondisi : Tegangan sistem melebihi batas atas (> 28.5 V).";
          line2 = "Indikasi: Gangguan pada voltage regulator / alternator overcharge.";
          act   = "Aksi    : Periksa regulator tegangan sebelum merusak sistem ECU!";
        }
      } else if (mode == 2) {
        // Preview SPN menampilkan penjelasan kondisi kritis sebagai referensi
        line1 = spec.critLine1;
        line2 = spec.critLine2;
        act   = spec.critAction;
      }

      tft.setTextColor(isCrit ? tft.color565(255, 110, 110) : tft.color565(253, 224, 71), cardBg);
      tft.drawString(line1, 16, 166);
      tft.setTextColor(TFT_WHITE, cardBg);
      tft.drawString(line2, 16, 190);
      tft.setTextColor(tft.color565(134, 239, 172), cardBg);
      tft.drawString(act, 16, 216);

      if (mode == 1) {
        if (activeCount > 1) {
          tft.setTextColor(tft.color565(255, 205, 0), cardBg);
          tft.drawString("Navigasi: Tekan OK untuk memilih fault code aktif di bawah.", 16, 240);
        } else {
          tft.setTextColor(tft.color565(160, 175, 195), cardBg);
          tft.drawString("Info    : 1 fault code sedang aktif pada parameter di atas.", 16, 240);
        }
      } else {
        tft.setTextColor(tft.color565(56, 189, 248), cardBg);
        tft.drawString("Preview : Tekan OK untuk melihat SPN berikutnya / keluar preview.", 16, 250);
      }
    }
  }

  if (stripChanged) {
    drawPage5_ActiveStrip(activeParams, activeStates, activeCount, selectedFaultSlot);
  }

  lastFaultRenderedMode = mode;
  lastFaultRenderedCount = activeCount;
  lastFaultRenderedSlot = selectedFaultSlot;
  lastFaultRenderedId = focusParam;
  lastFaultRenderedSeverity = focusSeverity;
  lastFaultRenderedSubDir = subDir;
  lastFaultRenderedSig = activeSig;
  lastFaultRenderedValInt = valKey;
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 1 (COVER BANNER TPPAB SV UGM - BACKGROUND PUTIH)
// ------------------------------------------------------------------------------
void drawPageCover_Static() {
  tft.fillScreen(TFT_WHITE);

  // Gambar komponen dari page1_assets.h (hasil konversi javl/image2cpp RGB565)
  tft.setSwapBytes(true);
  tft.pushImage(12, 14, IMG_TPPAB_LOGO_W, IMG_TPPAB_LOGO_H, img_tppab_logo);
  tft.pushImage(410, 10, IMG_SOLIDARITY_M_W, IMG_SOLIDARITY_M_H, img_solidarity_m);
  tft.pushImage(75, 88, IMG_CAT950L_LOADER_W, IMG_CAT950L_LOADER_H, img_cat950l_loader);
  tft.pushImage(108, 98, IMG_CAT_LOGO_W, IMG_CAT_LOGO_H, img_cat_logo);
  tft.setSwapBytes(false);

  // Judul utama warna biru di tengah atas
  tft.setFreeFont(&FreeSansBold18pt7b);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(11, 78, 162), TFT_WHITE);
  tft.drawString("TPPAB SV UGM", 256, 42);

  // Teks 950L tepat di bawah logo CAT
  tft.setFreeFont(&FreeSansBold9pt7b);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.drawString("950L", 132, 138);

  // Navigasi sudut bawah kiri & kanan (font hitam pada latar putih)
  tft.setFreeFont(&FreeSans9pt7b);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("<- Prev", 12, 296);
  tft.setTextDatum(TR_DATUM);
  tft.drawString("Next ->", 468, 296);

  // Kembalikan font & datum standar untuk halaman 3 - 7
  tft.setFreeFont(nullptr);
  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
}

// ------------------------------------------------------------------------------
// RENDER HALAMAN 2 (CREDIT TIM KELOMPOK - BACKGROUND HITAM, FONT PUTIH)
// ------------------------------------------------------------------------------
void drawPageTeam_Static() {
  tft.fillScreen(TFT_BLACK);

  tft.setFreeFont(&FreeSansBold18pt7b);
  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("Tim", 160, 30);
  tft.drawFastHLine(160, 68, 160, TFT_WHITE);

  const char *teamMembers[6] = {
    "1. Tataniku",
    "2. Devan",
    "3. Tri Rayhan",
    "4. Abel",
    "5. Pramudya",
    "6. Sandro"
  };

  tft.setFreeFont(&FreeSans12pt7b);
  for (int i = 0; i < 6; i++) {
    tft.drawString(teamMembers[i], 160, 82 + (i * 32));
  }

  // Navigasi sudut bawah kiri & kanan (font putih pada latar hitam)
  tft.setFreeFont(&FreeSans9pt7b);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("<- Prev", 12, 296);
  tft.setTextDatum(TR_DATUM);
  tft.drawString("Next ->", 468, 296);

  // Kembalikan font & datum standar untuk halaman 3 - 7
  tft.setFreeFont(nullptr);
  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
}

// ------------------------------------------------------------------------------
// FUNGSI PERGANTIAN HALAMAN (FULL-SCREEN HAL 1-2 & CLEAN BODY HAL 3-7)
// ------------------------------------------------------------------------------
void switchPage(uint8_t newPage) {
  if (newPage < 1) newPage = TOTAL_PAGES;
  if (newPage > TOTAL_PAGES) newPage = 1;
  currentPage = newPage;

  tft.setFreeFont(nullptr);
  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);

  if (currentPage == PAGE_COVER) {
    drawPageCover_Static();
    return;
  }
  if (currentPage == PAGE_TEAM) {
    drawPageTeam_Static();
    return;
  }

  // Halaman 3 - 7: bersihkan Body (Y: 31..294) lalu render Header, Body, dan Footer
  tft.fillRect(0, 31, 480, 264, TFT_BLACK);
  drawHeader();

  if (currentPage == PAGE_GAUGES) {
    drawPage1_Static();
  } else if (currentPage == PAGE_J1939) {
    drawPage2_Static();
  } else if (currentPage == PAGE_IOT) {
    drawPage3_Static();
  } else if (currentPage == PAGE_LIMITS) {
    drawPage4_Static();
  } else if (currentPage == PAGE_FAULTS) {
    drawPage5_Static();
  }

  drawFooter();
}

// ------------------------------------------------------------------------------
// ANIMASI INTRO CAT 950L (SMOOTH ARC SPINNER)
// ------------------------------------------------------------------------------
void introArc(int cx, int cy, int r, int ir, int a0, int span, uint16_t fg) {
  if (span <= 0) return;
  if (span >= 360) {
    tft.drawSmoothArc(cx, cy, r, ir, 0, 360, fg, TFT_BLACK, false);
    return;
  }
  int s = (((a0 + 180) % 360) + 360) % 360;
  int e = s + span;
  if (e <= 360) {
    tft.drawSmoothArc(cx, cy, r, ir, s, e, fg, TFT_BLACK, false);
  } else {
    tft.drawSmoothArc(cx, cy, r, ir, s, 360, fg, TFT_BLACK, false);
    if (e - 360 > 0) tft.drawSmoothArc(cx, cy, r, ir, 0, e - 360, fg, TFT_BLACK, false);
  }
}

float easeInOutCubic(float t) {
  return (t < 0.5f) ? 4.0f * t * t * t : 1.0f - powf(-2.0f * t + 2.0f, 3.0f) / 2.0f;
}

float easeOutCubic(float t) {
  return 1.0f - powf(1.0f - t, 3.0f);
}

void showLoadingIntroScreen() {
  const uint16_t catYellow = tft.color565(255, 205, 0);
  const uint16_t catGold   = tft.color565(225, 150, 0);
  const uint16_t catAmber  = tft.color565(160, 85, 0);
  const uint16_t catBronze = tft.color565(80, 40, 0);
  const uint16_t trackGrey = tft.color565(30, 35, 45);
  const uint16_t mutedText = tft.color565(130, 140, 155);
  const uint16_t readyGreen = tft.color565(0, 230, 118);

  const int cx = 240, cy = 182;
  const int R_OUT = 76, IR_OUT = 72;
  const int R_SPIN = 62, IR_SPIN = 55;
  const int TAIL = 110;

  twai_message_t dummy_rx;
  tft.fillScreen(TFT_BLACK);
  tft.setTextDatum(MC_DATUM);

  // FASE 1: Fade-in Judul
  const int FADE_FRAMES = 16;
  for (int i = 1; i <= FADE_FRAMES; i++) {
    while (twai_receive(&dummy_rx, 0) == ESP_OK) {}
    float v = easeOutCubic((float)i / FADE_FRAMES);

    uint16_t badgeCol = tft.color565((uint8_t)(255 * v), (uint8_t)(205 * v), 0);
    tft.fillRoundRect(202, 28, 76, 18, 4, badgeCol);
    tft.setTextSize(1);
    tft.setTextPadding(0);
    tft.setTextColor(TFT_BLACK, badgeCol);
    tft.drawString("CAT 950L", 240, 37);

    uint8_t g = (uint8_t)(255 * v);
    tft.setTextSize(3);
    tft.setTextColor(tft.color565(g, g, g), TFT_BLACK);
    tft.drawString("J1939 CLUSTER", 240, 72);

    int w = (int)(180 * v);
    tft.fillRect(240 - w / 2, 96, w, 2, catYellow);

    int sweep = (int)(360 * v);
    introArc(cx, cy, R_OUT, IR_OUT, 0, sweep, trackGrey);
    introArc(cx, cy, R_SPIN, IR_SPIN, 0, sweep, trackGrey);
    delay(16);
  }

  // FASE 2: Spinner Komet Berputar
  const uint32_t DURATION = 2400;
  const int SPIN_STEP = 10;
  uint32_t t0 = millis();
  int head = 0;
  int lastProg = 0;
  int lastPct = -1;
  int stage = -1;

  tft.setTextPadding(0);

  while (true) {
    uint32_t frameStart = millis();
    while (twai_receive(&dummy_rx, 0) == ESP_OK) {}

    uint32_t el = frameStart - t0;
    float t = (el >= DURATION) ? 1.0f : (float)el / DURATION;
    float p = easeInOutCubic(t);

    int prog = (int)(p * 360.0f);
    if (prog > lastProg) {
      introArc(cx, cy, R_OUT, IR_OUT, lastProg, prog - lastProg, catYellow);
      lastProg = prog;
    }

    int newHead = head + SPIN_STEP;
    introArc(cx, cy, R_SPIN, IR_SPIN, head - TAIL, SPIN_STEP, trackGrey);
    head = newHead;
    introArc(cx, cy, R_SPIN, IR_SPIN, head - TAIL,      42, catBronze);
    introArc(cx, cy, R_SPIN, IR_SPIN, head - TAIL + 40, 36, catAmber);
    introArc(cx, cy, R_SPIN, IR_SPIN, head - 36,        24, catGold);
    introArc(cx, cy, R_SPIN, IR_SPIN, head - 14,        14, catYellow);

    int pct = (int)(p * 100.0f + 0.5f);
    if (pct != lastPct) {
      tft.setTextSize(3);
      tft.setTextPadding(80);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.drawString(String(pct) + "%", cx, cy + 2);
      lastPct = pct;
    }

    int newStage = (p < 0.35f) ? 0 : (p < 0.75f) ? 1 : 2;
    if (newStage != stage) {
      stage = newStage;
      const char *msg = (stage == 0) ? "INIT J1939 BUS"
                      : (stage == 1) ? "CONNECTING ECU & IOT"
                                     : "LOADING CLUSTER";
      tft.setTextSize(1);
      tft.setTextPadding(220);
      tft.setTextColor(mutedText, TFT_BLACK);
      tft.drawString(msg, 240, 284);
    }

    if (t >= 1.0f) break;
    uint32_t spent = millis() - frameStart;
    if (spent < 16) delay(16 - spent);
  }

  // FASE 3: Selesai & Centang
  for (int a = 0; a < 360; a += 30) {
    introArc(cx, cy, R_OUT, IR_OUT, a, 30, readyGreen);
    introArc(cx, cy, R_SPIN, IR_SPIN, a, 30, readyGreen);
    delay(10);
  }

  tft.fillCircle(cx, cy, IR_SPIN - 3, TFT_BLACK);
  const float ax = cx - 18, ay = cy + 2;
  const float bx = cx - 5,  by = cy + 15;
  const float qx = cx + 20, qy = cy - 14;
  for (int i = 1; i <= 6; i++) {
    float k = (float)i / 6;
    tft.drawWideLine(ax, ay, ax + (bx - ax) * k, ay + (by - ay) * k, 6, readyGreen, TFT_BLACK);
    delay(12);
  }
  for (int i = 1; i <= 8; i++) {
    float k = (float)i / 8;
    tft.drawWideLine(bx, by, bx + (qx - bx) * k, by + (qy - by) * k, 6, readyGreen, TFT_BLACK);
    delay(12);
  }

  tft.setTextSize(1);
  tft.setTextPadding(220);
  tft.setTextColor(readyGreen, TFT_BLACK);
  tft.drawString("CLUSTER READY", 240, 284);

  // Beep pendek buzzer tanda siap
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  delay(60);
  pinMode(PIN_BUZZER, INPUT);
  delay(350);

  // FASE 4: Shutter Transition
  for (int i = 0; i < 16; i++) {
    tft.fillRect(0, i * 10, 480, 10, TFT_BLACK);
    tft.fillRect(0, 310 - i * 10, 480, 10, TFT_BLACK);
    delay(10);
  }

  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
}

// ------------------------------------------------------------------------------
// FUNGSI PEMBACAAN 3 TOMBOL FISIK (EDGE-TRIGGERED INSTANT DETECTION)
// ------------------------------------------------------------------------------
void handleNavigationButtons() {
  unsigned long now = millis();

  // 1. Tombol PREV (GPIO 14, Bit 0)
  int readingPrev = digitalRead(PIN_BTN_PREV);
  if (readingPrev == LOW && lastPrevState == HIGH) {
    if (now - lastDebounceTimePrev >= DEBOUNCE_COOLDOWN_MS) {
      lastDebounceTimePrev = now;
      uint8_t oldPage = currentPage;
      uint8_t nextP = (currentPage == 1) ? TOTAL_PAGES : (currentPage - 1);
      Serial.printf("[BUTTON] <<< PREV (GPIO 14 / Bit 0) DITEKAN! Pindah: Hal %d -> Hal %d\n", oldPage, nextP);
      switchPage(nextP);
    }
  }
  lastPrevState = readingPrev;

  // 2. Tombol OK / ACTION (GPIO 32, Bit 1)
  int readingOk = digitalRead(PIN_BTN_OK);
  if (readingOk == LOW && lastOkState == HIGH) {
    if (now - lastDebounceTimeOk >= DEBOUNCE_COOLDOWN_MS) {
      lastDebounceTimeOk = now;
      Serial.printf("[BUTTON] [●] OK (GPIO 32 / Bit 1) DITEKAN di Halaman %d!\n", currentPage);

      if (currentPage == PAGE_GAUGES) {
        // Toggle Mute Buzzer
        buzzerMuted = !buzzerMuted;
        Serial.printf("         >> AKSI HAL %d: Status Buzzer diubah menjadi -> %s\n",
                      currentPage, buzzerMuted ? "MUTED (Hening)" : "AKTIF (Normal)");
        drawFooter();
      } else if (currentPage == PAGE_J1939) {
        // Reset Total RX Frames Counter
        totalCanFrames = 0;
        totalCanErrors = 0;
        Serial.println("         >> AKSI HAL 4: Counter Total Frame J1939 berhasil di-reset ke 0!");
        updatePage2_Dynamic();
      } else if (currentPage == PAGE_IOT) {
        // Force Refresh Status IoT ke Node 3 via J1939 Request PGN 0xFF00
        Serial.println("         >> AKSI HAL 5: Refresh status Node 3 / IoT Cloud (Request PGN 0xFF00) dipicu!");
        requestJ1939PGN(PGN_GW_STAT);
        lastRequestTime = now;
        updatePage3_Dynamic();
      } else if (currentPage == PAGE_FAULTS) {
        uint8_t activeParams[6] = {0};
        uint8_t activeStates[6] = {0};
        uint8_t activeCount = collectActiveFaults(activeParams, activeStates);
        if (activeCount >= 2) {
          selectedFaultSlot = (selectedFaultSlot + 1) % activeCount;
          Serial.printf("         >> AKSI HAL 7: Ganti fokus fault ke slot %u/%u (%s)\n",
                        (unsigned)(selectedFaultSlot + 1), (unsigned)activeCount,
                        FAULT_SPECS[activeParams[selectedFaultSlot]].spnCode);
          updatePage5_Dynamic(false);
        } else if (activeCount == 0) {
          previewSpnIdx = (previewSpnIdx < 5) ? (previewSpnIdx + 1) : -1;
          Serial.printf("         >> AKSI HAL 7: Mode preview SPN -> %d\n", (int)previewSpnIdx);
          updatePage5_Dynamic(false);
        }
      }
    }
  }
  lastOkState = readingOk;

  // 3. Tombol NEXT (GPIO 27, Bit 2)
  int readingNext = digitalRead(PIN_BTN_NEXT);
  if (readingNext == LOW && lastNextState == HIGH) {
    if (now - lastDebounceTimeNext >= DEBOUNCE_COOLDOWN_MS) {
      lastDebounceTimeNext = now;
      uint8_t oldPage = currentPage;
      uint8_t nextP = (currentPage % TOTAL_PAGES) + 1;
      Serial.printf("[BUTTON] >>> NEXT (GPIO 27 / Bit 2) DITEKAN! Pindah: Hal %d -> Hal %d\n", oldPage, nextP);
      switchPage(nextP);
    }
  }
  lastNextState = readingNext;
}

// ------------------------------------------------------------------------------
// SETUP UTAMA
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200); // Baud rate 115200 untuk pemantauan Serial Monitor responsif
  Serial2.begin(115200, SERIAL_8N1, UART2_RX, UART2_TX); // Link ke Node 3

  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZER, INPUT); // Default Hi-Z

  // Konfigurasi 3 Tombol Navigasi dengan Internal Pull-Up
  pinMode(PIN_BTN_PREV, INPUT_PULLUP);
  pinMode(PIN_BTN_OK,   INPUT_PULLUP);
  pinMode(PIN_BTN_NEXT, INPUT_PULLUP);

  // Inisialisasi payload CAN mentah dengan nilai default 0xFF
  for (int i = 0; i < 6; i++) {
    memset(rawCanPayload[i], 0xFF, 8);
  }

  // Matikan Wi-Fi secara default untuk kestabilan suplai arus TFT & CAN
  WiFi.mode(WIFI_OFF);

  // Inisialisasi Driver TWAI CAN
  initTWAI();

  // Inisialisasi Layar TFT & Animasi Intro
  tft.init();
  tft.setRotation(1); // Orientasi Landscape (480 x 320)
  showLoadingIntroScreen();

  // Tampilkan Halaman 1 (Cover TPPAB SV UGM) setelah booting
  switchPage(PAGE_COVER);

  // Reset driver TWAI setelah intro agar sinkron instan dengan Node 1
  resetTWAI();
  lastCanRxTime = millis();
  lastRateCalcTime = millis();

  Serial.println("\n=======================================================");
  Serial.println("  ESP32 NODE 2: DISPLAY HUB & INSTRUMENT CLUSTER");
  Serial.println("  STANDAR PROTOKOL: SAE J1939 (250/500 kbps, EXT-ID)");
  Serial.println("=======================================================");
  Serial.println("[SETUP] Tombol Navigasi Terkonfigurasi (7 Halaman):");
  Serial.println("        - Bit 0 -> GPIO 14 (PREV Page: 7 <- 6 <- 5 <- 4 <- 3 <- 2 <- 1 <- 7)");
  Serial.println("        - Bit 1 -> GPIO 32 (OK / ACTION: Mute / Reset / Refresh / Fault)");
  Serial.println("        - Bit 2 -> GPIO 27 (NEXT Page: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 1)");
  Serial.println("[SETUP] Status Layar: Halaman 1 Aktif (Cover TPPAB SV UGM).");
  Serial.println("=======================================================\n");
}

// ------------------------------------------------------------------------------
// LOOP UTAMA (RESPONSIF & NON-BLOCKING)
// ------------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // 1. BACA & PROSES 3 TOMBOL FISIK DENGAN EDGE-TRIGGER CEPAT
  handleNavigationButtons();

  // 2. PEWAKTU KEDIP ALARM (INTERVAL 300 MS)
  bool blinkChanged = false;
  if (now - blinkTimer >= 300) {
    blinkTimer = now;
    blinkState = !blinkState;
    blinkChanged = true;
  }

  // 3. PERHITUNGAN RATE RX J1939 (Hz) SETIAP 1 DETIK
  if (now - lastRateCalcTime >= 1000) {
    canRxRateHz = frameCounterSec;
    frameCounterSec = 0;
    lastRateCalcTime = now;
  }

  // 4. KIRIM REQUEST PGN SAE J1939 KE NODE 1 SECARA ROUND-ROBIN TIAP 25 MS
  if (now - lastRequestTime >= 25) {
    requestJ1939PGN(J1939_PGN_LIST[pgnReqIndex]);
    pgnReqIndex = (pgnReqIndex + 1) % 6;
    lastRequestTime = now;
  }

  // 5. TERIMA & DECODE FRAME SAE J1939 DARI BUS CAN
  twai_message_t rx_msg;
  while (twai_receive(&rx_msg, 0) == ESP_OK) {
    if (!rx_msg.extd) continue;

    // Ekstrak 18-bit PGN dari 29-bit Extended Identifier SAE J1939
    // Format: [Priority 3b][DP 1b][PF 8b][PS 8b][SA 8b]
    uint32_t pgn = (rx_msg.identifier >> 8) & 0x3FFFF;
    uint8_t pf = (rx_msg.identifier >> 16) & 0xFF;
    if (pf < 240) {
      pgn = pgn & 0x3FF00; // PDU1: PS adalah Destination Address
    }

    bool isEcuFrame = false;

    switch (pgn) {
      case PGN_EEC1: { // 61444 - Engine Speed (SPN 190, Resolusi 0.125 rpm/bit)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[0], rx_msg.data, 8);
        rawCanCanId[0] = rx_msg.identifier;
        uint16_t raw_rpm = (uint16_t)rx_msg.data[3] | ((uint16_t)rx_msg.data[4] << 8);
        target_rpm = raw_rpm / 8;
        if (!sync_rpm) { smooth_rpm = target_rpm; sync_rpm = true; }
        break;
      }
      case PGN_EEC2: { // 61443 - Engine Load (SPN 92, Resolusi 1 %/bit)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[1], rx_msg.data, 8);
        rawCanCanId[1] = rx_msg.identifier;
        target_load = rx_msg.data[2];
        if (!sync_load) { smooth_load = target_load; sync_load = true; }
        break;
      }
      case PGN_ET1: { // 65262 - Coolant Temp (SPN 110, Resolusi 1 C/bit, offset -40 C)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[2], rx_msg.data, 8);
        rawCanCanId[2] = rx_msg.identifier;
        target_eng = (rx_msg.data[0] >= 40) ? (rx_msg.data[0] - 40) : 0;
        if (!sync_eng) { smooth_eng = target_eng; sync_eng = true; }
        break;
      }
      case PGN_IC1: { // 65270 - Boost / MAP (SPN 102, Resolusi 2 kPa/bit)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[3], rx_msg.data, 8);
        rawCanCanId[3] = rx_msg.identifier;
        target_map = (uint16_t)rx_msg.data[1] * 2;
        if (!sync_map) { smooth_map = target_map; sync_map = true; }
        break;
      }
      case PGN_CCVS: { // 65265 - Ground Speed (SPN 84, Resolusi 1/256 km/h)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[4], rx_msg.data, 8);
        rawCanCanId[4] = rx_msg.identifier;
        uint16_t raw_speed = (uint16_t)rx_msg.data[1] | ((uint16_t)rx_msg.data[2] << 8);
        target_speed = raw_speed / 256;
        if (!sync_speed) { smooth_speed = target_speed; sync_speed = true; }
        break;
      }
      case PGN_VEP1: { // 65271 - Battery Voltage (SPN 168, Resolusi 0.05 V/bit)
        if (rx_msg.data_length_code < 8) break;
        isEcuFrame = true;
        memcpy(rawCanPayload[5], rx_msg.data, 8);
        rawCanCanId[5] = rx_msg.identifier;
        uint16_t raw_volt = (uint16_t)rx_msg.data[4] | ((uint16_t)rx_msg.data[5] << 8);
        target_volt = raw_volt * 0.05f;
        if (!sync_volt) { smooth_volt = target_volt; sync_volt = true; }
        break;
      }
      case PGN_GW_STAT: { // 65280 - Gateway Status Broadcast dari Node 3
        if (rx_msg.data_length_code < 7) break;
        node3_online = true;
        node3_wifi_connected = (rx_msg.data[0] == 1);
        node3_mqtt_connected = (rx_msg.data[1] == 1);
        node3_rssi = (int)rx_msg.data[2] - 100;
        uint32_t lowTx = (uint32_t)rx_msg.data[3] | ((uint32_t)rx_msg.data[4] << 8);
        if (rx_msg.data_length_code >= 8) {
          lowTx |= ((uint32_t)rx_msg.data[7] << 16);
          node3_tx_count = (node3_tx_count & 0xFF000000UL) | lowTx;
        } else {
          node3_tx_count = lowTx;
        }
        if (!node3_wifi_connected) {
          snprintf(node3_ip, sizeof(node3_ip), "Disconnected");
          node3_has_full_ip = false;
        } else if (!node3_has_full_ip && (rx_msg.data[5] != 0 || rx_msg.data[6] != 0)) {
          snprintf(node3_ip, sizeof(node3_ip), "192.168.%d.%d", rx_msg.data[5], rx_msg.data[6]);
        }
        lastNode3RxTime = now;
        break;
      }
      case PGN_GW_NET: { // 65281 - Gateway Full IPv4 & 32-bit TX Count dari Node 3
        if (rx_msg.data_length_code < 8) break;
        node3_online = true;
        if (rx_msg.data[0] != 0 || rx_msg.data[1] != 0 ||
            rx_msg.data[2] != 0 || rx_msg.data[3] != 0) {
          snprintf(node3_ip, sizeof(node3_ip), "%u.%u.%u.%u",
                   rx_msg.data[0], rx_msg.data[1], rx_msg.data[2], rx_msg.data[3]);
          node3_has_full_ip = true;
        } else {
          snprintf(node3_ip, sizeof(node3_ip), "Disconnected");
          node3_has_full_ip = false;
        }
        node3_tx_count = (uint32_t)rx_msg.data[4] |
                         ((uint32_t)rx_msg.data[5] << 8) |
                         ((uint32_t)rx_msg.data[6] << 16) |
                         ((uint32_t)rx_msg.data[7] << 24);
        lastNode3RxTime = now;
        break;
      }
      case PGN_GW_SSID: { // 65282 - Gateway Wi-Fi SSID (Chunked) dari Node 3
        if (rx_msg.data_length_code < 8) break;
        node3_online = true;
        lastNode3RxTime = now;
        uint8_t totalChunks = (rx_msg.data[0] >> 4) & 0x0F;
        uint8_t chunkIdx = rx_msg.data[0] & 0x0F;
        if (totalChunks >= 1 && totalChunks <= 4 && chunkIdx < totalChunks) {
          if (chunkIdx == 0) {
            memset(node3_ssid_rx_buf, 0, sizeof(node3_ssid_rx_buf));
            node3_ssid_chunk_mask = 0;
          }
          for (uint8_t j = 0; j < 7; j++) {
            node3_ssid_rx_buf[(size_t)chunkIdx * 7 + j] = (char)rx_msg.data[1 + j];
          }
          node3_ssid_chunk_mask |= (uint8_t)(1U << chunkIdx);
          uint8_t expectedMask = (uint8_t)((1U << totalChunks) - 1U);
          if ((node3_ssid_chunk_mask & expectedMask) == expectedMask) {
            node3_ssid_rx_buf[28] = '\0';
            if (node3_ssid_rx_buf[0] != '\0') {
              strncpy(node3_ssid, node3_ssid_rx_buf, sizeof(node3_ssid) - 1);
              node3_ssid[sizeof(node3_ssid) - 1] = '\0';
            }
          }
        }
        break;
      }
    }

    if (isEcuFrame) {
      lastCanRxTime = now;
      hasReceivedCanData = true;
      totalCanFrames++;
      frameCounterSec++;
    }
  }

  // 6. BACA STATUS SERIAL2 DARI NODE 3 (JIKA TERSEDIA SEBAGAI BACKUP)
  while (Serial2.available()) {
    char c = Serial2.read();
    if (c == '\n' || c == '\r') {
      node3SerialBuffer.trim();
      if (node3SerialBuffer.startsWith("{") && node3SerialBuffer.endsWith("}")) {
        node3_online = true;
        lastNode3RxTime = now;
        if (node3SerialBuffer.indexOf("\"wifi\":true") >= 0) node3_wifi_connected = true;
        else if (node3SerialBuffer.indexOf("\"wifi\":false") >= 0) node3_wifi_connected = false;
        if (node3SerialBuffer.indexOf("\"mqtt\":true") >= 0) node3_mqtt_connected = true;
        else if (node3SerialBuffer.indexOf("\"mqtt\":false") >= 0) node3_mqtt_connected = false;
        int rssiIdx = node3SerialBuffer.indexOf("\"rssi\":");
        if (rssiIdx >= 0) {
          node3_rssi = node3SerialBuffer.substring(rssiIdx + 7).toInt();
        }
      }
      node3SerialBuffer = "";
    } else {
      if (node3SerialBuffer.length() < 120) node3SerialBuffer += c;
    }
  }

  // 7. UPDATE STATE TELEMETRI KONTINU & RE-RENDER TAMPILAN DINAMIS SESUAI HALAMAN AKTIF
  if (now - lastSmoothStep >= 18) {
    lastSmoothStep = now;
    updateTelemetryStates();
    if (currentPage == PAGE_GAUGES) {
      updateSmoothDisplay();
      drawAlertIcon(0, current_rpm_state, blinkChanged);
      drawAlertIcon(1, current_load_state, blinkChanged);
      drawAlertIcon(2, current_eng_state, blinkChanged);
      drawAlertIcon(3, current_map_state, blinkChanged);
      drawAlertIcon(4, current_speed_state, blinkChanged);
      drawAlertIcon(5, current_volt_state, blinkChanged);
    }
  } else if (blinkChanged && currentPage == PAGE_GAUGES) {
    drawAlertIcon(0, current_rpm_state, true);
    drawAlertIcon(1, current_load_state, true);
    drawAlertIcon(2, current_eng_state, true);
    drawAlertIcon(3, current_map_state, true);
    drawAlertIcon(4, current_speed_state, true);
    drawAlertIcon(5, current_volt_state, true);
  }

  if (currentPage == PAGE_J1939) {
    if (now - lastPageRenderStep >= 80) { // Refresh tabel tiap 80 ms
      lastPageRenderStep = now;
      updatePage2_Dynamic();
    }
  } else if (currentPage == PAGE_IOT) {
    if (now - lastPageRenderStep >= 250) { // Refresh info IoT tiap 250 ms
      lastPageRenderStep = now;
      updatePage3_Dynamic();
    }
  } else if (currentPage == PAGE_FAULTS) {
    if (now - lastPageRenderStep >= 100) { // Refresh fault monitor tiap 100 ms (berbasis perubahan)
      lastPageRenderStep = now;
      updatePage5_Dynamic(false);
    }
  }

  // Update Status Virtual LED Header
  updateHeaderStatus();

  // 8. KONTROL BUZZER ACTIVE-LOW DENGAN FITUR MUTE
  bool alarm_red = (current_rpm_state == 3 || current_load_state == 3 ||
                    current_eng_state == 3 || current_map_state == 3 ||
                    current_speed_state == 3 || current_volt_state == 3);
  bool warning_orange = (!alarm_red) && (current_rpm_state == 2 || current_load_state == 2 ||
                                         current_eng_state == 2 || current_map_state == 2 ||
                                         current_speed_state == 2 || current_volt_state == 2);

  if (buzzerMuted) {
    // Mode Senyap: Paksa Hi-Z agar tidak berbunyi
    pinMode(PIN_BUZZER, INPUT);
  } else {
    if (alarm_red) {
      pinMode(PIN_BUZZER, OUTPUT);
      digitalWrite(PIN_BUZZER, LOW); // Bunyi solid terus menerus
    } else if (warning_orange) {
      if (blinkState) {
        pinMode(PIN_BUZZER, OUTPUT);
        digitalWrite(PIN_BUZZER, LOW); // Beep putus-putus
      } else {
        pinMode(PIN_BUZZER, INPUT);
      }
    } else {
      pinMode(PIN_BUZZER, INPUT);
    }
  }

  // 9. FORWARD TELEMETRI JSON KE NODE 3 VIA UART2 SETIAP 200 MS
  if (hasReceivedCanData && (now - lastForwardTime >= 200)) {
    lastForwardTime = now;
    uint8_t globalState = 1;
    if (alarm_red) globalState = 3;
    else if (warning_orange) globalState = 2;
    else if (current_eng_state == 0) globalState = 0;

    Serial2.printf("{\"rpm\":%d,\"load\":%d,\"temp\":%d,\"map\":%d,\"spd\":%d,\"volt\":%.1f,\"st\":%d}\n",
                   target_rpm, target_load, target_eng, target_map,
                   target_speed, target_volt, globalState);
  }

  // 10. WATCHDOG TWAI CAN OTOMATIS:
  //     Jika tidak ada balasan CAN selama > 500 ms atau bus error, reset otomatis!
  if (now - lastWatchdogCheck >= 250) {
    lastWatchdogCheck = now;
    twai_status_info_t status;
    if (twai_get_status_info(&status) == ESP_OK) {
      bool busError = (status.state != TWAI_STATE_RUNNING) ||
                      (status.tx_error_counter > 64) ||
                      (status.rx_error_counter > 64);
      bool rxTimeout = hasReceivedCanData && (now - lastCanRxTime > 500);

      if (busError || rxTimeout) {
        totalCanErrors++;
        resetTWAI();
        lastCanRxTime = now;
      }
    }
  }

  // 11. WI-FI OTA AKTIVASI DENGAN TOMBOL BOOT (GPIO 0)
  if (digitalRead(PIN_BOOT_BTN) == LOW && !wifiOtaEnabled) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifi_ssid, wifi_password);
    wifiOtaEnabled = true;
    wifiConnectStart = now;
    Serial.println("[WIFI] Tombol BOOT ditekan: Mengaktifkan Wi-Fi OTA...");
  }

  if (wifiOtaEnabled) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!otaInitialized) {
        ArduinoOTA.setHostname(ota_hostname);
        ArduinoOTA.onStart([]() { pinMode(PIN_BUZZER, INPUT); });
        ArduinoOTA.begin();
        otaServer.begin();
        otaInitialized = true;
        Serial.printf("[WIFI] OTA Siap di IP: %s\n", WiFi.localIP().toString().c_str());
      }
      ArduinoOTA.handle();
      otaServer.handleClient();
    } else if (now - wifiConnectStart > 30000) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      wifiOtaEnabled = false;
      otaInitialized = false;
      Serial.println("[WIFI] Timeout OTA -> Wi-Fi dimatikan kembali.");
    }
  }
}
