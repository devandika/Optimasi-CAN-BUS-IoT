/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node SAE J1939 ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 3 - IoT Gateway (SAE J1939 CAN Bus to MQTT QoS 1)
 * PROTOKOL: SAE J1939 (CAN 2.0B 29-bit Extended @ 500 kbps) + Wi-Fi STA +
 *           WiFiManager + MQTT.h (QoS 1) + EMQX Cloud
 * HARDWARE: ESP32 DevKit V1 (FreeRTOS Dual-Core) + Transceiver CAN SN65HVD230
 * INTERFACE: TWAI CAN Bus (CTX: GPIO 21, CRX: GPIO 22) paralel ke CAN_H & CAN_L
 * ==============================================================================
 */

#include "driver/twai.h"
#include <ArduinoJson.h>
#include <MQTT.h> // Library Resmi: 256dpi/arduino-mqtt (Bukan PubSubClient)
#include <WiFi.h>
#include <WiFiManager.h>
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
const char *ota_hostname = "CAT950L-Node3-Gateway"; // Hostname unik mDNS Node 3

WebServer otaServer(80);
bool otaInitialized = false;

// ------------------------------------------------------------------------------
// KONFIGURASI PIN & PERIFERAL TWAI CAN BUS (SN65HVD230)
// ------------------------------------------------------------------------------
#define CAN_TX_PIN     21 // Terhubung ke CTX / TXD Modul Transceiver SN65HVD230 Node 3
#define CAN_RX_PIN     22 // Terhubung ke CRX / RXD Modul Transceiver SN65HVD230 Node 3
#define PIN_STATUS_LED 2  // Onboard Blue LED ESP32

// ------------------------------------------------------------------------------
// DEFINISI PARAMETER GROUP NUMBER (PGN) PROTOKOL SAE J1939
// ------------------------------------------------------------------------------
#define PGN_REQUEST  59904 // 0xEA00 - SAE J1939 Request PGN
#define PGN_EEC1     61444 // 0xF004 - Electronic Engine Controller 1 (RPM, SPN 190)
#define PGN_EEC2     61443 // 0xF003 - Electronic Engine Controller 2 (Engine Load, SPN 92)
#define PGN_ET1      65262 // 0xFEEE - Engine Temperature 1 (Coolant Temp, SPN 110)
#define PGN_IC1      65270 // 0xFEF6 - Intake/Exhaust Conditions 1 (MAP Boost, SPN 102)
#define PGN_CCVS     65265 // 0xFEF1 - Cruise Control / Vehicle Speed (Ground Speed, SPN 84)
#define PGN_VEP1     65271 // 0xFEF7 - Vehicle Electrical Power 1 (System Voltage, SPN 168)
#define PGN_GW_STAT  65280 // 0xFF00 - Proprietary B Gateway Status Broadcast
#define PGN_GW_NET   65281 // 0xFF01 - Proprietary B Gateway IPv4 & 32-bit TX Count
#define PGN_GW_SSID  65282 // 0xFF02 - Proprietary B Gateway Wi-Fi SSID (Chunked)

#define SOURCE_ADDR_ENGINE  0x00 // Source Address Engine #1 SAE J1939
#define SOURCE_ADDR_GATEWAY 0x27 // Source Address Gateway/Telematics SAE J1939

// ------------------------------------------------------------------------------
// KONFIGURASI MQTT BROKER (EMQX CLOUD)
// ------------------------------------------------------------------------------
const char *mqtt_host = "broker.emqx.io"; // Atau host EMQX Cloud: "[EMQX_BROKER_HOST]"
const int mqtt_port = 1883;               // Port TCP standar (atau 8883 untuk TLS)
const char *mqtt_user = "emqx";           // Kredensial autentikasi EMQX
const char *mqtt_pass = "public";         // Password EMQX
const char *mqtt_client_id = "ESP32_CAT950L_Gateway";

// TOPIK MQTT
const char *TOPIC_TELEMETRY = "cat950l/telemetry";
const char *TOPIC_ALERTS    = "cat950l/alerts";
const char *TOPIC_STATUS    = "cat950l/status";

// ------------------------------------------------------------------------------
// OBJEK JARINGAN & MQTT
// ------------------------------------------------------------------------------
WiFiClient netClient;
MQTTClient mqttClient(1024); // Buffer payload hingga 1024 byte

// ------------------------------------------------------------------------------
// STRUKTUR DATA INTER-CORE QUEUE
// ------------------------------------------------------------------------------
uint32_t makeJ1939Id(uint8_t priority, uint32_t pgn, uint8_t sourceAddress) {
  return ((uint32_t)(priority & 0x07) << 26) |
         ((uint32_t)(pgn & 0x3FFFF) << 8) |
         ((uint32_t)(sourceAddress & 0xFF));
}

struct IngestedTelemetry {
  char jsonString[256];
  uint8_t state;
};

struct GatewayStatusSnapshot {
  bool wifiConnected;
  bool mqttConnected;
  int8_t rssi;
  uint8_t ip[4];
  uint32_t txCount;
  char ssid[29];

  void transmitStat() const {
    twai_message_t tx_msg = {};
    tx_msg.identifier = makeJ1939Id(6, PGN_GW_STAT, SOURCE_ADDR_GATEWAY);
    tx_msg.extd = 1;
    tx_msg.rtr = 0;
    tx_msg.data_length_code = 8;

    int rssiClamped = (rssi < -100) ? -100 : (rssi > 0 ? 0 : rssi);
    tx_msg.data[0] = wifiConnected ? 1 : 0;
    tx_msg.data[1] = mqttConnected ? 1 : 0;
    tx_msg.data[2] = (uint8_t)(rssiClamped + 100);
    tx_msg.data[3] = (uint8_t)(txCount & 0xFF);
    tx_msg.data[4] = (uint8_t)((txCount >> 8) & 0xFF);
    tx_msg.data[5] = ip[2];
    tx_msg.data[6] = ip[3];
    tx_msg.data[7] = (uint8_t)((txCount >> 16) & 0xFF);
    twai_transmit(&tx_msg, pdMS_TO_TICKS(2));
  }

  void transmitNet() const {
    twai_message_t tx_msg = {};
    tx_msg.identifier = makeJ1939Id(6, PGN_GW_NET, SOURCE_ADDR_GATEWAY);
    tx_msg.extd = 1;
    tx_msg.rtr = 0;
    tx_msg.data_length_code = 8;

    tx_msg.data[0] = ip[0];
    tx_msg.data[1] = ip[1];
    tx_msg.data[2] = ip[2];
    tx_msg.data[3] = ip[3];
    tx_msg.data[4] = (uint8_t)(txCount & 0xFF);
    tx_msg.data[5] = (uint8_t)((txCount >> 8) & 0xFF);
    tx_msg.data[6] = (uint8_t)((txCount >> 16) & 0xFF);
    tx_msg.data[7] = (uint8_t)((txCount >> 24) & 0xFF);
    twai_transmit(&tx_msg, pdMS_TO_TICKS(2));
  }

  void transmitSsid() const {
    size_t len = strnlen(ssid, sizeof(ssid) - 1);
    uint8_t totalChunks = (len == 0) ? 1 : (uint8_t)((len + 6) / 7);
    if (totalChunks > 4) totalChunks = 4;

    for (uint8_t chunk = 0; chunk < totalChunks; chunk++) {
      twai_message_t tx_msg = {};
      tx_msg.identifier = makeJ1939Id(6, PGN_GW_SSID, SOURCE_ADDR_GATEWAY);
      tx_msg.extd = 1;
      tx_msg.rtr = 0;
      tx_msg.data_length_code = 8;
      tx_msg.data[0] = (uint8_t)((totalChunks << 4) | (chunk & 0x0F));
      for (uint8_t j = 0; j < 7; j++) {
        size_t idx = (size_t)chunk * 7 + j;
        tx_msg.data[1 + j] = (idx < len) ? (uint8_t)ssid[idx] : 0;
      }
      twai_transmit(&tx_msg, pdMS_TO_TICKS(2));
    }
  }
};

QueueHandle_t telemetryQueue;
volatile uint32_t totalTelemetrySent = 0;

portMUX_TYPE gwStatusMux = portMUX_INITIALIZER_UNLOCKED;
GatewayStatusSnapshot gwStatus = {false, false, -100, {0, 0, 0, 0}, 0, ""};

void updateGatewaySnapshot(bool mqttConn) {
  bool wifiConn = (WiFi.status() == WL_CONNECTED);
  int8_t rssiVal = wifiConn ? (int8_t)constrain(WiFi.RSSI(), -100, 0) : -100;
  IPAddress localIp = wifiConn ? WiFi.localIP() : IPAddress(0, 0, 0, 0);
  String ssidStr = wifiConn ? WiFi.SSID() : String("");

  GatewayStatusSnapshot next = {};
  next.wifiConnected = wifiConn;
  next.mqttConnected = wifiConn && mqttConn;
  next.rssi = rssiVal;
  for (int i = 0; i < 4; i++) {
    next.ip[i] = localIp[i];
  }
  next.txCount = totalTelemetrySent;
  strncpy(next.ssid, ssidStr.c_str(), sizeof(next.ssid) - 1);
  next.ssid[sizeof(next.ssid) - 1] = '\0';

  portENTER_CRITICAL(&gwStatusMux);
  gwStatus = next;
  portEXIT_CRITICAL(&gwStatusMux);
}

bool broadcastGatewayStatus(bool sendNet, bool sendSsid) {
  GatewayStatusSnapshot copy;
  portENTER_CRITICAL(&gwStatusMux);
  copy = gwStatus;
  portEXIT_CRITICAL(&gwStatusMux);

  copy.transmitStat();
  if (sendNet) {
    copy.transmitNet();
  }
  if (sendSsid && copy.wifiConnected) {
    copy.transmitSsid();
  }
  return copy.wifiConnected;
}

// ------------------------------------------------------------------------------
// FUNGSI INISIALISASI & RESET DRIVER TWAI CAN BUS
// ------------------------------------------------------------------------------
void initTWAI() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(
      (gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  g_config.tx_queue_len = 10;
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

// ------------------------------------------------------------------------------
// AUTONOMOUS REQUEST PGN SAE J1939 (FALLBACK JIKA NODE 2 TIDAK AKTIF)
// ------------------------------------------------------------------------------
void requestJ1939PGN(uint32_t targetPgn) {
  twai_message_t tx_msg = {};
  tx_msg.identifier = makeJ1939Id(6, PGN_REQUEST, SOURCE_ADDR_GATEWAY);
  tx_msg.extd = 1;
  tx_msg.rtr = 0;
  tx_msg.data_length_code = 8;
  tx_msg.data[0] = (uint8_t)(targetPgn & 0xFF);
  tx_msg.data[1] = (uint8_t)((targetPgn >> 8) & 0xFF);
  tx_msg.data[2] = (uint8_t)((targetPgn >> 16) & 0xFF);
  for (int i = 3; i < 8; i++) {
    tx_msg.data[i] = 0xFF;
  }
  twai_transmit(&tx_msg, pdMS_TO_TICKS(5));
}

// ------------------------------------------------------------------------------
// EVALUASI KONDISI PARAMETER TELEMETRI
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

// ------------------------------------------------------------------------------
// FUNGSI KONEKSI MQTT DENGAN LAST WILL AND TESTAMENT (LWT)
// ------------------------------------------------------------------------------
void connectMQTT() {
  Serial.print("[MQTT] Menghubungkan ke EMQX Broker: ");
  Serial.println(mqtt_host);

  // Pasang Last Will and Testament (LWT) pada topik status (QoS 1, Retained true)
  mqttClient.setWill(TOPIC_STATUS,
                     "{\"status\":\"offline\",\"device\":\"CAT950L-Gateway\"}",
                     true, 1);

  updateGatewaySnapshot(false);
  unsigned long lastWifiReconnect = 0;

  while (WiFi.status() != WL_CONNECTED ||
         !mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
    Serial.print(".");
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED)); // Kedip cepat saat mencoba konek
    unsigned long nowRetry = millis();
    if (WiFi.status() != WL_CONNECTED && (nowRetry - lastWifiReconnect >= 10000)) {
      lastWifiReconnect = nowRetry;
      WiFi.reconnect();
    }
    updateGatewaySnapshot(false);
    if (otaInitialized) {
      ArduinoOTA.handle();
      otaServer.handleClient();
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }

  Serial.println("\n[MQTT] Terhubung Berhasil ke EMQX Cloud!");
  digitalWrite(PIN_STATUS_LED, HIGH); // LED solid menandakan online

  // Publikasikan status ONLINE dengan QoS 1 & Retained true
  mqttClient.publish(TOPIC_STATUS,
                     "{\"status\":\"online\",\"device\":\"CAT950L-Gateway\"}",
                     true, 1);
  updateGatewaySnapshot(true);
}

// ------------------------------------------------------------------------------
// INISIALISASI SISTEM WIFI OTA (ARDUINOTA & WEB OTA)
// ------------------------------------------------------------------------------
void setupOTA() {
  if (MDNS.begin(ota_hostname)) {
    Serial.printf("[OTA] mDNS responder aktif: http://%s.local\n", ota_hostname);
  }

  // Konfigurasi ArduinoOTA (Port default 3232)
  ArduinoOTA.setHostname(ota_hostname);

  ArduinoOTA.onStart([]() {
    digitalWrite(PIN_STATUS_LED, LOW);
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch/firmware" : "filesystem";
    Serial.println("\n[ArduinoOTA] Mulai flashing " + type + "...");
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\n[ArduinoOTA] Selesai! Me-restart ESP32...");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[ArduinoOTA] Progres: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[ArduinoOTA] Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Gagal");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Gagal");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Gagal");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Gagal");
    else if (error == OTA_END_ERROR) Serial.println("End Gagal");
  });

  ArduinoOTA.begin();

  // Konfigurasi Web OTA Dashboard (Port 80 via Browser)
  otaServer.on("/", HTTP_GET, []() {
    otaServer.sendHeader("Connection", "close");
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>CAT 950L Node 3 OTA</title>"
                  "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                  "<style>"
                  "body{font-family:Segoe UI,Roboto,sans-serif;background:#121212;color:#eee;text-align:center;padding:20px;margin:0;}"
                  ".card{background:#1e1e1e;max-width:440px;margin:40px auto;padding:28px;border-radius:12px;border:1px solid #333;box-shadow:0 8px 24px rgba(0,0,0,0.5);}"
                  "h2{color:#FFCD00;margin-top:0;font-size:22px;letter-spacing:0.5px;}"
                  "p{color:#aaa;font-size:14px;line-height:1.5;}"
                  ".badge{background:#2a2a2a;padding:6px 12px;border-radius:6px;display:inline-block;color:#FFCD00;font-family:monospace;font-size:13px;border:1px solid #444;}"
                  "input[type=file]{margin:20px 0;width:100%;color:#ccc;font-size:13px;}"
                  "input[type=submit]{background:#FFCD00;color:#121212;border:none;padding:12px 24px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:15px;width:100%;transition:0.2s;}"
                  "input[type=submit]:hover{background:#e5b800;}"
                  "</style></head><body><div class='card'>"
                  "<h2>CAT 950L FIRMWARE UPDATE</h2>"
                  "<p><span class='badge'>Node 3: IoT Gateway CAN-to-MQTT</span></p>"
                  "<p>IP Address: " + WiFi.localIP().toString() + "</p>"
                  "<p>CAN Bus: 500 kbps (SN65HVD230)</p>"
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
      Serial.printf("[WebOTA] Update file: %s\n", upload.filename.c_str());
      digitalWrite(PIN_STATUS_LED, LOW);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("[WebOTA] Update Selesai: %u bytes. Restarting...\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  otaServer.begin();
  MDNS.addService("http", "tcp", 80);
  Serial.println("[OTA] ArduinoOTA & Web OTA Server Siap!");
  Serial.printf("[OTA] Akses Web OTA: http://%s.local atau http://%s\n", ota_hostname, WiFi.localIP().toString().c_str());
}

// ------------------------------------------------------------------------------
// TASK CORE 0: WIFI MANAGER & MQTT NETWORK ENGINE (PRIORITAS TINGGI)
// ------------------------------------------------------------------------------
void mqttNetworkTask(void *pvParameters) {
  // Pastikan mode Wi-Fi aktif sebagai Station (STA)
  WiFi.mode(WIFI_STA);

  // Inisialisasi WiFiManager (Captive Portal jika belum ada WiFi tersimpan)
  WiFiManager wm;

  // 1. Fitur Reset: Tahan tombol BOOT (GPIO 0) saat menyalakan ESP32 jika ingin menghapus Wi-Fi lama
  pinMode(0, INPUT_PULLUP);
  if (digitalRead(0) == LOW) {
    Serial.println("\n[WIFI] Tombol BOOT terdeteksi! Menghapus memori Wi-Fi lama...");
    wm.resetSettings();
    delay(500);
  }

  // 2. Set batas waktu: Jika Wi-Fi lama tidak terhubung dalam 8 detik, LANGSUNG buka Hotspot!
  wm.setConnectTimeout(8);
  wm.setConfigPortalTimeout(180); // Timeout 3 menit jika portal tidak diisi

  // 3. Callback saat ESP32 membuka Hotspot Konfigurasi sementara
  wm.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n=======================================================");
    Serial.println("  [WIFI] Wi-Fi lama tidak ditemukan / Sinyal tidak terjangkau.");
    Serial.println("  [WIFI] Hotspot Konfigurasi Sementara KINI AKTIF!");
    Serial.println("  -----------------------------------------------------");
    Serial.println("  >> 1. Buka HP Anda, cari & hubungkan ke Wi-Fi : \"CAT950L-Gateway-AP\"");
    Serial.println("  >> 2. Hotspot ini TERBUKA (Tanpa Password).");
    Serial.println("  >> 3. Buka browser dan akses alamat           : http://192.168.4.1");
    Serial.println("  >> 4. Klik 'Configure WiFi', pilih Wi-Fi Anda & masukkan Password.");
    Serial.println("=======================================================\n");
  });

  // 4. Callback saat kredensial Wi-Fi baru selesai disimpan
  wm.setSaveConfigCallback([]() {
    Serial.println("\n[WIFI] Kredensial baru diterima! Menyimpan ke Flash ESP32 & menghubungkan...");
  });

  // 5. Jalankan AutoConnect tanpa password AP agar langsung bisa diklik di HP
  Serial.println("[WIFI] Memeriksa koneksi Wi-Fi tersimpan (timeout 8 detik)...");
  if (!wm.autoConnect("CAT950L-Gateway-AP")) {
    Serial.println("[WIFI] Gagal terhubung ke Wi-Fi dan waktu portal habis (timeout). Me-restart ESP32...");
    ESP.restart();
  }

  // Cetak laporan lengkap status Wi-Fi ke Serial Monitor
  Serial.println("\n=======================================================");
  Serial.println("  [WIFI] STATUS: BERHASIL TERHUBUNG KE WI-FI ANDA!");
  Serial.println("  -----------------------------------------------------");
  Serial.printf ("  Nama Wi-Fi (SSID) : %s\n", WiFi.SSID().c_str());
  Serial.printf ("  IP Address ESP32  : %s\n", WiFi.localIP().toString().c_str());
  Serial.printf ("  Subnet Mask       : %s\n", WiFi.subnetMask().toString().c_str());
  Serial.printf ("  Gateway Router IP : %s\n", WiFi.gatewayIP().toString().c_str());
  Serial.printf ("  Kekuatan Sinyal   : %d dBm\n", WiFi.RSSI());
  Serial.println("=======================================================");

  // Inisialisasi Sistem OTA setelah WiFi Terkoneksi
  setupOTA();
  otaInitialized = true;
  updateGatewaySnapshot(false);

  // Konfigurasi Klien MQTT.h
  mqttClient.begin(mqtt_host, mqtt_port, netClient);
  mqttClient.setKeepAlive(15);

  connectMQTT();

  IngestedTelemetry packet;
  unsigned long lastSnapshotRefresh = 0;

  while (true) {
    unsigned long nowNet = millis();

    // Pertahankan loop MQTT
    mqttClient.loop();

    // Penanganan Sistem WiFi OTA (ArduinoOTA & Web OTA)
    if (otaInitialized) {
      ArduinoOTA.handle();
      otaServer.handleClient();
    }

    // Auto-reconnect jika koneksi terputus
    if (!mqttClient.connected()) {
      Serial.println("[MQTT] Terputus! Melakukan rekoneksi...");
      digitalWrite(PIN_STATUS_LED, LOW);
      updateGatewaySnapshot(false);
      connectMQTT();
    }

    // Ambil paket telemetri TERBARU dari antrean Core 1 (kuras paket lama jika ada antrean)
    if (xQueueReceive(telemetryQueue, &packet, pdMS_TO_TICKS(10)) == pdTRUE) {
      IngestedTelemetry newerPacket;
      while (xQueueReceive(telemetryQueue, &newerPacket, 0) == pdTRUE) {
        packet = newerPacket;
      }

      // 1. Publikasikan data telemetri berkala dengan JAMINAN QOS 1
      bool pubSuccess = mqttClient.publish(TOPIC_TELEMETRY, packet.jsonString, false, 1);

      if (pubSuccess) {
        totalTelemetrySent++;
        updateGatewaySnapshot(true);
        Serial.printf("[MQTT QoS 1] Telemetri terkirim (%lu): %s\n",
                      (unsigned long)totalTelemetrySent, packet.jsonString);
      } else {
        Serial.println("[MQTT QoS 1] Gagal mem-publish telemetri.");
      }

      // 2. Jika status mesin adalah WARNING (2) atau ALARM FAILURE (3), kirim ke topik alert
      if (packet.state == 2 || packet.state == 3) {
        char alertMsg[320];
        snprintf(alertMsg, sizeof(alertMsg),
                 "{\"event\":\"%s\",\"raw\":%s,\"ts\":%lu}",
                 (packet.state == 3) ? "CRITICAL_ALARM" : "WARNING_ALERT",
                 packet.jsonString, millis());

        mqttClient.publish(TOPIC_ALERTS, alertMsg, false, 1);
        Serial.printf("[MQTT QoS 1 ALERT] Alert Terkirim: %s\n", alertMsg);
      }
    }

    if (nowNet - lastSnapshotRefresh >= 250) {
      lastSnapshotRefresh = nowNet;
      updateGatewaySnapshot(mqttClient.connected());
    }

    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ------------------------------------------------------------------------------
// TASK CORE 1: TWAI CAN BUS INGESTION DARI CAN_H & CAN_L (SN65HVD230)
// ------------------------------------------------------------------------------
void canIngestionTask(void *pvParameters) {
  const uint32_t j1939Pgns[6] = {PGN_EEC1, PGN_EEC2, PGN_ET1, PGN_IC1, PGN_CCVS, PGN_VEP1};
  uint8_t pgnIndex = 0;

  uint16_t cur_rpm = 0;
  uint8_t cur_load = 0;
  uint8_t cur_temp = 0;
  uint8_t cur_map = 0;
  uint8_t cur_speed = 0;
  float cur_volt = 0.0f;

  bool hasReceivedCan = false;
  unsigned long lastCanRxTime = 0;
  unsigned long lastForwardTime = 0;
  unsigned long lastRequestTime = 0;
  unsigned long lastWatchdogCheck = 0;
  unsigned long lastGwStatTx = 0;
  unsigned long lastGwNetTx = 0;
  unsigned long lastGwSsidTx = 0;
  bool ssidSentOnConnect = false;

  while (true) {
    unsigned long now = millis();

    // 1. Terima dan decode frame SAE J1939 dari bus CAN fisik (CAN_H & CAN_L)
    twai_message_t rx_msg;
    while (twai_receive(&rx_msg, 0) == ESP_OK) {
      if (!rx_msg.extd) continue;

      uint32_t pgn = (rx_msg.identifier >> 8) & 0x3FFFF;
      uint8_t pf = (rx_msg.identifier >> 16) & 0xFF;
      if (pf < 240) {
        pgn &= 0x3FF00;
      }

      if (pgn == PGN_REQUEST && rx_msg.data_length_code >= 3) {
        uint32_t reqPgn = (uint32_t)rx_msg.data[0] |
                          ((uint32_t)rx_msg.data[1] << 8) |
                          ((uint32_t)rx_msg.data[2] << 16);
        if (reqPgn == PGN_GW_STAT || reqPgn == PGN_GW_NET || reqPgn == PGN_GW_SSID) {
          broadcastGatewayStatus(true, true);
        }
        continue;
      }

      if (rx_msg.data_length_code >= 8) {
        switch (pgn) {
          case PGN_EEC1: { // 61444 (0xF004) - Engine Speed (SPN 190: 0.125 rpm/bit)
            uint16_t raw_j_rpm = (uint16_t)rx_msg.data[3] | ((uint16_t)rx_msg.data[4] << 8);
            cur_rpm = raw_j_rpm / 8;
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          case PGN_EEC2: { // 61443 (0xF003) - Engine Load (SPN 92: 1 %/bit)
            cur_load = (rx_msg.data[2] > 100) ? 100 : rx_msg.data[2];
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          case PGN_ET1: { // 65262 (0xFEEE) - Coolant Temp (SPN 110: 1 C/bit, offset -40 C)
            cur_temp = (rx_msg.data[0] >= 40) ? (rx_msg.data[0] - 40) : 0;
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          case PGN_IC1: { // 65270 (0xFEF6) - MAP Boost (SPN 102: 2 kPa/bit)
            uint16_t boost_kpa = (uint16_t)rx_msg.data[1] * 2;
            cur_map = (boost_kpa > 255) ? 255 : (uint8_t)boost_kpa;
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          case PGN_CCVS: { // 65265 (0xFEF1) - Vehicle Speed (SPN 84: 1/256 km/h/bit)
            uint16_t raw_spd = (uint16_t)rx_msg.data[1] | ((uint16_t)rx_msg.data[2] << 8);
            cur_speed = raw_spd / 256;
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          case PGN_VEP1: { // 65271 (0xFEF7) - System Voltage (SPN 168: 0.05 V/bit)
            uint16_t raw_v = (uint16_t)rx_msg.data[4] | ((uint16_t)rx_msg.data[5] << 8);
            cur_volt = raw_v * 0.05f;
            hasReceivedCan = true;
            lastCanRxTime = now;
            break;
          }
          default:
            break;
        }
      }
    }

    // 1b. Siarkan status IoT Gateway Node 3 ke Node 2 Display via bus CAN
    if (now - lastGwStatTx >= 500) {
      lastGwStatTx = now;
      bool sendNet = (now - lastGwNetTx >= 1000);
      bool sendSsid = (!ssidSentOnConnect) || (now - lastGwSsidTx >= 2000);
      bool wifiUp = broadcastGatewayStatus(sendNet, sendSsid);
      if (sendNet) lastGwNetTx = now;
      if (wifiUp && sendSsid) {
        lastGwSsidTx = now;
        ssidSentOnConnect = true;
      } else if (!wifiUp) {
        ssidSentOnConnect = false;
      }
    }

    // 2. Autonomous Polling: Jika Node 2 Display tidak mengirim request (misal Node 2 off),
    //    Node 3 mengirimkan request PGN secara mandiri setiap 40 ms ke bus CAN
    if ((now - lastCanRxTime > 250) && (now - lastRequestTime >= 40)) {
      requestJ1939PGN(j1939Pgns[pgnIndex]);
      pgnIndex = (pgnIndex + 1) % 6;
      lastRequestTime = now;
    }

    // 3. Kemas telemetri JSON secara periodik (setiap 200 ms jika ada data CAN)
    if (hasReceivedCan && (now - lastForwardTime >= 200)) {
      lastForwardTime = now;

      uint8_t st_rpm   = getNormalState(cur_rpm, 2200, 2400);
      uint8_t st_load  = getNormalState(cur_load, 95, 100);
      uint8_t st_temp  = getTempState(cur_temp, 71, 105, 108);
      uint8_t st_map   = getNormalState(cur_map, 165, 200);
      uint8_t st_speed = getNormalState(cur_speed, 39, 42);
      uint8_t st_volt  = getVoltState(cur_volt);

      bool alarm_red = (st_rpm == 3 || st_load == 3 || st_temp == 3 ||
                        st_map == 3 || st_speed == 3 || st_volt == 3);
      bool warning_orange = (!alarm_red) && (st_rpm == 2 || st_load == 2 ||
                             st_temp == 2 || st_map == 2 || st_speed == 2 || st_volt == 2);

      uint8_t globalState = 1;
      if (alarm_red) {
        globalState = 3;
      } else if (warning_orange) {
        globalState = 2;
      } else if (st_temp == 0) {
        globalState = 0;
      }

      IngestedTelemetry item;
      snprintf(item.jsonString, sizeof(item.jsonString),
               "{\"rpm\":%d,\"load\":%d,\"temp\":%d,\"map\":%d,\"spd\":%d,\"volt\":%.1f,\"st\":%d}",
               cur_rpm, cur_load, cur_temp, cur_map, cur_speed, cur_volt, globalState);
      item.state = globalState;

      // Masukkan ke Queue untuk dikirim oleh Core 0 via MQTT QoS 1
      if (xQueueSend(telemetryQueue, &item, 0) != pdTRUE) {
        IngestedTelemetry dropped;
        xQueueReceive(telemetryQueue, &dropped, 0); // Buang data terlama
        xQueueSend(telemetryQueue, &item, 0);       // Masukkan data terbaru
      }
    }

    // 4. Watchdog TWAI CAN: Pulihkan driver jika ada gangguan bus
    if (now - lastWatchdogCheck >= 250) {
      lastWatchdogCheck = now;
      twai_status_info_t status;
      if (twai_get_status_info(&status) == ESP_OK) {
        bool busError = (status.state != TWAI_STATE_RUNNING) ||
                        (status.tx_error_counter > 64) ||
                        (status.rx_error_counter > 64);
        bool rxTimeout = hasReceivedCan && (now - lastCanRxTime > 800);

        if (busError || rxTimeout) {
          resetTWAI();
          lastCanRxTime = now;
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ------------------------------------------------------------------------------
// SETUP UTAMA
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Inisialisasi Driver TWAI CAN Bus (SN65HVD230)
  initTWAI();

  delay(200);
  Serial.println("\n=======================================================");
  Serial.println("  ESP32 NODE 3: IOT GATEWAY TO EMQX CLOUD (CAN BUS)");
  Serial.println("  CATERPILLAR 950L SAE J1939 TELEMETRY ECOSYSTEM");
  Serial.println("  HARDWARE: SN65HVD230 CAN BUS TRANSCEIVER (CAN_H & CAN_L)");
  Serial.println("=======================================================");

  // Buat antrean antar-core (Queue kapasitas 10 paket)
  telemetryQueue = xQueueCreate(10, sizeof(IngestedTelemetry));

  // 1. Task Jaringan & MQTT pada CORE 0
  xTaskCreatePinnedToCore(mqttNetworkTask, "MQTT_Network_Task", 8192, NULL, 2,
                          NULL, 0);

  // 2. Task Ingestion TWAI CAN pada CORE 1
  xTaskCreatePinnedToCore(canIngestionTask, "CAN_Ingestion_Task", 4096,
                          NULL, 2, NULL, 1);
}

// ------------------------------------------------------------------------------
// LOOP UTAMA (TIDAK DIPAKAI KARENA TUGAS BERJALAN PADA FREERTOS TASKS)
// ------------------------------------------------------------------------------
void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
