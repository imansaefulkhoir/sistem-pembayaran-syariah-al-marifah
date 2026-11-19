import React from 'react';
import { InvoiceStatus, PaymentStatus } from '@/lib/types';
import { CheckCircle2, Clock, XCircle, AlertCircle, CircleDollarSign } from 'lucide-react';

interface StatusBadgeProps {
  status: InvoiceStatus | PaymentStatus;
  type?: 'invoice' | 'payment';
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  switch (status) {
    case 'lunas':
    case 'terverifikasi':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          {status === 'lunas' ? 'Lunas' : 'Terverifikasi'}
        </span>
      );

    case 'sebagian':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 ${className}`}
        >
          <CircleDollarSign className="w-3.5 h-3.5 text-sky-600" />
          Dibayar Sebagian
        </span>
      );

    case 'menunggu_verifikasi':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse ${className}`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Menunggu Verifikasi
        </span>
      );

    case 'belum_dibayar':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          Belum Dibayar
        </span>
      );

    case 'ditolak':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 ${className}`}
        >
          <XCircle className="w-3.5 h-3.5 text-red-600" />
          Ditolak
        </span>
      );

    case 'dibatalkan':
    case 'kedaluwarsa':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 ${className}`}
        >
          <XCircle className="w-3.5 h-3.5 text-slate-500" />
          {status === 'dibatalkan' ? 'Dibatalkan' : 'Kedaluwarsa'}
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 ${className}`}
        >
          {status}
        </span>
      );
  }
}
