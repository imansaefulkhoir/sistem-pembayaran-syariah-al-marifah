import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'emerald' | 'amber' | 'blue' | 'rose' | 'purple';
  trend?: string;
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'emerald',
}: StatsCardProps) {
  const variantStyles = {
    emerald: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconBg: 'bg-emerald-600 text-white',
      border: 'border-l-4 border-l-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      iconBg: 'bg-amber-500 text-white',
      border: 'border-l-4 border-l-amber-500',
    },
    blue: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      iconBg: 'bg-blue-600 text-white',
      border: 'border-l-4 border-l-blue-600',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      iconBg: 'bg-rose-600 text-white',
      border: 'border-l-4 border-l-rose-600',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      iconBg: 'bg-purple-600 text-white',
      border: 'border-l-4 border-l-purple-600',
    },
  };

  const style = variantStyles[variant] || variantStyles.emerald;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 transition-all duration-200 hover:shadow-md ${style.border}`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${style.iconBg}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
