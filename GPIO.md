# Dokumentasi Pemetaan Pin (GPIO Mapping)
## Sistem IoT Telemetri Alat Berat Caterpillar 950L (3-Node ESP32)

Dokumen ini merangkum seluruh alokasi pin GPIO untuk ketiga mikrokontroler ESP32 DevKit V1 30-Pin beserta koneksi periferalnya.

---

## 1. Node 1: ECU Simulator Caterpillar 950L (`Node1_ECU_J1939.ino`)

Node 1 bertindak sebagai mesin virtual yang membaca 6 parameter analog dari potensiometer dan menyiarkan data ke bus CAN fisik via protokol SAE J1939.

| No | Nama Sinyal / Parameter | Pin ESP32 | Tipe Pin | Terhubung ke Komponen | Keterangan Rentang Nilai |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **Engine RPM** | **GPIO 32** | ADC1_CH4 (Analog In) | Potensiometer 1 (Pin Tengah) | 0 – 3000 RPM (SPN 190, EEC1) |
| **2** | **Engine Load** | **GPIO 33** | ADC1_CH5 (Analog In) | Potensiometer 2 (Pin Tengah) | 0 – 100 % (SPN 92, EEC2) |
| **3** | **Coolant Temp** | **GPIO 34** | ADC1_CH6 (Input Only) | Potensiometer 3 (Pin Tengah) | 0 – 120 °C (SPN 110, ET1) |
| **4** | **MAP Boost Pressure** | **GPIO 35** | ADC1_CH7 (Input Only) | Potensiometer 4 (Pin Tengah) | 0 – 255 kPa (SPN 102, IC1) |
| **5** | **Vehicle Speed** | **GPIO 25** | ADC1_CH8 (Analog In) | Potensiometer 5 (Pin Tengah) | 0 – 60 km/h (SPN 84, CCVS) |
| **6** | **System Voltage** | **GPIO 26** | ADC1_CH9 (Analog In) | Potensiometer 6 (Pin Tengah) | 0.0 – 35.0 V (SPN 168, VEP1) |
| **7** | **CAN Transmit (CTX)** | **GPIO 21** | TWAI TX (Digital Out) | Pin CTX / TXD Transceiver SN65HVD230 | Transmit sinyal logika 3.3V ke transceiver |
| **8** | **CAN Receive (CRX)** | **GPIO 22** | TWAI RX (Digital In) | Pin CRX / RXD Transceiver SN65HVD230 | Receive sinyal logika 3.3V dari transceiver |
| **9** | **Kipas Radiator (PWM)**| **GPIO 18** | LEDC PWM (Digital Out)| Basis Transistor NPN (via R 1kΩ) | PWM Otomatis (Normal: ~37%, Warn >=105°C: 100%) |
| **10**| **VCC 3.3V** | **3V3** | Power Output | Kaki 1 Potensiometer & VCC SN65HVD230 | Catu daya logika 3.3V tegangan referensi ADC |
| **11**| **Ground** | **GND** | Power Ground | Kaki 3 Potensiometer & GND SN65HVD230 | Ground bersama (*Common Ground*) |

---

## 2. Node 2: Display Hub, Cluster Controller, & Forwarder (`Node2_Display_Hub.ino`)

Node 2 menangkap frame SAE J1939 dari bus CAN pada Core 0, merender antarmuka dashboard pada TFT 3.5" ILI9488 di Core 1, menangani navigasi 3 tombol fisik, mengontrol buzzer alarm, dan meneruskan data matang ke Node 3 via UART2.

| No | Nama Sinyal / Periferal | Pin ESP32 (Label Board) | Tipe Pin | Terhubung ke Komponen | Keterangan & Konfigurasi |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **CAN Transmit (CTX)** | **GPIO 21 (D21)** | TWAI TX (Digital Out) | Pin CTX Transceiver SN65HVD230 Node 2 | Transmisi pengakuan / Request PGN 0xEA00 |
| **2** | **CAN Receive (CRX)** | **GPIO 22 (D22)** | TWAI RX (Digital In) | Pin CRX Transceiver SN65HVD230 Node 2 | Penerimaan frame SAE J1939 29-bit |
| **3** | **TFT SCK (SPI Clock)** | **GPIO 18 (D18)** | VSPI SCK (Hardware SPI) | Pin SCK / CLK Layar TFT ILI9488 | Sinyal clock serial SPI kecepatan tinggi |
| **4** | **TFT MOSI (Data In)** | **GPIO 23 (D23)** | VSPI MOSI (Hardware SPI) | Pin SDI / MOSI Layar TFT ILI9488 | Transmisi data piksel display |
| **5** | **TFT MISO (Data Out)** | **GPIO 19 (D19)** | VSPI MISO (Hardware SPI) | Pin SDO / MISO Layar TFT ILI9488 | Pembacaan register display |
| **6** | **TFT CS (Chip Select)** | **GPIO 15 (D15)** | Digital Out | Pin CS Layar TFT ILI9488 | Seleksi chip SPI display |
| **7** | **TFT DC (Data/Command)**| **GPIO 2 (D2)** | Digital Out | Pin DC / RS Layar TFT ILI9488 | Switch register data/instruksi |
| **8** | **TFT RST (Reset)** | **GPIO 4 (D4)** | Digital Out | Pin RESET Layar TFT ILI9488 | Reset modul display hardware |
| **9** | **TFT LED (Backlight)** | **3V3 / 5V** | Power | Pin LED Layar TFT ILI9488 | Lampu latar layar (via resistor/langsung) |
| **10**| **Tombol [ < PREV ]** | **GPIO 14 (D14)** | Digital In (INPUT_PULLUP) | Push Button 1 (Kaki A: D14, Kaki B: GND) | Pindah Halaman Mundur (3 ⬅️ 2 ⬅️ 1 ⬅️ 3) |
| **11**| **Tombol [ ● OK / ACT ]**| **GPIO 32 (D32)** | Digital In (INPUT_PULLUP) | Push Button 2 (Kaki A: D32, Kaki B: GND) | Aksi (Hal 1: Mute Buzzer, Hal 2: Reset CAN, Hal 3: Refresh IoT) |
| **12**| **Tombol [ NEXT > ]** | **GPIO 27 (D27)** | Digital In (INPUT_PULLUP) | Push Button 3 (Kaki A: D27, Kaki B: GND) | Pindah Halaman Maju (1 ➡️ 2 ➡️ 3 ➡️ 1) |
| **13**| **Active Buzzer 5V** | **GPIO 13 (D13)** | Digital (Tri-State Hi-Z) | Pin I/O Modul Active Buzzer Active-LOW | Tri-State: INPUT = Mati, OUTPUT LOW = Nyala |
| **14**| **UART2 TX (Opsional)**| **GPIO 17 (TX2)** | Serial2 TXD (Digital Out)| Tidak Terpakai (Bebas)     | Sebelumnya ke RX2 ESP 3 (Kini via Bus CAN) |
| **15**| **UART2 RX (Opsional)**| **GPIO 16 (RX2)** | Serial2 RXD (Digital In) | Tidak Terpakai (Bebas)     | Sebelumnya dari TX2 ESP 3 (Kini via Bus CAN) |
| **16**| **VCC 5V / VIN** | **VIN (5V)**| Power Output / Input | VCC Layar TFT & VCC Active Buzzer | Sumber daya backlight & buzzer 5V |
| **17**| **Ground** | **GND** | Power Ground | GND Transceiver, TFT, Buzzer, Tombol, & Common Bus | Wajib terhubung menyatu (*Common Ground*) |

---

## 3. Node 3: IoT Gateway CAN to MQTT (`Node3_IoT_Gateway.ino`)

Node 3 terhubung langsung ke modul transceiver CAN **SN65HVD230** untuk menangkap sinyal diferensial `CAN_H` dan `CAN_L` langsung dari bus fisik. Core 1 menjalankan ingestion & decoder SAE J1939 via driver TWAI ESP32, mem-package payload MQTT, dan Core 0 mengunggahnya dengan QoS 1 ke EMQX Cloud melalui koneksi Wi-Fi.

| No | Nama Sinyal / Periferal | Pin ESP32 | Tipe Pin | Terhubung ke Komponen | Keterangan & Protokol |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **CAN Transmit (CTX)** | **GPIO 21** | TWAI TX (Digital Out) | Pin CTX / TXD Transceiver SN65HVD230 Node 3 | Transmisi pengakuan / Request PGN 0xEA00 & Broadcast Status |
| **2** | **CAN Receive (CRX)** | **GPIO 22** | TWAI RX (Digital In) | Pin CRX / RXD Transceiver SN65HVD230 Node 3 | Penerimaan frame SAE J1939 29-bit dari bus |
| **3** | **Status Indicator LED** | **GPIO 2** | Digital Out | Onboard Blue LED ESP32 | Kedip: Mencari Wi-Fi / Broker, Solid: Terhubung MQTT |
| **4** | **Serial Monitor / Debug**| **TX0 / RX0** | UART0 (USB Serial) | Komputer / PC (Baud 115200) | Debugging serial log runtime gateway |
| **5** | **VCC 3.3V Logic** | **3V3** | Power Output | Pin VCC Transceiver SN65HVD230 Node 3 | Daya logika transceiver 3.3V |
| **6** | **Ground** | **GND** | Power Ground | Pin GND Transceiver SN65HVD230 & Common Bus | Wajib menyatu ke Common Ground seluruh node |
| **7** | **Power Supply** | **VIN (5V) / USB**| Power In | Kabel USB 5V / Adaptor 5V | Sumber daya utama ESP 3 |

---

## 4. Diagram Sambungan Antar-Node (Multi-Drop CAN Bus Topology)

Ketiga ESP32 kini terhubung secara paralel pada satu bus diferensial 2 kawat fisik (`CAN_H` dan `CAN_L`):

```text
[ ESP 1: ECU ]                 [ ESP 2: Display Hub ]            [ ESP 3: IoT Gateway ]
GPIO 21 (CTX) ──► CTX #1       GPIO 21 (CTX) ──► CTX #2          GPIO 21 (CTX) ──► CTX #3
GPIO 22 (CRX) ◄── CRX #1       GPIO 22 (CRX) ◄── CRX #2          GPIO 22 (CRX) ◄── CRX #3

SN65 #1 CAN_H ═════════════════╦═════════════════════════════════► SN65 #3 CAN_H
                               ║
                               ╠═════════════════════════════════► SN65 #2 CAN_H
SN65 #1 CAN_L ═════════════════╬═════════════════════════════════► SN65 #3 CAN_L
                               ║
                               ╚═════════════════════════════════► SN65 #2 CAN_L

GND ───────────────────────────╩───────────────────────────────── GND (Common Ground)
```

---

## 5. Peta Fisik Pinout ESP32 30-Pin Node 1 (ECU Simulator)

```text
                     ESP32 DEVKIT V1 (30 PIN) - NODE 1
                               +-----------+
                          EN --| 1      30 |-- D23  ──  (NC / Bebas)
                     (NC) VP --| 2      29 |-- D22  ──► CAN CRX (SN65HVD230)
                     (NC) VN --| 3      28 |-- TX0  ──► USB Debug Serial TX
      Potensio 3 (Temp) ──► D34 --| 4      27 |-- RX0  ──► USB Debug Serial RX
      Potensio 4 (MAP)  ──► D35 --| 5      26 |-- D21  ──► CAN CTX (SN65HVD230)
      Potensio 1 (RPM)  ──► D32 --| 6      25 |-- D19  ──  (NC / Bebas)
      Potensio 2 (Load) ──► D33 --| 7      24 |-- D18  ──► Kipas PWM (via R 1k ke Basis Transistor)
     Potensio 5 (Speed) ──► D25 --| 8      23 |-- D5   ──  (NC / Bebas)
      Potensio 6 (Volt) ──► D26 --| 9      22 |-- TX2  ──  (NC / Bebas)
                    (NC) D27 --| 10     21 |-- RX2  ──  (NC / Bebas)
                    (NC) D14 --| 11     20 |-- D4   ──  (NC / Bebas)
                    (NC) D12 --| 12     19 |-- D2   ──  (NC / Onboard LED)
                    (NC) D13 --| 13     18 |-- D15  ──  (NC / Bebas)
    Common GND  ──►       GND --| 14     17 |-- GND  ──► Emitter Transistor & GND Transceiver/Potensio
  Catu Daya VIN ──►       VIN --| 15     16 |-- 3V3  ──► VCC 3.3V SN65HVD230 & Potensio (Kaki 1)
                               +-----------+
                                  [ USB ]
```

### Panduan Rangkaian Driver Kipas DC 5V (Transistor NPN):
```text
                  +5V (Pin VIN ESP32 atau Adaptor 5V)
                    │
                    ├───┐
                    │   │
                 Kipas  │ [Dioda Flyback 1N4007]
                 5V DC  ▲ (Katoda bergaris perak ke +5V)
                    │   │
                    ├───┘
                    │
              Collector (C)
                    │
  GPIO 18 ──[ 1 kΩ ]── Base (B)   [ Transistor NPN (TIP120/BD139/2N2222) ]
  (ESP 1)           │
               Emitter (E)
                    │
                   GND (Common Ground ESP32)
```

---

## 6. Peta Fisik Pinout ESP32 30-Pin Node 2 (Display Hub)

Sesuai foto layout modul **ESP32 DevKit V1 30-Pin**, berikut adalah panduan posisi fisik pin kiri dan kanan beserta kabel periferal yang terpasang:

```text
                     ESP32 DEVKIT V1 (30 PIN) - NODE 2
                               +-----------+
                          EN --| 1      30 |-- D23  ──► TFT MOSI (SDI)
                     (NC) VP --| 2      29 |-- D22  ──► CAN CRX (SN65HVD230)
                     (NC) VN --| 3      28 |-- TX0  ──► USB Debug Serial TX
                    (NC) D34 --| 4      27 |-- RX0  ──► USB Debug Serial RX
                    (NC) D35 --| 5      26 |-- D21  ──► CAN CTX (SN65HVD230)
     Tombol OK ──►       D32 --| 6      25 |-- D19  ──► TFT MISO (SDO)
                    (NC) D33 --| 7      24 |-- D18  ──► TFT SCK (CLK)
                    (NC) D25 --| 8      23 |-- D5   ──  (NC)
                    (NC) D26 --| 9      22 |-- TX2  ──  (NC / Bebas)
   Tombol NEXT ──►       D27 --| 10     21 |-- RX2  ──  (NC / Bebas)
   Tombol PREV ──►       D14 --| 11     20 |-- D4   ──► TFT RESET (RST)
                    (NC) D12 --| 12     19 |-- D2   ──► TFT Data/Command (DC)
 Active Buzzer ──►       D13 --| 13     18 |-- D15  ──► TFT Chip Select (CS)
   Common GND  ──►       GND --| 14     17 |-- GND  ──► Ground Layar TFT
 Catu Daya VIN ──►       VIN --| 15     16 |-- 3V3  ──► VCC Layar TFT / Logic
                               +-----------+
                                  [ USB ]
```

### Panduan Pengkabelan 3 Push Button Fisik (INPUT_PULLUP):
Tombol menggunakan resistor pull-up internal ESP32, sehingga **TIDAK MEMERLUKAN RESISTOR FISIK TAMBAHAN**.

```text
1. [ Tombol PREV (Hal 3 <- 2 <- 1 <- 3) ] :
   - Kaki A ──► Pin D14 (GPIO 14, Pin ke-11 Kiri)
   - Kaki B ──► Pin GND (Pin ke-14 Kiri)

2. [ Tombol OK / ACTION (Mute/Reset/Refresh) ] :
   - Kaki A ──► Pin D32 (GPIO 32, Pin ke-6 Kiri)
   - Kaki B ──► Pin GND (Pin ke-14 Kiri)

3. [ Tombol NEXT (Hal 1 -> 2 -> 3 -> 1) ] :
   - Kaki A ──► Pin D27 (GPIO 27, Pin ke-10 Kiri)
   - Kaki B ──► Pin GND (Pin ke-14 Kiri)
```

> 💡 **Tips Pemasangan Push Button 4 Kaki (Tactile Switch):**
> * Hubungkan dua kabel jumper secara **diagonal berseberangan** (misal kaki kiri atas ke GPIO, kaki kanan bawah ke GND) agar terhindar dari salah sambung pasangan kaki internal sakelar.

---

> ⚠️ **Catatan Penting Pemasangan:**
> 1. Pin `GPIO 34` dan `GPIO 35` pada ESP 1 adalah pin *Input Only* (tanpa internal pullup/pulldown), sangat ideal digunakan murni sebagai input ADC analog.
> 2. Ketiga ESP32 (Node 1, Node 2, dan Node 3) terhubung pada satu bus CAN bersama (`CAN_H`, `CAN_L`, dan Common `GND`). Tidak ada kabel serial UART antar ESP.
> 3. Resistor terminasi $120\ \Omega$ pada bus CAN wajib aktif HANYA pada 2 titik ujung fisik bus (misal modul SN65HVD230 pada Node 1 dan Node 3). Node 2 di tengah bus tidak perlu terminasi tambahan agar impedansi ekuivalen bus tetap $60\ \Omega$.
