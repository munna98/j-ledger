'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Share2,
  Check,
  ArrowLeft,
  Eye,
  ExternalLink,
  Search,
  Compass,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toBlob } from 'html-to-image';
import { Agent, Entry, Transaction, StatementRow } from '@/types';
import { agentRepo, entryRepo, transactionRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentStatement } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface DrillTarget {
  url: string;
  sourceModule: 'Sales' | 'Receipts' | 'Agents' | 'Ledger';
  actionLabel: string;
  badgeVariant: 'info' | 'success' | 'warning' | 'neutral';
  isAvailable: boolean;
}

function getDrillTarget(
  row: StatementRow,
  agent: Agent | null,
  transactions: Transaction[]
): DrillTarget {
  const tx = row.transaction_id
    ? transactions.find((t) => t.id === row.transaction_id)
    : undefined;
  const effectiveType = tx?.type || row.transaction_type;

  if (effectiveType === 'sale' || row.type === 'Sale') {
    return {
      url: `/sales?highlight=${row.transaction_id || ''}`,
      sourceModule: 'Sales',
      actionLabel: 'Drill to Sale Entry',
      badgeVariant: 'info',
      isAvailable: Boolean(row.transaction_id),
    };
  }

  if (effectiveType === 'receipt' || row.type === 'Receipt') {
    return {
      url: `/receipts?highlight=${row.transaction_id || ''}`,
      sourceModule: 'Receipts',
      actionLabel: 'Drill to Receipt Entry',
      badgeVariant: 'success',
      isAvailable: Boolean(row.transaction_id),
    };
  }

  if (effectiveType === 'sale_cancel' || row.type === 'Cancel') {
    const parentSaleId = tx?.cancel_details?.sale_id;
    const url = parentSaleId
      ? `/sales?highlight=${parentSaleId}&cancel_id=${row.transaction_id}`
      : `/sales?highlight=${row.transaction_id || ''}`;
    return {
      url,
      sourceModule: 'Sales',
      actionLabel: 'Drill to Cancel Entry',
      badgeVariant: 'warning',
      isAvailable: Boolean(row.transaction_id),
    };
  }

  if (effectiveType === 'opening_balance' || row.type === 'Opening Balance') {
    return {
      url: agent ? `/agents?highlight=${agent.id}` : '/agents',
      sourceModule: 'Agents',
      actionLabel: 'Drill to Agent Setup',
      badgeVariant: 'neutral',
      isAvailable: Boolean(agent?.id),
    };
  }

  return {
    url: `/sales?highlight=${row.transaction_id || ''}`,
    sourceModule: 'Ledger',
    actionLabel: 'Drill to Entry',
    badgeVariant: 'neutral',
    isAvailable: Boolean(row.transaction_id),
  };
}

function StatementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryAgentId = searchParams.get('agent_id');

  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>(queryAgentId || '');
  const [fromDate, setFromDate] = React.useState<string>('');
  const [toDate, setToDate] = React.useState<string>('');
  const [activePreset, setActivePreset] = React.useState<'month' | 'last7' | 'last30' | 'all' | 'custom'>('month');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = React.useState<boolean>(false);
  const [copiedNotice, setCopiedNotice] = React.useState<boolean>(false);
  const statementCardRef = React.useRef<HTMLDivElement>(null);
  const exportCardRef = React.useRef<HTMLDivElement>(null);
  const [mobileView, setMobileView] = React.useState<'feed' | 'table'>('feed');
  const [selectedVoucherRow, setSelectedVoucherRow] = React.useState<StatementRow | null>(null);

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

      if (allAgents.length > 0) {
        const targetId = queryAgentId || selectedAgentId;
        const exists = allAgents.some((a) => a.id === targetId);
        setSelectedAgentId(exists ? targetId : allAgents[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [queryAgentId, selectedAgentId]);

  React.useEffect(() => {
    if (queryAgentId) {
      setSelectedAgentId(queryAgentId);
    }
  }, [queryAgentId]);

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

  const setPreset = (preset: 'month' | 'last7' | 'last30' | 'all') => {
    setActivePreset(preset);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (preset === 'month') {
      setFromDate(`${yyyy}-${mm}-01`);
      setToDate(todayStr);
    } else if (preset === 'last7') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const pY = past.getFullYear();
      const pM = String(past.getMonth() + 1).padStart(2, '0');
      const pD = String(past.getDate()).padStart(2, '0');
      setFromDate(`${pY}-${pM}-${pD}`);
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
      [`Agent: ${selectedAgent.name}`],
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

    aoa.push([]);
    aoa.push(['Powered by J ledger software : 8086094070']);

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

  const handleShareWhatsApp = async () => {
    const target = exportCardRef.current || statementCardRef.current;
    if (!target || !statement || !selectedAgent) return;
    try {
      setIsSharingWhatsApp(true);

      const cleanAgentName = selectedAgent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const fileName = `statement_${cleanAgentName}.png`;

      // Target full desktop dimensions
      const targetWidth = target.offsetWidth || 1120;
      const targetHeight = target.offsetHeight || target.scrollHeight;

      // Generate PNG blob from full-view export element
      const blob = await toBlob(target, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        width: targetWidth,
        height: targetHeight,
        style: {
          margin: '0',
          position: 'static',
          left: '0',
          top: '0',
          transform: 'none',
        },
      });

      if (!blob) {
        throw new Error('Failed to capture report image');
      }

      const file = new File([blob], fileName, { type: 'image/png' });
      const phoneDigits = (selectedAgent.phone || '').replace(/\D/g, '');

      // Only use Web Share API on mobile devices (iOS / Android) where WhatsApp is integrated in native share sheet.
      // On desktop (macOS / Windows), OS share sheets lack WhatsApp integration for browser files,
      // so we use the desktop flow: copy image to clipboard, download file, and open WhatsApp chat.
      const isMobile =
        typeof navigator !== 'undefined' &&
        (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
          (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1));

      if (
        isMobile &&
        navigator.canShare &&
        navigator.canShare({ files: [file] }) &&
        navigator.share
      ) {
        await navigator.share({
          title: `Account Statement - ${selectedAgent.name}`,
          text: `Account Statement for ${selectedAgent.name} (Closing Balance: ${formatNumber(statement.closingBalance.amount)} ${statement.closingBalance.type})`,
          files: [file],
        });
        return;
      }

      // Desktop fallback:
      // 1. Download image file automatically from blob
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.download = fileName;
      downloadLink.href = downloadUrl;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);

      // 2. Try copying image to clipboard for easy paste into WhatsApp Web
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setCopiedNotice(true);
          setTimeout(() => setCopiedNotice(false), 5000);
        }
      } catch (clipboardErr) {
        console.warn('Clipboard write failed:', clipboardErr);
      }

      // 3. Open WhatsApp Web / Desktop chat with summary caption
      const captionText = encodeURIComponent(
        `*Account Statement - ${selectedAgent.name}*\nPeriod: ${fromDate ? formatDate(fromDate) : 'Start'} to ${toDate ? formatDate(toDate) : 'Present'}\nClosing Balance: *${formatNumber(statement.closingBalance.amount)} ${statement.closingBalance.type}*`
      );
      const waUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${captionText}`
        : `https://wa.me/?text=${captionText}`;

      window.open(waUrl, '_blank');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing to WhatsApp:', err);
        alert('Could not generate report image for WhatsApp. Please try Print or Export.');
      }
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  const handleBack = () => {
    triggerHaptic('light');
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/sales');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 print:hidden">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="h-9 px-2.5 sm:px-3 text-xs sm:text-sm font-medium shrink-0"
            title="Go back"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Back</span>
          </Button>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <span>Account Statement & Ledger</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleShareWhatsApp}
            disabled={!statement || isSharingWhatsApp}
            title="Share Statement image on WhatsApp"
            className="flex-1 sm:flex-initial text-xs sm:text-sm px-2.5 sm:px-4 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <Share2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isSharingWhatsApp ? (
                'Generating...'
              ) : (
                <>
                  <span className="sm:hidden">WhatsApp</span>
                  <span className="hidden sm:inline">WhatsApp Share</span>
                </>
              )}
            </span>
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!statement}
            title="Print Statement"
            className="shrink-0 px-2.5 sm:px-4 text-xs sm:text-sm"
          >
            <Printer className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={!statement}
            className="flex-1 sm:flex-initial text-xs sm:text-sm px-2.5 sm:px-4"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>
              <span className="sm:hidden">Excel</span>
              <span className="hidden sm:inline">Export Excel</span>
            </span>
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Quick range tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs overflow-x-auto [scrollbar-width:none]">
          <span className="hidden sm:inline text-slate-400 font-medium shrink-0 whitespace-nowrap">Quick Date Range:</span>
          <button
            type="button"
            onClick={() => setPreset('month')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              activePreset === 'month'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            This Month
          </button>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0">•</span>
          <button
            type="button"
            onClick={() => setPreset('last7')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              activePreset === 'last7'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Last 7 Days
          </button>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0">•</span>
          <button
            type="button"
            onClick={() => setPreset('last30')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              activePreset === 'last30'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Last 30 Days
          </button>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0">•</span>
          <button
            type="button"
            onClick={() => setPreset('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
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
              value={`${formatNumber(statement.openingBalance.amount)}${statement.openingBalance.type ? ` ${statement.openingBalance.type}` : ''}`}
              icon={Scale}
              variant="slate"
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
              value={`${formatNumber(statement.closingBalance.amount)}${statement.closingBalance.type ? ` ${statement.closingBalance.type}` : ''}`}
              icon={DollarSign}
              variant={statement.closingBalance.type === 'Dr' ? 'amber' : 'emerald'}
            />
          </div>

          {copiedNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Report image downloaded & copied to clipboard! Paste (Cmd+V / Ctrl+V) or drag the file into your WhatsApp chat.
              </span>
            </div>
          )}

          {/* Statement Sheet / Document Card */}
          <div
            ref={statementCardRef}
            className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-2xs print:border-none print:shadow-none print:p-0"
          >
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
                  {selectedAgent.phone && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Phone: {selectedAgent.phone}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right bg-white dark:bg-slate-900/90 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-none border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Statement Period</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                    {fromDate ? formatDate(fromDate) : 'Start'} &mdash; {toDate ? formatDate(toDate) : 'Current Date'}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-slate-100/70 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-800/80 print:hidden">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Statement View</span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setMobileView('feed');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all active:scale-95',
                    mobileView === 'feed'
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  Cards Feed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setMobileView('table');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all active:scale-95',
                    mobileView === 'table'
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  Full Table
                </button>
              </div>
            </div>

            {/* Mobile Native Cards Feed */}
            <div className={cn('md:hidden divide-y divide-slate-100 dark:divide-slate-800/80 print:hidden', mobileView === 'table' && 'hidden')}>
              {/* Opening Balance Card */}
              <div className="p-4 bg-slate-50/70 dark:bg-slate-900/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Opening Balance</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {fromDate ? formatDate(fromDate) : 'Start of Period'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {formatNumber(statement.openingBalance.amount)}{' '}
                      <span className="text-xs text-slate-500 font-semibold">{statement.openingBalance.type}</span>
                    </div>
                  </div>
                </div>
                {selectedAgent && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex justify-end">
                    <Link
                      href={`/agents?highlight=${selectedAgent.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <span>Drill to Agent Setup</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Transaction Stream */}
              {statement.rows.map((row, index) => {
                const isDebit = row.debit > 0;
                const isCredit = row.credit > 0;
                const typeBadgeVariant =
                  row.type === 'Sale'
                    ? 'info'
                    : row.type === 'Receipt'
                    ? 'success'
                    : row.type === 'Cancel'
                    ? 'warning'
                    : 'neutral';
                const drillTarget = getDrillTarget(row, selectedAgent, transactions);

                return (
                  <div key={index} className="p-4 space-y-2.5 bg-white dark:bg-[#0e1422]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={typeBadgeVariant} dot className="text-[10px]">
                          {row.type || 'Entry'}
                        </Badge>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(row.date)}
                        </span>
                      </div>
                      {/* Debit or Credit Amount */}
                      <div className="text-right">
                        {isDebit && (
                          <div className="font-mono font-bold text-base text-amber-600 dark:text-amber-400">
                            {formatNumber(row.debit)} <span className="text-xs font-semibold">Dr</span>
                          </div>
                        )}
                        {isCredit && (
                          <div className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                            {formatNumber(row.credit)} <span className="text-xs font-semibold">Cr</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {row.particulars}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-50 dark:border-slate-800/60">
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        {row.qty !== undefined && row.qty > 0 ? (
                          <span>
                            {row.qty} units {row.rate ? `@ ${formatNumber(row.rate)}` : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Financial Entry</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                        <span className="text-[10px] text-slate-400 font-normal">Bal:</span>
                        <span>{formatNumber(row.balance)}</span>
                        <span className={row.balanceType === 'Dr' ? 'text-amber-600' : 'text-emerald-600'}>
                          {row.balanceType}
                        </span>
                      </div>
                    </div>

                    {/* Mobile Drill Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedVoucherRow(row);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Voucher Details</span>
                      </button>
                      <Link
                        href={drillTarget.url}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 active:scale-95 transition-transform"
                      >
                        <span>Drill to {drillTarget.sourceModule}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}

              {statement.rows.length === 0 && (
                <div className="p-8 text-center text-slate-400 italic text-sm">
                  No transactions found for the selected period.
                </div>
              )}

              {/* Mobile Totals Footer Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/70 border-t-2 border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Period Summary & Closing
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Total Debit</span>
                    <div className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                      {formatNumber(statement.totalDebit)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Total Credit</span>
                    <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {formatNumber(statement.totalCredit)}
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Closing Balance:</span>
                  <span className="font-mono font-bold text-base text-indigo-700 dark:text-indigo-300">
                    {formatNumber(statement.closingBalance.amount)}{' '}
                    <span className="text-xs">{statement.closingBalance.type}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Statement Table */}
            <div className={cn('overflow-x-auto [scrollbar-width:thin]', mobileView === 'feed' ? 'hidden md:block print:block' : 'block')}>
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
                    <th className="px-3 py-3.5 text-center w-28 print:hidden">Drill</th>
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
                    <td className="px-3 py-3.5 text-center print:hidden">
                      {selectedAgent && (
                        <Link
                          href={`/agents?highlight=${selectedAgent.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Drill to Agent Profile & Opening Balance Setup"
                        >
                          <span>Agent</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
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
                    const drillTarget = getDrillTarget(row, selectedAgent, transactions);

                    return (
                      <tr
                        key={index}
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedVoucherRow(row);
                        }}
                        className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors cursor-pointer group"
                      >
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
                        <td className="px-3 py-3.5 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={drillTarget.url}
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('selection');
                              }}
                              title={drillTarget.actionLabel}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200/60 dark:border-indigo-800/60 transition-all active:scale-95"
                            >
                              <span>Drill</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                setSelectedVoucherRow(row);
                              }}
                              title="View Voucher Details & Balanced Ledger Postings"
                              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {statement.rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400 italic">
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
                    <td className="px-3 py-4 text-center text-slate-400 print:hidden">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer Note */}
            <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-medium tracking-wide">
                Powered by J ledger software : <span className="font-semibold text-slate-700 dark:text-slate-300">8086094070</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {formatDate(new Date().toISOString().split('T')[0])}
              </span>
            </div>
          </div>

          {/* Transaction Voucher Drill-down Modal */}
          <Dialog
            open={Boolean(selectedVoucherRow)}
            onOpenChange={(open) => {
              if (!open) setSelectedVoucherRow(null);
            }}
          >
            <DialogContent
              maxWidth="max-w-2xl"
              title="Transaction Voucher Drill-down"
              description={`Detailed voucher audit trail and double-entry postings for ${selectedAgent?.name || 'Agent'}`}
            >
              {selectedVoucherRow && (() => {
                const drillTarget = getDrillTarget(selectedVoucherRow, selectedAgent, transactions);
                const activeTx = selectedVoucherRow.transaction_id
                  ? transactions.find((t) => t.id === selectedVoucherRow.transaction_id)
                  : null;
                const voucherEntries = selectedVoucherRow.transaction_id
                  ? entries.filter((e) => e.transaction_id === selectedVoucherRow.transaction_id)
                  : [];

                return (
                  <div className="space-y-5">
                    {/* Top Voucher Header Summary */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={drillTarget.badgeVariant} dot className="font-semibold text-xs">
                            Created in {drillTarget.sourceModule} Module
                          </Badge>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(selectedVoucherRow.date)}
                          </span>
                        </div>
                        {selectedVoucherRow.transaction_id && (
                          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            ID: {selectedVoucherRow.transaction_id}
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {selectedVoucherRow.particulars}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Agent Account: <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedAgent?.name}</span>
                        </p>
                      </div>

                      {/* Financial Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Type</span>
                          <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 mt-0.5">
                            {selectedVoucherRow.type || 'Entry'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Debit (Dr)</span>
                          <div className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            {selectedVoucherRow.debit > 0 ? formatNumber(selectedVoucherRow.debit) : '—'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Credit (Cr)</span>
                          <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {selectedVoucherRow.credit > 0 ? formatNumber(selectedVoucherRow.credit) : '—'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Running Bal</span>
                          <div className="font-mono font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                            {formatNumber(selectedVoucherRow.balance)}{' '}
                            <span className="text-[10px] text-slate-500">{selectedVoucherRow.balanceType}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Specific Details: Sale or Receipt or Cancel */}
                    {activeTx?.sale_details && (
                      <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/60 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="font-semibold text-blue-900 dark:text-blue-300 flex items-center justify-between">
                          <span>Sale Specifics</span>
                          <span>Party: {activeTx.sale_details.party || 'Direct'}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                          <div>Quantity: <span className="font-bold">{activeTx.sale_details.qty} units</span></div>
                          <div>Rate: <span className="font-bold">{formatNumber(activeTx.sale_details.rate)}</span></div>
                          <div>Total Value: <span className="font-bold text-blue-600 dark:text-blue-400">{formatNumber(activeTx.sale_details.amount)}</span></div>
                        </div>
                      </div>
                    )}

                    {activeTx?.receipt_details && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/60 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="font-semibold text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                          <span>Receipt Collection Info</span>
                          <span>Payment Account: {activeTx.receipt_details.received_in === 'cash' ? 'Cash Account' : 'Bank Account'}</span>
                        </div>
                        {activeTx.receipt_details.note && (
                          <div className="text-[11px]">Note / Memo: <span className="font-medium">{activeTx.receipt_details.note}</span></div>
                        )}
                      </div>
                    )}

                    {activeTx?.cancel_details && (
                      <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/60 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="font-semibold text-amber-900 dark:text-amber-300 flex items-center justify-between">
                          <span>Cancellation Specifics</span>
                          <span>Returned Units: {activeTx.cancel_details.qty}</span>
                        </div>
                        {activeTx.cancel_details.reason && (
                          <div className="text-[11px]">Reason: <span className="font-medium">{activeTx.cancel_details.reason}</span></div>
                        )}
                      </div>
                    )}

                    {/* Double Entry Ledger Journal Breakdown */}
                    {voucherEntries.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>Double-Entry Ledger Postings</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Balanced Journal Voucher</span>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="px-3.5 py-2">Ledger Account</th>
                                <th className="px-3.5 py-2 text-right">Debit (Dr)</th>
                                <th className="px-3.5 py-2 text-right">Credit (Cr)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {voucherEntries.map((e) => {
                                let accountLabel = e.account_id;
                                if (e.account_id === 'acc_cash') accountLabel = 'Cash A/c';
                                else if (e.account_id === 'acc_bank') accountLabel = 'Bank A/c';
                                else if (e.account_id === 'acc_sales') accountLabel = 'Sales Revenue A/c';
                                else if (e.account_id === 'acc_opening_balance') accountLabel = 'Opening Balance Equity A/c';
                                else if (selectedAgent && e.account_id === selectedAgent.account_id) {
                                  accountLabel = `${selectedAgent.name} (Agent A/c)`;
                                }

                                return (
                                  <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200">
                                      {accountLabel}
                                      <div className="text-[10px] text-slate-400 font-normal">{e.narration}</div>
                                    </td>
                                    <td className="px-3.5 py-2 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                                      {e.debit > 0 ? formatNumber(e.debit) : '—'}
                                    </td>
                                    <td className="px-3.5 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                      {e.credit > 0 ? formatNumber(e.credit) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Actions Footer */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedVoucherRow(null)}
                        className="w-full sm:w-auto"
                      >
                        Close
                      </Button>
                      <Button
                        onClick={() => {
                          triggerHaptic('selection');
                          router.push(drillTarget.url);
                        }}
                        className="w-full sm:w-auto"
                      >
                        <span>{drillTarget.actionLabel}</span>
                        <ArrowUpRight className="h-4 w-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>

          {/* Off-screen dedicated full-width container for WhatsApp image export (no scrollbars, full desktop layout) */}
          <div
            aria-hidden="true"
            className="print:hidden"
            style={{
              position: 'fixed',
              top: 0,
              left: '-99999px',
              width: '1120px',
              pointerEvents: 'none',
              zIndex: -9999,
            }}
          >
            <div
              ref={exportCardRef}
              style={{
                width: '1120px',
                minWidth: '1120px',
                maxWidth: '1120px',
                backgroundColor: '#ffffff',
                padding: '24px 28px',
              }}
              className="bg-white"
            >
              <div
                style={{
                  width: '100%',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                }}
                className="bg-white text-slate-900 rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-200 bg-slate-50/70 flex flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                        Statement of Account
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      {selectedAgent.name}
                    </h2>
                    {selectedAgent.phone && (
                      <p className="text-xs text-slate-500 font-medium">
                        Phone: {selectedAgent.phone}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                      Statement Period
                    </div>
                    <div className="text-sm font-bold text-slate-800 font-mono mt-0.5">
                      {fromDate ? formatDate(fromDate) : 'Start'} &mdash; {toDate ? formatDate(toDate) : 'Current Date'}
                    </div>
                  </div>
                </div>

                {/* Statement Table - NO OVERFLOW CONTAINER to prevent any scrollbars in captured image */}
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="pl-6 pr-4 py-3.5 w-28">Date</th>
                      <th className="px-4 py-3.5 w-28">Type</th>
                      <th className="px-4 py-3.5">Particulars / Details</th>
                      <th className="px-4 py-3.5 text-right w-20">Qty</th>
                      <th className="px-4 py-3.5 text-right w-24">Rate</th>
                      <th className="px-4 py-3.5 text-right w-28">Debit</th>
                      <th className="px-4 py-3.5 text-right w-28">Credit</th>
                      <th className="pl-4 pr-6 py-3.5 text-right w-36">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {/* First Row: Opening Balance */}
                    <tr className="bg-slate-50/50 font-medium">
                      <td className="pl-6 pr-4 py-3.5 font-mono text-xs text-slate-500">
                        {fromDate ? formatDate(fromDate) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          Opening
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 font-medium italic">
                        Brought Forward Opening Balance
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-400">—</td>
                      <td className="pl-4 pr-6 py-3.5 text-right font-mono font-bold text-slate-900">
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
                      let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                      let dotColor = 'bg-slate-400';
                      if (row.type === 'Sale') {
                        badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                        dotColor = 'bg-blue-500';
                      } else if (row.type === 'Receipt') {
                        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        dotColor = 'bg-emerald-500';
                      } else if (row.type === 'Cancel') {
                        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        dotColor = 'bg-amber-500';
                      }

                      return (
                        <tr key={index} className="bg-white">
                          <td className="pl-6 pr-4 py-3.5 font-mono text-xs text-slate-600">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                              {row.type || 'Entry'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-900 font-medium">
                            {row.particulars}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-slate-900">
                            {row.qty !== undefined && row.qty > 0 ? row.qty : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                            {row.rate !== undefined && row.rate > 0 ? formatNumber(row.rate) : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold text-amber-600">
                            {row.debit > 0 ? formatNumber(row.debit) : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-600">
                            {row.credit > 0 ? formatNumber(row.credit) : '—'}
                          </td>
                          <td className="pl-4 pr-6 py-3.5 text-right font-mono font-bold text-slate-900">
                            {formatNumber(row.balance)}
                            {row.balanceType && (
                              <span
                                className={`ml-1 text-xs font-bold ${
                                  row.balanceType === 'Dr'
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
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
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic bg-white">
                          No transactions found for the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Totals Row */}
                  <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900">
                    <tr>
                      <td className="pl-6 pr-4 py-4 font-mono text-xs">TOTALS</td>
                      <td className="px-4 py-4 text-slate-400">—</td>
                      <td className="px-4 py-4">Total Period Activity & Net Closing</td>
                      <td className="px-4 py-4 text-right font-mono text-slate-400">—</td>
                      <td className="px-4 py-4 text-right font-mono text-slate-400">—</td>
                      <td className="px-4 py-4 text-right font-mono text-base text-amber-600">
                        {formatNumber(statement.totalDebit)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-base text-emerald-600">
                        {formatNumber(statement.totalCredit)}
                      </td>
                      <td className="pl-4 pr-6 py-4 text-right font-mono text-base text-indigo-600">
                        {formatNumber(statement.closingBalance.amount)}
                        {statement.closingBalance.type && (
                          <span className="ml-1 text-xs font-bold text-indigo-600">
                            {statement.closingBalance.type}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Footer Note */}
                <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-200 flex flex-row items-center justify-between text-[11px] text-slate-500">
                  <span className="font-medium tracking-wide">
                    Powered by J ledger software : <span className="font-semibold text-slate-700">8086094070</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatDate(new Date().toISOString().split('T')[0])}
                  </span>
                </div>
              </div>
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
