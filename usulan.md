# Analisis & Usulan Pengembangan Proyek
**Proyek:** Sistem IoT Telemetri Alat Berat Caterpillar 950L (3-Node ESP32 + Next.js PWA Dashboard)  
**Tanggal Evaluasi:** 1 November 2026

---

## 1. Daftar Hal yang Perlu Diperbaiki / Disempurnakan

### A. Sisi Web Dashboard (`dashboard-pwa`)
1. **Penyimpanan Riwayat Tabel Saat Halaman Di-refresh (`F5`)**
   - **Kondisi Saat Ini:** Data `recordedLog` pada tabel riwayat per detik hanya tersimpan di memori sementara React (`useState`). Jika halaman tidak sengaja ter-*refresh* saat pengujian lapangan, seluruh rekaman sesi langsung hilang.
   - **Solusi:** Simpan buffer riwayat terakhir (misalnya 300–600 baris terakhir) ke `sessionStorage` / `localStorage`, atau muat otomatis 50 data terakhir dari Supabase saat halaman pertama kali dibuka.

2. **Konsistensi Bahasa Antara Judul Kartu, Tabel Riwayat, dan Banner**
   - **Kondisi Saat Ini:** Judul kartu indikator di `src/app/page.tsx` menggunakan Bahasa Inggris (*Engine Speed (RPM)*, *Engine Temp*, *Engine Load*, *Boost Pressure*, *Speed*, *System Voltage*), sedangkan header kolom di `src/components/HistoryTable.tsx` (*Putaran, Suhu, Beban, Turbo, Laju, Aki*) dan daftar nama parameter bermasalah di `AlertBanner` masih menggunakan istilah Bahasa Indonesia yang berbeda.
   - **Solusi:** Samakan penamaan parameter di kartu indikator, banner status, dan header kolom tabel agar pengguna langsung mudah mencocokkannya.

3. **Sinkronisasi Penyimpanan ke Supabase Melalui Endpoint API `/api/telemetry`**
   - **Kondisi Saat Ini:** Browser masih melakukan `supabase.from("telemetry_history").insert(...)` secara langsung dari sisi klien di `src/app/page.tsx`, dan nilai `state_level` yang dikirim masih mengambil `clean.st` mentah dari ESP32, bukan hasil evaluasi `overallLevel(clean)` dari `src/lib/thresholds.ts`.
   - **Solusi:** Gunakan endpoint `/api/telemetry` yang sudah dilengkapi *rate-limiter* serta validasi server, dan kirim `state_level` yang telah disinkronkan dengan `thresholds.ts`.

4. **Pemulihan Koneksi Broker MQTT Ber-password Saat Reload**
   - **Kondisi Saat Ini:** Saat halaman di-*refresh*, `host`, `port`, dan `username` dipulihkan dari `localStorage`, tetapi `password` di-reset menjadi string kosong `""`. Jika menggunakan broker EMQX Cloud Private yang mewajibkan autentikasi, koneksi otomatis akan gagal setelah *reload*.
   - **Solusi:** Simpan opsi kredensial sesi di `sessionStorage` (yang otomatis terhapus ketika tab ditutup) agar tahan terhadap *refresh* halaman tanpa meninggalkan kata sandi permanen di `localStorage`.

5. **Penambahan *Loading Intro* Saat Sistem Web Baru Aktif**
   - **Kondisi Saat Ini:** Pada layar fisik TFT Node 2 sudah terdapat animasi *boot bar* inisialisasi sistem Caterpillar 950L, namun pada aplikasi web belum terdapat tampilan transisi inisialisasi singkat saat pertama kali dibuka.
   - **Solusi:** Tambahkan *splash/loading intro* singkat (~1–1.5 detik) yang menampilkan pengecekan koneksi broker dan kesiapan modul telemetri saat aplikasi pertama kali dimuat.

### B. Sisi PWA & Konfigurasi (`public/manifest.json`)
6. **Format Icon Aplikasi PWA untuk Android & iOS**
   - **Kondisi Saat Ini:** File `public/manifest.json` hanya merujuk ke `/cat-icon.svg`. Beberapa versi Chrome Android dan Safari iOS mewajibkan icon raster PNG ukuran eksplisit (`192x192` dan `512x512`) agar tombol **Pasang Aplikasi (Install PWA)** muncul secara konsisten.
   - **Solusi:** Sediakan file `/icon-192.png` dan `/icon-512.png` di dalam folder `public/` serta daftarkan pada `manifest.json`.

---

## 2. Usulan Fitur Detail (Bernilai Tinggi untuk Pengujian & Demo CBL)

### 1. Tombol **Jeda Tabel (*Pause / Freeze View*)** & Filter Kondisi Bermasalah
- **Masalah:** Ketika data masuk setiap 1 detik, baris tabel terus bergeser ke bawah sehingga penguji kadang sulit mengamati satu baris tertentu.
- **Fitur yang Diusulkan:**
  - Tombol **Jeda Tampilan (Pause)** di atas tabel: perekaman data tetap berjalan di latar belakang setiap detik, namun posisi gulir tabel dikunci sementara agar mudah dibaca.
  - Tombol filter cepat **"Hanya Waspada / Bahaya"**: menyaring tabel agar hanya menampilkan detik-detik ketika salah satu parameter melewati batas normal.

### 2. Baris Ringkasan Sesi (*Peak / Min-Max Hold*)
- **Masalah:** Saat pengujian atau sidang/demo proyek, penguji sering menanyakan nilai puncak yang sempat tercapai selama sesi uji jalan (*"Berapa RPM dan suhu tertinggi tadi?"*).
- **Fitur yang Diusulkan:**
  - Menampilkan ringkasan metrik sesi secara *real-time* di bagian bawah/atas tabel:
    - **Peak RPM** (RPM tertinggi tercatat)
    - **Peak Temp** (Suhu mesin tertinggi tercatat)
    - **Min/Max Voltage** (Tegangan aki terendah & tertinggi)
    - **Durasi Sesi Aktif** (`MM:SS`)

### 3. Mode Simulasi dengan Skenario Uji (*Fault Injection Presets*)
- **Masalah:** Mode simulasi saat ini hanya menggerakkan angka naik-turun menggunakan gelombang sinus (`Math.sin`), sehingga kita harus menunggu beberapa saat jika ingin mendemonstrasikan kondisi *Overheat* atau *Aki Drop*.
- **Fitur yang Diusulkan:**
  - Saat mode simulasi aktif, tampilkan pilihan skenario instan:
    1. **Normal Kerja** (semua sensor di rentang hijau)
    2. **Mesin Dingin / Pemanasan** (Suhu `< 71°C`)
    3. **Simulasi Overheat** (Suhu naik ke `> 108°C`)
    4. **Simulasi Over-Speed** (RPM naik ke `> 2400 RPM`)
    5. **Simulasi Aki Drop** (Tegangan turun ke `< 22V`)

### 4. Peringatan Suara di Web (*Web Audio Alarm*) dengan Tombol *Mute*
- **Masalah:** Pada Node 2 fisik terdapat *Active Buzzer* yang berbunyi putus-putus saat *Waspada* dan berbunyi panjang saat *Bahaya*, namun operator yang memantau dari layar Web PC/HP belum mendapatkan umpan balik suara.
- **Fitur yang Diusulkan:**
  - Menggunakan *Web Audio API* bawaan browser (tanpa file audio tambahan) untuk membunyikan nada peringatan lembut saat status *Waspada* dan nada alarm saat *Bahaya*, dilengkapi tombol **Suara (On/Mute)** di bagian header.

### 5. Indikator Kecepatan Paket Data (*Packet Counter & Rate*)
- **Masalah:** Karena tabel riwayat mencatat setiap 1 detik, penguji mungkin mengira alat ESP32 hanya mengirim data 1 kali per detik, padahal transmisi CAN J1939 & MQTT QoS 1 berjalan jauh lebih cepat.
- **Fitur yang Diusulkan:**
  - Menampilkan indikator kecil di status koneksi atau footer: jumlah paket MQTT yang diterima dan laju paket per detik (contoh: `245 paket · 5 msg/dtk`).

---

## 3. Urutan Prioritas Pengerjaan yang Disarankan

1. **Prioritas 1 (Keandalan & Konsistensi):** Penyeragaman bahasa judul kartu & kolom tabel, penyimpanan riwayat ke `sessionStorage` agar tahan *refresh*, dan sinkronisasi penyimpanan Supabase.
2. **Prioritas 2 (Kemudahan Pengujian & Demo):** Fitur *Pause/Filter* pada tabel riwayat, ringkasan *Peak Hold* (Min/Max), dan skenario uji pada Mode Simulasi.
3. **Prioritas 3 (Pengalaman Pengguna & PWA):** *Web Audio Alarm* dengan tombol *Mute*, *Loading Intro* singkat saat web dibuka, dan kelengkapan icon PNG untuk instalasi PWA.

