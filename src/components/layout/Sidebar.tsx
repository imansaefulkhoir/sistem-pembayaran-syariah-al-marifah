'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { store, canAccessModule } from '@/lib/store';
import { UserProfile } from '@/lib/types';
import Logo from '../shared/Logo';
import RoleBadge from './RoleBadge';
import {
  LayoutDashboard,
  Users,
  UserCheck2,
  Receipt,
  FileCheck2,
  History,
  FileText,
  BarChart3,
  Bell,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  CreditCard,
  Headset,
  Bot,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshState = () => {
    setUser(store.getCurrentUser());
    const pending = store.getPayments().filter((p) => p.status === 'menunggu_verifikasi').length;
    setPendingCount(pending);
  };

  useEffect(() => {
    refreshState();
    const handleStorage = () => refreshState();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [pathname]);

  if (!user) return null;

  const navItems = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      module: 'dashboard',
    },
    {
      title: 'Data Santri',
      href: '/santri',
      icon: Users,
      module: 'santri',
      badge: user.unitAccess !== 'semua' ? user.unitAccess?.toUpperCase() : undefined,
    },
    {
      title: 'Wali Santri',
      href: '/wali',
      icon: UserCheck2,
      module: 'wali',
    },
    {
      title: 'Tagihan Santri',
      href: '/tagihan',
      icon: CreditCard,
      module: 'tagihan',
    },
    {
      title: 'Verifikasi Pembayaran',
      href: '/verifikasi',
      icon: FileCheck2,
      module: 'verifikasi',
      badge: pendingCount > 0 ? String(pendingCount) : undefined,
      badgeColor: 'bg-amber-500 text-white animate-pulse',
    },
    {
      title: 'Riwayat Transaksi',
      href: '/transaksi',
      icon: History,
      module: 'transaksi',
    },
    {
      title: 'Kuitansi Resmi',
      href: '/kuitansi',
      icon: Receipt,
      module: 'kuitansi',
    },
    {
      title: 'Laporan & Tunggakan',
      href: '/laporan',
      icon: BarChart3,
      module: 'laporan',
    },
    {
      title: 'Notifikasi',
      href: '/notifikasi',
      icon: Bell,
      module: 'dashboard',
    },
    {
      title: 'Manajemen Pengguna',
      href: '/pengguna',
      icon: ShieldCheck,
      module: 'pengguna',
    },
    {
      title: 'Bantuan Bendahara',
      href: '/bantuan',
      icon: Headset,
      module: 'bantuan',
    },
    {
      title: 'Asisten Admin',
      href: '/asisten-admin',
      icon: Bot,
      module: 'asisten_admin',
      badge: 'AI',
      badgeColor: 'bg-gold-500/90 text-slate-900 border border-gold-400',
    },
    {
      title: 'Pengaturan & Bank',
      href: '/pengaturan',
      icon: Settings,
      module: 'pengaturan',
    },
  ];

  const allowedNav = navItems.filter((item) => canAccessModule(user.role, item.module));

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950 text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Brand Header */}
        <div className="p-4 border-b border-emerald-800/40 flex items-center justify-between">
          <Link href="/dashboard" onClick={onClose}>
            <Logo size={42} showText={true} className="text-white brightness-105" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card in Sidebar */}
        <div className="p-4 mx-3 my-2 rounded-xl bg-emerald-950/60 border border-emerald-700/40 shadow-inner">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-700 text-gold-300 font-bold flex items-center justify-center text-sm border-2 border-gold-400 shadow-md">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user.name}</p>
              <p className="text-[11px] text-emerald-300 truncate">{user.email}</p>
              <div className="mt-1">
                <RoleBadge role={user.role} className="text-[9.5px] px-2 py-0 border-none bg-emerald-800/90 text-emerald-100" />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
            Menu Navigasi
          </p>

          {allowedNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold shadow-md shadow-emerald-900/40 border border-emerald-400/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-gold-300' : 'text-emerald-400 group-hover:text-emerald-300'
                    }`}
                  />
                  <span>{item.title}</span>
                </div>

                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs ${
                      item.badgeColor || 'bg-emerald-900/80 text-emerald-200 border border-emerald-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom Footer Information */}
        <div className="p-3 border-t border-emerald-900/60 bg-black/20 text-center">
          <div className="flex items-center justify-between px-2 text-[11px] text-slate-400 mb-2">
            <span>Versi Syariah v1.0.0</span>
            <span className="text-emerald-400 font-medium">Bebas Riba</span>
          </div>
          <Link
            href="/login"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-950/40 text-red-300 hover:bg-red-900/60 hover:text-white transition-colors text-xs font-semibold border border-red-800/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Akun (Ganti Sesi)
          </Link>
        </div>
      </aside>
    </>
  );
}
