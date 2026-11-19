'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { store, canAccessModule } from '@/lib/store';
import {
  UserProfile,
  Invoice,
  Payment,
  Student,
  PaymentCategory,
} from '@/lib/types';
import StatsCard from '@/components/ui/StatsCard';
import StatusBadge from '@/components/ui/StatusBadge';
import RoleBadge, { ROLE_LABELS } from '@/components/layout/RoleBadge';
import { formatRupiah, formatDateIndo } from '@/lib/utils';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Filter,
  ArrowRight,
  PlusCircle,
  FileCheck2,
  Receipt,
  Building,
  TrendingUp,
  Download,
  AlertCircle,
  Eye,
  RefreshCw,
  Bot,
} from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);

  // Filter Dashboard
  const [filterPeriod, setFilterPeriod] = useState<string>('semua');
  const [filterCategory, setFilterCategory] = useState<string>('semua');
  const [filterClass, setFilterClass] = useState<string>('semua');
  const [filterUnit, setFilterUnit] = useState<string>('semua');

  const loadData = () => {
    setUser(store.getCurrentUser());
    setInvoices(store.getInvoices());
    setPayments(store.getPayments());
    setStudents(store.getStudents());
    setCategories(store.getCategories());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Filter berdasarkan RBAC Pengguna
  const rbacFilteredInvoices = useMemo(() => {
    if (!user) return [];

    let list = [...invoices];

    // Jika Santri: hanya tagihan miliknya
    if (user.role === 'santri') {
      const myStudentId = user.studentId || 'std-1';
      return list.filter((inv) => inv.studentId === myStudentId);
    }

    // Jika Wali Santri: hanya tagihan anak-anaknya yang terhubung
    if (user.role === 'wali_santri') {
      const linkedIds = user.linkedStudentIds || ['std-1', 'std-51'];
      return list.filter((inv) => linkedIds.includes(inv.studentId));
    }

    // Jika Kepala / Pengurus Unit Putra: hanya unit putra
    if (
      user.role === 'kepala_pondok_putra' ||
      user.role === 'pengurus_putra' ||
      user.unitAccess === 'putra'
    ) {
      list = list.filter((inv) => inv.studentUnit === 'putra');
    }

    // Jika Kepala / Pengurus Unit Putri: hanya unit putri
    if (
      user.role === 'kepala_pondok_putri' ||
      user.role === 'pengurus_putri' ||
      user.unitAccess === 'putri'
    ) {
      list = list.filter((inv) => inv.studentUnit === 'putri');
    }

    return list;
  }, [user, invoices]);

  // Terapkan Filter Tambahan di Dashboard
  const displayInvoices = useMemo(() => {
    return rbacFilteredInvoices.filter((inv) => {
      if (filterPeriod !== 'semua' && inv.periodeBulan !== filterPeriod) return false;
      if (filterCategory !== 'semua' && inv.categoryCode !== filterCategory) return false;
      if (filterClass !== 'semua' && inv.studentKelas !== filterClass) return false;
      if (filterUnit !== 'semua' && inv.studentUnit !== filterUnit) return false;
      return true;
    });
  }, [rbacFilteredInvoices, filterPeriod, filterCategory, filterClass, filterUnit]);

  // Statistik Real-Time dari Database
  const stats = useMemo(() => {
    const totalTagihanNominal = displayInvoices.reduce((acc, curr) => acc + curr.nominal, 0);
    const totalTerverifikasiNominal = displayInvoices
      .filter((inv) => inv.status === 'lunas')
      .reduce((acc, curr) => acc + curr.nominal, 0);
    const totalTunggakanNominal = displayInvoices
      .filter((inv) => inv.status === 'belum_dibayar')
      .reduce((acc, curr) => acc + curr.sisaTagihan, 0);

    const pendingPaymentsCount = payments.filter((p) => {
      if (p.status !== 'menunggu_verifikasi') return false;
      // Filter if restricted unit
      if (user?.role === 'kepala_pondok_putra' || user?.unitAccess === 'putra') {
        const std = students.find((s) => s.id === p.studentId);
        return std?.unit === 'putra';
      }
      if (user?.role === 'kepala_pondok_putri' || user?.unitAccess === 'putri') {
        const std = students.find((s) => s.id === p.studentId);
        return std?.unit === 'putri';
      }
      return true;
    }).length;

    const totalSantriTergabung =
      user?.role === 'santri'
        ? 1
        : user?.role === 'wali_santri'
        ? (user.linkedStudentIds?.length || 2)
        : user?.unitAccess === 'putra' || user?.role === 'kepala_pondok_putra'
        ? students.filter((s) => s.unit === 'putra').length
        : user?.unitAccess === 'putri' || user?.role === 'kepala_pondok_putri'
        ? students.filter((s) => s.unit === 'putri').length
        : students.length;

    return {
      totalTagihanNominal,
      totalTerverifikasiNominal,
      totalTunggakanNominal,
      pendingPaymentsCount,
      totalSantriTergabung,
    };
  }, [displayInvoices, payments, students, user]);

  if (!user) return null;

  // Dapatkan daftar periode unik & kelas unik untuk filter dropdown
  const uniquePeriods = Array.from(new Set(invoices.map((i) => i.periodeBulan)));
  const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas))).sort();

  return (
    <div className="space-y-6">
      {/* Top Banner & Profile Greeting */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-slate-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <RoleBadge
                role={user.role}
                className="bg-gold-500/20 text-gold-300 border-gold-400/40 text-xs px-2.5 py-0.5"
              />
              <span className="text-xs text-emerald-200">
                • {user.unitAccess === 'semua' ? 'Akses Seluruh Asrama' : `Akses Unit ${user.unitAccess?.toUpperCase()}`}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Ahlan Wa Sahlan, {user.name}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200/90 max-w-2xl leading-relaxed">
              {user.role === 'pengasuh' &&
                'Monitoring menyeluruh keuangan syariah, pemasukan SPP, katering makan, dan transparansi amanah pondok pesantren.'}
              {user.role === 'wali_santri' &&
                'Kelola dan pantau seluruh tagihan anak santri Anda secara syariah dari rumah tanpa perlu antre di kantor pondok.'}
              {user.role === 'santri' &&
                'Lihat rincian iuran uang makan, SPP sekolah, dan syariah pondok Anda, serta konfirmasi pembayaran secara mandiri.'}
              {['kepala_pondok_putra', 'kepala_pondok_putri', 'pengurus_putra', 'pengurus_putri'].includes(user.role) &&
                `Monitoring status pembayaran dan tunggakan khusus unit santri ${user.unitAccess?.toUpperCase()}.`}
              {['kepala_bendahara', 'admin_bendahara', 'anggota_bendahara'].includes(user.role) &&
                'Kelola operasional tagihan, verifikasi mutasi bank/QRIS, cetak kuitansi, dan catat pembayaran tunai kasir.'}
            </p>
          </div>

          {/* Quick Actions based on Role */}
          <div className="flex flex-wrap items-center gap-2">
            {['kepala_bendahara', 'admin_bendahara'].includes(user.role) && (
              <>
                <Link
                  href="/verifikasi"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-950/20 transition"
                >
                  <FileCheck2 className="w-4 h-4" />
                  Verifikasi ({stats.pendingPaymentsCount})
                </Link>
                <Link
                  href="/tagihan"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/20 transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  Buat Tagihan
                </Link>
              </>
            )}

            {user.role === 'wali_santri' && (
              <Link
                href="/tagihan"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-slate-900 font-extrabold text-xs shadow-md transition"
              >
                <CreditCard className="w-4 h-4" />
                Bayar Tagihan Anak
              </Link>
            )}

            {user.role === 'santri' && (
              <Link
                href="/tagihan"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-slate-900 font-extrabold text-xs shadow-md transition"
              >
                <CreditCard className="w-4 h-4" />
                Bayar Tagihan Saya
              </Link>
            )}

            <button
              onClick={loadData}
              title="Perbarui Data"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition text-xs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Admin Assistant Callout */}
      {canAccessModule(user.role, 'asisten_admin') && (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Asisten Admin</h3>
              <p className="text-[11.5px] text-slate-600 mt-0.5 max-w-2xl">
                Tanyakan jumlah santri, pemasukan, tunggakan, pembayaran menunggu verifikasi,
                ringkasan keuangan, hingga statistik wali dan Telegram. Jawaban mengikuti
                kewenangan role Anda dan menyebut periode data.
              </p>
            </div>
          </div>
          <Link
            href="/asisten-admin"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm transition shrink-0"
          >
            Buka Asisten
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Filter Toolbar (Live Dynamic Calculation) */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-emerald-600" />
            Filter Data Dashboard (Database Query)
          </div>
          {(filterPeriod !== 'semua' ||
            filterCategory !== 'semua' ||
            filterClass !== 'semua' ||
            filterUnit !== 'semua') && (
            <button
              onClick={() => {
                setFilterPeriod('semua');
                setFilterCategory('semua');
                setFilterClass('semua');
                setFilterUnit('semua');
              }}
              className="text-xs font-semibold text-rose-600 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Periode */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Periode Bulan:
            </label>
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="semua">Semua Periode</option>
              {uniquePeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Kategori */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kategori Tagihan:
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="semua">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Kelas */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Tingkat Kelas:
            </label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="semua">Semua Kelas</option>
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  Kelas {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Unit Putra / Putri */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Unit Asrama:
            </label>
            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              disabled={user.unitAccess !== 'semua'}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
            >
              <option value="semua">Semua Unit</option>
              <option value="putra">Unit Putra</option>
              <option value="putri">Unit Putri</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4 Kartu Ringkasan Keuangan (Live Stats) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Nilai Tagihan"
          value={formatRupiah(stats.totalTagihanNominal)}
          subtitle={`${displayInvoices.length} tagihan aktif`}
          icon={CreditCard}
          variant="blue"
        />

        <StatsCard
          title="Pembayaran Terverifikasi"
          value={formatRupiah(stats.totalTerverifikasiNominal)}
          subtitle="Dana masuk sah rekening/kas"
          icon={CheckCircle2}
          variant="emerald"
        />

        <StatsCard
          title="Total Tunggakan"
          value={formatRupiah(stats.totalTunggakanNominal)}
          subtitle="Belum dilunasi"
          icon={AlertTriangle}
          variant="rose"
        />

        <StatsCard
          title="Antrean Verifikasi"
          value={`${stats.pendingPaymentsCount} Transaksi`}
          subtitle="Menunggu dicek bendahara"
          icon={Clock}
          variant="amber"
        />
      </div>

      {/* Pending Verifications Notice Banner for Bendahara */}
      {stats.pendingPaymentsCount > 0 && ['kepala_bendahara', 'admin_bendahara'].includes(user.role) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Ada {stats.pendingPaymentsCount} Pembayaran Transfer/QRIS Menunggu Verifikasi Anda!
              </p>
              <p className="text-[11px] text-amber-700">
                Periksa bukti transfer dan cocokkan dengan mutasi rekening BSI/BCA Syariah sebelum menerbitkan kuitansi sah.
              </p>
            </div>
          </div>
          <Link
            href="/verifikasi"
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1"
          >
            Buka Verifikasi <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Visual Progress Bar Pemasukan vs Tunggakan */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Progres Transparansi Pelunasan
            </h3>
            <p className="text-sm font-extrabold text-slate-800">
              {stats.totalTagihanNominal > 0
                ? `${Math.round((stats.totalTerverifikasiNominal / stats.totalTagihanNominal) * 100)}% Terkumpul`
                : '0% Terkumpul'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              Lunas: {formatRupiah(stats.totalTerverifikasiNominal)}
            </span>
            <span className="flex items-center gap-1.5 text-rose-600">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              Tunggakan: {formatRupiah(stats.totalTunggakanNominal)}
            </span>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full transition-all duration-500"
            style={{
              width: `${
                stats.totalTagihanNominal > 0
                  ? (stats.totalTerverifikasiNominal / stats.totalTagihanNominal) * 100
                  : 0
              }%`,
            }}
          />
          <div
            className="bg-gradient-to-r from-rose-500 to-rose-600 h-full transition-all duration-500"
            style={{
              width: `${
                stats.totalTagihanNominal > 0
                  ? (stats.totalTunggakanNominal / stats.totalTagihanNominal) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* Daftar Tagihan Terkini & Tabel */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {user.role === 'santri'
                ? 'Tagihan Saya'
                : user.role === 'wali_santri'
                ? 'Tagihan Anak-Anak Saya'
                : 'Daftar Tagihan Santri'}
            </h3>
            <p className="text-xs text-slate-500">
              Menampilkan {displayInvoices.length} tagihan sesuai kewenangan akses dan filter
            </p>
          </div>
          <Link
            href="/tagihan"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
          >
            Lihat Semua Tagihan <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">No. Tagihan</th>
                <th className="px-4 py-3">Nama Santri</th>
                <th className="px-4 py-3">Kelas &amp; Unit</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Nominal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada data tagihan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                displayInvoices.slice(0, 8).map((inv) => (
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
                    <td className="px-4 py-3 text-slate-700 font-medium">{inv.categoryNama}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.periodeBulan}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {formatRupiah(inv.nominal)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/tagihan/${inv.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detail
                      </Link>
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
