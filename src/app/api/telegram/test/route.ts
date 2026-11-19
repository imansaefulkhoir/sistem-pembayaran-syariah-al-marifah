import { NextRequest, NextResponse } from 'next/server';
import { testTelegramConnection } from '@/lib/telegram/server';

/**
 * POST /api/telegram/test
 *
 * Fitur tes koneksi: memanggil getMe + mengirim pesan percobaan ke chat admin.
 *
 * Pengamanan:
 * - Jika `TELEGRAM_TEST_SECRET` diisi, header `x-telegram-test-secret` wajib sama.
 * - Jika tidak diisi, endpoint hanya boleh dipakai saat development.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_PER_MINUTE = 5;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_MINUTE;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = (process.env.TELEGRAM_TEST_SECRET || '').trim();
  if (secret) {
    return req.headers.get('x-telegram-test-secret') === secret;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Terlalu banyak percobaan. Coba lagi sebentar.' },
      { status: 429 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Tidak diizinkan.' }, { status: 403 });
  }

  const result = await testTelegramConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
