import { NextRequest, NextResponse } from 'next/server';
import { createTelegramLinkCode } from '@/lib/server/runtime-store';
import { asText, hasSameOrigin, isRateLimited, readJsonBody } from '@/lib/server/http';

/**
 * POST /api/telegram/link/start
 *
 * Membuat kode tautan sekali pakai untuk wali. Wali lalu membuka bot dan
 * mengirim `/start KODE`. Kode berlaku 15 menit dan tidak pernah berisi token.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (isRateLimited(req, 'telegram-link-start', 20)) {
      return NextResponse.json({ ok: false, error: 'Terlalu banyak permintaan.' }, { status: 429 });
    }

    const body = (await readJsonBody(req, 2000)) as Record<string, unknown> | null;
    const guardianId = asText(body?.guardianId, 80);
    const guardianName = asText(body?.guardianName, 120);
    const notificationsEnabled = body?.notificationsEnabled !== false;

    if (!guardianId || !guardianName) {
      return NextResponse.json({ ok: false, error: 'Data wali tidak lengkap.' }, { status: 400 });
    }

    const record = await createTelegramLinkCode(guardianId, guardianName, notificationsEnabled);
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
    const deepLink = botUsername ? `https://t.me/${botUsername}?start=${record.code}` : null;

    return NextResponse.json({
      ok: true,
      code: record.code,
      expiresAt: record.codeExpiresAt,
      deepLink,
      instructions: `Buka bot Telegram${botUsername ? ` @${botUsername}` : ''}, tekan Start, lalu kirim: /start ${record.code}`,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Gagal membuat kode tautan.' }, { status: 500 });
  }
}
