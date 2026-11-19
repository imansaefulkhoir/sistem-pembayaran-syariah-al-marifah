# Sistem Pembayaran Syariah Pondok Pesantren Kebon Kelapa Al-Ma'rifah

> **Sistem Administrasi Pembayaran Pondok Pesantren Syariah Terpadu** untuk Uang Makan, SPP Sekolah/Madrasah, dan Syariah Asrama Pondok. Dibuat dengan prinsip amanah, bebas riba, transparan, dan akuntabel.

---

## 🕌 Identitas Pondok Pesantren
- **Nama Pondok**: Pondok Pesantren Kebon Kelapa Al-Ma'rifah
- **Tagline**: Pusat Pembinaan Akhlak Mulia & Kajian Kitab Kuning
- **Alamat**: Jl. Pesantren Kebon Kelapa No. 09, Kec. Cirebon, Jawa Barat
- **Pengasuh**: KH. Ahmad Maruf & Ibu Nyai Hj. Masruroh
- **Kepala Bendahara**: Ust. H. Syarif Hidayat, M.E.
- **Warna Utama**: Hijau Islami (Emerald Green), Putih Bersih, dan Emas (Golden Yellow) sesuai logo resmi pondok.

---

## 🛠️ Tumpukan Teknologi (Tech Stack)
1. **Frontend & Backend**: Next.js 14 (App Router) dengan TypeScript
2. **Desain & Styling**: Tailwind CSS & Vanilla CSS (Responsive Mobile, Tablet, Desktop)
3. **Ikonografi**: Lucide React
4. **Database & Storage**: PostgreSQL / Supabase Migration Ready (`supabase/schema.sql`) dengan Local Reactive State Adapter
5. **Ekspor Dokumen**: `jspdf` (Penerbitan Kuitansi Resmi & Laporan PDF)
6. **Ekspor & Impor Data**: Native CSV Engine untuk 100 Santri

---

## 👥 10 Peran Pengguna & Matriks Hak Akses (RBAC)

| No | Peran (Role) | Kewenangan & Hak Akses |
|---|---|---|
| 1 | **Ibu Nyai / Pengasuh** (`pengasuh`) | Dashboard keseluruhan pondok, total pemasukan, dana terverifikasi, tunggakan, laporan transparansi, audit log. Read-only untuk transaksi. |
| 2 | **Kepala Pondok Putra** (`kepala_pondok_putra`) | Monitoring santri putra, tagihan putra, dan laporan asrama putra. |
| 3 | **Kepala Pondok Putri** (`kepala_pondok_putri`) | Monitoring santri putri, tagihan putri, dan laporan asrama putri. |
| 4 | **Pengurus Putra** (`pengurus_putra`) | Melihat data dan status pembayaran santri pada unit asrama putra. |
| 5 | **Pengurus Putri** (`pengurus_putri`) | Melihat data dan status pembayaran santri pada unit asrama putri. |
| 6 | **Kepala Bendahara** (`kepala_bendahara`) | Mengelola kategori tarif, menerbitkan tagihan massal/individu, verifikasi pembayaran, kelola staf keuangan, pengaturan rekening pondok. |
| 7 | **Admin Bendahara (Kasir)** (`admin_bendahara`) | Memeriksa bukti transfer/QRIS, mencatat pembayaran tunai di kasir, menyetujui/menolak pembayaran dengan alasan wajib, menerbitkan kuitansi. |
| 8 | **Anggota Bendahara** (`anggota_bendahara`) | Membantu pencatatan pembayaran tunai, melihat tagihan tanpa izin menghapus atau mengubah rekening. |
| 9 | **Wali Santri** (`wali_santri`) | Melihat dan membayar seluruh tagihan anak-anak yang terhubung ke akunnya, unggah bukti bayar, unduh kuitansi resmi. |
| 10 | **Santri** (`santri`) | Melihat tagihan dan riwayat pembayaran sendiri serta mengunggah bukti bayar secara mandiri. |

---

## 🚀 Panduan Menjalankan Aplikasi di VS Code

### 1. Prasyarat
- Komputer Windows, macOS, atau Linux
- **Node.js** (v18 atau lebih baru) dan **npm**
- Editor **Visual Studio Code**

### 2. Langkah Instalasi Cepat

Buka **Visual Studio Code**, buka folder proyek ini, lalu buka Terminal (`Ctrl + ~` atau `Terminal -> New Terminal`):

```bash
# 1. Pastikan dependensi telah terpasang
npm install

# 2. Jalankan server pengembangan lokal
npm run dev
```

Buka peramban (browser) Anda dan akses:
👉 **`http://localhost:3000`**

---

## ⚡ Fitur Uji Coba Cepat (1-Click Test Drive)
Aplikasi dilengkapi fitur **Quick Role Switcher** di bagian atas (Header) dan halaman Login:
1. Klik tombol **"Uji Peran"** pada header navigasi.
2. Pilih salah satu dari 10 peran sistem (misal: *Ibu Nyai/Pengasuh*, *Kepala Bendahara*, *Admin Bendahara*, *Wali Santri*, atau *Santri*).
3. Halaman, menu navigasi, dan hak akses data akan otomatis menyesuaikan seketika!

---

## 📦 Data Demo 100 Santri
Sistem telah dilengkapi dengan data 100 contoh santri:
- **50 Santri Putra** (NIS `202401001` s/d `202401050`)
- **50 Santri Putri** (NIS `202402001` s/d `202402050`)
- Kolom lengkap: `No, NIS, Nama Santri, L/P, Usia, Kelas, Asal Daerah`.
- Berkas CSV demo dapat diunduh di: `public/demo/100_santri_demo.csv`.
- Pada halaman **Data Santri**, tersedia tombol **"Reset Demo"** untuk mengembalikan seluruh data seperti semula kapan saja.

---

## 💰 Kategori Pembayaran & Alur Transaksi
1. **Uang Makan Santri**: Biaya katering makan 3x sehari bergizi untuk santri mukim (Rp 450.000).
2. **SPP Sekolah / Madrasah**: Iuran operasional pendidikan formal madrasah (Rp 300.000).
3. **Syariah Pondok**: Iuran sarana asrama, listrik, air, kebersihan, dan kitab (Rp 250.000).

### Alur Pembayaran Syariah:
1. **Penerbitan Tagihan**: Bendahara menerbitkan tagihan per santri atau massal dengan validasi *anti-duplikasi*.
2. **Pembayaran Wali/Santri**: Wali/santri memilih tagihan, mentransfer ke **BSI (7128-4455-90)** atau **BCA Syariah (0823-1122-33)** atau scan **QRIS Syariah**, lalu mengunggah bukti resi transfer.
3. **Antrean Verifikasi**: Pembayaran berstatus `Menunggu Verifikasi`. Admin bendahara memeriksa bukti dan mutasi rekening:
   - **Setujui**: Tagihan menjadi `Lunas` dan otomatis diterbitkan Kuitansi sah bernomor unik (contoh: `KWT-202610-0001`).
   - **Tolak**: Admin bendahara wajib mengisikan alasan penolakan (contoh: *Mutasi dana belum masuk di rekening BSI*), status invoice kembali menjadi *Belum Dibayar*, dan notifikasi dikirimkan ke wali santri.
4. **Pembayaran Tunai**: Petugas kasir bendahara dapat mencatat pembayaran tunai langsung di kantor pondok dengan penerbitan kuitansi instan.

---

## 📄 Kuitansi & Laporan Transparansi
- **Kuitansi Resmi**: Dilengkapi kop surat pondok, nomor kuitansi unik, terbilang otomatis dalam bahasa Indonesia, barcode QR validasi, cap lunas, dan nama petugas. Dapat langsung dicetak (`Ctrl + P`) atau diunduh sebagai **PDF**.
- **Laporan Transparansi**: Rekapitulasi total tagihan, pembayaran sah, nominal tunggakan, serta daftar santri menunggak. Dapat difilter berdasarkan periode, kategori, kelas, dan unit putra/putri, serta diekspor ke **CSV** dan **PDF**.

---

## 🔒 Konfigurasi Supabase (Opsional)
Skema PostgreSQL lengkap telah tersedia di file:
`supabase/schema.sql`

Untuk menghubungkan ke database cloud Supabase Anda:
1. Buat proyek baru di [supabase.com](https://supabase.com).
2. Jalankan perintah SQL pada file `supabase/schema.sql` melalui SQL Editor di Supabase.
3. Salin URL dan Anon Key ke file `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://proyek-anda.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-anda
```

---

## 📁 Struktur Direktori
```
project 2/
├── public/
│   ├── images/
│   │   ├── logo.svg              # Logo resmi pesantren
│   │   └── qris-demo.svg         # Aset QRIS syariah
│   └── demo/
│       └── 100_santri_demo.csv   # Data demo 100 santri
├── src/
│   ├── app/
│   │   ├── dashboard/page.tsx    # Dashboard multi-role & live KPI
│   │   ├── santri/page.tsx       # Manajemen 100 santri & CSV
│   │   ├── wali/page.tsx         # Manajemen relasi wali & anak
│   │   ├── tagihan/page.tsx      # Tagihan & batch invoicing
│   │   ├── tagihan/[id]/page.tsx # Rincian & form bayar transfer/QRIS/tunai
│   │   ├── verifikasi/page.tsx   # Antrean verifikasi bendahara
│   │   ├── transaksi/page.tsx    # Riwayat mutasi transaksi
│   │   ├── kuitansi/page.tsx     # Arsip kuitansi sah
│   │   ├── kuitansi/[id]/page.tsx# Dokumen kuitansi cetak & PDF
│   │   ├── laporan/page.tsx      # Laporan transparansi & tunggakan
│   │   ├── notifikasi/page.tsx   # Pusat notifikasi & arsitektur WA
│   │   ├── pengguna/page.tsx     # Manajemen hak akses RBAC & audit log
│   │   ├── pengaturan/page.tsx   # Pengaturan rekening pondok
│   │   └── login/page.tsx        # Portal login & role tester
│   ├── components/               # Komponen UI responsif
│   └── lib/                      # Store, types, demo data, PDF generator
├── supabase/
│   └── schema.sql                # Skema migrasi PostgreSQL & RLS
├── docs/
│   ├── pembayaran-otomatis.md    # Audit, alur webhook/kuitansi/Telegram, tes & batasan
│   ├── telegram-notifications.md # Konfigurasi bot & notifikasi admin
│   └── chatbot-admin.md          # Panduan Asisten Admin
├── scripts/
│   └── setup-github.ps1          # Inisialisasi git + cek file sensitif
├── .env.example                  # Template variabel lingkungan
├── LICENSE                       # Hak cipta / seluruh hak dilindungi
└── README.md                     # Petunjuk instalasi & penggunaan
```

### Menyiapkan repository GitHub

Setelah Git terpasang, jalankan dari folder proyek:

```powershell
.\scripts\setup-github.ps1
.\scripts\setup-github.ps1 -RepoUrl "https://github.com/nama/repo.git" -Commit
```

Skrip ini melakukan `git init`, `git add .`, menampilkan daftar berkas yang
akan di-commit, dan memastikan `.env.local`, `data/runtime/`, `node_modules/`,
serta `.next/` tidak ikut ter-upload.

## 🚦 Siap produksi?

Produk ini **masih bermode demo**: data utama di `localStorage`, runtime server
di `data/runtime`, dan integrasi gateway/Telegram/Supabase belum live. Sebelum
dipakai untuk transaksi nyata, ikuti checklist di
`docs/pembayaran-otomatis.md` (rotasi token, migrasi + RLS, auth server,
penyimpanan PDF privat, uji sandbox gateway, dan uji tautan Telegram wali).

*Alhamdulillah, Sistem Pembayaran Syariah Pondok Pesantren Kebon Kelapa Al-Ma'rifah siap dijalankan.*
