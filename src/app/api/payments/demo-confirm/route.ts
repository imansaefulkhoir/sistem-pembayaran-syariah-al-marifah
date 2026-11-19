import { NextRequest, NextResponse } from 'next/server';
import { processDemoGatewayConfirmation } from '@/lib/server/gateway';
import {
  createGatewaySignature,
  getPaymentIntent,
  isDemoSimulationAllowed,
} from '@/lib/server/runtime-store';
import { asText, hasSameOrigin, isRateLimited, readJsonBody } from '@/lib/server/http';

/**
 * POST /api/payments/demo-confirm
 *
 * SIMULASI LOKAL SAJA. Tidak memproses uang nyata. Hanya aktif bila
 * ALLOW_DEMO_PAYMENT_SIMULATION=true atau NODE_ENV !== production.
 * Berguna untuk menguji alur webhook + kuitansi + Telegram tanpa gateway.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!isDemoSimulationAllowed()) {
      return NextResponse.json(
        { ok: false, error: 'Simulasi gateway dinonaktifkan pada lingkungan ini.' },
        { status: 403 }
      );
    }
    if (isRateLimited(req, 'demo-gateway', 10)) {
      return NextResponse.json({ ok: false, error: 'Terlalu banyak simulasi.' }, { status: 429 });
    }

    const body = (await readJsonBody(req, 1000)) as Record<string, unknown> | null;
    const paymentId = asText(body?.paymentId, 80);
    if (!paymentId) {
      return NextResponse.json({ ok: false, error: 'paymentId wajib diisi.' }, { status: 400 });
    }

    const intent = await getPaymentIntent(paymentId);
    if (!intent) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Niat pembayaran belum terdaftar di server. Kirim ulang pembayaran dari halaman tagihan agar data pembanding tersedia.',
        },
        { status: 404 }
      );
    }

    const result = await processDemoGatewayConfirmation({
      paymentId,
      intent,
      createSignature: createGatewaySignature,
    });

    return NextResponse.json(
      { ok: result.status === 'accepted' || result.status === 'duplicate', status: result.status, message: result.message },
      { status: result.httpStatus }
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'Simulasi gagal.' }, { status: 500 });
  }
}
