import { NextRequest, NextResponse } from 'next/server';
import { storeReceiptPdf } from '@/lib/server/runtime-store';
import { asText, hasSameOrigin, isRateLimited, readJsonBody } from '@/lib/server/http';

/**
 * POST /api/receipts/store
 *
 * Menyimpan PDF kuitansi di penyimpanan server (mode demo: folder data lokal).
 * Tidak mengembalikan URL publik. Akses unduh hanya lewat token bertanda tangan.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (isRateLimited(req, 'receipt-store', 30)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = (await readJsonBody(req, 8_000_000)) as Record<string, unknown> | null;
    const receiptId = asText(body?.receiptId, 120);
    const paymentId = asText(body?.paymentId, 80);
    const guardianId = asText(body?.guardianId, 80) || undefined;
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';

    if (!receiptId || !paymentId || !pdfBase64) {
      return NextResponse.json({ ok: false, error: 'Data kuitansi tidak lengkap.' }, { status: 400 });
    }

    const stored = await storeReceiptPdf({ receiptId, paymentId, guardianId, pdfBase64 });
    if (!stored.ok) {
      return NextResponse.json({ ok: false, error: stored.error || 'Gagal menyimpan PDF.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, stored: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Gagal menyimpan PDF.' }, { status: 500 });
  }
}
