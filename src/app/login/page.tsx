'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';
import { UserRole } from '@/lib/types';
import { DEMO_USERS } from '@/lib/demo-data';
import { ROLE_LABELS, ROLE_COLORS } from '@/components/layout/RoleBadge';
import Logo from '@/components/shared/Logo';
import { notifyTelegramEvent } from '@/lib/telegram/client';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

const STAFF_ROLES: UserRole[] = [
  'pengasuh',
  'kepala_pondok_putra',
  'kepala_pondok_putri',
  'pengurus_putra',
  'pengurus_putri',
  'kepala_bendahara',
  'admin_bendahara',
  'anggota_bendahara',
];

/** Kirim notifikasi hanya untuk login akun staf/admin (bukan wali/santri). */
function notifyAdminLogin(user: { name: string; email: string; role: UserRole }): void {
  if (!STAFF_ROLES.includes(user.role)) return;
  notifyTelegramEvent('admin_login', {
    name: user.name,
    email: user.email,
    role: ROLE_LABELS[user.role],
    details: 'Login berhasil melalui portal admin.',
    url: '/dashboard',
  });
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('kepala_bendahara');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleQuickLogin = (role: UserRole) => {
    setLoading(true);
    setTimeout(() => {
      const loggedIn = store.switchRole(role);
      notifyAdminLogin(loggedIn);
      router.push('/dashboard');
    }, 400);
  };

  const handleFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    setTimeout(() => {
      // Cari kecocokan user
      const matched = DEMO_USERS.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );

      if (matched) {
        store.setCurrentUser(matched);
        notifyAdminLogin(matched);
        router.push('/dashboard');
      } else {
        // Jika form diisi manual tanpa email terdaftar di demo
        const loggedIn = store.switchRole(selectedRole);
        notifyAdminLogin(loggedIn);
        router.push('/dashboard');
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Side: Brand & Visual */}
        <div className="lg:col-span-5 text-white space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-800/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-gold-400" />
            Portal Keuangan Syariah Terpadu
          </div>

          <div className="space-y-3">
            <Logo size={70} showText={false} className="mb-2" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
              Sistem Pembayaran Syariah
            </h1>
            <p className="text-base sm:text-lg font-medium text-emerald-300">
              Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah
            </p>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Memudahkan wali santri dan santri menunaikan kewajiban uang makan, SPP sekolah, dan syariah pondok secara aman, transparan, dan berlandaskan prinsip muamalah syariah.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
            <div className="flex items-center gap-2 text-gold-300 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Keunggulan Sistem
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                Multi-Role RBAC: 10 peran dengan hak akses terspesialisasi
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                Verifikasi transfer bank, QRIS syariah, dan kas tunai loket
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                Penerbitan kuitansi bernomor unik &amp; laporan transparansi
              </li>
            </ul>
          </div>
        </div>

        {/* Right Side: Login Card & Quick Role Selector */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Masuk ke Sistem</h2>
            <p className="text-xs text-slate-500 mt-1">
              Gunakan form masuk atau pilih akun percontohan (demo) di bawah untuk langsung menguji fungsi sistem.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Quick Demo Role Grid */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Cepat Peran Demo (1-Click Test Drive):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/60">
              {DEMO_USERS.map((usr) => {
                const isSelected = selectedRole === usr.role;
                return (
                  <button
                    key={usr.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(usr.role);
                      setEmail(usr.email);
                      setPassword('password123');
                    }}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-500 shadow-xs ring-1 ring-emerald-500'
                        : 'bg-white border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 truncate text-[11.5px]">
                        {usr.name}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {ROLE_LABELS[usr.role]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleFormLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Email Pengguna
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="bendahara@almarifah.ponpes.id"
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs sm:text-sm hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md shadow-emerald-900/20 disabled:opacity-50"
              >
                {loading ? 'Memproses...' : 'Masuk Sekarang'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin(selectedRole)}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 text-white font-bold text-xs sm:text-sm hover:bg-amber-600 transition-all shadow-md shadow-amber-900/10 disabled:opacity-50"
                title="Langsung masuk dengan peran terpilih"
              >
                Masuk Cepat ({ROLE_LABELS[selectedRole].split(' ')[0]})
              </button>
            </div>
          </form>

          <p className="text-[11px] text-center text-slate-400 mt-5">
            © {new Date().getFullYear()} Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah. Seluruh hak cipta dilindungi.
          </p>
        </div>

      </div>
    </div>
  );
}
