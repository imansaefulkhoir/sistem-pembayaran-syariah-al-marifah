import { formatRupiah, formatDateTimeIndo } from '../utils';
import type {
  AdminAuditEntry,
  AdminChatbotSource,
  AdminEngineOptions,
  AdminQueryResult,
  AdminScope,
} from './types';
import { ADMIN_QUICK_QUESTIONS, CAPABILITY_LABELS } from './types';
import {
  auditEntry,
  buildAdminScope,
  capabilityDeniedMessage,
  detectPromptInjection,
  hasCapability,
} from './rbac';
import {
  getAdminActivityLogs,
  getArrearsStatistics,
  getFinancialReports,
  getGuardianStatistics,
  getInvoiceStatistics,
  getPaidStudents,
  getPaymentStatistics,
  getReceiptStatistics,
  getStudentStatistics,
  getTelegramDeliveryStatistics,
  getTelegramNotificationStatistics,
  getUserStatistics,
  getVerifiedPaymentsToday,
  getVerifiedPaymentsWithoutReceipt,
  searchArrears,
  searchGuardians,
  searchInvoices,
  searchPayments,
  searchReceipts,
  searchStudents,
  type ActivityLogData,
  type ArrearsListData,
  type ArrearsStatisticsData,
  type FinanceReportData,
  type GuardianListData,
  type GuardianStatisticsData,
  type InvoiceListData,
  type InvoiceStatisticsData,
  type MissingReceiptData,
  type PaidStudentsData,
  type PaymentListData,
  type PaymentStatisticsData,
  type ReceiptListData,
  type ReceiptStatisticsData,
  type StudentListData,
  type StudentStatisticsData,
  type TelegramDeliveryStatisticsData,
  type TelegramStatisticsData,
  type UserStatisticsData,
  type VerifiedTodayData,
} from './data';
import {
  isAdminIntent,
  parseAdminIntent,
  parsePeriod,
  type AdminIntent,
  type ParsedAdminIntent,
} from './intent';
import type { UserProfile } from '../types';

/**
 * ENGINE ASISTEN ADMIN.
 *
 * Alur: validasi sesi/role → deteksi prompt injection → parse intent →
 * cek capability → panggil fungsi data terkontrol → format jawaban.
 * Semua data berasal dari `AdminChatbotSource`; engine tidak punya akses
 * langsung ke localStorage, Supabase, atau API eksternal.
 */

const nf = new Intl.NumberFormat('id-ID');

function count(value: number): string {
  return nf.format(value);
}

function nowOf(ds: AdminChatbotSource, options: AdminEngineOptions): Date {
  return options.now || ds.now?.() || new Date();
}

function deniedResult(
  scope: AdminScope,
  now: Date,
  title: string,
  answer: string,
  options: AdminEngineOptions,
  securityEvent?: 'prompt_injection',
  suggestions: string[] = []
): AdminQueryResult {
  const entry = auditEntry(
    securityEvent === 'prompt_injection' ? 'CHATBOT_ADMIN_INJECTION_BLOCKED' : 'CHATBOT_ADMIN_DENIED',
    `${scope.role}: ${title}`,
    now
  );
  options.onAudit?.(entry);
  return {
    ok: false,
    intent: 'denied',
    title,
    answer,
    meta: {
      generatedAt: now.toISOString(),
      scopeLabel: scope.label,
      role: scope.role,
      denied: true,
      securityEvent,
    },
    suggestions:
      suggestions.length > 0
        ? suggestions
        : ['Berapa jumlah seluruh santri?', 'Tampilkan ringkasan keuangan', 'Bantuan'],
  };
}

function resultBase(
  scope: AdminScope,
  now: Date,
  intent: string,
  title: string,
  answer: string
): AdminQueryResult {
  return {
    ok: true,
    intent,
    title,
    answer,
    meta: {
      generatedAt: now.toISOString(),
      scopeLabel: scope.label,
      role: scope.role,
    },
    suggestions: quickSuggestions(),
  };
}

function quickSuggestions(): string[] {
  return ADMIN_QUICK_QUESTIONS.slice(0, 4).map((q) => q.query);
}

function notFound(scope: AdminScope, now: Date, intent: string, what: string): AdminQueryResult {
  const result = resultBase(
    scope,
    now,
    intent,
    'Data tidak ditemukan',
    `Tidak ada ${what} yang cocok dengan permintaan Anda pada data yang tersedia (${scope.label}). ` +
      'Coba gunakan nama/NIS yang lain, longgarkan periode, atau periksa kembali ejaan. Saya tidak akan mengarang data.'
  );
  result.meta.rowCount = 0;
  return result;
}

function deniedCapability(
  scope: AdminScope,
  now: Date,
  options: AdminEngineOptions,
  capability: keyof typeof CAPABILITY_LABELS
): AdminQueryResult {
  const answer = capabilityDeniedMessage(capability);
  const entry = auditEntry('CHATBOT_ADMIN_CAPABILITY_DENIED', `${scope.role}: ${capability}`, now);
  options.onAudit?.(entry);
  return {
    ok: false,
    intent: 'denied',
    title: 'Akses dibatasi',
    answer: `${answer}\n\n${scope.reason || 'Gunakan akun dengan kewenangan yang sesuai.'}`,
    meta: {
      generatedAt: now.toISOString(),
      scopeLabel: scope.label,
      role: scope.role,
      denied: true,
    },
    suggestions: quickSuggestions(),
  };
}

function helpResult(scope: AdminScope, now: Date): AdminQueryResult {
  const caps = scope.capabilities.map((c) => `• ${CAPABILITY_LABELS[c]}`).join('\n');
  const result = resultBase(
    scope,
    now,
    'help',
    'Panduan Asisten Admin',
    [
      `Saya adalah Asisten Admin ${scope.label}. Saya menjawab HANYA berdasarkan data aplikasi yang boleh diakses role Anda.`,
      '',
      'Yang dapat saya bantu:',
      caps || '• Tidak ada modul data yang tersedia untuk role ini.',
      '',
      'Contoh pertanyaan:',
      ADMIN_QUICK_QUESTIONS.map((q) => `• ${q.query}`).join('\n'),
      '',
      'Sebutkan periode saat bertanya soal uang, misalnya "pemasukan Oktober 2026", agar dasar perhitungan jelas.',
    ].join('\n')
  );
  result.meta.basis =
    'Jawaban data disusun oleh mesin lokal RBAC. AI eksternal (jika aktif) hanya membantu mengenali maksud pertanyaan, tidak menerima data.';
  return result;
}

function unknownResult(scope: AdminScope, now: Date, question: string): AdminQueryResult {
  const result = resultBase(
    scope,
    now,
    'unknown',
    'Pertanyaan belum dikenali',
    `Maaf, saya belum menemukan maksud pertanyaan "${question.slice(0, 120)}" pada data yang tersedia. ` +
      'Saya tidak akan mengarang angka atau nama. Silakan pilih pertanyaan cepat atau gunakan contoh berikut.'
  );
  result.meta.needsAiIntent = true;
  return result;
}

function withUnit(scope: AdminScope, unit?: 'putra' | 'putri'): AdminScope {
  if (!unit || scope.access !== 'all') return scope;
  return {
    ...scope,
    access: 'unit',
    unit,
    label: `Unit ${unit === 'putra' ? 'Putra' : 'Putri'}`,
  };
}

// ---------------------------------------------------------------------------
// Formatter per intent
// ---------------------------------------------------------------------------

function studentCountResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  if (!hasCapability(scope, 'students')) return deniedCapability(scope, now, {}, 'students');

  if (parsed.query || parsed.kelas) {
    const data = searchStudents(scope, ds, { query: parsed.query, kelas: parsed.kelas, unit: parsed.unit, limit: 25 });
    if (!data.ok || !data.data) return notFound(scope, now, 'student_count', 'santri');
    const list = data.data as StudentListData;
    if (list.total === 0) return notFound(scope, now, 'student_count', 'santri');
    const result = resultBase(
      scope,
      now,
      'student_count',
      'Hasil Pencarian Santri',
      `Ditemukan ${count(list.total)} santri yang cocok${parsed.query ? ` dengan kata kunci "${parsed.query}"` : ''}${parsed.kelas ? ` pada kelas ${parsed.kelas}` : ''} di ${scope.label}.`
    );
    result.table = {
      columns: ['NIS', 'Nama', 'Kelas', 'Unit', 'Daerah', 'Status'],
      rows: list.rows.map((s) => [
        s.nis,
        s.nama,
        s.kelas,
        s.unit === 'putra' ? 'Putra' : 'Putri',
        s.asalDaerah,
        s.statusAktif ? 'Aktif' : 'Nonaktif',
      ]),
      note: list.truncated ? `Ditampilkan ${list.rows.length} dari ${list.total} hasil.` : undefined,
    };
    result.meta.rowCount = list.total;
    result.meta.truncated = list.truncated;
    return result;
  }

  const data = getStudentStatistics(scope, ds);
  if (!data.ok || !data.data) return notFound(scope, now, 'student_count', 'santri');
  const s = data.data as StudentStatisticsData;
  let answer = `Jumlah santri di ${scope.label} adalah ${count(s.total)} santri (putra ${count(s.putra)}, putri ${count(s.putri)}). Aktif ${count(s.active)}, nonaktif ${count(s.inactive)}.`;
  if (parsed.unit) {
    answer = `Jumlah santri ${parsed.unit === 'putra' ? 'putra' : 'putri'} di ${scope.label} adalah ${count(parsed.unit === 'putra' ? s.putra : s.putri)} santri.`;
  }
  const result = resultBase(scope, now, 'student_count', 'Statistik Santri', answer);
  result.table = {
    columns: ['Kelas', 'Jumlah Santri'],
    rows: s.byClass.map((c) => [c.kelas, c.total]),
    note: 'Jumlah per kelas dihitung dari data santri yang boleh diakses role Anda.',
  };
  result.meta.rowCount = s.total;
  result.bullets = [
    `Total: ${count(s.total)} santri`,
    `Putra: ${count(s.putra)} • Putri: ${count(s.putri)}`,
    `Aktif: ${count(s.active)} • Nonaktif: ${count(s.inactive)}`,
  ];
  return result;
}

function studentListResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchStudents(scope, ds, { query: parsed.query, kelas: parsed.kelas, unit: parsed.unit, limit: 25 });
  if (!data.ok || !data.data) return notFound(scope, now, 'student_list', 'santri');
  const list = data.data as StudentListData;
  if (list.total === 0) return notFound(scope, now, 'student_list', 'santri');

  const isRegion = /daerah|asal|wilayah/.test(parsed.rawQuestion || parsed.query || '');
  const result = resultBase(
    scope,
    now,
    'student_list',
    isRegion ? 'Sebaran Daerah Santri' : 'Daftar Santri',
    `Menampilkan ${list.rows.length} dari ${count(list.total)} santri di ${scope.label}${parsed.query ? ` untuk pencarian "${parsed.query}"` : ''}.`
  );
  result.table = {
    columns: ['NIS', 'Nama', 'Kelas', 'Unit', 'Asal Daerah', 'Wali', 'Status'],
    rows: list.rows.map((s) => [
      s.nis,
      s.nama,
      s.kelas,
      s.unit === 'putra' ? 'Putra' : 'Putri',
      s.asalDaerah,
      s.waliNama,
      s.statusAktif ? 'Aktif' : 'Nonaktif',
    ]),
    note: list.truncated
      ? `Hasil dibatasi ${list.rows.length} baris dari total ${list.total}. Persempit pencarian untuk hasil lebih spesifik.`
      : undefined,
  };
  result.meta.rowCount = list.total;
  result.meta.truncated = list.truncated;
  return result;
}

function guardianStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getGuardianStatistics(unitScope, ds);
  if (!data.ok || !data.data) return notFound(scope, now, 'guardian_stats', 'data wali');
  const g = data.data as GuardianStatisticsData;
  const result = resultBase(
    scope,
    now,
    'guardian_stats',
    'Statistik Wali Santri',
    `Terdapat ${count(g.totalGuardians)} akun wali pada relasi santri di ${scope.label}. ` +
      `${count(g.verifiedGuardians)} wali sudah terverifikasi, ${count(g.unverifiedRelations)} relasi belum terverifikasi. ` +
      `${count(g.linkedStudents)} santri terhubung ke wali terverifikasi, dan ${count(g.studentsWithoutVerifiedGuardian)} santri belum memiliki wali terverifikasi.`
  );
  result.table = {
    columns: ['Wali', 'Telepon', 'Anak Terverifikasi', 'Total Relasi', 'Santri', 'Unit'],
    rows: g.childrenPerGuardian.map((r) => [
      r.guardianName,
      r.guardianPhone || '-',
      r.verifiedChildren,
      r.totalChildren,
      r.students,
      r.units,
    ]),
    note: 'Hanya relasi wali–santri yang tercatat di aplikasi yang dihitung. Data tautan Telegram per wali belum tersedia di skema demo.',
  };
  result.meta.rowCount = g.totalGuardians;
  result.bullets = [
    `Total akun wali: ${count(g.totalGuardians)}`,
    `Wali terverifikasi: ${count(g.verifiedGuardians)}`,
    `Relasi belum terverifikasi: ${count(g.unverifiedRelations)}`,
    `Santri tanpa wali terverifikasi: ${count(g.studentsWithoutVerifiedGuardian)}`,
  ];
  return result;
}

function guardianListResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchGuardians(scope, ds, { query: parsed.query, limit: 25 });
  if (!data.ok || !data.data) return notFound(scope, now, 'guardian_list', 'wali');
  const list = data.data as GuardianListData;
  if (list.total === 0) return notFound(scope, now, 'guardian_list', 'wali');
  const result = resultBase(
    scope,
    now,
    'guardian_list',
    'Daftar Wali Santri',
    `Ditemukan ${count(list.total)} wali yang cocok${parsed.query ? ` dengan pencarian "${parsed.query}"` : ''} di ${scope.label}.`
  );
  result.table = {
    columns: ['Wali', 'Telepon', 'Anak Terverifikasi', 'Total Relasi', 'Santri', 'Unit'],
    rows: list.rows.map((r) => [
      r.guardianName,
      r.guardianPhone || '-',
      r.verifiedChildren,
      r.totalChildren,
      r.students,
      r.units,
    ]),
    note: list.truncated ? `Ditampilkan ${list.rows.length} dari ${list.total} wali.` : undefined,
  };
  result.meta.rowCount = list.total;
  result.meta.truncated = list.truncated;
  return result;
}

function invoiceStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  if (parsed.invoiceStatus) {
    const data = searchInvoices(scope, ds, {
      query: parsed.query,
      period: parsed.period,
      status: parsed.invoiceStatus,
      categoryCode: parsed.categoryCode,
      unit: parsed.unit,
      limit: 25,
    });
    if (!data.ok || !data.data) return notFound(scope, now, 'invoice_stats', 'tagihan');
    const list = data.data as InvoiceListData;
    if (list.total === 0) return notFound(scope, now, 'invoice_stats', `tagihan berstatus ${parsed.invoiceStatus}`);
    const totalNominal = list.rows.reduce((a, r) => a + r.nominal, 0);
    const totalSisa = list.rows.reduce((a, r) => a + r.sisa, 0);
    const result = resultBase(
      scope,
      now,
      'invoice_stats',
      `Tagihan ${parsed.invoiceStatus.replace(/_/g, ' ')}`,
      `Terdapat ${count(list.total)} tagihan berstatus ${parsed.invoiceStatus.replace(/_/g, ' ')} pada ${parsed.period.label} di ${scope.label}, dengan nominal ${formatRupiah(totalNominal)} dan sisa ${formatRupiah(totalSisa)}.`
    );
    result.table = invoiceTable(list);
    result.meta.rowCount = list.total;
    result.meta.periodLabel = parsed.period.label;
    return result;
  }

  const unitScope = withUnit(scope, parsed.unit);
  const data = getInvoiceStatistics(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'invoice_stats', 'tagihan');
  const s = data.data as InvoiceStatisticsData;
  if (s.total === 0) return notFound(scope, now, 'invoice_stats', `tagihan periode ${parsed.period.label}`);

  // Pertanyaan kategori spesifik: "berapa tagihan uang makan / SPP / syariah".
  if (parsed.categoryCode) {
    const category = s.byCategory.find((c) => c.code === parsed.categoryCode);
    if (!category) return notFound(scope, now, 'invoice_stats', `tagihan kategori ${parsed.categoryCode}`);
    const result = resultBase(
      scope,
      now,
      'invoice_stats',
      'Statistik Tagihan per Kategori',
      `Terdapat ${count(category.count)} tagihan ${category.nama} pada ${parsed.period.label} di ${scope.label}, total nominal ${formatRupiah(category.nominal)} dan sisa ${formatRupiah(category.sisa)}.`
    );
    result.table = {
      columns: ['Kategori', 'Jumlah Tagihan', 'Total Nominal', 'Sisa'],
      rows: [[category.nama, category.count, formatRupiah(category.nominal), formatRupiah(category.sisa)]],
      note: 'Angka diambil dari tabel tagihan pada periode dan unit yang boleh diakses role Anda.',
    };
    result.meta.rowCount = category.count;
    result.meta.periodLabel = parsed.period.label;
    return result;
  }

  const result = resultBase(
    scope,
    now,
    'invoice_stats',
    'Statistik Tagihan',
    `Terdapat ${count(s.total)} tagihan pada ${parsed.period.label} di ${scope.label}. ` +
      `Total nominal ${formatRupiah(s.totalNominal)}, sisa belum tertagih ${formatRupiah(s.totalSisa)}. ` +
      `Lunas ${count(s.lunas)}, belum dibayar ${count(s.belumDibayar)}, menunggu verifikasi ${count(s.menungguVerifikasi)}, dibatalkan ${count(s.dibatalkan)}.`
  );
  result.table = {
    columns: ['Kategori', 'Jumlah Tagihan', 'Total Nominal', 'Sisa'],
    rows: s.byCategory.map((c) => [c.nama, c.count, formatRupiah(c.nominal), formatRupiah(c.sisa)]),
    note: 'Sisa tagihan = kewajiban yang belum lunas. Tagihan dibatalkan tidak dihitung sebagai tunggakan.',
  };
  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari tabel tagihan: nominal, sisa_tagihan, dan status tagihan.';
  return result;
}

function invoiceTable(list: InvoiceListData) {
  return {
    columns: ['No. Tagihan', 'Santri', 'Kategori', 'Periode', 'Nominal', 'Sisa', 'Status', 'Tenggat'],
    rows: list.rows.map((r) => [
      r.nomorTagihan,
      `${r.nama} (${r.nis})`,
      r.kategori,
      r.periode,
      formatRupiah(r.nominal),
      formatRupiah(r.sisa),
      r.status.replace(/_/g, ' '),
      r.tenggat,
    ]),
    note: list.truncated ? `Ditampilkan ${list.rows.length} dari ${list.total} tagihan.` : undefined,
  };
}

function invoiceListResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchInvoices(scope, ds, {
    query: parsed.query,
    period: parsed.period,
    status: parsed.invoiceStatus,
    categoryCode: parsed.categoryCode,
    unit: parsed.unit,
    limit: 25,
  });
  if (!data.ok || !data.data) return notFound(scope, now, 'invoice_list', 'tagihan');
  const list = data.data as InvoiceListData;
  if (list.total === 0) return notFound(scope, now, 'invoice_list', 'tagihan');

  const result = resultBase(
    scope,
    now,
    'invoice_list',
    'Daftar Tagihan',
    `Menampilkan ${list.rows.length} dari ${count(list.total)} tagihan pada ${parsed.period.label} di ${scope.label}${parsed.query ? ` untuk pencarian "${parsed.query}"` : ''}.`
  );
  result.table = invoiceTable(list);
  result.meta.rowCount = list.total;
  result.meta.truncated = list.truncated;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Status dan sisa tagihan diambil langsung dari tabel tagihan.';
  return result;
}

function paymentStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  if (parsed.status || parsed.query || parsed.metode) {
    const data = searchPayments(scope, ds, {
      query: parsed.query,
      period: parsed.period,
      status: parsed.status,
      metode: parsed.metode,
      categoryCode: parsed.categoryCode,
      limit: 25,
    });
    if (!data.ok || !data.data) return notFound(scope, now, 'payment_stats', 'pembayaran');
    const list = data.data as PaymentListData;
    if (list.total === 0) return notFound(scope, now, 'payment_stats', 'pembayaran yang cocok');
    const totalNominal = list.rows.reduce((a, r) => a + r.nominal, 0);
    const label = parsed.status ? parsed.status.replace(/_/g, ' ') : parsed.metode ? parsed.metode.replace(/_/g, ' ') : 'pembayaran';
    const warning =
      parsed.status === 'menunggu_verifikasi'
        ? ' Pembayaran menunggu verifikasi BUKAN pemasukan dan belum berarti lunas.'
        : parsed.status === 'ditolak'
          ? ' Pembayaran ditolak tidak dihitung sebagai pemasukan.'
          : '';
    const result = resultBase(
      scope,
      now,
      'payment_stats',
      'Statistik Pembayaran',
      `Terdapat ${count(list.total)} ${label} pada ${parsed.period.label} di ${scope.label} dengan total nominal ${formatRupiah(totalNominal)}.${warning}`
    );
    result.table = paymentTable(list);
    result.meta.rowCount = list.total;
    result.meta.periodLabel = parsed.period.label;
    result.meta.basis = 'Nominal mengikuti status pembayaran apa adanya; hanya status terverifikasi yang dihitung sebagai pemasukan.';
    return result;
  }

  const unitScope = withUnit(scope, parsed.unit);
  const data = getPaymentStatistics(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'payment_stats', 'pembayaran');
  const s = data.data as PaymentStatisticsData;
  if (s.total === 0) return notFound(scope, now, 'payment_stats', `pembayaran periode ${parsed.period.label}`);

  const result = resultBase(
    scope,
    now,
    'payment_stats',
    'Statistik Pembayaran',
    `Terdapat ${count(s.total)} transaksi pembayaran pada ${parsed.period.label} di ${scope.label}, total ${formatRupiah(s.totalNominal)}. ` +
      `Terverifikasi ${count(s.verifiedCount)} transaksi (${formatRupiah(s.verifiedNominal)}), menunggu verifikasi ${count(s.pendingCount)} (${formatRupiah(s.pendingNominal)}), ditolak ${count(s.rejectedCount)} (${formatRupiah(s.rejectedNominal)}), kedaluwarsa ${count(s.expiredCount)}.`
  );
  result.table = {
    columns: ['Status', 'Jumlah Transaksi', 'Nominal'],
    rows: s.byStatus.map((r) => [r.status.replace(/_/g, ' '), r.count, formatRupiah(r.nomina)]),
    note: 'Pembayaran menunggu verifikasi BUKAN pemasukan dan belum berarti lunas.',
  };
  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari tabel pembayaran berdasarkan waktu_pembayaran dan status pembayaran.';
  result.bullets = [
    `Metode transfer bank: ${count(s.byMethod.find((m) => m.metode === 'transfer_bank')?.count || 0)} transaksi`,
    `Metode QRIS: ${count(s.byMethod.find((m) => m.metode === 'qris')?.count || 0)} transaksi`,
    `Metode tunai: ${count(s.byMethod.find((m) => m.metode === 'tunai')?.count || 0)} transaksi`,
  ];
  return result;
}

function paymentTable(list: PaymentListData) {
  return {
    columns: ['No. Pembayaran', 'Santri', 'Kategori', 'Periode', 'Nominal', 'Metode', 'Status', 'Waktu'],
    rows: list.rows.map((r) => [
      r.nomorPembayaran,
      `${r.nama} (${r.nis})`,
      r.kategori,
      r.periode,
      formatRupiah(r.nominal),
      r.metode.replace(/_/g, ' '),
      r.status.replace(/_/g, ' '),
      r.waktu.slice(0, 16).replace('T', ' '),
    ]),
    note: list.truncated ? `Ditampilkan ${list.rows.length} dari ${list.total} transaksi.` : undefined,
  };
}

function paymentListResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchPayments(scope, ds, {
    query: parsed.query,
    period: parsed.period,
    status: parsed.status,
    metode: parsed.metode,
    categoryCode: parsed.categoryCode,
    limit: 25,
  });
  if (!data.ok || !data.data) return notFound(scope, now, 'payment_list', 'pembayaran');
  const list = data.data as PaymentListData;
  if (list.total === 0) return notFound(scope, now, 'payment_list', 'pembayaran');

  const result = resultBase(
    scope,
    now,
    'payment_list',
    'Daftar Pembayaran',
    `Menampilkan ${list.rows.length} dari ${count(list.total)} pembayaran pada ${parsed.period.label} di ${scope.label}${parsed.query ? ` untuk pencarian "${parsed.query}"` : ''}.`
  );
  result.table = paymentTable(list);
  result.meta.rowCount = list.total;
  result.meta.truncated = list.truncated;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Riwayat transaksi diambil dari tabel pembayaran; nominal belum tentu sudah terverifikasi.';
  return result;
}

function arrearsStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getArrearsStatistics(unitScope, ds, parsed.period, now);
  if (!data.ok || !data.data) return notFound(scope, now, 'arrears_stats', 'tunggakan');
  const s = data.data as ArrearsStatisticsData;
  if (s.totalInvoices === 0) {
    return resultBase(
      scope,
      now,
      'arrears_stats',
      'Tidak Ada Tunggakan',
      `Tidak ditemukan tunggakan pada ${parsed.period.label} di ${scope.label}. Tunggakan dihitung dari tagihan yang belum lunas/dibatalkan dengan sisa tagihan lebih dari nol.`
    );
  }

  const result = resultBase(
    scope,
    now,
    'arrears_stats',
    'Statistik Tunggakan',
    `Terdapat ${count(s.totalInvoices)} tagihan tertunggak milik ${count(s.totalStudents)} santri pada ${parsed.period.label} di ${scope.label}, total tunggakan ${formatRupiah(s.totalArrears)}. ` +
      `Di antaranya ${count(s.overdueInvoices)} tagihan sudah melewati tenggat (${count(s.overdueStudents)} santri, ${formatRupiah(s.overdueAmount)}).`
  );
  result.table = {
    columns: ['Kategori', 'Jumlah Tagihan', 'Total Sisa Tunggakan'],
    rows: s.byCategory.map((c) => [c.nama, c.count, formatRupiah(c.sisa)]),
    note: 'Tunggakan = tagihan berstatus belum dibayar/menunggu verifikasi dengan sisa tagihan > 0.',
  };
  result.meta.rowCount = s.totalInvoices;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari sisa_tagihan pada tabel tagihan; tenggat waktu dibandingkan dengan tanggal hari ini.';
  result.bullets = [
    `Santri dengan tunggakan: ${count(s.totalStudents)}`,
    `Tagihan lewat tenggat: ${count(s.overdueInvoices)}`,
    `Nilai lewat tenggat: ${formatRupiah(s.overdueAmount)}`,
  ];
  return result;
}

function arrearsListResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchArrears(
    scope,
    ds,
    {
      query: parsed.query,
      period: parsed.period,
      categoryCode: parsed.categoryCode,
      unit: parsed.unit,
      overdueOnly: parsed.overdueOnly,
      limit: 25,
    },
    now
  );
  if (!data.ok || !data.data) return notFound(scope, now, 'arrears_list', 'tunggakan');
  const list = data.data as ArrearsListData;
  if (list.total === 0) {
    return resultBase(
      scope,
      now,
      'arrears_list',
      'Tidak Ada Tunggakan',
      `Tidak ditemukan tunggakan yang cocok pada ${parsed.period.label} di ${scope.label}. Saya tidak menambahkan data yang tidak ada.`
    );
  }

  const total = list.rows.reduce((a, r) => a + r.sisa, 0);
  const result = resultBase(
    scope,
    now,
    'arrears_list',
    'Daftar Tunggakan',
    `Menampilkan ${list.rows.length} dari ${count(list.total)} tagihan tertunggak di ${scope.label}, dengan total sisa ${formatRupiah(total)}.`
  );
  result.table = {
    columns: ['No. Tagihan', 'Santri', 'Kelas', 'Kategori', 'Periode', 'Sisa', 'Tenggat', 'Lewat Tenggat'],
    rows: list.rows.map((r) => [
      r.nomorTagihan,
      `${r.nama} (${r.nis})`,
      r.kelas,
      r.kategori,
      r.periode,
      formatRupiah(r.sisa),
      r.tenggat,
      r.overdue ? 'Ya' : 'Belum',
    ]),
    note: list.truncated ? `Diurutkan dari sisa terbesar. Ditampilkan ${list.rows.length} dari ${list.total}.` : 'Diurutkan dari sisa terbesar.',
  };
  result.meta.rowCount = list.total;
  result.meta.truncated = list.truncated;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Tunggakan dihitung dari sisa tagihan yang belum lunas, bukan dari dugaan.';
  return result;
}

function financeResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getFinancialReports(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'finance_report', 'laporan keuangan');
  const s = data.data as FinanceReportData;

  const selectedCategory = parsed.categoryCode
    ? s.byCategory.find((c) => c.kategori.toLowerCase().includes(parsed.categoryCode === 'uang_makan' ? 'makan' : parsed.categoryCode === 'spp_sekolah' ? 'spp' : 'syariah'))
    : undefined;
  const categoryName = selectedCategory?.kategori;
  const totalIncome = selectedCategory ? selectedCategory.nomina : s.totalIncome;
  const txCount = selectedCategory ? selectedCategory.count : s.transactionCount;

  let answer =
    `Pemasukan terverifikasi pada ${s.periodLabel} di ${scope.label} adalah ${formatRupiah(totalIncome)} dari ${count(txCount)} transaksi. ` +
    s.basis;
  if (parsed.categoryCode) {
    answer =
      `Pemasukan terverifikasi kategori ${categoryName || parsed.categoryCode} pada ${s.periodLabel} di ${scope.label} adalah ${formatRupiah(totalIncome)} dari ${count(txCount)} transaksi. ` +
      s.basis;
  }
  if (s.previousMonth) {
    const diff = totalIncome - s.previousMonth.total;
    answer += ` Perbandingan dengan ${s.previousMonth.label}: ${formatRupiah(s.previousMonth.total)} (selisih ${diff >= 0 ? '+' : ''}${formatRupiah(diff)}).`;
  }
  if (s.totalIncome === 0 && s.latestDataMonth && s.latestDataMonth.label !== s.periodLabel) {
    answer += ` Catatan: pada periode ini tidak ada pembayaran terverifikasi. Data terverifikasi terbaru yang tersedia adalah ${s.latestDataMonth.label} sebesar ${formatRupiah(s.latestDataMonth.total)}.`;
  }

  const result = resultBase(scope, now, 'finance_report', 'Laporan Keuangan', answer);
  result.table = {
    columns: ['Kategori Pembayaran', 'Transaksi', 'Pemasukan Terverifikasi'],
    rows: s.byCategory.map((c) => [c.kategori, c.count, formatRupiah(c.nomina)]),
    note:
      'Hanya pembayaran berstatus terverifikasi yang dihitung. Menunggu verifikasi/ditolak tidak termasuk pemasukan.',
  };
  result.meta.rowCount = txCount;
  result.meta.periodLabel = s.periodLabel;
  result.meta.basis = s.basis;
  result.bullets = s.monthly.slice(-6).map((m) => `${m.label}: ${formatRupiah(m.total)} (${m.count} transaksi)`);
  if (s.monthly.length === 0) {
    result.bullets = ['Belum ada pembayaran terverifikasi pada data yang dapat diakses.'];
  }
  return result;
}

function userStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  now: Date
): AdminQueryResult {
  const data = getUserStatistics(scope, ds);
  if (!data.ok || !data.data) return notFound(scope, now, 'user_stats', 'pengguna');
  const s = data.data as UserStatisticsData;
  const result = resultBase(
    scope,
    now,
    'user_stats',
    'Statistik Pengguna',
    `Terdapat ${count(s.total)} akun pengguna di ${scope.label}: ${count(s.active)} aktif dan ${count(s.inactive)} nonaktif.`
  );
  result.table = {
    columns: ['Role', 'Jumlah Akun'],
    rows: s.byRole.map((r) => [r.label, r.total]),
    note: 'Tidak ada password, hash, token, atau kredensial yang ditampilkan.',
  };
  result.meta.rowCount = s.total;
  return result;
}

function activityResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const verifikasiOnly = Boolean(parsed.verifikasiOnly);
  const data = getAdminActivityLogs(scope, ds, {
    query: parsed.query,
    period: parsed.period,
    verifikasiOnly,
    limit: 25,
  });
  if (!data.ok || !data.data) return notFound(scope, now, 'activity_logs', 'log aktivitas');
  const s = data.data as ActivityLogData;
  if (s.total === 0) return notFound(scope, now, 'activity_logs', 'log aktivitas');

  const result = resultBase(
    scope,
    now,
    'activity_logs',
    'Log Aktivitas Admin',
    `Menampilkan ${s.rows.length} dari ${count(s.total)} aktivitas pada ${parsed.period.label} di ${scope.label}. ` +
      'Log ini mencatat tindakan administratif dan akses sensitif; isinya tidak dikirim ke penyedia AI.'
  );
  result.table = {
    columns: ['Waktu', 'Pengguna', 'Role', 'Tindakan', 'Rincian'],
    rows: s.rows.map((r) => [r.waktu.slice(0, 16).replace('T', ' '), r.pengguna, r.role, r.tindakan, r.rincian]),
    note: s.truncated ? `Ditampilkan ${s.rows.length} dari ${s.total} log terbaru.` : undefined,
  };
  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  return result;
}

function telegramResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  options: AdminEngineOptions,
  now: Date
): AdminQueryResult {
  const data = getTelegramNotificationStatistics(scope, ds, options.telegramStats);
  if (!data.ok || !data.data) return notFound(scope, now, 'telegram_stats', 'statistik Telegram');
  const s = data.data as TelegramStatisticsData;
  const runtime = s.runtime;
  const result = resultBase(
    scope,
    now,
    'telegram_stats',
    'Statistik Integrasi Telegram',
    runtime
      ? `Integrasi Telegram ${runtime.configured ? 'terkonfigurasi' : 'belum terkonfigurasi'} (${runtime.enabled ? 'aktif' : 'nonaktif'}). ` +
        `Pengiriman berhasil: ${count(runtime.sent)}, gagal: ${count(runtime.failed)}, dilewati: ${count(runtime.skipped)} (duplikat ${count(runtime.duplicates)}, rate limit ${count(runtime.rateLimited)}). ` +
        s.linkageNote
      : `Statistik runtime Telegram belum tersedia dari server. ${s.linkageNote}`
  );
  result.table = {
    columns: ['Notifikasi Aplikasi', 'Jumlah'],
    rows: [
      ['Total notifikasi tersimpan', s.localNotifications],
      ['Belum dibaca', s.unreadNotifications],
      ...(runtime
        ? [
            ['Telegram berhasil', runtime.sent],
            ['Telegram gagal', runtime.failed],
            ['Telegram dilewati', runtime.skipped],
          ]
        : []),
    ],
    note: 'Token bot tidak pernah ditampilkan atau dikirim ke chatbot/AI.',
  };
  result.meta.rowCount = s.localNotifications;
  result.meta.basis =
    'Statistik pengiriman berasal dari penghitung runtime server sejak proses berjalan; bukan data historis persisten dan tidak memuat token.';
  return result;
}

// ---------------------------------------------------------------------------
// Formatter kuitansi, verifikasi hari ini, Telegram per wali
// ---------------------------------------------------------------------------

function receiptStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = getReceiptStatistics(scope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'receipt_stats', 'kuitansi');
  const s = data.data as ReceiptStatisticsData;

  if (s.total === 0) {
    const empty = resultBase(
      scope,
      now,
      'receipt_stats',
      'Tidak Ada Kuitansi',
      `Tidak ditemukan dokumen kuitansi pada ${parsed.period.label} di ${scope.label}. Kuitansi hanya diterbitkan untuk pembayaran yang sudah terverifikasi.`
    );
    empty.meta.rowCount = 0;
    return empty;
  }

  const result = resultBase(
    scope,
    now,
    'receipt_stats',
    'Statistik Kuitansi Digital',
    `Terdapat ${count(s.total)} dokumen kuitansi pada ${parsed.period.label} di ${scope.label}. ` +
      `Aktif ${count(s.active)} (${formatRupiah(s.activeNominal)}), dibatalkan ${count(s.cancelled)}, diganti ${count(s.replaced)}. ` +
      `Dari kuitansi aktif: ${count(s.lunas)} berstatus lunas dan ${count(s.partial)} dibayar sebagian.`
  );
  result.table = {
    columns: ['Bulan Terbit', 'Jumlah Kuitansi Aktif', 'Nominal'],
    rows: s.byMonth.map((row) => {
      const [year, month] = row.month.split('-').map(Number);
      const label = `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][Math.min(11, Math.max(0, month - 1))]} ${year}`;
      return [label, row.count, formatRupiah(row.nominal)];
    }),
    note: 'Satu pembayaran hanya memiliki satu kuitansi aktif. Kuitansi batal/diganti tetap tersimpan untuk audit.',
  };
  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari tabel kuitansi berdasarkan tanggal terbit dan status dokumen.';
  return result;
}

function receiptLookupResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = searchReceipts(scope, ds, {
    query: parsed.receiptNumber ? undefined : parsed.query,
    receiptNumber: parsed.receiptNumber,
    period: parsed.receiptNumber ? { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null } : parsed.period,
    limit: 15,
  });
  if (!data.ok || !data.data) return notFound(scope, now, 'receipt_lookup', 'kuitansi');
  const list = data.data as ReceiptListData;
  const needle = parsed.receiptNumber || parsed.query;
  if (list.total === 0) {
    return notFound(scope, now, 'receipt_lookup', `kuitansi "${needle || '-SERTAKAN NOMOR-'}"`);
  }

  const first = list.rows[0];
  const statusText =
    first.statusDokumen === 'aktif'
      ? first.statusPembayaran === 'sebagian'
        ? 'aktif dan sah untuk pembayaran sebagian'
        : 'aktif dan sah'
      : first.statusDokumen === 'diganti'
        ? 'sudah diganti oleh kuitansi koreksi'
        : 'sudah dibatalkan';
  const result = resultBase(
    scope,
    now,
    'receipt_lookup',
    'Detail Kuitansi Digital',
    `Kuitansi ${first.nomorKuitansi} untuk ${first.nama} (NIS ${first.nis}) sebesar ${formatRupiah(first.nominal)} ` +
      `kategori ${first.kategori} periode ${first.periode} berstatus ${statusText}. ` +
      `Nomor kuitansi tidak pernah dipakai ulang; koreksi dilakukan dengan pembatalan dan penerbitan nomor baru.`
  );
  result.table = {
    columns: ['No. Kuitansi', 'Santri', 'Kategori', 'Periode', 'Nominal', 'Status', 'Terbit'],
    rows: list.rows.map((row) => [
      row.nomorKuitansi,
      `${row.nama} (${row.nis})`,
      row.kategori,
      row.periode,
      formatRupiah(row.nominal),
      row.statusDokumen === 'aktif'
        ? row.statusPembayaran === 'sebagian'
          ? 'Aktif — sebagian'
          : 'Aktif — lunas'
        : row.statusDokumen === 'diganti'
          ? 'Diganti (koreksi)'
          : 'Dibatalkan',
      row.terbit,
    ]),
    note: list.truncated ? `Ditampilkan ${list.rows.length} dari ${list.total} kuitansi.` : undefined,
  };
  result.meta.rowCount = list.total;
  result.meta.basis = 'Pencarian dilakukan pada nomor kuitansi, nama/NIS santri, kategori, periode, ID pembayaran, atau ID tagihan.';
  return result;
}

function verifiedTodayResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  now: Date
): AdminQueryResult {
  const data = getVerifiedPaymentsToday(scope, ds, now);
  if (!data.ok || !data.data) return notFound(scope, now, 'verified_today', 'pembayaran terverifikasi hari ini');
  const s = data.data as VerifiedTodayData;

  if (s.count === 0) {
    const empty = resultBase(
      scope,
      now,
      'verified_today',
      'Belum Ada Verifikasi Hari Ini',
      `Belum ada pembayaran terverifikasi pada ${s.date} di ${scope.label}. Pembayaran menunggu verifikasi tidak dihitung sebagai pemasukan sampai disetujui bendahara atau dikonfirmasi gateway tervalidasi.`
    );
    empty.meta.rowCount = 0;
    return empty;
  }

  const result = resultBase(
    scope,
    now,
    'verified_today',
    'Pembayaran Terverifikasi Hari Ini',
    `Terdapat ${count(s.count)} pembayaran terverifikasi pada ${s.date} di ${scope.label} dengan total ${formatRupiah(s.total)}. ` +
      'Hanya status terverifikasi yang dihitung sebagai pemasukan.'
  );
  result.table = {
    columns: ['No. Pembayaran', 'Santri', 'Kategori', 'Nominal', 'Diverifikasi Oleh', 'Waktu'],
    rows: s.rows.map((row) => [
      row.nomorPembayaran,
      `${row.nama} (${row.nis})`,
      row.kategori,
      formatRupiah(row.nominal),
      row.diverifikasiOleh,
      formatDateTimeIndo(row.waktu),
    ]),
    note: s.truncated ? `Ditampilkan ${s.rows.length} dari ${s.count} pembayaran.` : undefined,
  };
  result.meta.rowCount = s.count;
  result.meta.basis = 'Tanggal verifikasi (atau waktu pembayaran bila belum tercatat) dibandingkan dengan tanggal hari ini.';
  return result;
}

function paidStudentsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getPaidStudents(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'paid_students', 'santri yang sudah membayar');
  const s = data.data as PaidStudentsData;

  if (s.totalStudents === 0) {
    return resultBase(
      scope,
      now,
      'paid_students',
      'Belum Ada Santri Membayar',
      `Tidak ditemukan pembayaran terverifikasi pada ${parsed.period.label} di ${unitScope.label}. Pembayaran menunggu verifikasi belum dihitung.`
    );
  }

  const result = resultBase(
    scope,
    now,
    'paid_students',
    'Santri Sudah Membayar',
    `Terdapat ${count(s.totalStudents)} santri dengan pembayaran terverifikasi pada ${parsed.period.label} di ${unitScope.label}, ` +
      `meliputi ${count(s.transactionCount)} transaksi senilai ${formatRupiah(s.totalNominal)}. ` +
      `${count(s.fullyPaidStudents)} santri sudah lunas seluruh tagihan aktifnya; sisanya masih memiliki sisa tagihan.`
  );
  result.table = {
    columns: ['Santri', 'NIS', 'Transaksi', 'Total Terverifikasi', 'Terakhir', 'Status Tagihan'],
    rows: s.rows.map((row) => [
      row.nama,
      row.nis,
      row.transaksi,
      formatRupiah(row.total),
      row.terakhir.slice(0, 16).replace('T', ' '),
      row.lunas ? 'Lunas' : 'Masih ada sisa',
    ]),
    note: 'Sudah membayar berarti memiliki minimal satu pembayaran TERVERIFIKASI; lunas berarti seluruh tagihan aktif memiliki sisa Rp 0.',
  };
  result.meta.rowCount = s.totalStudents;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari pembayaran terverifikasi dan sisa tagihan pada tabel tagihan.';
  result.meta.truncated = s.truncated;
  return result;
}

function pendingStatsResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getPaymentStatistics(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'pending_stats', 'pembayaran menunggu verifikasi');
  const s = data.data as PaymentStatisticsData;

  if (s.pendingCount === 0) {
    return resultBase(
      scope,
      now,
      'pending_stats',
      'Tidak Ada Pembayaran Menunggu',
      `Tidak ada pembayaran berstatus menunggu verifikasi pada ${parsed.period.label} di ${unitScope.label}.`
    );
  }

  const recent = searchPayments(unitScope, ds, {
    period: parsed.period,
    status: 'menunggu_verifikasi',
    limit: 10,
  });
  const list = recent.ok && recent.data ? (recent.data as PaymentListData) : null;

  const result = resultBase(
    scope,
    now,
    'pending_stats',
    'Pembayaran Menunggu Verifikasi',
    `Terdapat ${count(s.pendingCount)} pembayaran menunggu verifikasi pada ${parsed.period.label} di ${unitScope.label} ` +
      `dengan total ${formatRupiah(s.pendingNominal)}. Status ini BUKAN pemasukan dan belum berarti lunas.`
  );
  if (list && list.total > 0) {
    result.table = paymentTable(list);
  } else {
    result.table = {
      columns: ['Status', 'Jumlah', 'Nominal'],
      rows: [['menunggu verifikasi', s.pendingCount, formatRupiah(s.pendingNominal)]],
      note: 'Pembayaran menunggu verifikasi tidak dihitung sebagai pemasukan.',
    };
  }
  result.meta.rowCount = s.pendingCount;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Dihitung dari status pembayaran menunggu_verifikasi; tidak ada perubahan status dari chatbot.';
  return result;
}

function missingReceiptResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const unitScope = withUnit(scope, parsed.unit);
  const data = getVerifiedPaymentsWithoutReceipt(unitScope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'missing_receipt', 'kuitansi yang belum terbit');
  const s = data.data as MissingReceiptData;

  if (s.total === 0) {
    const empty = resultBase(
      scope,
      now,
      'missing_receipt',
      'Semua Pembayaran Terverifikasi Punya Kuitansi',
      `Tidak ditemukan pembayaran terverifikasi tanpa kuitansi aktif pada ${parsed.period.label} di ${unitScope.label}.`
    );
    empty.meta.rowCount = 0;
    return empty;
  }

  const result = resultBase(
    scope,
    now,
    'missing_receipt',
    'Pembayaran Terverifikasi Tanpa Kuitansi Aktif',
    `Terdapat ${count(s.total)} pembayaran terverifikasi senilai ${formatRupiah(s.totalNominal)} pada ${parsed.period.label} di ${unitScope.label} ` +
      'yang belum memiliki kuitansi aktif. Pembayaran tetap sah; kuitansi dapat diterbitkan ulang dari pusat pembayaran tanpa mengubah nominal.'
  );
  result.table = {
    columns: ['No. Pembayaran', 'Santri', 'Nominal', 'Terverifikasi', 'Alasan'],
    rows: s.rows.map((row) => [
      row.nomorPembayaran,
      `${row.nama} (${row.nis})`,
      formatRupiah(row.nominal),
      row.terverifikasiPada.slice(0, 16).replace('T', ' '),
      row.alasan,
    ]),
    note: s.truncated ? `Ditampilkan ${s.rows.length} dari ${s.total} pembayaran.` : undefined,
  };
  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis = 'Membandingkan pembayaran terverifikasi dengan kuitansi berstatus aktif; tidak menerbitkan kuitansi otomatis.';
  return result;
}

function telegramDeliveryResult(
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  now: Date
): AdminQueryResult {
  const data = getTelegramDeliveryStatistics(scope, ds, parsed.period);
  if (!data.ok || !data.data) return notFound(scope, now, 'telegram_delivery', 'riwayat pengiriman Telegram');
  const s = data.data as TelegramDeliveryStatisticsData;

  const result = resultBase(
    scope,
    now,
    'telegram_delivery',
    'Status Pengiriman Telegram per Wali',
    s.total === 0
      ? `Belum ada riwayat pengiriman Telegram pada ${parsed.period.label} di ${scope.label}. ` +
        `${count(s.guardiansWithoutTelegram)} wali terverifikasi belum menautkan Telegram. ` +
        'Kuitansi tetap tersimpan dan tidak dianggap terkirim sampai ada bukti pengiriman.'
      : `Dari ${count(s.total)} percobaan notifikasi pada ${parsed.period.label}: terkirim ${count(s.sent)}, gagal ${count(s.failed)}, ` +
        `tanpa tujuan Telegram ${count(s.noDestination)}, dinonaktifkan wali ${count(s.skipped)}, duplikat dicegah ${count(s.duplicate)}. ` +
        `${count(s.guardiansWithoutTelegram)} wali terverifikasi belum menautkan Telegram. ` +
        'Gagal kirim TIDAK membatalkan pembayaran atau kuitansi.'
  );

  if (s.failures.length > 0) {
    result.table = {
      columns: ['Waktu', 'Wali', 'Santri', 'Status', 'Notifikasi', 'Alasan'],
      rows: s.failures.map((row) => [
        row.waktu.slice(0, 16).replace('T', ' '),
        row.nama,
        row.santri,
        row.status,
        row.notice,
        row.alasan,
      ]),
      note: 'no_destination = Telegram belum tertaut; skipped = wali menonaktifkan status ini; failed = kegagalan server/Telegram.',
    };
  } else {
    result.table = {
      columns: ['Status Pengiriman', 'Jumlah'],
      rows: [
        ['Terkirim', s.sent],
        ['Gagal', s.failed],
        ['Tanpa tujuan Telegram', s.noDestination],
        ['Dinonaktifkan wali', s.skipped],
      ],
    };
  }

  result.meta.rowCount = s.total;
  result.meta.periodLabel = parsed.period.label;
  result.meta.basis =
    'Berasal dari log pengiriman notifikasi per wali. Token bot dan ID Telegram lengkap tidak pernah ditampilkan.';
  result.bullets = [
    ...s.byReason.slice(0, 5).map((reason) => `Alasan dominan (${reason.count}x): ${reason.reason}`),
    `Wali tanpa Telegram: ${count(s.guardiansWithoutTelegram)}`,
    ...s.guardiansWithoutTelegramRows
      .slice(0, 5)
      .map((guardian) => `Belum tertaut: ${guardian.nama} (${guardian.santri} santri)`),
  ];
  return result;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function dispatch(
  intent: AdminIntent,
  scope: AdminScope,
  ds: AdminChatbotSource,
  parsed: ParsedAdminIntent,
  options: AdminEngineOptions,
  now: Date
): AdminQueryResult {
  switch (intent) {
    case 'student_count':
      return studentCountResult(scope, ds, parsed, now);
    case 'student_list':
      return studentListResult(scope, ds, parsed, now);
    case 'guardian_stats':
      return guardianStatsResult(scope, ds, parsed, now);
    case 'guardian_list':
      return guardianListResult(scope, ds, parsed, now);
    case 'invoice_stats':
      return invoiceStatsResult(scope, ds, parsed, now);
    case 'invoice_list':
      return invoiceListResult(scope, ds, parsed, now);
    case 'payment_stats':
      return paymentStatsResult(scope, ds, parsed, now);
    case 'payment_list':
      return paymentListResult(scope, ds, parsed, now);
    case 'arrears_stats':
      return arrearsStatsResult(scope, ds, parsed, now);
    case 'arrears_list':
      return arrearsListResult(scope, ds, parsed, now);
    case 'finance_report':
      return financeResult(scope, ds, parsed, now);
    case 'user_stats':
      return userStatsResult(scope, ds, now);
    case 'activity_logs':
      return activityResult(scope, ds, parsed, now);
    case 'telegram_stats':
      return telegramResult(scope, ds, options, now);
    case 'telegram_delivery':
      return telegramDeliveryResult(scope, ds, parsed, now);
    case 'receipt_stats':
      return receiptStatsResult(scope, ds, parsed, now);
    case 'receipt_lookup':
      return receiptLookupResult(scope, ds, parsed, now);
    case 'verified_today':
      return verifiedTodayResult(scope, ds, now);
    case 'paid_students':
      return paidStudentsResult(scope, ds, parsed, now);
    case 'pending_stats':
      return pendingStatsResult(scope, ds, parsed, now);
    case 'missing_receipt':
      return missingReceiptResult(scope, ds, parsed, now);
    case 'help':
      return helpResult(scope, now);
    default:
      return unknownResult(scope, now, parsed.query || '');
  }
}

// ---------------------------------------------------------------------------
// API publik
// ---------------------------------------------------------------------------

export function answerAdminQuestion(
  question: string,
  user: UserProfile | null,
  ds: AdminChatbotSource,
  options: AdminEngineOptions = {}
): AdminQueryResult {
  const now = nowOf(ds, options);
  const scope = buildAdminScope(user);
  const text = (question || '').trim().slice(0, 500);

  // 1. Prompt injection selalu ditolak — teks tidak pernah mengubah role.
  if (detectPromptInjection(text)) {
    return deniedResult(
      scope,
      now,
      'Permintaan ditolak',
      'Role dan hak akses hanya ditentukan dari sesi login yang sudah diverifikasi server, bukan dari teks pertanyaan. ' +
        'Saya tidak dapat menganggap Anda admin, membuka seluruh data, atau mengabaikan aturan keamanan. ' +
        'Silakan ajukan pertanyaan data sesuai kewenangan akun Anda.',
      options,
      'prompt_injection'
    );
  }

  // 2. Role tanpa akses asisten admin.
  if (scope.access === 'none') {
    return deniedResult(
      scope,
      now,
      'Asisten Admin Tidak Tersedia',
      scope.reason ||
        'Akun Anda tidak memiliki kewenangan untuk asisten admin. Gunakan chatbot bantuan yang sesuai dengan peran Anda.',
      options
    );
  }

  // 3. Parse intent (deterministik). AI hanya boleh memberi intent allowlist.
  const parsed = { ...parseAdminIntent(text, now), rawQuestion: text };
  const forced = options.forcedIntent;
  const intent: AdminIntent = isAdminIntent(forced) ? forced : parsed.intent;

  if (intent === 'help') return helpResult(scope, now);
  if (intent === 'unknown') return unknownResult(scope, now, text);

  // 4. Capability diperiksa ulang di sini DAN di setiap fungsi data.
  const capabilityByIntent: Record<Exclude<AdminIntent, 'help' | 'unknown'>, keyof typeof CAPABILITY_LABELS> = {
    student_count: 'students',
    student_list: 'students',
    guardian_stats: 'guardians',
    guardian_list: 'guardians',
    invoice_stats: 'invoices',
    invoice_list: 'invoices',
    payment_stats: 'payments',
    payment_list: 'payments',
    arrears_stats: 'arrears',
    arrears_list: 'arrears',
    finance_report: 'finance',
    user_stats: 'users',
    activity_logs: 'audit',
    telegram_stats: 'telegram',
    telegram_delivery: 'telegram',
    receipt_stats: 'payments',
    receipt_lookup: 'payments',
    verified_today: 'payments',
    paid_students: 'payments',
    pending_stats: 'payments',
    missing_receipt: 'payments',
  };
  const capability = capabilityByIntent[intent];
  if (!hasCapability(scope, capability)) {
    return deniedCapability(scope, now, options, capability);
  }

  return dispatch(intent, scope, ds, parsed, options, now);
}

/**
 * Jalur uji/CLI: pertanyaan dengan scope buatan. Tidak pernah dipakai UI.
 */
export function answerWithScope(
  question: string,
  scope: AdminScope,
  ds: AdminChatbotSource,
  options: AdminEngineOptions = {}
): AdminQueryResult {
  const now = nowOf(ds, options);
  const text = (question || '').trim().slice(0, 500);
  if (detectPromptInjection(text)) {
    return deniedResult(scope, now, 'Permintaan ditolak', 'Role tidak dapat diubah melalui teks.', options, 'prompt_injection');
  }
  if (scope.access === 'none') {
    return deniedResult(scope, now, 'Akses ditolak', scope.reason || 'Akses ditolak.', options);
  }
  const parsed = { ...parseAdminIntent(text, now), rawQuestion: text };
  const intent: AdminIntent = isAdminIntent(options.forcedIntent) ? options.forcedIntent : parsed.intent;
  if (intent === 'help') return helpResult(scope, now);
  if (intent === 'unknown') return unknownResult(scope, now, text);
  return dispatch(intent, scope, ds, parsed, options, now);
}

export { parseAdminIntent, parsePeriod, buildAdminScope };
export type { AdminAuditEntry };
