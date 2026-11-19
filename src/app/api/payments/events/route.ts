import { NextRequest, NextResponse } from 'next/server';
import { getGatewayEvents } from '@/lib/server/runtime-store';
import { hasSameOrigin } from '@/lib/server/http';

/**
 * GET /api/payments/events
 *
 * Klien demo mengambil event gateway terkonfirmasi lalu menerapkannya lewat
 * mesin verifikasi yang sama. Di produksi, endpoint ini wajib berada di balik
 * autentikasi server dan sebaiknya diganti proses worker/queue.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!hasSameOrigin(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const paymentId = (req.nextUrl.searchParams.get('paymentId') || '').slice(0, 80);
  const events = await getGatewayEvents();
  const filtered = paymentId ? events.filter((event) => event.paymentId === paymentId) : events;
  return NextResponse.json({
    ok: true,
    events: filtered.slice(0, 50).map((event) => ({
      eventId: event.eventId,
      gatewayTransactionId: event.gatewayTransactionId,
      paymentId: event.paymentId,
      invoiceId: event.invoiceId,
      amount: event.amount,
      reference: event.reference,
      paidAt: event.paidAt,
      receivedAt: event.receivedAt,
      appliedAt: event.appliedAt,
    })),
  });
}
