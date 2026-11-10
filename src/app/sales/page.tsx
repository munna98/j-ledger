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
} from 'lucide-react';
import { Agent, RateCategory, Transaction, Entry } from '@/types';
import { transactionRepo, agentRepo, rateCategoryRepo, entryRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentBalance, resolveRate, round2 } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';

export default function SalesPage() {
  const [sales, setSales] = React.useState<Transaction[]>([]);
  const [cancels, setCancels] = React.useState<Transaction[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [categories, setCategories] = React.useState<RateCategory[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  // Helper: Get cancels for a sale
  const getCancelsForSale = (saleId: string) => {
    return cancels.filter((c) => c.cancel_details?.sale_id === saleId);
  };

  // Helper: Get total cancelled qty for a sale
  const getTotalCancelledQty = (saleId: string) => {
    const saleCancels = getCancelsForSale(saleId);
    return saleCancels.reduce((sum, c) => sum + (c.cancel_details?.qty || 0), 0);
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
    setEditCancelDate(cancel.date);
    setEditCancelReason(cancel.cancel_details.reason || '');
    setEditCancelError(null);
  };

  const handleEditCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCancel) return;
    setEditCancelError(null);

    const qty = typeof editCancelQty === 'number' ? editCancelQty : parseFloat(String(editCancelQty));
    if (!qty || qty <= 0) {
      setEditCancelError('Quantity must be greater than zero');
      return;
    }

    try {
      setIsSavingEditCancel(true);
      await transactionRepo.updateSaleCancel(editingCancel.id, {
        qty,
        date: editCancelDate,
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-blue-600" />
            Sales
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Record sales with auto-tier pricing, full/partial cancels, and balanced double-entry ledger postings.
          </p>
        </div>
        <button
          onClick={openCreateSaleModal}
          disabled={agents.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Sale</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading sales records...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <ShoppingBag className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create an Agent First</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            You need at least one agent to create sales transactions.
          </p>
          <a
            href="/agents"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Go to Agents
          </a>
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <ShoppingBag className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Sales Recorded</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Click below to record your first sale transaction.</p>
          <button
            onClick={openCreateSaleModal}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Create Sale
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sales.map((sale) => {
                  const details = sale.sale_details!;
                  const agent = agents.find((a) => a.id === details.agent_id);
                  const saleCancels = getCancelsForSale(sale.id);
                  const totalCancelled = getTotalCancelledQty(sale.id);
                  const isFullyCancelled = totalCancelled >= details.qty;
                  const isPartlyCancelled = totalCancelled > 0 && !isFullyCancelled;
                  const isExpanded = expandedSaleIds.has(sale.id);

                  return (
                    <React.Fragment key={sale.id}>
                      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-4 text-center">
                          {saleCancels.length > 0 && (
                            <button
                              onClick={() => toggleExpand(sale.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                              title="Toggle Cancels"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
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
                            Party: {details.party || 'Direct'}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-slate-900 dark:text-white">
                          {details.qty}
                          {totalCancelled > 0 && (
                            <div className="text-[11px] text-rose-500 font-normal">
                              -{totalCancelled}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatNumber(details.rate)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatNumber(details.amount)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {isFullyCancelled ? (
                            <Badge variant="destructive">Cancelled</Badge>
                          ) : isPartlyCancelled ? (
                            <Badge variant="warning">
                              Partly cancelled ({totalCancelled}/{details.qty})
                            </Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isFullyCancelled && (
                              <button
                                onClick={() => openCancelModal(sale)}
                                className="px-2.5 py-1 text-xs font-medium rounded-md border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                title="Cancel Sale"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              onClick={() => openEditSaleModal(sale)}
                              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Edit Sale"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteSaleTarget(sale)}
                              className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Sale"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Sub-table for Linked Cancels */}
                      {isExpanded && saleCancels.length > 0 && (
                        <tr className="bg-slate-50/80 dark:bg-slate-900/60">
                          <td colSpan={8} className="p-3 pl-12 pr-6">
                            <div className="border border-amber-200 dark:border-amber-900/60 rounded-lg p-3 bg-amber-50/30 dark:bg-amber-950/20">
                              <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-1.5">
                                <Ban className="h-3.5 w-3.5 text-amber-600" />
                                Linked Cancels for this Sale ({saleCancels.length})
                              </h4>
                              <table className="w-full text-xs text-left">
                                <thead className="text-slate-500 uppercase border-b border-amber-200 dark:border-amber-900/40">
                                  <tr>
                                    <th className="py-1.5">Cancel Date</th>
                                    <th className="py-1.5">Cancelled Qty</th>
                                    <th className="py-1.5">Rate</th>
                                    <th className="py-1.5 text-right">Amount</th>
                                    <th className="py-1.5">Reason</th>
                                    <th className="py-1.5 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100 dark:divide-amber-900/30">
                                  {saleCancels.map((cancel) => (
                                    <tr key={cancel.id}>
                                      <td className="py-1.5 font-mono">{formatDate(cancel.date)}</td>
                                      <td className="py-1.5 font-mono font-medium text-rose-600">
                                        {cancel.cancel_details?.qty}
                                      </td>
                                      <td className="py-1.5 font-mono">
                                        {formatNumber(cancel.cancel_details?.rate)}
                                      </td>
                                      <td className="py-1.5 font-mono text-right font-medium">
                                        {formatNumber(cancel.cancel_details?.amount)}
                                      </td>
                                      <td className="py-1.5 text-slate-500 italic">
                                        {cancel.cancel_details?.reason || 'None provided'}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            onClick={() => openEditCancelModal(cancel)}
                                            className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                            title="Edit Cancel"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            onClick={() => setDeleteCancelTarget(cancel)}
                                            className="p-1 text-rose-500 hover:text-rose-700"
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
            {sales.map((sale) => {
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
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {agent?.name || 'Unknown Agent'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Party: {details.party || 'Direct'} • {formatDate(sale.date)}
                      </p>
                    </div>
                    {isFullyCancelled ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : isPartlyCancelled ? (
                      <Badge variant="warning">Partly ({totalCancelled}/{details.qty})</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>

                  <div className="my-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Qty</div>
                      <div className="font-mono font-semibold text-sm text-slate-900 dark:text-white">
                        {details.qty}
                        {totalCancelled > 0 && (
                          <span className="text-rose-500 text-xs"> (-{totalCancelled})</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Rate</div>
                      <div className="font-mono text-sm text-slate-900 dark:text-white">
                        {formatNumber(details.rate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Amount</div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {formatNumber(details.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {saleCancels.length > 0 ? (
                      <button
                        onClick={() => toggleExpand(sale.id)}
                        className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 cursor-pointer"
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
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => openEditSaleModal(sale)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Edit Sale"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteSaleTarget(sale)}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 cursor-pointer"
                        title="Delete Sale"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Cancels for Mobile */}
                  {isExpanded && saleCancels.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900/60 space-y-2">
                      <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Linked Cancels
                      </h4>
                      {saleCancels.map((cancel) => (
                        <div
                          key={cancel.id}
                          className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-mono font-bold text-rose-600">
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
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{saleFormError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Agent *
                </label>
                <select
                  required
                  value={saleAgentId}
                  onChange={(e) => {
                    setSaleAgentId(e.target.value);
                    setIsRateManuallyOverridden(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
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
              <div className="py-2 px-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Agent Current Balance:
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  {formatNumber(Math.abs(selectedAgentBalance))}
                  {selectedAgentBalance > 0 && <Badge variant="info" className="text-[10px]">Dr (Owes us)</Badge>}
                  {selectedAgentBalance < 0 && <Badge variant="warning" className="text-[10px]">Cr (Owed)</Badge>}
                  {selectedAgentBalance === 0 && <Badge variant="default" className="text-[10px]">0.00</Badge>}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Party
              </label>
              <input
                type="text"
                value={saleParty}
                onChange={(e) => setSaleParty(e.target.value)}
                placeholder="e.g. Walk-in customer or Party name"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                    Rate *
                  </label>
                  {isRateManuallyOverridden && autoRateInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        setSaleRate(autoRateInfo.rate);
                        setIsRateManuallyOverridden(false);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono text-right"
                />
                {autoRateInfo && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Auto: {formatNumber(autoRateInfo.rate)} (slab {autoRateInfo.slabLabel}
                    {autoRateInfo.isOverridden ? ' • agent custom' : ''})
                  </p>
                )}
              </div>
            </div>

            {/* Calculated Amount */}
            <div className="p-3.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Total Amount (Qty × Rate)
              </span>
              <span className="font-mono text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(
                  (typeof saleQty === 'number' ? saleQty : 0) *
                    (typeof saleRate === 'number' ? saleRate : 0)
                )}
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsSaleModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingSale}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingSale ? 'Saving...' : editingSale ? 'Update Sale' : 'Record Sale'}
              </button>
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
          description="Cancel a sale in full or enter a partial quantity. Cancels are recorded at the sale's rate."
        >
          {cancelTargetSale && cancelTargetSale.sale_details && (
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              {cancelError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              {/* Sale Info Summary */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Original Sale:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Qty {cancelTargetSale.sale_details.qty} @ {formatNumber(cancelTargetSale.sale_details.rate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Already Cancelled:</span>
                  <span className="font-mono text-rose-600">
                    {getTotalCancelledQty(cancelTargetSale.id)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-medium">
                  <span className="text-slate-700 dark:text-slate-300">Available to Cancel:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {round2(cancelTargetSale.sale_details.qty - getTotalCancelledQty(cancelTargetSale.id))}
                  </span>
                </div>
              </div>

              {/* Full vs Partial Toggle */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Cancel Type
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
                    className={`py-2 px-3 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                      cancelType === 'full'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 ring-2 ring-blue-500/20'
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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
                    className={`py-2 px-3 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                      cancelType === 'partial'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 ring-2 ring-blue-500/20'
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Partial Cancel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
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
                    className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${
                      cancelType === 'full'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={cancelDate}
                    onChange={(e) => setCancelDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Returned goods, order revised"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              {/* Calculated Cancel Amount */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Cancel Credit Amount
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400">
                    (Qty × Sale's Rate: {formatNumber(cancelTargetSale.sale_details.rate)})
                  </div>
                </div>
                <div className="font-mono text-lg font-bold text-amber-900 dark:text-amber-100">
                  {formatNumber(
                    (typeof cancelQty === 'number' ? cancelQty : 0) * cancelTargetSale.sale_details.rate
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancelTargetSale(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSavingCancel}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
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
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm">
                  {editCancelError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editCancelDate}
                    onChange={(e) => setEditCancelDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={editCancelReason}
                  onChange={(e) => setEditCancelReason(e.target.value)}
                  placeholder="e.g. Revised return"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCancel(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditCancel}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
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
