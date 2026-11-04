# Tech Stack & Arsitektur Sistem: Simulator CAN-Bus Caterpillar 950L IoT

> **Proyek:** Pengembangan Simulator Dual-Node CAN-Bus ECU Caterpillar 950L menjadi Sistem IoT Telemetri Multi-Node dengan Gateway MQTT dan Dashboard PWA.

---

## 1. Arsitektur Perangkat Keras (Embedded Hardware)

### Node 1: ECU Simulator (Caterpillar 950L Engine)
* **Mikrokontroler:** ESP32 DevKit V1 (Dual-Core Tensilica Xtensa 32-bit LX6 @ 240 MHz).
* **Transceiver CAN:** SN65HVD230 (Logika 3.3V, proteksi bus diferensial).
* **Sensor Emulasi:** 6x Potensiometer 10k $\Omega$ pada ADC 12-bit (RPM, Load, Temp, MAP Boost, Speed, Voltage).
* **Protokol:** **SAE J1939** (CAN 2.0B 29-bit Extended Frame, broadcast periodik).
* **Multitasking:** FreeRTOS Dual-Core (Core 1: ADC sampling & filter; Core 0: TWAI CAN frame packaging & broadcast).

### Node 2: Display Hub & Instrument Cluster
* **Mikrokontroler:** ESP32 DevKit V1 (Dual-Core @ 240 MHz).
* **Transceiver CAN:** SN65HVD230 (Menerima frame SAE J1939).
* **Display:** Layar TFT 3.5" ILI9488 (Resolusi 480x320 pixel, antarmuka Hardware SPI).
* **Library Display:** `TFT_eSPI` (dioptimasi untuk DMA/SPI kecepatan tinggi).
* **Indikator Audio:** Active Buzzer 5V (Kontrol Active-LOW via mode High-Z pada GPIO 13).
* **Inter-ESP Interface:** Hardware UART (Serial2: GPIO 16 RX2, GPIO 17 TX2) ke ESP 3.
* **Multitasking:** FreeRTOS Dual-Core (Core 1: Render grafis TFT & State Machine; Core 0: TWAI CAN Reception & Forwarding ke UART).

### Node 3: IoT Gateway (CAN to MQTT)
* **Mikrokontroler:** ESP32 DevKit V1 (Dual-Core @ 240 MHz).
* **Konektivitas:** Wi-Fi 802.11 b/g/n (2.4 GHz) WPA2/WPA3.
* **Library MQTT:** **`MQTT.h`** (`256dpi/arduino-mqtt`).
* **Jaminan Pengiriman:** **QoS 1** (*At Least Once Delivery* dengan PUBACK handshake).
* **Antarmuka Data Masuk:** Hardware UART (Serial2) dari ESP 2.
* **Multitasking:** FreeRTOS Dual-Core:
  * **Core 0 (Network & Cloud Engine):** WiFi client, secure TLS connection, MQTT stack, auto-reconnect, MQTT publish (QoS 1).
  * **Core 1 (Data Ingestion & Parser):** UART serial buffering, checksum validation, JSON payload serialization.

---

## 2. Jaringan & Protokol Komunikasi

| Lapisan | Protokol | Spesifikasi Teknis |
| :--- | :--- | :--- |
| **Fieldbus (Mesin)** | **SAE J1939** | CAN 2.0B, 29-bit Identifier, 250/500 kbps.<br>- PGN 61444 (EEC1): Engine RPM (SPN 190)<br>- PGN 61443 (EEC2): Engine Load (SPN 92)<br>- PGN 65262 (ET1): Coolant Temp (SPN 110)<br>- PGN 65270 (IC1): MAP Boost (SPN 102)<br>- PGN 65265 (CCVS): Vehicle Speed (SPN 84)<br>- PGN 65271 (VEP1): System Voltage (SPN 168) |
| **Inter-ESP Link** | **UART Serial2** | Baudrate 115200 / 230400 bps, payload terstruktur (JSON/Binary Frame) dengan validasi checksum. |
| **IoT Message Broker** | **MQTT over TLS/WSS** | **EMQX Cloud** (Managed Cloud Broker):<br>- Port 8883: MQTTS / TLS untuk ESP 3 (library `MQTT.h`)<br>- Port 8084: WSS (Secure WebSocket) untuk Web App PWA |
| **QoS Level** | **QoS 1** | Memastikan pesan telemetri dan notifikasi status kritis/failure tidak hilang di jaringan. |

---

## 3. Web App, Backend, & Cloud Stack

| Layer | Teknologi | Peran & Alasan Pemilihan |
| :--- | :--- | :--- |
| **Platform Deployment** | **Vercel** | Hosting global edge, serverless execution, fast CI/CD dari GitHub. |
| **Framework Web App** | **Next.js (App Router, TypeScript)** | Fullstack React modern (bukan PHP), type-safe, modular, dan terintegrasi mulus dengan Vercel. |
| **PWA Engine** | **`@ducanh2912/next-pwa` / Serwist** | Web App dapat diinstal di desktop/smartphone (*installable app*), offline fallback, manifest PWA, dan auto-update (*Service Worker Cache Invalidation*). |
| **Database** | **Supabase (PostgreSQL)** | Penyimpanan riwayat telemetri (*time-series logging*), histori alarm/failure mesin, dan konfigurasi threshold. |
| **Real-time Pipeline** | **Direct MQTT over WSS (Opsi B)** | Browser PWA terhubung langsung via Secure WebSockets ke EMQX Cloud untuk visualisasi gauge/grafik zero-latency, dipadukan dengan sinkronisasi periodik ke Supabase. |
| **UI Design System** | **Tailwind CSS + Lucide Icons + Canvas Gauges** | Desain industrial khas alat berat Caterpillar (CAT Yellow `#FFCD00`, Charcoal Black `#121212`), layout responsif, tipografi proporsional anti-font kerdil (mengadopsi filosofi *Apple Design System*). |

---

## 4. Topik MQTT (Topic Structure)

1. `cat950l/telemetry` $\rightarrow$ Payload data telemetri berkala (RPM, Load, Temp, MAP, Speed, Voltage, Timestamp, State).
2. `cat950l/alerts` $\rightarrow$ Payload khusus saat terjadi kondisi Warning (State 2) atau Critical Failure (State 3).
3. `cat950l/status` $\rightarrow$ Status gateway (Online/Offline) menggunakan fitur *Last Will and Testament* (LWT) MQTT.
