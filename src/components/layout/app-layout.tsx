'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Receipt,
  Users,
  Layers,
  FileText,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';

interface NavItem {
  name: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Sales',
    href: '/sales',
    description: 'Auto-rate sales & cancellations',
    icon: ShoppingBag,
  },
  {
    name: 'Receipts',
    href: '/receipts',
    description: 'Bank & cash collections',
    icon: Receipt,
  },
  {
    name: 'Agents',
    href: '/agents',
    description: 'Profiles, balances & overrides',
    icon: Users,
  },
  {
    name: 'Rate Categories',
    href: '/rate-categories',
    description: 'Volume slab tier definitions',
    icon: Layers,
  },
  {
    name: 'Statement',
    href: '/statement',
    description: 'Ledger report, print & export',
    icon: FileText,
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === '/sales' || pathname === '/') return 'Sales Transactions';
    if (pathname === '/receipts') return 'Receipt Collections';
    if (pathname === '/agents') return 'Agents & Ledgers';
    if (pathname === '/rate-categories') return 'Rate Slabs & Categories';
    if (pathname === '/statement') return 'Account Statement & Ledger';
    return 'J Ledger';
  };

  const [todayFormatted, setTodayFormatted] = React.useState('');

  React.useEffect(() => {
    const d = new Date();
    setTodayFormatted(
      d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  }, []);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#0e1422] shrink-0 sticky top-0 h-screen z-30 transition-colors">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 ring-1 ring-white/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-none">
                  J Ledger
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                  Fund
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Fund Ledger
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Accounting Modules
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href === '/sales' && pathname === '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative',
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-500" />
                )}
                <div
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="leading-tight truncate">{item.name}</div>
                  <div className="text-[11px] font-normal text-slate-400 dark:text-slate-500 truncate">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section: Theme Switcher */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          <ThemeSwitcher />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar for Desktop & Mobile */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#090d16]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 lg:px-8 py-3.5 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Mobile Brand / Desktop Title */}
            <div className="flex items-center gap-3">
              <div className="md:hidden h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold shadow-xs">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  {getPageTitle()}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  Ledgers & Reports
                </p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>{todayFormatted}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ThemeSwitcher compact />
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#0e1422]/90 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-around px-1 py-1.5 shadow-lg">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href === '/sales' && pathname === '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-medium transition-all min-w-[54px] relative',
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4 mb-1 shrink-0" />
              <span className="truncate max-w-[60px]">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
