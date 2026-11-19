/**
 * Pengirim notifikasi Telegram (SERVER ONLY).
 *
 * Aturan keamanan:
 * - Token hanya dibaca dari `process.env.TELEGRAM_BOT_TOKEN`.
 * - Fungsi tidak pernah melempar error ke pemanggil (fire-and-forget friendly),
 *   sehingga kegagalan Telegram tidak mengganggu alur utama website.
 * - Token tidak pernah dicatat ke log atau dikembalikan ke pemanggil.
 * - Ada rate limit global dan deduplikasi untuk mencegah spam.
 */

import {
  formatTelegramMessage,
  redactSecrets,
  sanitizeField,
} from './format';
import {
  isTelegramEvent,
  type TelegramEvent,
  type TelegramEventPayload,
} from './types';

const TELEGRAM_API = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEDUPE_WINDOW_MS = 15_000;

export interface TelegramConfig {
  token: string;
  chatId: string;
  enabled: boolean;
  timeoutMs: number;
  maxPerMinute: number;
}

export interface TelegramSendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  /** Pesan error yang sudah dibersihkan; aman ditampilkan di log internal. */
  error?: string;
}

export interface TelegramStatus {
  configured: boolean;
  enabled: boolean;
  chatConfigured: boolean;
  tokenFormatValid: boolean;
}

export interface TelegramRuntimeStats extends TelegramStatus {
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  rateLimited: number;
  lastSentAt: string | null;
  lastError: string | null;
  startedAt: string;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getTelegramConfig(): TelegramConfig {
  return {
    token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_CHAT_ID || '').trim(),
    enabled: (process.env.TELEGRAM_NOTIFY_ENABLED || 'true').trim().toLowerCase() !== 'false',
    timeoutMs: readInt('TELEGRAM_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 2_000, 30_000),
    maxPerMinute: readInt('TELEGRAM_MAX_PER_MINUTE', 30, 1, 120),
  };
}

function isTokenFormatValid(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token);
}

export function getTelegramStatus(): TelegramStatus {
  const cfg = getTelegramConfig();
  return {
    configured: cfg.token.length > 0 && cfg.chatId.length > 0,
    enabled: cfg.enabled,
    chatConfigured: cfg.chatId.length > 0,
    tokenFormatValid: isTokenFormatValid(cfg.token),
  };
}

// --- Statistik runtime (in-memory, per instance) ---
const runtimeStartedAt = new Date().toISOString();
let runtimeSent = 0;
let runtimeFailed = 0;
let runtimeSkipped = 0;
let runtimeDuplicates = 0;
let runtimeRateLimited = 0;
let runtimeLastSentAt: string | null = null;
let runtimeLastError: string | null = null;

/**
 * Statistik pengiriman sejak proses server berjalan.
 * TIDAK memuat token/chat ID dan bukan data historis persisten.
 */
export function getTelegramRuntimeStats(): TelegramRuntimeStats {
  return {
    ...getTelegramStatus(),
    sent: runtimeSent,
    failed: runtimeFailed,
    skipped: runtimeSkipped,
    duplicates: runtimeDuplicates,
    rateLimited: runtimeRateLimited,
    lastSentAt: runtimeLastSentAt,
    lastError: runtimeLastError,
    startedAt: runtimeStartedAt,
  };
}

// --- Rate limit & deduplikasi (in-memory, per instance) ---
let windowStartedAt = Date.now();
let sentInWindow = 0;

function takeRateLimit(maxPerMinute: number): boolean {
  const now = Date.now();
  if (now - windowStartedAt >= 60_000) {
    windowStartedAt = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= maxPerMinute) return false;
  sentInWindow += 1;
  return true;
}

const recentMessages = new Map<string, number>();

function isDuplicate(key: string): boolean {
  const now = Date.now();
  recentMessages.forEach((timestamp, oldKey) => {
    if (now - timestamp > DEDUPE_WINDOW_MS) recentMessages.delete(oldKey);
  });
  const previous = recentMessages.get(key);
  recentMessages.set(key, now);
  return typeof previous === 'number' && now - previous < DEDUPE_WINDOW_MS;
}

function safeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return sanitizeField(redactSecrets(text), 200);
}

async function telegramFetch(
  cfg: TelegramConfig,
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${cfg.token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: unknown }
      | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: sanitizeField(redactSecrets(data?.description || `HTTP ${response.status}`), 200),
      };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: null,
      error: isAbort ? 'timeout' : safeError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kirim teks HTML ke chat Telegram. Tidak pernah melempar error.
 */
export async function sendTelegramMessage(html: string): Promise<TelegramSendResult> {
  const cfg = getTelegramConfig();

  const skip = (reason: string): TelegramSendResult => {
    runtimeSkipped += 1;
    if (reason === 'rate_limited') runtimeRateLimited += 1;
    return { ok: false, skipped: true, reason };
  };

  if (!cfg.enabled) return skip('disabled');
  if (!cfg.token || !cfg.chatId) return skip('not_configured');
  if (!isTokenFormatValid(cfg.token)) {
    console.warn('[telegram] Token bot tidak valid secara format.');
    return skip('invalid_token');
  }
  if (!takeRateLimit(cfg.maxPerMinute)) {
    console.warn('[telegram] Notifikasi dilewati: batas per menit tercapai.');
    return skip('rate_limited');
  }

  const result = await telegramFetch(cfg, 'sendMessage', {
    chat_id: cfg.chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  if (!result.ok) {
    // Jangan catat URL/token. Hanya alasan yang sudah diredaksi.
    console.warn(`[telegram] Gagal mengirim notifikasi: ${result.error || 'unknown_error'}`);
    runtimeFailed += 1;
    runtimeLastError = result.error || 'unknown_error';
    return { ok: false, error: result.error || 'unknown_error' };
  }

  runtimeSent += 1;
  runtimeLastSentAt = new Date().toISOString();
  return { ok: true };
}

/**
 * Format + kirim notifikasi untuk event website. Aman dipanggil tanpa `await`
 * dari alur bisnis karena semua error ditelan di dalam.
 */
export async function notifyTelegramEvent(
  event: TelegramEvent | string,
  payload: TelegramEventPayload = {}
): Promise<TelegramSendResult> {
  try {
    if (!isTelegramEvent(event)) {
      runtimeSkipped += 1;
      return { ok: false, skipped: true, reason: 'unknown_event' };
    }

    const cfg = getTelegramConfig();
    if (!cfg.enabled || !cfg.token || !cfg.chatId) {
      runtimeSkipped += 1;
      return { ok: false, skipped: true, reason: 'not_configured' };
    }

    const dedupeKey = [
      event,
      sanitizeField(payload.reference, 80),
      sanitizeField(payload.name, 80),
      sanitizeField(payload.details, 120),
    ].join('|');
    if (isDuplicate(dedupeKey)) {
      runtimeSkipped += 1;
      runtimeDuplicates += 1;
      return { ok: false, skipped: true, reason: 'duplicate' };
    }

    const html = formatTelegramMessage(event, payload);
    return await sendTelegramMessage(html);
  } catch (error) {
    runtimeFailed += 1;
    runtimeLastError = 'internal_error';
    console.warn(`[telegram] Notifikasi gagal disiapkan: ${safeError(error)}`);
    return { ok: false, error: 'internal_error' };
  }
}

/**
 * Kirim teks HTML ke chat Telegram tertentu (per wali santri).
 * `chatId` harus numeric Telegram user ID yang sudah menekan /start.
 * Tidak pernah melempar error dan tidak mencatat token.
 */
export async function sendTelegramToChat(
  chatId: string,
  html: string
): Promise<TelegramSendResult> {
  const cfg = getTelegramConfig();

  if (!cfg.enabled) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'disabled' };
  }
  if (!cfg.token || !isTokenFormatValid(cfg.token)) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'invalid_token' };
  }
  if (!/^-?\d{4,20}$/.test(chatId.trim())) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'invalid_chat_id' };
  }
  if (!takeRateLimit(cfg.maxPerMinute)) {
    runtimeSkipped += 1;
    runtimeRateLimited += 1;
    return { ok: false, skipped: true, reason: 'rate_limited' };
  }

  const result = await telegramFetch(cfg, 'sendMessage', {
    chat_id: chatId.trim(),
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  if (!result.ok) {
    runtimeFailed += 1;
    runtimeLastError = result.error || 'unknown_error';
    return { ok: false, error: result.error || 'unknown_error' };
  }

  runtimeSent += 1;
  runtimeLastSentAt = new Date().toISOString();
  return { ok: true };
}

/**
 * Kirim dokumen PDF ke chat Telegram tertentu via multipart/form-data.
 * Kegagalan pengiriman file TIDAK menghapus kuitansi yang sudah tersimpan.
 */
export async function sendTelegramDocumentToChat(
  chatId: string,
  pdf: Buffer,
  fileName: string,
  caption?: string
): Promise<TelegramSendResult> {
  const cfg = getTelegramConfig();

  if (!cfg.enabled) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'disabled' };
  }
  if (!cfg.token || !isTokenFormatValid(cfg.token)) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'invalid_token' };
  }
  if (!/^-?\d{4,20}$/.test(chatId.trim())) {
    runtimeSkipped += 1;
    return { ok: false, skipped: true, reason: 'invalid_chat_id' };
  }
  if (!takeRateLimit(cfg.maxPerMinute)) {
    runtimeSkipped += 1;
    runtimeRateLimited += 1;
    return { ok: false, skipped: true, reason: 'rate_limited' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const form = new FormData();
    form.append('chat_id', chatId.trim());
    if (caption) {
      form.append('caption', caption.slice(0, 900));
      form.append('parse_mode', 'HTML');
    }
    form.append('document', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), fileName.slice(0, 120));

    const response = await fetch(`${TELEGRAM_API}/bot${cfg.token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;

    if (!response.ok || !data?.ok) {
      runtimeFailed += 1;
      runtimeLastError = sanitizeField(redactSecrets(data?.description || `HTTP ${response.status}`), 200);
      return { ok: false, error: runtimeLastError };
    }

    runtimeSent += 1;
    runtimeLastSentAt = new Date().toISOString();
    return { ok: true };
  } catch (error) {
    runtimeFailed += 1;
    runtimeLastError = safeError(error);
    return { ok: false, error: runtimeLastError };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uji koneksi: panggil getMe lalu kirim pesan percobaan.
 * Token tidak pernah dikembalikan ke pemanggil.
 */
export async function testTelegramConnection(): Promise<{
  ok: boolean;
  botUsername?: string;
  error?: string;
  skipped?: boolean;
}> {
  const cfg = getTelegramConfig();
  if (!cfg.token || !cfg.chatId) {
    return { ok: false, skipped: true, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi.' };
  }
  if (!isTokenFormatValid(cfg.token)) {
    return { ok: false, error: 'Format TELEGRAM_BOT_TOKEN tidak valid.' };
  }

  const me = await telegramFetch(cfg, 'getMe');
  if (!me.ok) {
    return { ok: false, error: me.error || 'getMe gagal.' };
  }

  const botInfo = (me.data as { result?: { username?: string; first_name?: string } } | null)?.result;
  const botUsername = botInfo?.username;

  const send = await sendTelegramMessage(
    [
      '🔔 <b>NOTIFIKASI WEBSITE</b>',
      '',
      '📌 <b>Aktivitas:</b> 🧪 Tes Koneksi Telegram',
      `🤖 <b>Bot:</b> @${sanitizeField(botUsername || botInfo?.first_name || 'bot', 80)}`,
      `🕒 <b>Waktu:</b> ${sanitizeField(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), 80)} WIB`,
      '',
      'Status: <b>Berhasil</b>',
    ].join('\n')
  );

  if (!send.ok) {
    return { ok: false, botUsername, error: send.reason || send.error || 'sendMessage gagal.' };
  }

  return { ok: true, botUsername };
}
