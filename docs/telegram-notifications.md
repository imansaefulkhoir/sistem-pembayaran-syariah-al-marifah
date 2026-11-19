# Notifikasi Telegram — Panduan Konfigurasi & Pengujian

Integrasi ini mengirim notifikasi aktivitas website ke akun/grup Telegram admin
melalui **Telegram Bot API** (`https://api.telegram.org/bot<TOKEN>/sendMessage`).

Token bot **hanya** dibaca di server (environment variable). Tidak ada token,
chat ID, atau URL Telegram yang dikirim ke browser.

---

## 1. Ringkasan arsitektur project

| Aspek | Keterangan |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | React 18 + Tailwind CSS |
| Backend | Next.js Route Handlers (`src/app/api/**`) |
| Database | **localStorage** browser (mode demo). Supabase belum aktif |
| Autentikasi | Demo (belum ada verifikasi password); sesi di localStorage |

Karena data utama berada di browser, notifikasi dipicu dari aksi nyata di
client, lalu dikirim ke route server `/api/telegram/notify`. Route server yang
memegang token dan memanggil Telegram. Dengan begitu token tetap aman dan
kegagalan Telegram tidak mengganggu alur aplikasi.

---

## 2. Membuat bot & mendapatkan Chat ID

1. Buka Telegram, cari **@BotFather**.
2. Kirim `/newbot`, ikuti instruksi (nama bot & username harus unik).
3. Salin **token** yang diberikan (format `123456789:AA...`).
4. Tambahkan bot ke grup admin (atau chat pribadi admin).
5. Kirim satu pesan di grup/chat tersebut (mis. `halo`).
6. Buka di browser:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   Cari `"chat":{"id":-100...}`. Untuk grup, ID biasanya diawali `-100`.
7. Jika bot di grup dan notifikasi tidak masuk, pastikan bot tidak dibatasi
   privacy mode, atau jadikan bot admin grup.

> Jangan pernah membagikan token. Jika bocor, revoke lewat BotFather
> (`/revoke`) dan ganti di `.env.local`.

---

## 3. Konfigurasi environment

Tambahkan ke `.env.local` (jangan commit file ini):

```env
TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_NOTIFY_ENABLED=true
TELEGRAM_MAX_PER_MINUTE=30
TELEGRAM_TIMEOUT_MS=10000
TELEGRAM_TEST_SECRET=          # opsional
```

| Variabel | Wajib | Default | Fungsi |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Ya | — | Token bot dari BotFather (server-only) |
| `TELEGRAM_CHAT_ID` | Ya | — | ID chat/grup tujuan |
| `TELEGRAM_NOTIFY_ENABLED` | Tidak | `true` | `false` = matikan notifikasi tanpa hapus konfigurasi |
| `TELEGRAM_MAX_PER_MINUTE` | Tidak | `30` | Batas kirim global per menit (anti-spam) |
| `TELEGRAM_TIMEOUT_MS` | Tidak | `10000` | Timeout request ke Telegram (2.000–30.000 ms) |
| `TELEGRAM_TEST_SECRET` | Tidak | — | Kunci endpoint tes. Jika kosong, tes hanya aktif di development |

Restart dev server setelah mengubah `.env.local`:

```bash
npm run dev
```

`.gitignore` sudah mengecualikan `.env`, `.env.*`, dan hanya mengizinkan
`.env.example`, sehingga token tidak ikut ter-commit.

---

## 4. Aktivitas yang memicu notifikasi

| Event | Kapan terkirim | Sumber kode |
|---|---|---|
| `user_registered` | Akun pengguna baru disimpan | `store.addUser()` |
| `admin_login` | Login akun staf/admin (bukan wali/santri) | `src/app/login/page.tsx` |
| `invoice_created` | Tagihan tunggal diterbitkan / rekap tagihan massal | `store.createInvoice()` & `createBatchInvoices()` |
| `payment_submitted` | Wali/santri mengunggah bukti pembayaran | `store.submitPayment()` |
| `payment_verified` | Verifikator menyetujui pembayaran | `store.verifyPayment()` |
| `payment_rejected` | Verifikator menolak pembayaran | `store.verifyPayment()` |
| `cash_payment` | Bendahara mencatat pembayaran tunai | `store.recordCashPayment()` |
| `support_ticket` | Tiket/pesan baru dari form chatbot | `store.createTicket()` |
| `system_error` | Error server (API chatbot) / error browser | `api/chatbot/route.ts`, `ErrorNotifier` |

Catatan: aplikasi demo ini **belum memiliki halaman registrasi**. Event
`user_registered` sudah terpasang di `store.addUser()` sehingga otomatis aktif
begitu form registrasi ditambahkan. Login pun masih demo (password tidak
diverifikasi), jadi notifikasi login hanya menandai aktivitas, bukan bukti
autentikasi kuat.

---

## 5. Cara menguji

### A. Cek konfigurasi terbaca server

```bash
curl http://localhost:3000/api/telegram/status
```

Contoh respons:

```json
{ "configured": true, "enabled": true, "chatConfigured": true, "tokenFormatValid": true }
```

Jika `configured: false`, token/chat ID belum terbaca (cek `.env.local` dan
restart server).

### B. Tes koneksi via script (paling cepat)

```bash
npm run telegram:test
```

Script memanggil `getMe`, menampilkan username bot, lalu mengirim pesan
percobaan. Token tidak pernah dicetak.

### C. Tes koneksi via API

Development (tanpa secret):

```bash
curl -X POST http://localhost:3000/api/telegram/test
```

Dengan `TELEGRAM_TEST_SECRET`:

```bash
curl -X POST http://localhost:3000/api/telegram/test \
  -H "x-telegram-test-secret: RAHASIA_ANDA"
```

### D. Uji dari aktivitas aplikasi

1. Login sebagai staf (mis. Kepala Bendahara) → cek notifikasi `Login Admin`.
2. Buat tagihan baru → notifikasi `Tagihan Baru Diterbitkan`.
3. Unggah bukti pembayaran dari akun wali → notifikasi `Pembayaran Baru Dikirim`.
4. Setujui/tolak di menu Verifikasi → notifikasi keputusan.
5. Buat tiket dari chatbot → notifikasi `Pesan / Formulir Baru Dikirim`.

Jika Telegram belum dikonfigurasi, semua pemanggilan bersifat *no-op* dan
aplikasi tetap berjalan normal.

---

## 6. Keamanan yang diterapkan

- Token hanya di environment server; tidak ada di bundle client, HTML, atau log.
- Notifikasi client dikirim ke `/api/telegram/notify`; client tidak pernah
  menentukan chat tujuan.
- Pesan di-escape untuk `parse_mode: HTML` dan dibatasi panjangnya.
- Pola rahasia (`nvapi-...`, token bot, password/PIN/OTP, nomor kartu panjang)
  diredaksi sebelum dikirim.
- Tidak ada password, token autentikasi, atau isi percakapan chatbot yang
  diteruskan; tiket hanya mengirim subjek, kategori, prioritas, dan nomor tiket.
- Rate limit: 20 permintaan/menit per IP di route, 30 pesan/menit global di
  pengirim, plus deduplikasi 15 detik untuk event yang sama.
- Endpoint tes memakai `TELEGRAM_TEST_SECRET` (atau hanya development).
- `.env*` masuk `.gitignore`.

---

## 7. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `configured: false` | Env belum terbaca | Restart `npm run dev` |
| `403 Forbidden` dari Telegram | Bot bukan anggota grup | Tambahkan bot ke grup |
| `400 Bad Request: chat not found` | `TELEGRAM_CHAT_ID` salah | Ambil ulang via `getUpdates` |
| `401 Unauthorized` | Token salah/revoked | Buat token baru di BotFather |
| Notifikasi tidak masuk tapi status OK | Bot privacy mode / beda chat | Kirim pesan langsung ke bot atau jadikan admin grup |
| Notifikasi ganda | Aksi terkirim dari dua tab | Dedupe 15 detik; hindari submit ganda |

---

## 8. Menambah event baru

1. Tambahkan id event di `src/lib/telegram/types.ts` (`TELEGRAM_EVENTS` dan
   `TELEGRAM_EVENT_META`).
2. Panggil dari kode terkait:

```ts
import { notifyTelegramEvent } from '@/lib/telegram/client';

notifyTelegramEvent('visitor_message', {
  name: 'Budi',
  details: 'Menanyakan jadwal pembayaran.',
  url: '/bantuan',
});
```

3. Jika dipanggil dari route server, gunakan
   `import { notifyTelegramEvent } from '@/lib/telegram/server'` dan
   `void notifyTelegramEvent(...)` agar tidak menahan respons.
