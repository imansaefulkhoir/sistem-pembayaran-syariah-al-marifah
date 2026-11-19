import React from 'react';
import { UserRole } from '@/lib/types';

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  pengasuh: 'Ibu Nyai / Bapak Pengasuh',
  kepala_pondok_putra: 'Kepala Pondok Putra',
  kepala_pondok_putri: 'Kepala Pondok Putri',
  pengurus_putra: 'Pengurus Putra',
  pengurus_putri: 'Pengurus Putri',
  kepala_bendahara: 'Kepala Bendahara',
  admin_bendahara: 'Admin Bendahara (Kasir)',
  anggota_bendahara: 'Anggota Bendahara',
  wali_santri: 'Wali Santri',
  santri: 'Santri',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  pengasuh: 'bg-amber-100 text-amber-900 border-amber-300',
  kepala_pondok_putra: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  kepala_pondok_putri: 'bg-teal-100 text-teal-900 border-teal-300',
  pengurus_putra: 'bg-blue-100 text-blue-900 border-blue-300',
  pengurus_putri: 'bg-purple-100 text-purple-900 border-purple-300',
  kepala_bendahara: 'bg-pondok-100 text-pondok-900 border-pondok-300',
  admin_bendahara: 'bg-green-100 text-green-900 border-green-300',
  anggota_bendahara: 'bg-slate-100 text-slate-800 border-slate-300',
  wali_santri: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  santri: 'bg-sky-100 text-sky-900 border-sky-300',
};

export default function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const label = ROLE_LABELS[role] || role;
  const color = ROLE_COLORS[role] || 'bg-slate-100 text-slate-800 border-slate-300';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color} ${className}`}
    >
      {label}
    </span>
  );
}
