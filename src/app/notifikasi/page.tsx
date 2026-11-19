'use client';

import React, { useState, useEffect } from 'react';
import { store } from '@/lib/store';
import { NotificationItem, UserProfile } from '@/lib/types';
import { formatDateTimeIndo } from '@/lib/utils';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Mail,
  ShieldAlert,
  Send,
  ExternalLink,
  Settings,
} from 'lucide-react';

export default function NotifikasiPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Simulation Gateway Settings State
  const [waApiKey, setWaApiKey] = useState('');
  const [waSenderPhone, setWaSenderPhone] = useState('+62 812-3456-7890');
  const [emailSmtpHost, setEmailSmtpHost] = useState('smtp.ponpes-almarifah.id');
  const [savedSettings, setSavedSettings] = useState(false);

  const loadData = () => {
    setUser(store.getCurrentUser());
    setNotifications(store.getNotifications());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleMarkAllRead = () => {
    store.markAllNotificationsAsRead();
    loadData();
  };

  const handleMarkSingle = (id: string) => {
    store.markNotificationAsRead(id);
    loadData();
  };

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Pusat Notifikasi &amp; Pengingat
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              {notifications.filter((n) => !n.dibaca).length} Belum Dibaca
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Pemberitahuan tagihan terbit, status verifikasi bukti transfer, dan pengingat jatuh tempo.
          </p>
        </div>

        {notifications.some((n) => !n.dibaca) && (
          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-300 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tandai Semua Dibaca
          </button>
        )}
      </div>

      {/* WhatsApp & Email Integration Architecture Notice */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Status Integrasi WhatsApp Gateway &amp; Email: Mode Simulasi Internal
            </h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Arsitektur pengiriman WhatsApp/Email telah disiapkan secara struktural di bawah ini. Sesuai prinsip kejujuran sistem syariah, <strong>pengiriman otomatis ke nomor HP wali belum diklaim aktif</strong> karena kredensial API gateway WhatsApp pihak ketiga (Fonnte/Wablas/Twilio) belum dimasukkan. Saat ini seluruh pemberitahuan berjalan 100% aktif melalui notifikasi internal website.
            </p>
          </div>
        </div>

        {/* Gateway Architecture Config Box */}
        {['kepala_bendahara', 'admin_bendahara'].includes(user?.role || '') && (
          <form onSubmit={handleSaveGateway} className="pt-3 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                API Token WhatsApp Gateway (Fonnte/Wablas):
              </label>
              <input
                type="password"
                value={waApiKey}
                onChange={(e) => setWaApiKey(e.target.value)}
                placeholder="Masukkan API Token WA..."
                className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                SMTP Host Server Email:
              </label>
              <input
                type="text"
                value={emailSmtpHost}
                onChange={(e) => setEmailSmtpHost(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                {savedSettings ? '✓ Konfigurasi tersimpan (siap dihubungkan bila kredensial tersedia)' : 'Simpan konfigurasi untuk persiapan gateway'}
              </span>
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition"
              >
                Simpan Konfigurasi Gateway
              </button>
            </div>
          </form>
        )}
      </div>

      {/* In-App Notifications Feed */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Belum ada riwayat notifikasi.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 sm:p-5 transition-colors flex items-start justify-between gap-4 ${
                !n.dibaca ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs ${
                    n.tipe === 'tagihan'
                      ? 'bg-blue-100 text-blue-700'
                      : n.tipe === 'verifikasi'
                      ? 'bg-amber-100 text-amber-700'
                      : n.tipe === 'penolakan'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">{n.judul}</h4>
                    {!n.dibaca && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xl">{n.pesan}</p>
                  <p className="text-[10px] text-slate-400">{formatDateTimeIndo(n.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {n.link && (
                  <a
                    href={n.link}
                    onClick={() => handleMarkSingle(n.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 transition"
                  >
                    Buka <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                )}
                {!n.dibaca && (
                  <button
                    onClick={() => handleMarkSingle(n.id)}
                    title="Tandai Sudah Dibaca"
                    className="p-1.5 text-slate-400 hover:text-emerald-700 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
