import type { GatewayConfirmedEvent } from '../types';
import {
  getPaymentIntent,
  isProcessedKey,
  markProcessedKey,
  recordGatewayEvent,
  verifyGatewaySignature,
} from './runtime-store';

/**
 * Pemrosesan notifikasi payment gateway.
 *
 * Urutan keamanan:
 * 1. Signature HMAC + timestamp (anti replay).
 * 2. Validasi bentuk payload.
 * 3. Idempotensi berdasarkan event ID dan transaction ID.
 * 4. Cocokkan niat pembayaran (paymentId, referensi, nominal).
 * 5. Hanya status sukses yang diterima.
 *
 * Fungsi ini TIDAK membuat kuitansi. Kuitansi diterbitkan oleh mesin
 * verifikasi setelah event diterapkan ke data pembayaran, sehingga satu
 * transaksi tidak mungkin menghasilkan dua kuitansi.
 */

export type GatewayProcessStatus =
  | 'accepted'
  | 'duplicate'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'unknown_intent'
  | 'amount_mismatch'
  | 'reference_mismatch'
  | 'not_success'
  | 'server_error';

export interface GatewayProcessResult {
  status: GatewayProcessStatus;
  httpStatus: number;
  message: string;
  event?: GatewayConfirmedEvent;
}

const SUCCESS_STATUSES = new Set(['paid', 'settlement', 'capture', 'success', 'succeeded', 'completed']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function processGatewayNotification(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
}): Promise<GatewayProcessResult> {
  try {
    const signatureCheck = verifyGatewaySignature(input.rawBody, input.signature, input.timestamp);
    if (!signatureCheck.ok) {
      return {
        status: 'invalid_signature',
        httpStatus: 401,
        message: signatureCheck.error || 'Signature tidak valid.',
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(input.rawBody);
    } catch {
      return { status: 'invalid_payload', httpStatus: 400, message: 'Body bukan JSON.' };
    }
    if (!isObject(body)) {
      return { status: 'invalid_payload', httpStatus: 400, message: 'Payload tidak valid.' };
    }

    const eventId = text(body.eventId, 120);
    const gatewayTransactionId = text(body.transactionId, 120);
    const paymentId = text(body.paymentId, 80);
    const reference = text(body.reference, 120);
    const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
    const status = text(body.status, 40).toLowerCase();
    const paidAt = text(body.paidAt, 40) || new Date().toISOString();

    if (!eventId || !gatewayTransactionId || !paymentId || !reference) {
      return {
        status: 'invalid_payload',
        httpStatus: 400,
        message: 'eventId, transactionId, paymentId, dan reference wajib ada.',
      };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { status: 'invalid_payload', httpStatus: 400, message: 'Nominal tidak valid.' };
    }
    if (!SUCCESS_STATUSES.has(status)) {
      return {
        status: 'not_success',
        httpStatus: 200,
        message: `Status "${status || 'kosong'}" bukan status pembayaran berhasil; tidak diproses.`,
      };
    }

    if (await isProcessedKey(`event:${eventId}`)) {
      return { status: 'duplicate', httpStatus: 200, message: 'Event sudah pernah diproses.' };
    }
    if (await isProcessedKey(`txn:${gatewayTransactionId}`)) {
      return { status: 'duplicate', httpStatus: 200, message: 'Transaksi gateway sudah pernah diproses.' };
    }

    const intent = await getPaymentIntent(paymentId);
    if (!intent) {
      return {
        status: 'unknown_intent',
        httpStatus: 404,
        message: 'Niat pembayaran tidak ditemukan. Transaksi tidak boleh dilunasi otomatis.',
      };
    }

    if (Math.round(amount) !== Math.round(intent.amount)) {
      return {
        status: 'amount_mismatch',
        httpStatus: 409,
        message: 'Nominal gateway tidak sama dengan nominal tagihan yang didaftarkan.',
      };
    }

    const normalizedReference = reference.toLowerCase();
    const referenceMatches =
      normalizedReference === intent.reference.toLowerCase() ||
      normalizedReference === intent.nomorPembayaran.toLowerCase() ||
      normalizedReference === intent.invoiceId.toLowerCase();
    if (!referenceMatches) {
      return {
        status: 'reference_mismatch',
        httpStatus: 409,
        message: 'Referensi transaksi tidak cocok dengan tagihan.',
      };
    }

    const event: GatewayConfirmedEvent = {
      id: `gwe-${eventId}`,
      eventId,
      gatewayTransactionId,
      paymentId,
      invoiceId: intent.invoiceId,
      amount: Math.round(amount),
      reference,
      status: 'paid',
      paidAt,
      receivedAt: new Date().toISOString(),
    };

    const inserted = await recordGatewayEvent(event);
    if (!inserted) {
      return { status: 'duplicate', httpStatus: 200, message: 'Transaksi sudah tercatat.' };
    }
    await markProcessedKey(`event:${eventId}`);
    await markProcessedKey(`txn:${gatewayTransactionId}`);

    return {
      status: 'accepted',
      httpStatus: 200,
      message: 'Pembayaran terkonfirmasi. Menunggu penerapan ke data tagihan.',
      event,
    };
  } catch {
    return { status: 'server_error', httpStatus: 500, message: 'Gagal memproses webhook.' };
  }
}

export async function processDemoGatewayConfirmation(input: {
  paymentId: string;
  intent: {
    amount: number;
    reference: string;
    nomorPembayaran: string;
    invoiceId: string;
  };
  createSignature: (rawBody: string, timestamp: string) => string | null;
}): Promise<GatewayProcessResult> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({
    eventId: `demo-${input.paymentId}-${Date.now()}`,
    transactionId: `DEMO-TXN-${Date.now()}`,
    paymentId: input.paymentId,
    reference: input.intent.reference || input.intent.nomorPembayaran,
    amount: input.intent.amount,
    status: 'paid',
    paidAt: new Date().toISOString(),
    demo: true,
  });
  const signature = input.createSignature(rawBody, timestamp);
  if (!signature) {
    return {
      status: 'invalid_signature',
      httpStatus: 503,
      message: 'PAYMENT_GATEWAY_WEBHOOK_SECRET belum diatur; simulasi tidak dapat ditandatangani.',
    };
  }

  const result = await processGatewayNotification({ rawBody, signature, timestamp });
  // Event demo hanya untuk pengujian lokal; tidak ada uang nyata yang bergerak.
  return result;
}
