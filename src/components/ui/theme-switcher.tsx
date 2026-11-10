'use client';

import * as React from 'react';
import { Sun, Moon, Laptop, Palette, Check } from 'lucide-react';
import { useTheme, ThemeMode, AccentColor } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

export function ThemeSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, setTheme, accent, setAccent, resolvedTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const accents: { id: AccentColor; label: string; colorClass: string }[] = [
    { id: 'emerald', label: 'Emerald Ledger', colorClass: 'bg-emerald-500' },
    { id: 'blue', label: 'Sapphire Blue', colorClass: 'bg-blue-500' },
    { id: 'violet', label: 'Modern Violet', colorClass: 'bg-indigo-500' },
  ];

  if (compact) {
    return (
      <div className={cn('relative inline-flex items-center gap-1', className)} ref={containerRef}>
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600" />
          )}
          <span className="sr-only">Toggle theme</span>
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title="Theme & Colors"
          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Palette className="h-4 w-4" />
          <span className="sr-only">Theme settings</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-3 z-50 text-xs animate-in fade-in-0 duration-150">
            <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] mb-2 px-1">
              Color Mode
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg mb-3">
              {(
                [
                  { id: 'light', icon: Sun, label: 'Light' },
                  { id: 'dark', icon: Moon, label: 'Dark' },
                  { id: 'system', icon: Laptop, label: 'Auto' },
                ] as const
              ).map((mode) => {
                const Icon = mode.icon;
                const active = theme === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setTheme(mode.id as ThemeMode)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-all cursor-pointer text-xs',
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] mb-2 px-1">
              Accent Theme
            </div>
            <div className="space-y-1">
              {accents.map((item) => {
                const active = accent === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setAccent(item.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left',
                      active
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('h-3 w-3 rounded-full', item.colorClass)} />
                      <span>{item.label}</span>
                    </div>
                    {active && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sidebar / Full view
  return (
    <div className={cn('space-y-2.5', className)} ref={containerRef}>
      {/* Mode Selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Appearance</span>
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
          {(
            [
              { id: 'light', icon: Sun, title: 'Light Mode' },
              { id: 'dark', icon: Moon, title: 'Dark Mode' },
              { id: 'system', icon: Laptop, title: 'System Default' },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            const active = theme === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setTheme(m.id as ThemeMode)}
                title={m.title}
                className={cn(
                  'p-1.5 rounded-md transition-all cursor-pointer',
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent Colors */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Accent</span>
        <div className="flex items-center gap-1.5">
          {accents.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAccent(item.id)}
              title={item.label}
              className={cn(
                'h-5 w-5 rounded-full transition-transform cursor-pointer flex items-center justify-center',
                item.colorClass,
                accent === item.id ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 scale-110' : 'opacity-70 hover:opacity-100'
              )}
            >
              {accent === item.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
