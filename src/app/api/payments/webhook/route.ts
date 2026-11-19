import { NextRequest, NextResponse } from 'next/server';
import { processGatewayNotification } from '@/lib/server/gateway';

/**
 * POST /api/payments/webhook
 *
 * Webhook resmi payment gateway.
 * Header wajib:
 *   X-Payment-Signature: HMAC-SHA256(`${timestamp}.${rawBody}`, PAYMENT_GATEWAY_WEBHOOK_SECRET)
 *   X-Payment-Timestamp: Unix seconds
 *
 * Endpoint ini hanya memvalidasi dan mencatat event terkonfirmasi. Penerbitan
 * kuitansi dilakukan oleh mesin verifikasi setelah event diterapkan, sehingga
 * retry webhook tidak pernah membuat kuitansi ganda.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 20_000;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, message: 'Payload tidak valid.' }, { status: 400 });
    }

    const signature = req.headers.get('x-payment-signature') || '';
    const timestamp = req.headers.get('x-payment-timestamp') || '';

    const result = await processGatewayNotification({ rawBody, signature, timestamp });

    return NextResponse.json(
      {
        ok: result.status === 'accepted' || result.status === 'duplicate' || result.status === 'not_success',
        status: result.status,
        message: result.message,
        eventId: result.event?.eventId,
      },
      { status: result.httpStatus }
    );
  } catch {
    return NextResponse.json({ ok: false, message: 'Gagal memproses webhook.' }, { status: 500 });
  }
}
