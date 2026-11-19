import { NextRequest, NextResponse } from 'next/server';
import { notifyTelegramEvent } from '@/lib/telegram/server';
import { isTelegramEvent, type TelegramEventPayload } from '@/lib/telegram/types';

/**
 * POST /api/telegram/notify
 *
 * Dipanggil dari browser ketika terjadi aktivitas penting. Endpoint ini
 * TIDAK menerima token/chat id dari client; server memakai environment
 * variable sendiri. Respons selalu 202 agar status konfigurasi tidak bocor
 * dan agar kegagalan Telegram tidak terlihat sebagai error aplikasi.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8_000;
const WINDOW_MS = 60_000;
const MAX_PER_MINUTE = 20;
const hits = new Map<string, number[]>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_MINUTE;
}

function hasSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // curl / server-to-server
  try {
    const allowedHosts = new Set<string>();
    const requestHost = req.headers.get('host');
    if (requestHost) allowedHosts.add(requestHost);
    try {
      const configured = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
      allowedHosts.add(configured.host);
    } catch {
      // NEXT_PUBLIC_APP_URL tidak wajib.
    }
    return allowedHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

function asString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function sanitizePayload(raw: unknown): TelegramEventPayload {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const url = asString(source.url, 200);

  return {
    name: asString(source.name, 120),
    email: asString(source.email, 120),
    role: asString(source.role, 80),
    amount:
      typeof source.amount === 'number' && Number.isFinite(source.amount)
        ? source.amount
        : undefined,
    reference: asString(source.reference, 80),
    details: asString(source.details, 400),
    url: url && url.startsWith('/') ? url : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    if (isRateLimited(getClientIp(req))) {
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    const event = (body as { event?: unknown })?.event;
    if (!isTelegramEvent(event)) {
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    const payload = sanitizePayload((body as { payload?: unknown })?.payload);
    const result = await notifyTelegramEvent(event, payload);

    return NextResponse.json(
      { ok: true, delivered: result.ok === true },
      { status: 202 }
    );
  } catch {
    // Jangan pernah membocorkan detail internal (token, URL Telegram, stack).
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
