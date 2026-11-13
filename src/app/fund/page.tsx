'use client';

import * as React from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Wallet,
  DollarSign,
  TrendingUp,
  PieChart,
  ArrowDownRight,
  Search,
} from 'lucide-react';
import { FundEntry, Transaction } from '@/types';
import { fundRepo, transactionRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateFundStats, FundStats, round2 } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';

export default function FundPage() {
  const [funds, setFunds] = React.useState<FundEntry[]>([]);
  const [sales, setSales] = React.useState<Transaction[]>([]);
  const [cancels, setCancels] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = React.useState('');

  // Fund Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingFund, setEditingFund] = React.useState<FundEntry | null>(null);
  const [fundDate, setFundDate] = React.useState('');
  const [fundQty, setFundQty] = React.useState<number | ''>('');
  const [fundRate, setFundRate] = React.useState<number | ''>('');
  const [fundNote, setFundNote] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = React.useState<FundEntry | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allFunds, allSales, allCancels] = await Promise.all([
        fundRepo.getAll(),
        transactionRepo.getAll({ type: 'sale' }),
        transactionRepo.getAll({ type: 'sale_cancel' }),
      ]);
      setFunds(allFunds);
      setSales(allSales);
      setCancels(allCancels);
    } catch (err: any) {
      console.error('Failed to load fund data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived stats
  const stats: FundStats = React.useMemo(() => {
    return calculateFundStats(funds, sales, cancels);
  }, [funds, sales, cancels]);

  // Filtered funds
  const filteredFunds = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return funds;
    return funds.filter((f) => {
      const matchesNote = (f.note || '').toLowerCase().includes(q);
      const matchesDate = f.date.includes(q);
      const matchesRate = String(f.rate).includes(q);
      return matchesNote || matchesDate || matchesRate;
    });
  }, [funds, searchQuery]);

  // Modal open helpers
  const openCreateModal = () => {
    setEditingFund(null);
    setFundDate(new Date().toISOString().split('T')[0]);
    setFundQty('');
    setFundRate('');
    setFundNote('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (fund: FundEntry) => {
    setEditingFund(fund);
    setFundDate(fund.date);
    setFundQty(fund.qty);
    setFundRate(fund.rate);
    setFundNote(fund.note || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Preview amount in form
  const previewAmount = React.useMemo(() => {
    const q = typeof fundQty === 'number' ? fundQty : parseFloat(String(fundQty));
    const r = typeof fundRate === 'number' ? fundRate : parseFloat(String(fundRate));
    if (isNaN(q) || isNaN(r) || q <= 0 || r <= 0) return 0;
    return round2((q * r) / 100);
  }, [fundQty, fundRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const qty = typeof fundQty === 'number' ? fundQty : parseFloat(String(fundQty));
    const rate = typeof fundRate === 'number' ? fundRate : parseFloat(String(fundRate));

    if (isNaN(qty) || qty <= 0) {
      setFormError('Quantity must be greater than zero');
      return;
    }
    if (isNaN(rate) || rate <= 0) {
      setFormError('Rate must be greater than zero');
      return;
    }

    try {
      setIsSaving(true);
      if (editingFund) {
        await fundRepo.update(editingFund.id, {
          date: fundDate,
          qty,
          rate,
          note: fundNote.trim() || undefined,
        });
      } else {
        await fundRepo.create({
          date: fundDate,
          qty,
          rate,
          note: fundNote.trim() || undefined,
        });
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save fund entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await fundRepo.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to delete fund:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Wallet className="h-6 w-6" />
            </div>
            Fund & Profit Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Global capital pool, daily acquisition rates, cost of goods consumed by sales, and gross profit.
          </p>
        </div>
        <Button onClick={openCreateModal} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          <span>Add Fund</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Funded"
          value={formatNumber(stats.totalFunded)}
          icon={DollarSign}
          variant="blue"
        />
        <StatCard
          title="Fund Used (Cost)"
          value={formatNumber(stats.totalFundCost)}
          icon={ArrowDownRight}
          variant="amber"
        />
        <StatCard
          title="Remaining Fund"
          value={formatNumber(stats.remainingFund)}
          icon={PieChart}
          variant={stats.remainingFund < 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          title="Total Profit"
          value={formatNumber(stats.totalProfit)}
          icon={TrendingUp}
          variant={stats.totalProfit >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0e1422] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by note, date, or rate..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        {searchQuery && (
          <Button variant="outline" onClick={() => setSearchQuery('')} className="text-xs">
            Clear
          </Button>
        )}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="text-center py-20 bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-medium">Loading fund records...</p>
        </div>
      ) : filteredFunds.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <Wallet className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {searchQuery ? 'No matching fund entries' : 'No Fund Added Yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            {searchQuery
              ? 'Try adjusting your search query.'
              : 'Add your first fund capital entry with the daily acquisition rate to start tracking fund balance and profits.'}
          </p>
          {searchQuery ? (
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          ) : (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              <span>Add Fund</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800/80">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5 text-right">Quantity</th>
                  <th className="px-4 py-3.5 text-right">Rate</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5">Note</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredFunds.map((fund) => (
                  <tr
                    key={fund.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(fund.date)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-medium text-slate-900 dark:text-white">
                      {fund.qty}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {formatNumber(fund.rate)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatNumber(fund.amount)}
                    </td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400 text-xs">
                      {fund.note || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(fund)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          title="Edit Fund"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(fund)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Fund"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredFunds.map((fund) => (
              <div
                key={fund.id}
                className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(fund.date)}
                    </span>
                    {fund.note && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        {fund.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(fund)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                      title="Edit Fund"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(fund)}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 cursor-pointer"
                      title="Delete Fund"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Qty</div>
                    <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {fund.qty}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Rate</div>
                    <div className="font-mono text-sm text-slate-900 dark:text-white">
                      {formatNumber(fund.rate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Amount</div>
                    <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {formatNumber(fund.amount)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingFund ? 'Edit Fund Entry' : 'Add New Fund'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enter the daily acquisition rate and quantity added to the global fund pool.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={fundDate}
                  onChange={(e) => setFundDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 50"
                    value={fundQty}
                    onChange={(e) =>
                      setFundQty(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Fund Rate (Cost)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 350"
                    value={fundRate}
                    onChange={(e) =>
                      setFundRate(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
              </div>

              {/* Calculated Amount preview */}
              <div className="p-3 rounded-xl bg-violet-50/60 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                  Total Fund Amount:
                </span>
                <span className="font-mono font-bold text-base text-violet-700 dark:text-violet-300">
                  {formatNumber(previewAmount)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Morning tranche"
                  value={fundNote}
                  onChange={(e) => setFundNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingFund ? 'Update Fund' : 'Add Fund'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Fund Entry?"
        description={`Are you sure you want to delete the fund entry of Qty ${deleteTarget?.qty} @ ${deleteTarget?.rate}? Consumed sales costs will remain unaffected.`}
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
