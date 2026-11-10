'use client';

import * as React from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ShoppingBag,
  AlertCircle,
  Ban,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { Agent, RateCategory, Transaction, Entry } from '@/types';
import { transactionRepo, agentRepo, rateCategoryRepo, entryRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentBalance, resolveRate, round2 } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';

export default function SalesPage() {
  const [sales, setSales] = React.useState<Transaction[]>([]);
  const [cancels, setCancels] = React.useState<Transaction[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [categories, setCategories] = React.useState<RateCategory[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'cancelled'>('all');

  // Expanded cancels for each sale
  const [expandedSaleIds, setExpandedSaleIds] = React.useState<Set<string>>(new Set());

  // Sale Create/Edit Modal State
  const [isSaleModalOpen, setIsSaleModalOpen] = React.useState(false);
  const [editingSale, setEditingSale] = React.useState<Transaction | null>(null);
  const [saleDate, setSaleDate] = React.useState('');
  const [saleAgentId, setSaleAgentId] = React.useState('');
  const [saleParty, setSaleParty] = React.useState('');
  const [saleQty, setSaleQty] = React.useState<number | ''>('');
  const [saleRate, setSaleRate] = React.useState<number | ''>('');
  const [isRateManuallyOverridden, setIsRateManuallyOverridden] = React.useState(false);
  const [saleFormError, setSaleFormError] = React.useState<string | null>(null);
  const [isSavingSale, setIsSavingSale] = React.useState(false);

  // Cancel Modal State (Create)
  const [cancelTargetSale, setCancelTargetSale] = React.useState<Transaction | null>(null);
  const [cancelType, setCancelType] = React.useState<'full' | 'partial'>('full');
  const [cancelQty, setCancelQty] = React.useState<number | ''>('');
  const [cancelDate, setCancelDate] = React.useState('');
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [isSavingCancel, setIsSavingCancel] = React.useState(false);

  // Cancel Edit Modal State
  const [editingCancel, setEditingCancel] = React.useState<Transaction | null>(null);
  const [editCancelParentSale, setEditCancelParentSale] = React.useState<Transaction | null>(null);
  const [editCancelQty, setEditCancelQty] = React.useState<number | ''>('');
  const [editCancelReason, setEditCancelReason] = React.useState('');
  const [editCancelDate, setEditCancelDate] = React.useState('');
  const [editCancelError, setEditCancelError] = React.useState<string | null>(null);
  const [isSavingEditCancel, setIsSavingEditCancel] = React.useState(false);

  // Delete Modals
  const [deleteSaleTarget, setDeleteSaleTarget] = React.useState<Transaction | null>(null);
  const [deleteCancelTarget, setDeleteCancelTarget] = React.useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allSales, allCancels, allAgents, allCats, allEntries] = await Promise.all([
        transactionRepo.getAll({ type: 'sale' }),
        transactionRepo.getAll({ type: 'sale_cancel' }),
        agentRepo.getAll(),
        rateCategoryRepo.getAll(),
        entryRepo.getAll(),
      ]);
      setSales(allSales);
      setCancels(allCancels);
      setAgents(allAgents);
      setCategories(allCats);
      setEntries(allEntries);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected agent for context in sale form
  const selectedFormAgent = React.useMemo(() => {
    return agents.find((a) => a.id === saleAgentId) || null;
  }, [agents, saleAgentId]);

  const selectedAgentBalance = React.useMemo(() => {
    if (!selectedFormAgent) return 0;
    return calculateAgentBalance(entries, selectedFormAgent.account_id);
  }, [selectedFormAgent, entries]);

  // Auto rate calculation for sale form
  const autoRateInfo = React.useMemo(() => {
    if (!selectedFormAgent || !saleQty || typeof saleQty !== 'number' || saleQty <= 0) {
      return null;
    }
    const cat = categories.find((c) => c.id === selectedFormAgent.rate_category_id);
    if (!cat) return null;
    return resolveRate(cat.slabs, selectedFormAgent.rate_overrides, saleQty);
  }, [selectedFormAgent, saleQty, categories]);

  // When agent or qty changes, auto fill rate if not manually overridden
  React.useEffect(() => {
    if (!isRateManuallyOverridden && autoRateInfo && autoRateInfo.rate > 0) {
      setSaleRate(autoRateInfo.rate);
    }
  }, [autoRateInfo, isRateManuallyOverridden]);

  // Helper: Get cancels for a sale
  const getCancelsForSale = (saleId: string) => {
    return cancels.filter((c) => c.cancel_details?.sale_id === saleId);
  };

  // Helper: Get total cancelled qty for a sale
  const getTotalCancelledQty = (saleId: string) => {
    const saleCancels = getCancelsForSale(saleId);
    return saleCancels.reduce((sum, c) => sum + (c.cancel_details?.qty || 0), 0);
  };

  // KPI Overview calculations
  const stats = React.useMemo(() => {
    const grossQty = sales.reduce((sum, s) => sum + (s.sale_details?.qty || 0), 0);
    const grossAmount = sales.reduce((sum, s) => sum + (s.sale_details?.amount || 0), 0);

    const totalCancelledQty = cancels.reduce((sum, c) => sum + (c.cancel_details?.qty || 0), 0);
    const totalCancelledAmount = cancels.reduce((sum, c) => sum + (c.cancel_details?.amount || 0), 0);

    const netAmount = round2(grossAmount - totalCancelledAmount);
    const netQty = round2(grossQty - totalCancelledQty);

    return {
      grossAmount,
      grossQty,
      netAmount,
      netQty,
      totalCancelledAmount,
      totalCancelledQty,
      totalSalesCount: sales.length,
    };
  }, [sales, cancels]);

  // Filtered sales
  const filteredSales = React.useMemo(() => {
    return sales.filter((sale) => {
      const details = sale.sale_details;
      if (!details) return false;

      const agent = agents.find((a) => a.id === details.agent_id);
      const agentName = agent?.name.toLowerCase() || '';
      const party = (details.party || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch = !q || agentName.includes(q) || party.includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;

      const totalCancelled = getTotalCancelledQty(sale.id);
      const isFullyCancelled = totalCancelled >= details.qty;

      if (statusFilter === 'active') return !isFullyCancelled;
      if (statusFilter === 'cancelled') return isFullyCancelled;
      return true;
    });
  }, [sales, agents, searchQuery, statusFilter, cancels]);

  const openCreateSaleModal = () => {
    setEditingSale(null);
    setSaleDate(new Date().toISOString().split('T')[0]);
    setSaleAgentId(agents[0]?.id || '');
    setSaleParty('');
    setSaleQty('');
    setSaleRate('');
    setIsRateManuallyOverridden(false);
    setSaleFormError(null);
    setIsSaleModalOpen(true);
  };

  const openEditSaleModal = (sale: Transaction) => {
    if (!sale.sale_details) return;
    setEditingSale(sale);
    setSaleDate(sale.date);
    setSaleAgentId(sale.sale_details.agent_id);
    setSaleParty(sale.sale_details.party);
    setSaleQty(sale.sale_details.qty);
    setSaleRate(sale.sale_details.rate);
    setIsRateManuallyOverridden(true);
    setSaleFormError(null);
    setIsSaleModalOpen(true);
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaleFormError(null);

    if (!saleAgentId) {
      setSaleFormError('Please select an agent');
      return;
    }
    const qty = typeof saleQty === 'number' ? saleQty : parseFloat(String(saleQty));
    const rate = typeof saleRate === 'number' ? saleRate : parseFloat(String(saleRate));

    if (!qty || qty <= 0) {
      setSaleFormError('Quantity must be greater than zero');
      return;
    }
    if (!rate || rate <= 0) {
      setSaleFormError('Rate must be greater than zero');
      return;
    }

    try {
      setIsSavingSale(true);
      if (editingSale) {
        await transactionRepo.updateSale(editingSale.id, {
          date: saleDate,
          agent_id: saleAgentId,
          party: saleParty,
          qty,
          rate,
        });
      } else {
        await transactionRepo.createSale({
          date: saleDate,
          agent_id: saleAgentId,
          party: saleParty,
          qty,
          rate,
        });
      }
      setIsSaleModalOpen(false);
      await loadData();
    } catch (err: any) {
      setSaleFormError(err.message || 'Failed to save sale');
    } finally {
      setIsSavingSale(false);
    }
  };

  const openCancelModal = (sale: Transaction) => {
    if (!sale.sale_details) return;
    const totalCancelled = getTotalCancelledQty(sale.id);
    const available = round2(sale.sale_details.qty - totalCancelled);

    setCancelTargetSale(sale);
    setCancelType('full');
    setCancelQty(available);
    setCancelDate(new Date().toISOString().split('T')[0]);
    setCancelReason('');
    setCancelError(null);
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTargetSale || !cancelTargetSale.sale_details) return;
    setCancelError(null);

    const qty = typeof cancelQty === 'number' ? cancelQty : parseFloat(String(cancelQty));
    if (!qty || qty <= 0) {
      setCancelError('Cancelled quantity must be greater than zero');
      return;
    }

    try {
      setIsSavingCancel(true);
      await transactionRepo.createSaleCancel({
        sale_id: cancelTargetSale.id,
        date: cancelDate,
        qty,
        reason: cancelReason.trim() || undefined,
      });
      setCancelTargetSale(null);
      await loadData();
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel sale');
    } finally {
      setIsSavingCancel(false);
    }
  };

  const openEditCancelModal = (cancel: Transaction) => {
    if (!cancel.cancel_details) return;
    const parentSale = sales.find((s) => s.id === cancel.cancel_details!.sale_id);
    if (!parentSale) return;

    setEditingCancel(cancel);
    setEditCancelParentSale(parentSale);
    setEditCancelQty(cancel.cancel_details.qty);
    setEditCancelReason(cancel.cancel_details.reason || '');
    setEditCancelDate(cancel.date);
    setEditCancelError(null);
  };

  const handleEditCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCancel || !editCancelParentSale) return;
    setEditCancelError(null);

    const qty =
      typeof editCancelQty === 'number' ? editCancelQty : parseFloat(String(editCancelQty));
    if (!qty || qty <= 0) {
      setEditCancelError('Cancelled quantity must be greater than zero');
      return;
    }

    try {
      setIsSavingEditCancel(true);
      await transactionRepo.updateSaleCancel(editingCancel.id, {
        date: editCancelDate,
        qty,
        reason: editCancelReason.trim() || undefined,
      });
      setEditingCancel(null);
      await loadData();
    } catch (err: any) {
      setEditCancelError(err.message || 'Failed to update cancel');
    } finally {
      setIsSavingEditCancel(false);
    }
  };

  const handleDeleteSaleConfirm = async () => {
    if (!deleteSaleTarget) return;
    try {
      setIsDeleting(true);
      await transactionRepo.deleteSale(deleteSaleTarget.id);
      setDeleteSaleTarget(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancelConfirm = async () => {
    if (!deleteCancelTarget) return;
    try {
      setIsDeleting(true);
      await transactionRepo.deleteSaleCancel(deleteCancelTarget.id);
      setDeleteCancelTarget(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleExpand = (saleId: string) => {
    setExpandedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
            Sales Transactions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automated tier pricing, volume rate slabs, full/partial cancellations, and double-entry postings.
          </p>
        </div>
        <Button
          onClick={openCreateSaleModal}
          disabled={agents.length === 0}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Sale</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Gross Sales Revenue"
          value={formatNumber(stats.grossAmount)}
          icon={DollarSign}
          variant="emerald"
        />
        <StatCard
          title="Net Sales (After Cancels)"
          value={formatNumber(stats.netAmount)}
          icon={TrendingUp}
          variant="blue"
        />
        <StatCard
          title="Cancelled Value"
          value={formatNumber(stats.totalCancelledAmount)}
          icon={Ban}
          variant="amber"
        />
        <StatCard
          title="Total Transactions"
          value={stats.totalSalesCount}
          icon={Clock}
          variant="slate"
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0e1422] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by agent name or party..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg border border-slate-200/60 dark:border-slate-800">
          {(
            [
              { id: 'all', label: 'All Sales' },
              { id: 'active', label: 'Active' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                statusFilter === filter.id
                  ? 'bg-white dark:bg-[#0e1422] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="text-center py-20 bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-medium">Loading sales records...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <ShoppingBag className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create an Agent First</h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            You need at least one agent with a rate category to start creating sales records.
          </p>
          <a
            href="/agents"
            className="inline-flex px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs"
          >
            Go to Agents
          </a>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <ShoppingBag className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {searchQuery || statusFilter !== 'all' ? 'No matching sales found' : 'No Sales Recorded Yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search terms or filters.'
              : 'Click below to record your first sale transaction with automated tier pricing.'}
          </p>
          {searchQuery || statusFilter !== 'all' ? (
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          ) : (
            <Button
              onClick={openCreateSaleModal}
            >
              <Plus className="h-4 w-4" />
              <span>New Sale</span>
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
                  <th className="px-4 py-3.5 w-10"></th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Agent & Party</th>
                  <th className="px-4 py-3.5 text-right">Qty</th>
                  <th className="px-4 py-3.5 text-right">Rate</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredSales.map((sale) => {
                  const details = sale.sale_details!;
                  const agent = agents.find((a) => a.id === details.agent_id);
                  const saleCancels = getCancelsForSale(sale.id);
                  const totalCancelled = getTotalCancelledQty(sale.id);
                  const isFullyCancelled = totalCancelled >= details.qty;
                  const isPartlyCancelled = totalCancelled > 0 && !isFullyCancelled;
                  const isExpanded = expandedSaleIds.has(sale.id);

                  return (
                    <React.Fragment key={sale.id}>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-4 text-center">
                          {saleCancels.length > 0 && (
                            <button
                              onClick={() => toggleExpand(sale.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                              title="Toggle Linked Cancels"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-amber-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {formatDate(sale.date)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {agent?.name || 'Unknown Agent'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Party: <span className="font-medium text-slate-700 dark:text-slate-300">{details.party || 'Direct'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-slate-900 dark:text-white">
                          <span>{details.qty}</span>
                          {totalCancelled > 0 && (
                            <span className="block text-[11px] text-rose-500 font-normal">
                              -{totalCancelled} ret
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatNumber(details.rate)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatNumber(details.amount)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {isFullyCancelled ? (
                            <Badge variant="destructive" dot>Cancelled</Badge>
                          ) : isPartlyCancelled ? (
                            <Badge variant="warning" dot>
                              Partly ({totalCancelled}/{details.qty})
                            </Badge>
                          ) : (
                            <Badge variant="success" dot>Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isFullyCancelled && (
                              <button
                                onClick={() => openCancelModal(sale)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-800/80 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                title="Cancel Sale"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              onClick={() => openEditSaleModal(sale)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Edit Sale"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteSaleTarget(sale)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Sale"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Sub-table for Linked Cancels */}
                      {isExpanded && saleCancels.length > 0 && (
                        <tr className="bg-amber-50/20 dark:bg-amber-950/10">
                          <td colSpan={8} className="p-3 pl-12 pr-6">
                            <div className="border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3.5 bg-amber-50/50 dark:bg-amber-950/30">
                              <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-1.5">
                                <Ban className="h-3.5 w-3.5 text-amber-600" />
                                Linked Cancellations ({saleCancels.length})
                              </h4>
                              <table className="w-full text-xs text-left">
                                <thead className="text-slate-500 uppercase border-b border-amber-200/70 dark:border-amber-900/40 text-[10px]">
                                  <tr>
                                    <th className="py-2">Cancel Date</th>
                                    <th className="py-2 text-right">Cancelled Qty</th>
                                    <th className="py-2 text-right">Rate</th>
                                    <th className="py-2 text-right">Amount</th>
                                    <th className="py-2 pl-4">Reason</th>
                                    <th className="py-2 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100 dark:divide-amber-900/30">
                                  {saleCancels.map((cancel) => (
                                    <tr key={cancel.id}>
                                      <td className="py-2 font-mono">{formatDate(cancel.date)}</td>
                                      <td className="py-2 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                                        -{cancel.cancel_details?.qty}
                                      </td>
                                      <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                                        {formatNumber(cancel.cancel_details?.rate)}
                                      </td>
                                      <td className="py-2 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                                        -{formatNumber(cancel.cancel_details?.amount)}
                                      </td>
                                      <td className="py-2 pl-4 text-slate-600 dark:text-slate-400 italic">
                                        {cancel.cancel_details?.reason || 'Standard cancellation'}
                                      </td>
                                      <td className="py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            onClick={() => openEditCancelModal(cancel)}
                                            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded"
                                            title="Edit Cancel"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            onClick={() => setDeleteCancelTarget(cancel)}
                                            className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                            title="Delete Cancel"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden space-y-3">
            {filteredSales.map((sale) => {
              const details = sale.sale_details!;
              const agent = agents.find((a) => a.id === details.agent_id);
              const saleCancels = getCancelsForSale(sale.id);
              const totalCancelled = getTotalCancelledQty(sale.id);
              const isFullyCancelled = totalCancelled >= details.qty;
              const isPartlyCancelled = totalCancelled > 0 && !isFullyCancelled;
              const isExpanded = expandedSaleIds.has(sale.id);

              return (
                <div
                  key={sale.id}
                  className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {agent?.name || 'Unknown Agent'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Party: <span className="font-medium text-slate-700 dark:text-slate-300">{details.party || 'Direct'}</span> • {formatDate(sale.date)}
                      </p>
                    </div>
                    {isFullyCancelled ? (
                      <Badge variant="destructive" dot>Cancelled</Badge>
                    ) : isPartlyCancelled ? (
                      <Badge variant="warning" dot>Partly ({totalCancelled}/{details.qty})</Badge>
                    ) : (
                      <Badge variant="success" dot>Active</Badge>
                    )}
                  </div>

                  <div className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Qty</div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {details.qty}
                        {totalCancelled > 0 && (
                          <span className="text-rose-500 text-xs block font-normal">(-{totalCancelled})</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Rate</div>
                      <div className="font-mono text-sm text-slate-900 dark:text-white">
                        {formatNumber(details.rate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Amount</div>
                      <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatNumber(details.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {saleCancels.length > 0 ? (
                      <button
                        onClick={() => toggleExpand(sale.id)}
                        className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {saleCancels.length} {saleCancels.length === 1 ? 'Cancel' : 'Cancels'}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      <span className="text-slate-400">No cancels</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {!isFullyCancelled && (
                        <button
                          onClick={() => openCancelModal(sale)}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-700 dark:text-amber-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => openEditSaleModal(sale)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Edit Sale"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteSaleTarget(sale)}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 cursor-pointer"
                        title="Delete Sale"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Cancels for Mobile */}
                  {isExpanded && saleCancels.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/60 space-y-2">
                      <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Linked Cancellations
                      </h4>
                      {saleCancels.map((cancel) => (
                        <div
                          key={cancel.id}
                          className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-mono font-bold text-rose-600 dark:text-rose-400">
                              Qty {cancel.cancel_details?.qty} @ {formatNumber(cancel.cancel_details?.rate)} = {formatNumber(cancel.cancel_details?.amount)}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              {formatDate(cancel.date)} {cancel.cancel_details?.reason && `• ${cancel.cancel_details.reason}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditCancelModal(cancel)}
                              className="p-1 text-slate-600 hover:text-slate-900"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteCancelTarget(cancel)}
                              className="p-1 text-rose-600 hover:text-rose-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sale Create / Edit Modal */}
      <Dialog open={isSaleModalOpen} onOpenChange={setIsSaleModalOpen}>
        <DialogContent
          maxWidth="max-w-xl"
          title={editingSale ? 'Edit Sale' : 'Record New Sale'}
          description="Rate auto-fills based on agent's slab category and remains editable."
        >
          <form onSubmit={handleSaleSubmit} className="space-y-4">
            {saleFormError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{saleFormError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Agent *
                </label>
                <select
                  required
                  value={saleAgentId}
                  onChange={(e) => {
                    setSaleAgentId(e.target.value);
                    setIsRateManuallyOverridden(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="" disabled>
                    Select an Agent
                  </option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agent Context & Balance */}
            {selectedFormAgent && (
              <div className="py-2.5 px-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Current Agent Balance:
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  {formatNumber(Math.abs(selectedAgentBalance))}
                  {selectedAgentBalance > 0 && <Badge variant="warning" dot className="text-[10px]">Dr (Owes Us)</Badge>}
                  {selectedAgentBalance < 0 && <Badge variant="success" dot className="text-[10px]">Cr (Advance)</Badge>}
                  {selectedAgentBalance === 0 && <Badge variant="neutral" className="text-[10px]">0.00 Settled</Badge>}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Party / Customer
              </label>
              <input
                type="text"
                value={saleParty}
                onChange={(e) => setSaleParty(e.target.value)}
                placeholder="e.g. Walk-in customer or Party name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Quantity *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={saleQty}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                    setSaleQty(val);
                  }}
                  placeholder="30"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Rate *
                  </label>
                  {isRateManuallyOverridden && autoRateInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        setSaleRate(autoRateInfo.rate);
                        setIsRateManuallyOverridden(false);
                      }}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset to auto
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={saleRate}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
                    setSaleRate(val);
                    setIsRateManuallyOverridden(true);
                  }}
                  placeholder="381.50"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono text-right focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                {autoRateInfo && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Auto: {formatNumber(autoRateInfo.rate)} (slab {autoRateInfo.slabLabel}
                    {autoRateInfo.isOverridden ? ' • agent override' : ''})
                  </p>
                )}
              </div>
            </div>

            {/* Calculated Amount Banner */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Transaction Amount
              </span>
              <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
                {formatNumber(
                  (typeof saleQty === 'number' ? saleQty : 0) *
                    (typeof saleRate === 'number' ? saleRate : 0)
                )}
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsSaleModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={isSavingSale}
              >
                {isSavingSale ? 'Saving...' : editingSale ? 'Update Sale' : 'Record Sale'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sale Cancel Modal (Create) */}
      <Dialog
        open={Boolean(cancelTargetSale)}
        onOpenChange={(open) => !open && setCancelTargetSale(null)}
      >
        <DialogContent
          maxWidth="max-w-lg"
          title="Cancel Sale"
          description="Cancel a sale in full or enter a partial quantity. Cancels are recorded at the original sale rate."
        >
          {cancelTargetSale && cancelTargetSale.sale_details && (
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              {cancelError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              {/* Sale Info Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Original Sale:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Qty {cancelTargetSale.sale_details.qty} @ {formatNumber(cancelTargetSale.sale_details.rate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Already Cancelled:</span>
                  <span className="font-mono font-medium text-rose-600 dark:text-rose-400">
                    {getTotalCancelledQty(cancelTargetSale.id)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200/60 dark:border-slate-700/60 pt-1.5 font-medium">
                  <span className="text-slate-700 dark:text-slate-300">Available to Cancel:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {round2(cancelTargetSale.sale_details.qty - getTotalCancelledQty(cancelTargetSale.id))}
                  </span>
                </div>
              </div>

              {/* Full vs Partial Toggle */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Cancellation Scope
                </label>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Cancel Type">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cancelType === 'full'}
                    tabIndex={cancelType === 'full' ? 0 : -1}
                    data-nav-input={cancelType === 'full' ? 'true' : undefined}
                    onClick={() => {
                      setCancelType('full');
                      setCancelQty(
                        round2(cancelTargetSale.sale_details!.qty - getTotalCancelledQty(cancelTargetSale.id))
                      );
                    }}
                    className={`py-2 px-3 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                      cancelType === 'full'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Full Cancel
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cancelType === 'partial'}
                    tabIndex={cancelType === 'partial' ? 0 : -1}
                    data-nav-input={cancelType === 'partial' ? 'true' : undefined}
                    onClick={() => setCancelType('partial')}
                    className={`py-2 px-3 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                      cancelType === 'partial'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Partial Cancel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Cancelled Qty *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max={round2(cancelTargetSale.sale_details.qty - getTotalCancelledQty(cancelTargetSale.id))}
                    required
                    readOnly={cancelType === 'full'}
                    value={cancelQty}
                    onChange={(e) =>
                      setCancelQty(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                    }
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono ${
                      cancelType === 'full'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={cancelDate}
                    onChange={(e) => setCancelDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Returned goods, order revised"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              {/* Calculated Cancel Amount */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Cancel Credit Amount
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400">
                    (Qty × Sale Rate: {formatNumber(cancelTargetSale.sale_details.rate)})
                  </div>
                </div>
                <div className="font-mono text-xl font-bold text-amber-900 dark:text-amber-100">
                  {formatNumber(
                    (typeof cancelQty === 'number' ? cancelQty : 0) * cancelTargetSale.sale_details.rate
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancelTargetSale(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSavingCancel}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-md shadow-amber-600/20"
                >
                  {isSavingCancel ? 'Processing...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Cancel Modal */}
      <Dialog
        open={Boolean(editingCancel)}
        onOpenChange={(open) => !open && setEditingCancel(null)}
      >
        <DialogContent
          maxWidth="max-w-md"
          title="Edit Cancel"
          description="Update cancelled quantity or reason."
        >
          {editingCancel && editingCancel.cancel_details && editCancelParentSale && (
            <form onSubmit={handleEditCancelSubmit} className="space-y-4">
              {editCancelError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm">
                  {editCancelError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Cancelled Qty *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={editCancelQty}
                    onChange={(e) =>
                      setEditCancelQty(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editCancelDate}
                    onChange={(e) => setEditCancelDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={editCancelReason}
                  onChange={(e) => setEditCancelReason(e.target.value)}
                  placeholder="e.g. Revised return"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCancel(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditCancel}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  {isSavingEditCancel ? 'Saving...' : 'Update Cancel'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Sale Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteSaleTarget)}
        onOpenChange={(open) => !open && setDeleteSaleTarget(null)}
        title="Delete Sale"
        description={
          deleteSaleTarget && getCancelsForSale(deleteSaleTarget.id).length > 0
            ? `Warning: This sale has ${getCancelsForSale(deleteSaleTarget.id).length} linked cancels. This will also delete all ${getCancelsForSale(deleteSaleTarget.id).length} cancels and their ledger entries together.`
            : 'Are you sure you want to delete this sale transaction? Its ledger entries will be removed.'
        }
        isLoading={isDeleting}
        onConfirm={handleDeleteSaleConfirm}
      />

      {/* Delete Cancel Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteCancelTarget)}
        onOpenChange={(open) => !open && setDeleteCancelTarget(null)}
        title="Delete Sale Cancel"
        description="Are you sure you want to delete this cancel? The sale will revert back to its earlier status and uncancelled quantity."
        isLoading={isDeleting}
        onConfirm={handleDeleteCancelConfirm}
      />
    </div>
  );
}
