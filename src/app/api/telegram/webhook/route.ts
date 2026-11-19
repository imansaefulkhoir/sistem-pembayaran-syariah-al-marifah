import { NextRequest, NextResponse } from 'next/server';
import { linkTelegramAccount, unlinkTelegramByUserId } from '@/lib/server/runtime-store';
import { sendTelegramToChat } from '@/lib/telegram/server';

/**
 * POST /api/telegram/webhook
 *
 * Webhook resmi Telegram Bot API. Wajib menyertakan
 * `X-Telegram-Bot-Api-Secret-Token` yang sama dengan TELEGRAM_WEBHOOK_SECRET.
 *
 * Perintah yang didukung (chat pribadi saja):
 *   /start KODE  -> tautkan akun Telegram ke akun wali
 *   /stop        -> lepaskan tautan
 *
 * Webhook ini TIDAK pernah mengubah status pembayaran. Hanya mengelola tautan.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 20_000;

function secretValid(req: NextRequest): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const provided = (req.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  if (!expected) {
    return (process.env.ALLOW_TELEGRAM_WEBHOOK_WITHOUT_SECRET || '').toLowerCase() === 'true';
  }
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

async function reply(chatId: string, html: string): Promise<void> {
  await sendTelegramToChat(chatId, html);
}

export async function POST(req: NextRequest) {
  try {
    if (!secretValid(req)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const update = JSON.parse(raw) as {
      message?: {
        text?: string;
        chat?: { id?: number; type?: string };
        from?: { id?: number; username?: string; first_name?: string };
      };
    };

    const message = update.message;
    const chatId = message?.chat?.id;
    const chatType = message?.chat?.type;
    const fromId = message?.from?.id;
    const text = (message?.text || '').trim();

    if (!chatId || !fromId || chatType !== 'private') {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const userId = String(fromId);
    const command = text.split(/\s+/)[0].toLowerCase();
    const argument = text.split(/\s+/)[1] || '';

    if (command === '/start') {
      if (!argument) {
        await reply(
          userId,
          [
            'Assalamu\u2019alaikum.',
            '',
            'Untuk menghubungkan akun Telegram dengan akun wali santri:',
            '1. Masuk ke website pondok.',
            '2. Buka menu <b>Wali Santri</b> \u2192 <b>Hubungkan Telegram</b>.',
            '3. Salin kode tautan yang muncul.',
            '4. Kirim perintah: <code>/start KODE</code>',
            '',
            'Nomor WhatsApp tidak dapat dipakai sebagai tujuan Telegram.',
          ].join('\n')
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const result = await linkTelegramAccount(argument, userId, message?.from?.username);
      if (!result.ok) {
        await reply(userId, `Tautan gagal: ${result.error || 'kode tidak valid.'}\nMinta kode baru dari website pondok.`);
      } else {
        await reply(
          userId,
          [
            'Alhamdulillah, akun Telegram Anda <b>berhasil dihubungkan</b>.',
            '',
            `Nama wali: ${result.record?.guardianName || '-'}`,
            'Mulai sekarang, notifikasi pembayaran dan kuitansi digital akan dikirim ke chat ini.',
            '',
            'Untuk berhenti menerima notifikasi, kirim <code>/stop</code>.',
          ].join('\n')
        );
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (command === '/stop') {
      const removed = await unlinkTelegramByUserId(userId);
      await reply(
        userId,
        removed
          ? 'Tautan Telegram telah dilepas. Anda tidak akan menerima notifikasi pembayaran sampai menghubungkan ulang.'
          : 'Akun Telegram ini belum terhubung ke akun wali mana pun.'
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await reply(
      userId,
      'Perintah tersedia:\n\u2022 <code>/start KODE</code> \u2014 hubungkan akun\n\u2022 <code>/stop</code> \u2014 lepaskan tautan\n\nStatus pembayaran tidak dapat diubah melalui bot.'
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    // Telegram akan mencoba ulang; jangan bocorkan detail internal.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
