'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { store, canAccessModule } from '@/lib/store';
import type { UserProfile } from '@/lib/types';
import AdminChatbotPanel from '@/components/chatbot/AdminChatbotPanel';
import { buildAdminScope } from '@/lib/chatbot-admin/rbac';
import { CAPABILITY_LABELS } from '@/lib/chatbot-admin/types';
import {
  Bot,
  ShieldAlert,
  ShieldCheck,
  Database,
  Lock,
  ArrowRight,
  Headset,
} from 'lucide-react';

/**
 * Halaman Asisten Admin.
 *
 * Penjaga akses memakai `canAccessModule` dan `buildAdminScope` dari sesi
 * pengguna yang sedang aktif. Wali santri & santri diarahkan ke chatbot
 * bantuan biasa dan TIDAK pernah melihat panel asisten admin.
 */
export default function AsistenAdminPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      setUser(store.getCurrentUser());
      setReady(true);
    };
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500">
        Memeriksa sesi dan kewenangan…
      </div>
    );
  }

  const allowed = Boolean(user && user.isActive && canAccessModule(user.role, 'asisten_admin'));
  const scope = buildAdminScope(user);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-56 h-56 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <Bot className="w-6 h-6 text-gold-300" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">Asisten Admin</h1>
              <p className="text-xs text-emerald-200 mt-1 max-w-2xl">
                Tanyakan data santri, wali, tagihan, pembayaran, tunggakan, keuangan, pengguna,
                aktivitas, dan Telegram. Jawaban hanya dari data aplikasi yang boleh diakses role Anda.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-emerald-400/30">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              RBAC aktif
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-emerald-400/30">
              <Lock className="w-3.5 h-3.5 text-emerald-300" />
              Role dari sesi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-emerald-400/30">
              <Database className="w-3.5 h-3.5 text-emerald-300" />
              Data terkontrol
            </span>
          </div>
        </div>
      </div>

      {!allowed ? (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Asisten Admin tidak tersedia</h2>
              <p className="text-sm text-slate-600">
                {scope.reason ||
                  'Akun Anda tidak memiliki kewenangan untuk asisten admin.'}
              </p>
              <p className="text-xs text-slate-500">
                Role Anda saat ini:{' '}
                <span className="font-semibold text-slate-700">
                  {user ? user.role.replace(/_/g, ' ') : 'tidak ada sesi'}
                </span>
                . Akses tidak dapat dinaikkan melalui teks pertanyaan; role hanya berasal dari sesi login.
              </p>
              <div className="pt-2 flex flex-wrap gap-2">
                <Link
                  href="/bantuan"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold"
                >
                  <Headset className="w-3.5 h-3.5" />
                  Buka Bantuan
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Kembali ke Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {user && <AdminChatbotPanel user={user} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Kewenangan role Anda
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Cakupan: <span className="font-semibold text-slate-700">{scope.label}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scope.capabilities.length === 0 && (
                  <span className="text-xs text-slate-500">Tidak ada modul data.</span>
                )}
                {scope.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10.5px] font-semibold"
                  >
                    {CAPABILITY_LABELS[cap]}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-600" />
                Sumber data saat ini
              </h3>
              <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                <li>• Mode demo: data tersimpan di localStorage browser ini.</li>
                <li>• Supabase belum dikonfigurasi pada lingkungan ini, jadi belum ada koneksi database live.</li>
                <li>• Angka dihitung ulang setiap pertanyaan dari data yang ada, bukan dari cache AI.</li>
                <li>• AI (jika aktif) hanya mengenali maksud pertanyaan; tidak menerima data dan tidak menentukan akses.</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
