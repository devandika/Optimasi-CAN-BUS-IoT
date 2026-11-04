/**
 * ==============================================================================
 * PROJEK : Simulator Dual-Node CAN-Bus ECU Caterpillar 950L (IoT Enhanced)
 * MODUL  : Node 3 - IoT Gateway (UART to MQTT QoS 1)
 * PROTOKOL: Wi-Fi STA + WiFiManager + MQTT.h (QoS 1) + EMQX Cloud
 * HARDWARE: ESP32 DevKit V1 (FreeRTOS Dual-Core)
 * INTERFACE: UART2 (RX2: GPIO 16, TX2: GPIO 17) dari ESP 2
 * ==============================================================================
 */

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
// KONFIGURASI PIN & PERIFERAL
// ------------------------------------------------------------------------------
#define UART2_RX 16      // Terhubung ke TX2 (GPIO 17) pada ESP 2
#define UART2_TX 17      // Terhubung ke RX2 (GPIO 16) pada ESP 2
#define PIN_STATUS_LED 2 // Onboard Blue LED ESP32

// ------------------------------------------------------------------------------
// KONFIGURASI MQTT BROKER (EMQX CLOUD)
// ------------------------------------------------------------------------------
// Silakan ganti placeholder berikut dengan kredensial EMQX Cloud Anda:
const char *mqtt_host =
    "broker.emqx.io";             // Atau host EMQX Cloud: "[EMQX_BROKER_HOST]"
const int mqtt_port = 1883;       // Port TCP standar (atau 8883 untuk TLS)
const char *mqtt_user = "emqx";   // Kredensial autentikasi EMQX
const char *mqtt_pass = "public"; // Password EMQX
const char *mqtt_client_id = "ESP32_CAT950L_Gateway";

// TOPIK MQTT
const char *TOPIC_TELEMETRY = "cat950l/telemetry";
const char *TOPIC_ALERTS = "cat950l/alerts";
const char *TOPIC_STATUS = "cat950l/status";

// ------------------------------------------------------------------------------
// OBJEK JARINGAN & MQTT
// ------------------------------------------------------------------------------
WiFiClient netClient;
MQTTClient mqttClient(1024); // Buffer payload hingga 1024 byte

// ------------------------------------------------------------------------------
// STRUKTUR DATA INTER-CORE QUEUE
// ------------------------------------------------------------------------------
struct IngestedTelemetry {
  char jsonString[256];
  uint8_t state;
};

QueueHandle_t telemetryQueue;

// ------------------------------------------------------------------------------
// FUNGSI KONEKSI MQTT DENGAN LAST WILL AND TESTAMENT (LWT)
// ------------------------------------------------------------------------------
void connectMQTT() {
  Serial.print("[MQTT] Menghubungkan ke EMQX Broker: ");
  Serial.println(mqtt_host);

  // Pasang Last Will and Testament (LWT) pada topik status (QoS 1, Retained
  // true)
  mqttClient.setWill(TOPIC_STATUS,
                     "{\"status\":\"offline\",\"device\":\"CAT950L-Gateway\"}",
                     true, 1);

  while (!mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
    Serial.print(".");
    digitalWrite(
        PIN_STATUS_LED,
        !digitalRead(PIN_STATUS_LED)); // Kedip cepat saat mencoba konek
    delay(1000);
  }

  Serial.println("\n[MQTT] Terhubung Berhasil ke EMQX Cloud!");
  digitalWrite(PIN_STATUS_LED, HIGH); // LED solid menandakan online

  // Publikasikan status ONLINE dengan QoS 1 & Retained true
  mqttClient.publish(TOPIC_STATUS,
                     "{\"status\":\"online\",\"device\":\"CAT950L-Gateway\"}",
                     true, 1);
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

  // 4. Cetak laporan lengkap status Wi-Fi ke Serial Monitor
  Serial.println("\n=======================================================");
  Serial.println("  [WIFI] STATUS: BERHASIL TERHUBUNG KE WI-FI ANDA!");
  Serial.println("  -----------------------------------------------------");
  Serial.printf ("  Nama Wi-Fi (SSID) : %s\n", WiFi.SSID().c_str());
  Serial.printf ("  IP Address ESP32  : %s\n", WiFi.localIP().toString().c_str());
  Serial.printf ("  Subnet Mask       : %s\n", WiFi.subnetMask().toString().c_str());
  Serial.printf ("  Gateway Router IP : %s\n", WiFi.gatewayIP().toString().c_str());
  Serial.printf ("  Kekuatan Sinyal   : %d dBm\n", WiFi.RSSI());
  Serial.println("=======================================================\n");

  // Inisialisasi Sistem OTA setelah WiFi Terkoneksi
  setupOTA();
  otaInitialized = true;

  // Konfigurasi Klien MQTT.h
  mqttClient.begin(mqtt_host, mqtt_port, netClient);
  mqttClient.setKeepAlive(15);

  connectMQTT();

  IngestedTelemetry packet;

  while (true) {
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
      connectMQTT();
    }

    // Ambil paket telemetri TERBARU dari antrean Core 1 (kuras paket lama jika ada antrean)
    if (xQueueReceive(telemetryQueue, &packet, pdMS_TO_TICKS(10)) == pdTRUE) {
      IngestedTelemetry newerPacket;
      while (xQueueReceive(telemetryQueue, &newerPacket, 0) == pdTRUE) {
        packet = newerPacket;
      }

      // 1. Publikasikan data telemetri berkala dengan JAMINAN QOS 1
      bool pubSuccess =
          mqttClient.publish(TOPIC_TELEMETRY, packet.jsonString, false, 1);

      if (pubSuccess) {
        Serial.printf("[MQTT QoS 1] Telemetri terkirim: %s\n",
                      packet.jsonString);
      } else {
        Serial.println("[MQTT QoS 1] Gagal mem-publish telemetri.");
      }

      // 2. Jika status mesin adalah WARNING (2) atau ALARM FAILURE (3), kirim
      // ke topik alert
      if (packet.state == 2 || packet.state == 3) {
        char alertMsg[128];
        snprintf(alertMsg, sizeof(alertMsg),
                 "{\"event\":\"%s\",\"raw\":%s,\"ts\":%lu}",
                 (packet.state == 3) ? "CRITICAL_ALARM" : "WARNING_ALERT",
                 packet.jsonString, millis());

        mqttClient.publish(TOPIC_ALERTS, alertMsg, false, 1);
        Serial.printf("[MQTT QoS 1 ALERT] Alert Terkirim: %s\n", alertMsg);
      }
    }

    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ------------------------------------------------------------------------------
// TASK CORE 1: UART2 SERIAL INGESTION DARI ESP 2 (PRIORITAS NORMAL)
// ------------------------------------------------------------------------------
void serialIngestionTask(void *pvParameters) {
  Serial2.begin(115200, SERIAL_8N1, UART2_RX, UART2_TX);
  String buffer = "";

  while (true) {
    while (Serial2.available()) {
      char c = Serial2.read();
      if (c == '\n') {
        buffer.trim();
        if (buffer.length() > 0 && buffer.startsWith("{") &&
            buffer.endsWith("}")) {
          // Parse JSON validasi format data
          StaticJsonDocument<256> doc;
          DeserializationError err = deserializeJson(doc, buffer);

          if (!err) {
            IngestedTelemetry item;
            strncpy(item.jsonString, buffer.c_str(),
                    sizeof(item.jsonString) - 1);
            item.jsonString[sizeof(item.jsonString) - 1] = '\0';
            item.state = doc["st"] | 1;

            // Masukkan ke Queue untuk diteruskan ke Core 0 (timpa data terlama jika antrean penuh)
            if (xQueueSend(telemetryQueue, &item, 0) != pdTRUE) {
              IngestedTelemetry dropped;
              xQueueReceive(telemetryQueue, &dropped, 0);
              xQueueSend(telemetryQueue, &item, 0);
            }
          } else {
            Serial.print("[UART2] JSON Parsing Error: ");
            Serial.println(err.c_str());
          }
        }
        buffer = "";
      } else {
        buffer += c;
      }
    }

    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

// ------------------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  delay(200);
  Serial.println("\n=======================================================");
  Serial.println("  ESP32 NODE 3: IOT GATEWAY TO EMQX CLOUD (MQTT.H)");
  Serial.println("  CATERPILLAR 950L CAN-BUS TELEMETRY ECOSYSTEM");
  Serial.println("=======================================================");

  // Buat antrean antar-core (Queue kapasitas 10 paket)
  telemetryQueue = xQueueCreate(10, sizeof(IngestedTelemetry));

  // 1. Task Jaringan & MQTT pada CORE 0
  xTaskCreatePinnedToCore(mqttNetworkTask, "MQTT_Network_Task", 8192, NULL, 2,
                          NULL,
                          0 // PINNED TO CORE 0
  );

  // 2. Task Ingestion UART2 pada CORE 1
  xTaskCreatePinnedToCore(serialIngestionTask, "Serial_Ingestion_Task", 4096,
                          NULL, 2, NULL,
                          1 // PINNED TO CORE 1
  );
}

// ------------------------------------------------------------------------------
// LOOP UTAMA (TIDAK DIPAKAI KARENA TUGAS BERJALAN PADA FREERTOS TASKS)
// ------------------------------------------------------------------------------
void loop() { vTaskDelay(pdMS_TO_TICKS(1000)); }
