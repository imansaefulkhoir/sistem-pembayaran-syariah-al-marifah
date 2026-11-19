import type {
  GuardianNoticeStatus,
  Invoice,
  Payment,
  PaymentStatus,
  PaymentStatusHistory,
  PaymentVerificationSource,
  Receipt,
} from '../types';
import {
  applyInvoiceState,
  computeInvoiceState,
  guardianNoticeStatus,
  type InvoiceState,
} from './state';
import {
  cancelReceiptRecord,
  findActiveReceiptByPayment,
  issueReceiptForPayment,
  markReceiptReplaced,
} from './receipt';

/**
 * MESIN VERIFIKASI PEMBAYARAN (PURE).
 *
 * Semua fungsi menerima snapshot data dan mengembalikan objek baru. Tidak ada
 * akses localStorage / jaringan di sini, sehingga logika yang sama dapat diuji
 * dan dipakai ulang saat backend Supabase aktif.
 */

export interface TransactionActor {
  id: string;
  name: string;
  role: string;
}

export interface VerifyPaymentArgs {
  paymentId: string;
  payments: Payment[];
  invoices: Invoice[];
  receipts: Receipt[];
  actor: TransactionActor;
  notes?: string;
  at: Date;
  source?: PaymentVerificationSource;
  gatewayTransactionId?: string;
  gatewayEventId?: string;
  guardian?: { id?: string; name?: string };
}

export interface VerifyPaymentResult {
  ok: boolean;
  error?: string;
  alreadyVerified?: boolean;
  payment?: Payment;
  invoice?: Invoice;
  receipt?: Receipt;
  state?: InvoiceState;
  createdReceipt?: boolean;
  noticeStatus?: GuardianNoticeStatus;
  statusHistory?: PaymentStatusHistory;
}

function historyEntry(args: {
  payment: Payment;
  from: PaymentStatus | null;
  to: PaymentStatus;
  source: PaymentVerificationSource;
  actor: TransactionActor;
  at: Date;
  note?: string;
  key: string;
}): PaymentStatusHistory {
  return {
    id: `psh-${args.payment.id}-${args.to}-${args.at.getTime()}`,
    paymentId: args.payment.id,
    invoiceId: args.payment.invoiceId,
    studentId: args.payment.studentId,
    fromStatus: args.from,
    toStatus: args.to,
    source: args.source,
    note: args.note,
    actorId: args.actor.id,
    actorName: args.actor.name,
    idempotencyKey: args.key,
    createdAt: args.at.toISOString(),
  };
}

function findPaymentAndInvoice(paymentId: string, args: VerifyPaymentArgs) {
  const payment = args.payments.find((p) => p.id === paymentId);
  if (!payment) return { error: 'Data pembayaran tidak ditemukan.' as const };
  const invoice = args.invoices.find((inv) => inv.id === payment.invoiceId);
  if (!invoice) return { error: 'Tagihan terkait pembayaran tidak ditemukan.' as const };
  return { payment, invoice };
}

export function verifyPaymentTransaction(args: VerifyPaymentArgs): VerifyPaymentResult {
  const found = findPaymentAndInvoice(args.paymentId, args);
  if ('error' in found) return { ok: false, error: found.error };
  const { payment, invoice } = found;

  if (payment.status === 'terverifikasi') {
    const existingReceipt = findActiveReceiptByPayment(args.receipts, payment.id);
    const state = computeInvoiceState(invoice, args.payments);
    return {
      ok: true,
      alreadyVerified: true,
      payment,
      invoice,
      receipt: existingReceipt,
      state,
      createdReceipt: false,
      noticeStatus: guardianNoticeStatus(payment, state),
    };
  }

  if (payment.status !== 'menunggu_verifikasi') {
    return {
      ok: false,
      error: `Pembayaran berstatus "${payment.status}" tidak dapat diverifikasi. Unggah pembayaran baru atau gunakan koreksi resmi.`,
    };
  }

  if (payment.nominal <= 0) {
    return { ok: false, error: 'Nominal pembayaran tidak valid.' };
  }

  const source = args.source || 'bendahara';
  const atIso = args.at.toISOString();

  const updatedPayment: Payment = {
    ...payment,
    status: 'terverifikasi',
    diverifikasiOlehId: args.actor.id,
    diverifikasiOlehNama: args.actor.name,
    waktuVerifikasi: atIso,
    catatanVerifikasi:
      args.notes ||
      (source === 'gateway'
        ? 'Transaksi terkonfirmasi oleh webhook gateway yang tervalidasi.'
        : source === 'kasir_tunai'
          ? 'Uang tunai diterima langsung oleh kasir bendahara.'
          : 'Bukti pembayaran cocok dengan mutasi rekening pondok.'),
    verificationSource: source,
    gatewayTransactionId: args.gatewayTransactionId || payment.gatewayTransactionId,
    gatewayEventId: args.gatewayEventId || payment.gatewayEventId,
    gatewayAppliedAt: source === 'gateway' ? atIso : payment.gatewayAppliedAt,
  };

  const updatedPayments = args.payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p));
  const state = computeInvoiceState(invoice, updatedPayments);
  const updatedInvoice = applyInvoiceState(invoice, state, atIso);

  updatedPayment.nomorKuitansi = undefined;
  updatedPayment.overpaymentAmount = state.overpayment;

  const issue = issueReceiptForPayment({
    payment: updatedPayment,
    invoice: updatedInvoice,
    state,
    actor: args.actor,
    guardian: args.guardian,
    receipts: args.receipts,
    at: args.at,
    notes: args.notes,
  });

  updatedPayment.receiptId = issue.receipt.id;
  updatedPayment.nomorKuitansi = issue.receipt.nomorKuitansi;

  return {
    ok: true,
    payment: updatedPayment,
    invoice: updatedInvoice,
    receipt: issue.receipt,
    state,
    createdReceipt: issue.created,
    noticeStatus: guardianNoticeStatus(updatedPayment, state),
    statusHistory: historyEntry({
      payment: updatedPayment,
      from: payment.status,
      to: 'terverifikasi',
      source,
      actor: args.actor,
      at: args.at,
      note: args.notes,
      key: `${updatedPayment.id}:terverifikasi`,
    }),
  };
}

export interface RejectPaymentArgs {
  paymentId: string;
  payments: Payment[];
  invoices: Invoice[];
  actor: TransactionActor;
  reason: string;
  at: Date;
  source?: PaymentVerificationSource;
}

export interface RejectPaymentResult {
  ok: boolean;
  error?: string;
  payment?: Payment;
  invoice?: Invoice;
  state?: InvoiceState;
  noticeStatus?: GuardianNoticeStatus;
  statusHistory?: PaymentStatusHistory;
}

export function rejectPaymentTransaction(args: RejectPaymentArgs): RejectPaymentResult {
  const found = findPaymentAndInvoice(args.paymentId, {
    paymentId: args.paymentId,
    payments: args.payments,
    invoices: args.invoices,
    receipts: [],
    actor: args.actor,
    at: args.at,
  });
  if ('error' in found) return { ok: false, error: found.error };
  const { payment, invoice } = found;

  if (payment.status !== 'menunggu_verifikasi') {
    return {
      ok: false,
      error: `Hanya pembayaran menunggu verifikasi yang dapat ditolak. Status saat ini: ${payment.status}.`,
    };
  }
  if (!args.reason.trim()) {
    return { ok: false, error: 'Alasan penolakan wajib diisi.' };
  }

  const atIso = args.at.toISOString();
  const updatedPayment: Payment = {
    ...payment,
    status: 'ditolak',
    diverifikasiOlehId: args.actor.id,
    diverifikasiOlehNama: args.actor.name,
    waktuVerifikasi: atIso,
    alasanPenolakan: args.reason.trim(),
    verificationSource: args.source || 'bendahara',
  };

  const updatedPayments = args.payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p));
  const state = computeInvoiceState(invoice, updatedPayments);
  const updatedInvoice = applyInvoiceState(invoice, state, atIso);

  return {
    ok: true,
    payment: updatedPayment,
    invoice: updatedInvoice,
    state,
    noticeStatus: 'ditolak',
    statusHistory: historyEntry({
      payment: updatedPayment,
      from: payment.status,
      to: 'ditolak',
      source: args.source || 'bendahara',
      actor: args.actor,
      at: args.at,
      note: args.reason,
      key: `${updatedPayment.id}:ditolak`,
    }),
  };
}

export interface CancelPaymentArgs {
  paymentId: string;
  payments: Payment[];
  invoices: Invoice[];
  receipts: Receipt[];
  actor: TransactionActor;
  reason: string;
  at: Date;
}

export interface CancelPaymentResult {
  ok: boolean;
  error?: string;
  payment?: Payment;
  invoice?: Invoice;
  receipt?: Receipt;
  state?: InvoiceState;
  noticeStatus?: GuardianNoticeStatus;
  statusHistory?: PaymentStatusHistory;
}

/**
 * Koreksi resmi: membatalkan pembayaran (pending atau sudah terverifikasi).
 * Kuitansi aktif ikut dibatalkan, nominal tidak lagi dihitung, dan audit log
 * mencatat alasannya. Tidak ada data yang dihapus.
 */
export function cancelPaymentTransaction(args: CancelPaymentArgs): CancelPaymentResult {
  const found = findPaymentAndInvoice(args.paymentId, {
    paymentId: args.paymentId,
    payments: args.payments,
    invoices: args.invoices,
    receipts: args.receipts,
    actor: args.actor,
    at: args.at,
  });
  if ('error' in found) return { ok: false, error: found.error };
  const { payment, invoice } = found;

  if (payment.status === 'dibatalkan') {
    return { ok: false, error: 'Pembayaran ini sudah dibatalkan.' };
  }
  if (!args.reason.trim()) {
    return { ok: false, error: 'Alasan pembatalan wajib diisi.' };
  }

  const atIso = args.at.toISOString();
  const updatedPayment: Payment = {
    ...payment,
    status: 'dibatalkan',
    cancelledAt: atIso,
    cancelledBy: args.actor.name,
    cancelReason: args.reason.trim(),
  };

  const activeReceipt = findActiveReceiptByPayment(args.receipts, payment.id);
  const cancelledReceipt = activeReceipt
    ? cancelReceiptRecord(activeReceipt, args.actor, args.reason.trim(), args.at)
    : undefined;

  const updatedPayments = args.payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p));
  const state = computeInvoiceState(invoice, updatedPayments);
  const updatedInvoice = applyInvoiceState(invoice, state, atIso);

  return {
    ok: true,
    payment: updatedPayment,
    invoice: updatedInvoice,
    receipt: cancelledReceipt,
    state,
    noticeStatus: 'dibatalkan',
    statusHistory: historyEntry({
      payment: updatedPayment,
      from: payment.status,
      to: 'dibatalkan',
      source: 'bendahara',
      actor: args.actor,
      at: args.at,
      note: args.reason,
      key: `${updatedPayment.id}:dibatalkan`,
    }),
  };
}

export interface ReissueReceiptArgs {
  receiptId: string;
  payments: Payment[];
  invoices: Invoice[];
  receipts: Receipt[];
  actor: TransactionActor;
  reason: string;
  at: Date;
}

export interface ReissueReceiptResult {
  ok: boolean;
  error?: string;
  oldReceipt?: Receipt;
  newReceipt?: Receipt;
}

/** Koreksi kuitansi: batalkan dokumen lama lalu terbitkan nomor baru. */
export function reissueReceiptTransaction(args: ReissueReceiptArgs): ReissueReceiptResult {
  const oldReceipt = args.receipts.find((r) => r.id === args.receiptId);
  if (!oldReceipt) return { ok: false, error: 'Kuitansi tidak ditemukan.' };
  if (!args.reason.trim()) return { ok: false, error: 'Alasan koreksi wajib diisi.' };

  const payment = args.payments.find((p) => p.id === oldReceipt.paymentId);
  if (!payment) return { ok: false, error: 'Pembayaran terkait kuitansi tidak ditemukan.' };
  if (payment.status !== 'terverifikasi') {
    return { ok: false, error: 'Kuitansi hanya dapat diterbitkan ulang untuk pembayaran terverifikasi.' };
  }
  const invoice = args.invoices.find((inv) => inv.id === oldReceipt.invoiceId);
  if (!invoice) return { ok: false, error: 'Tagihan terkait kuitansi tidak ditemukan.' };

  const state = computeInvoiceState(invoice, args.payments);
  const replacementId = `rec-${payment.id}-reissue-${args.at.getTime()}`;
  const markedOld = markReceiptReplaced(oldReceipt, replacementId, args.at);
  const receiptsWithoutOld = args.receipts.map((r) => (r.id === oldReceipt.id ? markedOld : r));

  const issue = issueReceiptForPayment({
    payment,
    invoice,
    state,
    actor: args.actor,
    guardian: { id: oldReceipt.guardianId, name: oldReceipt.guardianNama },
    receipts: receiptsWithoutOld,
    at: args.at,
    notes: `Penerbitan ulang koreksi: ${args.reason.trim()}`,
  });

  const newReceipt: Receipt = {
    ...issue.receipt,
    id: replacementId,
    originalReceiptId: oldReceipt.id,
  };

  return { ok: true, oldReceipt: markedOld, newReceipt };
}
