'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
  className?: string;
  badge?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'blue',
  className,
  badge,
}: StatCardProps) {
  const variantStyles = {
    blue: {
      iconBg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/50',
      accentBar: 'bg-blue-500',
    },
    emerald: {
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/50',
      accentBar: 'bg-emerald-500',
    },
    amber: {
      iconBg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/50',
      accentBar: 'bg-amber-500',
    },
    rose: {
      iconBg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/50',
      accentBar: 'bg-rose-500',
    },
    violet: {
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/50',
      accentBar: 'bg-indigo-500',
    },
    slate: {
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60',
      accentBar: 'bg-slate-500',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className={cn(
        'relative bg-white dark:bg-slate-900/80 rounded-xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800/80 shadow-xs hover:shadow-md transition-all duration-200 group overflow-hidden',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            {title}
          </p>
          <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white truncate">
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className={cn(
              'h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 duration-200',
              style.iconBg
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {(subtitle || badge) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {badge && (
            <span className="font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
