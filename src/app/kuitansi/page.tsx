'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import { Receipt, UserProfile } from '@/lib/types';
import { formatRupiah, formatDateIndo } from '@/lib/utils';
import {
  Receipt as ReceiptIcon,
  Search,
  Printer,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  Building,
} from 'lucide-react';

export default function KuitansiListPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [search, setSearch] = useState('');

  const loadData = () => {
    setUser(store.getCurrentUser());
    setReceipts(store.getReceipts());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const rbacReceipts = useMemo(() => {
    if (!user) return [];
    if (user.role === 'santri') {
      const myId = user.studentId || 'std-1';
      return receipts.filter((r) => r.studentId === myId);
    }
    if (user.role === 'wali_santri') {
      const linked = user.linkedStudentIds || ['std-1', 'std-51'];
      return receipts.filter((r) => linked.includes(r.studentId));
    }
    if (user.role === 'kepala_pondok_putra' || user.role === 'pengurus_putra' || user.unitAccess === 'putra') {
      return receipts.filter((r) => r.studentUnit === 'putra');
    }
    if (user.role === 'kepala_pondok_putri' || user.role === 'pengurus_putri' || user.unitAccess === 'putri') {
      return receipts.filter((r) => r.studentUnit === 'putri');
    }
    return receipts;
  }, [user, receipts]);

  const filteredReceipts = useMemo(() => {
    return rbacReceipts.filter((r) => {
      const q = search.toLowerCase();
      return (
        r.nomorKuitansi.toLowerCase().includes(q) ||
        r.studentNama.toLowerCase().includes(q) ||
        r.studentNis.includes(q) ||
        r.kategoriNama.toLowerCase().includes(q)
      );
    });
  }, [rbacReceipts, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Kuitansi Resmi Syariah
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              {filteredReceipts.length} Kuitansi Sah
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Bukti pembayaran sah dan lunas Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah bertanda tangan dan berkode QR verifikasi.
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari No. Kuitansi, Nama Santri, atau NIS..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Grid Kuitansi Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReceipts.length === 0 ? (
          <div className="col-span-full p-12 bg-white rounded-xl text-center text-slate-400 border border-slate-200">
            <ReceiptIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            Belum ada kuitansi yang diterbitkan atau cocok dengan pencarian.
          </div>
        ) : (
          filteredReceipts.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition p-5 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Kuitansi Sah
                  </span>
                  <span className="text-[11px] text-slate-400">{formatDateIndo(r.tanggalTerbit)}</span>
                </div>

                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">
                    {r.nomorKuitansi}
                  </h3>
                  <p className="font-bold text-slate-800 text-xs mt-0.5">{r.studentNama}</p>
                  <p className="text-[11px] text-slate-500">
                    NIS: {r.studentNis} • Kelas {r.studentKelas} ({r.studentUnit.toUpperCase()})
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Untuk:</span>
                    <span className="font-semibold text-slate-800">{r.kategoriNama}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Periode:</span>
                    <span>{r.periode}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800 pt-1 border-t border-slate-200">
                    <span>Jumlah:</span>
                    <span>{formatRupiah(r.nominal)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                  Petugas: {r.petugasNama.split(' ')[0]}
                </span>
                <Link
                  href={`/kuitansi/${r.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Lihat / Cetak
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
