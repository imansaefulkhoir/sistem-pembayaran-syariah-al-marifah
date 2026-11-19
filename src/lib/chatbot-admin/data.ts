import type {
  AuditLog,
  GuardianStudentRelation,
  Invoice,
  Payment,
  PaymentCategoryCode,
  PaymentMethod,
  PaymentStatus,
  Receipt,
  Student,
  UnitPondok,
  UserProfile,
  UserRole,
} from '../types';
import type {
  AdminChatbotSource,
  AdminScope,
  PeriodFilter,
  TelegramRuntimeStats,
  ToolResult,
} from './types';
import { capabilityDeniedMessage, hasCapability, sanitizeSearchTerm } from './rbac';

/**
 * LAPISAN FUNGSI DATA TERKONTROL UNTUK ASISTEN ADMIN.
 *
 * Setiap fungsi WAJIB:
 * 1. Memeriksa capability dari `AdminScope` (bukan dari teks pengguna).
 * 2. Membatasi unit (putra/putri) untuk pengurus.
 * 3. Memproyeksikan hanya kolom yang dibutuhkan.
 * 4. Membatasi jumlah baris yang dikembalikan.
 * 5. Mencatat akses melalui `source.logAccess` bila tersedia.
 *
 * Tidak ada fungsi tulis, tidak ada SQL bebas, dan tidak ada objek user
 * lengkap (termasuk kolom kredensial) yang dikembalikan ke UI/AI.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit as number)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit as number)));
}

function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): ToolResult<T> {
  return { ok: false, error };
}

function record(scope: AdminScope, ds: AdminChatbotSource, action: string, detail: string): void {
  if (!ds.logAccess) return;
  const at = (ds.now?.() ?? new Date()).toISOString();
  ds.logAccess({ action: action.slice(0, 80), detail: detail.slice(0, 300), at });
}

function guard<T>(
  scope: AdminScope,
  ds: AdminChatbotSource,
  capability: Parameters<typeof hasCapability>[1],
  action: string
): ToolResult<T> | null {
  if (scope.access === 'none') {
    record(scope, ds, 'CHATBOT_ADMIN_DENIED', `${action}: ${scope.reason || 'tanpa akses'}`);
    return fail(scope.reason || 'Akses ditolak.');
  }
  if (!hasCapability(scope, capability)) {
    record(scope, ds, 'CHATBOT_ADMIN_DENIED', `${action}: capability ${capability} tidak dimiliki`);
    return fail(capabilityDeniedMessage(capability));
  }
  return null;
}

function scopedStudents(scope: AdminScope, ds: AdminChatbotSource): Student[] {
  const students = ds.getStudents();
  if (scope.access === 'unit') return students.filter((s) => s.unit === scope.unit);
  return students;
}

function scopedStudentIds(scope: AdminScope, ds: AdminChatbotSource): Set<string> {
  return new Set(scopedStudents(scope, ds).map((s) => s.id));
}

function scopedInvoices(scope: AdminScope, ds: AdminChatbotSource): Invoice[] {
  if (scope.access === 'all') return ds.getInvoices();
  const ids = scopedStudentIds(scope, ds);
  return ds.getInvoices().filter((i) => ids.has(i.studentId));
}

function scopedPayments(scope: AdminScope, ds: AdminChatbotSource): Payment[] {
  if (scope.access === 'all') return ds.getPayments();
  const ids = scopedStudentIds(scope, ds);
  return ds.getPayments().filter((p) => ids.has(p.studentId));
}

function scopedRelations(scope: AdminScope, ds: AdminChatbotSource): GuardianStudentRelation[] {
  if (scope.access === 'all') return ds.getGuardianRelations();
  const ids = scopedStudentIds(scope, ds);
  return ds.getGuardianRelations().filter((r) => ids.has(r.studentId));
}

function scopedUsers(scope: AdminScope, ds: AdminChatbotSource): UserProfile[] {
  if (scope.access === 'all') return ds.getUsers();
  // Pengurus unit hanya melihat akun yang tertaut ke santri unitnya.
  const ids = scopedStudentIds(scope, ds);
  return ds.getUsers().filter(
    (u) =>
      (u.studentId && ids.has(u.studentId)) ||
      (u.linkedStudentIds || []).some((id) => ids.has(id))
  );
}

function inPeriod(dateValue: string | undefined, period: PeriodFilter): boolean {
  if (period.preset === 'all') return true;
  if (!dateValue) return false;
  const day = dateValue.slice(0, 10);
  if (period.start && day < period.start) return false;
  if (period.end && day >= period.end) return false;
  return true;
}

function invoiceInPeriod(invoice: Invoice, period: PeriodFilter): boolean {
  if (period.preset === 'all') return true;
  if (period.preset === 'specific_month' && invoice.periodeBulan.toLowerCase() === period.label.toLowerCase()) {
    return true;
  }
  return inPeriod(invoice.tanggalTerbit, period);
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function groupSum<T>(
  items: T[],
  key: (item: T) => string
): { key: string; count: number; total: number }[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const item of items) {
    const k = key(item) || '-';
    const current = map.get(k) || { count: 0, total: 0 };
    current.count += 1;
    map.set(k, current);
  }
  return Array.from(map.entries())
    .map(([k, v]) => ({ key: k, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// A. DATA SANTRI
// ---------------------------------------------------------------------------

export interface StudentStatisticsData {
  total: number;
  active: number;
  inactive: number;
  putra: number;
  putri: number;
  byClass: { kelas: string; total: number }[];
  byRegion: { daerah: string; total: number }[];
  regionsTruncated: boolean;
  scopeLabel: string;
}

export function getStudentStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource
): ToolResult<StudentStatisticsData> {
  const denied = guard<StudentStatisticsData>(scope, ds, 'students', 'getStudentStatistics');
  if (denied) return denied;

  const students = scopedStudents(scope, ds);
  const classMap = new Map<string, number>();
  const regionMap = new Map<string, number>();
  for (const s of students) {
    classMap.set(s.kelas, (classMap.get(s.kelas) || 0) + 1);
    regionMap.set(s.asalDaerah, (regionMap.get(s.asalDaerah) || 0) + 1);
  }
  const byRegion = Array.from(regionMap.entries())
    .map(([daerah, total]) => ({ daerah, total }))
    .sort((a, b) => b.total - a.total || a.daerah.localeCompare(b.daerah));

  record(scope, ds, 'CHATBOT_ADMIN_READ_STUDENTS', `Statistik santri (${scope.label})`);
  return ok({
    total: students.length,
    active: students.filter((s) => s.statusAktif).length,
    inactive: students.filter((s) => !s.statusAktif).length,
    putra: students.filter((s) => s.unit === 'putra').length,
    putri: students.filter((s) => s.unit === 'putri').length,
    byClass: Array.from(classMap.entries())
      .map(([kelas, total]) => ({ kelas, total }))
      .sort((a, b) => a.kelas.localeCompare(b.kelas)),
    byRegion: byRegion.slice(0, 15),
    regionsTruncated: byRegion.length > 15,
    scopeLabel: scope.label,
  });
}

export interface StudentRow {
  id: string;
  nis: string;
  nama: string;
  jenisKelamin: string;
  kelas: string;
  unit: UnitPondok;
  asalDaerah: string;
  statusAktif: boolean;
  waliNama: string;
}

export interface StudentListData {
  total: number;
  rows: StudentRow[];
  truncated: boolean;
  query?: string;
}

export function searchStudents(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: { query?: string; kelas?: string; unit?: UnitPondok; limit?: number } = {}
): ToolResult<StudentListData> {
  const denied = guard<StudentListData>(scope, ds, 'students', 'searchStudents');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const limit = clampLimit(params.limit);
  let rows = scopedStudents(scope, ds);

  if (params.unit) rows = rows.filter((s) => s.unit === params.unit);
  if (params.kelas) {
    const kelas = params.kelas.toLowerCase();
    rows = rows.filter(
      (s) => s.kelas.toLowerCase() === kelas || s.kelas.toLowerCase().startsWith(`${kelas} `)
    );
  }
  if (query) {
    rows = rows.filter(
      (s) =>
        s.nama.toLowerCase().includes(query) ||
        s.nis.toLowerCase().includes(query) ||
        s.asalDaerah.toLowerCase().includes(query) ||
        s.kelas.toLowerCase().includes(query)
    );
  }

  const total = rows.length;
  const projected = rows.slice(0, limit).map((s) => ({
    id: s.id,
    nis: s.nis,
    nama: s.nama,
    jenisKelamin: s.jenisKelamin,
    kelas: s.kelas,
    unit: s.unit,
    asalDaerah: s.asalDaerah,
    statusAktif: s.statusAktif,
    waliNama: s.waliNama || '-',
  }));

  record(scope, ds, 'CHATBOT_ADMIN_READ_STUDENTS', `Pencarian santri "${query || '-'}" (${scope.label})`);
  return ok({ total, rows: projected, truncated: total > projected.length, query: query || undefined });
}

// ---------------------------------------------------------------------------
// B. DATA WALI SANTRI
// ---------------------------------------------------------------------------

export interface GuardianRow {
  guardianId: string;
  guardianName: string;
  guardianPhone: string;
  verifiedChildren: number;
  totalChildren: number;
  students: string;
  units: string;
}

export interface GuardianStatisticsData {
  totalGuardians: number;
  verifiedGuardians: number;
  unverifiedGuardians: number;
  totalRelations: number;
  unverifiedRelations: number;
  linkedStudents: number;
  studentsWithoutVerifiedGuardian: number;
  childrenPerGuardian: GuardianRow[];
}

export function getGuardianStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource
): ToolResult<GuardianStatisticsData> {
  const denied = guard<GuardianStatisticsData>(scope, ds, 'guardians', 'getGuardianStatistics');
  if (denied) return denied;

  const students = scopedStudents(scope, ds);
  const relations = scopedRelations(scope, ds);
  const byGuardian = new Map<
    string,
    {
      guardianName: string;
      guardianPhone: string;
      verifiedChildren: number;
      totalChildren: number;
      students: string[];
      units: Set<string>;
    }
  >();

  const studentMap = new Map(students.map((s) => [s.id, s]));
  for (const rel of relations) {
    const current = byGuardian.get(rel.guardianId) || {
      guardianName: rel.guardianName,
      guardianPhone: rel.guardianPhone,
      verifiedChildren: 0,
      totalChildren: 0,
      students: [],
      units: new Set<string>(),
    };
    current.totalChildren += 1;
    if (rel.isVerified) current.verifiedChildren += 1;
    current.students.push(rel.studentName);
    const student = studentMap.get(rel.studentId);
    if (student) current.units.add(student.unit);
    byGuardian.set(rel.guardianId, current);
  }

  const rows: GuardianRow[] = Array.from(byGuardian.entries())
    .map(([guardianId, value]) => ({
      guardianId,
      guardianName: value.guardianName,
      guardianPhone: value.guardianPhone,
      verifiedChildren: value.verifiedChildren,
      totalChildren: value.totalChildren,
      students: value.students.slice(0, 5).join(', '),
      units: Array.from(value.units).join(', ') || '-',
    }))
    .sort((a, b) => b.verifiedChildren - a.verifiedChildren || a.guardianName.localeCompare(b.guardianName));

  const verifiedGuardianIds = new Set(
    relations.filter((r) => r.isVerified).map((r) => r.guardianId)
  );
  const linkedStudentIds = new Set(
    relations.filter((r) => r.isVerified).map((r) => r.studentId)
  );

  record(scope, ds, 'CHATBOT_ADMIN_READ_GUARDIANS', `Statistik wali santri (${scope.label})`);
  return ok({
    totalGuardians: byGuardian.size,
    verifiedGuardians: verifiedGuardianIds.size,
    unverifiedGuardians: Math.max(0, byGuardian.size - verifiedGuardianIds.size),
    totalRelations: relations.length,
    unverifiedRelations: relations.filter((r) => !r.isVerified).length,
    linkedStudents: linkedStudentIds.size,
    studentsWithoutVerifiedGuardian: students.filter((s) => !linkedStudentIds.has(s.id)).length,
    childrenPerGuardian: rows.slice(0, MAX_LIMIT),
  });
}

export interface GuardianListData {
  total: number;
  rows: GuardianRow[];
  truncated: boolean;
  query?: string;
}

export function searchGuardians(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: { query?: string; limit?: number } = {}
): ToolResult<GuardianListData> {
  const denied = guard<GuardianListData>(scope, ds, 'guardians', 'searchGuardians');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const limit = clampLimit(params.limit);
  const students = scopedStudents(scope, ds);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  let relations = scopedRelations(scope, ds);

  if (query) {
    relations = relations.filter(
      (r) =>
        r.guardianName.toLowerCase().includes(query) ||
        r.guardianPhone.toLowerCase().includes(query) ||
        r.studentName.toLowerCase().includes(query) ||
        (studentMap.get(r.studentId)?.nis || '').toLowerCase().includes(query)
    );
  }

  const byGuardian = new Map<string, GuardianRow>();
  for (const rel of relations) {
    const current =
      byGuardian.get(rel.guardianId) ||
      ({
        guardianId: rel.guardianId,
        guardianName: rel.guardianName,
        guardianPhone: rel.guardianPhone,
        verifiedChildren: 0,
        totalChildren: 0,
        students: '',
        units: '',
      } as GuardianRow);
    current.totalChildren += 1;
    if (rel.isVerified) current.verifiedChildren += 1;
    const student = studentMap.get(rel.studentId);
    const names = current.students ? current.students.split(', ') : [];
    names.push(rel.studentName);
    current.students = Array.from(new Set(names)).slice(0, 5).join(', ');
    if (student) {
      const units = current.units && current.units !== '-' ? current.units.split(', ') : [];
      units.push(student.unit);
      current.units = Array.from(new Set(units)).join(', ');
    }
    byGuardian.set(rel.guardianId, current);
  }

  const rows = Array.from(byGuardian.values());
  record(scope, ds, 'CHATBOT_ADMIN_READ_GUARDIANS', `Pencarian wali "${query || '-'}" (${scope.label})`);
  return ok({
    total: rows.length,
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
    query: query || undefined,
  });
}

// ---------------------------------------------------------------------------
// C. DATA TAGIHAN
// ---------------------------------------------------------------------------

export interface CategoryBreakdown {
  code: string;
  nama: string;
  count: number;
  nominal: number;
  sisa: number;
}

export interface InvoiceStatisticsData {
  total: number;
  totalNominal: number;
  totalSisa: number;
  lunas: number;
  belumDibayar: number;
  menungguVerifikasi: number;
  dibatalkan: number;
  byCategory: CategoryBreakdown[];
  byUnit: { unit: string; count: number; nominal: number; sisa: number }[];
  byPeriod: { periode: string; count: number; nominal: number; sisa: number }[];
}

export function getInvoiceStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<InvoiceStatisticsData> {
  const denied = guard<InvoiceStatisticsData>(scope, ds, 'invoices', 'getInvoiceStatistics');
  if (denied) return denied;

  const invoices = scopedInvoices(scope, ds).filter((i) => invoiceInPeriod(i, period));
  const catMap = new Map<string, CategoryBreakdown>();
  const unitMap = new Map<string, { count: number; nominal: number; sisa: number }>();
  const periodMap = new Map<string, { count: number; nominal: number; sisa: number }>();

  for (const inv of invoices) {
    const cat = catMap.get(inv.categoryCode) || {
      code: inv.categoryCode,
      nama: inv.categoryNama,
      count: 0,
      nominal: 0,
      sisa: 0,
    };
    cat.count += 1;
    cat.nominal += inv.nominal;
    cat.sisa += inv.sisaTagihan;
    catMap.set(inv.categoryCode, cat);

    const unit = unitMap.get(inv.studentUnit) || { count: 0, nominal: 0, sisa: 0 };
    unit.count += 1;
    unit.nominal += inv.nominal;
    unit.sisa += inv.sisaTagihan;
    unitMap.set(inv.studentUnit, unit);

    const per = periodMap.get(inv.periodeBulan) || { count: 0, nominal: 0, sisa: 0 };
    per.count += 1;
    per.nominal += inv.nominal;
    per.sisa += inv.sisaTagihan;
    periodMap.set(inv.periodeBulan, per);
  }

  record(scope, ds, 'CHATBOT_ADMIN_READ_INVOICES', `Statistik tagihan ${period.label} (${scope.label})`);
  return ok({
    total: invoices.length,
    totalNominal: sum(invoices, (i) => i.nominal),
    totalSisa: sum(invoices, (i) => i.sisaTagihan),
    lunas: invoices.filter((i) => i.status === 'lunas').length,
    belumDibayar: invoices.filter((i) => i.status === 'belum_dibayar').length,
    menungguVerifikasi: invoices.filter((i) => i.status === 'menunggu_verifikasi').length,
    dibatalkan: invoices.filter((i) => i.status === 'dibatalkan').length,
    byCategory: Array.from(catMap.values()).sort((a, b) => b.nominal - a.nominal),
    byUnit: Array.from(unitMap.entries()).map(([unit, v]) => ({ unit, ...v })),
    byPeriod: Array.from(periodMap.entries())
      .map(([periode, v]) => ({ periode, ...v }))
      .sort((a, b) => a.periode.localeCompare(b.periode)),
  });
}

export interface InvoiceRow {
  nomorTagihan: string;
  nama: string;
  nis: string;
  kelas: string;
  unit: UnitPondok;
  kategori: string;
  periode: string;
  nominal: number;
  sisa: number;
  status: string;
  tenggat: string;
}

export interface InvoiceListData {
  total: number;
  rows: InvoiceRow[];
  truncated: boolean;
  query?: string;
}

export function searchInvoices(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: {
    query?: string;
    period?: PeriodFilter;
    status?: Invoice['status'];
    categoryCode?: PaymentCategoryCode;
    unit?: UnitPondok;
    limit?: number;
  } = {}
): ToolResult<InvoiceListData> {
  const denied = guard<InvoiceListData>(scope, ds, 'invoices', 'searchInvoices');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const period = params.period || { preset: 'all' as const, label: 'Seluruh data tersedia', start: null, end: null };
  const limit = clampLimit(params.limit);
  let invoices = scopedInvoices(scope, ds).filter((i) => invoiceInPeriod(i, period));

  if (params.status) invoices = invoices.filter((i) => i.status === params.status);
  if (params.categoryCode) invoices = invoices.filter((i) => i.categoryCode === params.categoryCode);
  if (params.unit) invoices = invoices.filter((i) => i.studentUnit === params.unit);
  if (query) {
    invoices = invoices.filter(
      (i) =>
        i.studentNama.toLowerCase().includes(query) ||
        i.studentNis.toLowerCase().includes(query) ||
        i.nomorTagihan.toLowerCase().includes(query) ||
        i.categoryNama.toLowerCase().includes(query) ||
        i.periodeBulan.toLowerCase().includes(query)
    );
  }

  invoices = invoices.sort((a, b) => b.tanggalTerbit.localeCompare(a.tanggalTerbit));
  const rows = invoices.slice(0, limit).map((i) => ({
    nomorTagihan: i.nomorTagihan,
    nama: i.studentNama,
    nis: i.studentNis,
    kelas: i.studentKelas,
    unit: i.studentUnit,
    kategori: i.categoryNama,
    periode: i.periodeBulan,
    nominal: i.nominal,
    sisa: i.sisaTagihan,
    status: i.status,
    tenggat: i.tenggatWaktu,
  }));

  record(scope, ds, 'CHATBOT_ADMIN_READ_INVOICES', `Daftar tagihan "${query || '-'}" (${scope.label})`);
  return ok({ total: invoices.length, rows, truncated: invoices.length > rows.length, query: query || undefined });
}

// ---------------------------------------------------------------------------
// D. DATA PEMBAYARAN
// ---------------------------------------------------------------------------

export interface PaymentStatisticsData {
  total: number;
  totalNominal: number;
  verifiedCount: number;
  verifiedNominal: number;
  pendingCount: number;
  pendingNominal: number;
  rejectedCount: number;
  rejectedNominal: number;
  expiredCount: number;
  expiredNominal: number;
  byMethod: { metode: PaymentMethod; count: number; nomina: number }[];
  byCategory: { kategori: string; count: number; nomina: number }[];
  byStatus: { status: PaymentStatus; count: number; nomina: number }[];
}

export function getPaymentStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<PaymentStatisticsData> {
  const denied = guard<PaymentStatisticsData>(scope, ds, 'payments', 'getPaymentStatistics');
  if (denied) return denied;

  const payments = scopedPayments(scope, ds).filter((p) => inPeriod(p.waktuPembayaran, period));
  const invoices = new Map(scopedInvoices(scope, ds).map((i) => [i.id, i]));

  const methodMap = new Map<PaymentMethod, { count: number; nomina: number }>();
  const categoryMap = new Map<string, { count: number; nomina: number }>();
  const statusMap = new Map<PaymentStatus, { count: number; nomina: number }>();

  for (const p of payments) {
    const method = methodMap.get(p.metode) || { count: 0, nomina: 0 };
    method.count += 1;
    method.nomina += p.nominal;
    methodMap.set(p.metode, method);

    const category = invoices.get(p.invoiceId)?.categoryNama || 'Tanpa kategori';
    const cat = categoryMap.get(category) || { count: 0, nomina: 0 };
    cat.count += 1;
    cat.nomina += p.nominal;
    categoryMap.set(category, cat);

    const status = statusMap.get(p.status) || { count: 0, nomina: 0 };
    status.count += 1;
    status.nomina += p.nominal;
    statusMap.set(p.status, status);
  }

  const verified = payments.filter((p) => p.status === 'terverifikasi');
  const pending = payments.filter((p) => p.status === 'menunggu_verifikasi');
  const rejected = payments.filter((p) => p.status === 'ditolak');
  const expired = payments.filter((p) => p.status === 'kedaluwarsa');

  record(scope, ds, 'CHATBOT_ADMIN_READ_PAYMENTS', `Statistik pembayaran ${period.label} (${scope.label})`);
  return ok({
    total: payments.length,
    totalNominal: sum(payments, (p) => p.nominal),
    verifiedCount: verified.length,
    verifiedNominal: sum(verified, (p) => p.nominal),
    pendingCount: pending.length,
    pendingNominal: sum(pending, (p) => p.nominal),
    rejectedCount: rejected.length,
    rejectedNominal: sum(rejected, (p) => p.nominal),
    expiredCount: expired.length,
    expiredNominal: sum(expired, (p) => p.nominal),
    byMethod: Array.from(methodMap.entries()).map(([metode, v]) => ({ metode, ...v })),
    byCategory: Array.from(categoryMap.entries()).map(([kategori, v]) => ({ kategori, ...v })),
    byStatus: Array.from(statusMap.entries()).map(([status, v]) => ({ status, ...v })),
  });
}

export interface PaymentRow {
  nomorPembayaran: string;
  nama: string;
  nis: string;
  kategori: string;
  periode: string;
  nominal: number;
  metode: PaymentMethod;
  status: PaymentStatus;
  waktu: string;
  diverifikasiOleh: string;
}

export interface PaymentListData {
  total: number;
  rows: PaymentRow[];
  truncated: boolean;
  query?: string;
}

export function searchPayments(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: {
    query?: string;
    period?: PeriodFilter;
    status?: PaymentStatus;
    metode?: PaymentMethod;
    categoryCode?: PaymentCategoryCode;
    limit?: number;
  } = {}
): ToolResult<PaymentListData> {
  const denied = guard<PaymentListData>(scope, ds, 'payments', 'searchPayments');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const period = params.period || { preset: 'all' as const, label: 'Seluruh data tersedia', start: null, end: null };
  const limit = clampLimit(params.limit);
  const invoiceMap = new Map(scopedInvoices(scope, ds).map((i) => [i.id, i]));
  const studentNis = new Map(scopedStudents(scope, ds).map((s) => [s.id, s.nis]));
  let payments = scopedPayments(scope, ds).filter((p) => inPeriod(p.waktuPembayaran, period));

  if (params.status) payments = payments.filter((p) => p.status === params.status);
  if (params.metode) payments = payments.filter((p) => p.metode === params.metode);
  if (params.categoryCode) {
    payments = payments.filter((p) => invoiceMap.get(p.invoiceId)?.categoryCode === params.categoryCode);
  }
  if (query) {
    payments = payments.filter((p) => {
      const invoice = invoiceMap.get(p.invoiceId);
      return (
        p.studentNama.toLowerCase().includes(query) ||
        (studentNis.get(p.studentId) || '').toLowerCase().includes(query) ||
        p.nomorPembayaran.toLowerCase().includes(query) ||
        (invoice?.categoryNama || '').toLowerCase().includes(query) ||
        (invoice?.periodeBulan || '').toLowerCase().includes(query)
      );
    });
  }

  payments = payments.sort((a, b) => b.waktuPembayaran.localeCompare(a.waktuPembayaran));
  const rows = payments.slice(0, limit).map((p) => {
    const invoice = invoiceMap.get(p.invoiceId);
    return {
      nomorPembayaran: p.nomorPembayaran,
      nama: p.studentNama,
      nis: studentNis.get(p.studentId) || '-',
      kategori: invoice?.categoryNama || '-',
      periode: invoice?.periodeBulan || '-',
      nominal: p.nominal,
      metode: p.metode,
      status: p.status,
      waktu: p.waktuPembayaran,
      diverifikasiOleh: p.diverifikasiOlehNama || '-',
    };
  });

  record(scope, ds, 'CHATBOT_ADMIN_READ_PAYMENTS', `Daftar pembayaran "${query || '-'}" (${scope.label})`);
  return ok({ total: payments.length, rows, truncated: payments.length > rows.length, query: query || undefined });
}

// ---------------------------------------------------------------------------
// E. DATA TUNGGAKAN
// ---------------------------------------------------------------------------

export interface ArrearsStatisticsData {
  totalInvoices: number;
  totalStudents: number;
  totalArrears: number;
  overdueInvoices: number;
  overdueStudents: number;
  overdueAmount: number;
  byCategory: CategoryBreakdown[];
  byPeriod: { periode: string; count: number; sisa: number }[];
  byUnit: { unit: string; count: number; sisa: number }[];
}

export function getArrearsStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null },
  now: Date = new Date()
): ToolResult<ArrearsStatisticsData> {
  const denied = guard<ArrearsStatisticsData>(scope, ds, 'arrears', 'getArrearsStatistics');
  if (denied) return denied;

  const today = now.toISOString().slice(0, 10);
  const invoices = scopedInvoices(scope, ds).filter(
    (i) =>
      i.status !== 'lunas' &&
      i.status !== 'dibatalkan' &&
      i.sisaTagihan > 0 &&
      invoiceInPeriod(i, period)
  );
  const overdue = invoices.filter((i) => i.tenggatWaktu < today);

  const catMap = new Map<string, CategoryBreakdown>();
  const periodMap = new Map<string, { count: number; sisa: number }>();
  const unitMap = new Map<string, { count: number; sisa: number }>();
  for (const inv of invoices) {
    const cat = catMap.get(inv.categoryCode) || {
      code: inv.categoryCode,
      nama: inv.categoryNama,
      count: 0,
      nominal: 0,
      sisa: 0,
    };
    cat.count += 1;
    cat.nominal += inv.nominal;
    cat.sisa += inv.sisaTagihan;
    catMap.set(inv.categoryCode, cat);

    const per = periodMap.get(inv.periodeBulan) || { count: 0, sisa: 0 };
    per.count += 1;
    per.sisa += inv.sisaTagihan;
    periodMap.set(inv.periodeBulan, per);

    const unit = unitMap.get(inv.studentUnit) || { count: 0, sisa: 0 };
    unit.count += 1;
    unit.sisa += inv.sisaTagihan;
    unitMap.set(inv.studentUnit, unit);
  }

  record(scope, ds, 'CHATBOT_ADMIN_READ_ARREARS', `Statistik tunggakan ${period.label} (${scope.label})`);
  return ok({
    totalInvoices: invoices.length,
    totalStudents: new Set(invoices.map((i) => i.studentId)).size,
    totalArrears: sum(invoices, (i) => i.sisaTagihan),
    overdueInvoices: overdue.length,
    overdueStudents: new Set(overdue.map((i) => i.studentId)).size,
    overdueAmount: sum(overdue, (i) => i.sisaTagihan),
    byCategory: Array.from(catMap.values()).sort((a, b) => b.sisa - a.sisa),
    byPeriod: Array.from(periodMap.entries())
      .map(([periode, v]) => ({ periode, ...v }))
      .sort((a, b) => a.periode.localeCompare(b.periode)),
    byUnit: Array.from(unitMap.entries()).map(([unit, v]) => ({ unit, ...v })),
  });
}

export interface ArrearsRow {
  nomorTagihan: string;
  nama: string;
  nis: string;
  kelas: string;
  unit: UnitPondok;
  kategori: string;
  periode: string;
  sisa: number;
  tenggat: string;
  overdue: boolean;
}

export interface ArrearsListData {
  total: number;
  rows: ArrearsRow[];
  truncated: boolean;
}

export function searchArrears(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: {
    query?: string;
    period?: PeriodFilter;
    categoryCode?: PaymentCategoryCode;
    unit?: UnitPondok;
    overdueOnly?: boolean;
    limit?: number;
  } = {},
  now: Date = new Date()
): ToolResult<ArrearsListData> {
  const denied = guard<ArrearsListData>(scope, ds, 'arrears', 'searchArrears');
  if (denied) return denied;

  const today = now.toISOString().slice(0, 10);
  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const period = params.period || { preset: 'all' as const, label: 'Seluruh data tersedia', start: null, end: null };
  const limit = clampLimit(params.limit);
  let invoices = scopedInvoices(scope, ds).filter(
    (i) =>
      i.status !== 'lunas' &&
      i.status !== 'dibatalkan' &&
      i.sisaTagihan > 0 &&
      invoiceInPeriod(i, period)
  );

  if (params.overdueOnly) invoices = invoices.filter((i) => i.tenggatWaktu < today);
  if (params.categoryCode) invoices = invoices.filter((i) => i.categoryCode === params.categoryCode);
  if (params.unit) invoices = invoices.filter((i) => i.studentUnit === params.unit);
  if (query) {
    invoices = invoices.filter(
      (i) =>
        i.studentNama.toLowerCase().includes(query) ||
        i.studentNis.toLowerCase().includes(query) ||
        i.nomorTagihan.toLowerCase().includes(query) ||
        i.categoryNama.toLowerCase().includes(query)
    );
  }

  invoices = invoices.sort((a, b) => b.sisaTagihan - a.sisaTagihan);
  const rows = invoices.slice(0, limit).map((i) => ({
    nomorTagihan: i.nomorTagihan,
    nama: i.studentNama,
    nis: i.studentNis,
    kelas: i.studentKelas,
    unit: i.studentUnit,
    kategori: i.categoryNama,
    periode: i.periodeBulan,
    sisa: i.sisaTagihan,
    tenggat: i.tenggatWaktu,
    overdue: i.tenggatWaktu < today,
  }));

  record(scope, ds, 'CHATBOT_ADMIN_READ_ARREARS', `Daftar tunggakan "${query || '-'}" (${scope.label})`);
  return ok({ total: invoices.length, rows, truncated: invoices.length > rows.length });
}

// ---------------------------------------------------------------------------
// F. LAPORAN KEUANGAN
// ---------------------------------------------------------------------------

export interface FinanceReportData {
  periodLabel: string;
  totalIncome: number;
  transactionCount: number;
  byCategory: { kategori: string; count: number; nomina: number }[];
  byMethod: { metode: PaymentMethod; count: number; nomina: number }[];
  monthly: { key: string; label: string; total: number; count: number }[];
  previousMonth: { label: string; total: number } | null;
  latestDataMonth: { label: string; total: number } | null;
  basis: string;
}

export function getFinancialReports(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<FinanceReportData> {
  const denied = guard<FinanceReportData>(scope, ds, 'finance', 'getFinancialReports');
  if (denied) return denied;

  const allPayments = scopedPayments(scope, ds);
  const verified = allPayments.filter((p) => p.status === 'terverifikasi');
  const selected = verified.filter((p) => inPeriod(p.waktuPembayaran, period));
  const invoiceMap = new Map(scopedInvoices(scope, ds).map((i) => [i.id, i]));

  const categoryMap = new Map<string, { count: number; nomina: number }>();
  const methodMap = new Map<PaymentMethod, { count: number; nomina: number }>();
  for (const p of selected) {
    const category = invoiceMap.get(p.invoiceId)?.categoryNama || 'Tanpa kategori';
    const cat = categoryMap.get(category) || { count: 0, nomina: 0 };
    cat.count += 1;
    cat.nomina += p.nominal;
    categoryMap.set(category, cat);

    const method = methodMap.get(p.metode) || { count: 0, nomina: 0 };
    method.count += 1;
    method.nomina += p.nominal;
    methodMap.set(p.metode, method);
  }

  const monthlyMap = new Map<string, { total: number; count: number }>();
  for (const p of verified) {
    const key = p.waktuPembayaran.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const current = monthlyMap.get(key) || { total: 0, count: 0 };
    current.total += p.nominal;
    current.count += 1;
    monthlyMap.set(key, current);
  }
  const monthly = Array.from(monthlyMap.entries())
    .map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);
      return { key, label: `${monthName(month)} ${year}`, ...value };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  let previousMonth: { label: string; total: number } | null = null;
  if (period.preset === 'specific_month' && period.start) {
    const selectedDate = new Date(`${period.start}T00:00:00`);
    const prev = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const found = monthly.find((m) => m.key === prevKey);
    previousMonth = {
      label: `${monthName(prev.getMonth() + 1)} ${prev.getFullYear()}`,
      total: found?.total || 0,
    };
  }

  const latest = monthly.length > 0 ? monthly[monthly.length - 1] : null;

  record(scope, ds, 'CHATBOT_ADMIN_READ_FINANCE', `Laporan keuangan ${period.label} (${scope.label})`);
  return ok({
    periodLabel: period.label,
    totalIncome: sum(selected, (p) => p.nominal),
    transactionCount: selected.length,
    byCategory: Array.from(categoryMap.entries())
      .map(([kategori, v]) => ({ kategori, ...v }))
      .sort((a, b) => b.nomina - a.nomina),
    byMethod: Array.from(methodMap.entries()).map(([metode, v]) => ({ metode, ...v })),
    monthly,
    previousMonth,
    latestDataMonth: latest,
    basis:
      'Pemasukan dihitung dari pembayaran berstatus TERVERIFIKASI berdasarkan tanggal pembayaran. Pembayaran menunggu verifikasi tidak dihitung sebagai pemasukan.',
  });
}

function monthName(month: number): string {
  const names = [
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
  return names[Math.min(11, Math.max(0, month - 1))];
}

// ---------------------------------------------------------------------------
// G. DATA PENGGUNA & AKTIVITAS
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<UserRole, string> = {
  pengasuh: 'Ibu Nyai / Bapak Pengasuh',
  kepala_pondok_putra: 'Kepala Pondok Putra',
  kepala_pondok_putri: 'Kepala Pondok Putri',
  pengurus_putra: 'Pengurus Putra',
  pengurus_putri: 'Pengurus Putri',
  kepala_bendahara: 'Kepala Bendahara',
  admin_bendahara: 'Admin Bendahara (Kasir)',
  anggota_bendahara: 'Anggota Bendahara',
  wali_santri: 'Wali Santri',
  santri: 'Santri',
};

export interface UserStatisticsData {
  total: number;
  active: number;
  inactive: number;
  byRole: { role: UserRole; label: string; total: number }[];
}

export function getUserStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource
): ToolResult<UserStatisticsData> {
  const denied = guard<UserStatisticsData>(scope, ds, 'users', 'getUserStatistics');
  if (denied) return denied;

  const users = scopedUsers(scope, ds);
  const roleMap = new Map<UserRole, number>();
  for (const user of users) roleMap.set(user.role, (roleMap.get(user.role) || 0) + 1);

  record(scope, ds, 'CHATBOT_ADMIN_READ_USERS', `Statistik pengguna (${scope.label})`);
  return ok({
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    byRole: Array.from(roleMap.entries())
      .map(([role, total]) => ({ role, label: ROLE_LABEL[role], total }))
      .sort((a, b) => b.total - a.total),
  });
}

export interface ActivityRow {
  waktu: string;
  pengguna: string;
  role: string;
  tindakan: string;
  rincian: string;
}

export interface ActivityLogData {
  total: number;
  rows: ActivityRow[];
  truncated: boolean;
  byAction: { action: string; count: number }[];
}

export function getAdminActivityLogs(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: { query?: string; period?: PeriodFilter; limit?: number; verifikasiOnly?: boolean } = {}
): ToolResult<ActivityLogData> {
  const denied = guard<ActivityLogData>(scope, ds, 'audit', 'getAdminActivityLogs');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const period = params.period || { preset: 'all' as const, label: 'Seluruh data tersedia', start: null, end: null };
  const limit = clampLimit(params.limit);
  let logs = ds.getAuditLogs().filter((log) => inPeriod(log.createdAt, period));

  if (scope.access === 'unit') {
    const allowedUsers = new Set(scopedUsers(scope, ds).map((u) => u.id));
    logs = logs.filter((log) => allowedUsers.has(log.userId) || log.userRole === 'kepala_bendahara');
  }
  if (params.verifikasiOnly) {
    logs = logs.filter(
      (log) => /VERIFIKASI/i.test(log.tindakan) || /verifikasi/i.test(log.rincian)
    );
  }
  if (query) {
    logs = logs.filter(
      (log) =>
        log.userName.toLowerCase().includes(query) ||
        log.tindakan.toLowerCase().includes(query) ||
        log.rincian.toLowerCase().includes(query)
    );
  }

  logs = logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const actionMap = new Map<string, number>();
  for (const log of logs) actionMap.set(log.tindakan, (actionMap.get(log.tindakan) || 0) + 1);

  const rows = logs.slice(0, limit).map((log) => ({
    waktu: log.createdAt,
    pengguna: log.userName,
    role: ROLE_LABEL[log.userRole] || log.userRole,
    tindakan: log.tindakan,
    rincian: log.rincian.slice(0, 160),
  }));

  record(scope, ds, 'CHATBOT_ADMIN_READ_AUDIT', `Log aktivitas "${query || '-'}" (${scope.label})`);
  return ok({
    total: logs.length,
    rows,
    truncated: logs.length > rows.length,
    byAction: Array.from(actionMap.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
  });
}

// ---------------------------------------------------------------------------
// H. INTEGRASI TELEGRAM
// ---------------------------------------------------------------------------

export interface TelegramStatisticsData {
  runtime: TelegramRuntimeStats | null;
  localNotifications: number;
  unreadNotifications: number;
  latestNotifications: { waktu: string; judul: string; tipe: string; target: string }[];
  linkageNote: string;
}

export function getTelegramNotificationStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  runtime?: TelegramRuntimeStats | null
): ToolResult<TelegramStatisticsData> {
  const denied = guard<TelegramStatisticsData>(scope, ds, 'telegram', 'getTelegramNotificationStatistics');
  if (denied) return denied;

  const notifications = ds.getNotifications();
  const rows = notifications
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((n) => ({
      waktu: n.createdAt,
      judul: n.judul,
      tipe: n.tipe,
      target: n.targetRole || 'pengguna',
    }));

  record(scope, ds, 'CHATBOT_ADMIN_READ_TELEGRAM', `Statistik Telegram (${scope.label})`);
  return ok({
    runtime: runtime || ds.getTelegramStats?.() || null,
    localNotifications: notifications.length,
    unreadNotifications: notifications.filter((n) => !n.dibaca).length,
    latestNotifications: rows,
    linkageNote:
      'Riwayat pengiriman per wali tersimpan di log notifikasi. Tautan Telegram hanya sah setelah wali menekan /start dan bot memverifikasi kode; nomor WhatsApp tidak pernah dipakai sebagai ID Telegram.',
  });
}

// ---------------------------------------------------------------------------
// I. KUITANSI DIGITAL
// ---------------------------------------------------------------------------

function scopedReceipts(scope: AdminScope, ds: AdminChatbotSource): Receipt[] {
  if (scope.access === 'all') return ds.getReceipts();
  const ids = scopedStudentIds(scope, ds);
  return ds.getReceipts().filter((r) => ids.has(r.studentId));
}

function receiptDocStatus(receipt: Receipt): string {
  switch (receipt.status || 'aktif') {
    case 'dibatalkan':
      return 'dibatalkan';
    case 'diganti':
      return 'diganti';
    default:
      return 'aktif';
  }
}

export interface ReceiptStatisticsData {
  total: number;
  active: number;
  cancelled: number;
  replaced: number;
  activeNominal: number;
  partial: number;
  lunas: number;
  byMonth: { month: string; count: number; nominal: number }[];
}

export function getReceiptStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<ReceiptStatisticsData> {
  const denied = guard<ReceiptStatisticsData>(scope, ds, 'payments', 'getReceiptStatistics');
  if (denied) return denied;

  const receipts = scopedReceipts(scope, ds).filter((r) =>
    inPeriod(r.tanggalTerbit || r.createdAt, period)
  );
  const active = receipts.filter((r) => receiptDocStatus(r) === 'aktif');
  const monthMap = new Map<string, { count: number; nominal: number }>();
  for (const receipt of active) {
    const key = (receipt.tanggalTerbit || receipt.createdAt || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const current = monthMap.get(key) || { count: 0, nominal: 0 };
    current.count += 1;
    current.nominal += receipt.nominal;
    monthMap.set(key, current);
  }

  record(scope, ds, 'CHATBOT_ADMIN_READ_RECEIPTS', `Statistik kuitansi ${period.label} (${scope.label})`);
  return ok({
    total: receipts.length,
    active: active.length,
    cancelled: receipts.filter((r) => receiptDocStatus(r) === 'dibatalkan').length,
    replaced: receipts.filter((r) => receiptDocStatus(r) === 'diganti').length,
    activeNominal: sum(active, (r) => r.nominal),
    partial: active.filter((r) => r.statusPembayaran === 'sebagian').length,
    lunas: active.filter((r) => r.statusPembayaran !== 'sebagian').length,
    byMonth: Array.from(monthMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month)),
  });
}

export interface ReceiptRow {
  nomorKuitansi: string;
  nama: string;
  nis: string;
  kategori: string;
  periode: string;
  nominal: number;
  statusDokumen: string;
  statusPembayaran: string;
  terbit: string;
  paymentId: string;
  verifikator: string;
}

export interface ReceiptListData {
  total: number;
  rows: ReceiptRow[];
  truncated: boolean;
  receiptNumber?: string;
  query?: string;
}

export function searchReceipts(
  scope: AdminScope,
  ds: AdminChatbotSource,
  params: { query?: string; receiptNumber?: string; period?: PeriodFilter; limit?: number } = {}
): ToolResult<ReceiptListData> {
  const denied = guard<ReceiptListData>(scope, ds, 'payments', 'searchReceipts');
  if (denied) return denied;

  const query = sanitizeSearchTerm(params.query || '').toLowerCase();
  const number = (params.receiptNumber || '').replace(/\s+/g, '').toUpperCase();
  const period = params.period || { preset: 'all' as const, label: 'Seluruh data tersedia', start: null, end: null };
  const limit = clampLimit(params.limit);
  let receipts = scopedReceipts(scope, ds).filter((r) =>
    inPeriod(r.tanggalTerbit || r.createdAt, period)
  );

  if (number) {
    receipts = receipts.filter((r) =>
      r.nomorKuitansi.replace(/\s+/g, '').toUpperCase().includes(number)
    );
  } else if (query) {
    receipts = receipts.filter(
      (r) =>
        r.nomorKuitansi.toLowerCase().includes(query) ||
        r.studentNama.toLowerCase().includes(query) ||
        r.studentNis.toLowerCase().includes(query) ||
        r.kategoriNama.toLowerCase().includes(query) ||
        r.periode.toLowerCase().includes(query) ||
        r.paymentId.toLowerCase().includes(query) ||
        r.invoiceId.toLowerCase().includes(query)
    );
  }

  receipts = receipts.sort((a, b) =>
    (b.tanggalTerbit || b.createdAt || '').localeCompare(a.tanggalTerbit || a.createdAt || '')
  );
  const rows = receipts.slice(0, limit).map((r) => ({
    nomorKuitansi: r.nomorKuitansi,
    nama: r.studentNama,
    nis: r.studentNis,
    kategori: r.kategoriNama,
    periode: r.periode,
    nominal: r.nominal,
    statusDokumen: receiptDocStatus(r),
    statusPembayaran:
      receiptDocStatus(r) !== 'aktif'
        ? receiptDocStatus(r)
        : r.statusPembayaran === 'sebagian'
          ? 'sebagian'
          : 'lunas',
    terbit: r.tanggalTerbit || r.createdAt || '-',
    paymentId: r.paymentId,
    verifikator: r.verifikator || r.petugasNama,
  }));

  record(
    scope,
    ds,
    'CHATBOT_ADMIN_READ_RECEIPTS',
    `Pencarian kuitansi "${number || query || '-'}" (${scope.label})`
  );
  return ok({
    total: receipts.length,
    rows,
    truncated: receipts.length > rows.length,
    receiptNumber: number || undefined,
    query: query || undefined,
  });
}

// ---------------------------------------------------------------------------
// J. PEMBAYARAN TERVERIFIKASI HARI INI, SANTRI SUDAH BAYAR, KUITANSI HILANG
// ---------------------------------------------------------------------------

export interface VerifiedTodayData {
  date: string;
  count: number;
  total: number;
  rows: {
    nomorPembayaran: string;
    nama: string;
    nis: string;
    nominal: number;
    kategori: string;
    diverifikasiOleh: string;
    waktu: string;
  }[];
  truncated: boolean;
}

export function getVerifiedPaymentsToday(
  scope: AdminScope,
  ds: AdminChatbotSource,
  now: Date = new Date()
): ToolResult<VerifiedTodayData> {
  const denied = guard<VerifiedTodayData>(scope, ds, 'payments', 'getVerifiedPaymentsToday');
  if (denied) return denied;

  const day = now.toISOString().slice(0, 10);
  const invoiceMap = new Map(scopedInvoices(scope, ds).map((i) => [i.id, i]));
  const verified = scopedPayments(scope, ds)
    .filter((p) => p.status === 'terverifikasi')
    .filter((p) => (p.waktuVerifikasi || p.waktuPembayaran || '').slice(0, 10) === day)
    .sort((a, b) =>
      (b.waktuVerifikasi || b.waktuPembayaran || '').localeCompare(
        a.waktuVerifikasi || a.waktuPembayaran || ''
      )
    );

  record(scope, ds, 'CHATBOT_ADMIN_READ_PAYMENTS', `Pembayaran terverifikasi ${day} (${scope.label})`);
  return ok({
    date: day,
    count: verified.length,
    total: sum(verified, (p) => p.nominal),
    rows: verified.slice(0, 25).map((p) => ({
      nomorPembayaran: p.nomorPembayaran,
      nama: p.studentNama,
      nis: invoiceMap.get(p.invoiceId)?.studentNis || '-',
      nominal: p.nominal,
      kategori: invoiceMap.get(p.invoiceId)?.categoryNama || '-',
      diverifikasiOleh: p.diverifikasiOlehNama || '-',
      waktu: p.waktuVerifikasi || p.waktuPembayaran,
    })),
    truncated: verified.length > 25,
  });
}

export interface PaidStudentsData {
  totalStudents: number;
  fullyPaidStudents: number;
  transactionCount: number;
  totalNominal: number;
  rows: {
    nama: string;
    nis: string;
    transaksi: number;
    total: number;
    terakhir: string;
    lunas: boolean;
  }[];
  truncated: boolean;
}

export function getPaidStudents(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<PaidStudentsData> {
  const denied = guard<PaidStudentsData>(scope, ds, 'payments', 'getPaidStudents');
  if (denied) return denied;

  const students = new Map(scopedStudents(scope, ds).map((s) => [s.id, s]));
  const invoices = scopedInvoices(scope, ds);
  const verified = scopedPayments(scope, ds)
    .filter((p) => p.status === 'terverifikasi')
    .filter((p) => inPeriod(p.waktuPembayaran, period));

  const map = new Map<
    string,
    { nama: string; nis: string; transaksi: number; total: number; terakhir: string }
  >();
  for (const payment of verified) {
    const student = students.get(payment.studentId);
    const current = map.get(payment.studentId) || {
      nama: student?.nama || payment.studentNama,
      nis: student?.nis || '-',
      transaksi: 0,
      total: 0,
      terakhir: payment.waktuPembayaran,
    };
    current.transaksi += 1;
    current.total += payment.nominal;
    if (payment.waktuPembayaran > current.terakhir) current.terakhir = payment.waktuPembayaran;
    map.set(payment.studentId, current);
  }

  const rows = Array.from(map.entries())
    .map(([studentId, value]) => {
      const studentInvoices = invoices.filter(
        (i) => i.studentId === studentId && i.status !== 'dibatalkan'
      );
      const lunas =
        studentInvoices.length > 0 && studentInvoices.every((i) => i.sisaTagihan <= 0);
      return { ...value, lunas };
    })
    .sort((a, b) => b.total - a.total);

  record(scope, ds, 'CHATBOT_ADMIN_READ_PAYMENTS', `Santri sudah bayar ${period.label} (${scope.label})`);
  return ok({
    totalStudents: rows.length,
    fullyPaidStudents: rows.filter((r) => r.lunas).length,
    transactionCount: verified.length,
    totalNominal: sum(verified, (p) => p.nominal),
    rows: rows.slice(0, 25),
    truncated: rows.length > 25,
  });
}

export interface MissingReceiptRow {
  nomorPembayaran: string;
  nama: string;
  nis: string;
  kategori: string;
  periode: string;
  nominal: number;
  terverifikasiPada: string;
  paymentId: string;
  alasan: string;
}

export interface MissingReceiptData {
  total: number;
  totalNominal: number;
  rows: MissingReceiptRow[];
  truncated: boolean;
}

export function getVerifiedPaymentsWithoutReceipt(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<MissingReceiptData> {
  const denied = guard<MissingReceiptData>(scope, ds, 'payments', 'getVerifiedPaymentsWithoutReceipt');
  if (denied) return denied;

  const receipts = scopedReceipts(scope, ds);
  const activeByPayment = new Set(
    receipts.filter((r) => receiptDocStatus(r) === 'aktif').map((r) => r.paymentId)
  );
  const invoiceMap = new Map(scopedInvoices(scope, ds).map((i) => [i.id, i]));
  const verified = scopedPayments(scope, ds)
    .filter((p) => p.status === 'terverifikasi')
    .filter((p) => inPeriod(p.waktuVerifikasi || p.waktuPembayaran, period))
    .filter((p) => !activeByPayment.has(p.id));

  const rows = verified
    .sort((a, b) =>
      (b.waktuVerifikasi || b.waktuPembayaran).localeCompare(
        a.waktuVerifikasi || a.waktuPembayaran
      )
    )
    .slice(0, 25)
    .map((p) => {
      const invoice = invoiceMap.get(p.invoiceId);
      const previous = receipts.find((r) => r.paymentId === p.id);
      const alasan = previous
        ? previous.status === 'diganti'
          ? `Kuitansi ${previous.nomorKuitansi} sudah diganti dan belum ada pengganti aktif.`
          : previous.status === 'dibatalkan'
            ? `Kuitansi ${previous.nomorKuitansi} dibatalkan; pembayaran tetap terverifikasi dan perlu kuitansi baru.`
            : `Kuitansi ${previous.nomorKuitansi} tidak berstatus aktif.`
        : 'Belum ada kuitansi aktif pada data lokal. Kemungkinan penerbitan lama belum tersimpan; jalankan koreksi/terbitkan ulang dari pusat pembayaran.';
      return {
        nomorPembayaran: p.nomorPembayaran,
        nama: p.studentNama,
        nis: invoice?.studentNis || '-',
        kategori: invoice?.categoryNama || '-',
        periode: invoice?.periodeBulan || '-',
        nominal: p.nominal,
        terverifikasiPada: p.waktuVerifikasi || p.waktuPembayaran,
        paymentId: p.id,
        alasan,
      };
    });

  record(
    scope,
    ds,
    'CHATBOT_ADMIN_READ_RECEIPTS',
    `Pembayaran terverifikasi tanpa kuitansi ${period.label} (${scope.label})`
  );
  return ok({
    total: verified.length,
    totalNominal: sum(verified, (p) => p.nominal),
    rows,
    truncated: verified.length > rows.length,
  });
}

// ---------------------------------------------------------------------------
// K. RIWAYAT PENGIRIMAN TELEGRAM PER WALI
// ---------------------------------------------------------------------------

export interface TelegramDeliveryStatisticsData {
  total: number;
  sent: number;
  failed: number;
  noDestination: number;
  skipped: number;
  duplicate: number;
  pending: number;
  guardiansWithoutTelegram: number;
  guardiansWithoutTelegramRows: { nama: string; whatsapp: string; santri: number }[];
  failures: {
    waktu: string;
    nama: string;
    santri: string;
    status: string;
    notice: string;
    alasan: string;
    nomorKuitansi: string;
  }[];
  byReason: { reason: string; count: number }[];
}

export function getTelegramDeliveryStatistics(
  scope: AdminScope,
  ds: AdminChatbotSource,
  period: PeriodFilter = { preset: 'all', label: 'Seluruh data tersedia', start: null, end: null }
): ToolResult<TelegramDeliveryStatisticsData> {
  const denied = guard<TelegramDeliveryStatisticsData>(
    scope,
    ds,
    'telegram',
    'getTelegramDeliveryStatistics'
  );
  if (denied) return denied;

  const allowedStudents = scope.access === 'all' ? null : scopedStudentIds(scope, ds);
  const deliveries = (ds.getTelegramDeliveries?.() || [])
    .filter((d) => (allowedStudents ? allowedStudents.has(d.studentId) : true))
    .filter((d) => inPeriod(d.createdAt, period));

  const failures = deliveries
    .filter((d) => d.status !== 'sent' && d.status !== 'duplicate')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const reasonMap = new Map<string, number>();
  for (const item of failures) {
    const reason = (item.lastError || item.status).trim().slice(0, 120);
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
  }

  // Wali dengan relasi terverifikasi tetapi belum menautkan Telegram.
  const relations = scopedRelations(scope, ds).filter((r) => r.isVerified);
  const users = new Map(scopedUsers(scope, ds).map((u) => [u.id, u]));
  const guardianMap = new Map<
    string,
    { nama: string; whatsapp: string; santri: Set<string>; linked: boolean }
  >();
  for (const relation of relations) {
    const user = users.get(relation.guardianId);
    const current = guardianMap.get(relation.guardianId) || {
      nama: user?.name || relation.guardianName,
      whatsapp: user?.whatsapp || user?.phone || relation.guardianPhone || '-',
      santri: new Set<string>(),
      linked: Boolean(user?.telegramUserId && user.telegramVerified),
    };
    current.santri.add(relation.studentId);
    guardianMap.set(relation.guardianId, current);
  }
  const unlinked = Array.from(guardianMap.values()).filter((g) => !g.linked);

  record(scope, ds, 'CHATBOT_ADMIN_READ_TELEGRAM', `Riwayat pengiriman Telegram ${period.label} (${scope.label})`);
  return ok({
    total: deliveries.length,
    sent: deliveries.filter((d) => d.status === 'sent').length,
    failed: deliveries.filter((d) => d.status === 'failed').length,
    noDestination: deliveries.filter((d) => d.status === 'no_destination').length,
    skipped: deliveries.filter((d) => d.status === 'skipped').length,
    duplicate: deliveries.filter((d) => d.status === 'duplicate').length,
    pending: deliveries.filter((d) => d.status === 'pending').length,
    guardiansWithoutTelegram: unlinked.length,
    guardiansWithoutTelegramRows: unlinked.slice(0, 15).map((g) => ({
      nama: g.nama,
      whatsapp: g.whatsapp,
      santri: g.santri.size,
    })),
    failures: failures.slice(0, 15).map((d) => ({
      waktu: d.createdAt,
      nama: d.guardianName || 'Wali belum tertaut',
      santri: d.studentNama,
      status: d.status,
      notice: d.noticeStatus,
      alasan: d.lastError || d.messagePreview || '-',
      nomorKuitansi: d.nomorKuitansi || '-',
    })),
    byReason: Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  });
}

// ---------------------------------------------------------------------------
// Ekspor helper untuk pengujian
// ---------------------------------------------------------------------------

export function __testingScopeStudents(scope: AdminScope, ds: AdminChatbotSource): Student[] {
  return scopedStudents(scope, ds);
}

export function __testingInPeriod(dateValue: string, period: PeriodFilter): boolean {
  return inPeriod(dateValue, period);
}

export function __testingInvoiceInPeriod(invoice: Invoice, period: PeriodFilter): boolean {
  return invoiceInPeriod(invoice, period);
}

export function __testingGroupSum<T>(items: T[], key: (item: T) => string) {
  return groupSum(items, key);
}

export function __testingAuditType(log: AuditLog): string {
  return log.tindakan;
}
