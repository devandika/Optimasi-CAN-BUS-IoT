# Ekosistem Simulator & IoT Telemetri CAN-Bus Caterpillar 950L

> **Judul Proyek Awal:**  
> *"Rancang Bangun Simulator Dual-Node CAN-Bus ECU Caterpillar 950L Berbasis ESP32, Transceiver SN65HVD230, dan Gateway ELM327 Menggunakan Pengendali Tampilan TFT ILI9488 Terintegrasi."*
>
> **Pengembangan Terkini (IoT & Heavy Duty Standard):**  
> *"Sistem Telemetri Alat Berat Caterpillar 950L Berbasis Standar SAE J1939 (29-bit CAN), Arsitektur 3-Node ESP32 Dual-Core, Gateway Cloud MQTT.h (QoS 1), EMQX Cloud, dan Dashboard Industri Next.js PWA (Vercel & Supabase)."*

---

## 📚 Dokumen Spesifikasi & Rujukan Cepat
* 🔌 [**`GPIO.md`**](GPIO.md) — Panduan lengkap alokasi pin GPIO untuk ketiga node ESP32 dan pengkabelan periferal.
* 🛠️ [**`Techstack.md`**](Techstack.md) — Rincian teknologi perangkat keras, protokol bus, broker EMQX, dan stack web app.
* 📋 [**`PRD.md`**](PRD.md) — Product Requirements Document lengkap dengan batasan lingkup dan klausul proteksi kode.

---

## 🏗️ Dua Varian Sistem dalam Repositori

Proyek ini mempertahankan integritas kode lama sekaligus menyediakan implementasi modern:

### 1. Sistem Warisan (Legacy OBD-II 2-Node):
* [`ProgramFinalNode1.ino`](ProgramFinalNode1.ino) — ECU Simulator (Menjawab query PID OBD-II `0x7DF` dengan `0x7E8`).
* [`ProgramFinalNode2Revision.ino`](ProgramFinalNode2Revision.ino) — Display Hub & Gateway Serial ELM327 USB (38400 baud) untuk software OBD Auto Doctor.

### 2. Sistem Pengembangan Baru (SAE J1939 3-Node IoT Ecosystem):
* [`Node1_ECU_J1939.ino`](Node1_ECU_J1939.ino) — **ECU Simulator:** Membaca 6 potensiometer analog dan menyiarkan frame CAN 29-bit SAE J1939 secara periodik (*broadcast periodik tanpa polling delay*).
* [`Node2_Display_Hub.ino`](Node2_Display_Hub.ino) — **Display Hub Dual-Core:** 
  - **Core 0:** Penerimaan frame J1939 instan (0 ms latensi) via TWAI dan stream serial UART2 ke Node 3.
  - **Core 1:** Animasi *loading intro screen* saat boot, render antarmuka grafis TFT 3.5" ILI9488 bebas kedip (*Anti-Flicker* via `setTextPadding` & *differential segment*), dan kontrol Active Buzzer 5V Hi-Z.
* [`Node3_IoT_Gateway.ino`](Node3_IoT_Gateway.ino) — **IoT Gateway Dual-Core:**
  - **Core 0:** Manajemen koneksi Wi-Fi (WiFiManager / STA) dan klien **`MQTT.h`** mengunggah data dengan jaminan **QoS 1** ke **EMQX Cloud**.
  - **Core 1:** Ingestion data UART2 dari Node 2 dan parsing payload JSON.
* [`dashboard-pwa/`](dashboard-pwa/) — **Dashboard Web App PWA (Next.js):**
  - Antarmuka industrial dark mode khas Caterpillar (`#FFCD00`).
  - Koneksi langsung *MQTT over WebSockets (WSS)* ke EMQX Cloud untuk jarum/bar meter *real-time* nol latensi.
  - PWA *installable* di smartphone/laptop dengan kapabilitas *auto-update*.
  - Riwayat telemetri dan log alarm terhubung ke **Supabase** (PostgreSQL).

---

## 📊 Pemetaan Parameter SAE J1939 (Caterpillar 950L)

| Parameter Mesin | PGN J1939 | SPN | Skala / Resolusi | Ambang Normal | Peringatan (Warning) | Bahaya (Critical Alarm) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Engine Speed** | `61444 (0xF004)` | **190** | 0.125 rpm/bit (0 - 3000 RPM) | < 2200 RPM | $\ge$ 2200 RPM | $\ge$ 2400 RPM |
| **Engine Load** | `61443 (0xF003)` | **92** | 1 %/bit (0 - 100 %) | < 95 % | $\ge$ 95 % | $\ge$ 100 % |
| **Coolant Temp** | `65262 (0xFEEE)` | **110** | 1 °C/bit, offset -40°C (0 - 120 °C) | 71 - 104 °C | $\ge$ 105 °C (Cold: <71°C) | $\ge$ 108 °C |
| **MAP Boost** | `65270 (0xFEF6)` | **102** | 2 kPa/bit (0 - 255 kPa) | < 165 kPa | $\ge$ 165 kPa | $\ge$ 200 kPa |
| **Vehicle Speed**| `65265 (0xFEF1)` | **84** | 1/256 km/h (0 - 60 km/h) | < 39 km/h | $\ge$ 39 km/h | $\ge$ 42 km/h |
| **System Voltage**| `65271 (0xFEF7)`| **168** | 0.05 V/bit (0.0 - 35.0 V) | 23.0 - 29.4 V | < 23.0V / $\ge$ 29.5V | < 18.0V / $\ge$ 32.0V |

---

## 🔔 Logika Alarm & Audio Buzzer (GPIO 13)
- **Normal (State 1 & 0):** Buzzer mati total via mode *High-Impedance (Hi-Z)* pada pinout Active-LOW.
- **Peringatan / Warning (State 2):** Ikon `!` oranye menyala, buzzer berbunyi putus-putus (*intermittent beep*) setiap 500 ms sinkron dengan layar.
- **Bahaya / Alarm Kritis (State 3):** Ikon `!` berkedip merah/hitam, buzzer berbunyi panjang tanpa putus (*continuous tone*).

---

## 🚀 Panduan Menjalankan Sistem IoT

### 1. Menyiapkan Hardware (ESP 1, ESP 2, ESP 3)
1. Sambungkan kabel sesuai dokumen [**`GPIO.md`**](GPIO.md).
2. Hubungkan jalur bus CAN (`CAN_H` dan `CAN_L`) antara Node 1 dan Node 2.
3. Hubungkan pin `GPIO 17 (TX2)` Node 2 ke `GPIO 16 (RX2)` Node 3, serta satukan seluruh jalur **GND**.
4. Upload:
   - `Node1_ECU_J1939.ino` ke ESP 1.
   - `Node2_Display_Hub.ino` ke ESP 2 (pastikan library `TFT_eSPI` terpasang).
   - `Node3_IoT_Gateway.ino` ke ESP 3 (pastikan library `MQTT` by 256dpi, `WiFiManager`, dan `ArduinoJson` terpasang).
5. Pada ESP 3, hubungkan ponsel/laptop ke Wi-Fi AP **`CAT950L-Gateway-AP`** (Password: `caterpillar950l`) untuk memasukkan nama Wi-Fi dan password internet Anda.

### 2. Pembaruan Firmware Nirkabel (Dual-Mode Wi-Fi OTA)
Ketiga node telah dilengkapi sistem Wi-Fi OTA ganda (ArduinoOTA + WebOTA) tanpa mengganggu fungsionalitas utama:
* **Mode 1 - Arduino IDE Network Port (ArduinoOTA):**
  - Hubungkan laptop ke jaringan Wi-Fi / Hotspot yang sama dengan node.
  - Di Arduino IDE, pilih menu **Tools -> Port -> Network Ports**:
    - `CAT950L-Node1-ECU at 192.168.x.x`
    - `CAT950L-Node2-Display at 192.168.x.x`
    - `CAT950L-Node3-Gateway at 192.168.x.x`
  - Klik tombol **Upload** untuk flash firmware langsung melalui Wi-Fi.
* **Mode 2 - Web Browser OTA (WebOTA):**
  - Buka browser (Chrome/Edge di PC atau HP) ke alamat:
    - Node 1: `http://CAT950L-Node1-ECU.local` atau `http://<IP_NODE_1>`
    - Node 2: `http://CAT950L-Node2-Display.local` atau `http://<IP_NODE_2>`
    - Node 3: `http://CAT950L-Node3-Gateway.local` atau `http://<IP_NODE_3>`
  - Unggah file biner hasil kompilasi (`.bin` dari menu *Sketch -> Export Compiled Binary*) dan klik **Flash Firmware**.

### 3. Menjalankan Dashboard Web App PWA (`dashboard-pwa`)
1. Masuk ke folder aplikasi web:
   ```bash
   cd dashboard-pwa
   npm install
   ```
2. Jalankan server lokal:
   ```bash
   npm run dev
   ```
3. Buka browser di `http://localhost:3000`.
4. Klik tombol **"INSTALL APP"** di pojok kanan atas untuk memasang aplikasi langsung ke layar utama laptop/ponsel Anda.
5. Untuk menghubungkan ke database Supabase, salin `.env.example` menjadi `.env.local` dan masukkan kunci API Supabase Anda.
