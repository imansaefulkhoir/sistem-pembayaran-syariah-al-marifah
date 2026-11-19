'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { store } from '@/lib/store';
import {
  Invoice,
  PaymentCategory,
  UserProfile,
  Student,
  PesantrenSettings,
} from '@/lib/types';
import { formatRupiah, formatDateIndo, exportToCSV } from '@/lib/utils';
import { generateReportPdf } from '@/lib/pdf-generator';
import StatsCard from '@/components/ui/StatsCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  BarChart3,
  Download,
  Filter,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Users,
  Send,
  Building,
  Calendar,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';

export default function LaporanPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [settings, setSettings] = useState<PesantrenSettings | null>(null);

  // Filters
  const [filterPeriod, setFilterPeriod] = useState('semua');
  const [filterCategory, setFilterCategory] = useState('semua');
  const [filterClass, setFilterClass] = useState('semua');
  const [filterUnit, setFilterUnit] = useState('semua');

  // Reminder feedback
  const [reminderSent, setReminderSent] = useState<string | null>(null);

  const loadData = () => {
    setUser(store.getCurrentUser());
    setInvoices(store.getInvoices());
    setCategories(store.getCategories());
    setStudents(store.getStudents());
    setSettings(store.getSettings());
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
    if (user.role === 'kepala_pondok_putra' || user.role === 'pengurus_putra' || user.unitAccess === 'putra') {
      return invoices.filter((i) => i.studentUnit === 'putra');
    }
    if (user.role === 'kepala_pondok_putri' || user.role === 'pengurus_putri' || user.unitAccess === 'putri') {
      return invoices.filter((i) => i.studentUnit === 'putri');
    }
    return invoices;
  }, [user, invoices]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return rbacInvoices.filter((inv) => {
      if (filterPeriod !== 'semua' && inv.periodeBulan !== filterPeriod) return false;
      if (filterCategory !== 'semua' && inv.categoryCode !== filterCategory) return false;
      if (filterClass !== 'semua' && inv.studentKelas !== filterClass) return false;
      if (filterUnit !== 'semua' && inv.studentUnit !== filterUnit) return false;
      return true;
    });
  }, [rbacInvoices, filterPeriod, filterCategory, filterClass, filterUnit]);

  // Statistics
  const summary = useMemo(() => {
    const totalTagihan = filteredInvoices.reduce((a, b) => a + b.nominal, 0);
    const totalTerverifikasi = filteredInvoices
      .filter((i) => i.status === 'lunas')
      .reduce((a, b) => a + b.nominal, 0);
    const totalTunggakanNominal = filteredInvoices
      .filter((i) => i.status === 'belum_dibayar')
      .reduce((a, b) => a + b.sisaTagihan, 0);

    const arrearsInvoices = filteredInvoices.filter((i) => i.status === 'belum_dibayar');
    const uniqueStudentsMenunggak = Array.from(new Set(arrearsInvoices.map((i) => i.studentId))).length;

    return {
      totalTagihan,
      totalTerverifikasi,
      totalTunggakanNominal,
      jumlahTunggakanSantri: uniqueStudentsMenunggak,
      arrearsInvoices,
    };
  }, [filteredInvoices]);

  const uniquePeriods = Array.from(new Set(invoices.map((i) => i.periodeBulan)));
  const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas))).sort();

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'No. Tagihan',
      'NIS',
      'Nama Santri',
      'Kelas',
      'Unit',
      'Kategori',
      'Periode',
      'Nominal Tagihan',
      'Total Dibayar',
      'Sisa Tunggakan',
      'Status',
    ];

    const rows = filteredInvoices.map((inv) => [
      inv.nomorTagihan,
      inv.studentNis,
      inv.studentNama,
      inv.studentKelas,
      inv.studentUnit,
      inv.categoryNama,
      inv.periodeBulan,
      inv.nominal,
      inv.totalDibayar,
      inv.sisaTagihan,
      inv.status,
    ]);

    exportToCSV(`Laporan_Keuangan_AlMarifah_${filterPeriod.replace(/\s+/g, '_')}.csv`, headers, rows);
  };

  // Export PDF
  const handleExportPDF = () => {
    if (!settings) return;
    generateReportPdf(
      'Rekapitulasi Keuangan Pesantren',
      filterPeriod === 'semua' ? 'Semua Periode' : filterPeriod,
      summary,
      filteredInvoices,
      settings
    );
  };

  const handleSendReminder = (studentNama: string, tagihanNo: string) => {
    setReminderSent(tagihanNo);
    const curr = store.getCurrentUser();
    store.addAuditLog(
      curr.id,
      curr.name,
      curr.role,
      'KIRIM_PENGINGAT_TUNGGAKAN',
      `Mengirimkan pengingat tagihan ${tagihanNo} untuk wali santri ${studentNama}`
    );
    setTimeout(() => setReminderSent(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Laporan Transparansi &amp; Tunggakan
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Prinsip Amanah Syariah
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Rekapitulasi resmi uang makan, SPP sekolah, dan syariah asrama Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 transition border border-slate-300 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Export CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-950/20 transition"
          >
            <Download className="w-4 h-4" />
            Download PDF Resmi
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" /> Filter Laporan
          </span>
          {(filterPeriod !== 'semua' || filterCategory !== 'semua' || filterClass !== 'semua' || filterUnit !== 'semua') && (
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
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode Bulan:</label>
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Periode</option>
              {uniquePeriods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Kategori Tagihan:</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>{c.nama}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tingkat Kelas:</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Kelas</option>
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>Kelas {cls}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Unit Asrama:</label>
            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              disabled={user?.unitAccess !== 'semua'}
              className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 disabled:opacity-60"
            >
              <option value="semua">Semua Unit</option>
              <option value="putra">Unit Putra</option>
              <option value="putri">Unit Putri</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Kewajiban Tagihan"
          value={formatRupiah(summary.totalTagihan)}
          subtitle={`${filteredInvoices.length} tagihan terbit`}
          icon={CreditCard}
          variant="blue"
        />

        <StatsCard
          title="Total Pembayaran Sah"
          value={formatRupiah(summary.totalTerverifikasi)}
          subtitle="Dana masuk kas/rekening"
          icon={CheckCircle2}
          variant="emerald"
        />

        <StatsCard
          title="Nominal Tunggakan"
          value={formatRupiah(summary.totalTunggakanNominal)}
          subtitle="Belum dilunasi wali"
          icon={AlertTriangle}
          variant="rose"
        />

        <StatsCard
          title="Santri Menunggak"
          value={`${summary.jumlahTunggakanSantri} Santri`}
          subtitle="Perlu pengingat bulanan"
          icon={Users}
          variant="amber"
        />
      </div>

      {/* Daftar Tunggakan Santri & Pengingat */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200/80 bg-rose-50/40 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Daftar Santri Menunggak &amp; Pengingat Bulanan
            </h3>
            <p className="text-xs text-rose-700/80">
              Daftar tagihan yang belum dibayar atau melewati tenggat waktu pelunasan
            </p>
          </div>
          <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-1 rounded-full border border-rose-300">
            {summary.arrearsInvoices.length} Tagihan Menunggak
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">No. Tagihan</th>
                <th className="px-4 py-3">Nama Santri</th>
                <th className="px-4 py-3">Kelas / Unit</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Tenggat Waktu</th>
                <th className="px-4 py-3">Nominal Tunggakan</th>
                <th className="px-4 py-3 text-right">Tindakan Pengingat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.arrearsInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                    Alhamdulillah, tidak ada tunggakan pembayaran pada filter ini!
                  </td>
                </tr>
              ) : (
                summary.arrearsInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{inv.nomorTagihan}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{inv.studentNama}</div>
                      <div className="text-[10px] text-slate-400">NIS: {inv.studentNis}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      Kelas {inv.studentKelas} ({inv.studentUnit.toUpperCase()})
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.categoryNama}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.periodeBulan}</td>
                    <td className="px-4 py-3 text-rose-600 font-semibold">{formatDateIndo(inv.tenggatWaktu)}</td>
                    <td className="px-4 py-3 font-bold text-rose-700">{formatRupiah(inv.sisaTagihan)}</td>
                    <td className="px-4 py-3 text-right">
                      {reminderSent === inv.nomorTagihan ? (
                        <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Terkirim
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendReminder(inv.studentNama, inv.nomorTagihan)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-gold-100 text-gold-900 hover:bg-gold-200 border border-gold-300 transition"
                          title="Kirim notifikasi pengingat ke akun wali"
                        >
                          <Send className="w-3 h-3 text-gold-700" />
                          Kirim Pengingat
                        </button>
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
