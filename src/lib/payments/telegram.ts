import type { GuardianNoticeStatus, NotificationPreference } from '../types';
import { NOTICE_STATUS_LABEL } from './state';

/**
 * IDEMPOTENSI SEDERHANA UNTUK MODE DEMO.
 *
 * Kunci disimpan di localStorage (client) / file JSON (server). Saat Supabase
 * aktif, ganti dengan unique index pada kolom idempotency_key.
 */

export function makeIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).length > 0)
    .map((part) => String(part).trim().toLowerCase().replace(/\s+/g, '_'))
    .join('|');
}

export function hasProcessedKey(keys: string[], key: string): boolean {
  return keys.includes(key);
}

export function rememberKey(keys: string[], key: string, max = 2000): string[] {
  if (keys.includes(key)) return keys;
  return [key, ...keys].slice(0, max);
}

export function paymentNoticeKey(paymentId: string, status: GuardianNoticeStatus, guardianId?: string): string {
  return makeIdempotencyKey([paymentId, status, guardianId || 'tanpa-wali']);
}

export function shouldSendNotice(
  preference: NotificationPreference | undefined,
  status: GuardianNoticeStatus
): boolean {
  if (!preference) return true;
  if (!preference.telegramEnabled) return false;
  switch (status) {
    case 'menunggu_verifikasi':
      return preference.onSubmitted;
    case 'terverifikasi':
      return preference.onVerified;
    case 'sebagian':
      return preference.onPartial;
    case 'lunas':
      return preference.onLunas;
    case 'ditolak':
      return preference.onRejected;
    case 'dibatalkan':
      return preference.onCancelled;
    default:
      return true;
  }
}

export interface GuardianMessageInput {
  status: GuardianNoticeStatus;
  guardianName?: string;
  studentName: string;
  studentNis: string;
  category: string;
  period: string;
  amount: number;
  metode: string;
  paidAt: string;
  receiptNumber?: string;
  invoiceTotal: number;
  totalVerified: number;
  remaining: number;
  overpayment?: number;
  reason?: string;
  institutionName: string;
  receiptLink?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rupiah(value: number): string {
  return `Rp ${Math.max(0, Math.round(value)).toLocaleString('id-ID')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

/**
 * Bangun pesan Telegram berdasarkan STATUS DATABASE AKTUAL.
 * Tidak pernah mengklaim LUNAS untuk pembayaran yang masih menunggu/ditolak.
 */
export function buildGuardianPaymentMessage(input: GuardianMessageInput): {
  html: string;
  text: string;
  preview: string;
} {
  const statusLabel = NOTICE_STATUS_LABEL[input.status];
  const greeting = `Assalamu'alaikum warahmatullahi wabarakatuh.`;
  const lines: string[] = [
    greeting,
    '',
    `<b>${escapeHtml(input.institutionName)}</b>`,
    '',
  ];

  if (input.status === 'menunggu_verifikasi') {
    lines.push(
      `Pembayaran berikut telah <b>DITERIMA SISTEM</b> dan sedang <b>MENUNGGU VERIFIKASI</b> oleh bendahara.`,
      'Pembayaran ini <b>BELUM dinyatakan lunas</b>. Mohon menunggu pemeriksaan resmi.'
    );
  } else if (input.status === 'ditolak') {
    lines.push(
      `Mohon maaf, pembayaran berikut <b>DITOLAK</b> dan <b>tidak dihitung</b> sebagai pelunasan.`
    );
  } else if (input.status === 'dibatalkan') {
    lines.push(
      `Pembayaran berikut telah <b>DIBATALKAN</b> melalui koreksi resmi dan <b>tidak dihitung</b> sebagai pelunasan.`
    );
  } else if (input.status === 'lunas') {
    lines.push(`Alhamdulillah, pembayaran Anda telah <b>berhasil diverifikasi</b> dan kewajiban tagihan telah <b>LUNAS</b>.`);
  } else {
    lines.push(`Alhamdulillah, pembayaran Anda telah <b>berhasil diverifikasi</b> oleh sistem.`);
  }

  lines.push(
    '',
    '<b>INFORMASI PEMBAYARAN</b>',
    `Nama Santri: ${escapeHtml(input.studentName)}`,
    `NIS: ${escapeHtml(input.studentNis)}`,
    `Kategori: ${escapeHtml(input.category)}`,
    `Periode: ${escapeHtml(input.period)}`,
    `Nominal Dibayar: <b>${rupiah(input.amount)}</b>`,
    `Metode Pembayaran: ${escapeHtml(input.metode)}`,
    `Tanggal Pembayaran: ${escapeHtml(formatDate(input.paidAt))}`
  );

  if (input.receiptNumber) {
    lines.push(`Nomor Kwitansi: <b>${escapeHtml(input.receiptNumber)}</b>`);
  }

  lines.push(
    '',
    `Total Tagihan: ${rupiah(input.invoiceTotal)}`,
    `Total Terverifikasi: ${rupiah(input.totalVerified)}`,
    `Sisa Tagihan: <b>${rupiah(input.remaining)}</b>`
  );

  if (input.overpayment && input.overpayment > 0) {
    lines.push(`Kelebihan Bayar: <b>${rupiah(input.overpayment)}</b> (perlu ditinjau bendahara)`);
  }

  if (input.reason) {
    lines.push('', `<b>Alasan:</b> ${escapeHtml(input.reason)}`);
  }

  lines.push('', `<b>STATUS: ${statusLabel.toUpperCase()}</b>`);

  if (input.status === 'lunas' && input.receiptNumber) {
    lines.push('', 'Kwitansi pembayaran digital telah tersedia.');
  } else if (input.status === 'sebagian') {
    lines.push('', 'Kwitansi pembayaran digital untuk pembayaran ini telah tersedia.');
    lines.push('Mohon lengkapi sisa tagihan sesuai jadwal pondok.');
  }

  if (input.receiptLink) {
    lines.push('', `Tautan kwitansi aman (berlaku terbatas): ${escapeHtml(input.receiptLink)}`);
  }

  lines.push('', 'Terima kasih.', '', "Wassalamu'alaikum warahmatullahi wabarakatuh.");

  const html = lines.join('\n');
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const preview = `${statusLabel} • ${input.studentName} • ${rupiah(input.amount)}${input.receiptNumber ? ` • ${input.receiptNumber}` : ''}`;

  return { html, text, preview };
}

export function formatMetode(metode: string): string {
  switch (metode) {
    case 'transfer_bank':
      return 'Transfer Bank Syariah';
    case 'qris':
      return 'QRIS';
    case 'tunai':
      return 'Tunai (Kasir Bendahara)';
    default:
      return metode.replace(/_/g, ' ');
  }
}
