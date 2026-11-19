import type {
  GuardianNoticeStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentReceiptSummary,
} from '../types';

/**
 * PERHITUNGAN STATUS TAGIHAN (PURE / DETERMINISTIK).
 *
 * Aturan bisnis:
 * - Hanya pembayaran `terverifikasi` yang dihitung sebagai pelunasan.
 * - `menunggu_verifikasi`, `ditolak`, `dibatalkan`, dan `kedaluwarsa` TIDAK dihitung.
 * - Pembayaran ganda (ID sama atau gateway transaction ID sama) hanya dihitung sekali.
 * - Sisa tagihan tidak pernah negatif; kelebihan bayar dicatat terpisah.
 * - Tagihan `dibatalkan` tidak diubah oleh mesin pembayaran.
 */

export interface InvoiceState {
  invoiceId: string;
  totalTagihan: number;
  totalTerverifikasi: number;
  sisaTagihan: number;
  overpayment: number;
  status: InvoiceStatus;
  verifiedPaymentIds: string[];
  pendingPaymentIds: string[];
  rejectedPaymentIds: string[];
  cancelledPaymentIds: string[];
  duplicateVerifiedIds: string[];
}

function uniqueVerifiedPayments(payments: Payment[]): {
  unique: Payment[];
  duplicates: string[];
} {
  const seenPaymentIds = new Set<string>();
  const seenGatewayIds = new Set<string>();
  const unique: Payment[] = [];
  const duplicates: string[] = [];

  for (const payment of payments) {
    if (seenPaymentIds.has(payment.id)) {
      duplicates.push(payment.id);
      continue;
    }
    if (payment.gatewayTransactionId) {
      const key = `gateway:${payment.gatewayTransactionId}`;
      if (seenGatewayIds.has(key)) {
        duplicates.push(payment.id);
        continue;
      }
      seenGatewayIds.add(key);
    }
    seenPaymentIds.add(payment.id);
    unique.push(payment);
  }

  return { unique, duplicates };
}

export function computeInvoiceState(invoice: Invoice, payments: Payment[]): InvoiceState {
  const related = payments.filter((p) => p.invoiceId === invoice.id && p.studentId === invoice.studentId);
  const verifiedRelated = related.filter((p) => p.status === 'terverifikasi');
  const { unique, duplicates } = uniqueVerifiedPayments(verifiedRelated);

  const totalTerverifikasi = unique.reduce((sum, p) => sum + Math.max(0, p.nominal), 0);
  const sisaTagihan = Math.max(0, invoice.nominal - totalTerverifikasi);
  const overpayment = Math.max(0, totalTerverifikasi - invoice.nominal);

  let status: InvoiceStatus;
  if (invoice.status === 'dibatalkan') {
    status = 'dibatalkan';
  } else if (invoice.nominal <= 0 || totalTerverifikasi >= invoice.nominal) {
    status = 'lunas';
  } else if (totalTerverifikasi > 0) {
    status = 'sebagian';
  } else if (related.some((p) => p.status === 'menunggu_verifikasi')) {
    // Mempertahankan perilaku UI lama: ada bukti menunggu -> bukan lunas.
    status = 'menunggu_verifikasi';
  } else {
    status = 'belum_dibayar';
  }

  return {
    invoiceId: invoice.id,
    totalTagihan: invoice.nominal,
    totalTerverifikasi,
    sisaTagihan,
    overpayment,
    status,
    verifiedPaymentIds: unique.map((p) => p.id),
    pendingPaymentIds: related.filter((p) => p.status === 'menunggu_verifikasi').map((p) => p.id),
    rejectedPaymentIds: related.filter((p) => p.status === 'ditolak').map((p) => p.id),
    cancelledPaymentIds: related.filter((p) => p.status === 'dibatalkan').map((p) => p.id),
    duplicateVerifiedIds: duplicates,
  };
}

/** Terapkan hasil hitung ke objek invoice (tanpa mengubah objek asli). */
export function applyInvoiceState(invoice: Invoice, state: InvoiceState, at: string): Invoice {
  return {
    ...invoice,
    totalDibayar: state.totalTerverifikasi,
    sisaTagihan: state.sisaTagihan,
    status: state.status,
    updatedAt: at,
  };
}

/**
 * Status notifikasi yang benar-benar dikirim ke wali. Status ini berasal dari
 * status pembayaran + kondisi tagihan setelah pembayaran tersebut dihitung.
 */
export function guardianNoticeStatus(payment: Payment, state: InvoiceState): GuardianNoticeStatus {
  if (payment.status === 'ditolak') return 'ditolak';
  if (payment.status === 'dibatalkan') return 'dibatalkan';
  if (payment.status === 'kedaluwarsa') return 'dibatalkan';
  if (payment.status === 'menunggu_verifikasi') return 'menunggu_verifikasi';
  if (payment.status === 'terverifikasi') {
    return state.status === 'lunas' ? 'lunas' : 'sebagian';
  }
  return 'menunggu_verifikasi';
}

export function receiptSummary(payment: Payment, state: InvoiceState): PaymentReceiptSummary {
  return {
    invoiceTotal: state.totalTagihan,
    totalVerified: state.totalTerverifikasi,
    remaining: state.sisaTagihan,
    overpayment: state.overpayment,
    invoiceStatus: state.status,
    noticeStatus: guardianNoticeStatus(payment, state),
  };
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  belum_dibayar: 'Belum Dibayar',
  menunggu_verifikasi: 'Menunggu Verifikasi',
  sebagian: 'Dibayar Sebagian',
  lunas: 'Lunas',
  dibatalkan: 'Dibatalkan',
};

export const NOTICE_STATUS_LABEL: Record<GuardianNoticeStatus, string> = {
  menunggu_verifikasi: 'Menunggu Verifikasi',
  terverifikasi: 'Terverifikasi',
  sebagian: 'Dibayar Sebagian',
  lunas: 'Lunas',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
};
