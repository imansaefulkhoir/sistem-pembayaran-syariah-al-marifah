import type { Invoice, Payment, Receipt, UserProfile } from '../types';
import { angkaKeTerbilang } from '../utils';
import type { InvoiceState } from './state';

/**
 * PENERBITAN KUITANSI (PURE / DETERMINISTIK).
 *
 * - Nomor kuitansi unik per bulan, dihitung dari nomor tertinggi yang sudah ada
 *   (bukan `length + 1`, agar tidak bentrok setelah ada pembatalan).
 * - Satu pembayaran hanya boleh memiliki satu kuitansi aktif.
 * - Kuitansi yang sudah terbit tidak diubah; koreksi dilakukan lewat
 *   pembatalan + penerbitan ulang yang tercatat di audit log.
 */

export function receiptIsActive(receipt: Receipt): boolean {
  return (receipt.status || 'aktif') === 'aktif';
}

export function findActiveReceiptByPayment(receipts: Receipt[], paymentId: string): Receipt | undefined {
  return receipts.find((r) => r.paymentId === paymentId && receiptIsActive(r));
}

export function findAnyReceiptByPayment(receipts: Receipt[], paymentId: string): Receipt | undefined {
  return receipts.find((r) => r.paymentId === paymentId);
}

function yearMonth(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Nomor kuitansi berikutnya. Memakai nomor tertinggi pada bulan berjalan,
 * sehingga nomor yang sudah dibatalkan tidak pernah dipakai ulang.
 */
export function nextReceiptNumber(receipts: Receipt[], at: Date): string {
  const prefix = `KWT-${yearMonth(at)}-`;
  let max = 0;
  for (const receipt of receipts) {
    const number = receipt.nomorKuitansi || '';
    if (!number.startsWith(prefix)) continue;
    const sequence = Number.parseInt(number.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > max) max = sequence;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export interface IssueReceiptInput {
  payment: Payment;
  invoice: Invoice;
  state: InvoiceState;
  actor: Pick<UserProfile, 'id' | 'name'>;
  guardian?: { id?: string; name?: string };
  receipts: Receipt[];
  at: Date;
  notes?: string;
}

export interface IssueReceiptResult {
  receipt: Receipt;
  created: boolean;
  existing?: Receipt;
}

/**
 * Terbitkan kuitansi untuk pembayaran yang sudah terverifikasi. Idempoten:
 * bila kuitansi aktif untuk pembayaran tersebut sudah ada, kuitansi itu
 * dikembalikan tanpa membuat dokumen baru.
 */
export function issueReceiptForPayment(input: IssueReceiptInput): IssueReceiptResult {
  const { payment, invoice, state, actor, receipts, at, notes } = input;

  const existing = findActiveReceiptByPayment(receipts, payment.id);
  if (existing) {
    return { receipt: existing, created: false, existing };
  }

  const isoDate = at.toISOString().split('T')[0];
  const nomorKuitansi = nextReceiptNumber(receipts, at);

  const receipt: Receipt = {
    id: `rec-${payment.id}-${at.getTime()}`,
    nomorKuitansi,
    paymentId: payment.id,
    invoiceId: invoice.id,
    studentId: invoice.studentId,
    studentNis: invoice.studentNis,
    studentNama: invoice.studentNama,
    studentKelas: invoice.studentKelas,
    studentUnit: invoice.studentUnit,
    kategoriNama: invoice.categoryNama,
    periode: invoice.periodeBulan,
    nominal: payment.nominal,
    terbilang: angkaKeTerbilang(payment.nominal),
    metodePembayaran: payment.metode,
    bankTujuan: payment.bankTujuan,
    tanggalBayar: payment.waktuPembayaran.split('T')[0] || isoDate,
    tanggalTerbit: isoDate,
    petugasNama: actor.name,
    catatan:
      notes ||
      (state.status === 'lunas'
        ? 'Pembayaran terverifikasi sah dan kewajiban tagihan telah terpenuhi.'
        : `Pembayaran terverifikasi sah. Sisa tagihan Rp ${state.sisaTagihan.toLocaleString('id-ID')}.`),
    barcodeQrData: `VERIFIED|${nomorKuitansi}|${payment.id}|${invoice.studentNis}`,
    status: 'aktif',
    guardianId: input.guardian?.id,
    guardianNama: input.guardian?.name,
    totalTagihan: state.totalTagihan,
    totalTerverifikasi: state.totalTerverifikasi,
    sisaTagihan: state.sisaTagihan,
    overpayment: state.overpayment,
    statusPembayaran: state.status === 'lunas' ? 'lunas' : 'sebagian',
    verifikator: actor.name,
    sistemVerifikator:
      payment.verificationSource === 'gateway'
        ? 'Gateway pembayaran (webhook tervalidasi)'
        : payment.verificationSource === 'kasir_tunai'
          ? 'Kasir tunai bendahara'
          : 'Bendahara pondok',
    createdAt: at.toISOString(),
  };

  return { receipt, created: true };
}

export function cancelReceiptRecord(
  receipt: Receipt,
  actor: Pick<UserProfile, 'id' | 'name'>,
  reason: string,
  at: Date
): Receipt {
  return {
    ...receipt,
    status: 'dibatalkan',
    cancelledAt: at.toISOString(),
    cancelledBy: actor.name,
    cancelReason: reason,
  };
}

export function markReceiptReplaced(receipt: Receipt, replacementId: string, at: Date): Receipt {
  return {
    ...receipt,
    status: 'diganti',
    replacedByReceiptId: replacementId,
    cancelledAt: at.toISOString(),
  };
}

export function receiptStatusLabel(receipt: Receipt): string {
  switch (receipt.status || 'aktif') {
    case 'dibatalkan':
      return 'Dibatalkan';
    case 'diganti':
      return 'Diganti (koreksi)';
    default:
      return receipt.statusPembayaran === 'sebagian' ? 'Sah — Dibayar Sebagian' : 'Sah — Lunas';
  }
}
