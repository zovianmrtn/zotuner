# ZoTuner — hasil QA calon rilis VPS

21 November 2026. Pengujian memakai build produksi statis pada Windows. Hasil mendukung staging HTTPS. Persetujuan rilis publik masih membutuhkan pengujian perangkat fisik dan konfigurasi domain VPS.

## Akurasi deteksi

Sinyal sintetis mencakup sinus, petikan dengan harmonik dan peluruhan, serta sawtooth terbatas pita. Matriks menggunakan 44,1 / 48 / 96 kHz, 60–1.000 Hz, termasuk offset −17 dan +13 cent. Noise memakai seed tetap supaya regresi bisa direproduksi. Metrik adalah nilai absolut kesalahan frekuensi dalam cent, sebelum penghalusan UI.

| Kondisi | Build sebelumnya | Calon rilis |
|---|---:|---:|
| SNR 20 dB, kasus di luar ±1 cent | 182/333 | 0/333 |
| SNR 20 dB, p95 / maksimum | 6,61 / 13,16 cent | 0,47 / 0,93 cent |
| SNR 80 dB, kasus di luar ±1 cent | 4/333 | 0/333 |
| SNR 80 dB, p95 / maksimum | 0,17 / 7,81 cent | 0,08 / 0,20 cent |

Baseline memakai jendela uji 2.048 sampel pada 44,1/48 kHz dan 4.096 pada 96 kHz. Calon rilis memakai jendela produksi sekitar 64 ms. Perbandingan mengukur perubahan algoritma dan jendela bersama-sama. Harmonik kedua atau ketiga yang lebih kuat diuji pada 30 kombinasi. Hening, DC, sinyal di bawah ambang, dan 90 blok white noise juga diuji.

## Pengujian aplikasi

| Area | Bukti |
|---|---|
| Chrome 157, Edge 158, Firefox 159 | Stream sintetis melalui Web Audio. Enam nada standard berurutan mencapai 6/6, pemutaran referensi, kembali ke hening, reset progres, pause menghentikan track. |
| Izin dan pemulihan | Simulasi izin ditolak, perangkat hilang, mic sibuk, lalu sukses setelah retry. Di Chrome, membatalkan permintaan sebelum izin diberikan tetap menghentikan track yang datang terlambat. |
| Perangkat dan preferensi | Delapan preset dapat dipilih. Kalibrasi 432 Hz bertahan setelah reload. Batas 410/480, desimal, storage diblokir, dan tombol Escape diuji di Chrome. |
| Stabilitas | Input WAV Chromium mengunci A2. Lonjakan 220 Hz selama 80 ms di antara bagian 110 Hz tidak mengganti target. Nada G3 berikutnya dipilih. |
| Layout dan aksesibilitas | Lebar 360, 390, 768, 1024, 1280 diperiksa terhadap overflow horizontal. Axe pada layar awal desktop melaporkan nol pelanggaran di empat engine/browser yang diuji. Lighthouse lokal mode mobile, Performance 99 dan Accessibility 100. |
| WebKit 27.2 Windows | Preset, layout, axe dan tampilan browser tanpa audio diuji. Runtime ini tidak menyediakan Web Audio atau mediaDevices. |
| Distribusi | Instal bersih dari lockfile, type-check, Vite production build, 27 tes otomatis, npm audit tanpa temuan pada waktu audit. File statis diuji dengan CSP dan Permissions-Policy yang disertakan. |

Pengukuran respons Chrome memakai 24 perubahan sintetis bolak-balik ±20 cent pada A2. Waktu dihitung dari perubahan frekuensi oscillator sampai teks cents melintasi 2 cent ke arah baru, dipantau per animation frame. P95 AudioWorklet 99,4 ms dan fallback AnalyserNode 83,6 ms. Ini satu run lokal, tanpa perjalanan suara melalui speaker, ruangan, dan mikrofon. Pergantian senar yang sudah aktif memiliki jeda konfirmasi tersendiri untuk menghindari salah target.

## Reproduksi

1. Jalankan `npm ci`, `npm test`, dan `npm run build`.
2. Sajikan folder `dist/` di localhost port 4188. Untuk URL staging alternatif, set `ZOTUNER_TEST_URL` pada sesi pengujian.
3. Siapkan Chrome dan Edge serta browser Playwright melalui `npx playwright install firefox webkit`. Jalankan `npm run test:browser`. Tes browser membuat konteks baru dan memakai masukan sintetis.
4. Untuk uji respons dan pembatalan izin di Chrome, jalankan `node tests/latency.cjs` dan `node tests/lifecycle.cjs` terhadap server lokal atau URL uji.

## Sebelum membuka akses publik

- Sajikan isi build di root domain HTTPS. Pastikan respons JavaScript dan AudioWorklet memiliki MIME JavaScript. Terapkan header di `public/_headers` melalui konfigurasi Nginx/Caddy. File tersebut sendiri tidak mengatur header pada Nginx.
- Buka domain staging di Safari iPhone dan Chrome Android dengan gitar nyata. Uji senar C2, E2 dan E4, petikan kuat dan lemah, izin mic, cabut/pasang input, tab background dan kembali, pause dan resume. Bandingkan dengan tuner referensi.
- Verifikasi target latensi fisik p95 ≤100 ms dan CPU pada HP kelas menengah. Benchmark browser desktop sintetis tidak mencakup kedua kondisi tersebut.
- Pastikan server memberi 200 untuk halaman, aset, dan worklet. Periksa header dari luar VPS, lakukan uji mic pada origin HTTPS tersebut, lalu simpan versi sebelumnya untuk rollback.

