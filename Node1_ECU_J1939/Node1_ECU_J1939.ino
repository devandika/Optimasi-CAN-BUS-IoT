/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node CAN-Bus ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 1 - Electronic Control Unit (ECU) Simulator
 * STANDAR: Master-Slave OBD-II (0x7DF/0x7E8) CAN Bus Standar (@ 500 kbps)
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
// KONFIGURASI PIN TWAI CAN BUS
// ------------------------------------------------------------------------------
#define TX_PIN 21       // Terhubung ke CTX / TXD SN65HVD230
#define RX_PIN 22       // Terhubung ke CRX / RXD SN65HVD230

// Waktu terakhir menerima request CAN dari Node 2 (untuk Watchdog Auto-Reset)
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
// FUNGSI RESPON OBD-II (SAMA PERSIS DENGAN ProgramFinalNode1)
// Node 1 HANYA memancarkan frame saat diminta oleh Node 2 -> Bebas tabrakan bus
// dan aman 100% walaupun Node 1 dicolok ke power lebih dulu!
// ------------------------------------------------------------------------------
void sendOBDResponse(uint8_t pid) {
  // Bersihkan antrean TX jika ada sisa frame yang belum terkirim sebelumnya
  twai_clear_transmit_queue();

  twai_message_t tx_msg = {};
  tx_msg.identifier = 0x7E8;
  tx_msg.extd = 0;
  tx_msg.rtr = 0;
  tx_msg.data_length_code = 8;
  tx_msg.data[1] = 0x41;
  tx_msg.data[2] = pid;
  for (int i = 3; i < 8; i++) tx_msg.data[i] = 0x55;

  switch (pid) {
    case 0x0C: { // RPM (0 - 3000)
      int valRPM = readFilteredADC(PIN_RPM, 0);
      uint32_t obd_rpm = map(valRPM, 0, 4095, 0, 3000) * 4;
      tx_msg.data[0] = 4;
      tx_msg.data[3] = (obd_rpm >> 8) & 0xFF;
      tx_msg.data[4] = obd_rpm & 0xFF;
      break;
    }
    case 0x04: { // LOAD (0 - 100%)
      int valLoad = readFilteredADC(PIN_LOAD, 1);
      tx_msg.data[0] = 3;
      tx_msg.data[3] = map(valLoad, 0, 4095, 0, 255);
      break;
    }
    case 0x05: { // ENG TEMP (0 - 120°C)
      int valEng = readFilteredADC(PIN_ENG_TMP, 2);
      tx_msg.data[0] = 3;
      tx_msg.data[3] = map(valEng, 0, 4095, 0, 120) + 40;
      break;
    }
    case 0x0B: { // MAP BOOST (0 - 255 kPa)
      int valMap = readFilteredADC(PIN_MAP, 3);
      tx_msg.data[0] = 3;
      tx_msg.data[3] = map(valMap, 0, 4095, 0, 255);
      break;
    }
    case 0x0D: { // SPEED (0 - 60 KM/H)
      int valSpeed = readFilteredADC(PIN_SPEED, 4);
      tx_msg.data[0] = 3;
      tx_msg.data[3] = map(valSpeed, 0, 4095, 0, 60);
      break;
    }
    case 0x42: { // VOLTAGE (0V - 35.0V)
      int valVolt = readFilteredADC(PIN_VOLT, 5);
      uint16_t volt_mv = map(valVolt, 0, 4095, 0, 35000);
      tx_msg.data[0] = 4;
      tx_msg.data[3] = (volt_mv >> 8) & 0xFF;
      tx_msg.data[4] = volt_mv & 0xFF;
      break;
    }
    default:
      return;
  }
  twai_transmit(&tx_msg, pdMS_TO_TICKS(10));
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

  initTWAI();
  lastRxFromNode2 = millis();
  Serial.println("ECU Simulator CAT 950L Aktif.");
}

// ------------------------------------------------------------------------------
// LOOP UTAMA
// ------------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // 1. Terima request 0x7DF dari Node 2 & balas 0x7E8 seketika (Persis ProgramFinalNode1)
  twai_message_t rx_msg;
  while (twai_receive(&rx_msg, 0) == ESP_OK) {
    lastRxFromNode2 = now;
    if (!rx_msg.extd && rx_msg.identifier == 0x7DF && rx_msg.data[1] == 0x01) {
      sendOBDResponse(rx_msg.data[2]);
    }
  }

  // 2. WATCHDOG TWAI CAN OTOMATIS:
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
