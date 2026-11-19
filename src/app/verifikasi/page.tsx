'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import {
  GuardianContact,
  Invoice,
  Payment,
  PaymentStatusHistory,
  Receipt,
  TelegramDeliveryLog,
  UserProfile,
} from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatRupiah, formatDateTimeIndo, formatDateIndo } from '@/lib/utils';
import { NOTICE_STATUS_LABEL, INVOICE_STATUS_LABEL } from '@/lib/payments/state';
import { receiptStatusLabel } from '@/lib/payments/receipt';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  FileCheck2,
  FileText,
  Link as LinkIcon,
  Receipt as ReceiptIcon,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';

type Tab = 'pembayaran' | 'tagihan' | 'kuitansi' | 'telegram';

const PAYMENT_FILTERS = [
  { value: 'semua', label: 'Semua' },
  { value: 'menunggu_verifikasi', label: 'Menunggu' },
  { value: 'terverifikasi', label: 'Terverifikasi' },
  { value: 'ditolak', label: 'Ditolak' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
];

function deliveryBadge(status?: TelegramDeliveryLog['status']) {
  if (!status) return { label: 'Belum ada', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  switch (status) {
    case 'sent':
      return { label: 'Terkirim', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'failed':
      return { label: 'Gagal', className: 'bg-red-50 text-red-700 border-red-200' };
    case 'no_destination':
      return { label: 'Telegram belum tertaut', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'skipped':
      return { label: 'Dinonaktifkan wali', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'duplicate':
      return { label: 'Duplikat dicegah', className: 'bg-sky-50 text-sky-700 border-sky-200' };
    default:
      return { label: 'Menunggu', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
}

export default function VerifikasiPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [deliveries, setDeliveries] = useState<TelegramDeliveryLog[]>([]);
  const [history, setHistory] = useState<PaymentStatusHistory[]>([]);
  const [guardiansWithoutTelegram, setGuardiansWithoutTelegram] = useState<GuardianContact[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pembayaran');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadData = () => {
    setUser(store.getCurrentUser());
    setPayments(store.getPayments());
    setInvoices(store.getInvoices());
    setReceipts(store.getReceipts());
    setDeliveries(store.getTelegramDeliveries());
    setHistory(store.getPaymentStatusHistory());
    setGuardiansWithoutTelegram(store.getGuardiansWithoutTelegram());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const invoiceById = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((invoice) => map.set(invoice.id, invoice));
    return map;
  }, [invoices]);

  const deliveryByPayment = useMemo(() => {
    const map = new Map<string, TelegramDeliveryLog>();
    deliveries.forEach((delivery) => {
      if (!map.has(delivery.paymentId)) map.set(delivery.paymentId, delivery);
    });
    return map;
  }, [deliveries]);

  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (values: Array<string | number | undefined>) => {
    if (!normalizedSearch) return true;
    return values.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
  };

  const pendingPayments = payments.filter((p) => p.status === 'menunggu_verifikasi');
  const verifiedPayments = payments.filter((p) => p.status === 'terverifikasi');
  const filteredPayments = payments.filter((p) => {
    const invoice = invoiceById.get(p.invoiceId);
    const receipt = receipts.find((r) => r.paymentId === p.id);
    const statusOk = statusFilter === 'semua' || p.status === statusFilter;
    return (
      statusOk &&
      matchesSearch([
        p.nomorPembayaran,
        p.studentNama,
        p.namaPengirim,
        p.nomorRef,
        p.status,
        invoice?.studentNis,
        invoice?.nomorTagihan,
        invoice?.periodeBulan,
        invoice?.categoryNama,
        receipt?.nomorKuitansi,
      ])
    );
  });

  const filteredInvoices = invoices.filter((invoice) =>
    matchesSearch([
      invoice.nomorTagihan,
      invoice.studentNama,
      invoice.studentNis,
      invoice.periodeBulan,
      invoice.categoryNama,
      invoice.status,
    ])
  );

  const filteredReceipts = receipts.filter((receipt) =>
    matchesSearch([
      receipt.nomorKuitansi,
      receipt.studentNama,
      receipt.studentNis,
      receipt.periode,
      receipt.kategoriNama,
      receipt.status,
    ])
  );

  const filteredDeliveries = deliveries.filter((delivery) =>
    matchesSearch([
      delivery.studentNama,
      delivery.studentNis,
      delivery.nomorKuitansi,
      delivery.noticeStatus,
      delivery.status,
      delivery.guardianName,
      delivery.lastError,
    ])
  );

  const totalPending = pendingPayments.reduce((sum, payment) => sum + payment.nominal, 0);
  const totalVerified = verifiedPayments.reduce((sum, payment) => sum + payment.nominal, 0);
  const partialInvoices = invoices.filter((invoice) => invoice.status === 'sebagian');
  const lunasInvoices = invoices.filter((invoice) => invoice.status === 'lunas');
  const unpaidInvoices = invoices.filter(
    (invoice) => invoice.status !== 'lunas' && invoice.status !== 'dibatalkan' && invoice.sisaTagihan > 0
  );
  const failedDeliveries = deliveries.filter((d) => d.status === 'failed' || d.status === 'no_destination');
  const activeReceipts = receipts.filter((r) => (r.status || 'aktif') === 'aktif');

  const canVerify = ['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '');

  const openInspect = (payment: Payment) => {
    setSelectedPayment(payment);
    setNotes('Mutasi dana telah dicocokkan dengan rekening BSI/BCA Syariah pondok.');
    setRejectionReason('');
    setIsRejecting(false);
    setFeedbackMsg(null);
  };

  const handleApprove = () => {
    if (!selectedPayment) return;
    const res = store.verifyPayment(selectedPayment.id, true, notes);
    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Pembayaran ${selectedPayment.nomorPembayaran} diverifikasi. Status tagihan dihitung ulang (lunas/sebagian) dan kuitansi unik diterbitkan. Notifikasi wali diproses terpisah; kegagalan Telegram tidak membatalkan pembayaran.`,
      });
      loadData();
      setTimeout(() => setSelectedPayment(null), 1800);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Gagal memverifikasi.' });
    }
  };

  const handleReject = () => {
    if (!selectedPayment) return;
    if (!rejectionReason.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Alasan penolakan wajib diisi.' });
      return;
    }
    const res = store.verifyPayment(selectedPayment.id, false, rejectionReason);
    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Pembayaran ${selectedPayment.nomorPembayaran} ditolak. Pembayaran ini TIDAK dihitung sebagai pelunasan dan alasan dikirim ke wali.`,
      });
      loadData();
      setTimeout(() => setSelectedPayment(null), 1800);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Gagal menolak.' });
    }
  };

  const handleCancelPayment = (payment: Payment) => {
    const reason = window.prompt(
      `Alasan koreksi/pembatalan pembayaran ${payment.nomorPembayaran} (tercatat di audit log):`
    );
    if (!reason?.trim()) return;
    const res = store.cancelPayment(payment.id, reason.trim());
    setFeedbackMsg({
      type: res.success ? 'success' : 'error',
      text: res.success
        ? `Pembayaran ${payment.nomorPembayaran} dibatalkan. Kuitansi aktif (jika ada) ikut dibatalkan dan nominal tidak dihitung lagi.`
        : res.error || 'Gagal membatalkan pembayaran.',
    });
    loadData();
  };

  const handleCancelReceipt = (receipt: Receipt) => {
    const reason = window.prompt(`Alasan pembatalan kuitansi ${receipt.nomorKuitansi}:`);
    if (!reason?.trim()) return;
    const res = store.cancelReceipt(receipt.id, reason.trim());
    setFeedbackMsg({
      type: res.success ? 'success' : 'error',
      text: res.success
        ? `Kuitansi ${receipt.nomorKuitansi} dibatalkan (dokumen lama tetap tersimpan untuk audit).`
        : res.error || 'Gagal membatalkan kuitansi.',
    });
    loadData();
  };

  const handleReissueReceipt = (receipt: Receipt) => {
    const reason = window.prompt(`Alasan koreksi kuitansi ${receipt.nomorKuitansi} (nomor baru akan diterbitkan):`);
    if (!reason?.trim()) return;
    const res = store.reissueReceipt(receipt.id, reason.trim());
    setFeedbackMsg({
      type: res.success ? 'success' : 'error',
      text: res.success
        ? `Kuitansi koreksi diterbitkan dengan nomor baru. Kuitansi lama ditandai "diganti" dan tidak dapat dipakai ulang.`
        : res.error || 'Gagal menerbitkan ulang kuitansi.',
    });
    loadData();
  };

  const handleRetryDelivery = async (delivery: TelegramDeliveryLog) => {
    setBusy(delivery.id);
    const result = await store.retryTelegramNotification(delivery.id);
    setBusy(null);
    setFeedbackMsg({
      type: result.ok ? 'success' : 'error',
      text: result.ok
        ? `Notifikasi ${delivery.studentNama} berhasil dikirim ulang.`
        : result.message || 'Pengiriman ulang belum berhasil; pembayaran dan kuitansi tidak berubah.',
    });
    loadData();
  };

  const handleSimulateGateway = async (paymentId: string) => {
    setBusy(paymentId);
    const result = await store.simulateGatewayConfirmation(paymentId);
    setBusy(null);
    setFeedbackMsg({ type: result.success ? 'success' : 'error', text: result.message });
    loadData();
  };

  const handleSyncGateway = async () => {
    setBusy('sync');
    const result = await store.syncGatewayEvents();
    setBusy(null);
    setFeedbackMsg({
      type: result.applied > 0 ? 'success' : 'error',
      text:
        result.applied > 0
          ? `${result.applied} event gateway diterapkan melalui mesin verifikasi yang sama.`
          : result.messages[0] || 'Tidak ada event gateway baru yang dapat diterapkan.',
    });
    loadData();
  };

  if (user && !canVerify) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center bg-white border border-red-200 rounded-2xl space-y-3">
        <ShieldCheck className="w-10 h-10 text-red-500 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900">Akses Ditolak</h1>
        <p className="text-sm text-slate-600">
          Pusat verifikasi pembayaran hanya untuk Kepala Bendahara dan Admin Bendahara.
        </p>
        <Link href="/dashboard" className="text-sm font-bold text-emerald-700 hover:underline">
          Kembali ke dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Pusat Pembayaran &amp; Kuitansi Digital
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              {pendingPayments.length} menunggu
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
              {activeReceipts.length} kuitansi aktif
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Hanya pembayaran <strong>terverifikasi</strong> yang dihitung sebagai pendapatan/pelunasan.
            Transfer manual tetap menunggu sampai bendahara memeriksa mutasi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncGateway}
            disabled={busy === 'sync'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />
            Sinkronkan Event Gateway
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Menunggu</div>
          <div className="text-lg font-extrabold text-amber-700">{pendingPayments.length}</div>
          <div className="text-[10px] text-slate-500">{formatRupiah(totalPending)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Terverifikasi</div>
          <div className="text-lg font-extrabold text-emerald-700">{verifiedPayments.length}</div>
          <div className="text-[10px] text-slate-500">{formatRupiah(totalVerified)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Tagihan Sebagian</div>
          <div className="text-lg font-extrabold text-sky-700">{partialInvoices.length}</div>
          <div className="text-[10px] text-slate-500">Belum lunas</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Tagihan Lunas</div>
          <div className="text-lg font-extrabold text-emerald-700">{lunasInvoices.length}</div>
          <div className="text-[10px] text-slate-500">Sisa Rp 0</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Belum Lunas / Tunggakan</div>
          <div className="text-lg font-extrabold text-rose-700">{unpaidInvoices.length}</div>
          <div className="text-[10px] text-slate-500">
            {formatRupiah(unpaidInvoices.reduce((sum, invoice) => sum + invoice.sisaTagihan, 0))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Telegram Bermasalah</div>
          <div className="text-lg font-extrabold text-rose-700">{failedDeliveries.length}</div>
          <div className="text-[10px] text-slate-500">Gagal / belum tertaut</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs">
        <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['pembayaran', 'Pembayaran', FileCheck2],
                ['tagihan', 'Tagihan', Wallet],
                ['kuitansi', 'Kuitansi', ReceiptIcon],
                ['telegram', 'Telegram', Send],
              ] as Array<[Tab, string, React.ComponentType<{ className?: string }>]>
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === value
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {value === 'telegram' && failedDeliveries.length > 0 && (
                  <span className="px-1.5 rounded-full bg-rose-500 text-white text-[9px]">
                    {failedDeliveries.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {activeTab === 'pembayaran' && (
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-300"
              >
                {PAYMENT_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari santri, NIS, transaksi, kuitansi, periode..."
                className="w-full sm:w-80 pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {activeTab === 'pembayaran' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
                <tr>
                  <th className="px-3 py-3">Transaksi</th>
                  <th className="px-3 py-3">Santri / Tagihan</th>
                  <th className="px-3 py-3">Nominal</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Sumber</th>
                  <th className="px-3 py-3">Kuitansi</th>
                  <th className="px-3 py-3">Telegram</th>
                  <th className="px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Tidak ada pembayaran yang cocok dengan pencarian/filter.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const invoice = invoiceById.get(payment.invoiceId);
                    const delivery = deliveryByPayment.get(payment.id);
                    const badge = deliveryBadge(delivery?.status);
                    const receipt = receipts.find((r) => r.paymentId === payment.id);
                    return (
                      <tr key={payment.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-3">
                          <div className="font-bold text-slate-900">{payment.nomorPembayaran}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatDateTimeIndo(payment.waktuPembayaran)}
                          </div>
                          <div className="text-[10px] text-slate-500">{payment.metode.replace(/_/g, ' ')}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-slate-800">{payment.studentNama}</div>
                          <div className="text-[10px] text-slate-400">
                            NIS {invoice?.studentNis || '-'} • {invoice?.periodeBulan || '-'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {invoice?.nomorTagihan || '-'} • {invoice?.categoryNama || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-extrabold text-emerald-800">
                          {formatRupiah(payment.nominal)}
                          {(payment.overpaymentAmount || 0) > 0 && (
                            <div className="text-[10px] text-amber-700 font-semibold">
                              Lebih {formatRupiah(payment.overpaymentAmount || 0)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={payment.status} />
                        </td>
                        <td className="px-3 py-3 text-[10px] text-slate-600">
                          {payment.verificationSource === 'gateway'
                            ? 'Gateway tervalidasi'
                            : payment.verificationSource === 'kasir_tunai'
                              ? 'Kasir tunai'
                              : payment.verificationSource === 'bendahara'
                                ? 'Bendahara'
                                : payment.gatewayTransactionId
                                  ? 'Gateway'
                                  : 'Manual'}
                          {payment.gatewayEventId && (
                            <div className="text-slate-400 truncate max-w-[120px]">{payment.gatewayEventId}</div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {receipt ? (
                            <Link
                              href={`/kuitansi/${receipt.id}`}
                              className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                            >
                              <ReceiptIcon className="w-3.5 h-3.5" />
                              {receipt.nomorKuitansi}
                            </Link>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                            {badge.label}
                          </span>
                          {delivery?.lastError && (
                            <div className="text-[10px] text-slate-500 mt-1 max-w-[150px] truncate" title={delivery.lastError}>
                              {delivery.lastError}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {payment.status === 'menunggu_verifikasi' && canVerify && (
                              <button
                                onClick={() => openInspect(payment)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white"
                              >
                                <Eye className="w-3 h-3" />
                                Periksa
                              </button>
                            )}
                            {payment.status === 'menunggu_verifikasi' &&
                              payment.metode !== 'tunai' &&
                              canVerify && (
                                <button
                                  onClick={() => handleSimulateGateway(payment.id)}
                                  disabled={busy === payment.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                                  title="Simulasi lokal: hanya aktif jika ALLOW_DEMO_PAYMENT_SIMULATION=true atau bukan production."
                                >
                                  <Zap className="w-3 h-3" />
                                  {busy === payment.id ? 'Proses...' : 'Simulasi Gateway'}
                                </button>
                              )}
                            {payment.status !== 'dibatalkan' && canVerify && (
                              <button
                                onClick={() => handleCancelPayment(payment)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-rose-50 text-rose-700 border border-slate-200"
                              >
                                <Ban className="w-3 h-3" />
                                Koreksi
                              </button>
                            )}
                            {delivery &&
                              (delivery.status === 'failed' ||
                                delivery.status === 'no_destination' ||
                                delivery.status === 'skipped') && (
                                <button
                                  onClick={() => handleRetryDelivery(delivery)}
                                  disabled={busy === delivery.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 disabled:opacity-50"
                                >
                                  <RefreshCw className={`w-3 h-3 ${busy === delivery.id ? 'animate-spin' : ''}`} />
                                  Kirim Ulang
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'tagihan' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
                <tr>
                  <th className="px-3 py-3">No. Tagihan</th>
                  <th className="px-3 py-3">Santri</th>
                  <th className="px-3 py-3">Periode / Kategori</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Terverifikasi</th>
                  <th className="px-3 py-3">Sisa</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Tidak ada tagihan yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.slice(0, 200).map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{invoice.nomorTagihan}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{invoice.studentNama}</div>
                        <div className="text-[10px] text-slate-400">NIS {invoice.studentNis}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {invoice.periodeBulan}
                        <div className="text-[10px] text-slate-500">{invoice.categoryNama}</div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold">{formatRupiah(invoice.nominal)}</td>
                      <td className="px-3 py-2.5 text-emerald-700 font-bold">
                        {formatRupiah(invoice.totalDibayar)}
                      </td>
                      <td className="px-3 py-2.5 text-rose-700 font-bold">
                        {formatRupiah(invoice.sisaTagihan)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={invoice.status} />
                        <div className="text-[10px] text-slate-400 mt-1">
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'kuitansi' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
                <tr>
                  <th className="px-3 py-3">No. Kuitansi</th>
                  <th className="px-3 py-3">Santri / NIS</th>
                  <th className="px-3 py-3">Pembayaran</th>
                  <th className="px-3 py-3">Nominal</th>
                  <th className="px-3 py-3">Status Dokumen</th>
                  <th className="px-3 py-3">Terbit</th>
                  <th className="px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Belum ada kuitansi yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((receipt) => {
                    const isActive = (receipt.status || 'aktif') === 'aktif';
                    return (
                      <tr key={receipt.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-bold text-slate-900">{receipt.nomorKuitansi}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold">{receipt.studentNama}</div>
                          <div className="text-[10px] text-slate-400">NIS {receipt.studentNis}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          {receipt.kategoriNama}
                          <div className="text-[10px] text-slate-500">{receipt.periode}</div>
                        </td>
                        <td className="px-3 py-2.5 font-bold">{formatRupiah(receipt.nominal)}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : receipt.status === 'diganti'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {receiptStatusLabel(receipt)}
                          </span>
                          {receipt.cancelReason && (
                            <div className="text-[10px] text-slate-500 mt-1">{receipt.cancelReason}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {formatDateIndo(receipt.tanggalTerbit)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link
                              href={`/kuitansi/${receipt.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                            >
                              <FileText className="w-3 h-3" />
                              Lihat
                            </Link>
                            {isActive && canVerify && (
                              <>
                                <button
                                  onClick={() => handleReissueReceipt(receipt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Koreksi
                                </button>
                                <button
                                  onClick={() => handleCancelReceipt(receipt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                >
                                  <Ban className="w-3 h-3" />
                                  Batalkan
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'telegram' && (
          <div className="divide-y divide-slate-100">
            <div className="p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600" />
                Wali Terverifikasi Tanpa Telegram ({guardiansWithoutTelegram.length})
              </h3>
              {guardiansWithoutTelegram.length === 0 ? (
                <p className="text-xs text-slate-500">Semua wali terverifikasi sudah menautkan Telegram.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {guardiansWithoutTelegram.map((guardian) => (
                    <div
                      key={guardian.id}
                      className="p-3 rounded-lg border border-amber-200 bg-amber-50/60 flex items-start justify-between gap-2"
                    >
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">{guardian.name}</div>
                        <div className="text-slate-600">WA: {guardian.whatsapp || '-'}</div>
                        <div className="text-[10px] text-slate-500">
                          {guardian.linkedStudentIds.length} santri terhubung
                        </div>
                      </div>
                      <Link
                        href="/wali"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 hover:underline"
                      >
                        <LinkIcon className="w-3 h-3" />
                        Tautkan
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
                  <tr>
                    <th className="px-3 py-3">Waktu</th>
                    <th className="px-3 py-3">Wali / Santri</th>
                    <th className="px-3 py-3">Status Notifikasi</th>
                    <th className="px-3 py-3">Pengiriman</th>
                    <th className="px-3 py-3">PDF</th>
                    <th className="px-3 py-3">Catatan</th>
                    <th className="px-3 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                        Belum ada riwayat notifikasi Telegram.
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((delivery) => {
                      const badge = deliveryBadge(delivery.status);
                      return (
                        <tr key={delivery.id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatDateTimeIndo(delivery.createdAt)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-800">
                              {delivery.guardianName || 'Wali belum tertaut'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {delivery.studentNama} • NIS {delivery.studentNis || '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {NOTICE_STATUS_LABEL[delivery.noticeStatus] || delivery.noticeStatus}
                            {delivery.nomorKuitansi && (
                              <div className="text-[10px] text-emerald-700">{delivery.nomorKuitansi}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                              {badge.label}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {delivery.attempts} percobaan
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[10px] text-slate-600">
                            {delivery.receiptAttached
                              ? 'PDF terkirim'
                              : delivery.fallbackLinkUsed
                                ? 'Link aman'
                                : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-[10px] text-slate-500 max-w-[220px]">
                            {delivery.lastError || delivery.messagePreview}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {delivery.status !== 'sent' && (
                              <button
                                onClick={() => handleRetryDelivery(delivery)}
                                disabled={busy === delivery.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3 h-3 ${busy === delivery.id ? 'animate-spin' : ''}`} />
                                Kirim Ulang
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-950 leading-relaxed">
        <p className="font-bold flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-sky-700" />
          Batas integrasi pada mode demo
        </p>
        <p className="mt-1 text-sky-900/90">
          Tombol <strong>Simulasi Gateway</strong> hanya meniru webhook bertanda tangan di lingkungan lokal
          (bukan uang nyata) dan otomatis ditolak di production kecuali{' '}
          <code className="px-1 rounded bg-white/70">ALLOW_DEMO_PAYMENT_SIMULATION=true</code>. Transfer
          manual tetap berstatus <strong>menunggu verifikasi</strong> sampai bendahara menyetujui berdasarkan
          mutasi rekening. Telegram wali hanya terkirim setelah tautan <code>/start</code> diverifikasi bot.
        </p>
      </div>

      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-amber-700">
                  Panel Pemeriksaan Keabsahan
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  {selectedPayment.nomorPembayaran}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-semibold border ${
                  feedbackMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-200/70">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Santri</span>
                    <p className="font-extrabold text-slate-900">{selectedPayment.studentNama}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Nominal Masuk</span>
                    <p className="text-base font-extrabold text-emerald-800">
                      {formatRupiah(selectedPayment.nominal)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Bank Tujuan</span>
                    <p className="font-bold text-slate-800">{selectedPayment.bankTujuan || '-'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Nama Pengirim</span>
                    <p className="font-semibold text-slate-700">
                      {selectedPayment.namaPengirim || '-'} ({selectedPayment.bankPengirim || '-'})
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Referensi</span>
                    <p className="font-mono text-[11px] text-slate-700">
                      {selectedPayment.nomorRef || '-'}
                    </p>
                  </div>
                  {selectedPayment.catatanPembayar && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">Pesan Pembayar</span>
                      <p className="italic text-slate-600">{selectedPayment.catatanPembayar}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1.5">
                  Bukti Resi / Screenshot:
                </span>
                <div className="w-full h-56 bg-slate-100 rounded-xl border border-slate-200 p-2 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedPayment.buktiPembayaranUrl || '/images/qris-demo.svg'}
                    alt="Bukti Transfer"
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>
                <div className="mt-1 text-center">
                  <a
                    href={selectedPayment.buktiPembayaranUrl || '/images/qris-demo.svg'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    Buka Gambar Penuh <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {!isRejecting ? (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Verifikasi Sah (Muncul di Kuitansi):
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition"
                  >
                    Tolak Bukti Transfer Ini
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={handleApprove}
                      className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-950/20 transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Sahkan &amp; Terbitkan Kuitansi
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-red-100 bg-red-50/50 p-3 rounded-xl">
                <div>
                  <label className="block text-xs font-bold text-red-900 mb-1">
                    Wajib: Alasan Penolakan untuk Wali Santri
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Contoh: Dana belum masuk mutasi rekening BSI."
                    required
                    className="w-full text-xs p-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Batal Tolak
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md transition"
                  >
                    Konfirmasi Penolakan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
