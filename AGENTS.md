# AGENTS.md - Direktori Skill Proyek

> Berkas ini mendaftar secara khusus skill-skill yang wajib dipatuhi dan dimuat dalam proyek ini.  
> Seluruh asisten AI yang mengerjakan proyek ini **WAJIB** membaca file ini dan memuat aturan dari skill yang terdaftar di bawah menggunakan `read_file` saat menjalankan tugas terkait.

---

## Daftar Skill Terpilih

| No | Nama Skill | Lokasi File (Path) | Peran & Alasan Dipilih |
| :---: | :--- | :--- | :--- |
| 1 | `antislop` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/antislop/SKILL.md) | **Filter Kualitas Utama**: Mencegah kode berbelit-belit (*generic AI slop*), fungsi dummy tanpa implementasi nyata, dan komentar berlebihan pada firmware Arduino maupun TypeScript Next.js. |
| 2 | `grafix` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/grafix/SKILL.md) | **Standar Telemetri IoT & Visualisasi Time-Series**: Panduan kurasi data sensor alat berat (RPM, Suhu Coolant, MAP Boost, Beban, Speed, Voltase), sliding-window buffer, dan perlakuan state offline/online. |
| 3 | `cpp-coding-standards` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/cpp-coding-standards/SKILL.md) | **Standar Kode C/C++ Embedded**: Menjamin manajemen memori yang aman pada ESP32, penanganan buffer statis non-blocking, serta pencegahan stack overflow dan memory leak di FreeRTOS. |
| 4 | `contract-first` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/contract-first/SKILL.md) | **Konsistensi Kontrak Data Multi-Node**: Mengunci skema pertukaran data JSON antara ESP 2 (Display), ESP 3 (Gateway), payload MQTT EMQX, dan skema Supabase agar bebas dari *field drift*. |
| 5 | `react-patterns` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/react-patterns/SKILL.md) | **Arsitektur React & Next.js Modern**: Menangani rendering komponen kartu indikator (*GaugeCard*), tabel riwayat, state management client-side yang aman dari *hydration mismatch*, dan optimasi re-render. |
| 6 | `make-interfaces-feel-better` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/make-interfaces-feel-better/SKILL.md) | **Ergonomi & Polish UI**: Menata detail spasi, transisi warna status (Hijau/Kuning/Merah), *touch targets*, tipografi, dan tata letak header/footer baik di layar fisik TFT 3.5" maupun di Web PWA. |
| 7 | `apple-design` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/apple-design/SKILL.md) | **Standar Estetika & Keterbacaan Visual**: Mencegah ukuran font kerdil (<12px), memastikan hierarki kontras tinggi untuk instrumen alat berat, dan menghasilkan layout dashboard yang profesional. |
| 8 | `postgres-patterns` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/postgres-patterns/SKILL.md) | **Optimasi Database Supabase**: Panduan pembuatan index time-series pada tabel riwayat telemetri, efisiensi query, dan konfigurasi Row Level Security (RLS) yang tepat. |
| 9 | `diagnosing-bugs` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/diagnosing-bugs/SKILL.md) | **Protokol Investigasi Bug Kritis**: Panduan investigasi sistematis untuk masalah latensi serial, watchdog auto-reset TWAI CAN bus, debounce tombol fisik, dan race conditions antar core ESP32. |
| 10 | `verification-loop` | [SKILL.md](file:///C:/Users/WORKPLUS/.gemini/config/skills/verification-loop/SKILL.md) | **Verifikasi Kualitas Pra-Klaim**: Prosedur validasi end-to-end (koneksi CAN ➡️ pembaruan TFT ➡️ transmisi UART ➡️ publish MQTT ➡️ tampilan web PWA) sebelum pekerjaan dinyatakan selesai. |

---

## Instruksi Eksekusi untuk Asisten AI

1. **Pemuatan On-Demand:** Jangan mengandalkan ringkasan otomatis global yang terpotong. Saat mengerjakan tugas terkait domain di atas, asisten **WAJIB** membaca instruksi lengkap dari tautan path skill terpilih di atas menggunakan perkakas `read_file`.
2. **Kepatuhan Terhadap Standar:** Seluruh implementasi kode firmware ESP32, arsitektur komunikasi serial, dan antarmuka web PWA wajib mematuhi panduan desain, batas toleransi, dan checklist dari skill yang telah dikunci di dalam berkas ini.
3. **Integritas Konfigurasi:** Jangan mengganti atau menambah skill secara sembarangan tanpa melewati evaluasi kebutuhan fungsional proyek.

