'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  Download,
  Calendar,
  User,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Scale,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Agent, Entry, Transaction } from '@/types';
import { agentRepo, entryRepo, transactionRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentStatement } from '@/lib/accounting';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';

function StatementContent() {
  const searchParams = useSearchParams();
  const queryAgentId = searchParams.get('agent_id');

  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>(queryAgentId || '');
  const [fromDate, setFromDate] = React.useState<string>('');
  const [toDate, setToDate] = React.useState<string>('');
  const [activePreset, setActivePreset] = React.useState<'month' | 'last30' | 'all' | 'custom'>('month');
  const [loading, setLoading] = React.useState<boolean>(true);

  // Set default dates: first day of current month to today
  React.useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setFromDate(`${yyyy}-${mm}-01`);
    setToDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allAgents, allEntries, allTransactions] = await Promise.all([
        agentRepo.getAll(),
        entryRepo.getAll(),
        transactionRepo.getAll(),
      ]);
      setAgents(allAgents);
      setEntries(allEntries);
      setTransactions(allTransactions);

      if (!selectedAgentId && allAgents.length > 0) {
        setSelectedAgentId(queryAgentId || allAgents[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [queryAgentId, selectedAgentId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedAgent = React.useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const statement = React.useMemo(() => {
    if (!selectedAgent) return null;
    return calculateAgentStatement(
      entries,
      selectedAgent,
      fromDate || undefined,
      toDate || undefined,
      transactions
    );
  }, [entries, selectedAgent, fromDate, toDate, transactions]);

  const setPreset = (preset: 'month' | 'last30' | 'all') => {
    setActivePreset(preset);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (preset === 'month') {
      setFromDate(`${yyyy}-${mm}-01`);
      setToDate(todayStr);
    } else if (preset === 'last30') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const pY = past.getFullYear();
      const pM = String(past.getMonth() + 1).padStart(2, '0');
      const pD = String(past.getDate()).padStart(2, '0');
      setFromDate(`${pY}-${pM}-${pD}`);
      setToDate(todayStr);
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const handleExportExcel = () => {
    if (!statement || !selectedAgent) return;

    const aoa: any[][] = [
      ['J Ledger - Agent Account Statement'],
      [`Agent: ${selectedAgent.name}`, `Account ID: ${selectedAgent.account_id}`],
      [`Period: ${fromDate ? formatDate(fromDate) : 'Beginning'} to ${toDate ? formatDate(toDate) : 'Present'}`],
      [],
      ['Date', 'Type', 'Particulars', 'Qty', 'Rate', 'Debit', 'Credit', 'Balance'],
    ];

    // Opening balance row
    aoa.push([
      fromDate ? formatDate(fromDate) : '-',
      'Opening Balance',
      'Opening Balance',
      '',
      '',
      '',
      '',
      `${formatNumber(statement.openingBalance.amount)} ${statement.openingBalance.type}`.trim(),
    ]);

    // Rows
    for (const row of statement.rows) {
      aoa.push([
        formatDate(row.date),
        row.type || '',
        row.particulars,
        row.qty !== undefined && row.qty > 0 ? row.qty : '',
        row.rate !== undefined && row.rate > 0 ? formatNumber(row.rate) : '',
        row.debit > 0 ? formatNumber(row.debit) : '',
        row.credit > 0 ? formatNumber(row.credit) : '',
        `${formatNumber(row.balance)} ${row.balanceType}`.trim(),
      ]);
    }

    // Totals row
    aoa.push([
      '',
      '',
      'Total / Closing Balance',
      '',
      '',
      formatNumber(statement.totalDebit),
      formatNumber(statement.totalCredit),
      `${formatNumber(statement.closingBalance.amount)} ${statement.closingBalance.type}`.trim(),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto-fit column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 16 }, // Type
      { wch: 38 }, // Particulars
      { wch: 10 }, // Qty
      { wch: 14 }, // Rate
      { wch: 16 }, // Debit
      { wch: 16 }, // Credit
      { wch: 18 }, // Balance
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Agent Statement');

    const cleanAgentName = selectedAgent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fDate = fromDate || 'start';
    const tDate = toDate || 'end';
    const fileName = `agent-statement_${cleanAgentName}_${fDate}_${tDate}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileText className="h-6 w-6" />
            </div>
            Account Statement & Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Running double-entry transaction ledger with opening & closing balances and Excel export.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!statement}
            title="Print Statement"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={!statement}
          >
            <Download className="h-4 w-4" />
            <span>Export Excel</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-2xs print:hidden space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* Agent Picker */}
          <div className="sm:col-span-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Agent Account
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.phone || 'No phone'})
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset('custom');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* To Date */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset('custom');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Quick range tabs */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 font-medium">Quick Date Range:</span>
          <button
            type="button"
            onClick={() => setPreset('month')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activePreset === 'month'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            This Month
          </button>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <button
            type="button"
            onClick={() => setPreset('last30')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activePreset === 'last30'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Last 30 Days
          </button>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <button
            type="button"
            onClick={() => setPreset('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activePreset === 'all'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-medium">Loading ledger statement...</p>
        </div>
      ) : !selectedAgent || !statement ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <User className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Agent Selected</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Please choose an agent to generate their official ledger statement.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Statement KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <StatCard
              title="Opening Balance"
              value={formatNumber(statement.openingBalance.amount)}
              icon={Scale}
              variant="slate"
              badge={statement.openingBalance.type || undefined}
            />
            <StatCard
              title="Period Debits"
              value={formatNumber(statement.totalDebit)}
              icon={ArrowUpRight}
              variant="amber"
            />
            <StatCard
              title="Period Credits"
              value={formatNumber(statement.totalCredit)}
              icon={ArrowDownLeft}
              variant="emerald"
            />
            <StatCard
              title="Closing Balance"
              value={formatNumber(statement.closingBalance.amount)}
              icon={DollarSign}
              variant={statement.closingBalance.type === 'Dr' ? 'amber' : 'emerald'}
              badge={statement.closingBalance.type || 'Settled'}
            />
          </div>

          {/* Statement Sheet / Document Card */}
          <div className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-2xs print:border-none print:shadow-none print:p-0">
            {/* Statement Header Card (Printed & Displayed) */}
            <div className="p-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      Statement of Account
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {selectedAgent.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    A/C: {selectedAgent.account_id}
                    {selectedAgent.phone && ` • Phone: ${selectedAgent.phone}`}
                  </p>
                </div>

                <div className="text-left sm:text-right bg-white dark:bg-slate-900/90 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-none border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Statement Period</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                    {fromDate ? formatDate(fromDate) : 'Start'} &mdash; {toDate ? formatDate(toDate) : 'Current Date'}
                  </div>
                </div>
              </div>
            </div>

            {/* Statement Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800/80">
                  <tr>
                    <th className="px-4 py-3.5 w-28">Date</th>
                    <th className="px-4 py-3.5 w-28">Type</th>
                    <th className="px-4 py-3.5">Particulars / Details</th>
                    <th className="px-4 py-3.5 text-right w-20">Qty</th>
                    <th className="px-4 py-3.5 text-right w-24">Rate</th>
                    <th className="px-4 py-3.5 text-right w-28">Debit</th>
                    <th className="px-4 py-3.5 text-right w-28">Credit</th>
                    <th className="px-4 py-3.5 text-right w-36">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {/* First Row: Opening Balance */}
                  <tr className="bg-slate-50/50 dark:bg-slate-900/40 font-medium">
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                      {fromDate ? formatDate(fromDate) : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="neutral" className="text-[10px]">Opening</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium italic">
                      Brought Forward Opening Balance
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatNumber(statement.openingBalance.amount)}
                      {statement.openingBalance.type && (
                        <span className="ml-1 text-xs text-slate-500 font-semibold">
                          {statement.openingBalance.type}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Transaction Rows */}
                  {statement.rows.map((row, index) => {
                    const typeBadgeVariant =
                      row.type === 'Sale'
                        ? 'info'
                        : row.type === 'Receipt'
                        ? 'success'
                        : row.type === 'Cancel'
                        ? 'warning'
                        : 'neutral';

                    return (
                      <tr key={index} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant={typeBadgeVariant} dot className="text-[10px] font-semibold">
                            {row.type || 'Entry'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-slate-900 dark:text-slate-100 font-medium">
                          {row.particulars}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-900 dark:text-white">
                          {row.qty !== undefined && row.qty > 0 ? row.qty : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.rate !== undefined && row.rate > 0 ? formatNumber(row.rate) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {row.debit > 0 ? formatNumber(row.debit) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {row.credit > 0 ? formatNumber(row.credit) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatNumber(row.balance)}
                          {row.balanceType && (
                            <span
                              className={`ml-1 text-xs font-bold ${
                                row.balanceType === 'Dr'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {row.balanceType}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {statement.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400 italic">
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals Row */}
                <tfoot className="bg-slate-100/90 dark:bg-slate-900 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                  <tr>
                    <td className="px-4 py-4 font-mono text-xs">TOTALS</td>
                    <td className="px-4 py-4 text-slate-400">—</td>
                    <td className="px-4 py-4">Total Period Activity & Net Closing</td>
                    <td className="px-4 py-4 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-4 text-right font-mono text-slate-400">—</td>
                    <td className="px-4 py-4 text-right font-mono text-base text-amber-600 dark:text-amber-400">
                      {formatNumber(statement.totalDebit)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base text-emerald-600 dark:text-emerald-400">
                      {formatNumber(statement.totalCredit)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base text-indigo-600 dark:text-indigo-400">
                      {formatNumber(statement.closingBalance.amount)}
                      {statement.closingBalance.type && (
                        <span className="ml-1 text-xs font-bold">
                          {statement.closingBalance.type}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatementPage() {
  return (
    <React.Suspense
      fallback={<div className="p-8 text-center text-slate-500">Loading agent statement...</div>}
    >
      <StatementContent />
    </React.Suspense>
  );
}
