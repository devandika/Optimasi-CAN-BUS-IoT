# Dokumen Spesifikasi Usulan Pengembangan Proyek
**Projek:** Simulator Dual-Node SAE J1939 ECU Caterpillar 950L (IoT Enhanced)  
**Target Modul:** Node 1 (ECU J1939), Node 2 (Display Hub) & Node 3 (IoT Gateway)  
**Protokol Komunikasi Bus:** SAE J1939 (29-bit Extended Identifier @ 500 kbps)  
**Status Evaluasi:** Final Disetujui (Poin 1, 2, dan 4)

---

## 1. Ringkasan Perubahan Sistem
Mengubah panel instrumen Layar TFT 3.5" (ILI9488) pada **Node 2** menjadi **Digital Instrument Cluster Multi-Halaman** berbasis protokol alat berat **SAE J1939** terintegrasi:
1. **Navigasi 3 Tombol Fisik (Looping Carousel):** Navigasi putar `1 ➡️ 2 ➡️ 3 ➡️ 1` dan `3 ⬅️ 2 ⬅️ 1 ⬅️ 3` tanpa mentok.
2. **Arsitektur Layar Anti-Flicker:** Header statis di bagian atas (Y: 0–30) tidak pernah dihapus, hanya area Body (Y: 31–320) yang di-refresh saat ganti halaman.
3. **Indikator Lampu Virtual di Header:** 3 bulatan lingkaran (Merah, Kuning, Hijau) ditaruh di pojok paling kanan atas, dempet, tanpa teks sama sekali, dengan kontras warna terang (ON) vs gelap (OFF).
4. **Struktur 3 Halaman:**
   - **Halaman 1 (Default):** Gauge Cluster Telemetri Mesin (Tampilan saat ini).
   - **Halaman 2:** SAE J1939 Network Health & PGN Frame Monitor (Model B: Tabel tetap PGN/29-bit ID, angka Hex 8-byte & statistik live).
   - **Halaman 3:** Status IoT & Gateway (Wi-Fi, IP, status MQTT, RSSI dari ESP 3).
5. *(Catatan: Fitur Fault Code, Modul Relay/Aktuator, dan SD Card ditiadakan).*

---

## 2. Arsitektur Header Statis & Indikator Bulatan Virtual
* **Dimensi Header:** Lebar 480 px, Tinggi 30 px (Y = 0 s/d 30).
* **Posisi Indikator Bulatan:** Pojok kanan atas, saling dempet, **TANPA TEKS**:
  - Diameter bulatan: 12 px (Radius $r = 6$).
  - **(●) Hijau:** Pusat koordinat $(X = 425, Y = 15)$
  - **(●) Kuning:** Pusat koordinat $(X = 445, Y = 15)$
  - **(●) Merah:** Pusat koordinat $(X = 465, Y = 15)$

```text
+-------------------------------------------------------------------------------+ Y = 0
| [CAT 950L] CLUSTER [P1/3]                                 (●) (●) (●)         | HEADER
|                                                          HIJ KUN MER          | STATIS
+-------------------------------------------------------------------------------+ Y = 30
|                                                                               |
|                             KONTEN BODY DINAMIS                               | BODY DINAMIS
|                                                                               | (Y: 31 - 320)
+-------------------------------------------------------------------------------+ Y = 320
X = 0                                                                         X = 480
```

#### Palet Warna Kontras (Terang vs Gelap):
* **Lampu Hijau (Normal):**
  - *Menyala (ON):* `TFT_GREEN` (`0x07E0` - Hijau Terang)
  - *Mati (OFF):* `0x0200` (Hijau Tua Gelap)
* **Lampu Kuning (Caution/Waspada):**
  - *Menyala (ON):* `0xFDE0` (Amber/Kuning Hangat Lembut - tidak silau)
  - *Mati (OFF):* `0x3200` (Kuning-Cokelat Gelap)
  - *Animasi Kedip:* Kedipan santai bertempo lambat (interval **800 ms – 1000 ms**) agar nyaman dilihat.
* **Lampu Merah (Critical/Alarm/Stop):**
  - *Menyala (ON):* `TFT_RED` (`0xF800` - Merah Terang)
  - *Mati (OFF):* `0x3800` (Merah Marun Gelap)
  - *Animasi Kedip:* Berkedip cepat (interval **300 ms**) sinkron dengan Active Buzzer.

---

## 3. Perkiraan Tampilan Visual Setiap Halaman (Wireframe 480 x 320)

### A. Halaman 1: Gauge & Bar Cluster Telemetri Mesin (`[P1/3]`)
> **Prinsip Utama Halaman 1:**  
> Seluruh tampilan 6 baris sensor gauge & bar yang sudah berjalan saat ini **100% TETAP DAN TIDAK DIUBAH SAMA SEKALI** (koordinat baris $Y=30$ s/d $Y=294$, lebar kolom $VLINE_1, VLINE_2, VLINE_3$, pergerakan balok *stair bar*, font, dan ikon status tetap persis seperti kode sekarang).
>
> **Perubahan pada Halaman 1 HANYA DUA HAL:**
> 1. **Header Statis di atas ($Y: 0 - 30$):** Judul cluster ringkas dan 3 bulatan lampu virtual di pojok kanan atas.
> 2. **Footer Navigasi di bawah ($Y: 295 - 320$):** Menampilkan petunjuk navigasi tombol `[<] HAL 3 | [●] MUTE / UNMUTE BUZZER | [>] HAL 2` di ruang kosong paling bawah.

```text
+-------------------------------------------------------------------------------+ Y = 0
| CAT 950L CLUSTER [P1/3]                                           (●) (●) (●) | [TAMBAHAN] HEADER STATIS
+-------------------------------------------------------------------------------+ Y = 30
| RPM      |   1850 REV  | [■■■■■■■■■■■■■■■■□□□□]              |     [OK]       | Y = 74
|----------|-------------|-------------------------------------|----------------|
| ENG LOAD |     64 %    | [■■■■■■■■■■■■□□□□□□□□]              |     [OK]       | Y = 118
|----------|-------------|-------------------------------------|----------------|
| ENG TMP  |     88 C    | [■■■■■■■■■■■■■■□□□□□□]              |     [OK]       | Y = 162   [100% TETAP]
|----------|-------------|-------------------------------------|----------------|           Tampilan 6 Baris Sensor
| MAP BST  |    142 kPa  | [■■■■■■■■■■□□□□□□□□□□]              |     [OK]       | Y = 206   Bawaan Kode Asli
|----------|-------------|-------------------------------------|----------------|           (Tanpa Ubah Geometri)
| SPEED    |     32 KM/H | [■■■■■■■■□□□□□□□□□□□□]              |     [OK]       | Y = 250
|----------|-------------|-------------------------------------|----------------|
| SYS VOLT |   27.4 V    | [■■■■■■■■■■■■■■■■□□□□]              |     [OK]       | Y = 294
+-------------------------------------------------------------------------------+
| NAV: [<] HAL 3         |   [●] MUTE / UNMUTE BUZZER          |   [>] HAL 2    | [TAMBAHAN] FOOTER NAVIGASI
+-------------------------------------------------------------------------------+ Y = 320
X = 0      X = 100       X = 240                               X = 435        X = 480
```
* **Keterangan Area:**
  - $Y = 0 - 30$ : **[Tambahan]** Header Statis dengan 3 bulatan lampu virtual.
  - $Y = 30 - 294$: **[100% Asli]** 6 Baris Telemetri bawaan (`RPM`, `ENG LOAD`, `ENG TMP`, `MAP BST`, `SPEED`, `SYS VOLT`).
  - $Y = 295 - 320$: **[Tambahan]** Footer informasi tombol navigasi dan status mute buzzer.

---

### B. Halaman 2: SAE J1939 Network Health & Frame Monitor (`[P2/3]`)
*Menampilkan tabel data frame protokol SAE J1939 (29-bit Extended Identifier, PGN 61444, 61443, 65262, 65270, 65265, 65271) yang ter-update di tempat (Model B) dan status kesehatan bus 500 kbps.*

```text
+-------------------------------------------------------------------------------+ Y = 0
| CAT 950L J1939-MON [P2/3]                                         (●) (●) (●) | HEADER
+-------------------------------------------------------------------------------+ Y = 30
| PARAMETER     | PGN   | CAN ID     | PAYLOAD DATA (RAW HEX)  | RATE / STATUS  | Y = 50
|---------------|-------|------------|-------------------------|----------------|
| Engine Speed  | 61444 | 0CF00400   | FF FF FF D0 39 FF FF FF | 40 Hz [ACTIVE] | Y = 82
| Engine Load   | 61443 | 0CF00300   | FF FF 40 FF FF FF FF FF | 40 Hz [ACTIVE] | Y = 114
| Coolant Temp  | 65262 | 18FEEE00   | 80 FF FF FF FF FF FF FF | 40 Hz [ACTIVE] | Y = 146
| MAP Boost     | 65270 | 18FEF600   | FF 47 FF FF FF FF FF FF | 40 Hz [ACTIVE] | Y = 178
| Vehicle Speed | 65265 | 18FEF100   | FF 00 20 FF FF FF FF FF | 40 Hz [ACTIVE] | Y = 210
| System Volt   | 65271 | 18FEF700   | FF FF FF FF 24 02 FF FF | 40 Hz [ACTIVE] | Y = 242
+-------------------------------------------------------------------------------+
| TOTAL RX: 34,820 Frames  | ERRORS: 0 Frames  | BUS STATE: RUNNING (500 kbps)  | Y = 285
+-------------------------------------------------------------------------------+
| NAV: [<] HAL 1         |   [●] RESET PACKET COUNTER          |   [>] HAL 3    | Y = 320
+-------------------------------------------------------------------------------+
X = 0           X = 98  X = 144      X = 204                   X = 364        X = 480
```
* **Keterangan Area:**
  - Tabel bersifat tetap (*fixed position*), baris tidak bergeser naik-turun.
  - Kolom **PGN & CAN ID**: Menampilkan Parameter Group Number (PGN) standar SAE J1939 beserta 29-bit Extended Identifier (`0CF00400` s/d `18FEF700`, Source Address `0x00`).
  - Kolom **PAYLOAD DATA**: Menampilkan 8-byte Hex mentah SAE J1939 (byte tidak terpakai bernilai `0xFF`) yang langsung berubah saat potensio di Node 1 diputar.
  - Kolom **RATE / STATUS**: Menunjukkan frekuensi penerimaan paket PGN dari Node 1 secara *real-time*.
  - Baris **J1939 STATS**: Menghitung akumulasi total paket sejak alat dinyalakan.

---

### C. Halaman 3: Status IoT Gateway & Integrasi Cloud (`[P3/3]`)
*Menampilkan data kesehatan koneksi Wi-Fi, MQTT Broker (EMQX), dan alur transmisi ke Web Dashboard PWA yang diterima dari ESP 3.*

```text
+-------------------------------------------------------------------------------+ Y = 0
| CAT 950L IOT GATEWAY [P3/3]                                       (●) (●) (●) | HEADER
+-------------------------------------------------------------------------------+ Y = 30
| =================== NODE 3 - IOT GATEWAY & CLOUD LINK ===================== | Y = 48
|                                                                               |
| [ WI-FI CONNECTION ]                  [ MQTT CLOUD BROKER ]                   | Y = 70
| • SSID     : CAT950L_HOTSPOT          • Host   : broker.emqx.io               |
| • IP Addr  : 192.168.4.15             • Port   : 1883 (TCP)                   |
| • Sinyal   : -56 dBm (KUAT)           • Status : CONNECTED (QoS 1)            |
| • MAC Addr : 24:6F:28:XX:XX:XX        • Topik  : cat950l/telemetry            |
|                                                                               |
|-------------------------------------------------------------------------------| Y = 175
| [ THROUGHPUT & INTEGRASI WEB PWA ]                                            | Y = 195
| • CAN Bus Link (CAN_H & CAN_L)        : 500 kbps (CAN BUS ONLINE)             |
| • Total Telemetri Terunggah           : 1,845 Paket                           |
| • Interval Unggah Data                : ~1.0 Detik                            |
| • Web PWA & Supabase Sinkronisasi     : ONLINE & SYNCED                       |
+-------------------------------------------------------------------------------+ Y = 285
| NAV: [<] HAL 2         |   [●] FORCE REFRESH STATUS          |   [>] HAL 1    | Y = 320
+-------------------------------------------------------------------------------+
X = 0                                                                         X = 480
```
* **Keterangan Area:**
  - Menampilkan informasi komprehensif dua modul: **Wi-Fi Hotspot** dan **Koneksi Broker EMQX Cloud**.
  - Metrik *throughput* membuktikan kepada dosen bahwa alur data telemetri di bus fisik `CAN_H` & `CAN_L` hingga sampai ke Cloud PWA berjalan lancar dan terukur.

---

## 4. Spesifikasi Hardware Navigasi: 3 Tombol Fisik (Node 2)

Sistem menggunakan **3 Push Button Tactile** yang dipasang sejajar di bawah atau samping layar TFT 3.5":

```text
       [ < PREV ]                  [ ● OK / ACTION ]                  [ NEXT > ]
        (GPIO 14)                      (GPIO 32)                       (GPIO 27)
```

### Logika Navigasi Looping (Tanpa Mentok):
1. **Tombol NEXT (`GPIO 27`):**
   - Halaman `1 ➡️ 2 ➡️ 3 ➡️ 1 ➡️ 2 ...`
   - Logika: `currentPage = (currentPage % 3) + 1;`
2. **Tombol PREV (`GPIO 14`):**
   - Halaman `3 ⬅️ 2 ⬅️ 1 ⬅️ 3 ⬅️ 2 ...`
   - Logika: `currentPage = (currentPage == 1) ? 3 : currentPage - 1;`
3. **Tombol OK / ACTION (`GPIO 32`):**
   - **Di Halaman 1 (Gauge):** Mute / Unmute Buzzer (mematikan suara alarm saat demo).
   - **Di Halaman 2 (CAN):** Reset Counter (mengembalikan Total RX Frames & Error ke 0).
   - **Di Halaman 3 (IoT):** Force Refresh (meminta update status koneksi instan dari Node 3 via CAN PGN Request 65280).

*Rangkaian: Menggunakan `INPUT_PULLUP` internal ESP32 (kaki 1 ke GPIO, kaki 2 langsung ke Common GND).*

---

## 5. Pemetaan File & Baris Kode yang Perlu Diubah

### FILE 1: `Node2_Display_Hub\Node2_Display_Hub.ino`

| No | Bagian Kode | Estimasi Baris | Rencana Perubahan |
|---|---|---|---|
| 1 | **Definisi Pin Tombol & State Halaman** | **Baris 45 – 55** | • Tambahkan definisi pin tombol:<br>`#define PIN_BTN_PREV 14`<br>`#define PIN_BTN_OK 32`<br>`#define PIN_BTN_NEXT 27`<br>• Deklarasikan variabel global: `uint8_t currentPage = 1;`, `bool buzzerMuted = false;`, dan timer debouncing tombol. |
| 2 | **Geometri Header & Layout** | **Baris 64 – 75** | • Sesuaikan batas Y Header ke `Y_HEADER_HEIGHT = 30;`.<br>• Tentukan koordinat 3 lingkaran indikator: `LED_GREEN_X = 425`, `LED_YELLOW_X = 445`, `LED_RED_X = 465`, `LED_Y = 15`, `LED_R = 6`. |
| 3 | **Fungsi Gambar Lampu Virtual di Header** | **Baris 260 – 290** (fungsi render baru) | • Buat fungsi `renderVirtualIndicators(uint8_t overallState, bool blinkSlow, bool blinkFast)`:<br>- Menggambar 3 bulatan menggunakan `tft.fillCircle(...)`.<br>- Jika state = 1 (Normal): Hijau terang, Kuning gelap, Merah gelap.<br>- Jika state = 2 (Caution): Hijau gelap, Kuning terang/kedip santai (800ms), Merah gelap.<br>- Jika state = 3 (Alarm): Hijau gelap, Kuning gelap, Merah terang/kedip cepat (300ms). |
| 4 | **Fungsi Gambar Tiap Halaman (Body Dinamis)** | **Baris 380 – 500** | • Pecah fungsi tampilan menjadi:<br>  - `drawPage1_Gauges()`: Memuat grid dan bar telemetri mesin yang sudah ada.<br>  - `drawPage2_CANHealth()`: Menampilkan tabel statis PGN 61444, 61443, 65262, 65270, 65265, 65271, raw hex, update rate Hz, dan total paket diterima.<br>  - `drawPage3_IoTStatus()`: Menampilkan status WiFi SSID, IP, RSSI, status koneksi MQTT Broker, dan total paket terunggah.<br>• Buat fungsi transisi: `switchPage(uint8_t targetPage)` yang hanya membersihkan area body: `tft.fillRect(0, 31, 480, 289, TFT_BLACK)`. |
| 5 | **Inisialisasi Setup Hardware** | **Baris 942 – 975** (`setup()`) | • Inisialisasi pin tombol: `pinMode(PIN_BTN_PREV, INPUT_PULLUP);`, `pinMode(PIN_BTN_OK, INPUT_PULLUP);`, `pinMode(PIN_BTN_NEXT, INPUT_PULLUP);`.<br>• Gambar teks header ringkas: `"CAT 950L CLUSTER [P1/3]"` pada koordinat `(10, 8)` agar tidak menabrak 3 bulatan LED di kanan. |
| 6 | **Penanganan Tombol & Serial di Loop** | **Baris 1014 – 1055** (`loop()`) | • Tambahkan pemanggilan `handleNavigationButtons()` untuk membaca klik tombol dengan debouncing 50ms dan logika looping `1 ➡️ 2 ➡️ 3 ➡️ 1`.<br>• Tambahkan pembacaan `Serial2` untuk menerima paket JSON status dari ESP 3 dan menyimpannya ke variabel status IoT. |

---

### FILE 2: `Node3_IoT_Gateway\Node3_IoT_Gateway.ino`

| No | Bagian Kode | Estimasi Baris | Rencana Perubahan |
|---|---|---|---|
| 1 | **Transceiver CAN Bus SN65HVD230 (TWAI)** | **Baris 30 – 85** | • Ganti UART2 dengan driver TWAI CAN ESP32:<br>`#define CAN_TX_PIN 21`<br>`#define CAN_RX_PIN 22`<br>• Inisialisasi bus CAN 500 kbps: `initTWAI()`, auto-reset watchdog: `resetTWAI()`. |
| 2 | **CAN Ingestion & J1939 Decoder di Core 1** | **Baris 240 – 330** | • Task `canIngestionTask` menerima frame SAE J1939 29-bit langsung dari `CAN_H` & `CAN_L`.<br>• Decode PGN EEC1 (RPM), EEC2 (Load), ET1 (Temp), IC1 (MAP), CCVS (Speed), VEP1 (Volt).<br>• Hitung health state (0: Cold, 1: Normal, 2: Warning, 3: Alarm) dan kemas JSON telemetri ke Queue FreeRTOS.<br>• Fitur Autonomous Request: jika bus sepi >250ms (Node 2 off), Node 3 otomatis meminta PGN ke Node 1. |
| 3 | **Broadcast Status Gateway ke Bus CAN di Core 0** | **Baris 85 – 120 & 220 – 235** | • Kirim frame status gateway (WiFi, MQTT, RSSI, Tx Count) ke bus CAN menggunakan PGN 65280 (Proprietary B, SA 0x27) setiap 2,5 detik agar bisa dibaca langsung oleh Layar Node 2 tanpa kabel serial. |

---

## 6. Keuntungan Hasil Akhir bagi Pengujian Proyek (CBL)
1. **Estetika Sangat Rapi:** Tidak ada lubang kabel tambahan di bodi luar untuk lampu LED fisik. Semua indikator terintegrasi di pojok kanan layar LCD.
2. **Kenyamanan Uji Coba:** Penguji/Dosen tidak akan merasa silau karena kedipan kuning dibuat bertempo santai, dan suara buzzer bisa di-mute saat demonstrasi berulang kali dengan tombol tengah (OK).
3. **Pengalaman Pengguna Fleksibel:** Penguji bebas menekan tombol NEXT berputar terus tanpa takut macet atau mentok.

---

## 7. Daftar Celah Teknis & Rencana Mitigasi Bug (Hasil Audit Pra-Implementasi)

Bagian ini merangkum 8 potensi celah teknis yang ditemukan dari hasil peninjauan kode sumber aktif serta solusi mitigasi yang wajib diterapkan agar sistem tidak mengalami kendala (*freeze*, *crash*, atau tabrakan tampilan):

| No | Celah Teknis / Bug | Dampak Jika Dibiarkan | Solusi & Mitigasi Kode yang Diterapkan | Lokasi Target |
|---|---|---|---|---|
| **1** | **Tabrakan Render Antar Halaman** | Saat berada di Halaman 2 atau 3, fungsi lama `updateSmoothDisplay()` dan `drawAlertIcon()` tetap menggambar angka RPM dan bar bertingkat di atas tabel CAN / kartu IoT. | Batasi penggambaran hanya jika `currentPage == 1`. Saat berpindah kembali ke Halaman 1 (`switchPage(1)`), reset nilai cache (`last_rpm = 65535; last_load = 255; dsb.`) agar seluruh grafik digambar ulang utuh dan bersih. | `Node2_Display_Hub.ino`<br>*(Baris 1186–1204)* |
| **2** | **Efek "Mesin Slot" pada Tombol** | Jika tombol ditekan 0,2 detik saja, `loop()` ESP32 yang sangat cepat akan memicu pergantian halaman puluhan kali secara liar. | Wajib menggunakan **Edge-Triggered Detection (Falling Edge)**: tombol hanya memicu aksi saat transisi dari `HIGH` ke `LOW`, ditambah *Debounce Timer* 50 ms. Tombol harus dilepas sebelum dapat ditekan kembali. | `Node2_Display_Hub.ino`<br>*(Baris 1014+)* |
| **3** | **Data 8-Byte Hex Belum Disimpan** | Node 2 saat ini hanya mengekstrak angka integer/float, sedangkan payload mentah 8-byte Hex langsung dibuang, sehingga Halaman 2 tidak bisa menampilkan data mentah frame CAN. | Tambahkan buffer array global `uint8_t rawCanPayload[6][8]` dan variabel akumulator `uint32_t totalCanFrames = 0;` yang di-increment setiap kali `twai_receive()` berhasil. | `Node2_Display_Hub.ino`<br>*(Baris 70–80 & 1058–1123)* |
| **4** | **Ketergantungan Kabel Serial UART Antar-ESP** | Jika kabel serial terputus atau longgar, data telemetri Node 3 macet dan layar bisa freeze. | **Dieliminasi Total**: Node 3 langsung terhubung ke bus CAN fisik (`CAN_H` & `CAN_L`) via transceiver SN65HVD230. Node 3 dan Node 2 mandiri 100% membaca bus CAN tanpa kabel UART perantara. | `Node3_IoT_Gateway.ino`<br>& `Node2_Display_Hub.ino` |
| **5** | **Race Condition Serial UART di ESP 3** | Pada arsitektur UART lama, task Core 0 dan Core 1 bisa berebut port serial jika tidak disinkronkan. | **Dieliminasi Total**: Komunikasi serial dihapus. Seluruh transfer data antar-core di Node 3 menggunakan antrean memori murni FreeRTOS Queue yang *thread-safe*. | `Node3_IoT_Gateway.ino`<br>*(Baris 60–75 & 315–335)* |
| **6** | **Paket Force Refresh Nyasar ke MQTT** | Pada serial lama, perintah refresh string JSON bisa tertelan parser telemetri. | **Dieliminasi Total**: Request refresh status kini menggunakan standar protokol CAN SAE J1939 (PGN Request 0xEA00 untuk PGN 65280), terisolasi dari antrean telemetri cloud. | `Node2_Display_Hub.ino`<br>& `Node3_IoT_Gateway.ino` |
| **7** | **Logika Mute Buzzer Belum Aktif** | Output buzzer saat ini dikontrol langsung oleh flag `alarm_red` dan `warning_orange` tanpa mengecek status tombol mute. | Sisipkan variabel `buzzerMuted` pada baris evaluasi buzzer: jika `buzzerMuted == true`, paksa `pinMode(PIN_BUZZER, INPUT)` (Hi-Z / Hening). Tampilkan teks status `[MUTED]` di footer layar Halaman 1. | `Node2_Display_Hub.ino`<br>*(Baris 1205–1226)* |
| **8** | **Beban SPI Berlebih pada Bulatan LED** | Menggambar ulang 3 bulatan virtual di setiap putaran `loop()` akan membebani jalur SPI layar secara sia-sia. | Penggambaran 3 bulatan LED di header dibuat **berbasis event**: hanya digambar ulang jika status keparahan berubah (*State Change*) atau saat timer kedipan (*blink timer*) berdetik. | `Node2_Display_Hub.ino`<br>*(Baris 260–290)* |

