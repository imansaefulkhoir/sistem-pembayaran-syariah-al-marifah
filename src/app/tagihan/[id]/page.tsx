'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { store } from '@/lib/store';
import {
  Invoice,
  Payment,
  UserProfile,
  Receipt,
  PesantrenSettings,
} from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatRupiah, formatDateIndo, formatDateTimeIndo } from '@/lib/utils';
import {
  ArrowLeft,
  CreditCard,
  QrCode,
  Building,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt as ReceiptIcon,
  Copy,
  Check,
  FileCheck2,
  ExternalLink,
  ShieldCheck,
  Banknote,
} from 'lucide-react';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [settings, setSettings] = useState<PesantrenSettings | null>(null);

  // Payment Form State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'transfer_bank' | 'qris'>('transfer_bank');
  const [selectedBank, setSelectedBank] = useState('bsi');
  const [senderName, setSenderName] = useState('');
  const [senderBank, setSenderBank] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('/images/qris-demo.svg');
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Cash Recording Modal
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashNotes, setCashNotes] = useState('');

  const loadData = () => {
    setUser(store.getCurrentUser());
    const inv = store.getInvoiceById(id);
    setInvoice(inv || null);

    if (inv) {
      const relatedPays = store.getPayments().filter((p) => p.invoiceId === inv.id);
      setPayments(relatedPays);

      const rec = store.getReceiptById(inv.id);
      setReceipt(rec || null);
    }
    setSettings(store.getSettings());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [id]);

  if (!invoice || !settings || !user) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-slate-500">Data tagihan tidak ditemukan.</p>
        <Link
          href="/tagihan"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Tagihan
        </Link>
      </div>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setProofPreview(base64);
        setPaymentProofUrl(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName) return;

    setSubmitting(true);

    let bankTujuan = settings.rekeningBsi.namaBank;
    let noRekTujuan = settings.rekeningBsi.nomorRekening;

    if (paymentMethod === 'transfer_bank') {
      if (selectedBank === 'bca_syariah') {
        bankTujuan = settings.rekeningBcaSyariah.namaBank;
        noRekTujuan = settings.rekeningBcaSyariah.nomorRekening;
      } else if (selectedBank === 'muamalat') {
        bankTujuan = settings.rekeningMuamalat.namaBank;
        noRekTujuan = settings.rekeningMuamalat.nomorRekening;
      }
    } else {
      bankTujuan = 'QRIS Syariah Ponpes Al-Ma\'rifah';
      noRekTujuan = settings.qrisInfo.nmid;
    }

    const res = store.submitPayment({
      invoiceId: invoice.id,
      metode: paymentMethod,
      bankTujuan: bankTujuan,
      nomorRekeningTujuan: noRekTujuan,
      namaPengirim: senderName,
      bankPengirim: senderBank || (paymentMethod === 'qris' ? 'Dompet Digital / Mobile Banking' : 'Bank Syariah'),
      nomorRef: refNumber || `REF-${Date.now().toString().slice(-6)}`,
      buktiPembayaranUrl: paymentProofUrl,
      catatanPembayar: paymentNotes,
    });

    setSubmitting(false);
    if (res.success) {
      setShowPaymentModal(false);
      loadData();
    }
  };

  const handleRecordCash = (e: React.FormEvent) => {
    e.preventDefault();
    const res = store.recordCashPayment({
      invoiceId: invoice.id,
      catatan: cashNotes,
    });

    if (res.success) {
      setShowCashModal(false);
      loadData();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/tagihan"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Tagihan
        </Link>
        <span className="text-xs text-slate-400">ID: {invoice.id}</span>
      </div>

      {/* Main Invoice Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-semibold text-gold-300">
              Rincian Tagihan Resmi
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {invoice.nomorTagihan}
            </h2>
            <p className="text-xs text-emerald-200">
              Periode: {invoice.periodeBulan} ({invoice.categoryNama})
            </p>
          </div>
          <div className="flex sm:flex-col items-end gap-2">
            <StatusBadge status={invoice.status} className="text-xs px-3 py-1 bg-white/95" />
            <span className="text-xs text-emerald-200 font-medium">
              Jatuh Tempo: {formatDateIndo(invoice.tenggatWaktu)}
            </span>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Santri Information Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/70">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Nama Lengkap Santri
              </p>
              <p className="text-sm font-extrabold text-slate-900 mt-0.5">{invoice.studentNama}</p>
              <p className="text-xs text-slate-500">NIS: {invoice.studentNis}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Kelas &amp; Asrama
              </p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">
                Kelas {invoice.studentKelas} •{' '}
                <span className="uppercase text-emerald-700">Unit {invoice.studentUnit}</span>
              </p>
              <p className="text-xs text-slate-500">
                Ponpes Kebon Kelapa Al-Ma&apos;rifah
              </p>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Rincian Pembayaran
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3.5 flex items-center justify-between text-xs bg-white">
                <span className="text-slate-600 font-medium">Kategori Iuran</span>
                <span className="font-bold text-slate-800">{invoice.categoryNama}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs bg-white">
                <span className="text-slate-600 font-medium">Tanggal Diterbitkan</span>
                <span className="text-slate-800">{formatDateIndo(invoice.tanggalTerbit)}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs bg-white">
                <span className="text-slate-600 font-medium">Tenggat Waktu</span>
                <span className="font-semibold text-rose-600">{formatDateIndo(invoice.tenggatWaktu)}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs bg-slate-50 font-medium">
                <span className="text-slate-700">Total Tagihan</span>
                <span className="text-sm font-bold text-slate-900">{formatRupiah(invoice.nominal)}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs bg-slate-50 font-medium">
                <span className="text-slate-700">Jumlah Telah Dibayar</span>
                <span className="text-sm font-bold text-emerald-700">{formatRupiah(invoice.totalDibayar)}</span>
              </div>
              <div className="p-4 flex items-center justify-between text-sm bg-emerald-50/60 font-extrabold border-t border-emerald-200">
                <span className="text-emerald-950">Sisa Kewajiban Tagihan</span>
                <span className="text-base sm:text-lg text-emerald-800">{formatRupiah(invoice.sisaTagihan)}</span>
              </div>
            </div>
          </div>

          {/* Status Banners and Call to Action */}
          {invoice.status === 'lunas' ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-900">Alhamdulillah! Tagihan Telah Lunas Sah</h4>
                  <p className="text-[11px] text-emerald-700">
                    Pembayaran telah diverifikasi masuk kas/rekening. Kuitansi resmi siap diunduh atau dicetak.
                  </p>
                </div>
              </div>

              {receipt && (
                <Link
                  href={`/kuitansi/${receipt.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition"
                >
                  <ReceiptIcon className="w-4 h-4" />
                  Buka Kuitansi Resmi
                </Link>
              )}
            </div>
          ) : invoice.status === 'menunggu_verifikasi' ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">Bukti Pembayaran Dalam Antrean Verifikasi</h4>
                  <p className="text-[11px] text-amber-700">
                    Petugas bendahara sedang memeriksa kesesuaian mutasi dana di rekening pondok.
                  </p>
                </div>
              </div>

              {['kepala_bendahara', 'admin_bendahara'].includes(user.role) && (
                <Link
                  href="/verifikasi"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition"
                >
                  <FileCheck2 className="w-4 h-4" />
                  Verifikasi Sekarang
                </Link>
              )}
            </div>
          ) : (
            /* Belum Dibayar */
            <div className="p-5 rounded-xl bg-gold-50 border border-gold-300 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-700" />
                    Pilih Cara Pelunasan Tagihan Syariah
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Tersedia transfer Bank Syariah, QRIS Dompet Digital, atau pembayaran tunai di loket bendahara.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Wali atau Santri */}
                  <button
                    onClick={() => {
                      setSenderName(user.name);
                      setShowPaymentModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs shadow-md shadow-emerald-950/20 transition"
                  >
                    <Upload className="w-4 h-4 text-gold-300" />
                    Bayar &amp; Unggah Bukti
                  </button>

                  {/* Bendahara Loket Kasir */}
                  {['kepala_bendahara', 'admin_bendahara', 'anggota_bendahara'].includes(user.role) && (
                    <button
                      onClick={() => setShowCashModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs shadow-md transition"
                      title="Catat pembayaran tunai langsung di kantor bendahara"
                    >
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      Catat Tunai (Kasir)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment History for this Invoice */}
          {payments.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Riwayat Transaksi Tagihan Ini
              </h4>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{p.nomorPembayaran}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Metode: {p.metode.toUpperCase().replace('_', ' ')} • Waktu: {formatDateTimeIndo(p.waktuPembayaran)}
                      </p>
                      {p.diverifikasiOlehNama && (
                        <p className="text-[10px] text-emerald-700">
                          Diverifikasi oleh: {p.diverifikasiOlehNama}
                        </p>
                      )}
                      {p.alasanPenolakan && (
                        <p className="text-[10px] text-red-600 font-bold mt-1">
                          Alasan Ditolak: {p.alasanPenolakan}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-slate-900">{formatRupiah(p.nominal)}</p>
                      {p.buktiPembayaranUrl && (
                        <a
                          href={p.buktiPembayaranUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-600 hover:underline flex items-center justify-end gap-1 mt-1 font-semibold"
                        >
                          Lihat Bukti <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Pembayaran & Unggah Bukti */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 my-8">
            <h3 className="text-base font-bold text-slate-900">
              Form Pembayaran Tagihan: {invoice.nomorTagihan}
            </h3>

            {/* Nominal Summary */}
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-emerald-800 font-medium">Nominal yang Harus Dibayar:</span>
                <p className="text-lg font-extrabold text-emerald-900">{formatRupiah(invoice.sisaTagihan)}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-white rounded-lg text-emerald-800 border border-emerald-300">
                {invoice.categoryNama}
              </span>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer_bank')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  paymentMethod === 'transfer_bank'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Building className="w-4 h-4" />
                Transfer Bank Syariah
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('qris')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  paymentMethod === 'qris'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <QrCode className="w-4 h-4" />
                QRIS Syariah (Semua E-Wallet)
              </button>
            </div>

            {/* Bank Info Box */}
            {paymentMethod === 'transfer_bank' ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700">Pilih Rekening Tujuan Pondok:</label>
                <div className="space-y-2">
                  {/* BSI */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                      selectedBank === 'bsi'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="bank"
                        checked={selectedBank === 'bsi'}
                        onChange={() => setSelectedBank('bsi')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900">{settings.rekeningBsi.namaBank}</p>
                        <p className="text-xs font-mono font-bold text-emerald-700">{settings.rekeningBsi.nomorRekening}</p>
                        <p className="text-[10px] text-slate-500">a.n. {settings.rekeningBsi.atasNama}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(settings.rekeningBsi.nomorRekening);
                      }}
                      className="text-xs text-slate-500 hover:text-emerald-700 p-1"
                      title="Salin No. Rekening"
                    >
                      {copiedAccount ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </label>

                  {/* BCA Syariah */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                      selectedBank === 'bca_syariah'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="bank"
                        checked={selectedBank === 'bca_syariah'}
                        onChange={() => setSelectedBank('bca_syariah')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900">{settings.rekeningBcaSyariah.namaBank}</p>
                        <p className="text-xs font-mono font-bold text-emerald-700">{settings.rekeningBcaSyariah.nomorRekening}</p>
                        <p className="text-[10px] text-slate-500">a.n. {settings.rekeningBcaSyariah.atasNama}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(settings.rekeningBcaSyariah.nomorRekening);
                      }}
                      className="text-xs text-slate-500 hover:text-emerald-700 p-1"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
                <p className="text-xs font-bold text-slate-800">Scan Kode QRIS Standar Nasional Syariah</p>
                <div className="w-48 h-56 mx-auto bg-white p-2 rounded-xl shadow-xs border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/qris-demo.svg" alt="QRIS Demo" className="w-full h-full object-contain" />
                </div>
                <p className="text-[11px] text-slate-500">
                  NMID: <code className="font-mono font-bold text-slate-700">{settings.qrisInfo.nmid}</code>
                </p>
                <p className="text-[10px] text-emerald-700 font-semibold">
                  Mendukung BSI Mobile, BCA Syariah, GoPay, ShopeePay, OVO, LinkAja, DANA, dsb.
                </p>
              </div>
            )}

            {/* Form Input Bukti & Pengirim */}
            <form onSubmit={handleSubmitPayment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Pemilik Rekening / Pengirim
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Contoh: H. Rahmat Hidayat"
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank / Aplikasi Pengirim
                  </label>
                  <input
                    type="text"
                    value={senderBank}
                    onChange={(e) => setSenderBank(e.target.value)}
                    placeholder="Contoh: BSI / BCA / GoPay"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unggah Bukti Struk Transfer / Resi Tangkapan Layar
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProofUpload}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 border border-slate-300 rounded-lg p-1"
                />
                {proofPreview && (
                  <div className="mt-2 p-2 bg-slate-100 rounded-lg text-center">
                    <p className="text-[10px] text-slate-500 mb-1">Pratinjau Bukti Terpilih:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proofPreview} alt="Preview" className="max-h-32 mx-auto rounded border" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan untuk Bendahara (Opsional)
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Misal: Sudah ditransfer pas jam 10 pagi"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20 disabled:opacity-50"
                >
                  {submitting ? 'Mengirim...' : 'Kirim Bukti Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Catat Pembayaran Tunai (Bendahara Kasir) */}
      {showCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-600" />
              Pencatatan Tunai Loket Bendahara
            </h3>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-xs">
              <p className="font-bold text-emerald-900">Uang Diterima Tunai di Kantor Pondok</p>
              <p className="text-emerald-800">
                Nominal: <strong>{formatRupiah(invoice.sisaTagihan)}</strong>
              </p>
              <p className="text-slate-600">Santri: {invoice.studentNama} (Kelas {invoice.studentKelas})</p>
            </div>

            <form onSubmit={handleRecordCash} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Kasir / Keterangan Penyerahan
                </label>
                <input
                  type="text"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder="Contoh: Diserahkan langsung oleh wali santri tunai"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
                Pencatatan ini akan langsung menetapkan status tagihan menjadi <strong>Lunas</strong> dan otomatis menerbitkan kuitansi sah berkode QR atas nama Anda ({user.name}).
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCashModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                >
                  Sahkan &amp; Terbitkan Kuitansi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
