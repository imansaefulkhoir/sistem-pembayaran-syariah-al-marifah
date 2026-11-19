-- ========================================================================
-- SKEMA DATABASE SISTEM PEMBAYARAN SYARIAH
-- PONDOK PESANTREN KEBON KELAPA AL-MA'RIFAH
-- PostgreSQL / Supabase Migration & Seed Script
-- ========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPE ENUM
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM (
    'pengasuh',
    'kepala_pondok_putra',
    'kepala_pondok_putri',
    'pengurus_putra',
    'pengurus_putri',
    'kepala_bendahara',
    'admin_bendahara',
    'anggota_bendahara',
    'wali_santri',
    'santri'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE gender_enum AS ENUM ('L', 'P');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_pondok_enum AS ENUM ('putra', 'putri');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status_enum AS ENUM (
    'belum_dibayar',
    'menunggu_verifikasi',
    'lunas',
    'dibatalkan'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_enum AS ENUM (
    'transfer_bank',
    'qris',
    'tunai'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_enum AS ENUM (
    'menunggu_verifikasi',
    'terverifikasi',
    'ditolak',
    'kedaluwarsa'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. TABEL PROFILES (PENGGUNA & RBAC)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  role user_role_enum NOT NULL DEFAULT 'santri',
  phone VARCHAR(30),
  avatar_url TEXT,
  unit_access VARCHAR(20) DEFAULT 'semua', -- 'semua', 'putra', 'putri'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABEL SANTRI
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  no_urut INT NOT NULL,
  nis VARCHAR(30) UNIQUE NOT NULL,
  nama VARCHAR(150) NOT NULL,
  jenis_kelamin gender_enum NOT NULL,
  usia INT CHECK (usia > 0 AND usia < 100),
  kelas VARCHAR(30) NOT NULL,
  asal_daerah VARCHAR(100) NOT NULL,
  unit unit_pondok_enum NOT NULL,
  status_aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_nis ON students(nis);
CREATE INDEX IF NOT EXISTS idx_students_unit ON students(unit);
CREATE INDEX IF NOT EXISTS idx_students_kelas ON students(kelas);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status_aktif);

-- 5. TABEL RELASI WALI DAN SANTRI
CREATE TABLE IF NOT EXISTS guardian_student_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guardian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship VARCHAR(30) NOT NULL DEFAULT 'Wali', -- 'Ayah', 'Ibu', 'Wali'
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_guardian_student UNIQUE (guardian_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_student_gid ON guardian_student_relations(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_student_sid ON guardian_student_relations(student_id);

-- 6. TABEL KATEGORI PEMBAYARAN
CREATE TABLE IF NOT EXISTS payment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL, -- 'uang_makan', 'spp_sekolah', 'syariah_pondok'
  nama VARCHAR(100) NOT NULL,
  deskripsi TEXT,
  nominal_default BIGINT NOT NULL CHECK (nominal_default >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABEL INVOICES / TAGIHAN
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nomor_tagihan VARCHAR(50) UNIQUE NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES payment_categories(id) ON DELETE RESTRICT,
  periode_bulan VARCHAR(30) NOT NULL, -- e.g. "Oktober 2026"
  periode_tahun INT NOT NULL,
  nominal BIGINT NOT NULL CHECK (nominal >= 0),
  total_dibayar BIGINT NOT NULL DEFAULT 0 CHECK (total_dibayar >= 0),
  sisa_tagihan BIGINT NOT NULL CHECK (sisa_tagihan >= 0),
  tanggal_terbit DATE NOT NULL DEFAULT CURRENT_DATE,
  tenggat_waktu DATE NOT NULL,
  status invoice_status_enum NOT NULL DEFAULT 'belum_dibayar',
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Mencegah tagihan ganda untuk santri, kategori, dan periode yang sama
  CONSTRAINT uq_invoice_student_cat_period UNIQUE (student_id, category_id, periode_bulan, periode_tahun)
);

CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_periode ON invoices(periode_tahun, periode_bulan);

-- 8. TABEL PEMBAYARAN
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nomor_pembayaran VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  nominal BIGINT NOT NULL CHECK (nominal > 0),
  metode payment_method_enum NOT NULL,
  bank_tujuan VARCHAR(100),
  nomor_rekening_tujuan VARCHAR(50),
  atas_nama_rekening VARCHAR(100),
  bukti_pembayaran_url TEXT,
  nama_pengirim VARCHAR(100),
  bank_pengirim VARCHAR(50),
  nomor_ref VARCHAR(100),
  status payment_status_enum NOT NULL DEFAULT 'menunggu_verifikasi',
  waktu_pembayaran TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  catatan_pembayar TEXT,
  diverifikasi_oleh_id UUID REFERENCES profiles(id),
  waktu_verifikasi TIMESTAMPTZ,
  catatan_verifikasi TEXT,
  alasan_penolakan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 9. TABEL KUITANSI RESMI
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nomor_kuitansi VARCHAR(50) UNIQUE NOT NULL,
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  nominal BIGINT NOT NULL CHECK (nominal > 0),
  terbilang TEXT NOT NULL,
  metode_pembayaran payment_method_enum NOT NULL,
  bank_tujuan VARCHAR(100),
  tanggal_bayar DATE NOT NULL,
  tanggal_terbit DATE NOT NULL DEFAULT CURRENT_DATE,
  petugas_nama VARCHAR(150) NOT NULL,
  catatan TEXT,
  barcode_qr_data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_number ON receipts(nomor_kuitansi);
CREATE INDEX IF NOT EXISTS idx_receipts_student ON receipts(student_id);

-- 10. TABEL NOTIFIKASI
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  target_role VARCHAR(50) DEFAULT 'all',
  judul VARCHAR(150) NOT NULL,
  pesan TEXT NOT NULL,
  tipe VARCHAR(30) NOT NULL DEFAULT 'info',
  link TEXT,
  dibaca BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(dibaca);

-- 11. TABEL AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name VARCHAR(150) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  tindakan VARCHAR(100) NOT NULL,
  rincian TEXT NOT NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 12. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_student_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Contoh Kebijakan RLS (Public read for authenticated users, RBAC restrictions)
CREATE POLICY "Public read for profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public read for students" ON students FOR SELECT USING (true);
CREATE POLICY "Public read for categories" ON payment_categories FOR SELECT USING (true);
CREATE POLICY "Public read for invoices" ON invoices FOR SELECT USING (true);
CREATE POLICY "Public read for payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Public read for receipts" ON receipts FOR SELECT USING (true);
CREATE POLICY "User read notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Public read for audit_logs" ON audit_logs FOR SELECT USING (true);

-- 13. STORAGE BUCKET UNTUK BUKTI PEMBAYARAN
-- INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false) ON CONFLICT DO NOTHING;

-- ========================================================================
-- 14. MIGRASI PEMBAYARAN OTOMATIS, KUITANSI DIGITAL, DAN NOTIFIKASI WALI
-- ------------------------------------------------------------------------
-- CATATAN PENTING:
-- - Aplikasi demo saat ini BELUM memakai Supabase. Sumber data UI adalah
--   localStorage dan endpoint server memakai berkas JSON di data/runtime.
--   Blok ini adalah skema sasaran produksi, bukan klaim bahwa migrasi sudah
--   dijalankan pada proyek Supabase yang aktif.
-- - Semua perubahan bersifat aditif dan memakai IF NOT EXISTS agar aman
--   dijalankan pada database yang sudah berisi data.
-- - `ALTER TYPE ... ADD VALUE IF NOT EXISTS` memerlukan PostgreSQL 12+.
-- ========================================================================

-- 14.1 Nilai enum baru (status tagihan sebagian & pembayaran dibatalkan)
ALTER TYPE invoice_status_enum ADD VALUE IF NOT EXISTS 'sebagian';
ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS 'dibatalkan';

-- 14.2 Enum pendukung
DO $$ BEGIN
  CREATE TYPE receipt_status_enum AS ENUM ('aktif', 'dibatalkan', 'diganti');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE guardian_notice_status_enum AS ENUM (
    'menunggu_verifikasi',
    'terverifikasi',
    'sebagian',
    'lunas',
    'ditolak',
    'dibatalkan'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE telegram_delivery_status_enum AS ENUM (
    'pending',
    'sent',
    'failed',
    'skipped',
    'no_destination',
    'duplicate'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_verification_source_enum AS ENUM (
    'gateway',
    'bendahara',
    'kasir_tunai',
    'sistem'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 14.3 Profil wali: WhatsApp terpisah dari Telegram + preferensi notifikasi
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_telegram_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_submitted BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_verified BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_partial BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_lunas BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_rejected BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_on_cancelled BOOLEAN DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_telegram_user
  ON profiles(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- 14.4 Pembayaran: jejak gateway, sumber verifikasi, koreksi
ALTER TABLE payments ADD COLUMN IF NOT EXISTS diverifikasi_oleh_nama VARCHAR(150);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS nomor_kuitansi VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_provider VARCHAR(60);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_event_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_source payment_verification_source_enum;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS overpayment_amount BIGINT DEFAULT 0
  CHECK (overpayment_amount >= 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_applied_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(150);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_gateway_txn
  ON payments(gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_nomor_kuitansi
  ON payments(nomor_kuitansi)
  WHERE nomor_kuitansi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_verified_at
  ON payments(waktu_verifikasi) WHERE status = 'terverifikasi';

-- 14.5 Kuitansi: snapshot dokumen, status, koreksi, berkas PDF
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS student_nis VARCHAR(30);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS student_nama VARCHAR(150);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS student_kelas VARCHAR(30);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS student_unit unit_pondok_enum;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS kategori_nama VARCHAR(100);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS periode VARCHAR(30);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_tagihan BIGINT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_terverifikasi BIGINT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS sisa_tagihan BIGINT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS overpayment BIGINT DEFAULT 0 CHECK (overpayment >= 0);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS status_pembayaran VARCHAR(20) DEFAULT 'lunas';
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS status receipt_status_enum NOT NULL DEFAULT 'aktif';
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS guardian_nama VARCHAR(150);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS verifikator VARCHAR(150);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS sistem_verifikator VARCHAR(150);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(150);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS original_receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS replaced_by_receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pdf_sha256 VARCHAR(64);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Satu transaksi hanya boleh memiliki SATU kuitansi aktif. Nomor lama yang
-- dibatalkan/diganti tetap tersimpan sebagai arsip audit.
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_payment_id_key;
DROP INDEX IF EXISTS uq_receipts_one_active_per_payment;
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_one_active_per_payment
  ON receipts(payment_id)
  WHERE status = 'aktif';

CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_issued ON receipts(tanggal_terbit);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);

-- 14.6 Riwayat status pembayaran (audit + idempotensi notifikasi)
CREATE TABLE IF NOT EXISTS payment_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_status payment_status_enum,
  to_status payment_status_enum NOT NULL,
  source payment_verification_source_enum NOT NULL DEFAULT 'bendahara',
  note TEXT,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name VARCHAR(150),
  idempotency_key VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_status_history_key
  ON payment_status_history(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_status_history_payment
  ON payment_status_history(payment_id, created_at DESC);

-- 14.7 Tautan Telegram wali (kode verifikasi + status tertaut)
CREATE TABLE IF NOT EXISTS guardian_telegram_links (
  guardian_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  guardian_name VARCHAR(150) NOT NULL,
  code VARCHAR(20) NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  telegram_user_id BIGINT,
  telegram_username VARCHAR(100),
  linked_at TIMESTAMPTZ,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_guardian_telegram_code
  ON guardian_telegram_links(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_guardian_telegram_user
  ON guardian_telegram_links(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- 14.8 Log pengiriman notifikasi Telegram per wali
CREATE TABLE IF NOT EXISTS telegram_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key VARCHAR(250) NOT NULL,
  guardian_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  guardian_name VARCHAR(150),
  telegram_user_id BIGINT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_nama VARCHAR(150) NOT NULL,
  student_nis VARCHAR(30),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  nomor_kuitansi VARCHAR(50),
  notice_status guardian_notice_status_enum NOT NULL,
  status telegram_delivery_status_enum NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  message_preview TEXT,
  receipt_attached BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_link_used BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_deliveries_key
  ON telegram_deliveries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_status
  ON telegram_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_guardian
  ON telegram_deliveries(guardian_id, created_at DESC);

-- 14.9 Niat pembayaran gateway (validasi nominal/referensi sebelum menerima webhook)
CREATE TABLE IF NOT EXISTS gateway_payment_intents (
  payment_id UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_nama VARCHAR(150) NOT NULL,
  nomor_pembayaran VARCHAR(50) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  reference VARCHAR(120) NOT NULL,
  metode payment_method_enum NOT NULL,
  guardian_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  guardian_name VARCHAR(150),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_intents_reference
  ON gateway_payment_intents(reference);

-- 14.10 Event gateway yang sudah tervalidasi
CREATE TABLE IF NOT EXISTS gateway_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id VARCHAR(120) NOT NULL,
  gateway_transaction_id VARCHAR(120) NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  reference VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL,
  paid_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gateway_events_event
  ON gateway_events(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gateway_events_txn
  ON gateway_events(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_gateway_events_payment
  ON gateway_events(payment_id, received_at DESC);

-- 14.11 Kunci idempotensi webhook/notifikasi (anti replay)
CREATE TABLE IF NOT EXISTS processed_webhook_keys (
  key VARCHAR(200) PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14.12 Metadata berkas PDF kuitansi (bucket privat, bukan URL publik)
CREATE TABLE IF NOT EXISTS receipt_files (
  receipt_id UUID PRIMARY KEY REFERENCES receipts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14.13 RLS untuk tabel baru
ALTER TABLE payment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_files ENABLE ROW LEVEL SECURITY;

-- Contoh kebijakan baca untuk pengurus/bendahara; penulisan WAJIB melalui
-- service role/server. Ganti `true` dengan pemeriksaan role/relasi wali
-- sebelum dipakai di produksi.
CREATE POLICY "Admin read payment status history" ON payment_status_history FOR SELECT USING (true);
CREATE POLICY "Admin read telegram deliveries" ON telegram_deliveries FOR SELECT USING (true);
CREATE POLICY "Admin read gateway events" ON gateway_events FOR SELECT USING (true);
CREATE POLICY "Admin read receipt files" ON receipt_files FOR SELECT USING (false);
-- Tautan Telegram hanya boleh dibaca pemiliknya / service role.
CREATE POLICY "Guardian read own telegram link" ON guardian_telegram_links FOR SELECT USING (true);

