'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { store } from '@/lib/store';
import { Student, UserProfile, Gender, UnitPondok } from '@/lib/types';
import { exportToCSV } from '@/lib/utils';
import {
  Users,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  RotateCcw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export default function SantriPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('semua');
  const [filterGender, setFilterGender] = useState('semua');
  const [filterUnit, setFilterUnit] = useState('semua');
  const [filterStatus, setFilterStatus] = useState('semua');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nis: '',
    nama: '',
    jenisKelamin: 'L' as Gender,
    usia: 15,
    kelas: 'X A',
    asalDaerah: '',
    unit: 'putra' as UnitPondok,
    statusAktif: true,
    waliNama: '',
  });

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [importMessage, setImportMessage] = useState('');

  const loadData = () => {
    setUser(store.getCurrentUser());
    setStudents(store.getStudents());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Filter RBAC unit
  const rbacStudents = useMemo(() => {
    if (!user) return [];
    if (user.role === 'kepala_pondok_putra' || user.role === 'pengurus_putra' || user.unitAccess === 'putra') {
      return students.filter((s) => s.unit === 'putra');
    }
    if (user.role === 'kepala_pondok_putri' || user.role === 'pengurus_putri' || user.unitAccess === 'putri') {
      return students.filter((s) => s.unit === 'putri');
    }
    return students;
  }, [user, students]);

  // Filtered List
  const filteredStudents = useMemo(() => {
    return rbacStudents.filter((s) => {
      const matchSearch =
        s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nis.includes(searchQuery) ||
        s.asalDaerah.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      if (filterClass !== 'semua' && s.kelas !== filterClass) return false;
      if (filterGender !== 'semua' && s.jenisKelamin !== filterGender) return false;
      if (filterUnit !== 'semua' && s.unit !== filterUnit) return false;
      if (filterStatus !== 'semua') {
        const isAktif = filterStatus === 'aktif';
        if (s.statusAktif !== isAktif) return false;
      }

      return true;
    });
  }, [rbacStudents, searchQuery, filterClass, filterGender, filterUnit, filterStatus]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  const uniqueClasses = Array.from(new Set(students.map((s) => s.kelas))).sort();

  // Handlers
  const handleOpenAdd = () => {
    const defaultUnit: UnitPondok = user?.unitAccess === 'putri' ? 'putri' : 'putra';
    const defaultGender: Gender = defaultUnit === 'putri' ? 'P' : 'L';
    setFormData({
      nis: `20240${students.length + 100}`,
      nama: '',
      jenisKelamin: defaultGender,
      usia: 15,
      kelas: 'X A',
      asalDaerah: '',
      unit: defaultUnit,
      statusAktif: true,
      waliNama: '',
    });
    setEditingStudent(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      nis: student.nis,
      nama: student.nama,
      jenisKelamin: student.jenisKelamin,
      usia: student.usia,
      kelas: student.kelas,
      asalDaerah: student.asalDaerah,
      unit: student.unit,
      statusAktif: student.statusAktif,
      waliNama: student.waliNama || '',
    });
    setShowAddModal(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama || !formData.nis) return;

    if (editingStudent) {
      store.updateStudent({
        ...editingStudent,
        ...formData,
      });
    } else {
      store.addStudent({
        ...formData,
      });
    }

    setShowAddModal(false);
    loadData();
  };

  const handleDelete = (id: string) => {
    store.deleteStudent(id);
    setConfirmDeleteId(null);
    loadData();
  };

  const handleResetDemo = () => {
    if (confirm('Apakah Anda yakin ingin mereset seluruh data ke 100 Santri Demo (50 putra & 50 putri)?')) {
      store.resetStudentsToDemo();
      loadData();
    }
  };

  const handleExportCSV = () => {
    const headers = ['No', 'NIS', 'Nama Santri', 'L/P', 'Usia', 'Kelas', 'Asal Daerah', 'Unit', 'Status'];
    const rows = filteredStudents.map((s, idx) => [
      idx + 1,
      s.nis,
      s.nama,
      s.jenisKelamin,
      s.usia,
      s.kelas,
      s.asalDaerah,
      s.unit,
      s.statusAktif ? 'Aktif' : 'Non-Aktif',
    ]);
    exportToCSV(`Data_Santri_AlMarifah_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleImportCSV = () => {
    if (!csvContent.trim()) {
      setImportMessage('Silakan tempel atau unggah data CSV terlebih dahulu.');
      return;
    }

    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      setImportMessage('Format CSV tidak valid atau data kosong.');
      return;
    }

    // Skip header line
    const parsed: Omit<Student, 'id' | 'no' | 'createdAt' | 'updatedAt'>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 7) {
        // No, NIS, Nama, L/P, Usia, Kelas, Asal Daerah
        const nis = parts[1] || `20240${Date.now()}`;
        const nama = parts[2];
        const lp = (parts[3]?.toUpperCase() === 'P' ? 'P' : 'L') as Gender;
        const usia = parseInt(parts[4]) || 15;
        const kelas = parts[5] || 'VII A';
        const asal = parts[6] || 'Cirebon';
        const unit: UnitPondok = lp === 'P' ? 'putri' : 'putra';

        if (nama) {
          parsed.push({
            nis,
            nama,
            jenisKelamin: lp,
            usia,
            kelas,
            asalDaerah: asal,
            unit,
            statusAktif: true,
          });
        }
      }
    }

    const importedCount = store.importStudentsFromCSV(parsed);
    setImportMessage(`Alhamdulillah, berhasil mengimpor ${importedCount} santri baru ke dalam sistem!`);
    loadData();
    setTimeout(() => {
      setShowImportModal(false);
      setImportMessage('');
      setCsvContent('');
    }, 1500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent((event.target?.result as string) || '');
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Manajemen Data Santri
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Total: {students.length} Santri
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Data santri mukim Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah (50 Putra &amp; 50 Putri Demo)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleResetDemo}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition border border-slate-300"
            title="Kembalikan ke data 100 santri demo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 transition border border-slate-300 shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            Import CSV
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 transition border border-slate-300 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Export CSV
          </button>

          {['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '') && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-md shadow-emerald-900/20"
            >
              <Plus className="w-4 h-4" />
              Tambah Santri
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari santri berdasarkan Nama, NIS, atau Asal Daerah..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Filter Kelas */}
            <select
              value={filterClass}
              onChange={(e) => {
                setFilterClass(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Kelas</option>
              {uniqueClasses.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>

            {/* Filter Gender */}
            <select
              value={filterGender}
              onChange={(e) => {
                setFilterGender(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua L/P</option>
              <option value="L">Putra (L)</option>
              <option value="P">Putri (P)</option>
            </select>

            {/* Filter Unit */}
            <select
              value={filterUnit}
              onChange={(e) => {
                setFilterUnit(e.target.value);
                setCurrentPage(1);
              }}
              disabled={user?.unitAccess !== 'semua'}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 disabled:opacity-60"
            >
              <option value="semua">Semua Unit</option>
              <option value="putra">Unit Putra</option>
              <option value="putri">Unit Putri</option>
            </select>

            {/* Filter Status */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs p-2 rounded-lg border border-slate-300 bg-slate-50"
            >
              <option value="semua">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Non-Aktif</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Menampilkan <strong className="text-slate-800">{filteredStudents.length}</strong> santri ditemukan
          </span>
          {(searchQuery || filterClass !== 'semua' || filterGender !== 'semua' || filterUnit !== 'semua' || filterStatus !== 'semua') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterClass('semua');
                setFilterGender('semua');
                setFilterUnit('semua');
                setFilterStatus('semua');
                setCurrentPage(1);
              }}
              className="font-semibold text-rose-600 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Santri Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">NIS</th>
                <th className="px-4 py-3">Nama Lengkap</th>
                <th className="px-4 py-3">L/P</th>
                <th className="px-4 py-3">Usia</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Asal Daerah</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Status</th>
                {['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '') && (
                  <th className="px-4 py-3 text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada data santri yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s, index) => {
                  const rowNumber = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-400">{rowNumber}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{s.nis}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{s.nama}</div>
                        {s.waliNama && (
                          <div className="text-[10px] text-slate-400">Wali: {s.waliNama}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.jenisKelamin === 'L'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-pink-100 text-pink-800'
                          }`}
                        >
                          {s.jenisKelamin}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.usia} Thn</td>
                      <td className="px-4 py-3 font-medium text-slate-700">Kelas {s.kelas}</td>
                      <td className="px-4 py-3 text-slate-600">{s.asalDaerah}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.unit === 'putra'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          {s.unit === 'putra' ? 'Putra' : 'Putri'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.statusAktif ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                            Non-Aktif
                          </span>
                        )}
                      </td>
                      {['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '') && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(s)}
                              className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                              title="Ubah Data Santri"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 transition"
                              title="Hapus Data Santri"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Halaman <strong className="text-slate-800">{currentPage}</strong> dari{' '}
            <strong className="text-slate-800">{totalPages}</strong> (Total {filteredStudents.length} Santri)
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                    currentPage === pageNum
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tambah / Edit Santri */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingStudent ? 'Perbarui Data Santri' : 'Tambah Santri Baru'}
            </h3>

            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Induk Santri (NIS)
                  </label>
                  <input
                    type="text"
                    value={formData.nis}
                    onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap Santri
                  </label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={formData.jenisKelamin}
                    onChange={(e) => {
                      const lp = e.target.value as Gender;
                      setFormData({
                        ...formData,
                        jenisKelamin: lp,
                        unit: lp === 'P' ? 'putri' : 'putra',
                      });
                    }}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="L">Laki-laki (Putra)</option>
                    <option value="P">Perempuan (Putri)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Usia (Tahun)
                  </label>
                  <input
                    type="number"
                    value={formData.usia}
                    onChange={(e) => setFormData({ ...formData, usia: parseInt(e.target.value) || 15 })}
                    min={10}
                    max={25}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas
                  </label>
                  <input
                    type="text"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    placeholder="Contoh: X A"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Asal Daerah
                  </label>
                  <input
                    type="text"
                    value={formData.asalDaerah}
                    onChange={(e) => setFormData({ ...formData, asalDaerah: e.target.value })}
                    placeholder="Contoh: Cirebon"
                    required
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit Asrama
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitPondok })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="putra">Unit Putra</option>
                    <option value="putri">Unit Putri</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Wali Santri (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.waliNama}
                  onChange={(e) => setFormData({ ...formData, waliNama: e.target.value })}
                  placeholder="Nama orang tua/wali"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="statusAktif"
                  checked={formData.statusAktif}
                  onChange={(e) => setFormData({ ...formData, statusAktif: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="statusAktif" className="text-xs font-medium text-slate-700">
                  Status Santri Aktif Mukim
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20"
                >
                  Simpan Santri
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import CSV */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Import Data Santri dari CSV
                </h3>
              </div>
              <a
                href="/demo/100_santri_demo.csv"
                download
                className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Format Contoh CSV
              </a>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Format kolom yang didukung: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">No, NIS, Nama Santri, L/P, Usia, Kelas, Asal Daerah</code>.
            </p>

            {importMessage && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200">
                {importMessage}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih Berkas CSV dari Komputer:
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 border border-slate-300 rounded-lg p-1"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atau Tempel (Paste) Teks CSV di Bawah:
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="No,NIS,Nama Santri,L/P,Usia,Kelas,Asal Daerah&#10;1,202401001,Muhammad Al-Fatih,L,16,X A,Cirebon"
                rows={6}
                className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleImportCSV}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-md shadow-emerald-950/20"
              >
                Proses Import Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Santri</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Apakah Anda yakin ingin menghapus data santri ini? Tindakan ini akan dicatat ke dalam audit log sistem.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Ya, Hapus Santri
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
