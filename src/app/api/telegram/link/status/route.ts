import { NextRequest, NextResponse } from 'next/server';
import { getTelegramLinkByCode } from '@/lib/server/runtime-store';
import { hasSameOrigin } from '@/lib/server/http';

/**
 * GET /api/telegram/link/status?code=KODE
 *
 * Dipanggil browser setelah wali menekan Start di bot. Kode berfungsi sebagai
 * kapabilitas sementara; tanpa kode yang benar data tautan tidak dikembalikan.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!hasSameOrigin(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const code = (req.nextUrl.searchParams.get('code') || '').trim().slice(0, 20);
  if (!code) {
    return NextResponse.json({ ok: false, error: 'Kode wajib diisi.' }, { status: 400 });
  }

  const record = await getTelegramLinkByCode(code);
  if (!record) {
    return NextResponse.json({ ok: false, error: 'Kode tidak ditemukan.' }, { status: 404 });
  }

  const expired = new Date(record.codeExpiresAt).getTime() < Date.now();
  return NextResponse.json({
    ok: true,
    linked: Boolean(record.telegramUserId),
    expired: expired && !record.telegramUserId,
    telegramUserId: record.telegramUserId || null,
    telegramUsername: record.telegramUsername || null,
    linkedAt: record.linkedAt || null,
    expiresAt: record.codeExpiresAt,
  });
}
