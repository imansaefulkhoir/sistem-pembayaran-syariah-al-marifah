import { NextRequest, NextResponse } from 'next/server';
import type { GatewayPaymentIntent, PaymentMethod } from '@/lib/types';
import { savePaymentIntent } from '@/lib/server/runtime-store';
import { asNumber, asText, hasSameOrigin, isRateLimited, readJsonBody } from '@/lib/server/http';

/**
 * POST /api/payments/intents
 *
 * Mendaftarkan "niat pembayaran" agar webhook gateway dapat mencocokkan
 * nominal, referensi, dan ID pembayaran. Tidak berisi token/rahasia.
 * Endpoint ini TIDAK menandai lunas; hanya menyiapkan data pembanding.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const METHODS: PaymentMethod[] = ['transfer_bank', 'qris', 'tunai'];

export async function POST(req: NextRequest) {
  try {
    if (!hasSameOrigin(req)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (isRateLimited(req, 'payment-intent', 60)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = (await readJsonBody(req, 4000)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false }, { status: 400 });

    const paymentId = asText(body.paymentId, 80);
    const invoiceId = asText(body.invoiceId, 80);
    const studentId = asText(body.studentId, 80);
    const studentNama = asText(body.studentNama, 120);
    const nomorPembayaran = asText(body.nomorPembayaran, 60);
    const reference = asText(body.reference, 120) || nomorPembayaran;
    const amount = asNumber(body.amount);
    const metode = asText(body.metode, 30) as PaymentMethod;
    const guardianId = asText(body.guardianId, 80) || undefined;
    const guardianName = asText(body.guardianName, 120) || undefined;

    if (!paymentId || !invoiceId || !studentId || !studentNama || !nomorPembayaran) {
      return NextResponse.json({ ok: false, error: 'Data niat pembayaran tidak lengkap.' }, { status: 400 });
    }
    if (amount === null || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Nominal tidak valid.' }, { status: 400 });
    }
    if (!METHODS.includes(metode)) {
      return NextResponse.json({ ok: false, error: 'Metode tidak valid.' }, { status: 400 });
    }

    const intent: GatewayPaymentIntent = {
      paymentId,
      invoiceId,
      studentId,
      studentNama,
      nomorPembayaran,
      amount: Math.round(amount),
      reference,
      metode,
      guardianId,
      guardianName,
      createdAt: new Date().toISOString(),
    };
    await savePaymentIntent(intent);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
