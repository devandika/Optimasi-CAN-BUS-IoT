/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node CAN-Bus ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 2 - Display Hub, Cluster Controller & UART Forwarder
 * STANDAR: Hybrid OBD-II (0x7DF/0x7E8) & SAE J1939 (500 kbps) - Single-Core Smooth
 * HARDWARE: ESP32 DevKit V1 + Transceiver SN65HVD230 + TFT 3.5" ILI9488 + Buzzer
 * ==============================================================================
 */

#include "driver/twai.h"
#include <SPI.h>
#include <TFT_eSPI.h>
#include <math.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <FS.h>
using namespace fs;
#include <WebServer.h>
#include <Update.h>

// ------------------------------------------------------------------------------
// KONFIGURASI SISTEM WIFI OTA (OVER-THE-AIR)
// ------------------------------------------------------------------------------
const char *wifi_ssid     = "CAT950L_HOTSPOT";       // Ganti dengan SSID Wi-Fi / Hotspot Anda
const char *wifi_password = "caterpillar950l";       // Ganti dengan Password Wi-Fi Anda
const char *ota_hostname  = "CAT950L-Node2-Display"; // Hostname unik mDNS Node 2

WebServer otaServer(80);
bool otaInitialized = false;
bool wifiOtaEnabled = false;
unsigned long wifiConnectStart = 0;

#define PIN_BOOT_BTN 0  // Tekan tombol BOOT onboard jika ingin menyalakan Wi-Fi OTA

TFT_eSPI tft = TFT_eSPI();

// ------------------------------------------------------------------------------
// KONFIGURASI PIN PERIFERAL (SAMA PERSIS DENGAN ProgramFinalNode2Revision)
// ------------------------------------------------------------------------------
#define TX_PIN      21  // TWAI CAN TX (ke SN65HVD230 CTX)
#define RX_PIN      22  // TWAI CAN RX (ke SN65HVD230 CRX)
#define PIN_BUZZER  13  // Active Buzzer 5V (Logika Active-LOW Hi-Z)

#define UART2_TX    17  // Kirim data JSON ke ESP 3 (RX2 pin 16 pada ESP 3)
#define UART2_RX    16  // Terima data dari ESP 3 (opsional)

// ------------------------------------------------------------------------------
// DEFINISI PARAMETER GROUP NUMBER (PGN) SAE J1939
// ------------------------------------------------------------------------------
#define PGN_EEC1 61444  // 0xF004 - Engine RPM
#define PGN_EEC2 61443  // 0xF003 - Engine Load
#define PGN_ET1  65262  // 0xFEEE - Coolant Temp
#define PGN_IC1  65270  // 0xFEF6 - MAP Boost
#define PGN_CCVS 65265  // 0xFEF1 - Vehicle Speed
#define PGN_VEP1 65271  // 0xFEF7 - System Voltage

// ==========================================
// STRUKTUR GEOMETRI LAYAR & VARIABEL SMOOTHING
// ==========================================
const int Y_LINE[7] = {30, 74, 118, 162, 206, 250, 294};
const int Y_ROW[6]  = {40, 84, 128, 172, 216, 260};
const int VLINE_1 = 100, VLINE_2 = 240, VLINE_3 = 435;

// Nilai terakhir yang sudah digambar di TFT
uint16_t last_rpm = 65535;
uint8_t  last_load = 255, last_eng = 255, last_map = 255, last_speed = 255;
float    last_volt = 255.0f;

// Cache jumlah segmen bar terakhir agar tidak digambar berulang jika segmen sama
int last_seg_count[6] = {-1, -1, -1, -1, -1, -1};
uint8_t last_icon_state[6] = {255, 255, 255, 255, 255, 255};

// Target nilai dari CAN-Bus & Nilai Interpolasi Halus (Smooth Lerp)
uint16_t target_rpm = 0;   float smooth_rpm = 0.0f;   bool sync_rpm = false;
uint8_t  target_load = 0;  float smooth_load = 0.0f;  bool sync_load = false;
uint8_t  target_eng = 0;   float smooth_eng = 0.0f;   bool sync_eng = false;
uint8_t  target_map = 0;   float smooth_map = 0.0f;   bool sync_map = false;
uint8_t  target_speed = 0; float smooth_speed = 0.0f; bool sync_speed = false;
float    target_volt = 0;  float smooth_volt = 0.0f;  bool sync_volt = false;

bool hasReceivedCanData = false;
unsigned long lastCanRxTime = 0;
unsigned long lastSmoothStep = 0;
unsigned long lastWatchdogCheck = 0;

uint8_t current_rpm_state = 1, current_load_state = 1, current_eng_state = 0;
uint8_t current_map_state = 1, current_speed_state = 1, current_volt_state = 1;

unsigned long blinkTimer = 0; bool blinkState = false;
unsigned long lastRequestTime = 0; uint8_t pidIndex = 0;
unsigned long lastForwardTime = 0;

const uint8_t pids[] = {0x0C, 0x04, 0x05, 0x0B, 0x0D, 0x42};

uint8_t raw_rpm_A = 0, raw_rpm_B = 0;
uint8_t raw_load = 0, raw_eng = 40, raw_map = 0, raw_speed = 0;
uint8_t raw_volt_A = 0, raw_volt_B = 0;

String serialBuffer = "";
String lastCmdToDraw = "";
bool needToDrawCmd = false;
bool elm_space = true, elm_header = false;

// ------------------------------------------------------------------------------
// FUNGSI INSTALASI & HARD-RESET DRIVER TWAI CAN
// Menjamin pemulihan 100% otomatis walaupun Node 1 dicolok duluan atau kabel goyang
// ------------------------------------------------------------------------------
void initTWAI() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)TX_PIN, (gpio_num_t)RX_PIN, TWAI_MODE_NORMAL);
  g_config.tx_queue_len = 5;
  g_config.rx_queue_len = 20;
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

// ==========================================
// LOGIKA STATUS (SAMA PERSIS ProgramFinalNode2Revision)
// ==========================================
uint8_t getNormalState(int val, int warn_val, int alarm_val) {
  if (val >= alarm_val) return 3;
  if (val >= warn_val) return 2;
  return 1;
}

uint8_t getTempState(int val, int cold_val, int warn_val, int alarm_val) {
  if (val >= alarm_val) return 3;
  if (val >= warn_val) return 2;
  if (val < cold_val) return 0;
  return 1;
}

uint8_t getVoltState(float val) {
  if (val < 18.0f || val >= 32.0f) return 3;
  if (val <= 22.9f || val > 28.5f) return 2;
  return 1;
}

uint16_t stateToColor(uint8_t state) {
  if (state == 0) return tft.color565(0, 191, 255);
  if (state == 1) return TFT_GREEN;
  if (state == 2) return TFT_ORANGE;
  if (state == 3) return TFT_RED;
  return TFT_WHITE;
}

// ==========================================
// FUNGSI VISUAL BAR DIFERENSIAL (BEBAS KEDIP & CEPAT)
// ==========================================
void drawDynamicStairBar(int row_idx, int x, int y, int val, int max_val, int warn_val, int alarm_val, int cold_val = -1) {
  int max_segments = 20;
  int filled_segments = map(val, 0, max_val, 0, max_segments);
  if (filled_segments > max_segments) filled_segments = max_segments;
  if (filled_segments < 0) filled_segments = 0;

  // Hanya gambar ke SPI jika jumlah balok aktif berubah (menghemat waktu SPI 95%)
  if (filled_segments == last_seg_count[row_idx]) return;
  last_seg_count[row_idx] = filled_segments;

  for (int i = 0; i < max_segments; i++) {
    int seg_height = 6 + (i * 1);
    int y_offset = y + (25 - seg_height);
    int seg_val = (i + 1) * max_val / max_segments;
    uint16_t seg_color = TFT_GREEN;

    if (seg_val >= alarm_val) seg_color = TFT_RED;
    else if (seg_val >= warn_val) seg_color = TFT_ORANGE;
    else if (cold_val != -1 && seg_val < cold_val) seg_color = tft.color565(0, 191, 255);

    if (i < filled_segments) tft.fillRect(x + (i * 9), y_offset, 7, seg_height, seg_color);
    else tft.fillRect(x + (i * 9), y_offset, 7, seg_height, TFT_DARKGREY);
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

    if (seg_val < 18.0f || seg_val >= 32.0f) seg_color = TFT_RED;
    else if (seg_val <= 22.9f || seg_val > 28.5f) seg_color = TFT_ORANGE;
    else seg_color = TFT_GREEN;

    if (i < filled_segments) tft.fillRect(x + (i * 9), y_offset, 7, seg_height, seg_color);
    else tft.fillRect(x + (i * 9), y_offset, 7, seg_height, TFT_DARKGREY);
  }
}

void drawAlertIcon(int row_idx, uint8_t state, bool blinkChanged) {
  if (state == last_icon_state[row_idx] && !(state == 3 && blinkChanged)) return;
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

// ==========================================
// RENDER ANGKA ZERO-FLICKER (TANPA fillRect HITAM!)
// ==========================================
void renderRowNumberInt(int row_idx, int val, uint8_t state) {
  char buf[8];
  snprintf(buf, sizeof(buf), "%-4d", val); // 4 karakter rata kiri, menimpa digit lama secara mulus
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

// ==========================================
// ENGINE INTERPOLASI ANGKA HALUS (~55 FPS)
// ==========================================
float stepLerp(float current, float target, float factor, float snapThreshold) {
  float diff = target - current;
  if (fabsf(diff) <= snapThreshold) return target;
  return current + (diff * factor);
}

void updateSmoothDisplay() {
  // 1. RPM
  smooth_rpm = stepLerp(smooth_rpm, (float)target_rpm, 0.35f, 1.5f);
  uint16_t disp_rpm = (uint16_t)(smooth_rpm + 0.5f);
  current_rpm_state = getNormalState(disp_rpm, 2200, 2400);
  if (disp_rpm != last_rpm) {
    renderRowNumberInt(0, disp_rpm, current_rpm_state);
    drawDynamicStairBar(0, VLINE_2 + 8, Y_ROW[0] - 2, disp_rpm, 3000, 2200, 2400);
    last_rpm = disp_rpm;
  }

  // 2. ENGINE LOAD
  smooth_load = stepLerp(smooth_load, (float)target_load, 0.35f, 0.6f);
  uint8_t disp_load = (uint8_t)(smooth_load + 0.5f);
  current_load_state = getNormalState(disp_load, 95, 100);
  if (disp_load != last_load) {
    renderRowNumberInt(1, disp_load, current_load_state);
    drawDynamicStairBar(1, VLINE_2 + 8, Y_ROW[1] - 2, disp_load, 100, 95, 100);
    last_load = disp_load;
  }

  // 3. ENGINE TEMP
  smooth_eng = stepLerp(smooth_eng, (float)target_eng, 0.35f, 0.6f);
  uint8_t disp_eng = (uint8_t)(smooth_eng + 0.5f);
  current_eng_state = getTempState(disp_eng, 71, 105, 108);
  if (disp_eng != last_eng) {
    renderRowNumberInt(2, disp_eng, current_eng_state);
    drawDynamicStairBar(2, VLINE_2 + 8, Y_ROW[2] - 2, disp_eng, 120, 102, 108, 71);
    last_eng = disp_eng;
  }

  // 4. MAP BOOST
  smooth_map = stepLerp(smooth_map, (float)target_map, 0.35f, 0.8f);
  uint8_t disp_map = (uint8_t)(smooth_map + 0.5f);
  current_map_state = getNormalState(disp_map, 165, 200);
  if (disp_map != last_map) {
    renderRowNumberInt(3, disp_map, current_map_state);
    drawDynamicStairBar(3, VLINE_2 + 8, Y_ROW[3] - 2, disp_map, 255, 165, 200);
    last_map = disp_map;
  }

  // 5. SPEED
  smooth_speed = stepLerp(smooth_speed, (float)target_speed, 0.35f, 0.6f);
  uint8_t disp_speed = (uint8_t)(smooth_speed + 0.5f);
  current_speed_state = getNormalState(disp_speed, 39, 42);
  if (disp_speed != last_speed) {
    renderRowNumberInt(4, disp_speed, current_speed_state);
    drawDynamicStairBar(4, VLINE_2 + 8, Y_ROW[4] - 2, disp_speed, 60, 39, 42);
    last_speed = disp_speed;
  }

  // 6. SYSTEM VOLTAGE
  smooth_volt = stepLerp(smooth_volt, target_volt, 0.35f, 0.05f);
  float disp_volt = ((int)(smooth_volt * 10.0f + 0.5f)) / 10.0f;
  current_volt_state = getVoltState(disp_volt);
  if (fabsf(disp_volt - last_volt) >= 0.09f) {
    renderRowNumberFloat(5, disp_volt, current_volt_state);
    drawVoltStairBar(VLINE_2 + 8, Y_ROW[5] - 2, disp_volt);
    last_volt = disp_volt;
  }
}

// ==========================================
// ELM327 PARSER (SAMA PERSIS ProgramFinalNode2Revision)
// ==========================================
String byteToHex(uint8_t val) {
  String h = String(val, HEX); h.toUpperCase(); if (h.length() < 2) h = "0" + h; return h;
}

void processELMCommand(String cmd) {
  cmd.trim(); cmd.toUpperCase(); cmd.replace(" ", "");

  if (cmd == "") {
    Serial.print("\r>");
    return;
  }

  if (cmd.startsWith("01") && cmd.length() == 5) {
    cmd = cmd.substring(0, 4);
  }

  if (cmd.startsWith("AT")) {
    if (cmd == "ATZ" || cmd == "ATWS") { elm_space = true; elm_header = false; Serial.print("ELM327 v1.5\r>"); }
    else if (cmd == "ATI") { Serial.print("ELM327 v1.5\r>"); }
    else if (cmd == "ATH0") { elm_header = false; Serial.print("OK\r>"); }
    else if (cmd == "ATH1") { elm_header = true; Serial.print("OK\r>"); }
    else if (cmd == "ATS0") { elm_space = false; Serial.print("OK\r>"); }
    else if (cmd == "ATS1") { elm_space = true; Serial.print("OK\r>"); }
    else if (cmd == "ATDP") { Serial.print("ISO 15765-4 (CAN 11/500)\r>"); }
    else if (cmd == "ATDPN") { Serial.print("6\r>"); }
    else if (cmd == "ATRV") { float v = ((raw_volt_A * 256.0f) + raw_volt_B) / 1000.0f; Serial.print(String(v, 1) + "V\r>"); }
    else { Serial.print("OK\r>"); }
    return;
  }

  String response = ""; bool hasData = false; uint8_t dataBytes = 0;

  if (cmd == "0100") { response = "41 00 98 38 00 01"; dataBytes = 6; hasData = true; }
  else if (cmd == "0120") { response = "41 20 00 00 00 01"; dataBytes = 6; hasData = true; }
  else if (cmd == "0140") { response = "41 40 40 00 00 00"; dataBytes = 6; hasData = true; }
  else if (cmd == "0101") { response = "41 01 00 07 E0 00"; dataBytes = 6; hasData = true; }
  else if (cmd == "010C") { response = "41 0C " + byteToHex(raw_rpm_A) + " " + byteToHex(raw_rpm_B); dataBytes = 4; hasData = true; }
  else if (cmd == "0104") { response = "41 04 " + byteToHex(raw_load); dataBytes = 3; hasData = true; }
  else if (cmd == "0105") { response = "41 05 " + byteToHex(raw_eng); dataBytes = 3; hasData = true; }
  else if (cmd == "010B") { response = "41 0B " + byteToHex(raw_map); dataBytes = 3; hasData = true; }
  else if (cmd == "010D") { response = "41 0D " + byteToHex(raw_speed); dataBytes = 3; hasData = true; }
  else if (cmd == "0142") { response = "41 42 " + byteToHex(raw_volt_A) + " " + byteToHex(raw_volt_B); dataBytes = 4; hasData = true; }

  if (hasData) {
    String finalMsg = "";
    if (elm_header) { finalMsg += "7E8 " + byteToHex(dataBytes) + " "; }
    finalMsg += response;
    if (!elm_space) finalMsg.replace(" ", "");
    Serial.print(finalMsg + "\r>");
  } else {
    if (elm_space) Serial.print("NO DATA\r>"); else Serial.print("NODATA\r>");
  }
}

void requestOBDPID(uint8_t pid) {
  twai_clear_transmit_queue(); // Pastikan antrean TX bersih sebelum mengirim request baru
  twai_message_t tx_msg = {};
  tx_msg.identifier = 0x7DF;
  tx_msg.extd = 0;
  tx_msg.rtr = 0;
  tx_msg.data_length_code = 8;
  tx_msg.data[0] = 0x02;
  tx_msg.data[1] = 0x01;
  tx_msg.data[2] = pid;
  for (int i = 3; i < 8; i++) tx_msg.data[i] = 0x55;
  twai_transmit(&tx_msg, pdMS_TO_TICKS(5));
}

// ------------------------------------------------------------------------------
// INISIALISASI SISTEM WIFI OTA (ARDUINOTA & WEB OTA)
// ------------------------------------------------------------------------------
void setupOTA() {
  if (MDNS.begin(ota_hostname)) {}

  ArduinoOTA.setHostname(ota_hostname);
  ArduinoOTA.onStart([]() {
    pinMode(PIN_BUZZER, INPUT);
  });
  ArduinoOTA.begin();

  otaServer.on("/", HTTP_GET, []() {
    otaServer.sendHeader("Connection", "close");
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>CAT 950L Node 2 OTA</title>"
                  "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                  "<style>"
                  "body{font-family:Segoe UI,Roboto,sans-serif;background:#121212;color:#eee;text-align:center;padding:20px;margin:0;}"
                  ".card{background:#1e1e1e;max-width:440px;margin:40px auto;padding:28px;border-radius:12px;border:1px solid #333;box-shadow:0 8px 24px rgba(0,0,0,0.5);}"
                  "h2{color:#FFCD00;margin-top:0;font-size:22px;letter-spacing:0.5px;}"
                  "p{color:#aaa;font-size:14px;line-height:1.5;}"
                  ".badge{background:#2a2a2a;padding:6px 12px;border-radius:6px;display:inline-block;color:#FFCD00;font-family:monospace;font-size:13px;border:1px solid #444;}"
                  "input[type=file]{margin:20px 0;width:100%;color:#ccc;font-size:13px;}"
                  "input[type=submit]{background:#FFCD00;color:#121212;border:none;padding:12px 24px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:15px;width:100%;transition:0.2s;}"
                  "</style></head><body><div class='card'>"
                  "<h2>CAT 950L FIRMWARE UPDATE</h2>"
                  "<p><span class='badge'>Node 2: Display Hub & Cluster</span></p>"
                  "<p>IP Address: " + WiFi.localIP().toString() + "</p>"
                  "<form method='POST' action='/update' enctype='multipart/form-data'>"
                  "<input type='file' name='update' accept='.bin' required><br>"
                  "<input type='submit' value='Flash Firmware (.bin)'>"
                  "</form></div></body></html>";
    otaServer.send(200, "text/html", html);
  });

  otaServer.on("/update", HTTP_POST, []() {
    otaServer.sendHeader("Connection", "close");
    otaServer.send(200, "text/plain", (Update.hasError()) ? "UPDATE GAGAL!" : "UPDATE BERHASIL! Me-restart ESP32...");
    delay(1000);
    ESP.restart();
  }, []() {
    HTTPUpload& upload = otaServer.upload();
    if (upload.status == UPLOAD_FILE_START) {
      pinMode(PIN_BUZZER, INPUT);
      Update.begin(UPDATE_SIZE_UNKNOWN);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      Update.write(upload.buf, upload.currentSize);
    } else if (upload.status == UPLOAD_FILE_END) {
      Update.end(true);
    }
  });

  otaServer.begin();
  MDNS.addService("http", "tcp", 80);
}

// ==========================================
// ANIMASI INTRO MINIMALIS & MATANG (OEM AUTOMOTIVE CLUSTER STYLE 480x320)
// ==========================================
void showLoadingIntroScreen() {
  uint16_t catYellow  = tft.color565(255, 205, 0);
  uint16_t catGold    = tft.color565(225, 150, 0);
  uint16_t catAmber   = tft.color565(165, 85, 0);
  uint16_t catBronze  = tft.color565(85, 42, 0);
  uint16_t subtleLine = tft.color565(38, 44, 56);
  uint16_t trackGrey  = tft.color565(28, 33, 42);
  uint16_t mutedText  = tft.color565(130, 140, 155);
  uint16_t readyGreen = tft.color565(0, 230, 118);

  tft.fillScreen(TFT_BLACK);

  // 1. Aksen Bracket Sudut Minimalis (Clean OEM Frame)
  const int m = 16, len = 18;
  tft.drawFastHLine(m, m, len, subtleLine);
  tft.drawFastVLine(m, m, len, subtleLine);
  tft.drawFastHLine(480 - m - len, m, len, subtleLine);
  tft.drawFastVLine(480 - m, m, len, subtleLine);
  tft.drawFastHLine(m, 320 - m, len, subtleLine);
  tft.drawFastVLine(m, 320 - m - len, len, subtleLine);
  tft.drawFastHLine(480 - m - len, 320 - m, len, subtleLine);
  tft.drawFastVLine(480 - m, 320 - m - len, len, subtleLine);

  // 2. Emblem / Badge Minimalis "CAT 950L" di Atas
  tft.fillRoundRect(202, 30, 76, 18, 4, catYellow);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(TFT_BLACK, catYellow);
  tft.drawString("CAT 950L", 240, 39);

  // 3. Judul Utama Clean & Tegas
  tft.setTextSize(3);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("CAN BUS SIMULATOR", 240, 74);

  // Garis Aksen Tipis Presisi di Bawah Judul
  tft.drawFastHLine(140, 98, 200, subtleLine);
  tft.fillRect(216, 97, 48, 3, catYellow);

  // 4. Geometri Orbital Spinner Presisi di Tengah (cx = 240, cy = 182)
  const int cx = 240, cy = 182;
  const int numDots = 16;
  const float radius = 48.0f;
  int dotX[numDots], dotY[numDots];

  // Cincin statis tipis pembungkus luar & dalam
  tft.drawCircle(cx, cy, 62, subtleLine);
  tft.drawCircle(cx, cy, 34, subtleLine);

  for (int i = 0; i < numDots; i++) {
    float angle = (i * (360.0f / numDots) - 90.0f) * 0.0174532925f;
    dotX[i] = cx + (int)(cosf(angle) * radius);
    dotY[i] = cy + (int)(sinf(angle) * radius);
  }

  // 5. Sleek Progress Track Tipis di Bawah (Lebar 240px, Tinggi 4px)
  const int barX = 120, barY = 276, barW = 240, barH = 4;
  tft.fillRoundRect(barX, barY, barW, barH, 2, trackGrey);

  // 6. Loop Animasi Berputar Halus
  const int totalSteps = 48;
  twai_message_t dummy_rx;

  for (int step = 0; step <= totalSteps; step++) {
    while (twai_receive(&dummy_rx, 0) == ESP_OK) {}

    int pct = (step * 100) / totalSteps;
    int head = step % numDots;

    for (int i = 0; i < numDots; i++) {
      int dist = (head - i + numDots) % numDots;
      uint16_t c;
      int r = 4;

      if (step == totalSteps) {
        c = readyGreen;
      } else if (dist == 0) {
        c = TFT_WHITE;
        r = 5;
      } else if (dist == 1) {
        c = catYellow;
      } else if (dist == 2) {
        c = catGold;
      } else if (dist == 3) {
        c = catAmber;
      } else if (dist == 4) {
        c = catBronze;
      } else {
        c = trackGrey;
      }

      if (dist != 0) {
        tft.drawCircle(dotX[i], dotY[i], 5, TFT_BLACK);
      }
      tft.fillCircle(dotX[i], dotY[i], r, c);
    }

    // Persentase di tengah cincin
    tft.setTextDatum(MC_DATUM);
    tft.setTextSize(2);
    tft.setTextPadding(48);
    tft.setTextColor(step == totalSteps ? readyGreen : TFT_WHITE, TFT_BLACK);
    tft.drawString(String(pct) + "%", cx, cy + 1);

    // Update garis progress tipis
    int fillW = (barW * step) / totalSteps;
    if (fillW > 0) {
      tft.fillRoundRect(barX, barY, fillW, barH, 2, step == totalSteps ? readyGreen : catYellow);
    }

    // Satu baris status minimalis di bawah progress bar
    if (step == 0) {
      tft.setTextSize(1);
      tft.setTextPadding(180);
      tft.setTextColor(mutedText, TFT_BLACK);
      tft.drawString("STARTING SYSTEM...", 240, 294);
    } else if (step == totalSteps) {
      tft.setTextSize(1);
      tft.setTextPadding(180);
      tft.setTextColor(readyGreen, TFT_BLACK);
      tft.drawString("READY", 240, 294);
    }

    delay(32);
  }

  // Beep pendek tanda siap
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  delay(80);
  pinMode(PIN_BUZZER, INPUT);
  delay(250);

  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(38400); // Baud rate standar ELM327 USB
  Serial2.begin(115200, SERIAL_8N1, UART2_RX, UART2_TX); // Link ke Node 3 (IoT Gateway)
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZER, INPUT);

  // Matikan Wi-Fi secara default agar suplai 3.3V ke CAN Transceiver & TFT stabil 100%
  // (Tekan tombol BOOT GPIO 0 kapan saja jika ingin mengaktifkan Wi-Fi OTA)
  WiFi.mode(WIFI_OFF);

  // 1. Inisialisasi TWAI CAN
  initTWAI();

  // 2. Inisialisasi Layar TFT & Animasi Intro Berputar
  tft.init();
  tft.setRotation(1);
  showLoadingIntroScreen();

  // 3. Gambar Grid Statis Dashboard Utama
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.drawString("DASHBOARD SIM CAN-BUS CATERPILLAR 950L", 12, 8);

  for (int i = 0; i < 7; i++) tft.drawLine(0, Y_LINE[i], 480, Y_LINE[i], TFT_DARKGREY);
  tft.drawLine(VLINE_1, 30, VLINE_1, 294, TFT_DARKGREY);
  tft.drawLine(VLINE_2, 30, VLINE_2, 294, TFT_DARKGREY);
  tft.drawLine(VLINE_3, 30, VLINE_3, 294, TFT_DARKGREY);

  tft.setTextSize(2); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("RPM", 5, Y_ROW[0]);      tft.setTextColor(TFT_WHITE); tft.drawString("REV",  VLINE_2 - 45, Y_ROW[0]); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("ENG LOAD", 5, Y_ROW[1]); tft.setTextColor(TFT_WHITE); tft.drawString("%",    VLINE_2 - 35, Y_ROW[1]); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("ENG TMP", 5, Y_ROW[2]);  tft.setTextColor(TFT_WHITE); tft.drawString("C",    VLINE_2 - 35, Y_ROW[2]); tft.drawCircle(VLINE_2 - 42, Y_ROW[2] + 2, 2, TFT_WHITE); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("MAP BST", 5, Y_ROW[3]);  tft.setTextColor(TFT_WHITE); tft.drawString("kPa",  VLINE_2 - 45, Y_ROW[3]); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("SPEED", 5, Y_ROW[4]);    tft.setTextColor(TFT_WHITE); tft.drawString("KM/H", VLINE_2 - 60, Y_ROW[4]); tft.setTextColor(TFT_LIGHTGREY);
  tft.drawString("SYS VOLT", 5, Y_ROW[5]); tft.setTextColor(TFT_WHITE); tft.drawString("V",    VLINE_2 - 35, Y_ROW[5]);

  // 4. Tampilkan nilai awal secara langsung agar layar tidak pernah kosong saat baru masuk
  updateSmoothDisplay();

  // Reset driver TWAI tepat setelah intro selesai agar sinkron 100% walaupun Node 1 dicolok duluan
  resetTWAI();
  lastCanRxTime = millis();
}

// ==========================================
// LOOP UTAMA (SINGLE-CORE SMOOTH RENDERING & AUTO-RECOVERY)
// ==========================================
void loop() {
  unsigned long now = millis();

  // 1. Proses ELM327 Serial
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (serialBuffer.length() > 0) {
        processELMCommand(serialBuffer);
        lastCmdToDraw = serialBuffer;
        needToDrawCmd = true;
        serialBuffer = "";
      } else if (c == '\r') {
        Serial.print("\r>");
      }
    } else {
      serialBuffer += c;
    }
  }

  if (needToDrawCmd) {
    tft.fillRect(5, 302, 250, 15, TFT_BLACK);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(1);
    tft.drawString("CMD: " + lastCmdToDraw, 5, 305);
    needToDrawCmd = false;
  }

  // 2. Pewaktu Blink (500 ms) & Pengiriman Request OBD-II Cepat (setiap 25 ms)
  bool blinkChanged = false;
  if (now - blinkTimer >= 500) {
    blinkTimer = now;
    blinkState = !blinkState;
    blinkChanged = true;
  }

  if (now - lastRequestTime >= 25) {
    requestOBDPID(pids[pidIndex]);
    pidIndex = (pidIndex + 1) % 6;
    lastRequestTime = now;
  }

  // 3. Terima semua frame CAN yang masuk
  twai_message_t rx_msg;
  while (twai_receive(&rx_msg, 0) == ESP_OK) {
    lastCanRxTime = now;
    hasReceivedCanData = true;

    // A. Format Standar OBD-II 11-bit (0x7E8)
    if (!rx_msg.extd && rx_msg.identifier == 0x7E8 && rx_msg.data[1] == 0x41) {
      uint8_t pid = rx_msg.data[2];
      switch (pid) {
        case 0x0C: { // RPM
          raw_rpm_A = rx_msg.data[3]; raw_rpm_B = rx_msg.data[4];
          target_rpm = ((raw_rpm_A * 256) + raw_rpm_B) / 4;
          if (!sync_rpm) { smooth_rpm = target_rpm; sync_rpm = true; }
          break;
        }
        case 0x04: { // LOAD
          raw_load = rx_msg.data[3];
          target_load = (raw_load * 100) / 255;
          if (!sync_load) { smooth_load = target_load; sync_load = true; }
          break;
        }
        case 0x05: { // TEMP
          raw_eng = rx_msg.data[3];
          target_eng = (raw_eng >= 40) ? (raw_eng - 40) : 0;
          if (!sync_eng) { smooth_eng = target_eng; sync_eng = true; }
          break;
        }
        case 0x0B: { // MAP BOOST
          raw_map = rx_msg.data[3];
          target_map = raw_map;
          if (!sync_map) { smooth_map = target_map; sync_map = true; }
          break;
        }
        case 0x0D: { // SPEED
          raw_speed = rx_msg.data[3];
          target_speed = raw_speed;
          if (!sync_speed) { smooth_speed = target_speed; sync_speed = true; }
          break;
        }
        case 0x42: { // VOLTAGE
          raw_volt_A = rx_msg.data[3]; raw_volt_B = rx_msg.data[4];
          target_volt = ((raw_volt_A * 256.0f) + raw_volt_B) / 1000.0f;
          if (!sync_volt) { smooth_volt = target_volt; sync_volt = true; }
          break;
        }
      }
    }
    // B. Format Extended SAE J1939 29-bit
    else if (rx_msg.extd) {
      uint32_t pgn = (rx_msg.identifier >> 8) & 0x3FFFF;
      switch (pgn) {
        case PGN_EEC1: {
          uint16_t raw_j_rpm = rx_msg.data[3] | (rx_msg.data[4] << 8);
          target_rpm = raw_j_rpm / 8;
          if (!sync_rpm) { smooth_rpm = target_rpm; sync_rpm = true; }
          break;
        }
        case PGN_EEC2: {
          target_load = rx_msg.data[2];
          if (!sync_load) { smooth_load = target_load; sync_load = true; }
          break;
        }
        case PGN_ET1: {
          raw_eng = rx_msg.data[0];
          target_eng = (raw_eng >= 40) ? (raw_eng - 40) : 0;
          if (!sync_eng) { smooth_eng = target_eng; sync_eng = true; }
          break;
        }
        case PGN_IC1: {
          uint16_t boost_kpa = rx_msg.data[1] * 2;
          target_map = (boost_kpa > 255) ? 255 : (uint8_t)boost_kpa;
          if (!sync_map) { smooth_map = target_map; sync_map = true; }
          break;
        }
        case PGN_CCVS: {
          uint16_t raw_spd = rx_msg.data[1] | (rx_msg.data[2] << 8);
          target_speed = raw_spd / 256;
          if (!sync_speed) { smooth_speed = target_speed; sync_speed = true; }
          break;
        }
        case PGN_VEP1: {
          uint16_t raw_v = rx_msg.data[4] | (rx_msg.data[5] << 8);
          target_volt = raw_v * 0.05f;
          if (!sync_volt) { smooth_volt = target_volt; sync_volt = true; }
          break;
        }
      }
    }
  }

  // 4. Jalankan Animasi Smooth Interpolation Angka (~55 FPS / tiap 18 ms)
  if (now - lastSmoothStep >= 18) {
    lastSmoothStep = now;
    updateSmoothDisplay();

    drawAlertIcon(0, current_rpm_state, blinkChanged);
    drawAlertIcon(1, current_load_state, blinkChanged);
    drawAlertIcon(2, current_eng_state, blinkChanged);
    drawAlertIcon(3, current_map_state, blinkChanged);
    drawAlertIcon(4, current_speed_state, blinkChanged);
    drawAlertIcon(5, current_volt_state, blinkChanged);
  } else if (blinkChanged) {
    drawAlertIcon(0, current_rpm_state, true);
    drawAlertIcon(1, current_load_state, true);
    drawAlertIcon(2, current_eng_state, true);
    drawAlertIcon(3, current_map_state, true);
    drawAlertIcon(4, current_speed_state, true);
    drawAlertIcon(5, current_volt_state, true);
  }

  // 5. Kontrol Buzzer Active LOW Hi-Z
  bool alarm_red = (current_rpm_state == 3 || current_load_state == 3 || current_eng_state == 3 ||
                    current_map_state == 3 || current_speed_state == 3 || current_volt_state == 3);
  bool warning_orange = (!alarm_red) &&
                        (current_rpm_state == 2 || current_load_state == 2 || current_eng_state == 2 ||
                         current_map_state == 2 || current_speed_state == 2 || current_volt_state == 2);

  if (alarm_red) {
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);
  } else if (warning_orange) {
    if (blinkState) {
      pinMode(PIN_BUZZER, OUTPUT);
      digitalWrite(PIN_BUZZER, LOW);
    } else {
      pinMode(PIN_BUZZER, INPUT);
    }
  } else {
    pinMode(PIN_BUZZER, INPUT);
  }

  // 6. Teruskan data telemetri JSON ke Node 3 (IoT Gateway) via UART2 setiap 200 ms
  if (hasReceivedCanData && (now - lastForwardTime >= 200)) {
    lastForwardTime = now;
    uint8_t globalState = 1;
    if (alarm_red) globalState = 3;
    else if (warning_orange) globalState = 2;
    else if (current_eng_state == 0) globalState = 0;

    Serial2.printf("{\"rpm\":%d,\"load\":%d,\"temp\":%d,\"map\":%d,\"spd\":%d,\"volt\":%.1f,\"st\":%d}\n",
                   target_rpm, target_load, target_eng, target_map, target_speed, target_volt, globalState);
  }

  // 7. WATCHDOG TWAI CAN OTOMATIS:
  //    Jika tidak ada balasan CAN selama > 400 ms (misal Node 1 dicolok duluan atau kabel goyang),
  //    reset bersih hardware TWAI agar langsung tersambung otomatis!
  if (now - lastWatchdogCheck >= 250) {
    lastWatchdogCheck = now;
    twai_status_info_t status;
    if (twai_get_status_info(&status) == ESP_OK) {
      bool busError = (status.state != TWAI_STATE_RUNNING) ||
                      (status.tx_error_counter > 64) ||
                      (status.rx_error_counter > 64);
      bool rxTimeout = (now - lastCanRxTime > 400);

      if (busError || rxTimeout) {
        resetTWAI();
        lastCanRxTime = now;
      }
    }
  }

  // 8. Aktifkan Wi-Fi OTA jika tombol BOOT (GPIO 0) ditekan
  if (digitalRead(PIN_BOOT_BTN) == LOW && !wifiOtaEnabled) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifi_ssid, wifi_password);
    wifiOtaEnabled = true;
    wifiConnectStart = now;
  }

  if (wifiOtaEnabled) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!otaInitialized) {
        setupOTA();
        otaInitialized = true;
      }
      ArduinoOTA.handle();
      otaServer.handleClient();
    } else if (now - wifiConnectStart > 30000) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      wifiOtaEnabled = false;
      otaInitialized = false;
    }
  }
}
