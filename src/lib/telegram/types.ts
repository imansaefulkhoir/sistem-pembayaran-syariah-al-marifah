/**
 * Tipe bersama untuk integrasi notifikasi Telegram.
 *
 * File ini aman diimpor dari client maupun server (tidak berisi rahasia).
 * Token bot HANYA dibaca di `server.ts` melalui environment variable.
 */

export const TELEGRAM_EVENTS = [
  'user_registered',
  'admin_login',
  'payment_submitted',
  'payment_verified',
  'payment_rejected',
  'cash_payment',
  'invoice_created',
  'support_ticket',
  'visitor_message',
  'system_error',
] as const;

export type TelegramEvent = (typeof TELEGRAM_EVENTS)[number];

export interface TelegramEventPayload {
  /** Nama orang/entitas terkait (sudah dibersihkan sebelum dikirim). */
  name?: string;
  /** Email pengguna. Jangan pernah isi dengan password/token. */
  email?: string;
  /** Label peran pengguna, mis. "Kepala Bendahara". */
  role?: string;
  /** Nominal transaksi dalam rupiah. */
  amount?: number;
  /** Nomor referensi: nomor tagihan, pembayaran, kuitansi, atau tiket. */
  reference?: string;
  /** Keterangan tambahan yang aman ditampilkan (tanpa data sensitif). */
  details?: string;
  /** Path internal website, mis. "/tagihan/inv-1" (bukan URL eksternal). */
  url?: string;
}

export interface TelegramEventMeta {
  label: string;
  emoji: string;
  status: 'Berhasil' | 'Gagal' | 'Perlu Tindakan';
}

export const TELEGRAM_EVENT_META: Record<TelegramEvent, TelegramEventMeta> = {
  user_registered: { label: 'Pengguna Baru Mendaftar', emoji: '👤', status: 'Berhasil' },
  admin_login: { label: 'Login Admin', emoji: '🔐', status: 'Berhasil' },
  payment_submitted: { label: 'Pembayaran Baru Dikirim', emoji: '💳', status: 'Perlu Tindakan' },
  payment_verified: { label: 'Pembayaran Diverifikasi', emoji: '✅', status: 'Berhasil' },
  payment_rejected: { label: 'Pembayaran Ditolak', emoji: '⚠️', status: 'Perlu Tindakan' },
  cash_payment: { label: 'Pembayaran Tunai Dicatat', emoji: '💵', status: 'Berhasil' },
  invoice_created: { label: 'Tagihan Baru Diterbitkan', emoji: '🧾', status: 'Berhasil' },
  support_ticket: { label: 'Pesan / Formulir Baru Dikirim', emoji: '💬', status: 'Perlu Tindakan' },
  visitor_message: { label: 'Pesan Pengunjung', emoji: '✉️', status: 'Perlu Tindakan' },
  system_error: { label: 'Error Penting pada Website', emoji: '🚨', status: 'Gagal' },
};

export function isTelegramEvent(value: unknown): value is TelegramEvent {
  return typeof value === 'string' && (TELEGRAM_EVENTS as readonly string[]).includes(value);
}
