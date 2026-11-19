'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';
import { UserProfile, UserRole, NotificationItem } from '@/lib/types';
import RoleBadge, { ROLE_LABELS } from './RoleBadge';
import {
  Bell,
  CheckCircle2,
  Menu,
  ChevronDown,
  UserCheck,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import Logo from '../shared/Logo';
import { formatDateTimeIndo } from '@/lib/utils';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const reloadData = () => {
    setCurrentUser(store.getCurrentUser());
    setNotifications(store.getNotifications());
  };

  useEffect(() => {
    reloadData();
    const handleStorage = () => reloadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!currentUser) return null;

  const unreadCount = notifications.filter((n) => !n.dibaca).length;

  const handleRoleSwitch = (newRole: UserRole) => {
    store.switchRole(newRole);
    setShowRoleDropdown(false);
    reloadData();
    router.refresh();
  };

  const handleMarkAllRead = () => {
    store.markAllNotificationsAsRead();
    reloadData();
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Mobile hamburger & Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden">
            <Logo size={36} showText={false} />
          </div>
          <div className="hidden sm:block lg:hidden">
            <span className="font-bold text-slate-800 text-sm">PP Kebon Kelapa Al-Ma&apos;rifah</span>
          </div>
        </div>

        {/* Center: System Title Banner */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200 text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Sistem Pembayaran Syariah • Bebas Riba, Transparan &amp; Amanah
        </div>

        {/* Right: Quick Role Switcher, Notifications, User profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Role Switcher Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowRoleDropdown(!showRoleDropdown);
                setShowNotifDropdown(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors shadow-xs"
              title="Ganti Peran / Hak Akses untuk Uji Coba"
            >
              <UserCheck className="w-4 h-4 text-amber-700" />
              <span className="hidden md:inline">Uji Peran:</span>
              <span className="max-w-[120px] truncate">{ROLE_LABELS[currentUser.role]}</span>
              <ChevronDown className="w-3.5 h-3.5 text-amber-700" />
            </button>

            {/* Dropdown 10 Roles */}
            {showRoleDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-bold text-slate-800">Uji Coba Hak Akses (RBAC)</p>
                  <p className="text-[11px] text-slate-500">Pilih salah satu dari 10 peran sistem:</p>
                </div>
                <div className="max-h-80 overflow-y-auto py-1 divide-y divide-slate-100">
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => {
                    const isActive = currentUser.role === r;
                    return (
                      <button
                        key={r}
                        onClick={() => handleRoleSwitch(r)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 transition-colors ${
                          isActive ? 'bg-emerald-50/80 font-bold text-emerald-800' : 'text-slate-700'
                        }`}
                      >
                        <span className="truncate">{ROLE_LABELS[r]}</span>
                        {isActive && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifDropdown(!showNotifDropdown);
                setShowRoleDropdown(false);
              }}
              className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Notifikasi"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Pemberitahuan Sistem</h4>
                    <p className="text-[11px] text-slate-500">{unreadCount} notifikasi belum dibaca</p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Tandai Dibaca
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Belum ada notifikasi baru
                    </div>
                  ) : (
                    notifications.slice(0, 6).map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 text-xs transition-colors hover:bg-slate-50 ${
                          !n.dibaca ? 'bg-emerald-50/40 font-medium' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-800">{n.judul}</span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateTimeIndo(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">{n.pesan}</p>
                        {n.link && (
                          <button
                            onClick={() => {
                              store.markNotificationAsRead(n.id);
                              setShowNotifDropdown(false);
                              router.push(n.link!);
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold hover:underline"
                          >
                            Lihat Rincian <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-slate-100 text-center">
                  <button
                    onClick={() => {
                      setShowNotifDropdown(false);
                      router.push('/notifikasi');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    Buka Halaman Notifikasi Lengkap →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User profile avatar & badge */}
          <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-emerald-800 text-gold-300 font-bold flex items-center justify-center text-xs shadow-xs">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 max-w-[130px] truncate">
                {currentUser.name}
              </span>
              <RoleBadge role={currentUser.role} className="text-[10px] px-1.5 py-0" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
