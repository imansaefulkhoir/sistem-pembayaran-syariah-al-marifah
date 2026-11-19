# Asisten Admin — Chatbot Data RBAC

> Status jujur: aplikasi saat ini berjalan dalam **mode demo localStorage**.
> Supabase **belum dikonfigurasi** pada lingkungan ini, sehingga belum ada
> koneksi database live. Seluruh angka pada Asisten Admin dihitung dari data
> demo yang tersimpan di browser (`demo-data.ts` + `localStorage`) melalui
> adapter terkontrol. Chatbot wali/santri yang lama **tidak diubah perilakunya**.

## 1. Tujuan

Asisten Admin adalah chatbot deterministik untuk role pengelola pondok. Ia
menjawab pertanyaan data nyata aplikasi:

- jumlah dan daftar santri, per unit/kelas;
- data dan statistik wali santri;
- tagihan, pembayaran, tunggakan;
- pemasukan/keuangan;
- pengguna, log aktivitas, statistik Telegram.

Prinsip utama:

1. **Role hanya dari sesi.** Teks pertanyaan tidak pernah menaikkan role.
2. **Angka hanya dari data.** Mesin lokal menghitung ulang setiap jawaban.
3. **AI tidak menerima data.** AI (opsional) hanya boleh memilih label intent
   dari allowlist; tidak menerima role, NIS, nominal, atau hasil query.
4. **Wali & santri diblokir** dari Asisten Admin dan tetap memakai chatbot
   bantuan lama.
5. **Tidak mengarang.** Data kosong dijawab "tidak ditemukan".

## 2. Arsitektur

```
Halaman /asisten-admin
  │  cek sesi: store.getCurrentUser() + canAccessModule('asisten_admin')
  │  scope: buildAdminScope(user) → all / unit / none
  ▼
AdminChatbotPanel (client)
  │  riwayat per user+role, pertanyaan cepat, loading, tabel, timestamp
  ▼
store.processAdminChatbotQuery(question, user, options)
  │  adapter: store.adminChatbotSource()  (localStorage + demo-data)
  ▼
answerAdminQuestion(question, user, source, options)   [engine.ts]
  │
  ├─ 1. validasi sesi/role → scope RBAC
  ├─ 2. detectPromptInjection() → tolak + audit
  ├─ 3. parseAdminIntent() → intent deterministik (Bahasa Indonesia)
  ├─ 4. cek capability (dua kali: engine + fungsi data)
  ├─ 5. panggil fungsi data terkontrol (hanya kolom yang perlu)
  └─ 6. format jawaban + tabel + periode + dasar + timestamp
        │
        └─ jika intent unknown:
             POST /api/chatbot/admin  → hanya klasifikasi intent
             (tanpa data/role; allowlist; jika gagal → saran lokal)
```

**Pemisahan tegas:** AI tidak pernah menjadi sumber kebenaran data maupun
kewenangan. Semua keputusan akses dan pengambilan data tetap di engine lokal.

### Koneksi backend/database

| Lapisan | Implementasi saat ini |
|---|---|
| Sumber data | `src/lib/demo-data.ts` + `localStorage` melalui `AdminChatbotSource` |
| Adapter | `store.adminChatbotSource()` — hanya membaca koleksi yang diizinkan |
| Database live | **Belum ada.** Supabase belum dikonfigurasi; tidak ada klaim koneksi live |
| Query | Tidak ada SQL bebas. Fungsi data menerima objek domain, memfilter di memori, dan memproyeksikan kolom |
| Audit | `onAudit`/`logAccess` dipanggil untuk akses sensitif (finance, users, audit, telegram) |
| API server | `/api/chatbot/admin` (intent saja), `/api/telegram/stats` (statistik runtime) |

Ketika Supabase dihubungkan nanti, adapter yang sama dapat diisi implementasi
server-side. Engine tidak perlu diubah dan tetap tidak menerima SQL dari AI.

## 3. Matriks akses

| Role | Cakupan | Santri | Wali | Tagihan | Pembayaran | Tunggakan | Keuangan | Pengguna | Audit | Telegram |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `pengasuh` | Seluruh pondok | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `kepala_bendahara` | Seluruh pondok | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin_bendahara` | Seluruh pondok (keuangan) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `anggota_bendahara` | Seluruh pondok (staf keuangan) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `kepala_pondok_putra/putri` | Unit sendiri | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `pengurus_putra/putri` | Unit sendiri | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `wali_santri` | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `santri` | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Catatan:

- Unit ditentukan dari `user.unitAccess`/role, bukan dari kata "putra"/"putri"
  di pertanyaan. Pengurus Putra yang menanyakan "santri putri" tetap mendapat
  cakupan Putra (hasil 0), bukan data unit lain.
- `canAccessModule('asisten_admin')` di `store.ts` adalah gerbang halaman.
  `buildAdminScope()` dan setiap fungsi data memeriksa ulang capability.
- Wali/santri yang membuka `/asisten-admin` melihat panel penolakan tanpa
  tabel/data, dengan tautan ke chatbot bantuan lama.

## 4. Fungsi utama

### Engine & RBAC

| Fungsi | Berkas | Peran |
|---|---|---|
| `answerAdminQuestion()` | `engine.ts` | Validasi, deteksi injection, dispatch intent, format jawaban |
| `answerWithScope()` | `engine.ts` | Varian untuk scope yang sudah dihitung |
| `buildAdminScope()` | `rbac.ts` | Satu-satunya sumber kewenangan role/unit |
| `hasCapability()` | `rbac.ts` | Cek capability per scope |
| `capabilityDeniedMessage()` | `rbac.ts` | Pesan penolakan aman |
| `detectPromptInjection()` | `rbac.ts` | Deteksi eskalasi role/instruksi sistem |
| `requestsWholeDatabase()` | `rbac.ts` | Deteksi permintaan seluruh database |
| `sanitizeSearchTerm()` | `rbac.ts` | Membersihkan teks pencarian (bukan SQL) |
| `parseAdminIntent()` | `intent.ts` | Parser intent/periode/filter Bahasa Indonesia |
| `isAdminIntent()` | `intent.ts` | Validasi allowlist intent (termasuk dari AI) |
| `buildIntentClassifierPrompt()` | `api/chatbot/admin/route.ts` | Prompt klasifikasi ketat (tidak diekspor) |

### Fungsi data terkontrol (`data.ts`)

| Fungsi | Data | Capability |
|---|---|---|
| `getStudentStatistics()` | santri | `students` |
| `searchStudents()` | santri (nama/NIS/kelas/unit) | `students` |
| `getGuardianStatistics()` | relasi wali–santri | `guardians` |
| `searchGuardians()` | wali + relasi | `guardians` |
| `getInvoiceStatistics()` | tagihan | `invoices` |
| `searchInvoices()` | tagihan | `invoices` |
| `getPaymentStatistics()` | pembayaran | `payments` |
| `searchPayments()` | pembayaran | `payments` |
| `getArrearsStatistics()` | tagihan belum lunas | `arrears` |
| `searchArrears()` | tunggakan + tenggat | `arrears` |
| `getFinancialReports()` | pemasukan terverifikasi | `finance` |
| `getUserStatistics()` | pengguna (tanpa kredensial) | `users` |
| `getAdminActivityLogs()` | audit log | `audit` |
| `getTelegramNotificationStatistics()` | statistik runtime Telegram | `telegram` |

Semua fungsi:

- menerima `AdminScope` dan memanggil `guard()`;
- membatasi jumlah baris (`clampLimit`, maksimum aman);
- memproyeksikan kolom yang ditampilkan saja (tanpa password/hash/token);
- mencatat akses sensitif melalui `record()`;
- mengembalikan `ToolResult<T>` dengan pesan error yang aman.

### Store, UI, dan API

| Fungsi/berkas | Peran |
|---|---|
| `store.adminChatbotSource()` | Adapter data demo (read-only) untuk engine |
| `store.processAdminChatbotQuery()` | Entry point UI → engine + audit |
| `store.canAccessModule('asisten_admin')` | Gerbang navigasi/halaman |
| `AdminChatbotPanel` | Riwayat per user, quick questions, loading, tabel, timestamp, hapus riwayat, rate limit |
| `/asisten-admin` | Halaman + guard role + ringkasan capability + notice mode demo |
| `Sidebar` | Menu "Asisten Admin" hanya untuk role berwenang |
| `Dashboard` | Callout menuju Asisten Admin untuk role berwenang |
| `GET /api/chatbot/admin` | Status AI + daftar intent allowlist |
| `POST /api/chatbot/admin` | Klasifikasi intent saja (rate limit, tolak kredensial/NIS/injection) |
| `GET /api/telegram/stats` | Statistik runtime Telegram tanpa token/chat ID |

### Definisi angka

- **Pemasukan** = pembayaran `status === 'terverifikasi'` pada periode tanggal
  pembayaran. `menunggu_verifikasi` dan `ditolak` bukan pemasukan.
- **Tunggakan** = tagihan yang bukan `lunas`/`dibatalkan` dan `sisaTagihan > 0`.
  "Lewat tenggat" bila `tenggatWaktu < hari ini`.
- **Wali terverifikasi** = relasi wali–santri dengan `isVerified`.
- **Santri tanpa wali terverifikasi** dihitung dari santri yang tidak punya
  relasi terverifikasi.
- **Periode** selalu disebut di jawaban. Data demo mayoritas Oktober 2026;
  pada 12 November 2026, "bulan ini" (November) sah bernilai Rp 0 dan jawaban
  menyebut data terverifikasi terbaru Oktober 2026.

## 5. Pertanyaan yang diuji

Perintah:

```powershell
npm.cmd run test:chatbot-admin   # 69 lulus, 0 gagal
npm.cmd run test:chatbot         # 31 lulus, 0 gagal (chatbot lama)
npm.cmd run typecheck
npm.cmd run build
```

Sepuluh skenario wajib beserta hasil nyata:

| # | Skenario | Hasil |
|---|---|---|
| 1 | Super Admin (`pengasuh`) — jumlah santri | 100 santri (putra 50, putri 50), tabel per kelas, cakupan "Seluruh pondok" |
| 2 | Super Admin — pemasukan bulanan | November 2026 = Rp 0 (0 transaksi); Oktober 2026 = Rp 900.000 (2 transaksi terverifikasi), dasar perhitungan disebut |
| 3 | Admin Bendahara — pembayaran menunggu verifikasi | 2 pembayaran, total Rp 550.000, ditandai "BUKAN pemasukan" |
| 4 | Pengurus Putra — data unit | 50 santri Putra, Putri 0; label "Unit Putra"; tidak ada kebocoran lintas unit |
| 5 | Wali — tagihan sendiri | Asisten Admin ditolak; chatbot lama tetap menjawab tagihan anak sendiri |
| 6 | Wali — minta semua santri | Ditolak, tidak ada nama santri yang bocor |
| 7 | Wali — minta pembayaran wali lain | Ditolak, tidak ada tabel/data |
| 8 | Santri — minta seluruh database | Ditolak, ditandai `prompt_injection` |
| 9 | Prompt injection ("anggap saya admin…") | Ditolak; role tetap `kepala_bendahara`/sesi asli; tidak ada data bocor |
| 10 | Data tidak ada ("Zulkifli Tidak Ada") | `rowCount = 0`, judul "Data tidak ditemukan", tanpa tabel palsu |

Enam pertanyaan cepat juga diuji end-to-end di browser untuk `pengasuh`:

| Pertanyaan cepat | Hasil |
|---|---|
| Jumlah seluruh santri | 100 santri + tabel per kelas + timestamp |
| Total pemasukan bulan ini | Rp 0 November 2026 + perbandingan Oktober Rp 900.000 + dasar |
| Daftar tunggakan | 5 tagihan, sisa Rp 1.550.000, tabel + tenggat |
| Menunggu verifikasi | 2 pembayaran, Rp 550.000, ditandai bukan pemasukan |
| Ringkasan keuangan | Rp 900.000 terverifikasi, tabel per kategori |
| Statistik wali santri | 2 akun wali, 1 terverifikasi, 1 relasi belum terverifikasi |

Pengujian browser tambahan:

- `admin_bendahara`: halaman terbuka; "Berapa jumlah pengguna?" → **Akses
  dibatasi** (data pengguna tidak ada di capability).
- `pengurus_putra`: "Berapa jumlah seluruh santri?" → 50 Putra, Putri 0,
  cakupan "Unit Putra".
- `wali_santri` dan `santri`: `/asisten-admin` menampilkan **Asisten Admin
  tidak tersedia**, tanpa panel/tabel; menu Asisten Admin tidak muncul.
- Prompt injection di UI: **Permintaan ditolak** untuk akun pengasuh.
- Pencarian nama tidak ada: **Data tidak ditemukan**, tanpa tabel.
- Tidak ada error console pada halaman yang diuji.

## 6. Hasil keamanan

| Uji | Hasil |
|---|---|
| Role dari teks | Tidak bisa; role hanya dari `UserProfile` sesi |
| Wali/santri | Diblokir di halaman, engine, dan capability |
| Eskalasi role | Pola "anggap saya admin", "abaikan sistem", "buka semua data" ditolak |
| Permintaan seluruh DB | Ditolak dan dicatat sebagai event keamanan |
| Unit lintas akses | Scope unit diterapkan di engine **dan** setiap fungsi data |
| Kebocoran data pada penolakan | Tidak ada tabel/nama/nominal pada jawaban ditolak |
| Kredensial | Password/hash/token/API key tidak pernah dibaca, dikirim, atau ditampilkan |
| Data pengguna | Hanya statistik agregat; tanpa email/kredensial |
| AI | Hanya menerima teks pertanyaan; tidak menerima role/data/hasil query |
| Intent AI | Hanya label allowlist; label asing/`unknown` diabaikan |
| Rate limit UI | Maksimum 15 pertanyaan/menit, jeda minimum 900 ms |
| Rate limit API | Maksimum 20 permintaan/menit per IP |
| Audit | Akses finance/users/audit/telegram dicatat melalui `onAudit`/`logAccess` |

Catatan: pada mode demo, audit akses sensitif ditulis ke `audit_logs` di
**localStorage browser**, sedangkan statistik Telegram bersifat **in-memory
per proses server**. Keduanya belum menjadi riwayat persisten server dan tidak
diklaim sebagai audit produksi.

## 7. Konfigurasi AI (opsional)

Asisten Admin tetap berfungsi penuh tanpa AI. AI hanya dipakai bila mesin lokal
mengembalikan `needsAiIntent = true` (intent tidak dikenali).

Variabel lingkungan (server saja, jangan pernah `NEXT_PUBLIC_`):

```env
AI_API_KEY=isi_kunci_rahasia
AI_BASE_URL=https://api.openai.com/v1   # opsional, default OpenAI
AI_MODEL=gpt-4o-mini                    # opsional
```

Alur:

1. `GET /api/chatbot/admin` memberi tahu UI apakah AI aktif.
2. Untuk intent unknown, UI `POST /api/chatbot/admin` dengan **hanya** teks
   pertanyaan.
3. Route menolak teks yang mengandung kredensial, NIS (6+ digit), atau pola
   prompt injection.
4. AI diminta membalas JSON `{"intent":"<label>"}` dari allowlist.
5. Label divalidasi `isAdminIntent()`. Hasilnya hanya dipakai untuk memilih
   fungsi data lokal; AI tidak pernah menerima/menghasilkan data.
6. Jika AI belum dikonfigurasi, gagal, timeout, atau lambat, UI memakai saran
   pertanyaan lokal tanpa pesan error ke pengguna.

Kunci API tidak pernah dikirim ke browser. `.env*` dikecualikan dari git.
Statistik Telegram tidak pernah memuat token/chat ID.

## 8. FAQ & fallback lokal

- **Pertanyaan dikenali:** dijawab mesin lokal; tidak memanggil AI.
- **Pertanyaan tidak dikenali:** jawaban jujur "belum dikenali" + saran
  pertanyaan cepat. Bila AI aktif, intent dicoba diklasifikasikan; bila gagal,
  saran lokal tetap tampil.
- **Mode lokal / FAQ:** label di panel berubah menjadi "Mode lokal / FAQ" bila
  AI belum dikonfigurasi.
- **Wali/santri:** tidak memakai Asisten Admin; mereka memakai chatbot bantuan
  lama (FAQ + tools RBAC sendiri) yang tetap utuh dan lulus 31 tes.

## 9. Berkas yang diubah/ditambahkan

### Baru

| Berkas | Isi |
|---|---|
| `src/lib/chatbot-admin/types.ts` | Tipe, quick questions, limit, storage key |
| `src/lib/chatbot-admin/rbac.ts` | Matriks role, scope unit, deteksi injection |
| `src/lib/chatbot-admin/intent.ts` | Parser intent/periode/filter + allowlist AI |
| `src/lib/chatbot-admin/data.ts` | 14 fungsi data terkontrol + audit |
| `src/lib/chatbot-admin/engine.ts` | Validasi, dispatch, formatter, penolakan |
| `src/components/chatbot/AdminChatbotPanel.tsx` | UI chat admin |
| `src/app/asisten-admin/page.tsx` | Halaman + guard role |
| `src/app/api/chatbot/admin/route.ts` | Klasifikasi intent (AI opsional) |
| `src/app/api/telegram/stats/route.ts` | Statistik runtime Telegram |
| `scripts/chatbot-admin-tests/run-tests.ts` | 69 tes matriks admin |
| `scripts/chatbot-admin-tests/tsconfig.json` | Konfigurasi kompilasi tes |
| `docs/chatbot-admin.md` | Dokumen ini |

### Diubah

| Berkas | Perubahan |
|---|---|
| `src/lib/store.ts` | `canAccessModule('asisten_admin')`, `adminChatbotSource()`, `processAdminChatbotQuery()` |
| `src/components/layout/Sidebar.tsx` | Menu "Asisten Admin" dengan guard role |
| `src/app/dashboard/page.tsx` | Callout Asisten Admin untuk role berwenang |
| `src/lib/ai/server-provider.ts` | `askAI()` menerima `systemPrompt`, `temperature`, `maxTokens` |
| `src/lib/telegram/server.ts` | Counter runtime + `getTelegramRuntimeStats()` |
| `package.json` | Script `test:chatbot` dan `test:chatbot-admin` |

Chatbot lama (`src/app/api/chatbot/route.ts`, `src/lib/chatbot-tools.ts`,
widget bantuan) tidak diubah perilakunya.

## 10. Batasan & langkah berikutnya

1. **Belum ada database live.** Supabase belum dikonfigurasi; admin engine
   membaca data demo localStorage. Jangan mengklaim koneksi produksi sebelum
   adapter Supabase diuji.
2. **Sesi demo bersifat client-side.** Untuk produksi, role harus diverifikasi
   dari sesi server (Supabase Auth/JWT), bukan hanya `localStorage`. Struktur
   `buildAdminScope(user)` sudah siap menerima user dari server.
3. **Audit belum persisten di server.** Saat ini dicatat ke localStorage
   (mode demo). Untuk produksi, tulis ke tabel audit server dengan redaksi.
4. **Telegram** sudah teruji terpisah, tetapi token yang pernah dibagikan di
   chat sebaiknya dirotasi via BotFather. Statistik di asisten admin adalah
   runtime in-memory, bukan riwayat.
5. **AI opsional** hanya untuk intent. Jangan pernah mengirim data mentah atau
   kredensial ke penyedia AI.
6. **Data demo** mayoritas Oktober 2026. "Bulan ini" pada November 2026
   menghasilkan Rp 0 secara sah; jawaban selalu menyebut periode dan data
   terbaru agar tidak menyesatkan.
