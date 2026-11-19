/**
 * Pemformatan pesan Telegram (parse_mode: HTML).
 *
 * Semua nilai dinamis di-escape agar tidak merusak markup HTML dan tidak bisa
 * dipakai untuk menyisipkan tautan/tag berbahaya ke grup admin.
 */

import {
  TELEGRAM_EVENT_META,
  type TelegramEvent,
  type TelegramEventPayload,
} from './types';

const MAX_FIELD_LENGTH = 400;
const MAX_MESSAGE_LENGTH = 3900; // batas Telegram 4096, sisakan ruang aman

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] || char);
}

/** Bersihkan karakter kontrol, rapikan spasi, dan batasi panjang. */
export function sanitizeField(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  if (value === null || value === undefined) return '';
  const text = String(value)
    // buang karakter kontrol (kecuali tab/spasi/newline yang akan dirapikan)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Hapus pola rahasia yang tidak boleh diteruskan ke mana pun. */
export function redactSecrets(value: string): string {
  return value
    .replace(/nvapi-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/(password|kata\s*sandi|pin|otp|token|secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\b\d{12,19}\b/g, '[REDACTED_NUMBER]');
}

export function formatWaktu(date = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(date);
    return `${formatted} WIB`;
  } catch {
    return date.toISOString();
  }
}

export function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return '-';
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
  }
}

function websiteName(): string {
  return (
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "Sistem Pembayaran Syariah PP Kebon Kelapa Al-Ma'rifah"
  );
}

/**
 * Susun pesan HTML yang rapi. Hanya field yang terisi yang ditampilkan,
 * sehingga notifikasi tetap ringkas untuk event apa pun.
 */
export function formatTelegramMessage(
  event: TelegramEvent,
  payload: TelegramEventPayload = {},
  now = new Date()
): string {
  const meta = TELEGRAM_EVENT_META[event];
  const name = sanitizeField(payload.name);
  const email = sanitizeField(payload.email, 120);
  const role = sanitizeField(payload.role, 80);
  const reference = sanitizeField(payload.reference, 80);
  const details = sanitizeField(payload.details, 500);
  const url = sanitizeField(payload.url, 200);

  const lines: string[] = [
    '🔔 <b>NOTIFIKASI WEBSITE</b>',
    '',
    `📌 <b>Aktivitas:</b> ${meta.emoji} ${escapeHtml(meta.label)}`,
  ];

  if (name) lines.push(`👤 <b>Nama:</b> ${escapeHtml(name)}`);
  if (email) lines.push(`📧 <b>Email:</b> ${escapeHtml(email)}`);
  if (role) lines.push(`🛡️ <b>Peran:</b> ${escapeHtml(role)}`);
  if (typeof payload.amount === 'number' && Number.isFinite(payload.amount)) {
    lines.push(`💰 <b>Nominal:</b> ${escapeHtml(formatRupiah(payload.amount))}`);
  }
  if (reference) lines.push(`🔖 <b>Referensi:</b> ${escapeHtml(reference)}`);
  if (details) lines.push(`📝 <b>Detail:</b> ${escapeHtml(details)}`);
  if (url && url.startsWith('/')) lines.push(`🔗 <b>Tautan:</b> ${escapeHtml(url)}`);

  lines.push(
    `🕒 <b>Waktu:</b> ${escapeHtml(formatWaktu(now))}`,
    `🌐 <b>Website:</b> ${escapeHtml(websiteName())}`,
    '',
    `Status: <b>${meta.status}</b>`
  );

  const message = lines.join('\n');
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}
