import type { PaymentCategoryCode, PaymentMethod, PaymentStatus, UnitPondok } from '../types';
import type { PeriodFilter } from './types';

/**
 * PARSER INTENT BAHASA INDONESIA (DETERMINISTIK).
 *
 * Tidak ada model AI di jalur ini. Semua pemetaan pertanyaan → fungsi backend
 * dilakukan dengan aturan kata kunci yang dapat diuji dan diaudit.
 */

export type AdminIntent =
  | 'student_count'
  | 'student_list'
  | 'guardian_stats'
  | 'guardian_list'
  | 'invoice_stats'
  | 'invoice_list'
  | 'payment_stats'
  | 'payment_list'
  | 'arrears_stats'
  | 'arrears_list'
  | 'finance_report'
  | 'user_stats'
  | 'activity_logs'
  | 'telegram_stats'
  | 'telegram_delivery'
  | 'receipt_stats'
  | 'receipt_lookup'
  | 'verified_today'
  | 'paid_students'
  | 'pending_stats'
  | 'missing_receipt'
  | 'help'
  | 'unknown';

export interface ParsedAdminIntent {
  intent: AdminIntent;
  confidence: 'high' | 'low';
  query?: string;
  status?: PaymentStatus;
  invoiceStatus?: 'belum_dibayar' | 'menunggu_verifikasi' | 'lunas' | 'dibatalkan';
  categoryCode?: PaymentCategoryCode;
  metode?: PaymentMethod;
  unit?: UnitPondok;
  kelas?: string;
  period: PeriodFilter;
  overdueOnly?: boolean;
  verifikasiOnly?: boolean;
  /** Nomor kuitansi yang dicari, mis. KWT-202610-0001. */
  receiptNumber?: string;
  /** Pertanyaan asli (tanpa data pribadi tambahan) untuk penyesuaian format. */
  rawQuestion?: string;
}

export const ADMIN_AI_INTENTS: readonly AdminIntent[] = [
  'student_count',
  'student_list',
  'guardian_stats',
  'guardian_list',
  'invoice_stats',
  'invoice_list',
  'payment_stats',
  'payment_list',
  'arrears_stats',
  'arrears_list',
  'finance_report',
  'user_stats',
  'activity_logs',
  'telegram_stats',
  'telegram_delivery',
  'receipt_stats',
  'receipt_lookup',
  'verified_today',
  'paid_students',
  'pending_stats',
  'missing_receipt',
];

export function isAdminIntent(value: unknown): value is AdminIntent {
  return typeof value === 'string' && (ADMIN_AI_INTENTS as readonly string[]).includes(value);
}

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function monthName(month: number): string {
  return MONTHS[Math.min(11, Math.max(0, month - 1))];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function monthPeriod(year: number, month: number): PeriodFilter {
  const start = isoDate(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    preset: 'specific_month',
    label: `${monthName(month)} ${year}`,
    start,
    end: isoDate(nextYear, nextMonth, 1),
  };
}

export function parsePeriod(question: string, now: Date, defaultPreset: 'all' | 'this_month' | 'this_year' = 'all'): PeriodFilter {
  const q = question.toLowerCase();

  // Rentang tanggal eksplisit: 2026-10-01 s/d 2026-10-31
  const range = q.match(/(\d{4}-\d{2}-\d{2})\s*(?:sampai|s\/d|hingga|sampai dengan|[-–])\s*(\d{4}-\d{2}-\d{2})/);
  if (range) {
    const start = range[1];
    const endDate = new Date(`${range[2]}T00:00:00`);
    if (!Number.isNaN(endDate.getTime())) {
      endDate.setDate(endDate.getDate() + 1);
      return {
        preset: 'custom',
        label: `${range[1]} s/d ${range[2]}`,
        start,
        end: endDate.toISOString().slice(0, 10),
      };
    }
  }

  // Bulan eksplisit, mis. "Oktober", "Oktober 2026", "Okt 2026"
  for (let i = 0; i < MONTHS.length; i++) {
    const full = MONTHS[i].toLowerCase();
    const short = full.slice(0, 3);
    const pattern = new RegExp(`\\b(${full}|${short})\\b(?:\\s*(\\d{4}))?`, 'i');
    const match = q.match(pattern);
    if (match) {
      const year = match[2] ? Number(match[2]) : now.getFullYear();
      return monthPeriod(year, i + 1);
    }
  }

  if (/\bbulan\s+lalu\b|\bbulan\s+kemarin\b/.test(q)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return monthPeriod(d.getFullYear(), d.getMonth() + 1);
  }
  if (/\bbulan\s+ini\b|\bbulan\s+berjalan\b|\bbulan\s+sekarang\b/.test(q)) {
    return monthPeriod(now.getFullYear(), now.getMonth() + 1);
  }
  if (/\btahun\s+ini\b|\btahun\s+berjalan\b|\btahun\s+sekarang\b/.test(q)) {
    return {
      preset: 'this_year',
      label: `Tahun ${now.getFullYear()}`,
      start: isoDate(now.getFullYear(), 1, 1),
      end: isoDate(now.getFullYear() + 1, 1, 1),
    };
  }
  const yearMatch = q.match(/\btahun\s+(\d{4})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return {
      preset: 'this_year',
      label: `Tahun ${year}`,
      start: isoDate(year, 1, 1),
      end: isoDate(year + 1, 1, 1),
    };
  }

  if (defaultPreset === 'this_month') {
    return monthPeriod(now.getFullYear(), now.getMonth() + 1);
  }
  if (defaultPreset === 'this_year') {
    return {
      preset: 'this_year',
      label: `Tahun ${now.getFullYear()}`,
      start: isoDate(now.getFullYear(), 1, 1),
      end: isoDate(now.getFullYear() + 1, 1, 1),
    };
  }

  return { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null };
}

function stopAt(value: string): string {
  return value
    .split(
      /\s+(?:yang|di|dari|untuk|dengan|pada|bulan|tahun|kelas|unit|periode|status|dengan|dan)\b/i
    )[0]
    .replace(/[?.!,;:]+$/g, '')
    .trim();
}

export function extractSearchTerm(question: string): string | undefined {
  const quoted = question.match(/"([^"]{2,80})"|'([^']{2,80})'/);
  if (quoted) return (quoted[1] || quoted[2]).trim();

  const nis = question.match(/\b\d{6,12}\b/);
  if (nis) return nis[0];

  const afterNama = question.match(/(?:atas\s+nama|nama)\s+([A-Za-zÀ-ÿ'’.\- ]{2,60})/i);
  if (afterNama) {
    const value = stopAt(afterNama[1]);
    if (value.length >= 2) return value;
  }

  const afterCari = question.match(/cari(?:kan)?\s+(?:data\s+)?(?:santri|siswa|wali|tagihan|pembayaran|transaksi)?\s*(?:dengan\s+nama\s+)?([A-Za-zÀ-ÿ0-9'’.\- ]{2,60})/i);
  if (afterCari) {
    const value = stopAt(afterCari[1]);
    if (value.length >= 2 && !/^(semua|seluruh|data|yang)$/i.test(value)) return value;
  }

  return undefined;
}

function detectCategory(q: string): PaymentCategoryCode | undefined {
  if (/\buang\s+makan\b|\bkatering\b|\bmakan\b/.test(q)) return 'uang_makan';
  if (/\bspp\b|\bsekolah\b|\bmadrasah\b/.test(q)) return 'spp_sekolah';
  if (/\bsyariah\b|\basrama\b|\bkitab\b/.test(q)) return 'syariah_pondok';
  return undefined;
}

function detectMethod(q: string): PaymentMethod | undefined {
  const methods: PaymentMethod[] = [];
  if (/\bqris\b/.test(q)) methods.push('qris');
  if (/\btunai\b|\bcash\b|\bkasir\b/.test(q)) methods.push('tunai');
  if (/\btransfer\b|\bbank\b|\bbsi\b|\bbca\b|\bmuamalat\b/.test(q)) methods.push('transfer_bank');
  // Jika beberapa metode disebut sekaligus, tampilkan rincian semua metode.
  return methods.length === 1 ? methods[0] : undefined;
}

function detectPaymentStatus(q: string): PaymentStatus | undefined {
  if (/menunggu\s+verifikasi|\bpending\b|belum\s+diverifikasi/.test(q)) return 'menunggu_verifikasi';
  if (/\bditolak\b/.test(q)) return 'ditolak';
  if (/\bterverifikasi\b|sudah\s+diverifikasi|\bverified\b/.test(q)) return 'terverifikasi';
  if (/\bkedaluwarsa\b|\bexpired\b/.test(q)) return 'kedaluwarsa';
  return undefined;
}

function detectInvoiceStatus(q: string): ParsedAdminIntent['invoiceStatus'] {
  if (/\blunas\b/.test(q)) return 'lunas';
  if (/\bbelum\s+dibayar\b|\bbelum\s+lunas\b/.test(q)) return 'belum_dibayar';
  if (/menunggu\s+verifikasi/.test(q)) return 'menunggu_verifikasi';
  if (/\bdibatalkan\b/.test(q)) return 'dibatalkan';
  return undefined;
}

function detectKelas(question: string): string | undefined {
  const match = question.match(/\bkelas\s+([ivxlcdm]+|[0-9]+)\s*([a-z])?\b/i);
  if (!match) return undefined;
  const level = match[1].toUpperCase();
  const suffix = match[2] ? ` ${match[2].toUpperCase()}` : '';
  return `${level}${suffix}`;
}

/** Ekstrak nomor kuitansi dan normalisasi ke format KWT-YYYYMM-NNNN. */
function detectReceiptNumber(question: string): string | undefined {
  const match = question.match(/\bKWT[\s-]*(\d{4,8})[\s-]+(\d{1,6})\b/i);
  if (!match) return undefined;
  const period = match[1].length === 4 ? match[1] : match[1].slice(-6);
  return `KWT-${period}-${match[2].padStart(4, '0')}`;
}

export function parseAdminIntent(question: string, now: Date): ParsedAdminIntent {
  const q = ` ${question.toLowerCase().replace(/\s+/g, ' ')} `;
  const periodDefault: 'all' | 'this_month' | 'this_year' = /\btahun\b/.test(q)
    ? 'this_year'
    : /\bbulan\b/.test(q)
      ? 'this_month'
      : 'all';
  const period = parsePeriod(question, now, periodDefault);

  const mentionsPutra = /\bputra\b/.test(q);
  const mentionsPutri = /\bputri\b/.test(q);
  // "putra dan putri" berarti minta rincian keduanya, bukan filter satu unit.
  const unit: UnitPondok | undefined =
    mentionsPutra && !mentionsPutri ? 'putra' : mentionsPutri && !mentionsPutra ? 'putri' : undefined;
  const categoryCode = detectCategory(q);
  const metode = detectMethod(q);
  const status = detectPaymentStatus(q);
  const invoiceStatus = detectInvoiceStatus(q);
  const query = extractSearchTerm(question);
  const kelas = detectKelas(question);
  const receiptNumber = detectReceiptNumber(question);

  const wantsList = /\bdaftar\b|\btampilkan\b|\bcari\b|\bsiapa\b|\briwayat\b|\bdetail\b|\bpaling\s+banyak\b/.test(q);
  const wantsCount = /\bberapa\b|\bjumlah\b|\btotal\b|\bhitung\b|\bstatistik\b|\bcount\b/.test(q);

  if (/\b(bantuan|kemampuan|fitur|panduan|contoh pertanyaan|bisa apa|help)\b/.test(q)) {
    return { intent: 'help', confidence: 'high', period };
  }

  if (/\btelegram\b|\bnotifikasi\b/.test(q)) {
    const delivery =
      /\bgagal\b|\bbelum\s+terkirim\b|\btidak\s+terkirim\b|\bbelum\s+tertaut\b|\btanpa\s+telegram\b|\balasan\b|\bkenapa\b|\bmengapa\b|\briwayat\b|\blog\b|\bpengiriman\b|\bdelivery\b|\bstatus\s+notifikasi\b|\btujuan\b|\bunsent\b/.test(
        q
      );
    return {
      intent: delivery ? 'telegram_delivery' : 'telegram_stats',
      confidence: 'high',
      period,
      query,
    };
  }

  if (
    /\b(tanpa|belum\s+ada|belum\s+diterbitkan|tidak\s+ada|belum\s+memiliki)\s+kuitansi\b|\bkuitansi\s+(?:belum|tidak)\b|\b(?:kenapa|mengapa|alasan)\b.*\bkuitansi\b/.test(
      q
    )
  ) {
    return { intent: 'missing_receipt', confidence: 'high', period, query };
  }

  if (/\bkuitansi\b|\bkwitansi\b|\breceipt\b/.test(q)) {
    const lookup =
      Boolean(receiptNumber) ||
      ((/\bcari\b|\bdetail\b|\bnomor\b|\bno\.?\b|\bstatus\b|\bcek\b|\blih[at]\b|\briwayat\b/.test(q)) &&
        !wantsCount);
    return {
      intent: lookup ? 'receipt_lookup' : 'receipt_stats',
      confidence: 'high',
      period,
      query,
      receiptNumber,
    };
  }

  if (
    /\bhari\s+ini\b/.test(q) &&
    /\b(terverifikasi|diverifikasi|verifikasi|diterima|masuk)\b/.test(q)
  ) {
    return { intent: 'verified_today', confidence: 'high', period };
  }

  if (
    /\bsantri\b|\bsiswa\b|\bmurid\b/.test(q) &&
    /(?:sudah|telah)\s+(?:bayar|membayar|lunas)|\byang\s+lunas\b|\bsantri\s+lunas\b|\bpaid\b/.test(q) &&
    !/\bbelum\b/.test(q)
  ) {
    return { intent: 'paid_students', confidence: 'high', period, query, unit };
  }

  if (
    /\bberapa\b|\bjumlah\b|\btotal\b/.test(q) &&
    /menunggu\s+verifikasi|\bpending\b|belum\s+diverifikasi/.test(q) &&
    !wantsList
  ) {
    return { intent: 'pending_stats', confidence: 'high', period };
  }

  if (/\bpengguna\b|\buser\b|\bakun\b|\brole\b|\bperan\b/.test(q) && /\bberapa\b|\bjumlah\b|\btotal\b|\bstatistik\b|\bdaftar\b|\bsiapa\b/.test(q)) {
    return { intent: 'user_stats', confidence: 'high', period };
  }

  if (/\baktivitas\b|\baudit\b|\blog\b|\briwayat perubahan\b|\bsiapa\s+yang\s+(?:melakukan\s+)?verifikasi\b|\bverifikasi\s+oleh\s+siapa\b/.test(q)) {
    return {
      intent: 'activity_logs',
      confidence: 'high',
      period,
      query,
      status,
      verifikasiOnly: /verifikasi/.test(q),
    };
  }

  if (/\btunggak(?:an)?\b|\bmenunggak\b|\bbelum\s+bayar\b|\bbelum\s+melakukan\s+pembayaran\b|\bbelum\s+setor\b|\bbelum\s+lunas\b/.test(q)) {
    return {
      intent: wantsList ? 'arrears_list' : 'arrears_stats',
      confidence: 'high',
      period,
      query,
      categoryCode,
      unit,
      overdueOnly: /\bmenunggak\b|\bterlambat\b|\bmelewati\s+tenggat\b|\boverdue\b/.test(q),
    };
  }

  if (/\bpemasukan\b|\bpendapatan\b|\buang\s+masuk\b|\bkeuangan\b|\bringkasan\s+keuangan\b|\blaporan\s+keuangan\b|\barus\s+kas\b|\bomzet\b|\bincome\b/.test(q)) {
    return { intent: 'finance_report', confidence: 'high', period, categoryCode, unit };
  }

  if (/\bpembayaran\b|\btransaksi\b|\bverifikasi\b|\bdiverifikasi\b|\bditolak\b|\bmetode\b/.test(q)) {
    return {
      intent: wantsList || query ? 'payment_list' : 'payment_stats',
      confidence: 'high',
      period,
      query,
      status,
      metode,
      categoryCode,
      unit,
    };
  }

  if (/\btagihan\b|\binvoice\b|\bspp\b|\buang\s+makan\b|\bsyariah\s+pondok\b/.test(q)) {
    return {
      intent: wantsList || query ? 'invoice_list' : 'invoice_stats',
      confidence: 'high',
      period,
      query,
      invoiceStatus,
      categoryCode,
      unit,
    };
  }

  if (/\bwali\b|\bguardian\b/.test(q)) {
    return {
      intent: wantsList || query ? 'guardian_list' : 'guardian_stats',
      confidence: 'high',
      period,
      query,
      unit,
    };
  }

  if (/\bsantri\b|\bsiswa\b|\bmurid\b|\bnis\b/.test(q)) {
    const wantsStudentCount =
      /\bberapa\b|\bjumlah\b|\btotal\b|\bhitung\b|\bstatistik\b/.test(q) && !/\bcari\b|\bdetail\b|\bsiapa\s+nama\b/.test(q);
    const intent: AdminIntent = wantsStudentCount ? 'student_count' : 'student_list';
    return {
      intent,
      confidence: 'high',
      period,
      query,
      unit,
      kelas,
    };
  }

  return { intent: 'unknown', confidence: 'low', period, query };
}
