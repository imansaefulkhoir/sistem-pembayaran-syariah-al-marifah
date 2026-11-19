import { NextRequest, NextResponse } from 'next/server';
import type { GuardianNoticeStatus } from '@/lib/types';
import {
  createReceiptToken,
  getOutboxEntry,
  getTelegramLinkByGuardian,
  readReceiptPdf,
  storeReceiptPdf,
  upsertOutboxEntry,
} from '@/lib/server/runtime-store';
import { sendTelegramDocumentToChat, sendTelegramToChat } from '@/lib/telegram/server';
import { buildGuardianPaymentMessage, formatMetode } from '@/lib/payments/telegram';
import { asNumber, asText, hasSameOrigin, isRateLimited, readJsonBody } from '@/lib/server/http';

/**
 * POST /api/telegram/guardian-notify
 *
 * Mengirim notifikasi pembayaran ke AKUN WALI yang sudah menautkan Telegram.
 * Server membangun ulang isi pesan dari data terstruktur (tidak menerima HTML
 * mentah dari browser), sehingga status yang dikirim selalu konsisten.
 *
 * Kegagalan Telegram TIDAK membatalkan pembayaran/kuitansi. Semua percobaan
 * dicatat di outbox dan dapat dicoba ulang.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOTICE_STATUSES: GuardianNoticeStatus[] = [
  'menunggu_verifikasi',
  'terverifikasi',
  'sebagian',
  'lunas',
  'ditolak',
  'dibatalkan',
];

function isNoticeStatus(value: string): value is GuardianNoticeStatus {
  return (NOTICE_STATUSES as string[]).includes(value);
}

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (isRateLimited(req, 'guardian-notify', 40)) {
      return NextResponse.json({ ok: false, error: 'Terlalu banyak pengiriman.' }, { status: 429 });
    }

    const body = (await readJsonBody(req, 8_000_000)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: 'Payload tidak valid.' }, { status: 400 });

    const guardianId = asText(body.guardianId, 80);
    const studentId = asText(body.studentId, 80);
    const studentName = asText(body.studentName, 120);
    const studentNis = asText(body.studentNis, 40);
    const paymentId = asText(body.paymentId, 80);
    const receiptId = asText(body.receiptId, 120);
    const nomorKuitansi = asText(body.nomorKuitansi, 80);
    const noticeStatus = asText(body.noticeStatus, 40);
    const idempotencyKey = asText(body.idempotencyKey, 220);
    const category = asText(body.category, 120) || 'Pembayaran';
    const period = asText(body.period, 80) || '-';
    const paidAt = asText(body.paidAt, 40) || new Date().toISOString();
    const metode = asText(body.metode, 40) || 'transfer_bank';
    const reason = asText(body.reason, 400);
    const institutionName =
      asText(body.institutionName, 150) || "Pondok Pesantren Kebon Kelapa Al-Ma'rifah";
    const amount = asNumber(body.amount);
    const invoiceTotal = asNumber(body.invoiceTotal) ?? 0;
    const totalVerified = asNumber(body.totalVerified) ?? 0;
    const remaining = asNumber(body.remaining) ?? 0;
    const overpayment = asNumber(body.overpayment) ?? 0;
    const retry = body.retry === true;
    const notificationsEnabled = body.notificationsEnabled !== false;
    const pdfBase64 = typeof body.receiptPdfBase64 === 'string' ? body.receiptPdfBase64 : '';

    if (
      !guardianId ||
      !studentId ||
      !studentName ||
      !paymentId ||
      !idempotencyKey ||
      amount === null ||
      !isNoticeStatus(noticeStatus)
    ) {
      return NextResponse.json({ ok: false, error: 'Data notifikasi tidak lengkap.' }, { status: 400 });
    }

    const existing = await getOutboxEntry(idempotencyKey);
    if (existing && !retry) {
      return NextResponse.json(
        {
          ok: true,
          status: existing.status,
          delivered: existing.status === 'sent',
          duplicate: true,
          message: 'Notifikasi dengan kunci ini sudah pernah diproses.',
        },
        { status: 202 }
      );
    }

    const link = await getTelegramLinkByGuardian(guardianId);
    if (!link?.telegramUserId) {
      await upsertOutboxEntry(idempotencyKey, {
        status: 'no_destination',
        guardianId,
        attempts: (existing?.attempts || 0) + 1,
        lastError: 'Akun Telegram wali belum terhubung.',
        receiptAttached: false,
        fallbackLinkUsed: false,
      });
      return NextResponse.json(
        {
          ok: true,
          status: 'no_destination',
          delivered: false,
          message: 'Kwitansi tersimpan di website, tetapi Telegram wali belum terhubung.',
        },
        { status: 202 }
      );
    }

    if (!notificationsEnabled) {
      await upsertOutboxEntry(idempotencyKey, {
        status: 'skipped',
        guardianId,
        telegramUserId: link.telegramUserId,
        attempts: (existing?.attempts || 0) + 1,
        lastError: 'Notifikasi dinonaktifkan oleh wali.',
        receiptAttached: false,
        fallbackLinkUsed: false,
      });
      return NextResponse.json(
        { ok: true, status: 'skipped', delivered: false, message: 'Notifikasi dinonaktifkan oleh wali.' },
        { status: 202 }
      );
    }

    const message = buildGuardianPaymentMessage({
      status: noticeStatus,
      guardianName: link.guardianName,
      studentName,
      studentNis,
      category,
      period,
      amount,
      metode: formatMetode(metode),
      paidAt,
      receiptNumber: nomorKuitansi || undefined,
      invoiceTotal,
      totalVerified,
      remaining,
      overpayment,
      reason: reason || undefined,
      institutionName,
    });

    const baseAttempts = (existing?.attempts || 0) + 1;
    const textResult = await sendTelegramToChat(link.telegramUserId, message.html);

    if (!textResult.ok) {
      await upsertOutboxEntry(idempotencyKey, {
        status: textResult.skipped ? 'skipped' : 'failed',
        guardianId,
        telegramUserId: link.telegramUserId,
        attempts: baseAttempts,
        lastError: textResult.reason || textResult.error || 'Gagal mengirim pesan Telegram.',
        receiptAttached: false,
        fallbackLinkUsed: false,
      });
      return NextResponse.json(
        {
          ok: true,
          status: textResult.skipped ? 'skipped' : 'failed',
          delivered: false,
          message: 'Pembayaran/kuitansi tetap tersimpan; notifikasi dapat dicoba ulang.',
        },
        { status: 202 }
      );
    }

    let receiptAttached = false;
    let fallbackLinkUsed = false;

    if (receiptId && pdfBase64 && noticeStatus !== 'ditolak' && noticeStatus !== 'dibatalkan' && noticeStatus !== 'menunggu_verifikasi') {
      const stored = await storeReceiptPdf({
        receiptId,
        paymentId,
        guardianId,
        pdfBase64,
      });

      if (stored.ok) {
        const pdf = await readReceiptPdf(receiptId);
        if (pdf) {
          const fileName = `Kuitansi_${(nomorKuitansi || receiptId).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
          const docResult = await sendTelegramDocumentToChat(
            link.telegramUserId,
            pdf,
            fileName,
            `<b>Kuitansi ${nomorKuitansi || receiptId}</b>\n${studentName} \u2022 ${period}`
          );
          receiptAttached = docResult.ok;
          if (!docResult.ok) {
            fallbackLinkUsed = true;
          }
        }
      }
    }

    if (!receiptAttached && receiptId && !fallbackLinkUsed) {
      const existingPdf = await readReceiptPdf(receiptId);
      if (existingPdf) fallbackLinkUsed = true;
    }

    if (fallbackLinkUsed) {
      const token = createReceiptToken(receiptId, guardianId, 30 * 60 * 1000);
      const configuredBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
      const base = configuredBase || req.nextUrl.origin;
      const linkUrl = `${base}/api/receipts/${encodeURIComponent(receiptId)}/download?token=${encodeURIComponent(token)}`;
      await sendTelegramToChat(
        link.telegramUserId,
        [
          'Lampiran PDF gagal dikirim, tetapi kuitansi tetap tersimpan aman.',
          `Tautan unduh kuitansi (berlaku 30 menit, khusus untuk akun ini):`,
          linkUrl,
          '',
          'Jangan bagikan tautan ini kepada pihak lain.',
        ].join('\n')
      );
    }

    await upsertOutboxEntry(idempotencyKey, {
      status: 'sent',
      guardianId,
      telegramUserId: link.telegramUserId,
      attempts: baseAttempts,
      deliveredAt: new Date().toISOString(),
      lastError: undefined,
      receiptAttached,
      fallbackLinkUsed,
    });

    return NextResponse.json(
      {
        ok: true,
        status: 'sent',
        delivered: true,
        receiptAttached,
        fallbackLinkUsed,
        message: receiptAttached
          ? 'Pesan dan PDF kuitansi terkirim.'
          : fallbackLinkUsed
            ? 'Pesan terkirim dengan tautan kuitansi aman.'
            : 'Pesan terkirim tanpa lampiran PDF.',
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Notifikasi gagal dikirim; data pembayaran tidak berubah.' },
      { status: 500 }
    );
  }
}
