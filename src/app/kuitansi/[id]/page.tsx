'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { store } from '@/lib/store';
import { Invoice, Payment, PesantrenSettings, Receipt, UserProfile } from '@/lib/types';
import { formatRupiah, formatDateIndo } from '@/lib/utils';
import { computeInvoiceState } from '@/lib/payments/state';
import { generateReceiptPdf } from '@/lib/pdf-generator';
import Logo from '@/components/shared/Logo';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

export default function ReceiptDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [settings, setSettings] = useState<PesantrenSettings | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadData = () => {
    const rec = store.getReceiptById(id) || null;
    setReceipt(rec);
    setSettings(store.getSettings());
    setUser(store.getCurrentUser());
    if (rec) {
      const currentPayment = store.getPayments().find((item) => item.id === rec.paymentId) || null;
      setPayment(currentPayment);
      setInvoice(
        currentPayment
          ? store.getInvoices().find((item) => item.id === currentPayment.invoiceId) || null
          : store.getInvoices().find((item) => item.id === rec.invoiceId) || null
      );
    }
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const actualState = useMemo(() => {
    if (!invoice) return null;
    return computeInvoiceState(invoice, store.getPayments());
  }, [invoice]);

  if (!receipt || !settings) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-slate-500">Data kuitansi tidak ditemukan.</p>
        <Link
          href="/kuitansi"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Kuitansi
        </Link>
      </div>
    );
  }

  const documentStatus = receipt.status || 'aktif';
  const isActive = documentStatus === 'aktif';
  const isCancelled = documentStatus === 'dibatalkan';
  const isReplaced = documentStatus === 'diganti';
  const isPartial = receipt.statusPembayaran === 'sebagian';

  const totalTagihan = actualState?.totalTagihan ?? receipt.totalTagihan ?? invoice?.nominal;
  const totalTerverifikasi =
    actualState?.totalTerverifikasi ?? receipt.totalTerverifikasi ?? receipt.nominal;
  const sisaTagihan = actualState?.sisaTagihan ?? receipt.sisaTagihan;
  const overpayment = actualState?.overpayment ?? receipt.overpayment ?? 0;

  const canCorrect = ['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '');

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    generateReceiptPdf(receipt, settings);
  };

  const handleCancel = () => {
    const reason = window.prompt(`Alasan pembatalan kuitansi ${receipt.nomorKuitansi}:`);
    if (!reason?.trim()) return;
    const result = store.cancelReceipt(receipt.id, reason.trim());
    setFeedbackMsg({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? 'Kuitansi dibatalkan. Dokumen lama tetap tersimpan sebagai arsip audit dan tidak dapat dipakai ulang.'
        : result.error || 'Gagal membatalkan kuitansi.',
    });
    loadData();
  };

  const handleReissue = () => {
    const reason = window.prompt(
      `Alasan koreksi kuitansi ${receipt.nomorKuitansi} (nomor baru akan diterbitkan):`
    );
    if (!reason?.trim()) return;
    const result = store.reissueReceipt(receipt.id, reason.trim());
    setFeedbackMsg({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? 'Kuitansi koreksi diterbitkan dengan nomor baru. Kuitansi lama ditandai "Diganti".'
        : result.error || 'Gagal menerbitkan ulang kuitansi.',
    });
    loadData();
  };

  const stampClass = isCancelled
    ? 'border-red-600 text-red-700'
    : isReplaced
      ? 'border-amber-600 text-amber-700'
      : isPartial
        ? 'border-sky-600 text-sky-700'
        : 'border-emerald-600 text-emerald-700';
  const stampText = isCancelled
    ? 'DIBATALKAN'
    : isReplaced
      ? 'DIGANTI'
      : isPartial
        ? 'SEBAGIAN'
        : 'LUNAS';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Top Action Toolbar (Hidden in Print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/kuitansi"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Kuitansi
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-800 hover:bg-slate-50 border border-slate-300 shadow-xs transition"
          >
            <Printer className="w-4 h-4 text-emerald-600" />
            Cetak Kuitansi
          </button>

          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-950/20 transition"
          >
            <Download className="w-4 h-4" />
            Unduh Kuitansi (PDF)
          </button>

          {isActive && canCorrect && (
            <>
              <button
                onClick={handleReissue}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Koreksi / Terbitkan Ulang
              </button>
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 transition"
              >
                <Ban className="w-4 h-4" />
                Batalkan
              </button>
            </>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`no-print p-3 rounded-xl text-xs font-semibold border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {!isActive && (
        <div className="no-print p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            {isCancelled ? 'Kuitansi ini telah DIBATALKAN' : 'Kuitansi ini telah DIGANTI'}
          </p>
          <p>
            {isCancelled
              ? 'Dokumen tetap tersimpan sebagai arsip audit, tetapi tidak berlaku sebagai bukti pembayaran aktif. Pembayaran terkait tidak dihitung ulang hanya karena pembatalan dokumen.'
              : 'Dokumen ini tidak berlaku lagi. Gunakan kuitansi pengganti yang diterbitkan melalui mekanisme koreksi.'}
          </p>
          {receipt.cancelReason && (
            <p className="font-semibold">Alasan: {receipt.cancelReason}</p>
          )}
          {receipt.cancelledBy && (
            <p className="text-rose-800/80">
              Oleh {receipt.cancelledBy}
              {receipt.cancelledAt ? ` pada ${formatDateIndo(receipt.cancelledAt)}` : ''}.
            </p>
          )}
          {receipt.replacedByReceiptId && (
            <p>
              Kuitansi pengganti: <span className="font-mono">{receipt.replacedByReceiptId}</span>
            </p>
          )}
        </div>
      )}

      {isActive && isPartial && (
        <div className="no-print p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950">
          <p className="font-bold flex items-center gap-1.5">
            <CircleDollarSign className="w-4 h-4" />
            Pembayaran terverifikasi sebagian
          </p>
          <p className="mt-1">
            Kuitansi ini sah untuk nominal yang benar-benar diterima. Tagihan belum lunas; sisa
            kewajiban ditampilkan pada rincian di bawah.
          </p>
        </div>
      )}

      {/* Official Islamic Receipt Document Container */}
      <div className="print-container bg-white rounded-2xl border-2 border-slate-200/90 shadow-xl overflow-hidden p-6 sm:p-10 relative">
        {/* Top Header islamic green bar */}
        <div className="border-b-2 border-gold-500 pb-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo size={60} showText={false} />
              <div>
                <h2 className="text-base sm:text-lg font-extrabold uppercase text-emerald-950 tracking-tight">
                  {settings.namaPondok}
                </h2>
                <p className="text-xs text-slate-600 font-medium">{settings.subNama}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{settings.alamat}</p>
                <p className="text-[10px] text-slate-400">
                  Telp: {settings.telepon} • Email: {settings.email}
                </p>
              </div>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                {isActive ? 'Dokumen Sah Syariah' : 'Arsip Dokumen'}
              </span>
              <p className="text-xs font-mono font-bold text-slate-700 mt-1">
                {receipt.nomorKuitansi}
              </p>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1 mb-8">
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-900">
            Kuitansi Pembayaran Syariah
          </h1>
          <p className="text-xs font-mono font-bold text-emerald-800">
            Nomor: {receipt.nomorKuitansi}
          </p>
        </div>

        {/* Details List */}
        <div className="space-y-4 text-xs sm:text-sm">
          <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
            <div className="col-span-4 text-slate-500 font-semibold">Telah Diterima Dari</div>
            <div className="col-span-1 text-slate-400">:</div>
            <div className="col-span-7 font-extrabold text-slate-900 text-sm sm:text-base">
              {receipt.studentNama}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
            <div className="col-span-4 text-slate-500 font-semibold">NIS / Kelas / Asrama</div>
            <div className="col-span-1 text-slate-400">:</div>
            <div className="col-span-7 font-medium text-slate-800">
              {receipt.studentNis} / Kelas {receipt.studentKelas} (Unit {receipt.studentUnit.toUpperCase()})
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
            <div className="col-span-4 text-slate-500 font-semibold">Untuk Pembayaran</div>
            <div className="col-span-1 text-slate-400">:</div>
            <div className="col-span-7 font-bold text-slate-900">
              {receipt.kategoriNama} — Periode {receipt.periode}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
            <div className="col-span-4 text-slate-500 font-semibold">Metode Pembayaran</div>
            <div className="col-span-1 text-slate-400">:</div>
            <div className="col-span-7 font-medium text-slate-800">
              {receipt.metodePembayaran.toUpperCase().replace('_', ' ')} ({receipt.bankTujuan || 'Kas Tunai Bendahara'})
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
            <div className="col-span-4 text-slate-500 font-semibold">Tanggal Pembayaran</div>
            <div className="col-span-1 text-slate-400">:</div>
            <div className="col-span-7 font-medium text-slate-800">
              {formatDateIndo(receipt.tanggalBayar)}
            </div>
          </div>

          {receipt.guardianNama && (
            <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
              <div className="col-span-4 text-slate-500 font-semibold">Wali Santri</div>
              <div className="col-span-1 text-slate-400">:</div>
              <div className="col-span-7 font-medium text-slate-800">{receipt.guardianNama}</div>
            </div>
          )}

          {/* Amount Box */}
          <div className="my-6 p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-800">
                Jumlah Uang Diterima:
              </span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-950 mt-1">
                {formatRupiah(receipt.nominal)}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white shadow-xs ${
                  isCancelled
                    ? 'bg-red-600'
                    : isReplaced
                      ? 'bg-amber-600'
                      : isPartial
                        ? 'bg-sky-600'
                        : 'bg-emerald-600'
                }`}
              >
                {isCancelled || isReplaced ? (
                  <Ban className="w-4 h-4" />
                ) : isPartial ? (
                  <CircleDollarSign className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isCancelled
                  ? 'DIBATALKAN'
                  : isReplaced
                    ? 'DIGANTI (KOREKSI)'
                    : isPartial
                      ? 'SAH — DIBAYAR SEBAGIAN'
                      : 'SAH & LUNAS'}
              </span>
            </div>
          </div>

          {/* Ringkasan tagihan (snapshot saat terbit + status aktual) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Tagihan</div>
              <div className="text-sm font-bold text-slate-900">
                {formatRupiah(totalTagihan ?? receipt.nominal)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] uppercase font-bold text-emerald-700">
                Total Terverifikasi
              </div>
              <div className="text-sm font-bold text-emerald-900">
                {formatRupiah(totalTerverifikasi)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <div className="text-[10px] uppercase font-bold text-rose-700">Sisa Tagihan</div>
              <div className="text-sm font-bold text-rose-900">
                {sisaTagihan === undefined ? '-' : formatRupiah(sisaTagihan)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-[10px] uppercase font-bold text-amber-700">Kelebihan Bayar</div>
              <div className="text-sm font-bold text-amber-900">
                {formatRupiah(overpayment)}
              </div>
            </div>
          </div>

          {overpayment > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900">
              <strong>Catatan kelebihan bayar:</strong> selisih lebih sebesar{' '}
              {formatRupiah(overpayment)} tercatat dan perlu ditinjau bendahara. Nominal tidak
              dihapus dan tidak otomatis dialihkan ke tagihan lain.
            </div>
          )}

          {/* Terbilang */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 italic text-slate-700 text-xs sm:text-sm">
            <span className="font-bold not-italic text-slate-900">Terbilang: </span>
            &ldquo;{receipt.terbilang}&rdquo;
          </div>

          {receipt.catatan && (
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800">Catatan verifikasi: </span>
              {receipt.catatan}
            </div>
          )}

          {(receipt.verifikator || receipt.sistemVerifikator) && (
            <div className="text-[11px] text-slate-500">
              Diverifikasi oleh{' '}
              <span className="font-semibold text-slate-700">
                {receipt.verifikator || 'Bendahara'}
              </span>
              {receipt.sistemVerifikator ? ` • ${receipt.sistemVerifikator}` : ''}
            </div>
          )}
        </div>

        {/* Footer: Signatures & QR Code */}
        <div className="mt-10 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 items-end">
          {/* QR Code Validation */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-16 h-16 bg-white border border-slate-300 rounded-lg p-1 flex items-center justify-center flex-shrink-0">
              <QrCode className="w-12 h-12 text-slate-800" />
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5">
              <p className="font-bold text-slate-800">Verifikasi Validasi Syariah</p>
              <p className="font-mono text-[10px] text-slate-600 truncate max-w-[200px]">
                {receipt.barcodeQrData}
              </p>
              <p
                className={`text-[9.5px] font-semibold ${
                  isActive ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {isActive
                  ? 'Tercatat resmi dalam pembukuan pesantren.'
                  : 'Dokumen arsip — tidak berlaku sebagai kuitansi aktif.'}
              </p>
            </div>
          </div>

          {/* Signature Block */}
          <div className="text-center sm:text-right space-y-1">
            <p className="text-xs text-slate-500">
              Cirebon, {formatDateIndo(receipt.tanggalTerbit)}
            </p>
            <p className="text-xs font-bold text-slate-700">Petugas Bendahara Penerima,</p>

            {/* Official Stamp Simulation */}
            <div className="py-2 flex items-center justify-center sm:justify-end">
              <div
                className={`w-24 h-24 rounded-full border-2 border-dashed flex flex-col items-center justify-center font-black text-[9px] rotate-[-8deg] opacity-80 shadow-xs ${stampClass}`}
              >
                <span>PP KEBON KELAPA</span>
                <span className="text-[11px]">★ {stampText} ★</span>
                <span>BENDAHARA</span>
              </div>
            </div>

            <p className="text-xs font-black text-slate-900 border-b border-slate-900 inline-block">
              {receipt.petugasNama}
            </p>
            <p className="text-[10px] text-slate-400">Bagian Keuangan &amp; Administrasi Syariah</p>
          </div>
        </div>
      </div>

      <div className="no-print bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <p>
          Kuitansi yang sudah terbit bersifat tetap. Koreksi dilakukan dengan membatalkan dokumen
          lama lalu menerbitkan nomor baru; keduanya tercatat di audit log. Nomor kuitansi tidak
          pernah dipakai ulang.
        </p>
      </div>
    </div>
  );
}
