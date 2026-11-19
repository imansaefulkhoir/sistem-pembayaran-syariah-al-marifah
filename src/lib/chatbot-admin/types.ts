import type {
  AuditLog,
  GuardianStudentRelation,
  Invoice,
  NotificationItem,
  Payment,
  PaymentCategory,
  Receipt,
  Student,
  SupportTicket,
  TelegramDeliveryLog,
  UnitPondok,
  UserProfile,
  UserRole,
} from '../types';

/**
 * TIPE INTI ASISTEN ADMIN.
 *
 * Modul ini murni tipe + konstanta, aman diimpor dari client maupun server.
 * Tidak ada kredensial, token, atau data rahasia di sini.
 */

export type AdminCapability =
  | 'students'
  | 'guardians'
  | 'invoices'
  | 'payments'
  | 'arrears'
  | 'finance'
  | 'users'
  | 'audit'
  | 'telegram';

export type AdminAccess = 'all' | 'unit' | 'none';

export interface AdminScope {
  userId: string;
  userName: string;
  role: UserRole | 'guest';
  access: AdminAccess;
  /** Unit yang boleh dilihat. `null` berarti seluruh unit. */
  unit: UnitPondok | null;
  capabilities: readonly AdminCapability[];
  /** Label aman untuk ditampilkan, mis. "Seluruh pondok" / "Unit Putra". */
  label: string;
  /** Alasan penolakan (hanya untuk role tanpa akses). */
  reason?: string;
}

export interface TelegramRuntimeStats {
  configured: boolean;
  enabled: boolean;
  chatConfigured: boolean;
  tokenFormatValid: boolean;
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  rateLimited: number;
  lastSentAt: string | null;
  lastError: string | null;
  startedAt: string;
}

export interface AdminAuditEntry {
  action: string;
  detail: string;
  at: string;
}

/**
 * Sumber data terkontrol. UI/store hanya boleh menyediakan data melalui
 * adapter ini; engine tidak pernah mengakses localStorage / Supabase langsung.
 */
export interface AdminChatbotSource {
  getStudents(): Student[];
  getInvoices(): Invoice[];
  getPayments(): Payment[];
  getReceipts(): Receipt[];
  getCategories(): PaymentCategory[];
  getNotifications(): NotificationItem[];
  getGuardianRelations(): GuardianStudentRelation[];
  getUsers(): UserProfile[];
  getAuditLogs(): AuditLog[];
  getTickets(): SupportTicket[];
  getTelegramStats?(): TelegramRuntimeStats | null;
  /** Riwayat pengiriman notifikasi per wali (opsional, dari adapter toko). */
  getTelegramDeliveries?(): TelegramDeliveryLog[];
  logAccess?(entry: AdminAuditEntry): void;
  now?(): Date;
}

export interface ToolResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

export type PeriodPreset =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'specific_month'
  | 'custom';

export interface PeriodFilter {
  preset: PeriodPreset;
  label: string;
  /** Tanggal awal inklusif (YYYY-MM-DD), null = tanpa batas. */
  start: string | null;
  /** Tanggal akhir eksklusif (YYYY-MM-DD), null = tanpa batas. */
  end: string | null;
}

export interface AdminTable {
  columns: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface AdminQueryMeta {
  generatedAt: string;
  scopeLabel: string;
  role: string;
  periodLabel?: string;
  basis?: string;
  rowCount?: number;
  truncated?: boolean;
  denied?: boolean;
  needsAiIntent?: boolean;
  securityEvent?: 'prompt_injection';
}

export interface AdminQueryResult {
  ok: boolean;
  intent: string;
  title: string;
  answer: string;
  table?: AdminTable;
  bullets?: string[];
  meta: AdminQueryMeta;
  suggestions?: string[];
}

export interface AdminEngineOptions {
  now?: Date;
  telegramStats?: TelegramRuntimeStats | null;
  forcedIntent?: string;
  onAudit?: (entry: AdminAuditEntry) => void;
}

/** Pertanyaan cepat yang tampil di UI. */
export const ADMIN_QUICK_QUESTIONS: { id: string; label: string; query: string }[] = [
  { id: 'jumlah-santri', label: 'Jumlah seluruh santri', query: 'Berapa jumlah seluruh santri?' },
  { id: 'pemasukan-bulan', label: 'Total pemasukan bulan ini', query: 'Berapa total pemasukan bulan ini?' },
  { id: 'tunggakan', label: 'Daftar tunggakan', query: 'Tampilkan daftar tunggakan santri' },
  { id: 'pending', label: 'Menunggu verifikasi', query: 'Berapa pembayaran yang menunggu verifikasi?' },
  { id: 'ringkasan', label: 'Ringkasan keuangan', query: 'Tampilkan ringkasan keuangan' },
  { id: 'kuitansi', label: 'Jumlah kuitansi', query: 'Berapa jumlah kuitansi yang diterbitkan bulan ini?' },
  { id: 'verifikasi-hari-ini', label: 'Terverifikasi hari ini', query: 'Pembayaran apa yang terverifikasi hari ini?' },
  { id: 'telegram-gagal', label: 'Notifikasi Telegram gagal', query: 'Notifikasi Telegram wali mana yang gagal terkirim?' },
  { id: 'wali', label: 'Statistik wali santri', query: 'Berapa jumlah wali santri yang terdaftar?' },
];

export const ADMIN_CHAT_STORAGE_KEY = 'almarifah_admin_chat_history_v1';
export const ADMIN_CHAT_MAX_HISTORY = 40;
export const ADMIN_CHAT_MAX_MESSAGE = 500;
export const ADMIN_CHAT_MIN_INTERVAL_MS = 900;
export const ADMIN_CHAT_MAX_PER_MINUTE = 15;

export const CAPABILITY_LABELS: Record<AdminCapability, string> = {
  students: 'Data santri',
  guardians: 'Data wali santri',
  invoices: 'Data tagihan',
  payments: 'Data pembayaran',
  arrears: 'Data tunggakan',
  finance: 'Laporan keuangan',
  users: 'Data pengguna',
  audit: 'Log aktivitas',
  telegram: 'Integrasi Telegram',
};
