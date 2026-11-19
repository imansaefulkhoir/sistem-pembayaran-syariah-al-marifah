import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export default function Logo({ className = '', size = 44, showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative flex-shrink-0 rounded-full shadow-md overflow-hidden bg-emerald-900 border-2 border-gold-400 p-0.5"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo.svg"
          alt="Logo Ponpes Kebon Kelapa Al-Ma'rifah"
          className="w-full h-full object-cover rounded-full"
          onError={(e) => {
            // Fallback jika file svg belum terload
            const target = e.target as HTMLImageElement;
            target.src = '/logo.svg';
          }}
        />
      </div>
      {showText && (
        <div className="flex flex-col text-left">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-800 dark:text-emerald-300">
            Pondok Pesantren
          </span>
          <span className="font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight text-sm sm:text-base">
            Kebon Kelapa Al-Ma&apos;rifah
          </span>
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
            Sistem Pembayaran Syariah
          </span>
        </div>
      )}
    </div>
  );
}
