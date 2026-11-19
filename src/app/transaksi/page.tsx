'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import { Payment, UserProfile } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatRupiah, formatDateTimeIndo, exportToCSV } from '@/lib/utils';
import {
  History,
  Search,
  Filter,
  Download,
  Receipt as ReceiptIcon,
  ExternalLink,
  CreditCard,
  Building,
  QrCode,
  Banknote,
} from 'lucide-react';

export default function TransaksiPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [filterMethod, setFilterMethod] = useState('semua');

  const loadData = () => {
    setUser(store.getCurrentUser());
    setPayments(store.getPayments());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const rbacPayments = useMemo(() => {
    if (!user) return [];
    if (user.role === 'santri') {
      const myId = user.studentId || 'std-1';
      return payments.filter((p) => p.studentId === myId);
    }
    if (user.role === 'wali_santri') {
      const linked = user.linkedStudentIds || ['std-1', 'std-51'];
      return payments.filter((p) => linked.includes(p.studentId));
    }
    return payments;
  }, [user, payments]);

  const filteredPayments = useMemo(() => {
    return rbacPayments.filter((p) => {
      const matchSearch =
        p.nomorPembayaran.toLowerCase().includes(search.toLowerCase()) ||
        p.studentNama.toLowerCase().includes(search.toLowerCase()) ||
        (p.namaPengirim && p.namaPengirim.toLowerCase().includes(search.toLowerCase())) ||
        (p.nomorKuitansi && p.nomorKuitansi.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;

      if (filterStatus !== 'semua' && p.status !== filterStatus) return false;
      if (filterMethod !== 'semua' && p.metode !== filterMethod) return false;

      return true;
    });
  }, [rbacPayments, search, filterStatus, filterMethod]);

  const handleExportCSV = () => {
    const headers = [
      'No. Pembayaran',
      'Santri',
      'Nominal',
      'Metode',
      'Tujuan Bank',
      'Pengirim',
      'Status',
      'Waktu Bayar',
      'No. Kuitansi',
      'Petugas Verifikasi',
    ];

    const rows = filteredPayments.map((p) => [
      p.nomorPembayaran,
      p.studentNama,
      p.nominal,
      p.metode,
      p.bankTujuan || '-',
      p.namaPengirim || '-',
      p.status,
      p.waktuPembayaran,
      p.nomorKuitansi || '-',
      p.diverifikasiOlehNama || '-',
    ]);

    exportToCSV(`Riwayat_Transaksi_AlMarifah_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Riwayat Transaksi Keuangan
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Total: {filteredPayments.length} Transaksi
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Catatan mutasi transaksi pembayaran santri mukim via transfer, QRIS, dan tunai loket kasir.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 transition border border-slate-300 shadow-xs"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          Export Transaksi CSV
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan No. Pembayaran, Nama Santri, atau No. Kuitansi..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Status</option>
              <option value="terverifikasi">Terverifikasi / Sah</option>
              <option value="menunggu_verifikasi">Menunggu Verifikasi</option>
              <option value="ditolak">Ditolak</option>
            </select>

            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Metode</option>
              <option value="transfer_bank">Transfer Bank</option>
              <option value="qris">QRIS Syariah</option>
              <option value="tunai">Tunai Kasir</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Transaksi */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">No. Pembayaran</th>
                <th className="px-4 py-3">Nama Santri</th>
                <th className="px-4 py-3">Metode &amp; Tujuan</th>
                <th className="px-4 py-3">Pengirim</th>
                <th className="px-4 py-3">Nominal Masuk</th>
                <th className="px-4 py-3">Waktu Bayar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Kuitansi Resmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada riwayat transaksi yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{p.nomorPembayaran}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.studentNama}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 flex items-center gap-1.5">
                        {p.metode === 'transfer_bank' && <Building className="w-3.5 h-3.5 text-emerald-600" />}
                        {p.metode === 'qris' && <QrCode className="w-3.5 h-3.5 text-blue-600" />}
                        {p.metode === 'tunai' && <Banknote className="w-3.5 h-3.5 text-amber-600" />}
                        {p.metode.toUpperCase().replace('_', ' ')}
                      </div>
                      <div className="text-[10px] text-slate-500">{p.bankTujuan}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.namaPengirim ? (
                        <div>
                          <span>{p.namaPengirim}</span>
                          <span className="text-[10px] text-slate-400 block">{p.bankPengirim}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-emerald-800">
                      {formatRupiah(p.nominal)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTimeIndo(p.waktuPembayaran)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.receiptId ? (
                        <Link
                          href={`/kuitansi/${p.receiptId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition"
                        >
                          <ReceiptIcon className="w-3.5 h-3.5" />
                          {p.nomorKuitansi}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
