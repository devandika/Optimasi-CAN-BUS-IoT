/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node SAE J1939 ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 1 - Electronic Control Unit (ECU) Simulator
 * STANDAR: SAE J1939 (29-bit Extended Identifier @ 500 kbps)
 * HARDWARE: ESP32 DevKit V1 + Transceiver CAN SN65HVD230 + 6x Potensiometer 10k
 * ==============================================================================
 */

#include "driver/twai.h"
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
const char *wifi_ssid     = "CAT950L_HOTSPOT";     // Ganti dengan SSID Wi-Fi / Hotspot Anda
const char *wifi_password = "caterpillar950l";     // Ganti dengan Password Wi-Fi Anda
const char *ota_hostname  = "CAT950L-Node1-ECU";   // Hostname unik mDNS Node 1

WebServer otaServer(80);
bool otaInitialized = false;
bool wifiOtaEnabled = false;
unsigned long wifiConnectStart = 0;

#define PIN_BOOT_BTN 0  // Tekan tombol BOOT onboard jika ingin menyalakan Wi-Fi OTA

// ------------------------------------------------------------------------------
// KONFIGURASI PIN INPUT ANALOG (SAMA PERSIS DENGAN ProgramFinalNode1)
// ------------------------------------------------------------------------------
#define PIN_RPM     32  // Potensio Engine RPM (0 - 3000 RPM) [ADC1_CH4]
#define PIN_LOAD    33  // Potensio Engine Load (0 - 100 %)   [ADC1_CH5]
#define PIN_ENG_TMP 34  // Potensio Suhu Mesin (0 - 120 °C)   [ADC1_CH6]
#define PIN_MAP     35  // Potensio MAP Boost (0 - 255 kPa)   [ADC1_CH7]
#define PIN_SPEED   25  // Potensio Vehicle Speed (0 - 60 km/h) [ADC2_CH8]
#define PIN_VOLT    26  // Potensio System Voltage (0.0 - 35.0 V) [ADC2_CH9]

// ------------------------------------------------------------------------------
// KONFIGURASI OUTPUT PWM KIPAS RADIATOR MESIN (ENGINE COOLING FAN)
// ------------------------------------------------------------------------------
#define PIN_FAN_PWM 18  // Pin Output PWM ke Basis Transistor Kipas 5V [GPIO 18 / D18]
#define FAN_PWM_CHANNEL  0
#define FAN_PWM_FREQ     5000 // 5 kHz PWM frequency (bebas dengung motor)
#define FAN_PWM_RES      8    // Resolusi 8-bit (rentang duty cycle 0 - 255)

#define FAN_DUTY_NORMAL  95   // Kecepatan Normal awal nyala (~37% duty cycle)
#define FAN_DUTY_WARN    255  // Kecepatan Penuh saat warning (100% duty cycle)
#define FAN_TEMP_WARN_THRESH 105 // Ambang batas suhu warning (>= 105 C)
#define FAN_TEMP_HYST_THRESH 98  // Ambang histeresis suhu kembali normal (<= 98 C)

// Variabel status kendali Kipas Pendingin Mesin
bool fanHighSpeed = false;
uint8_t currentFanDuty = 0;
unsigned long lastFanUpdate = 0;

// ------------------------------------------------------------------------------
// KONFIGURASI PIN TWAI CAN BUS
// ------------------------------------------------------------------------------
#define TX_PIN 21       // Terhubung ke CTX / TXD SN65HVD230
#define RX_PIN 22       // Terhubung ke CRX / RXD SN65HVD230

// ------------------------------------------------------------------------------
// DEFINISI PARAMETER GROUP NUMBER (PGN) PROTOKOL SAE J1939
// ------------------------------------------------------------------------------
#define PGN_REQUEST 59904 // 0xEA00 - SAE J1939 Request PGN
#define PGN_EEC1    61444 // 0xF004 - Electronic Engine Controller 1 (RPM, SPN 190)
#define PGN_EEC2    61443 // 0xF003 - Electronic Engine Controller 2 (Engine Load, SPN 92)
#define PGN_ET1     65262 // 0xFEEE - Engine Temperature 1 (Coolant Temp, SPN 110)
#define PGN_IC1     65270 // 0xFEF6 - Intake/Exhaust Conditions 1 (MAP Boost, SPN 102)
#define PGN_CCVS    65265 // 0xFEF1 - Cruise Control / Vehicle Speed (Ground Speed, SPN 84)
#define PGN_VEP1    65271 // 0xFEF7 - Vehicle Electrical Power 1 (System Voltage, SPN 168)

#define SOURCE_ADDR_ENGINE 0x00 // Source Address (SA) standar Engine #1 SAE J1939

// Waktu terakhir menerima request J1939 dari Node 2 (untuk Watchdog Auto-Reset)
unsigned long lastRxFromNode2 = 0;
unsigned long lastWatchdogCheck = 0;

// Cache nilai ADC & EMA filter agar pembacaan potensio bebas loncatan noise
float emaAdc[6] = {-1, -1, -1, -1, -1, -1};
int cachedAdcSpeed = 0;
int cachedAdcVolt  = 0;

// ------------------------------------------------------------------------------
// FUNGSI INSTALASI & HARD-RESET DRIVER TWAI CAN
// Menjamin pemulihan 100% otomatis jika Node 1 dicolok duluan atau kabel goyang
// ------------------------------------------------------------------------------
void initTWAI() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)TX_PIN, (gpio_num_t)RX_PIN, TWAI_MODE_NORMAL);
  g_config.tx_queue_len = 5;
  g_config.rx_queue_len = 15;
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
// FUNGSI PEMBENTUK 29-BIT EXTENDED IDENTIFIER SAE J1939
// Format 29-bit: [Priority (3b)] [Reserved/DP (2b)] [PF (8b)] [PS (8b)] [SA (8b)]
// ------------------------------------------------------------------------------
uint32_t makeJ1939Id(uint8_t priority, uint32_t pgn, uint8_t sourceAddress) {
  return ((uint32_t)(priority & 0x07) << 26) |
         ((uint32_t)(pgn & 0x3FFFF) << 8) |
         ((uint32_t)(sourceAddress & 0xFF));
}

// ------------------------------------------------------------------------------
// FUNGSI PEMBACAAN ADC DENGAN MULTISAMPLING + EMA SMOOTHING
// ------------------------------------------------------------------------------
int readFilteredADC(int pin, int chIdx) {
  if ((pin == PIN_SPEED || pin == PIN_VOLT) && WiFi.getMode() != WIFI_OFF) {
    return (pin == PIN_SPEED) ? cachedAdcSpeed : cachedAdcVolt;
  }

  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(pin);
  }
  float raw = sum / 8.0f;

  // Exponential Moving Average (EMA) untuk meredam getaran mikro potensiometer
  if (emaAdc[chIdx] < 0) {
    emaAdc[chIdx] = raw;
  } else {
    emaAdc[chIdx] = (emaAdc[chIdx] * 0.65f) + (raw * 0.35f);
  }

  int result = (int)(emaAdc[chIdx] + 0.5f);
  if (pin == PIN_SPEED) cachedAdcSpeed = result;
  if (pin == PIN_VOLT)  cachedAdcVolt  = result;
  return result;
}

// ------------------------------------------------------------------------------
// FUNGSI TRANSMISI FRAME SAE J1939 (29-BIT EXTENDED IDENTIFIER)
// Node 1 memancarkan PGN SAE J1939 saat diminta oleh Node 2 -> Bebas tabrakan bus
// dan aman 100% walaupun Node 1 dicolok ke power lebih dulu!
// ------------------------------------------------------------------------------
void transmitEEC1() {
  // PGN 61444 (0xF004) - Priority 3, SA 0x00 -> ID: 0x0CF00400
  // SPN 190 (Engine Speed): Resolusi 0.125 rpm/bit, Byte 4-5 (index 3 LSB, 4 MSB)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(3, PGN_EEC1, SOURCE_ADDR_ENGINE);
  uint16_t rpm = map(readFilteredADC(PIN_RPM, 0), 0, 4095, 0, 3000);
  uint16_t raw_rpm = rpm * 8;
  memset(msg.data, 0xFF, 8);
  msg.data[3] = (uint8_t)(raw_rpm & 0xFF);
  msg.data[4] = (uint8_t)((raw_rpm >> 8) & 0xFF);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitEEC2() {
  // PGN 61443 (0xF003) - Priority 3, SA 0x00 -> ID: 0x0CF00300
  // SPN 92 (Engine Percent Load): Resolusi 1 %/bit (0-100%), Byte 3 (index 2)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(3, PGN_EEC2, SOURCE_ADDR_ENGINE);
  memset(msg.data, 0xFF, 8);
  msg.data[2] = (uint8_t)map(readFilteredADC(PIN_LOAD, 1), 0, 4095, 0, 100);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitET1() {
  // PGN 65262 (0xFEEE) - Priority 6, SA 0x00 -> ID: 0x18FEEE00
  // SPN 110 (Engine Coolant Temp): Resolusi 1 C/bit, Offset -40 C, Byte 1 (index 0)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(6, PGN_ET1, SOURCE_ADDR_ENGINE);
  memset(msg.data, 0xFF, 8);
  msg.data[0] = (uint8_t)(map(readFilteredADC(PIN_ENG_TMP, 2), 0, 4095, 0, 120) + 40);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitIC1() {
  // PGN 65270 (0xFEF6) - Priority 6, SA 0x00 -> ID: 0x18FEF600
  // SPN 102 (Engine Intake Manifold #1 Pressure / Boost): Resolusi 2 kPa/bit, Byte 2 (index 1)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(6, PGN_IC1, SOURCE_ADDR_ENGINE);
  memset(msg.data, 0xFF, 8);
  uint16_t kpa = (uint16_t)map(readFilteredADC(PIN_MAP, 3), 0, 4095, 0, 255);
  msg.data[1] = (uint8_t)((kpa + 1) / 2);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitCCVS() {
  // PGN 65265 (0xFEF1) - Priority 6, SA 0x00 -> ID: 0x18FEF100
  // SPN 84 (Wheel-Based Vehicle Speed): Resolusi 1/256 km/h/bit, Byte 2-3 (index 1 LSB, 2 MSB)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(6, PGN_CCVS, SOURCE_ADDR_ENGINE);
  uint16_t raw_speed = (uint16_t)map(readFilteredADC(PIN_SPEED, 4), 0, 4095, 0, 60) * 256;
  memset(msg.data, 0xFF, 8);
  msg.data[1] = (uint8_t)(raw_speed & 0xFF);
  msg.data[2] = (uint8_t)((raw_speed >> 8) & 0xFF);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitVEP1() {
  // PGN 65271 (0xFEF7) - Priority 6, SA 0x00 -> ID: 0x18FEF700
  // SPN 168 (Battery Potential / System Voltage): Resolusi 0.05 V/bit, Byte 5-6 (index 4 LSB, 5 MSB)
  twai_clear_transmit_queue();
  twai_message_t msg = {};
  msg.extd = 1;
  msg.rtr = 0;
  msg.data_length_code = 8;
  msg.identifier = makeJ1939Id(6, PGN_VEP1, SOURCE_ADDR_ENGINE);
  float volt_v = (map(readFilteredADC(PIN_VOLT, 5), 0, 4095, 0, 35000)) / 1000.0f;
  uint16_t raw_volt = (uint16_t)(volt_v * 20.0f + 0.5f);
  memset(msg.data, 0xFF, 8);
  msg.data[4] = (uint8_t)(raw_volt & 0xFF);
  msg.data[5] = (uint8_t)((raw_volt >> 8) & 0xFF);
  twai_transmit(&msg, pdMS_TO_TICKS(10));
}

void transmitJ1939PGN(uint32_t requestedPgn) {
  switch (requestedPgn) {
    case PGN_EEC1: transmitEEC1(); break;
    case PGN_EEC2: transmitEEC2(); break;
    case PGN_ET1:  transmitET1();  break;
    case PGN_IC1:  transmitIC1();  break;
    case PGN_CCVS: transmitCCVS(); break;
    case PGN_VEP1: transmitVEP1(); break;
    default: break;
  }
}

// ------------------------------------------------------------------------------
// INISIALISASI SISTEM WIFI OTA (ARDUINOTA & WEB OTA)
// ------------------------------------------------------------------------------
void setupOTA() {
  if (MDNS.begin(ota_hostname)) {
    Serial.printf("[OTA] mDNS responder aktif: http://%s.local\n", ota_hostname);
  }

  ArduinoOTA.setHostname(ota_hostname);
  ArduinoOTA.onStart([]() {
    Serial.println("\n[ArduinoOTA] Mulai flashing...");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[ArduinoOTA] Selesai! Me-restart ESP32...");
  });
  ArduinoOTA.begin();

  otaServer.on("/", HTTP_GET, []() {
    otaServer.sendHeader("Connection", "close");
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>CAT 950L Node 1 OTA</title>"
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
                  "<p><span class='badge'>Node 1: ECU Simulator</span></p>"
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
      Update.begin(UPDATE_SIZE_UNKNOWN);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      Update.write(upload.buf, upload.currentSize);
    } else if (upload.status == UPLOAD_FILE_END) {
      Update.end(true);
    }
  });

  otaServer.begin();
  MDNS.addService("http", "tcp", 80);
  Serial.println("[OTA] ArduinoOTA & Web OTA Server Siap!");
}

// ------------------------------------------------------------------------------
// FUNGSI KENDALI KIPAS RADIATOR MESIN (ENGINE COOLING FAN PWM)
// ------------------------------------------------------------------------------
void setFanDuty(uint8_t duty) {
  currentFanDuty = duty;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcWrite(PIN_FAN_PWM, duty);
#else
  ledcWrite(FAN_PWM_CHANNEL, duty);
#endif
}

void initCoolingFan() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(PIN_FAN_PWM, FAN_PWM_FREQ, FAN_PWM_RES);
#else
  ledcSetup(FAN_PWM_CHANNEL, FAN_PWM_FREQ, FAN_PWM_RES);
  ledcAttachPin(PIN_FAN_PWM, FAN_PWM_CHANNEL);
#endif
  fanHighSpeed = false;
  setFanDuty(FAN_DUTY_NORMAL);
  Serial.printf("[COOLING FAN] Kipas Aktif di Pin GPIO %d (Speed Normal Awal: %d/255)\n", PIN_FAN_PWM, FAN_DUTY_NORMAL);
}

void updateCoolingFan(unsigned long now) {
  if (now - lastFanUpdate < 100) return; // Evaluasi setiap 100 ms
  lastFanUpdate = now;

  // Baca suhu mesin aktual (0 - 120 °C) dari potensio PIN_ENG_TMP (ADC1_CH6)
  uint8_t eng_temp_c = (uint8_t)map(readFilteredADC(PIN_ENG_TMP, 2), 0, 4095, 0, 120);

  if (!fanHighSpeed && eng_temp_c >= FAN_TEMP_WARN_THRESH) {
    fanHighSpeed = true;
    setFanDuty(FAN_DUTY_WARN);
    Serial.printf("[COOLING FAN] Suhu Mesin WARNING (%d C >= %d C) -> Putaran Kipas MAKSIMAL (100%%)!\n",
                  eng_temp_c, FAN_TEMP_WARN_THRESH);
  } else if (fanHighSpeed && eng_temp_c <= FAN_TEMP_HYST_THRESH) {
    fanHighSpeed = false;
    setFanDuty(FAN_DUTY_NORMAL);
    Serial.printf("[COOLING FAN] Suhu Mesin AMAN (%d C <= %d C) -> Putaran Kipas NORMAL (%d/255).\n",
                  eng_temp_c, FAN_TEMP_HYST_THRESH, FAN_DUTY_NORMAL);
  }
}

// ------------------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);

  // Pastikan Wi-Fi OFF secara default saat kerja normal agar:
  // 1) ADC2 (GPIO 25 Speed & GPIO 26 Voltage) bebas 100% dari penguncian Wi-Fi ESP32 Core 3.x
  // 2) Tegangan 3.3V untuk Transceiver CAN SN65HVD230 stabil tanpa lonjakan arus RF 350mA
  // (Tekan tombol BOOT GPIO 0 kapan saja jika ingin menyalakan Wi-Fi OTA)
  WiFi.mode(WIFI_OFF);

  // Inisialisasi Kipas Radiator Mesin (Otomatis langsung menyala di kecepatan normal)
  initCoolingFan();

  initTWAI();
  lastRxFromNode2 = millis();
  Serial.println("ECU Simulator CAT 950L Aktif.");
}

// ------------------------------------------------------------------------------
// LOOP UTAMA
// ------------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // 1. Kontrol Otomatis Kipas Radiator Mesin (Otomatis naik kencang saat suhu warning)
  updateCoolingFan(now);

  // 2. Terima Request PGN SAE J1939 (PGN 59904 / 0xEA00, 29-bit Extended) dari Node 2
  //    & balas dengan 29-bit Frame SAE J1939 seketika
  twai_message_t rx_msg;
  while (twai_receive(&rx_msg, 0) == ESP_OK) {
    lastRxFromNode2 = now;
    if (rx_msg.extd && rx_msg.data_length_code >= 3) {
      uint32_t pgn_pdu1 = (rx_msg.identifier >> 8) & 0x3FF00;
      if (pgn_pdu1 == PGN_REQUEST) {
        uint32_t reqPgn = (uint32_t)rx_msg.data[0] |
                          ((uint32_t)rx_msg.data[1] << 8) |
                          ((uint32_t)rx_msg.data[2] << 16);
        transmitJ1939PGN(reqPgn);
      }
    }
  }

  // 3. WATCHDOG TWAI CAN OTOMATIS:
  //    Jika Node 1 dicolok ke power lebih dulu (Node 2 belum nyala), atau kabel CAN sempat
  //    goyang/terputus sehingga tidak ada request selama > 600 ms atau terjadi error bus,
  //    reset bersih hardware TWAI agar selalu siap menangkap request pertama dari Node 2!
  if (now - lastWatchdogCheck >= 300) {
    lastWatchdogCheck = now;
    twai_status_info_t status;
    if (twai_get_status_info(&status) == ESP_OK) {
      bool busError = (status.state != TWAI_STATE_RUNNING) ||
                      (status.tx_error_counter > 64) ||
                      (status.rx_error_counter > 64);
      bool rxTimeout = (now - lastRxFromNode2 > 600);

      if (busError || rxTimeout) {
        resetTWAI();
        lastRxFromNode2 = now;
      }
    }
  }

  // 3. Aktifkan Wi-Fi OTA jika tombol BOOT (GPIO 0) ditekan
  if (digitalRead(PIN_BOOT_BTN) == LOW && !wifiOtaEnabled) {
    cachedAdcSpeed = analogRead(PIN_SPEED);
    cachedAdcVolt  = analogRead(PIN_VOLT);
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifi_ssid, wifi_password);
    wifiOtaEnabled = true;
    wifiConnectStart = now;
    Serial.println("[WIFI] Tombol BOOT ditekan: Mengaktifkan Wi-Fi OTA...");
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
      Serial.println("[WIFI] Timeout OTA -> Radio Wi-Fi OFF.");
    }
  }
}
