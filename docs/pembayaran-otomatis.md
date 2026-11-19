# Pembayaran Otomatis, Kuitansi Digital & Notifikasi Wali

Dokumen ini merangkum audit, arsitektur, alur kerja, perubahan berkas/database,
konfigurasi, hasil pengujian, dan batasan integrasi eksternal untuk fitur:

1. verifikasi pembayaran otomatis dari webhook gateway,
2. penerbitan kuitansi digital PDF yang aman dan tidak dapat dipakai ulang,
3. notifikasi Telegram per wali santri (bukan satu grup admin),
4. pemantauan pembayaran/kuitansi/notifikasi di dashboard dan Asisten Admin.

> **Status lingkungan saat ini:** aplikasi berjalan dalam **mode demo**.
> Sumber data UI adalah `localStorage`; endpoint server memakai berkas JSON di
> `data/runtime`. Supabase, payment gateway nyata, dan bot Telegram nyata
> **belum dikonfigurasi**. Semua perilaku di bawah sudah diuji dengan data
> simulasi, bukan uang atau pesan Telegram nyata.

---

## 1. Audit sistem sebelumnya

| Area | Temuan sebelum perubahan | Tindakan |
|---|---|---|
| Status tagihan | Hanya `belum_dibayar`, `menunggu_verifikasi`, `lunas`, `dibatalkan`; belum ada `sebagian` | Ditambah `sebagian`; status dihitung ulang dari pembayaran **terverifikasi** saja |
| Status pembayaran | Belum ada status `dibatalkan` dan jejak sumber verifikasi | Ditambah `dibatalkan`, `verificationSource`, `gatewayTransactionId`, `overpaymentAmount`, alasan tolak/batal |
| Verifikasi | Verifikasi manual mengubah status langsung, tanpa mesin status bersama | Dibuat mesin murni `src/lib/payments/service.ts` yang dipakai semua jalur (gateway, bendahara, kasir, simulasi) |
| Kuitansi | Nomor berurutan sederhana, satu pembayaran bisa berpotensi punya beberapa dokumen, belum ada status dokumen/koreksi | Nomor unik per bulan, satu kuitansi **aktif** per pembayaran, koreksi = batalkan + terbitkan nomor baru, tersimpan sebagai arsip |
| PDF | Layout lama, belum menyertakan total tagihan/terverifikasi/sisa/kelebihan/verifikator | Layout A4 profesional; semua field di atas + logo/emblem, status dokumen, dan catatan verifikasi |
| Notifikasi wali | Notifikasi Telegram terpusat ke satu chat admin; belum ada tautan akun wali | Ditambah tautan Telegram per wali via kode `/start`, outbox per wali, preferensi per status, dan riwayat pengiriman |
| Keamanan data wali | Halaman `/wali` dapat dibuka semua peran dan menampilkan seluruh wali | **Diperbaiki:** wali hanya melihat relasinya sendiri; santri ditolak; aksi verifikasi/relasi hanya untuk petugas berwenang |
| Chatbot admin | Belum menjawab kuitansi, verifikasi hari ini, santri sudah bayar, status kirim Telegram | Ditambah intent & formatter baru dengan RBAC yang sama; chatbot tidak pernah mengubah status pembayaran |

---

## 2. Arsitektur singkat

```
Tagihan ──► Pembayaran (menunggu_verifikasi)
                │
                ├── Webhook gateway tervalidasi ──► event tervalidasi
                │        (signature, nominal, referensi, replay)
                │
                ├── Bendahara memeriksa mutasi ──► verifikasi manual
                │
                └── Kasir tunai ─────────────────► verifikasi kasir
                                │
                                ▼
                 MESIN VERIFIKASI (pure, deterministik)
                 - hanya status sah yang dihitung
                 - cegah pembayaran ganda (ID / gateway txn)
                 - hitung lunas / sebagian / kelebihan bayar
                 - terbitkan SATU kuitansi aktif
                                │
                                ▼
                 Kuitansi (snapshot, PDF, nomor unik)
                                │
                                ▼
                 Notifikasi wali (per status, per wali)
                 - tautan Telegram terverifikasi
                 - PDF, atau tautan aman ber-token bila PDF gagal
                 - kegagalan tidak membatalkan pembayaran
```

Prinsip pemisahan:

- **`src/lib/payments/*`** = domain murni (tanpa localStorage/jaringan), dipakai
  UI, endpoint, dan pengujian.
- **`src/lib/store.ts`** = orkestrasi mode demo: menyimpan hasil ke
  `localStorage`, menulis audit log, memanggil endpoint server.
- **`src/lib/server/*`** = runtime server demo: tautan Telegram, outbox,
  intent/event gateway, berkas PDF, signature HMAC.
- **Webhook hanya memvalidasi dan mencatat event.** Penerapan event ke data
  pembayaran memakai mesin verifikasi yang sama, sehingga penomoran kuitansi
  tetap konsisten dan tidak mungkin membuat dua kuitansi.

---

## 3. Aturan status & perhitungan

### 3.1 Status pembayaran

| Status | Dihitung sebagai pemasukan? | Keterangan |
|---|---|---|
| `menunggu_verifikasi` | Tidak | Transfer manual/bukti baru; menunggu keputusan bendahara atau gateway |
| `terverifikasi` | **Ya** | Satu-satunya status yang mengurangi tagihan |
| `ditolak` | Tidak | Wajib menyimpan alasan; bukan lunas |
| `dibatalkan` | Tidak | Koreksi/pembayaran ganda; kuitansi aktif ikut dibatalkan |
| `kedaluwarsa` | Tidak | Tidak pernah dihitung |

### 3.2 Status tagihan

Dihitung ulang dari total pembayaran terverifikasi:

- `totalTerverifikasi = 0` → `belum_dibayar` (atau `menunggu_verifikasi` bila ada
  pembayaran pending).
- `0 < totalTerverifikasi < nominal` → `sebagian`.
- `totalTerverifikasi >= nominal` → `lunas` dan `sisaTagihan = 0`.
- Kelebihan bayar **tidak dihapus**: disimpan di `overpaymentAmount`,
  `receipt.overpayment`, dan ditampilkan di kuitansi/pesan wali.
- Pembayaran ganda dengan ID sama atau `gatewayTransactionId` sama hanya
  dihitung sekali (`duplicateVerifiedIds`).
- Tagihan `dibatalkan` tidak diubah oleh mesin pembayaran.

---

## 4. Alur verifikasi

### 4.1 Verifikasi otomatis (gateway)

Endpoint: `POST /api/payments/webhook`

Urutan pemeriksaan:

1. **Signature HMAC** `sha256(timestamp + "." + rawBody)` dengan
   `PAYMENT_GATEWAY_WEBHOOK_SECRET`, plus batas toleransi timestamp.
2. **Bentuk payload** (event ID, transaction ID, payment ID, amount, reference,
   status).
3. **Idempotensi**: event ID dan transaction ID yang sudah diproses ditolak
   sebagai `duplicate`.
4. **Kecocokan niat pembayaran**: payment ID harus terdaftar di
   `gateway_payment_intents`; nominal dan referensi harus sama.
5. **Hanya status sukses** (`paid`, `settlement`, `capture`, `success`,
   `succeeded`, `completed`) yang diterima.
6. Event sukses disimpan; penerapan ke pembayaran memakai mesin verifikasi yang
   sama dengan verifikasi manual.

Niat pembayaran dibuat saat tagihan dibayar melalui alur baru:
`POST /api/payments/intents`. Pembayaran demo lama yang tidak punya niat
pembayaran **tidak bisa** diverifikasi lewat simulasi gateway; UI akan
menampilkan pesan agar pembayaran dikirim ulang dari halaman tagihan.

### 4.2 Verifikasi manual (bendahara)

- Transfer manual tetap `menunggu_verifikasi` sampai bendahara memeriksa mutasi.
- Bendahara membuka **Pusat Pembayaran & Kuitansi Digital** → `Periksa` →
  `Sahkan & Terbitkan Kuitansi`.
- Catatan verifikasi boleh diisi dan akan muncul di kuitansi.
- Penolakan wajib menyimpan alasan dan **tidak** mengubah tagihan menjadi lunas.

### 4.3 Tunai / kasir

Pembayaran tunai diverifikasi melalui mesin yang sama dengan sumber
`kasir_tunai`, sehingga tetap mendapat kuitansi bernomor dan audit log.

### 4.4 Simulasi demo

- `POST /api/payments/demo-confirm` hanya untuk lingkungan non-production atau
  bila `ALLOW_DEMO_PAYMENT_SIMULATION=true`.
- Simulasi membuat payload bertanda tangan dan memanggil jalur webhook yang
  sama, bukan jalur pintas.

---

## 5. Kuitansi digital

### 5.1 Isi dokumen

Kuitansi memuat: nama & logo institusi, nomor kuitansi unik, tanggal bayar,
nama wali dan santri, NIS/kelas/unit, kategori, periode, nominal, total tagihan,
total terverifikasi, sisa tagihan, kelebihan bayar, metode, status dokumen,
catatan verifikasi, dan nama verifikator.

### 5.2 Aturan nomor & imutabilitas

- Format: `KWT-YYYYMM-NNNN` (contoh `KWT-202611-0001`).
- Nomor dihitung dari nomor tertinggi yang pernah ada, **bukan** `jumlah + 1`,
  sehingga nomor lama tidak dipakai ulang setelah pembatalan.
- Satu pembayaran hanya boleh punya **satu kuitansi aktif** (dijaga di kode dan
  unique index produksi `uq_receipts_one_active_per_payment`).
- Kuitansi terbit bersifat tetap. Koreksi dilakukan dengan:
  1. kuitansi lama → `dibatalkan` atau `diganti`,
  2. kuitansi baru diterbitkan dengan nomor baru,
  3. alasan dan pelaku tercatat di audit log.
- Menerbitkan ulang untuk pembayaran yang sama tidak membuat dokumen kedua;
  nomor baru hanya dibuat untuk koreksi resmi.

### 5.3 Penyimpanan PDF

- Mode demo: PDF disimpan server-side di `data/runtime/receipts/` (atau
  `ALMARIFAH_DATA_DIR`), bukan URL publik.
- Unduhan memakai endpoint `GET /api/receipts/:id/download?token=...`.
- Token ditandatangani HMAC dengan `RECEIPT_LINK_SECRET`, berlaku 30 menit,
  terikat pada `receiptId` + `guardianId`.
- Bila `RECEIPT_LINK_SECRET` kosong, server memakai secret sementara dan
  mencetak peringatan; tautan tidak berlaku setelah server restart.

---

## 6. Notifikasi Telegram per wali

### 6.1 Menautkan akun wali

1. Petugas/wali membuka **Wali Santri → Kelola Kontak → Buat Kode Tautan**.
2. Server membuat kode sekali pakai (berlaku 15 menit) dan deep link
   `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<KODE>` bila username bot diisi.
3. Wali membuka bot, menekan **Start**, lalu mengirim `/start <KODE>`.
4. Bot mengirim update ke `POST /api/telegram/webhook`, yang memverifikasi
   header `X-Telegram-Bot-Api-Secret-Token`.
5. Server menautkan `telegram_user_id` ke wali. Halaman wali melakukan polling
   status; tautan **tidak** disimpan sebelum server mengonfirmasi.
6. Nomor WhatsApp **tidak pernah** dipakai sebagai ID Telegram.

### 6.2 Status yang dikirim

| Status | Pesan |
|---|---|
| `menunggu_verifikasi` | Bukti diterima, **belum** lunas, menunggu pemeriksaan |
| `terverifikasi` | Pembayaran terverifikasi (umum) |
| `sebagian` | Sebagian dibayar; sisa tagihan disebutkan |
| `lunas` | Lunas, sisa Rp 0 |
| `ditolak` | Ditolak + alasan; bukan lunas |
| `dibatalkan` | Dibatalkan; bukan keberhasilan, tidak dihitung |

Status pesan selalu dibangun server dari status database/log yang sebenarnya,
bukan dari teks yang dikirim browser.

### 6.3 Pengiriman & kegagalan

- Satu perubahan status yang sah = satu kunci idempotensi
  (`paymentId|status|guardianId`). Pengiriman ulang memakai kunci yang sama.
- Status pengiriman: `sent`, `failed`, `no_destination`, `skipped`,
  `duplicate`, `pending`.
- Wali belum menautkan Telegram → `no_destination`; pesan **tidak** pernah
  diklaim terkirim.
- Preferensi wali mematikan status tertentu → `skipped`.
- Jika PDF gagal dikirim, server mengirim teks + tautan kuitansi ber-token
  (30 menit). Tidak ada URL kuitansi publik.
- Kegagalan Telegram/PDF **tidak** mengubah pembayaran, tagihan, atau kuitansi.
  Percobaan dicatat dan bisa dikirim ulang dari pusat pembayaran.

---

## 7. Berkas yang ditambah/diubah

### 7.1 Domain pembayaran (baru)

| Berkas | Fungsi |
|---|---|
| `src/lib/payments/state.ts` | Perhitungan status tagihan, duplikat, kelebihan bayar, status notifikasi |
| `src/lib/payments/service.ts` | Verifikasi, penolakan, pembatalan, penerbitan ulang kuitansi |
| `src/lib/payments/receipt.ts` | Nomor unik, kuitansi aktif, pembatalan/penggantian |
| `src/lib/payments/telegram.ts` | Pesan HTML berdasarkan status aktual, preferensi, idempotensi |

### 7.2 Runtime server (baru)

| Berkas | Fungsi |
|---|---|
| `src/lib/server/runtime-store.ts` | JSON store: tautan Telegram, outbox, intent/event gateway, PDF, HMAC, signature, gate simulasi |
| `src/lib/server/gateway.ts` | Validasi webhook & pencocokan intent |
| `src/lib/server/http.ts` | Same-origin, rate limit, parsing body aman |

### 7.3 API (baru)

| Endpoint | Fungsi |
|---|---|
| `POST /api/payments/intents` | Mendaftarkan niat pembayaran (nominal/referensi pembanding) |
| `POST /api/payments/webhook` | Menerima webhook gateway bertanda tangan |
| `GET /api/payments/events` | Event gateway yang sudah tervalidasi (untuk sinkronisasi UI) |
| `POST /api/payments/demo-confirm` | Simulasi lokal bertanda tangan (non-production) |
| `POST /api/telegram/link/start` | Membuat kode tautan wali |
| `GET /api/telegram/link/status` | Cek status tautan (polling) |
| `POST /api/telegram/webhook` | Menerima `/start` dari bot |
| `POST /api/telegram/guardian-notify` | Mengirim notifikasi ke akun wali |
| `POST /api/receipts/store` | Menyimpan PDF kuitansi |
| `GET /api/receipts/:id/download` | Unduh PDF dengan token HMAC |

### 7.4 Berkas yang diubah

- `src/lib/types.ts` — tipe status, kuitansi, wali, Telegram, gateway.
- `src/lib/store.ts` — orkestrasi verifikasi/kuitansi/notifikasi, relasi wali,
  tautan Telegram, outbox, gateway, audit log, adapter chatbot.
- `src/lib/pdf-generator.ts` — layout kuitansi A4 & `generateReceiptPdfBase64`.
- `src/lib/telegram/server.ts` — kirim pesan & dokumen ke chat wali.
- `src/app/verifikasi/page.tsx` — pusat pembayaran (statistik, tab, aksi, RBAC).
- `src/app/wali/page.tsx` — relasi wali, kontak, preferensi, tautan Telegram;
  pembatasan data per peran.
- `src/app/kuitansi/[id]/page.tsx` — status dokumen, total aktual, koreksi/batal.
- `src/lib/chatbot-admin/{intent,data,engine}.ts` — intent kuitansi, verifikasi
  hari ini, santri sudah bayar, pending, kuitansi hilang, status Telegram.
- `supabase/schema.sql` — migrasi sasaran produksi (bagian 14).
- `package.json` — skrip `test:payments`.

---

## 8. Perubahan database (sasaran produksi)

Bagian 14 `supabase/schema.sql` bersifat **aditif** dan aman dijalankan pada
database berisi data (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`).

Yang ditambahkan:

- Enum: `sebagian`, `dibatalkan`, `receipt_status_enum`,
  `guardian_notice_status_enum`, `telegram_delivery_status_enum`,
  `payment_verification_source_enum`.
- `profiles`: WhatsApp terpisah, `telegram_user_id` unik, status verifikasi,
  preferensi notifikasi per status.
- `payments`: jejak gateway, sumber verifikasi, kelebihan bayar, pembatalan,
  nama verifikator, `nomor_kuitansi` unik.
- `receipts`: snapshot santri/wali/kategori/periode, total & sisa, status
  dokumen, koreksi, path/checksum PDF.
- Unique index: satu kuitansi aktif per pembayaran.
- Tabel baru: `payment_status_history`, `guardian_telegram_links`,
  `telegram_deliveries`, `gateway_payment_intents`, `gateway_events`,
  `processed_webhook_keys`, `receipt_files`.
- RLS diaktifkan untuk tabel baru. Kebijakan contoh masih `using (true)`;
  **wajib diganti** dengan pemeriksaan role/relasi sebelum produksi.

Migrasi ini **belum dijalankan** karena proyek Supabase aktif belum tersedia.

---

## 9. Konfigurasi environment

Tambahkan ke `.env.local` (jangan commit):

```env
# Gateway pembayaran
PAYMENT_GATEWAY_WEBHOOK_SECRET=ganti-dengan-secret-panjang-acak
# ALLOW_DEMO_PAYMENT_SIMULATION=true   # hanya untuk demo lokal

# Bot Telegram
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_BOT_USERNAME=nama_bot_tanpa_at
TELEGRAM_WEBHOOK_SECRET=ganti-dengan-secret-webhook
# ALLOW_TELEGRAM_WEBHOOK_WITHOUT_SECRET=true  # hanya development

# Kuitansi
RECEIPT_LINK_SECRET=ganti-dengan-secret-hmac
NEXT_PUBLIC_APP_URL=https://domain-pondok.example

# Opsional
ALMARIFAH_DATA_DIR=C:\path\data\runtime
```

Catatan:

- Token bot yang pernah dibagikan di chat **harus dirotasi** lewat BotFather
  (`/revoke`) sebelum dipakai produksi.
- Token/secret tidak pernah dikirim ke browser dan tidak ditampilkan chatbot.
- `TELEGRAM_CHAT_ID` lama tetap dipakai untuk notifikasi admin umum; notifikasi
  wali memakai `telegram_user_id` hasil tautan.

---

## 10. Webhook, queue, dan scheduler

### 10.1 Webhook gateway

Daftarkan URL berikut di dashboard gateway:

```
POST https://domain-pondok.example/api/payments/webhook
Header: X-Gateway-Signature: <hmac>
Header: X-Gateway-Timestamp: <unix seconds>
```

Signature = `HMAC_SHA256(secret, timestamp + "." + rawBody)`.

### 10.2 Webhook Telegram

```
POST https://domain-pondok.example/api/telegram/webhook
Header: X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

Setelah deploy, daftarkan dengan `setWebhook` milik Bot API.

### 10.3 Queue / retry

- Outbox notifikasi bersifat idempotent dan disimpan di JSON store.
- Tombol **Kirim Ulang** di tab Telegram memanggil ulang endpoint dengan kunci
  yang sama.
- Di produksi, ganti outbox JSON dengan tabel `telegram_deliveries` dan proses
  retry terjadwal (mis. cron tiap 5 menit untuk status `failed`).

### 10.4 Sinkronisasi event

- `GET /api/payments/events` mengembalikan event yang sudah tervalidasi.
- UI memanggil `syncGatewayEvents()` (tombol **Sinkronkan Event Gateway**) untuk
  menerapkan event ke data pembayaran melalui mesin verifikasi.
- Di produksi, penerapan event dapat dijadikan job server setelah webhook
  tersimpan, dengan kunci idempotensi yang sama.

Contoh cron Vercel (produksi):

```json
{
  "crons": [
    { "path": "/api/payments/events", "schedule": "*/5 * * * *" }
  ]
}
```

> Endpoint cron di atas hanya contoh; putuskan apakah penerapan event dilakukan
> saat webhook masuk atau oleh worker terjadwal. Jangan menerapkan event dua
> kali — kunci idempotensi wajib dipakai.

---

## 11. Keamanan & RBAC

- Webhook wajib signature + timestamp; replay ditolak berdasarkan event ID dan
  transaction ID.
- Nominal dan referensi dicocokkan dengan niat pembayaran; status non-sukses
  tidak diproses.
- Semua akses data memakai ORM/parameter aman saat Supabase aktif; mode demo
  memakai struktur JSON tervalidasi, bukan string SQL.
- Pusat verifikasi hanya untuk `kepala_bendahara` dan `admin_bendahara`.
- Koreksi/batal kuitansi hanya untuk `kepala_bendahara` dan `admin_bendahara`.
- **Perbaikan RBAC wali:** halaman `/wali` kini
  - menampilkan hanya relasi milik wali yang login,
  - menyembunyikan aksi tambah/verifikasi relasi dari wali,
  - menolak peran `santri`,
  - memblokir perubahan kontak/tautan milik wali lain (juga di lapisan store).
- Chatbot admin memakai RBAC & scope yang sama; chatbot **tidak memiliki aksi
  tulis** dan tidak dapat mengubah status pembayaran.
- Token bot dan ID Telegram lengkap tidak pernah ditampilkan di UI/chatbot.
- Bukti pembayaran tetap disimpan di balik autentikasi; PDF kuitansi memakai
  token terbatas, bukan URL publik.

---

## 12. Hasil pengujian

### 12.1 Matriks 15 skenario wajib

Perintah: `npm run test:payments` (87 pemeriksaan).

| # | Skenario | Hasil |
|---|---|---|
| 1 | Webhook tervalidasi → terverifikasi, lunas, kuitansi terbit | Lulus |
| 2 | Nominal/referensi webhook tidak cocok → ditolak | Lulus |
| 3 | Signature salah / body diubah → ditolak | Lulus |
| 4 | Webhook replay/ganda → diproses sekali | Lulus |
| 5 | Transfer manual tetap menunggu sampai bendahara | Lulus |
| 6 | Pembayaran sebagian → `sebagian`, sisa benar | Lulus |
| 7 | Pembayaran penuh → `lunas`, sisa Rp 0 | Lulus |
| 8 | Pending/ditolak/batal/kedaluwarsa tidak dihitung | Lulus |
| 9 | Kelebihan bayar dicatat & ditandai | Lulus |
| 10 | Penolakan menyimpan alasan, bukan lunas | Lulus |
| 11 | Pembatalan bukan keberhasilan; kuitansi dibatalkan | Lulus |
| 12 | Satu transaksi hanya satu kuitansi aktif | Lulus |
| 13 | Nomor unik/tidak dipakai ulang; koreksi nomor baru | Lulus |
| 14 | Wali tanpa Telegram → tanpa tujuan, tidak mengklaim lunas | Lulus |
| 15 | Kegagalan Telegram/PDF tidak membatalkan & aman diulang | Lulus |

Ringkasan: **87 lulus, 0 gagal**.

### 12.2 Chatbot admin

Perintah: `npm run test:chatbot-admin` → **89 lulus, 0 gagal**, termasuk:

- statistik & pencarian kuitansi,
- verifikasi hari ini,
- santri sudah bayar,
- pembayaran pending bukan pemasukan,
- kuitansi terverifikasi yang hilang,
- status pengiriman Telegram per wali,
- penolakan akses untuk wali,
- token/ID Telegram tidak bocor.

Chatbot lama: `npm run test:chatbot` → **31 lulus, 0 gagal**.

### 12.3 Uji UI (browser, mode demo)

| Halaman | Hasil |
|---|---|
| `/verifikasi` | Statistik benar (pending tidak dihitung), 4 tab, pencarian/filter, aksi per peran |
| Verifikasi manual BYR-202610-0002 | Terverifikasi, kuitansi `KWT-202611-0001`, tagihan lunas, audit log |
| Notifikasi wali tanpa Telegram | Tercatat `no_destination` + alasan, tombol kirim ulang, bukan "terkirim" |
| `/wali` (bendahara) | 2 wali/3 relasi, kelola kontak, preferensi status, kode tautan `/start` |
| `/wali` (wali) | Hanya wali sendiri (1 wali/2 relasi); tanpa aksi petugas |
| `/wali` (santri) | Akses ditolak |
| `/kuitansi/rec-1` & kuitansi baru | Total tagihan/terverifikasi/sisa/kelebihan, wali, verifikator, status dokumen |
| Unduh PDF | Berhasil, `Kuitansi_KWT-202611-0001_Muhammad_Al-Fatih.pdf` (~13 KB) |
| `/asisten-admin` | Menjawab status Telegram `no_destination` + alasan tanpa membocorkan token |
| Simulasi gateway pada pembayaran lama | Ditolak dengan pesan jelas karena niat pembayaran belum terdaftar (sesuai desain) |

`npm run typecheck` lulus tanpa error.

---

## 13. Batasan & integrasi yang belum bisa diuji

1. **Supabase belum aktif.** Migrasi hanya skema sasaran; belum dijalankan.
   RLS contoh masih permisif dan wajib dikeraskan.
2. **Payment gateway nyata belum tersedia.** Signature, nominal, referensi,
   replay, dan status diuji dengan payload simulasi. Perlu uji sandbox gateway
   sebelum produksi.
3. **Bot Telegram nyata belum diuji penuh.** Tautan `/start`, pengiriman pesan,
   lampiran PDF, dan fallback tautan membutuhkan token bot, username bot,
   webhook publik, serta wali yang benar-benar menekan Start (dengan persetujuan).
4. **Penyimpanan PDF masih file/JSON demo.** Belum ada bucket privat + service
   role + audit akses produksi. Endpoint unduh sudah memakai token HMAC, tetapi
   belum terhubung ke sesi/auth server.
5. **`/api/telegram/guardian-notify` memercayai data wali/santri/pembayaran dari
   klien** (same-origin + rate limit, tanpa sesi server). Di produksi, route
   harus mengambil relasi & pembayaran dari database berdasarkan sesi, bukan
   dari payload browser, untuk mencegah kebocoran antar-wali.
6. **Simulasi gateway** hanya untuk non-production/flag eksplisit; pembayaran
   demo lama tanpa niat pembayaran tidak dapat disimulasikan.
7. **Uji beban/retry terjadwal** belum dilakukan; outbox masih proses sinkron.
8. **RBAC halaman lama** (mis. `/pengguna`) belum seragam; fokus perbaikan
   keamanan pada fitur pembayaran/wali. Sebelum produksi, audit seluruh route
   admin dan pasang guard seragam.

---

## 14. Checklist sebelum produksi

- [ ] Rotasi token bot yang pernah bocor; isi env produksi.
- [ ] Jalankan migrasi bagian 14 dan ganti kebijakan RLS contoh.
- [ ] Hubungkan intent pembayaran & webhook gateway sandbox → produksi.
- [ ] Ganti outbox/JSON dengan tabel + worker retry.
- [ ] Pindahkan PDF ke bucket privat; aktifkan checksum & audit unduhan.
- [ ] Tambahkan sesi/auth server pada route notifikasi & unduhan.
- [ ] Uji tautan Telegram dengan wali sungguhan (dengan persetujuan).
- [ ] Uji end-to-end gateway nyata + rekonsiliasi mutasi.
- [ ] Audit ulang RBAC semua route admin.
- [ ] Siapkan prosedur koreksi kuitansi & pembatalan pembayaran.
