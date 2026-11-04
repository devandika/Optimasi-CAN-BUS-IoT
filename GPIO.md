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
| **9** | **VCC 3.3V** | **3V3** | Power Output | Kaki 1 Potensiometer & VCC SN65HVD230 | Catu daya logika 3.3V tegangan referensi ADC |
| **10**| **Ground** | **GND** | Power Ground | Kaki 3 Potensiometer & GND SN65HVD230 | Ground bersama (*Common Ground*) |

---

## 2. Node 2: Display Hub, Alarm, & Forwarder (`Node2_Display_Hub.ino`)

Node 2 menangkap frame SAE J1939 dari bus CAN pada Core 0, merender antarmuka dashboard pada TFT 3.5" ILI9488 di Core 1, mengontrol buzzer alarm, dan meneruskan data matang ke Node 3 via UART2.

| No | Nama Sinyal / Periferal | Pin ESP32 | Tipe Pin | Terhubung ke Komponen | Keterangan & Konfigurasi |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **CAN Transmit (CTX)** | **GPIO 21** | TWAI TX (Digital Out) | Pin CTX Transceiver SN65HVD230 Node 2 | Jalur transmisi pengakuan CAN |
| **2** | **CAN Receive (CRX)** | **GPIO 22** | TWAI RX (Digital In) | Pin CRX Transceiver SN65HVD230 Node 2 | Penerimaan frame SAE J1939 |
| **3** | **TFT SCK (SPI Clock)** | **GPIO 18** | VSPI SCK (Hardware SPI) | Pin SCK / CLK Layar TFT ILI9488 | Sinyal clock serial kecepatan tinggi |
| **4** | **TFT MOSI (Data In)** | **GPIO 23** | VSPI MOSI (Hardware SPI) | Pin SDI / MOSI Layar TFT ILI9488 | Transmisi data piksel display |
| **5** | **TFT MISO (Data Out)** | **GPIO 19** | VSPI MISO (Hardware SPI) | Pin SDO / MISO Layar TFT ILI9488 | Pembacaan ID/register display |
| **6** | **TFT CS (Chip Select)** | **GPIO 15** | Digital Out | Pin CS Layar TFT ILI9488 | Seleksi chip SPI display |
| **7** | **TFT DC (Data/Command)**| **GPIO 2** | Digital Out | Pin DC / RS Layar TFT ILI9488 | Switch register data/instruksi |
| **8** | **TFT RST (Reset)** | **GPIO 4** | Digital Out | Pin RESET Layar TFT ILI9488 | Reset modul display hardware |
| **9** | **TFT LED (Backlight)** | **3V3 / 5V** | Power | Pin LED Layar TFT ILI9488 | Lampu latar layar (via resistor/langsung) |
| **10**| **Active Buzzer 5V** | **GPIO 13** | Digital (Tri-State Hi-Z) | Pin I/O Modul Active Buzzer Active-LOW | Tri-State: INPUT = Mati, OUTPUT LOW = Nyala |
| **11**| **UART2 TX (Data Stream)**| **GPIO 17** | Serial2 TXD (Digital Out)| Pin **GPIO 16 (RX2)** pada **ESP 3** | Mengirimkan string telemetri JSON kontinu |
| **12**| **UART2 RX (Handshake)** | **GPIO 16** | Serial2 RXD (Digital In) | Pin **GPIO 17 (TX2)** pada **ESP 3** | Menerima status ack dari ESP 3 (*opsional*) |
| **13**| **VCC 5V / VIN** | **VIN (5V)**| Power Output / Input | VCC Layar TFT & VCC Active Buzzer | Sumber daya backlight & buzzer 5V |
| **14**| **Ground** | **GND** | Power Ground | GND Transceiver, TFT, Buzzer, dan ESP 3 | Wajib terhubung menyatu (*Common Ground*) |

---

## 3. Node 3: IoT Gateway CAN to MQTT (`Node3_IoT_Gateway.ino`)

Node 3 membaca stream UART2 dari Node 2 pada Core 1, mem-package payload MQTT, dan mengunggahnya dengan QoS 1 ke EMQX Cloud melalui koneksi Wi-Fi pada Core 0.

| No | Nama Sinyal / Periferal | Pin ESP32 | Tipe Pin | Terhubung ke Komponen | Keterangan & Protokol |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **UART2 RX (Data In)** | **GPIO 16** | Serial2 RXD (Digital In) | Pin **GPIO 17 (TX2)** pada **ESP 2** | Ingestion stream telemetri JSON dari ESP 2 |
| **2** | **UART2 TX (Status Out)**| **GPIO 17** | Serial2 TXD (Digital Out)| Pin **GPIO 16 (RX2)** pada **ESP 2** | Pengiriman status gateway (*opsional*) |
| **3** | **Status Indicator LED** | **GPIO 2** | Digital Out | Onboard Blue LED ESP32 | Kedip: Mencari Wi-Fi / Broker, Solid: Terhubung MQTT |
| **4** | **Serial Monitor / Debug**| **TX0 / RX0** | UART0 (USB Serial) | Komputer / PC (Baud 115200) | Debugging serial log runtime gateway |
| **5** | **Ground** | **GND** | Power Ground | Pin GND ESP 2 & Catu Daya Bersama | Referensi level tegangan sinyal UART |
| **6** | **Power Supply** | **VIN (5V) / USB**| Power In | Kabel USB 5V / Adaptor 5V | Sumber daya utama ESP 3 |

---

## 4. Diagram Sambungan Antar-Node (Inter-Node Wiring)

```
[ ESP 1: ECU ]                 [ ESP 2: Display ]                [ ESP 3: Gateway ]
GPIO 21 (CTX) ──► CTX SN65 #1
GPIO 22 (CRX) ◄── CRX SN65 #1

SN65 #1 CAN_H ═════════════════► SN65 #2 CAN_H
SN65 #1 CAN_L ═════════════════► SN65 #2 CAN_L
                                 SN65 #2 CTX ◄── GPIO 21 (CTX)
                                 SN65 #2 CRX ──► GPIO 22 (CRX)

                                 GPIO 17 (TX2) ──────────────────► GPIO 16 (RX2)
                                 GPIO 16 (RX2) ◄────────────────── GPIO 17 (TX2)

GND ──────────────────────────── GND ──────────────────────────── GND (Common Ground)
```

> ⚠️ **Catatan Penting Pemasangan:**
> 1. Pin `GPIO 34` dan `GPIO 35` pada ESP 1 adalah pin *Input Only* (tanpa internal pullup/pulldown), sangat ideal digunakan murni sebagai input ADC analog.
> 2. Antara ESP 2 dan ESP 3 **tidak memerlukan komponen tambahan**, cukup sambungan langsung kabel jumper `TX2 -> RX2`, `RX2 <- TX2`, dan `GND <-> GND`.
> 3. Resistor terminasi $120\ \Omega$ pada bus CAN wajib aktif pada ujung bus (modul SN65HVD230).
