# Product Requirements Document (PRD)
## Sistem IoT Telemetri Alat Berat Caterpillar 950L Berbasis SAE J1939, Multi-Node ESP32, MQTT QoS 1, & Next.js PWA

---

> ### ⚠️ KLAUSUL MUTLAK ANTI-MENGACAK KODE (SCOPE BOUNDARY & CODE ISOLATION)
> **"Jika ada perubahan yang diminta oleh user di kemudian hari, FOKUS HANYA PADA HAL TERSEBUT. Jangan pernah mengutak-atik, mengubah, mengganti, atau MENGHAPUS file/fungsi/kode yang tidak berhubungan dengan perubahan yang diminta!"**  
> File lama warisan ([`ProgramFinalNode1.ino`](file:///d:/Semester%205/CBL%20IoT%20X%20Kontrol%20Elektronik/ProgramFinalNode1.ino) dan [`ProgramFinalNode2Revision.ino`](file:///d:/Semester%205/CBL%20IoT%20X%20Kontrol%20Elektronik/ProgramFinalNode2Revision.ino)) **DILINDUNGI PENUH** sebagai acuan historis dan **TIDAK BOLEH DIUBAH/DIHAPUS**. Seluruh implementasi baru ditulis pada file baru terisolasi.

---

## 1. Deskripsi & Tujuan Produk
Produk ini adalah sistem pemantauan telemetri terintegrasi untuk alat berat **Caterpillar 950L Wheel Loader**. Sistem bertransformasi dari simulator bus lokal lama (OBD-II 11-bit) menjadi ekosistem IoT standar industri alat berat sesungguhnya (**SAE J1939 29-bit CAN**), didukung oleh arsitektur **3-Node ESP32** pemroses ganda (FreeRTOS dual-core), gateway cloud terproteksi dengan jaminan pesan **MQTT QoS 1** (`MQTT.h`), serta aplikasi web dashboard **Next.js PWA** yang dapat diinstal langsung dan berjalan real-time via Vercel dan Supabase.

---

## 2. User Persona & Alur Pengguna (User Flow)
1. **Operator Lapangan (Heavy Equipment Operator):**
   - Mengamati instrumen kabin fisik secara real-time melalui layar TFT 3.5" ILI9488 pada Node 2.
   - Menerima umpan balik audio segera melalui Active Buzzer 5V saat parameter mendekati limit kritis.
2. **Supervisor / Fleet Manager & Maintenance Engineer:**
   - Membuka Dashboard PWA pada ponsel atau laptop (bisa diinstal sebagai native-like app di layar beranda).
   - Melihat visual gauge dan status operasional real-time tanpa latensi via WebSocket WSS (EMQX Cloud).
   - Menganalisis riwayat kegagalan mesin (*fault log*) dan histori data sensor yang tercatat di Supabase.

---

## 3. Fitur Utama & Kriteria Penerimaan (Acceptance Criteria)

### A. Node 1: ECU Simulator Caterpillar 950L (`Node1_ECU_J1939.ino`)
* **Input:** 6 Potensiometer 10k pada ADC1 ESP32 (GPIO 32, 33, 34, 35, 25, 26).
* **Protokol:** SAE J1939 (CAN 2.0B 29-bit Extended Frame, baudrate 250 kbps / 500 kbps).
* **Broadcast PGN:**
  - PGN 61444 (`0xF004` - EEC1): Engine RPM (SPN 190, 0.125 rpm/bit) - Broadcast setiap 20-50 ms.
  - PGN 61443 (`0xF003` - EEC2): Engine Load (SPN 92, 1%/bit) - Broadcast setiap 50 ms.
  - PGN 65262 (`0xFEEE` - ET1): Coolant Temp (SPN 110, offset -40°C) - Broadcast setiap 1000 ms.
  - PGN 65270 (`0xFEF6` - IC1): MAP Boost (SPN 102, 2 kPa/bit) - Broadcast setiap 100 ms.
  - PGN 65265 (`0xFEF1` - CCVS): Vehicle Speed (SPN 84, 1/256 km/h) - Broadcast setiap 100 ms.
  - PGN 65271 (`0xFEF7` - VEP1): System Voltage (SPN 168, 0.05 V/bit) - Broadcast setiap 1000 ms.
* **Kriteria Selesai:** Frame CAN 29-bit tersiar konsisten pada bus diferensial SN65HVD230 tanpa frame error.

### B. Node 2: Display Hub, Alarm, & Forwarder (`Node2_Display_Hub.ino`)
* **CAN Ingestion:** Menerima frame SAE J1939 via TWAI (GPIO 21 TX, GPIO 22 RX).
* **Instrument Display:** Layar TFT 3.5" ILI9488 via SPI (`TFT_eSPI`) dengan layout tabel dinamis dan grafik stair-bar 20 segmen.
* **Audio Warning:** Active Buzzer 5V (GPIO 13) dengan logika Tri-State Hi-Z (Mati total pada mode Normal, Intermiten pada mode Warning, dan Kontinu pada mode Critical Alarm).
* **Inter-ESP Forwarder:** Meneruskan data hasil parsing J1939 ke Node 3 melalui Hardware UART2 (GPIO 17 TX2 $\rightarrow$ Node 3 RX2) dengan format JSON ringkas dan aman.
* **Kriteria Selesai:** Tampilan TFT mulus 60 FPS tanpa kedipan/flicker, alarm akurat merespons state mesin, dan stream serial UART2 terkirim kontinu.

### C. Node 3: IoT Gateway CAN-to-MQTT (`Node3_IoT_Gateway.ino`)
* **Dual-Core FreeRTOS Partitioning:**
  - **Core 0:** Stack TCP/IP Wi-Fi, WiFiManager portal, koneksi TLS/MQTTS ke EMQX Cloud, dan auto-reconnect.
  - **Core 1:** UART2 stream listener dari Node 2, parsing payload JSON, and packaging buffer.
* **WiFi Provisioning:**
  - Terintegrasi dengan **WiFiManager** (menyediakan Captive Portal AP jika WiFi belum terkonfigurasi).
  - Mode **STA (Station)** otomatis menyambung ke jaringan tersimpan.
* **MQTT Client Stack:**
  - **Wajib menggunakan library `#include <MQTT.h>`** (`256dpi/arduino-mqtt`). Dilarang menggunakan PubSubClient.
  - **Jaminan Pengiriman:** Menggunakan **QoS 1** (memerlukan konfirmasi PUBACK).
  - Topik MQTT: `cat950l/telemetry` (data periodik), `cat950l/alerts` (notifikasi anomali/failure), `cat950l/status` (LWT online/offline).
* **Kriteria Selesai:** ESP32 Node 3 mem-publish data telemetri ke EMQX Cloud dengan QoS 1 tanpa membuat thread UART kehilangan paket data.

### D. Web App PWA Dashboard (`/dashboard-pwa`)
* **Tech Stack:** Next.js (App Router, TypeScript, React 19), Tailwind CSS.
* **PWA & Auto-Update:**
  - Manifest PWA lengkap (`manifest.json`, icon, theme color, display standalone).
  - Service Worker dengan mekanisme *Stale-While-Revalidate* dan deteksi pembaruan otomatis saat kode baru dideploy ke Vercel.
* **Dual Pipeline Telemetri:**
  - **Realtime (Live Visuals):** Direct WSS connection ke EMQX Cloud (MQTT over WebSockets) untuk menggerakkan indikator visual (Gauges, Level Bar, Status Lamp) dengan latensi sub-detik.
  - **Persistence (Database):** Supabase (PostgreSQL) menyimpan tabel riwayat `telemetry_history` dan `alarm_logs` untuk audit maintenance alat berat.
* **Deployment:** Konfigurasi siap deploy ke **Vercel** (`vercel.json` / Next.js edge-ready).

---

## 4. Spesifikasi Desain Antarmuka (UI/UX Ergonomics — Modern & Simple Glassmorphism)
Merujuk pada prinsip *Apple Design System* (`apple-design`, `liquid-glass-design`), *Anti-AI Slop* (`antislop` Mode 1 - DURING, `hallmark`), dan *UI Polish* (`make-interfaces-feel-better`):

* **Tema Visual Adaptif (Default Light Mode Frosted Glass + Dark Mode Toggle):**
  - **Light Mode (Default — Clean Frosted Daylight Glass):**
    - Background Utama: *Warm Silver Alabaster* (`#EEF2F6` dengan *ambient radial light* lembut `#E2E8F0` / `#FEF3C7` tipis).
    - Permukaan Kaca (*Glass Surface*): `rgba(255, 255, 255, 0.72)` dengan `backdrop-filter: blur(20px) saturate(180%)`, border 4-sisi seragam `rgba(255, 255, 255, 0.88)`, *specular top highlight*, dan bayangan lembut `0 8px 30px rgba(15, 23, 42, 0.06)`.
    - Teks Utama: Deep Slate Ink (`#0F172A`), Teks Sekunder: Slate Muted (`#475569`).
  - **Dark Mode (Toggle — Deep Obsidian Translucent Glass):**
    - Background Utama: *Deep Obsidian Slate* (`#090D14` dengan bias cahaya halus tanpa grid kotak-kotak).
    - Permukaan Kaca (*Glass Surface*): `rgba(255, 255, 255, 0.05)` dengan `backdrop-filter: blur(20px) saturate(180%)`, border 4-sisi `rgba(255, 255, 255, 0.09)`, dan *inner specular highlight*.
    - Teks Utama: Crisp Alabaster (`#F8FAFC`), Teks Sekunder: Cool Slate (`#94A3B8`).
  - **Warna Status Fungsional:** Normal/Optimal (`#10B981` / `#059669`), Warning (`#F59E0B` / `#D97706`), Critical (`#EF4444` / `#DC2626`), Cold (`#0EA5E9` / `#0284C7`), dan Aksen Caterpillar (`#FFCD00` / `#D97706`).

* **Hierarki Layout & Instrumen Lingkaran (Anti Copy-Paste 6 Kotak Identik):**
  - **Baris 1 (2 Hero Primary Cards):** Menampilkan **Engine Speed (RPM)** dan **Coolant Temp (°C)** dalam ukuran kartu besar (2 kolom utama) dengan indikator **Circular Arc Gauge** presisi tinggi yang telah dioptimalkan (track kaca halus, penanda ambang *warn/crit* bersih tanpa pendaran neon norak) dan angka *Jumbo Readout* di bagian tengah/samping.
  - **Baris 2 (4 Secondary Cards):** Menampilkan **Engine Load (%)**, **Intake MAP (kPa)**, **Vehicle Speed (km/h)**, dan **Battery Voltage (V)** dalam 4 kolom proporsional dengan **Circular Arc Gauge** ringkas yang dioptimalkan serta angka bacaan yang tetap besar dan tegas.
  - **Panel Konfigurasi Broker MQTT (Dioptimalkan):** Drawer/Modal kaca *frosted* untuk memilih/mengatur broker (Preset EMQX Public atau Custom EMQX Cloud WSS) dengan form ber-validasi dan tombol **Simpan & Hubungkan** eksplisit (mencegah *reconnect storm* saat mengetik).

* **Standar Tipografi Proporsional & Anti-Font Kerdil (Wajib — Penekanan Angka Besar):**
  - **Hero Digital Readout (RPM & Temp):** `48px – 56px` (`font-extrabold`, `tabular-nums`, `tracking-tight`).
  - **Secondary Digital Readout (Load, MAP, Speed, Volt):** `36px – 42px` (`font-bold`, `tabular-nums`, `tracking-tight`).
  - **Nilai Tabel J1939:** `18px – 20px` (`font-bold`, `tabular-nums`).
  - **Judul Seksi & Header:** H1 (`24px – 28px`), H2/Section (`18px – 20px`), Nama Parameter (`15px – 16px`, `font-semibold`).
  - **Body Text, Input Form, & Tombol:** Minimal `14px – 15px` dengan *hit-area* minimal `44x44px`.
  - **Badge / Status Chip / Satuan Unit:** Minimal `12px – 13px` (`font-semibold`). Dilarang keras menggunakan ukuran `< 12px` (`text-[9px]`, `text-[10px]`, `text-[11px]` dihapus total).

* **Aturan Anti-AI Slop & Keamanan (`security-review` & `security-audit`):**
  - Bebas dari *background grid*, *1-sided left border* (`border-l`), karakter *em-dash* (`—`), dan *pill-shape* serampangan pada kartu/input.
  - Validasi ketat input broker (hostname/port), sanitasi & *clamping* payload JSON MQTT, proteksi rate-limit & validasi skema pada endpoint `/api/telemetry`, serta penerapan *HTTP Security Headers* pada Next.js.

---

## 5. Struktur Direktori Proyek

```
d:\Semester 5\CBL IoT X Kontrol Elektronik\
├── .gitignore
├── README.md                          # Dokumentasi umum & panduan perakitan
├── PRD.md                             # Dokumen kebutuhan produk & boundary isolasi
├── Techstack.md                       # Spesifikasi teknologi & arsitektur sistem
├── Arsitektur jaringan.png            # Diagram arsitektur lama
├── Wiring diagram.jpeg                # Skematik pengkabelan lama
├── ProgramFinalNode1.ino              # [PROTECTED] Kode warisan Node 1 OBD-II
├── ProgramFinalNode2Revision.ino      # [PROTECTED] Kode warisan Node 2 OBD-II
├── Node1_ECU_J1939.ino                # [BARU] Kode Node 1 SAE J1939 Broadcast
├── Node2_Display_Hub.ino              # [BARU] Kode Node 2 TFT Hub & UART Forwarder
├── Node3_IoT_Gateway.ino              # [BARU] Kode Node 3 WiFi, MQTT.h QoS 1, Dual-Core
└── dashboard-pwa/                     # [BARU] Aplikasi Web Next.js PWA
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── public/
    │   ├── manifest.json
    │   └── icons/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   └── api/telemetry/route.ts
    │   ├── components/
    │   │   ├── GaugeCard.tsx
    │   │   ├── ParameterTable.tsx
    │   │   ├── AlertBanner.tsx
    │   │   └── ConnectionStatus.tsx
    │   └── lib/
    │       ├── mqttClient.ts
    │       └── supabaseClient.ts
    └── supabase/
        └── schema.sql
```
