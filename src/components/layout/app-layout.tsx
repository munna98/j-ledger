'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Receipt,
  Users,
  Layers,
  FileText,
  BookOpen,
  Calendar,
  Wallet,
  LogOut,
  User as UserIcon,
  MoreHorizontal,
  X,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { useAuth } from '@/lib/auth-context';
import { triggerHaptic } from '@/lib/haptics';

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
    name: 'Statement',
    href: '/statement',
    description: 'Ledger report, print & export',
    icon: FileText,
  },
  {
    name: 'Fund',
    href: '/fund',
    description: 'Capital pool, rates & profit stats',
    icon: Wallet,
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
];

const PRIMARY_MOBILE_TABS: NavItem[] = [
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
    name: 'Statement',
    href: '/statement',
    description: 'Ledger report, print & export',
    icon: FileText,
  },
  {
    name: 'Fund',
    href: '/fund',
    description: 'Capital pool, rates & profit stats',
    icon: Wallet,
  },
];

const MORE_NAV_ITEMS: NavItem[] = [
  {
    name: 'Agents',
    href: '/agents',
    description: 'Profiles, balances & rate overrides',
    icon: Users,
  },
  {
    name: 'Rate Categories',
    href: '/rate-categories',
    description: 'Volume slab tier definitions',
    icon: Layers,
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const [todayFormatted, setTodayFormatted] = React.useState('');
  const [isMoreSheetOpen, setIsMoreSheetOpen] = React.useState(false);

  // Close more sheet whenever the route changes
  React.useEffect(() => {
    setIsMoreSheetOpen(false);
  }, [pathname]);

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

  // Protect all non-login pages
  React.useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [user, loading, pathname, router]);

  // If on login page, don't show the dashboard shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // Show clean spinner while checking authentication state
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#090d16] text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <span className="text-xs font-medium">Verifying authentication...</span>
        </div>
      </div>
    );
  }

  // If unauthenticated on a protected page, wait for redirect
  if (!user) {
    return null;
  }

  const getPageTitle = () => {
    if (pathname === '/sales' || pathname === '/') return 'Sales Transactions';
    if (pathname === '/fund') return 'Fund & Profit';
    if (pathname === '/receipts') return 'Receipt Collections';
    if (pathname === '/agents') return 'Agents & Ledgers';
    if (pathname === '/rate-categories') return 'Rate Slabs & Categories';
    if (pathname === '/statement') return 'Account Statement & Ledger';
    return 'J Ledger';
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const userInitial = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email
    ? user.email.charAt(0).toUpperCase()
    : 'J';

  const isMoreActive = MORE_NAV_ITEMS.some((item) => pathname === item.href);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col md:flex-row pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
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

        {/* Bottom Section: User profile & Theme Switcher */}
        <div className="p-3.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {user.name || user.email}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <ThemeSwitcher />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar for Desktop & Mobile with Safe Area Inset */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#090d16]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 lg:px-8 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:py-3.5 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Mobile Brand / Desktop Title */}
            <div className="flex items-center gap-2.5">
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
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>{todayFormatted}</span>
              </div>

              {/* Mobile Quick More / Logout Trigger */}
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  setIsMoreSheetOpen(true);
                }}
                title="Account & More"
                className="md:hidden p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70 flex items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div className="h-5 w-5 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                  {userInitial}
                </div>
              </button>

              <div className="hidden sm:flex items-center gap-1.5">
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

      {/* Mobile Bottom Tab Bar (Native 4 Tabs + More Sheet) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0e1422]/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-around px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg">
        {PRIMARY_MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href === '/sales' && pathname === '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => {
                setIsMoreSheetOpen(false);
                triggerHaptic('selection');
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-medium transition-all flex-1 min-h-[46px] relative active:scale-95 duration-75',
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              )}
            >
              <Icon className="h-5 w-5 mb-0.5 shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}

        {/* 5th Tab: More Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            setIsMoreSheetOpen((prev) => !prev);
          }}
          className={cn(
            'flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-medium transition-all flex-1 min-h-[46px] relative active:scale-95 duration-75 cursor-pointer',
            isMoreActive || isMoreSheetOpen
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          )}
        >
          <MoreHorizontal className="h-5 w-5 mb-0.5 shrink-0" />
          <span className="truncate">More</span>
          {isMoreActive && !isMoreSheetOpen && (
            <span className="absolute top-1.5 right-4 h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </nav>

      {/* Mobile "More" Slide-up Sheet */}
      {isMoreSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200"
            onClick={() => setIsMoreSheetOpen(false)}
          />

          {/* Sheet Drawer */}
          <div className="relative z-10 bg-white dark:bg-[#0e1422] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[85dvh] overflow-y-auto pb-[max(1.75rem,env(safe-area-inset-bottom))]">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-4 shrink-0" />

            {/* User Profile Card */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {user.name || user.email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreSheetOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modules Section */}
            <div className="space-y-1.5 mb-5">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Administration Modules
              </div>
              {MORE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      setIsMoreSheetOpen(false);
                      triggerHaptic('selection');
                    }}
                    className={cn(
                      'flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.99]',
                      isActive
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100 font-semibold'
                        : 'bg-white dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'p-2 rounded-xl shrink-0',
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{item.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.description}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                  </Link>
                );
              })}
            </div>

            {/* Theme & Settings Section */}
            <div className="space-y-2 mb-5">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Theme & Accent Color
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80">
                <ThemeSwitcher />
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl font-semibold text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 active:scale-[0.99] transition-transform cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out of Account</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
