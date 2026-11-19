'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { store } from '@/lib/store';
import {
  Invoice,
  PaymentCategory,
  UserProfile,
  Student,
  UnitPondok,
} from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatRupiah, formatDateIndo } from '@/lib/utils';
import {
  CreditCard,
  PlusCircle,
  Layers,
  Search,
  Filter,
  Eye,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

export default function TagihanPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('semua');
  const [filterCategory, setFilterCategory] = useState('semua');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [filterUnit, setFilterUnit] = useState('semua');

  // Modals
  const [showCreateSingle, setShowCreateSingle] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [formError, setFormError] = useState('');
  const [batchResult, setBatchResult] = useState<{ generated: number; skipped: number } | null>(null);

  // Single Form State
  const [singleData, setSingleData] = useState({
    studentId: '',
    categoryId: 'cat-1',
    periodeBulan: 'Oktober 2026',
    periodeTahun: 2026,
    nominal: 450000,
    tenggatWaktu: '2026-10-25',
    catatan: '',
  });

  // Batch Form State
  const [batchData, setBatchData] = useState({
    unit: 'semua' as 'semua' | 'putra' | 'putri',
    kelas: 'semua',
    categoryId: 'cat-1',
    periodeBulan: 'November 2026',
    periodeTahun: 2026,
    nominal: 450000,
    tenggatWaktu: '2026-11-20',
    catatan: '',
  });

  const loadData = () => {
    setUser(store.getCurrentUser());
    setInvoices(store.getInvoices());
    setCategories(store.getCategories());
    setStudents(store.getStudents());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Filter RBAC
  const rbacInvoices = useMemo(() => {
    if (!user) return [];
    if (user.role === 'santri') {
      const myId = user.studentId || 'std-1';
      return invoices.filter((i) => i.studentId === myId);
    }
    if (user.role === 'wali_santri') {
      const linked = user.linkedStudentIds || ['std-1', 'std-51'];
      return invoices.filter((i) => linked.includes(i.studentId));
    }
    if (user.role === 'kepala_pondok_putra' || user.role === 'pengurus_putra' || user.unitAccess === 'putra') {
      return invoices.filter((i) => i.studentUnit === 'putra');
    }
    if (user.role === 'kepala_pondok_putri' || user.role === 'pengurus_putri' || user.unitAccess === 'putri') {
      return invoices.filter((i) => i.studentUnit === 'putri');
    }
    return invoices;
  }, [user, invoices]);

  // Filtered List
  const filteredInvoices = useMemo(() => {
    return rbacInvoices.filter((inv) => {
      const matchSearch =
        inv.studentNama.toLowerCase().includes(search.toLowerCase()) ||
        inv.nomorTagihan.toLowerCase().includes(search.toLowerCase()) ||
        inv.studentNis.includes(search);
      if (!matchSearch) return false;

      if (filterPeriod !== 'semua' && inv.periodeBulan !== filterPeriod) return false;
      if (filterCategory !== 'semua' && inv.categoryCode !== filterCategory) return false;
      if (filterStatus !== 'semua' && inv.status !== filterStatus) return false;
      if (filterUnit !== 'semua' && inv.studentUnit !== filterUnit) return false;

      return true;
    });
  }, [rbacInvoices, search, filterPeriod, filterCategory, filterStatus, filterUnit]);

  // Update default nominal when category changes in single form
  const handleSingleCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    setSingleData({
      ...singleData,
      categoryId: catId,
      nominal: cat?.nominalDefault || 450000,
    });
  };

  const handleBatchCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    setBatchData({
      ...batchData,
      categoryId: catId,
      nominal: cat?.nominalDefault || 450000,
    });
  };

  // Submit Single Invoice
  const handleCreateSingle = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!singleData.studentId) {
      setFormError('Harap pilih santri terlebih dahulu.');
      return;
    }

    const res = store.createInvoice(singleData);
    if (!res.success) {
      setFormError(res.error || 'Gagal menerbitkan tagihan.');
      return;
    }

    setShowCreateSingle(false);
    loadData();
  };

  // Submit Batch Invoices
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const result = store.createBatchInvoices(batchData);
    setBatchResult(result);
    loadData();
  };

  const uniquePeriods = Array.from(new Set(invoices.map((i) => i.periodeBulan)));
  const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {user?.role === 'santri'
                ? 'Tagihan Pembayaran Saya'
                : user?.role === 'wali_santri'
                ? 'Daftar Tagihan Anak Santri'
                : 'Administrasi Tagihan Santri'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Total: {filteredInvoices.length} Tagihan
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Uang Makan, SPP Sekolah, dan Syariah Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah
          </p>
        </div>

        {/* Buttons for Bendahara */}
        {['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '') && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowCreateBatch(true);
                setBatchResult(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-800 hover:bg-slate-50 transition border border-slate-300 shadow-xs"
            >
              <Layers className="w-4 h-4 text-emerald-600" />
              Terbitkan Tagihan Massal
            </button>

            <button
              onClick={() => {
                setShowCreateSingle(true);
                setFormError('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20"
            >
              <PlusCircle className="w-4 h-4" />
              Buat Tagihan Satuan
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan No. Tagihan, Nama Santri, atau NIS..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Periode */}
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Periode</option>
              {uniquePeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {/* Kategori */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.nama}
                </option>
              ))}
            </select>

            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Status</option>
              <option value="belum_dibayar">Belum Dibayar</option>
              <option value="menunggu_verifikasi">Menunggu Verifikasi</option>
              <option value="lunas">Lunas</option>
            </select>

            {/* Unit */}
            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              disabled={user?.unitAccess !== 'semua'}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 disabled:opacity-60"
            >
              <option value="semua">Semua Unit</option>
              <option value="putra">Unit Putra</option>
              <option value="putri">Unit Putri</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Menampilkan <strong className="text-slate-800">{filteredInvoices.length}</strong> tagihan
          </span>
          {(search || filterPeriod !== 'semua' || filterCategory !== 'semua' || filterStatus !== 'semua' || filterUnit !== 'semua') && (
            <button
              onClick={() => {
                setSearch('');
                setFilterPeriod('semua');
                setFilterCategory('semua');
                setFilterStatus('semua');
                setFilterUnit('semua');
              }}
              className="font-semibold text-rose-600 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Table Tagihan */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">No. Tagihan</th>
                <th className="px-4 py-3">Nama Santri</th>
                <th className="px-4 py-3">Kelas &amp; Unit</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Tenggat Waktu</th>
                <th className="px-4 py-3">Nominal Tagihan</th>
                <th className="px-4 py-3">Sisa Tagihan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada tagihan yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {inv.nomorTagihan}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{inv.studentNama}</div>
                      <div className="text-[10px] text-slate-400">NIS: {inv.studentNis}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      Kelas {inv.studentKelas}{' '}
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          inv.studentUnit === 'putra'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-purple-50 text-purple-700'
                        }`}
                      >
                        {inv.studentUnit.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.categoryNama}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.periodeBulan}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateIndo(inv.tenggatWaktu)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {formatRupiah(inv.nominal)}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {formatRupiah(inv.sisaTagihan)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/tagihan/${inv.id}`}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          inv.status === 'belum_dibayar'
                            ? 'bg-gold-500 hover:bg-gold-600 text-slate-900 shadow-xs'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {inv.status === 'belum_dibayar' && ['wali_santri', 'santri'].includes(user?.role || '')
                          ? 'Bayar Sekarang'
                          : 'Rincian'}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Buat Tagihan Satuan */}
      {showCreateSingle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Terbitkan Tagihan Baru (Per Santri)
            </h3>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium border border-red-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSingle} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Santri
                </label>
                <select
                  value={singleData.studentId}
                  onChange={(e) => setSingleData({ ...singleData, studentId: e.target.value })}
                  required
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                >
                  <option value="">-- Pilih Santri Penerima Tagihan --</option>
                  {students.slice(0, 100).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} (NIS: {s.nis} - Kelas {s.kelas} {s.unit.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori Pembayaran
                  </label>
                  <select
                    value={singleData.categoryId}
                    onChange={(e) => handleSingleCategoryChange(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal Tagihan (Rp)
                  </label>
                  <input
                    type="number"
                    value={singleData.nominal}
                    onChange={(e) => setSingleData({ ...singleData, nominal: parseInt(e.target.value) || 0 })}
                    min={0}
                    step={10000}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Periode Bulan &amp; Tahun
                  </label>
                  <input
                    type="text"
                    value={singleData.periodeBulan}
                    onChange={(e) => setSingleData({ ...singleData, periodeBulan: e.target.value })}
                    placeholder="Contoh: Oktober 2026"
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tenggat Waktu Pelunasan
                  </label>
                  <input
                    type="date"
                    value={singleData.tenggatWaktu}
                    onChange={(e) => setSingleData({ ...singleData, tenggatWaktu: e.target.value })}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={singleData.catatan}
                  onChange={(e) => setSingleData({ ...singleData, catatan: e.target.value })}
                  placeholder="Keterangan tagihan"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
                <p className="font-semibold text-slate-800">Perlindungan Anti-Duplikasi Syariah:</p>
                Sistem akan memvalidasi agar santri yang sama tidak ditagihkan kategori dan periode yang sama dua kali.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateSingle(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20"
                >
                  Terbitkan Tagihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Terbitkan Tagihan Massal */}
      {showCreateBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Penerbitan Tagihan Massal (Batch Invoicing)
            </h3>

            {batchResult && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium border border-emerald-200">
                Alhamdulillah! Berhasil membuat <strong>{batchResult.generated}</strong> tagihan baru.
                {batchResult.skipped > 0 && (
                  <span> ({batchResult.skipped} tagihan dilewati secara aman karena sudah pernah dibuat sebelumnya).</span>
                )}
              </div>
            )}

            <form onSubmit={handleCreateBatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Unit Asrama
                  </label>
                  <select
                    value={batchData.unit}
                    onChange={(e) => setBatchData({ ...batchData, unit: e.target.value as any })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="semua">Semua Unit (Putra &amp; Putri)</option>
                    <option value="putra">Khusus Asrama Putra</option>
                    <option value="putri">Khusus Asrama Putri</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Kelas
                  </label>
                  <select
                    value={batchData.kelas}
                    onChange={(e) => setBatchData({ ...batchData, kelas: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="semua">Semua Tingkat Kelas</option>
                    {uniqueClasses.map((c) => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori Tagihan
                  </label>
                  <select
                    value={batchData.categoryId}
                    onChange={(e) => handleBatchCategoryChange(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal Tagihan (Rp)
                  </label>
                  <input
                    type="number"
                    value={batchData.nominal}
                    onChange={(e) => setBatchData({ ...batchData, nominal: parseInt(e.target.value) || 0 })}
                    min={0}
                    step={10000}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Periode Bulan &amp; Tahun
                  </label>
                  <input
                    type="text"
                    value={batchData.periodeBulan}
                    onChange={(e) => setBatchData({ ...batchData, periodeBulan: e.target.value })}
                    placeholder="Contoh: November 2026"
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tenggat Waktu Pelunasan
                  </label>
                  <input
                    type="date"
                    value={batchData.tenggatWaktu}
                    onChange={(e) => setBatchData({ ...batchData, tenggatWaktu: e.target.value })}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateBatch(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20"
                >
                  Proses Tagihan Massal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
