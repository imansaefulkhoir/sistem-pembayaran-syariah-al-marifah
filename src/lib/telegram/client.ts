'use client';

/**
 * Helper notifikasi Telegram untuk sisi browser.
 *
 * - Tidak pernah menyentuh token bot (token hanya ada di server).
 * - Fire-and-forget: tidak menunggu respons dan tidak pernah melempar error,
 *   sehingga alur utama website tetap berjalan meski Telegram mati.
 * - Penanganan error, validasi, dan rate limit sebenarnya ada di server.
 */

import type { TelegramEvent, TelegramEventPayload } from './types';

const DEDUPE_WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function truncate(value: unknown, max = 300): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pickPayload(payload: TelegramEventPayload): TelegramEventPayload {
  const url =
    typeof payload.url === 'string' && payload.url.startsWith('/')
      ? truncate(payload.url, 200)
      : undefined;

  return {
    name: truncate(payload.name, 120),
    email: truncate(payload.email, 120),
    role: truncate(payload.role, 80),
    amount:
      typeof payload.amount === 'number' && Number.isFinite(payload.amount)
        ? payload.amount
        : undefined,
    reference: truncate(payload.reference, 80),
    details: truncate(payload.details, 400),
    url,
  };
}

export function notifyTelegramEvent(
  event: TelegramEvent,
  payload: TelegramEventPayload = {}
): void {
  if (typeof window === 'undefined') return;

  try {
    const safePayload = pickPayload(payload);
    const key = `${event}|${safePayload.reference || ''}|${safePayload.details || ''}`;
    const now = Date.now();

    recent.forEach((timestamp, oldKey) => {
      if (now - timestamp > DEDUPE_WINDOW_MS) recent.delete(oldKey);
    });
    const previous = recent.get(key);
    if (typeof previous === 'number' && now - previous < DEDUPE_WINDOW_MS) return;
    recent.set(key, now);

    void fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload: safePayload }),
      keepalive: true,
    }).catch(() => {
      // Sengaja diabaikan: notifikasi tidak boleh mengganggu pengguna.
    });
  } catch {
    // Sengaja diabaikan.
  }
}
