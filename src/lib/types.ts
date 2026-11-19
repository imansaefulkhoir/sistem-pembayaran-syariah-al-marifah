export type UserRole =
  | 'pengasuh'
  | 'kepala_pondok_putra'
  | 'kepala_pondok_putri'
  | 'pengurus_putra'
  | 'pengurus_putri'
  | 'kepala_bendahara'
  | 'admin_bendahara'
  | 'anggota_bendahara'
  | 'wali_santri'
  | 'santri';

export interface NotificationPreference {
  telegramEnabled: boolean;
  onSubmitted: boolean;
  onVerified: boolean;
  onPartial: boolean;
  onLunas: boolean;
  onRejected: boolean;
  onCancelled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  telegramEnabled: true,
  onSubmitted: true,
  onVerified: true,
  onPartial: true,
  onLunas: true,
  onRejected: true,
  onCancelled: true,
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  /** Nomor WhatsApp wali. Terpisah dari akun Telegram. */
  whatsapp?: string;
  /** Telegram numeric user ID (bukan username / nomor WhatsApp). */
  telegramUserId?: string;
  telegramUsername?: string;
  telegramLinkedAt?: string;
  /** True hanya setelah bot menerima /start dan tautan diverifikasi server. */
  telegramVerified?: boolean;
  notificationPreference?: NotificationPreference;
  avatarUrl?: string;
  unitAccess?: 'semua' | 'putra' | 'putri';
  studentId?: string; // For santri role
  linkedStudentIds?: string[]; // For wali_santri role
  isActive: boolean;
  createdAt: string;
}

export type Gender = 'L' | 'P';
export type UnitPondok = 'putra' | 'putri';

export interface Student {
  id: string;
  no: number;
  nis: string;
  nama: string;
  jenisKelamin: Gender;
  usia: number;
  kelas: string;
  asalDaerah: string;
  unit: UnitPondok;
  statusAktif: boolean;
  waliId?: string;
  waliNama?: string;
  waliTelepon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianStudentRelation {
  id: string;
  guardianId: string;
  guardianName: string;
  guardianPhone: string;
  studentId: string;
  studentName: string;
  relationship: 'Ayah' | 'Ibu' | 'Wali';
  isVerified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
}

export type PaymentCategoryCode = 'uang_makan' | 'spp_sekolah' | 'syariah_pondok';

export interface PaymentCategory {
  id: string;
  code: PaymentCategoryCode;
  nama: string;
  deskripsi: string;
  nominalDefault: number;
  isActive: boolean;
}

export type InvoiceStatus =
  | 'belum_dibayar'
  | 'menunggu_verifikasi'
  | 'sebagian'
  | 'lunas'
  | 'dibatalkan';

export interface Invoice {
  id: string;
  nomorTagihan: string; // e.g. TGH-202610-001
  studentId: string;
  studentNis: string;
  studentNama: string;
  studentKelas: string;
  studentUnit: UnitPondok;
  categoryId: string;
  categoryCode: PaymentCategoryCode;
  categoryNama: string;
  periodeBulan: string; // e.g. "Oktober 2026"
  periodeTahun: number;
  nominal: number;
  totalDibayar: number;
  sisaTagihan: number;
  tanggalTerbit: string;
  tenggatWaktu: string;
  status: InvoiceStatus;
  catatan?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'transfer_bank' | 'qris' | 'tunai';
export type PaymentStatus =
  | 'menunggu_verifikasi'
  | 'terverifikasi'
  | 'ditolak'
  | 'dibatalkan'
  | 'kedaluwarsa';

export interface Payment {
  id: string;
  nomorPembayaran: string; // e.g. BYR-202610-001
  invoiceId: string;
  studentId: string;
  studentNama: string;
  nominal: number;
  metode: PaymentMethod;
  bankTujuan?: string; // e.g. "Bank Syariah Indonesia (BSI)", "BCA Syariah", "Bank Muamalat"
  nomorRekeningTujuan?: string;
  atasNamaRekening?: string;
  buktiPembayaranUrl?: string; // base64 or Supabase Storage URL
  namaPengirim?: string;
  bankPengirim?: string;
  nomorRef?: string;
  status: PaymentStatus;
  waktuPembayaran: string;
  catatanPembayar?: string;
  diverifikasiOlehId?: string;
  diverifikasiOlehNama?: string;
  waktuVerifikasi?: string;
  catatanVerifikasi?: string;
  alasanPenolakan?: string;
  receiptId?: string;
  nomorKuitansi?: string;
  /** ID transaksi dari payment gateway (unik, untuk idempotensi webhook). */
  gatewayTransactionId?: string;
  gatewayProvider?: string;
  gatewayEventId?: string;
  /** Sumber konfirmasi yang sah: gateway, bendahara, atau kasir tunai. */
  verificationSource?: 'gateway' | 'bendahara' | 'kasir_tunai' | 'sistem';
  /** Selisih lebih bayar yang perlu ditinjau (tidak dihapus). */
  overpaymentAmount?: number;
  /** Waktu event gateway diterapkan ke database demo. */
  gatewayAppliedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  createdAt: string;
}

export type ReceiptStatus = 'aktif' | 'dibatalkan' | 'diganti';

export interface Receipt {
  id: string;
  nomorKuitansi: string; // e.g. KWT-202610-0001
  paymentId: string;
  invoiceId: string;
  studentId: string;
  studentNis: string;
  studentNama: string;
  studentKelas: string;
  studentUnit: UnitPondok;
  kategoriNama: string;
  periode: string;
  nominal: number;
  terbilang: string;
  metodePembayaran: PaymentMethod;
  bankTujuan?: string;
  tanggalBayar: string;
  tanggalTerbit: string;
  petugasNama: string;
  catatan?: string;
  barcodeQrData: string;
  /** Status dokumen: kuitansi aktif tidak boleh diubah diam-diam. */
  status?: ReceiptStatus;
  guardianId?: string;
  guardianNama?: string;
  /** Ringkasan tagihan saat kuitansi diterbitkan (dibekukan). */
  totalTagihan?: number;
  totalTerverifikasi?: number;
  sisaTagihan?: number;
  overpayment?: number;
  statusPembayaran?: 'terverifikasi' | 'sebagian' | 'lunas';
  verifikator?: string;
  sistemVerifikator?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  replacedByReceiptId?: string;
  originalReceiptId?: string;
  /** Path aman di penyimpanan server (tidak pernah berupa URL publik). */
  pdfStoragePath?: string;
  pdfChecksum?: string;
  createdAt?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  targetRole?: UserRole | 'all';
  judul: string;
  pesan: string;
  tipe: 'info' | 'tagihan' | 'verifikasi' | 'penolakan' | 'sistem';
  link?: string;
  dibaca: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  tindakan: string; // e.g. "BUAT_TAGIHAN", "VERIFIKASI_PEMBAYARAN", "TOLAK_PEMBAYARAN", "UBAH_NOMINAL"
  rincian: string;
  ipAddress?: string;
  createdAt: string;
}

export interface PesantrenSettings {
  namaPondok: string;
  subNama: string;
  alamat: string;
  telepon: string;
  email: string;
  website: string;
  pengasuhNama: string;
  kepalaBendaharaNama: string;
  rekeningBsi: {
    namaBank: string;
    nomorRekening: string;
    atasNama: string;
  };
  rekeningBcaSyariah: {
    namaBank: string;
    nomorRekening: string;
    atasNama: string;
  };
  rekeningMuamalat: {
    namaBank: string;
    nomorRekening: string;
    atasNama: string;
  };
  qrisInfo: {
    namaMerchant: string;
    nmid: string;
    qrisImageUrl: string;
  };
  gatewayConfigured: boolean; // false = manual transfer / QRIS manual
  waGatewayConfigured: boolean; // false = simulation mode
}

export type TicketCategory =
  | 'konfirmasi_transfer'
  | 'koreksi_nominal'
  | 'kendala_upload'
  | 'pertanyaan_rekening'
  | 'lainnya';

export type TicketStatus =
  | 'menunggu_petugas'
  | 'sedang_diproses'
  | 'selesai'
  | 'ditutup';

export type TicketPriority = 'rendah' | 'sedang' | 'tinggi';

export interface SupportTicket {
  id: string;
  nomorTiket: string; // e.g. TKT-202610-0001
  userId: string;
  userName: string;
  userRole: UserRole;
  userPhone?: string;
  studentId?: string;
  studentNama?: string;
  kategori: TicketCategory;
  subjek: string;
  uraianMasalah: string;
  status: TicketStatus;
  petugasId?: string;
  petugasNama?: string;
  prioritas: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  pesan: string;
  isPetugas: boolean;
  createdAt: string;
}

export type FaqCategory =
  | 'cara_bayar'
  | 'status_transaksi'
  | 'rekening_qris'
  | 'kendala_masalah'
  | 'kuitansi'
  | 'akun_wali';

export interface ChatbotFaq {
  id: string;
  kategori: FaqCategory;
  pertanyaan: string;
  jawaban: string;
  kataKunci: string[];
  actionButtonLabel?: string;
  actionButtonLink?: string;
  isActive: boolean;
  orderIndex: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  timestamp: string;
  actionButtons?: {
    label: string;
    link?: string;
    actionPayload?: string;
    variant?: 'primary' | 'secondary' | 'escalate';
  }[];
  dataCard?: {
    title: string;
    subtitle?: string;
    status?: string;
    nominal?: number;
    details?: { label: string; value: string }[];
  };
  /**
   * Metadata internal chatbot (tidak ditampilkan ke pengguna).
   * - `confident: false` → mesin FAQ lokal tidak menemukan topik yang cocok,
   *   sehingga pertanyaan boleh diteruskan ke AI backend.
   * - `source` menandai asal jawaban agar riwayat AI tidak mencampur data pribadi.
   */
  meta?: {
    confident?: boolean;
    source?: 'local' | 'ai' | 'db' | 'policy';
  };
}

// ==========================================================================
// PEMBAYARAN OTOMATIS, KUITANSI DIGITAL, DAN NOTIFIKASI TELEGRAM
// ==========================================================================

/** Status notifikasi yang dikirim ke wali (berdasarkan status database aktual). */
export type GuardianNoticeStatus =
  | 'menunggu_verifikasi'
  | 'terverifikasi'
  | 'sebagian'
  | 'lunas'
  | 'ditolak'
  | 'dibatalkan';

export type PaymentVerificationSource = 'gateway' | 'bendahara' | 'kasir_tunai' | 'sistem';

export interface PaymentStatusHistory {
  id: string;
  paymentId: string;
  invoiceId: string;
  studentId: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  source: PaymentVerificationSource;
  note?: string;
  actorId?: string;
  actorName?: string;
  /** Kunci idempotensi agar satu perubahan status tidak dicatat/dikirim dua kali. */
  idempotencyKey: string;
  createdAt: string;
}

export type TelegramDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'no_destination'
  | 'duplicate';

export interface TelegramDeliveryLog {
  id: string;
  /** Kunci unik per pembayaran + status + tujuan. */
  idempotencyKey: string;
  guardianId?: string;
  guardianName?: string;
  /** Hanya disimpan sebagai referensi internal; UI menampilkannya tersamarkan. */
  telegramUserId?: string;
  studentId: string;
  studentNama: string;
  studentNis?: string;
  paymentId: string;
  receiptId?: string;
  nomorKuitansi?: string;
  noticeStatus: GuardianNoticeStatus;
  status: TelegramDeliveryStatus;
  attempts: number;
  messagePreview: string;
  receiptAttached: boolean;
  fallbackLinkUsed: boolean;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

/** Niat pembayaran yang didaftarkan ke server untuk validasi webhook gateway. */
export interface GatewayPaymentIntent {
  paymentId: string;
  invoiceId: string;
  studentId: string;
  studentNama: string;
  nomorPembayaran: string;
  amount: number;
  reference: string;
  metode: PaymentMethod;
  guardianId?: string;
  guardianName?: string;
  createdAt: string;
}

export interface GatewayConfirmedEvent {
  id: string;
  eventId: string;
  gatewayTransactionId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  reference: string;
  status: 'paid';
  paidAt: string;
  receivedAt: string;
  appliedAt?: string;
}

export interface GuardianTelegramLinkRecord {
  guardianId: string;
  guardianName: string;
  code: string;
  codeExpiresAt: string;
  telegramUserId?: string;
  telegramUsername?: string;
  linkedAt?: string;
  notificationsEnabled: boolean;
}

export interface PaymentReceiptSummary {
  invoiceTotal: number;
  totalVerified: number;
  remaining: number;
  overpayment: number;
  invoiceStatus: InvoiceStatus;
  noticeStatus: GuardianNoticeStatus;
}

/** Data wali yang sudah diverifikasi untuk satu santri (dipakai notifikasi). */
export interface GuardianContact {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  telegramUserId?: string;
  telegramUsername?: string;
  telegramVerified?: boolean;
  telegramLinkedAt?: string;
  notificationPreference?: NotificationPreference;
  /** Hanya santri dengan relasi terverifikasi. */
  linkedStudentIds: string[];
}

export interface GuardianRegistrationInput {
  guardianId?: string;
  name: string;
  whatsapp: string;
  email?: string;
  studentIds: string[];
  relationship: 'Ayah' | 'Ibu' | 'Wali';
  notificationsEnabled?: boolean;
}

export interface GatewayEventSummary {
  eventId: string;
  gatewayTransactionId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  reference: string;
  paidAt: string;
  receivedAt: string;
  appliedAt?: string;
}

