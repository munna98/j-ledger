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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Agent, Entry, Transaction } from '@/types';
import { agentRepo, entryRepo, transactionRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentStatement } from '@/lib/accounting';
import { Badge } from '@/components/ui/badge';

function StatementContent() {
  const searchParams = useSearchParams();
  const queryAgentId = searchParams.get('agent_id');

  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>(queryAgentId || '');
  const [fromDate, setFromDate] = React.useState<string>('');
  const [toDate, setToDate] = React.useState<string>('');
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
      ['J Ledger - Agent Statement'],
      [`Agent: ${selectedAgent.name}`, `Account: ${selectedAgent.account_id}`],
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Agent Statement
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View transaction history, ledger balances, and export account statements.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handlePrint}
            disabled={!statement}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Print Statement"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!statement}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6 shadow-xs print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* Agent Picker */}
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Select Agent
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Presets */}
          <div className="sm:col-span-1 flex gap-1">
            <button
              type="button"
              onClick={() => setPreset('all')}
              className="w-full py-2 px-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              title="All Time"
            >
              All
            </button>
          </div>
        </div>

        {/* Quick range tabs */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <span className="text-slate-400 font-medium">Quick Filters:</span>
          <button
            type="button"
            onClick={() => setPreset('month')}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            This Month
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={() => setPreset('last30')}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Last 30 Days
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={() => setPreset('all')}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            All-Time
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading statement...</div>
      ) : !selectedAgent || !statement ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <User className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Agent Selected</h3>
          <p className="text-sm text-slate-500 mt-1">Please select an agent to view their ledger statement.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Statement Header Card (Printed & Displayed) */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {selectedAgent.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Account: <span className="font-mono">{selectedAgent.account_id}</span>
                  {selectedAgent.phone && ` • Phone: ${selectedAgent.phone}`}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Statement Period</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {fromDate ? formatDate(fromDate) : 'Beginning'} &mdash; {toDate ? formatDate(toDate) : 'Present'}
                </div>
              </div>
            </div>

            {/* Summary Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/60">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase font-medium">Opening Balance</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 flex items-center gap-1">
                  {formatNumber(statement.openingBalance.amount)}
                  {statement.openingBalance.type && (
                    <span className="text-xs font-semibold text-blue-600">
                      {statement.openingBalance.type}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase font-medium flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3 text-blue-600" />
                  Period Debits
                </div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  {formatNumber(statement.totalDebit)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase font-medium flex items-center gap-1">
                  <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                  Period Credits
                </div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  {formatNumber(statement.totalCredit)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60">
                <div className="text-[11px] text-blue-800 dark:text-blue-300 uppercase font-bold">
                  Closing Balance
                </div>
                <div className="font-mono font-bold text-base text-blue-900 dark:text-blue-100 mt-0.5 flex items-center gap-1">
                  {formatNumber(statement.closingBalance.amount)}
                  {statement.closingBalance.type && (
                    <Badge variant="info" className="text-[11px] font-bold">
                      {statement.closingBalance.type}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 w-28">Date</th>
                  <th className="px-4 py-3.5 w-28">Type</th>
                  <th className="px-4 py-3.5">Particulars</th>
                  <th className="px-4 py-3.5 text-right w-20">Qty</th>
                  <th className="px-4 py-3.5 text-right w-24">Rate</th>
                  <th className="px-4 py-3.5 text-right w-28">Debit</th>
                  <th className="px-4 py-3.5 text-right w-28">Credit</th>
                  <th className="px-4 py-3.5 text-right w-36">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* First Row: Opening Balance */}
                <tr className="bg-slate-50/40 dark:bg-slate-800/30 font-medium">
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                    {fromDate ? formatDate(fromDate) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant="default" className="text-[11px]">Opening Balance</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium italic">
                    Brought Forward Balance
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatNumber(statement.openingBalance.amount)}
                    {statement.openingBalance.type && (
                      <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">
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
                      : 'default';

                  return (
                    <tr key={index} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={typeBadgeVariant} className="text-[11px] font-medium">
                          {row.type || 'Transaction'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-slate-900 dark:text-slate-100">
                        {row.particulars}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 dark:text-white">
                        {row.qty !== undefined && row.qty > 0 ? row.qty : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {row.rate !== undefined && row.rate > 0 ? formatNumber(row.rate) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 dark:text-white">
                        {row.debit > 0 ? formatNumber(row.debit) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 dark:text-white">
                        {row.credit > 0 ? formatNumber(row.credit) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatNumber(row.balance)}
                        {row.balanceType && (
                          <span
                            className={`ml-1 text-xs font-semibold ${
                              row.balanceType === 'Dr'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-amber-600 dark:text-amber-400'
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
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">
                      No transactions recorded in this date range.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Totals Row */}
              <tfoot className="bg-slate-100 dark:bg-slate-800/90 font-semibold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                <tr>
                  <td className="px-4 py-3.5 font-mono text-xs">TOTALS</td>
                  <td className="px-4 py-3.5 text-slate-400">—</td>
                  <td className="px-4 py-3.5">Period Activity & Closing Balance</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-base">
                    {formatNumber(statement.totalDebit)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-base">
                    {formatNumber(statement.totalCredit)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-base text-blue-700 dark:text-blue-300">
                    {formatNumber(statement.closingBalance.amount)}
                    {statement.closingBalance.type && (
                      <span className="ml-1 text-xs">
                        {statement.closingBalance.type}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
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
