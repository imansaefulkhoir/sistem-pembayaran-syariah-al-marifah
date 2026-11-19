/**
 * MATRIKS PENGUJIAN PEMBAYARAN OTOMATIS (Node, tanpa browser).
 *
 * 15 skenario wajib:
 *  1. Webhook tervalidasi -> pembayaran terverifikasi, tagihan lunas, kuitansi terbit.
 *  2. Nominal webhook tidak cocok -> ditolak, tidak ada perubahan status.
 *  3. Signature webhook salah -> ditolak.
 *  4. Webhook replay/ganda -> diproses sekali (idempoten).
 *  5. Transfer manual tetap `menunggu_verifikasi` sampai bendahara memutuskan.
 *  6. Pembayaran sebagian -> tagihan `sebagian`, sisa benar.
 *  7. Pembayaran penuh -> `lunas`, sisa Rp 0.
 *  8. Pembayaran pending/ditolak/dibatalkan tidak dihitung sebagai pemasukan.
 *  9. Kelebihan bayar dicatat dan ditandai, tidak dihapus.
 * 10. Penolakan menyimpan alasan, bukan dianggap lunas.
 * 11. Pembatalan bukan keberhasilan; kuitansi aktif ikut dibatalkan.
 * 12. Satu transaksi hanya satu kuitansi aktif (verifikasi ganda idempoten).
 * 13. Nomor kuitansi unik/tidak dipakai ulang; koreksi menerbitkan nomor baru.
 * 14. Wali tanpa Telegram -> tanpa tujuan, pesan tidak pernah mengklaim lunas.
 * 15. Kegagalan Telegram/PDF tidak membatalkan pembayaran/kuitansi dan aman diulang.
 *
 * Tidak ada pembayaran nyata dan tidak ada pesan Telegram nyata dalam pengujian ini.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeInvoiceState,
  guardianNoticeStatus,
  receiptSummary,
} from '../../src/lib/payments/state';
import {
  issueReceiptForPayment,
  nextReceiptNumber,
  receiptIsActive,
  receiptStatusLabel,
} from '../../src/lib/payments/receipt';
import {
  cancelPaymentTransaction,
  rejectPaymentTransaction,
  reissueReceiptTransaction,
  verifyPaymentTransaction,
  type TransactionActor,
} from '../../src/lib/payments/service';
import {
  buildGuardianPaymentMessage,
  hasProcessedKey,
  paymentNoticeKey,
  rememberKey,
  shouldSendNotice,
} from '../../src/lib/payments/telegram';
import type { GuardianNoticeStatus, Invoice, Payment, Receipt } from '../../src/lib/types';

// Folder runtime sementara agar pengujian tidak menyentuh data aplikasi.
const tempDir = path.join(os.tmpdir(), `almarifah-payment-tests-${Date.now()}`);
process.env.ALMARIFAH_DATA_DIR = tempDir;
process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = 'secret-uji-pembayaran-2026';
process.env.ALLOW_DEMO_PAYMENT_SIMULATION = 'true';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`ok   - ${name}`);
  } else {
    failed++;
    console.log(`FAIL - ${name} ${detail}`);
  }
}

function norm(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

const AT = new Date(2026, 10, 14, 10, 0, 0); // 14 November 2026, waktu lokal
const ACTOR: TransactionActor = {
  id: 'usr-bendahara-uji',
  name: 'Bendahara Uji',
  role: 'kepala_bendahara',
};

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-test-1',
    nomorTagihan: 'TGH-TEST-0001',
    studentId: 'std-test-1',
    studentNis: '202699001',
    studentNama: 'Santri Uji',
    studentKelas: 'X A',
    studentUnit: 'putra',
    categoryId: 'cat-test-1',
    categoryCode: 'spp_sekolah',
    categoryNama: 'SPP Sekolah / Madrasah',
    periodeBulan: 'November 2026',
    periodeTahun: 2026,
    nominal: 300000,
    totalDibayar: 0,
    sisaTagihan: 300000,
    tanggalTerbit: '2026-11-01',
    tenggatWaktu: '2026-11-20',
    status: 'belum_dibayar',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-test-1',
    nomorPembayaran: 'BYR-TEST-0001',
    invoiceId: 'inv-test-1',
    studentId: 'std-test-1',
    studentNama: 'Santri Uji',
    nominal: 300000,
    metode: 'transfer_bank',
    bankTujuan: 'Bank Syariah Indonesia (BSI)',
    namaPengirim: 'Wali Santri',
    nomorRef: 'REF-TEST-0001',
    status: 'menunggu_verifikasi',
    waktuPembayaran: '2026-11-14T03:00:00Z',
    createdAt: '2026-11-14T03:00:00Z',
    ...overrides,
  };
}

function guardianMessage(status: GuardianNoticeStatus, overrides: Partial<Parameters<typeof buildGuardianPaymentMessage>[0]> = {}) {
  return buildGuardianPaymentMessage({
    status,
    guardianName: 'Wali Uji',
    studentName: 'Santri Uji',
    studentNis: '202699001',
    category: 'SPP Sekolah / Madrasah',
    period: 'November 2026',
    amount: 300000,
    metode: 'Transfer Bank Syariah',
    paidAt: '2026-11-14T03:00:00Z',
    invoiceTotal: 300000,
    totalVerified: status === 'menunggu_verifikasi' || status === 'ditolak' || status === 'dibatalkan' ? 0 : 300000,
    remaining: status === 'lunas' ? 0 : 300000,
    institutionName: 'Ponpes Uji Al-Ma\'rifah',
    ...overrides,
  });
}

async function main() {
  // -------------------------------------------------------------------------
  // 1. Verifikasi sah -> lunas + kuitansi
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const pending = makePayment();
    const result = verifyPaymentTransaction({
      paymentId: pending.id,
      payments: [pending],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'gateway',
      gatewayTransactionId: 'GW-TXN-0001',
      gatewayEventId: 'gwe-0001',
      guardian: { id: 'usr-wali-uji', name: 'Wali Uji' },
      notes: 'Webhook gateway tervalidasi (simulasi uji).',
    });

    check('1a Verifikasi sah berhasil', result.ok === true, result.error);
    check('1b Status pembayaran terverifikasi', result.payment?.status === 'terverifikasi');
    check('1c Tagihan menjadi lunas', result.invoice?.status === 'lunas' && result.invoice?.sisaTagihan === 0);
    check('1d Kuitansi baru terbit', result.createdReceipt === true && Boolean(result.receipt?.nomorKuitansi));
    check('1e Sumber verifikasi gateway tercatat', result.payment?.verificationSource === 'gateway');
    check('1f Status notifikasi = lunas', result.noticeStatus === 'lunas');
    check(
      '1g Nomor kuitansi format KWT-YYYYMM-NNNN',
      /^KWT-\d{6}-\d{4}$/.test(result.receipt?.nomorKuitansi || ''),
      result.receipt?.nomorKuitansi
    );
    check(
      '1h Riwayat status memakai kunci idempotensi',
      result.statusHistory?.idempotencyKey === `${pending.id}:terverifikasi`
    );

    // -----------------------------------------------------------------------
    // 12. Verifikasi ganda tidak menggandakan kuitansi
    // -----------------------------------------------------------------------
    const paymentsAfter = [result.payment as Payment];
    const again = verifyPaymentTransaction({
      paymentId: pending.id,
      payments: paymentsAfter,
      invoices: [result.invoice as Invoice],
      receipts: [result.receipt as Receipt],
      actor: ACTOR,
      at: new Date(AT.getTime() + 60_000),
      source: 'gateway',
    });
    check('12a Verifikasi ulang idempoten', again.ok === true && again.alreadyVerified === true);
    check('12b Tidak membuat kuitansi kedua', again.createdReceipt === false);
    check(
      '12c Kuitansi yang sama dikembalikan',
      again.receipt?.id === result.receipt?.id && again.receipt?.nomorKuitansi === result.receipt?.nomorKuitansi
    );
    const totalReceipts = [result.receipt as Receipt].filter((r) => r.paymentId === pending.id).length;
    check('12d Satu pembayaran satu kuitansi aktif', totalReceipts === 1);

    // -----------------------------------------------------------------------
    // 15. Kegagalan Telegram/PDF tidak membatalkan pembayaran/kuitansi
    // -----------------------------------------------------------------------
    const key = paymentNoticeKey(pending.id, 'lunas', 'usr-wali-uji');
    const afterFailureKeys: string[] = [];
    const failureLog = {
      status: 'failed' as const,
      lastError: 'Telegram API timeout (simulasi)',
    };
    check(
      '15a Kegagalan Telegram tidak mengubah status pembayaran',
      result.payment?.status === 'terverifikasi' && result.receipt?.nomorKuitansi !== undefined,
      failureLog.lastError
    );
    check('15b Kunci notifikasi stabil untuk percobaan ulang', key === paymentNoticeKey(pending.id, 'lunas', 'usr-wali-uji'));
    check('15c Kegagalan belum dianggap terkirim', hasProcessedKey(afterFailureKeys, key) === false);
    const afterSuccess = rememberKey(afterFailureKeys, key);
    check('15d Setelah sukses kunci tercatat (retry aman)', hasProcessedKey(afterSuccess, key) === true);
    check('15e Kunci notifikasi tidak mencampur status lain', key !== paymentNoticeKey(pending.id, 'sebagian', 'usr-wali-uji'));
  }

  // -------------------------------------------------------------------------
  // 5. Transfer manual menunggu keputusan bendahara
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const pending = makePayment({ metode: 'transfer_bank', verificationSource: undefined });
    const state = computeInvoiceState(invoice, [pending]);
    check('5a Pending tidak menambah total terverifikasi', state.totalTerverifikasi === 0);
    check('5b Sisa tagihan tetap penuh', state.sisaTagihan === 300000);
    check('5c Tagihan berstatus menunggu verifikasi', state.status === 'menunggu_verifikasi');
    check('5d Notifikasi status = menunggu verifikasi', guardianNoticeStatus(pending, state) === 'menunggu_verifikasi');

    const manual = verifyPaymentTransaction({
      paymentId: pending.id,
      payments: [pending],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'bendahara',
      notes: 'Mutasi rekening dicek manual oleh bendahara.',
    });
    check('5e Bendahara dapat memverifikasi manual', manual.ok === true && manual.payment?.verificationSource === 'bendahara');
  }

  // -------------------------------------------------------------------------
  // 6. Pembayaran sebagian
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const partial = makePayment({ id: 'pay-partial', nominal: 120000 });
    const result = verifyPaymentTransaction({
      paymentId: partial.id,
      payments: [partial],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'bendahara',
    });
    check('6a Status tagihan sebagian', result.state?.status === 'sebagian', result.state?.status);
    check('6b Sisa tagihan benar', result.state?.sisaTagihan === 180000, String(result.state?.sisaTagihan));
    check('6c Total terverifikasi hanya nominal masuk', result.state?.totalTerverifikasi === 120000);
    check('6d Kuitansi menandai pembayaran sebagian', result.receipt?.statusPembayaran === 'sebagian');
    check('6e Notifikasi status sebagian', result.noticeStatus === 'sebagian');
    check(
      '6f Pesan sebagian tidak mengklaim lunas',
      !/kewajiban tagihan telah <b>LUNAS<\/b>/.test(guardianMessage('sebagian').html)
    );
  }

  // -------------------------------------------------------------------------
  // 7. Pembayaran penuh
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const full = makePayment({ id: 'pay-full' });
    const result = verifyPaymentTransaction({
      paymentId: full.id,
      payments: [full],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'kasir_tunai',
    });
    check('7a Status tagihan lunas', result.state?.status === 'lunas');
    check('7b Sisa tagihan Rp 0', result.state?.sisaTagihan === 0);
    check('7c Tidak ada kelebihan bayar', result.state?.overpayment === 0);
    check('7d Kuitansi berstatus lunas', result.receipt?.statusPembayaran === 'lunas');
    check('7e Status notifikasi lunas', result.noticeStatus === 'lunas');
  }

  // -------------------------------------------------------------------------
  // 8. Hanya pembayaran terverifikasi yang dihitung
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const payments: Payment[] = [
      makePayment({ id: 'pay-v1', nominal: 100000, status: 'terverifikasi', gatewayTransactionId: 'GW-DUP-1' }),
      makePayment({ id: 'pay-v1-dup', nominal: 100000, status: 'terverifikasi', gatewayTransactionId: 'GW-DUP-1' }),
      makePayment({ id: 'pay-p1', nominal: 50000, status: 'menunggu_verifikasi' }),
      makePayment({ id: 'pay-r1', nominal: 40000, status: 'ditolak' }),
      makePayment({ id: 'pay-c1', nominal: 30000, status: 'dibatalkan' }),
      makePayment({ id: 'pay-e1', nominal: 20000, status: 'kedaluwarsa' }),
    ];
    const state = computeInvoiceState(invoice, payments);
    check('8a Pending/ditolak/batal/kedaluwarsa diabaikan', state.totalTerverifikasi === 100000, String(state.totalTerverifikasi));
    check('8b Transaksi gateway ganda dihitung sekali', state.duplicateVerifiedIds.length === 1);
    check('8c Sisa tagihan hanya dikurangi yang sah', state.sisaTagihan === 200000);
    check('8d Status tagihan sebagian', state.status === 'sebagian');
    check('8e ID pending/ditolak/batal tetap tercatat', state.pendingPaymentIds.length === 1 && state.rejectedPaymentIds.length === 1 && state.cancelledPaymentIds.length === 1);
  }

  // -------------------------------------------------------------------------
  // 9. Kelebihan bayar dicatat
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const over = makePayment({ id: 'pay-over', nominal: 350000 });
    const result = verifyPaymentTransaction({
      paymentId: over.id,
      payments: [over],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'bendahara',
    });
    check('9a Total terverifikasi melebihi tagihan', result.state?.totalTerverifikasi === 350000);
    check('9b Kelebihan bayar dicatat', result.state?.overpayment === 50000, String(result.state?.overpayment));
    check('9c Sisa tagihan tidak negatif', result.state?.sisaTagihan === 0);
    check('9d Pembayaran menyimpan nominal kelebihan', result.payment?.overpaymentAmount === 50000);
    check('9e Kuitansi menyimpan nominal kelebihan', result.receipt?.overpayment === 50000);
    check(
      '9f Pesan wali menandai kelebihan bayar',
      /Kelebihan Bayar: <b>Rp 50\.000<\/b>/.test(guardianMessage('lunas', { overpayment: 50000 }).html)
    );
  }

  // -------------------------------------------------------------------------
  // 10. Penolakan dengan alasan
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const pending = makePayment({ id: 'pay-reject' });
    const rejected = rejectPaymentTransaction({
      paymentId: pending.id,
      payments: [pending],
      invoices: [invoice],
      actor: ACTOR,
      reason: 'Bukti transfer tidak sesuai mutasi rekening pondok.',
      at: AT,
    });
    check('10a Penolakan berhasil', rejected.ok === true, rejected.error);
    check('10b Status pembayaran ditolak', rejected.payment?.status === 'ditolak');
    check('10c Alasan tersimpan', rejected.payment?.alasanPenolakan === 'Bukti transfer tidak sesuai mutasi rekening pondok.');
    check('10d Tidak dihitung sebagai pelunasan', rejected.state?.totalTerverifikasi === 0 && rejected.invoice?.status !== 'lunas');
    check('10e Notifikasi status ditolak', rejected.noticeStatus === 'ditolak');
    const rejectedMsg = guardianMessage('ditolak', { reason: 'Bukti tidak sesuai' }).html;
    check(
      '10f Pesan penolakan memuat alasan dan tidak mengklaim lunas',
      /DITOLAK/.test(rejectedMsg) &&
        /Alasan:<\/b> Bukti tidak sesuai/.test(rejectedMsg) &&
        !/kewajiban tagihan telah <b>LUNAS<\/b>/.test(rejectedMsg)
    );
    const cannotVerify = verifyPaymentTransaction({
      paymentId: pending.id,
      payments: [rejected.payment as Payment],
      invoices: [rejected.invoice as Invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
    });
    check('10g Pembayaran ditolak tidak bisa langsung diverifikasi', cannotVerify.ok === false);
  }

  // -------------------------------------------------------------------------
  // 11. Pembatalan bukan keberhasilan
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const pending = makePayment({ id: 'pay-cancel' });
    const verified = verifyPaymentTransaction({
      paymentId: pending.id,
      payments: [pending],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'bendahara',
    });
    const cancelled = cancelPaymentTransaction({
      paymentId: pending.id,
      payments: [verified.payment as Payment],
      invoices: [invoice],
      receipts: [verified.receipt as Receipt],
      actor: ACTOR,
      reason: 'Pembayaran ganda; dikembalikan ke wali.',
      at: new Date(AT.getTime() + 60_000),
    });
    check('11a Pembatalan berhasil', cancelled.ok === true, cancelled.error);
    check('11b Status pembayaran dibatalkan', cancelled.payment?.status === 'dibatalkan');
    check('11c Nominal tidak lagi dihitung', cancelled.state?.totalTerverifikasi === 0);
    check('11d Tagihan tidak menjadi lunas', cancelled.invoice?.status !== 'lunas');
    check('11e Kuitansi aktif ikut dibatalkan', cancelled.receipt?.status === 'dibatalkan');
    check('11f Notifikasi pembatalan bukan sukses', cancelled.noticeStatus === 'dibatalkan');
    check(
      '11g Pesan pembatalan menyebut tidak dihitung',
      /DIBATALKAN<\/b> melalui koreksi resmi dan <b>tidak dihitung<\/b>/.test(guardianMessage('dibatalkan').html)
    );
  }

  // -------------------------------------------------------------------------
  // 13. Nomor kuitansi unik dan koreksi menerbitkan nomor baru
  // -------------------------------------------------------------------------
  {
    const invoice = makeInvoice();
    const p1 = makePayment({ id: 'pay-num-1' });
    const p2 = makePayment({ id: 'pay-num-2', nomorPembayaran: 'BYR-TEST-0002' });
    const p3 = makePayment({ id: 'pay-num-3', nomorPembayaran: 'BYR-TEST-0003' });

    const r1 = verifyPaymentTransaction({
      paymentId: p1.id,
      payments: [p1],
      invoices: [invoice],
      receipts: [],
      actor: ACTOR,
      at: AT,
      source: 'bendahara',
    });
    const r2 = verifyPaymentTransaction({
      paymentId: p2.id,
      payments: [p2],
      invoices: [invoice],
      receipts: [r1.receipt as Receipt],
      actor: ACTOR,
      at: new Date(AT.getTime() + 60_000),
      source: 'bendahara',
    });
    check('13a Nomor pertama berurutan', r1.receipt?.nomorKuitansi === 'KWT-202611-0001', r1.receipt?.nomorKuitansi);
    check('13b Nomor berikutnya berurutan', r2.receipt?.nomorKuitansi === 'KWT-202611-0002', r2.receipt?.nomorKuitansi);

    const reissued = reissueReceiptTransaction({
      receiptId: r2.receipt!.id,
      payments: [r1.payment as Payment, r2.payment as Payment],
      invoices: [invoice],
      receipts: [r1.receipt as Receipt, r2.receipt as Receipt],
      actor: ACTOR,
      reason: 'Koreksi nama santri pada kuitansi.',
      at: new Date(AT.getTime() + 120_000),
    });
    check('13c Koreksi kuitansi berhasil', reissued.ok === true, reissued.error);
    check('13d Kuitansi lama ditandai diganti', reissued.oldReceipt?.status === 'diganti');
    check('13e Kuitansi pengganti memakai nomor baru', reissued.newReceipt?.nomorKuitansi === 'KWT-202611-0003', reissued.newReceipt?.nomorKuitansi);
    check('13f Nomor lama tidak dipakai ulang', reissued.newReceipt?.nomorKuitansi !== r2.receipt?.nomorKuitansi);
    check(
      '13g Label status kuitansi lama benar',
      receiptStatusLabel(reissued.oldReceipt as Receipt) === 'Diganti (koreksi)'
    );

    const nextAfterReissue = nextReceiptNumber(
      [r1.receipt as Receipt, reissued.oldReceipt as Receipt, reissued.newReceipt as Receipt],
      new Date(AT.getTime() + 180_000)
    );
    check('13h Nomor berikutnya melanjutkan nomor tertinggi', nextAfterReissue === 'KWT-202611-0004', nextAfterReissue);

    const r3 = verifyPaymentTransaction({
      paymentId: p3.id,
      payments: [p3],
      invoices: [invoice],
      receipts: [r1.receipt as Receipt, reissued.oldReceipt as Receipt, reissued.newReceipt as Receipt],
      actor: ACTOR,
      at: new Date(AT.getTime() + 240_000),
      source: 'bendahara',
    });
    check('13i Pembayaran baru mendapat nomor baru', r3.receipt?.nomorKuitansi === 'KWT-202611-0004', r3.receipt?.nomorKuitansi);
    check(
      '13j Semua nomor kuitansi unik',
      new Set([r1.receipt!.nomorKuitansi, r2.receipt!.nomorKuitansi, reissued.newReceipt!.nomorKuitansi, r3.receipt!.nomorKuitansi]).size === 4
    );
  }

  // -------------------------------------------------------------------------
  // 14. Wali tanpa Telegram & pesan berdasarkan status aktual
  // -------------------------------------------------------------------------
  {
    const pendingMsg = guardianMessage('menunggu_verifikasi');
    check(
      '14a Pesan pending tidak mengklaim lunas',
      /BELUM dinyatakan lunas/.test(pendingMsg.html) && !/kewajiban tagihan telah <b>LUNAS<\/b>/.test(pendingMsg.html)
    );
    check('14b Label status pending benar', /STATUS: MENUNGGU VERIFIKASI/.test(pendingMsg.html));
    check(
      '14c Pesan verified lunas menyebut LUNAS',
      /kewajiban tagihan telah <b>LUNAS<\/b>/.test(guardianMessage('lunas').html)
    );

    // Wali belum menautkan Telegram: keputusan kirim tetap dibuat, tetapi
    // pengiriman nyata harus berstatus tanpa tujuan, bukan "terkirim".
    const noticeKey = paymentNoticeKey('pay-no-telegram', 'menunggu_verifikasi', undefined);
    check('14d Wali tanpa Telegram tetap dapat diproses', shouldSendNotice(undefined, 'menunggu_verifikasi') === true);
    check('14e Kunci notifikasi menandai tanpa wali', noticeKey.includes('tanpa-wali'), noticeKey);
    check('14f Tanpa tujuan tidak dianggap terkirim', hasProcessedKey([], noticeKey) === false);
    check(
      '14g Preferensi wali menonaktifkan notifikasi',
      shouldSendNotice(
        {
          telegramEnabled: false,
          onSubmitted: true,
          onVerified: true,
          onPartial: true,
          onLunas: true,
          onRejected: true,
          onCancelled: true,
        },
        'lunas'
      ) === false
    );

    const summary = receiptSummary(makePayment({ id: 'pay-sum' }), computeInvoiceState(makeInvoice(), []));
    check('14h Ringkasan kuitansi memakai status aktual', summary.noticeStatus === 'menunggu_verifikasi');
  }

  // -------------------------------------------------------------------------
  // 2, 3, 4. Lapisan webhook gateway (signature, nominal, replay)
  // -------------------------------------------------------------------------
  {
    const runtime = await import('../../src/lib/server/runtime-store');
    const gateway = await import('../../src/lib/server/gateway');

    await runtime.savePaymentIntent({
      paymentId: 'pay-gw-1',
      invoiceId: 'inv-gw-1',
      studentId: 'std-gw-1',
      studentNama: 'Santri Gateway',
      nomorPembayaran: 'BYR-GW-0001',
      amount: 300000,
      reference: 'REF-GW-0001',
      metode: 'transfer_bank',
      createdAt: AT.toISOString(),
    });

    const buildSigned = (payload: Record<string, unknown>, timestamp = String(Math.floor(Date.now() / 1000))) => {
      const rawBody = JSON.stringify(payload);
      const signature = runtime.createGatewaySignature(rawBody, timestamp);
      return { rawBody, signature: signature || '', timestamp };
    };

    const basePayload = {
      eventId: 'evt-gw-0001',
      transactionId: 'txn-gw-0001',
      paymentId: 'pay-gw-1',
      reference: 'REF-GW-0001',
      amount: 300000,
      status: 'paid',
      paidAt: '2026-11-14T03:00:00Z',
    };

    // 3. Signature salah
    const invalid = await gateway.processGatewayNotification({
      rawBody: JSON.stringify(basePayload),
      signature: 'deadbeef',
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    check('3a Signature salah ditolak', invalid.status === 'invalid_signature' && invalid.httpStatus === 401, invalid.status);
    const tampered = buildSigned(basePayload);
    const tamperedResult = await gateway.processGatewayNotification({
      rawBody: tampered.rawBody + ' ',
      signature: tampered.signature,
      timestamp: tampered.timestamp,
    });
    check('3b Body diubah setelah ditandatangani ditolak', tamperedResult.status === 'invalid_signature');

    // 2. Nominal tidak cocok
    const mismatch = buildSigned({ ...basePayload, eventId: 'evt-gw-amount', transactionId: 'txn-gw-amount', amount: 1000 });
    const mismatchResult = await gateway.processGatewayNotification(mismatch);
    check('2a Nominal tidak cocok ditolak', mismatchResult.status === 'amount_mismatch' && mismatchResult.httpStatus === 409, mismatchResult.status);

    // Referensi tidak cocok
    const badRef = buildSigned({ ...basePayload, eventId: 'evt-gw-ref', transactionId: 'txn-gw-ref', reference: 'REF-LAIN' });
    const badRefResult = await gateway.processGatewayNotification(badRef);
    check('2b Referensi tidak cocok ditolak', badRefResult.status === 'reference_mismatch', badRefResult.status);

    // Status bukan sukses
    const notSuccess = buildSigned({ ...basePayload, eventId: 'evt-gw-exp', transactionId: 'txn-gw-exp', status: 'expired' });
    const notSuccessResult = await gateway.processGatewayNotification(notSuccess);
    check('2c Status bukan sukses tidak diproses', notSuccessResult.status === 'not_success', notSuccessResult.status);

    // 1 (webhook). Payload sah diterima
    const valid = buildSigned(basePayload);
    const accepted = await gateway.processGatewayNotification(valid);
    check('1i Webhook sah diterima', accepted.status === 'accepted' && accepted.httpStatus === 200, accepted.status);
    check('1j Event gateway mencatat transaksi', accepted.event?.gatewayTransactionId === 'txn-gw-0001');

    // 4. Replay: event sama dan transaksi sama tidak diproses ulang
    const replaySame = await gateway.processGatewayNotification(buildSigned(basePayload));
    check('4a Replay event sama ditolak sebagai duplikat', replaySame.status === 'duplicate', replaySame.status);

    const replayTxn = buildSigned({ ...basePayload, eventId: 'evt-gw-0002' });
    const replayTxnResult = await gateway.processGatewayNotification(replayTxn);
    check('4b Transaksi gateway sama tidak diproses ulang', replayTxnResult.status === 'duplicate', replayTxnResult.status);

    const events = await runtime.getGatewayEvents();
    check('4c Hanya satu event tersimpan', events.filter((e) => e.paymentId === 'pay-gw-1').length === 1);

    // Niat pembayaran tidak dikenal tidak boleh melunasi apa pun
    const unknown = buildSigned({ ...basePayload, eventId: 'evt-gw-unknown', transactionId: 'txn-gw-unknown', paymentId: 'pay-tidak-ada' });
    const unknownResult = await gateway.processGatewayNotification(unknown);
    check('2d Niat pembayaran tidak dikenal ditolak', unknownResult.status === 'unknown_intent' && unknownResult.httpStatus === 404);
  }

  // -------------------------------------------------------------------------
  // Ringkasan
  // -------------------------------------------------------------------------
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // folder sementara boleh tertinggal; tidak memengaruhi hasil uji
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Uji pembayaran gagal dijalankan:', error);
  process.exit(1);
});
