import type { AdminAuditEntry, AdminCapability, AdminScope } from './types';
import type { UserProfile, UserRole } from '../types';

/**
 * RBAC ASISTEN ADMIN — SATU-SATUNYA sumber kewenangan.
 *
 * Aturan penting:
 * - Role SELALU berasal dari objek `UserProfile` yang sudah diverifikasi
 *   sesi (di demo: store.getCurrentUser()). Tidak pernah dari teks pertanyaan.
 * - Wali santri & santri TIDAK mendapat akses asisten admin. Mereka tetap
 *   memakai chatbot customer yang sudah ada.
 * - Pengurus/kepala pondok dibatasi unit (putra/putri).
 */

const FULL_CAPABILITIES: readonly AdminCapability[] = [
  'students',
  'guardians',
  'invoices',
  'payments',
  'arrears',
  'finance',
  'users',
  'audit',
  'telegram',
];

const FINANCE_CAPABILITIES: readonly AdminCapability[] = [
  'students',
  'guardians',
  'invoices',
  'payments',
  'arrears',
  'finance',
  'audit',
  'telegram',
];

const STAFF_FINANCE_CAPABILITIES: readonly AdminCapability[] = [
  'students',
  'guardians',
  'invoices',
  'payments',
  'arrears',
  'finance',
];

const UNIT_CAPABILITIES: readonly AdminCapability[] = [
  'students',
  'guardians',
  'invoices',
  'payments',
  'arrears',
  'finance',
];

const NONE_CAPABILITIES: readonly AdminCapability[] = [];

export function buildAdminScope(user: UserProfile | null): AdminScope {
  if (!user || !user.isActive) {
    return {
      userId: user?.id || 'guest',
      userName: user?.name || 'Tamu',
      role: user?.role || 'guest',
      access: 'none',
      unit: null,
      capabilities: NONE_CAPABILITIES,
      label: 'Tidak ada sesi terverifikasi',
      reason:
        'Sesi pengguna tidak valid atau tidak aktif. Silakan login ulang melalui halaman login.',
    };
  }

  const role = user.role;

  if (role === 'wali_santri' || role === 'santri') {
    return {
      userId: user.id,
      userName: user.name,
      role,
      access: 'none',
      unit: null,
      capabilities: NONE_CAPABILITIES,
      label: role === 'wali_santri' ? 'Akun wali santri' : 'Akun santri',
      reason:
        role === 'wali_santri'
          ? 'Asisten admin tidak tersedia untuk akun wali. Gunakan chatbot bantuan wali untuk melihat tagihan anak Anda sendiri.'
          : 'Asisten admin tidak tersedia untuk akun santri. Gunakan chatbot bantuan santri untuk melihat data Anda sendiri.',
    };
  }

  const fullAccessRoles: UserRole[] = ['pengasuh', 'kepala_bendahara'];
  const financeRoles: UserRole[] = ['admin_bendahara'];
  const staffRoles: UserRole[] = ['anggota_bendahara'];
  const unitRoles: UserRole[] = [
    'kepala_pondok_putra',
    'kepala_pondok_putri',
    'pengurus_putra',
    'pengurus_putri',
  ];

  if (fullAccessRoles.includes(role)) {
    return {
      userId: user.id,
      userName: user.name,
      role,
      access: 'all',
      unit: null,
      capabilities: FULL_CAPABILITIES,
      label: 'Seluruh pondok',
    };
  }

  if (financeRoles.includes(role)) {
    return {
      userId: user.id,
      userName: user.name,
      role,
      access: 'all',
      unit: null,
      capabilities: FINANCE_CAPABILITIES,
      label: 'Seluruh pondok (keuangan)',
    };
  }

  if (staffRoles.includes(role)) {
    return {
      userId: user.id,
      userName: user.name,
      role,
      access: 'all',
      unit: null,
      capabilities: STAFF_FINANCE_CAPABILITIES,
      label: 'Seluruh pondok (staf keuangan)',
    };
  }

  if (unitRoles.includes(role)) {
    const unit =
      user.unitAccess === 'putra' || user.unitAccess === 'putri'
        ? user.unitAccess
        : role === 'kepala_pondok_putra' || role === 'pengurus_putra'
          ? 'putra'
          : 'putri';
    return {
      userId: user.id,
      userName: user.name,
      role,
      access: 'unit',
      unit,
      capabilities: UNIT_CAPABILITIES,
      label: `Unit ${unit === 'putra' ? 'Putra' : 'Putri'}`,
    };
  }

  return {
    userId: user.id,
    userName: user.name,
    role,
    access: 'none',
    unit: null,
    capabilities: NONE_CAPABILITIES,
    label: 'Role tidak dikenali',
    reason: 'Role akun ini tidak memiliki kewenangan untuk asisten admin.',
  };
}

export function hasCapability(scope: AdminScope, capability: AdminCapability): boolean {
  return scope.access !== 'none' && scope.capabilities.includes(capability);
}

export function capabilityDeniedMessage(capability: AdminCapability): string {
  const label: Record<AdminCapability, string> = {
    students: 'data santri',
    guardians: 'data wali santri',
    invoices: 'data tagihan',
    payments: 'data pembayaran',
    arrears: 'data tunggakan',
    finance: 'laporan keuangan',
    users: 'data pengguna',
    audit: 'log aktivitas',
    telegram: 'statistik Telegram',
  };
  return `Role Anda tidak memiliki kewenangan untuk mengakses ${label[capability]}.`;
}

/** Deteksi upaya prompt injection / eskalasi peran lewat teks. */
const INJECTION_PATTERNS: RegExp[] = [
  /anggap(?:lah)?\s+(?:saya|aku)\s+(?:sebagai\s+)?(?:super\s*)?admin/i,
  /anggap\s+saja\s+(?:saya|aku)\s+(?:super\s*)?admin/i,
  /jadikan\s+(?:saya|aku)\s+(?:sebagai\s+)?(?:super\s*)?admin/i,
  /saya\s+(?:punya|memiliki)\s+izin\s+(?:untuk\s+)?(?:membaca|mengakses|melihat)/i,
  /saya\s+berhak\s+(?:mengakses|melihat|membaca)/i,
  /abaikan\s+(?:semua\s+|seluruh\s+)?(?:sistem|aturan|keamanan|instruksi|prompt|pembatasan)/i,
  /ignore\s+(?:all\s+|any\s+)?(?:previous|above|system)\s+(?:instructions?|prompts?)/i,
  /(?:bypass|disable|matikan)\s+(?:rbac|security|keamanan|permission)/i,
  /jailbreak|prompt\s+injection/i,
  /system\s+prompt|prompt\s+sistem|instruksi\s+sistem/i,
  /buka\s+(?:semua|seluruh)\s+data/i,
  /(?:tampilkan|berikan|kirim|bocorkan)\s+(?:semua|seluruh|isi)\s+(?:database|db)\b/i,
  /(?:semua|seluruh|isi)\s+(?:database|db)\b/i,
  /kamu\s+sekarang\s+(?:adalah|menjadi)|anda\s+sekarang\s+(?:adalah|menjadi)/i,
  /(?:ubah|ganti)\s+(?:role|peran)\s+(?:saya|aku)/i,
];

export function detectPromptInjection(text: string): boolean {
  const question = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(question));
}

/** Deteksi permintaan data lintas-keluarga / seluruh basis data. */
export function requestsWholeDatabase(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /(?:semua|seluruh)\s+(?:data\s+)?(?:santri|siswa|wali|pembayaran|tagihan|database|db)/.test(q) ||
    /(?:database|db)\s+(?:lengkap|penuh|mentah|raw)/.test(q) ||
    /data\s+(?:seluruh|semua)\s+(?:pondok|aplikasi)/.test(q)
  );
}

/** Membersihkan teks pencarian dari karakter kontrol; tidak pernah dipakai sebagai SQL. */
export function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function auditEntry(action: string, detail: string, now: Date): AdminAuditEntry {
  return {
    action: action.slice(0, 80),
    detail: detail.slice(0, 300),
    at: now.toISOString(),
  };
}
