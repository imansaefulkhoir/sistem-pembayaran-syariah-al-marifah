import { NextRequest, NextResponse } from 'next/server';
import { readReceiptPdf, verifyReceiptToken } from '@/lib/server/runtime-store';

/**
 * GET /api/receipts/[id]/download?token=...
 *
 * Akses kuitansi hanya dengan token HMAC berbatas waktu yang dibuat server
 * untuk wali terkait. Tanpa token yang sah, dokumen tidak pernah dikirim.
 * Tidak ada URL publik permanen untuk kuitansi.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const receiptId = (params.id || '').slice(0, 120);
  const token = (req.nextUrl.searchParams.get('token') || '').slice(0, 2000);

  if (!receiptId || !token) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 401 });
  }

  const check = verifyReceiptToken(token, receiptId);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: 'Tautan tidak valid atau kedaluwarsa.' }, { status: 401 });
  }

  const pdf = await readReceiptPdf(receiptId);
  if (!pdf) {
    return NextResponse.json({ ok: false, error: 'Kuitansi tidak ditemukan.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Kuitansi_${receiptId.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
