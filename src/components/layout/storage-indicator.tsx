'use client';

import * as React from 'react';
import { Database, CheckCircle2, AlertCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { migrateLocalStorageToSupabase, MigrationSummary } from '@/lib/repo/migrate';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function StorageIndicator() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [configured, setConfigured] = React.useState<boolean>(false);
  const [isMigrating, setIsMigrating] = React.useState(false);
  const [migrationResult, setMigrationResult] = React.useState<MigrationSummary | null>(null);
  const [migrationError, setMigrationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setMigrationError(null);
    setMigrationResult(null);
    try {
      const summary = await migrateLocalStorageToSupabase();
      setMigrationResult(summary);
      setTimeout(() => {
        window.location.reload();
      }, 1800);
    } catch (err: any) {
      setMigrationError(err.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border-slate-200/80 dark:border-slate-700/60 text-slate-700 dark:text-slate-300"
        title="Supabase Database Status"
      >
        {configured ? (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <Database className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Supabase</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <Database className="h-3.5 w-3.5 text-rose-500" />
            <span className="hidden sm:inline">Supabase (Not Connected)</span>
          </>
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md p-6 bg-white dark:bg-[#0e1422] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div
              className={`p-2.5 rounded-xl ${
                configured
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Supabase Database</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {configured ? 'Connected to PostgreSQL (jledger_* tables)' : 'Missing credentials in .env.local'}
              </p>
            </div>
          </div>

          <div className="py-4 space-y-4 text-xs text-slate-600 dark:text-slate-300">
            {configured ? (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300">Live on Supabase</div>
                  <div className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                    All transactions, agents, rates, and ledgers are read from and written directly to your Supabase PostgreSQL database.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-rose-800 dark:text-rose-300">Credentials Missing</div>
                  <div className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                    Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                    <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{' '}
                    <code className="font-mono font-semibold">.env.local</code> file and restart Next.js.
                  </div>
                </div>
              </div>
            )}

            {/* Migration Tool */}
            {configured && (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Migrate Existing Local Data</div>
                  <div className="text-[11px] text-slate-500">
                    If you have existing test data in browser localStorage, you can push it to your Supabase tables.
                  </div>
                </div>

                {migrationResult && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] space-y-1">
                    <div className="font-semibold">Successfully uploaded:</div>
                    <div>• {migrationResult.agents} agents</div>
                    <div>• {migrationResult.transactions} transactions</div>
                    <div>• {migrationResult.entries} ledger entries</div>
                    <div>• {migrationResult.funds} fund entries</div>
                    <div className="italic text-slate-500 mt-1">Reloading application...</div>
                  </div>
                )}

                {migrationError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px]">
                    {migrationError}
                  </div>
                )}

                <Button
                  onClick={handleMigrate}
                  disabled={isMigrating}
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isMigrating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Uploading data to Supabase...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5" />
                      Push Local Data to Supabase
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
