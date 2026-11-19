# Pemetaan Database → Backend Tools Chatbot

> Status: Supabase **belum dikonfigurasi** (`.env.local` hanya berisi
> `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_URL`). Seluruh tools di bawah
> berjalan dalam **mode demo lokal** (localStorage + `demo-data.ts`) melalui
> adapter `store.chatbotSource()`. Endpoint server `/api/chatbot/query`
> mengembalikan `503 useLocal` secara jujur sampai Supabase Auth + database
> live dihubungkan. Tidak ada fitur yang diklaim terhubung sebelum diuji.

## 1. Tabel & fungsinya

| Tabel (Supabase / `supabase/schema.sql`) | Sumber demo | Fungsi |
|---|---|---|
| `profiles` | `DEMO_USERS` | Identitas + role + `unit_access` + `student_id` (santri) |
| `students` | `DEMO_STUDENTS` (100) | Data santri (NIS, nama, kelas, unit, status) |
| `guardian_student_relations` | `DEMO_GUARDIAN_RELATIONS` ⭐ baru | **Satu-satunya dasar hak akses wali** (`is_verified`) |
| `payment_categories` | `DEMO_PAYMENT_CATEGORIES` | Kategori aktif (uang makan, SPP, syariah pondok) |
| `invoices` | `DEMO_INVOICES` | Tagihan + `sisa_tagihan` + tenggat (anti-ganda via unique student+category+period) |
| `payments` | `DEMO_PAYMENTS` | Transaksi + `status` (`menunggu_verifikasi` ≠ lunas) + alasan penolakan |
| `receipts` | `DEMO_RECEIPTS` | Kuitansi (hanya untuk `lunas`/`terverifikasi`) |
| `notifications` | `DEMO_NOTIFICATIONS` | Notifikasi per user / per role |
| `audit_logs` | `DEMO_AUDIT_LOGS` | Jejak aksi (tiket chatbot tercatat sebagai `BUAT_TIKET_BANTUAN`) |
| (tiket bantuan) | `DEMO_TICKETS` + localStorage | Dibuat via `store.createTicket` (belum ada tabel di `schema.sql` — lihat §4) |

## 2. Fungsi tools (`src/lib/chatbot-tools.ts`)

| Fungsi | Tabel yang dibaca | Aturan RBAC |
|---|---|---|
| `getMyStudents` | `students` + `guardian_student_relations` | wali: relasi terverifikasi; santri: milik sendiri; pengurus/kepala: se-unit; bendahara/pengasuh: semua |
| `getMyInvoices` | `invoices` (difilter santri aksesibel) | sama |
| `getInvoiceDetails` | `invoices` + `payments` + `receipts` | tolak jika santri tagihan di luar akses |
| `getMyPaymentHistory` | `payments` + `invoices` | sama |
| `getPaymentStatus` | `payments` | `isLunas = status === 'terverifikasi'` |
| `getOutstandingBalance` | `invoices` | tunggakan = `tenggat < hari_ini` DAN belum lunas |
| `getReceiptStatus` | `invoices` + `receipts` | `available` hanya jika `lunas` + kuitansi ada |
| `getPaymentCategories` | `payment_categories` | publik login (hanya `isActive`) |
| `getMyNotifications` | `notifications` | milik user / role-nya |
| `createSupportTicket` | (via `persist`) | validasi panjang; identitas dari sesi |

Penolakan lintas-keluarga: `requestsForeignData()` — NIS/nama asing di teks
tidak pernah dipakai query; langsung tolak tanpa bocoran.

## 3. Alur chatbot

```
Widget
  ├─ answerLocally()  → store.processChatbotQuery()
  │    → backend tools lokal (RBAC relasi terverifikasi) + FAQ
  │    → jawaban DATA/angka SELALU dari sini (tidak dikirim ke AI)
  │
  └─ jika `meta.confident === false` (topik tidak dikenali)
       └─ POST /api/chatbot  (AI opsional, kunci hanya di server)
            ├─ 200 + source=ai → tampil
            ├─ 503/429/502/timeout → tampilkan jawaban lokal (tanpa error)
            └─ tidak ada identitas/NIS/data pribadi yang dikirim
```

Pertanyaan data (tagihan, tunggakan, status verifikasi, kuitansi, anak)
selalu dijawab mesin lokal sehingga angka tidak pernah "dikira-kira" AI.

## 3a. Mengaktifkan AI (opsional)

Isi di `.env.local` (JANGAN pakai prefix `NEXT_PUBLIC_`), lalu restart dev:

```env
AI_API_KEY=...            # kunci asli, hanya server
AI_MODEL=gpt-4o-mini      # sesuaikan penyedia
AI_BASE_URL=https://api.openai.com/v1
```

Base URL kompatibel OpenAI yang didukung:

| Penyedia | `AI_BASE_URL` |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |

Tanpa `AI_API_KEY`, chatbot **tetap berfungsi penuh** dengan FAQ + tools lokal.

Pengamanan integrasi AI:

- `AI_API_KEY` hanya dibaca di `src/lib/ai/server-provider.ts` (server).
- `GET /api/chatbot` hanya mengembalikan `aiConfigured` + nama model.
- Pesan berisi NIS/angka ≥6 digit **tidak diteruskan** (`reason: personal-data`).
- Permintaan password/PIN/OTP/kartu ditolak sebelum AI dipanggil.
- System prompt memuat info resmi dari `PESANTREN_INFO` (rekening & NMID asli)
  dan larangan mengarang nominal/status.
- Rate limit 20 permintaan/menit/IP + timeout 25 detik.
- Tidak ada tool AI yang bisa mengubah data (read-only).

## 4. Migrasi yang masih diperlukan (belum dibuat — menunggu DB live)

1. **Tabel tiket bantuan** (`support_tickets`, `support_ticket_messages`)
   belum ada di `schema.sql`; saat ini hanya localStorage. Buat tabel +
   RLS sebelum go-live agar tiket chatbot persisten.
2. **RLS bisher permissive** (`USING (true)` pada semua tabel di
   `schema.sql`) — wajib diperketat per role sebelum produksi.
3. **Kolom yang diasumsikan endpoint**: `profiles.auth_user_id`,
   `profiles.unit_access`, `profiles.full_name`. Pastikan ada saat migrasi
   Auth (lihat `supabase/schema.sql` — sudah mencakup ketiganya).
