'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Arahkan otomatis ke dashboard
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
      <h2 className="text-lg font-bold text-slate-800">
        Memuat Sistem Pembayaran Syariah...
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        Pondok Pesantren Kebon Kelapa Al-Ma&apos;rifah
      </p>
    </div>
  );
}
