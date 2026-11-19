'use client';

import React, { useState, useEffect } from 'react';
import { store } from '@/lib/store';
import { UserProfile, UserRole, AuditLog } from '@/lib/types';
import RoleBadge, { ROLE_LABELS, ROLE_COLORS } from '@/components/layout/RoleBadge';
import { formatDateTimeIndo } from '@/lib/utils';
import {
  ShieldCheck,
  Users,
  Edit2,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Search,
  Lock,
} from 'lucide-react';

export default function PenggunaPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Edit form state
  const [newRole, setNewRole] = useState<UserRole>('anggota_bendahara');
  const [newUnitAccess, setNewUnitAccess] = useState<'semua' | 'putra' | 'putri'>('semua');
  const [newActive, setNewActive] = useState(true);

  const loadData = () => {
    setUser(store.getCurrentUser());
    setUsers(store.getAllUsers());
    setAuditLogs(store.getAuditLogs());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleOpenEdit = (targetUser: UserProfile) => {
    setEditingUser(targetUser);
    setNewRole(targetUser.role);
    setNewUnitAccess(targetUser.unitAccess || 'semua');
    setNewActive(targetUser.isActive);
    setShowEditModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    store.updateUser({
      ...editingUser,
      role: newRole,
      unitAccess: newUnitAccess,
      isActive: newActive,
    });

    setShowEditModal(false);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Manajemen Pengguna &amp; Audit Log
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              10 Peran Terdaftar
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Pengaturan peran (Role-Based Access Control) dan catatan jejak audit seluruh transaksi keuangan pondok.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            Daftar Akun Pengguna Sistem
          </h3>
          <span className="text-xs text-slate-500">{users.length} pengguna aktif</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">Nama Pengguna</th>
                <th className="px-4 py-3">Alamat Email</th>
                <th className="px-4 py-3">Peran / Hak Akses</th>
                <th className="px-4 py-3">Akses Unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Kelola</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-800 text-gold-300 font-bold flex items-center justify-center text-xs">
                      {u.name.charAt(0)}
                    </div>
                    {u.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    <span className="capitalize">{u.unitAccess || 'semua'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                        <XCircle className="w-3.5 h-3.5" /> Non-Aktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleOpenEdit(u)}
                      className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition"
                      title="Ubah Peran & Akses"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Jejak Audit Aktivitas Sistem (Audit Trail)
          </h3>
          <span className="text-xs text-slate-500">{auditLogs.length} catatan terekam</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10.5px]">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Petugas / Pengguna</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Tindakan</th>
                <th className="px-4 py-3">Rincian Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.slice(0, 25).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatDateTimeIndo(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800">{log.userName}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-semibold text-slate-600 px-2 py-0.5 rounded bg-slate-100">
                      {log.userRole}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-800 text-[11px]">
                    {log.tindakan}
                  </td>
                  <td className="px-4 py-3 text-slate-600 leading-relaxed max-w-md">
                    {log.rincian}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit User */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Ubah Hak Akses: {editingUser.name}
            </h3>

            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Peran Pengguna (Role)
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kewenangan Akses Unit Asrama
                </label>
                <select
                  value={newUnitAccess}
                  onChange={(e) => setNewUnitAccess(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                >
                  <option value="semua">Semua Unit (Putra &amp; Putri)</option>
                  <option value="putra">Khusus Unit Putra</option>
                  <option value="putri">Khusus Unit Putri</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="userActive"
                  checked={newActive}
                  onChange={(e) => setNewActive(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="userActive" className="text-xs font-semibold text-slate-700">
                  Akun Aktif (Dapat Masuk ke Sistem)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
