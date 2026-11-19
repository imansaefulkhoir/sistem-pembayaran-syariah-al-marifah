import type {
  GuardianStudentRelation,
  Invoice,
  NotificationItem,
  Payment,
  PaymentCategory,
  Receipt,
  Student,
  SupportTicket,
  TicketCategory,
  UnitPondok,
  UserProfile,
  UserRole,
} from './types';

/**
 * BACKEND TOOLS CHATBOT — lapisan akses data resmi asisten pembayaran.
 *
 * Aturan keamanan (berlaku untuk SEMUA tools):
 * 1. `user` adalah identitas yang SUDAH diverifikasi server (sesi Supabase
 *    Auth / sesi demo tepercaya). Tools TIDAK PERNAH membaca user_id, NIS,
 *    student_id, guardian_id, invoice_id, atau role dari teks chat.
 * 2. Wali santri hanya membaca santri dengan relasi TERVERIFIKASI
 *    (`guardian_student_relations.is_verified = true`).
 * 3. Santri hanya membaca datanya sendiri (`profiles.student_id`).
 * 4. Pengurus / kepala pondok dibatasi unit (putra/putri).
 * 5. Tools bersifat READ-ONLY kecuali createSupportTicket. Tidak ada tool
 *    untuk mengubah nominal, verifikasi, hapus transaksi, atau tandai lunas.
 * 6. Penolakan akses tidak membocorkan data (pesan generik).
 * 7. Lunas = `payments.status = 'terverifikasi'` / `invoices.status = 'lunas'`.
 *    `menunggu_verifikasi` TIDAK PERNAH dianggap lunas.
 *
 * Modul ini murni (tanpa API browser) sehingga dapat dipakai di server
 * (`/api/chatbot/query`), di mode demo (adapter `store`), dan diuji di Node.
 */

export interface ChatbotDataSource {
  getStudents(): Student[];
  getInvoices(): Invoice[];
  getPayments(): Payment[];
  getReceipts(): Receipt[];
  getCategories(): PaymentCategory[];
  getNotifications(): NotificationItem[];
  getGuardianRelations(): GuardianStudentRelation[];
}

export type ToolOk<T> = { ok: true; data: T };
export type ToolErr = { ok: false; error: string };
export type ToolResult<T> = ToolOk<T> | ToolErr;

export const ACCESS_DENIED =
  'Mohon maaf, Bapak/Ibu tidak memiliki izin untuk melihat data tersebut. Jika membutuhkan bantuan, silakan hubungi bendahara melalui tiket bantuan.';
export const NOT_FOUND =
  'Data yang diminta belum tersedia dalam sistem. Silakan periksa kembali di menu Tagihan atau hubungi bendahara untuk konfirmasi.';

const STAFF_ROLES: UserRole[] = [
  'pengasuh',
  'kepala_bendahara',
  'admin_bendahara',
  'anggota_bendahara',
];

/** Unit yang boleh dibaca role ini. 'semua' = tanpa batas unit. */
function allowedUnit(user: UserProfile): 'semua' | UnitPondok {
  if (user.unitAccess === 'putra' || user.unitAccess === 'putri') return user.unitAccess;
  switch (user.role) {
    case 'kepala_pondok_putra':
    case 'pengurus_putra':
      return 'putra';
    case 'kepala_pondok_putri':
    case 'pengurus_putri':
      return 'putri';
    default:
      return 'semua';
  }
}

function inUnit(user: UserProfile, unit: UnitPondok): boolean {
  const scope = allowedUnit(user);
  return scope === 'semua' || scope === unit;
}

/**
 * Inti RBAC: daftar studentId yang boleh dibaca pengguna.
 * - wali_santri: HANYA dari relasi terverifikasi (abaikan linkedStudentIds frontend).
 * - santri: HANYA studentId miliknya sendiri.
 * - pengurus/kepala pondok: santri pada unit izinnya.
 * - bendahara & pengasuh: seluruh santri.
 */
export function getAccessibleStudentIds(user: UserProfile, ds: ChatbotDataSource): string[] {
  if (user.role === 'wali_santri') {
    return ds
      .getGuardianRelations()
      .filter((r) => r.guardianId === user.id && r.isVerified)
      .map((r) => r.studentId);
  }
  if (user.role === 'santri') {
    return user.studentId ? [user.studentId] : [];
  }
  const scope = allowedUnit(user);
  return ds
    .getStudents()
    .filter((s) => s.statusAktif && (scope === 'semua' || s.unit === scope))
    .map((s) => s.id);
}

export function canReadStudent(user: UserProfile, studentId: string, ds: ChatbotDataSource): boolean {
  return getAccessibleStudentIds(user, ds).includes(studentId);
}

/** 1. getMyStudents — santri yang boleh dilihat pengguna. */
export function getMyStudents(user: UserProfile, ds: ChatbotDataSource): ToolResult<Student[]> {
  const ids = new Set(getAccessibleStudentIds(user, ds));
  if (ids.size === 0) return { ok: false, error: ACCESS_DENIED };
  return { ok: true, data: ds.getStudents().filter((s) => ids.has(s.id)) };
}

/** 2. getMyInvoices — tagihan milik santri yang boleh diakses. */
export function getMyInvoices(user: UserProfile, ds: ChatbotDataSource): ToolResult<Invoice[]> {
  const ids = new Set(getAccessibleStudentIds(user, ds));
  if (ids.size === 0) return { ok: false, error: ACCESS_DENIED };
  return { ok: true, data: ds.getInvoices().filter((i) => ids.has(i.studentId)) };
}

/** 3. getInvoiceDetails — rincian satu tagihan (wajib lolos cek akses santri). */
export function getInvoiceDetails(
  user: UserProfile,
  invoiceId: string,
  ds: ChatbotDataSource
): ToolResult<{ invoice: Invoice; payments: Payment[]; receipt: Receipt | null }> {
  const invoice = ds.getInvoices().find((i) => i.id === invoiceId || i.nomorTagihan === invoiceId);
  if (!invoice) return { ok: false, error: NOT_FOUND };
  if (!canReadStudent(user, invoice.studentId, ds)) return { ok: false, error: ACCESS_DENIED };
  const payments = ds.getPayments().filter((p) => p.invoiceId === invoice.id);
  const receipt = ds.getReceipts().find((r) => r.invoiceId === invoice.id) || null;
  return { ok: true, data: { invoice, payments, receipt } };
}

export interface PaymentHistoryItem {
  payment: Payment;
  invoiceNomor: string;
  categoryNama: string;
  periode: string;
}

/** 4. getMyPaymentHistory — riwayat pembayaran yang berwenang dilihat. */
export function getMyPaymentHistory(
  user: UserProfile,
  ds: ChatbotDataSource
): ToolResult<PaymentHistoryItem[]> {
  const ids = new Set(getAccessibleStudentIds(user, ds));
  if (ids.size === 0) return { ok: false, error: ACCESS_DENIED };
  const invoiceMap = new Map(ds.getInvoices().map((i) => [i.id, i]));
  const items: PaymentHistoryItem[] = [];
  for (const p of ds.getPayments()) {
    if (!ids.has(p.studentId)) continue;
    const inv = invoiceMap.get(p.invoiceId);
    items.push({
      payment: p,
      invoiceNomor: inv ? inv.nomorTagihan : '-',
      categoryNama: inv ? inv.categoryNama : '-',
      periode: inv ? inv.periodeBulan : '-',
    });
  }
  return { ok: true, data: items };
}

export interface PaymentStatusInfo {
  status: Payment['status'];
  nomorPembayaran: string;
  nominal: number;
  metode: Payment['metode'];
  waktuPembayaran: string;
  alasanPenolakan?: string;
  nomorKuitansi?: string;
  isLunas: boolean;
}

/** 5. getPaymentStatus — status verifikasi berisi status DB apa adanya. */
export function getPaymentStatus(
  user: UserProfile,
  paymentIdOrNumber: string,
  ds: ChatbotDataSource
): ToolResult<PaymentStatusInfo> {
  const payment = ds
    .getPayments()
    .find((p) => p.id === paymentIdOrNumber || p.nomorPembayaran === paymentIdOrNumber);
  if (!payment) return { ok: false, error: NOT_FOUND };
  if (!canReadStudent(user, payment.studentId, ds)) return { ok: false, error: ACCESS_DENIED };
  return {
    ok: true,
    data: {
      status: payment.status,
      nomorPembayaran: payment.nomorPembayaran,
      nominal: payment.nominal,
      metode: payment.metode,
      waktuPembayaran: payment.waktuPembayaran,
      alasanPenolakan: payment.alasanPenolakan,
      nomorKuitansi: payment.nomorKuitansi,
      isLunas: payment.status === 'terverifikasi',
    },
  };
}

export interface OutstandingItem {
  invoiceId: string;
  nomorTagihan: string;
  studentNama: string;
  categoryNama: string;
  periode: string;
  nominal: number;
  sisa: number;
  tenggatWaktu: string;
  isOverdue: boolean;
  hasPendingVerification: boolean;
}

/**
 * 6. getOutstandingBalance — sisa tagihan dari data sah.
 * - Hanya invoice `belum_dibayar` / `menunggu_verifikasi` yang dihitung.
 * - `menunggu_verifikasi` dilaporkan terpisah dan TIDAK dianggap lunas.
 * - Tunggakan = melewati tenggat DAN belum lunas (tanggal hari ini > tenggat).
 */
export function getOutstandingBalance(
  user: UserProfile,
  ds: ChatbotDataSource,
  todayIso: string = new Date().toISOString().split('T')[0]
): ToolResult<{ items: OutstandingItem[]; totalSisa: number; totalTunggakan: number }> {
  const invoicesRes = getMyInvoices(user, ds);
  if (!invoicesRes.ok) return invoicesRes;
  const items: OutstandingItem[] = [];
  for (const inv of invoicesRes.data) {
    if (inv.status !== 'belum_dibayar' && inv.status !== 'menunggu_verifikasi') continue;
    const isOverdue = inv.tenggatWaktu < todayIso;
    items.push({
      invoiceId: inv.id,
      nomorTagihan: inv.nomorTagihan,
      studentNama: inv.studentNama,
      categoryNama: inv.categoryNama,
      periode: inv.periodeBulan,
      nominal: inv.nominal,
      sisa: inv.sisaTagihan,
      tenggatWaktu: inv.tenggatWaktu,
      isOverdue,
      hasPendingVerification: inv.status === 'menunggu_verifikasi',
    });
  }
  const totalSisa = items.reduce((a, i) => a + i.sisa, 0);
  const totalTunggakan = items.filter((i) => i.isOverdue).reduce((a, i) => a + i.sisa, 0);
  return { ok: true, data: { items, totalSisa, totalTunggakan } };
}

/** 7. getReceiptStatus — kuitansi hanya ada untuk pembayaran terverifikasi. */
export function getReceiptStatus(
  user: UserProfile,
  invoiceId: string,
  ds: ChatbotDataSource
): ToolResult<{ available: boolean; receipt: Receipt | null; reason: string }> {
  const detail = getInvoiceDetails(user, invoiceId, ds);
  if (!detail.ok) return detail;
  const { invoice, receipt } = detail.data;
  if (invoice.status === 'lunas' && receipt) {
    return { ok: true, data: { available: true, receipt, reason: 'Kuitansi tersedia (pembayaran terverifikasi).' } };
  }
  const reason =
    invoice.status === 'menunggu_verifikasi'
      ? 'Kuitansi belum tersedia karena pembayaran masih menunggu verifikasi bendahara.'
      : 'Kuitansi belum tersedia karena tagihan belum dibayar lunas.';
  return { ok: true, data: { available: false, receipt: null, reason } };
}

/** 8. getPaymentCategories — kategori pembayaran yang aktif. */
export function getPaymentCategories(
  _user: UserProfile,
  ds: ChatbotDataSource
): ToolResult<PaymentCategory[]> {
  return { ok: true, data: ds.getCategories().filter((c) => c.isActive) };
}

/** 9. getMyNotifications — notifikasi milik pengguna (atau perannya). */
export function getMyNotifications(
  user: UserProfile,
  ds: ChatbotDataSource,
  limit = 5
): ToolResult<NotificationItem[]> {
  const all = ds.getNotifications().filter(
    (n) => n.userId === user.id || (n.targetRole && (n.targetRole === user.role || n.targetRole === 'all'))
  );
  return { ok: true, data: all.slice(0, limit) };
}

export interface CreateTicketInput {
  kategori: TicketCategory;
  subjek: string;
  uraianMasalah: string;
}

/**
 * 10. createSupportTicket — satu-satunya tool tulis.
 * Validasi di sini; penyimpanan disuntik via `persist` agar modul tetap murni.
 */
export function createSupportTicket(
  user: UserProfile,
  input: CreateTicketInput,
  persist: (t: {
    userId: string;
    userName: string;
    userRole: UserRole;
    kategori: TicketCategory;
    subjek: string;
    uraianMasalah: string;
  }) => SupportTicket
): ToolResult<SupportTicket> {
  const subjek = input.subjek.trim();
  const uraian = input.uraianMasalah.trim();
  if (subjek.length < 5) return { ok: false, error: 'Subjek tiket minimal 5 karakter.' };
  if (uraian.length < 10 || uraian.length > 1000) {
    return { ok: false, error: 'Uraian masalah minimal 10 dan maksimal 1000 karakter.' };
  }
  const ticket = persist({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    kategori: input.kategori,
    subjek,
    uraianMasalah: uraian,
  });
  return { ok: true, data: ticket };
}

/**
 * Deteksi permintaan data keluarga lain dari teks bebas.
 * Mengembalikan true jika teks menyebut NIS (pola digit panjang) atau nama
 * santri yang TIDAK termasuk dalam daftar yang boleh diakses. ID/NIS dari
 * teks TIDAK PERNAH dipakai untuk mengambil data — hanya untuk penolakan.
 */
export function requestsForeignData(
  text: string,
  user: UserProfile,
  ds: ChatbotDataSource
): boolean {
  const lower = text.toLowerCase();
  const mentionsOtherFamily =
    lower.includes('keluarga lain') ||
    lower.includes('anak orang') ||
    lower.includes('milik orang lain') ||
    lower.includes('santri lain');
  const nisPattern = /\b\d{6,}\b/;
  if (mentionsOtherFamily || nisPattern.test(text)) {
    // Jika teks menyebut NIS/nama santri lain: pastikan bukan miliknya sendiri.
    // Karena ID dari teks tidak tepercaya, sikap aman = tolak + arahkan ke menu.
    const accessibleNames = new Set(
      getAccessibleStudentIds(user, ds).flatMap((id) => {
        const s = ds.getStudents().find((x) => x.id === id);
        return s ? [s.nama.toLowerCase(), s.nis] : [];
      })
    );
    if (nisPattern.test(text)) {
      const match = text.match(nisPattern);
      if (match && !accessibleNames.has(match[0])) return true;
    }
    if (mentionsOtherFamily) return true;
  }
  return false;
}

/** Daftar peran staf yang boleh melihat ringkasan unit (bukan data per santri asing). */
export function isStaff(user: UserProfile): boolean {
  return STAFF_ROLES.includes(user.role);
}
