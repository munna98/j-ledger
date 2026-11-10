'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  FileText,
  AlertCircle,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Agent, AgentRateOverride, RateCategory, Entry } from '@/types';
import { agentRepo, rateCategoryRepo, entryRepo } from '@/lib/repo';
import { formatNumber } from '@/lib/format';
import { calculateAgentBalance, getSlabRangeLabel } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';

export default function AgentsPage() {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [categories, setCategories] = React.useState<RateCategory[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Form modal state
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<Agent | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});

  // Opening balance fields (only for creation)
  const [obAmount, setObAmount] = React.useState('');
  const [obType, setObType] = React.useState<'dr' | 'cr'>('dr');
  const [obDate, setObDate] = React.useState('');

  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = React.useState<Agent | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allAgents, allCats, allEntries] = await Promise.all([
        agentRepo.getAll(),
        rateCategoryRepo.getAll(),
        entryRepo.getAll(),
      ]);
      setAgents(allAgents);
      setCategories(allCats);
      setEntries(allEntries);
      if (allCats.length > 0 && !categoryId) {
        setCategoryId(allCats[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedCategory = React.useMemo(() => {
    return categories.find((c) => c.id === categoryId) || categories[0] || null;
  }, [categories, categoryId]);

  const openCreateModal = () => {
    setEditingAgent(null);
    setName('');
    setPhone('');
    setCategoryId(categories[0]?.id || '');
    setOverrides({});
    setObAmount('');
    setObType('dr');
    setObDate(new Date().toISOString().split('T')[0]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setPhone(agent.phone || '');
    setCategoryId(agent.rate_category_id);
    const existingOverrides: Record<string, string> = {};
    if (agent.rate_overrides) {
      for (const ov of agent.rate_overrides) {
        existingOverrides[ov.slab_id] = String(ov.rate);
      }
    }
    setOverrides(existingOverrides);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOverrideChange = (slabId: string, val: string) => {
    setOverrides((prev) => ({
      ...prev,
      [slabId]: val,
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Agent name is required');
      return;
    }
    if (!categoryId) {
      setFormError('Rate category is required');
      return;
    }

    const rateOverrides: AgentRateOverride[] = [];
    for (const [slabId, rateStr] of Object.entries(overrides)) {
      if (rateStr && !isNaN(parseFloat(rateStr))) {
        const rateNum = parseFloat(rateStr);
        if (rateNum > 0) {
          rateOverrides.push({ slab_id: slabId, rate: rateNum });
        }
      }
    }

    try {
      setIsSubmitting(true);

      if (editingAgent) {
        await agentRepo.update(editingAgent.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          rate_category_id: categoryId,
          rate_overrides: rateOverrides,
        });
      } else {
        const openingBalanceAmount = obAmount ? parseFloat(obAmount) : 0;
        await agentRepo.create({
          name: name.trim(),
          phone: phone.trim() || undefined,
          rate_category_id: categoryId,
          rate_overrides: rateOverrides,
          opening_balance:
            openingBalanceAmount > 0
              ? {
                  amount: openingBalanceAmount,
                  balance_type: obType,
                  date: obDate || new Date().toISOString().split('T')[0],
                }
              : undefined,
        });
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await agentRepo.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setDeleteError(err.message || 'Cannot delete agent');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Agents
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage agents, custom slab rates, and view live ledger balances.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Agent</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Users className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Agents Found</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Add your first agent to start recording transactions.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Create Agent
          </button>
        </div>
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Agent Name</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Rate Category</th>
                  <th className="px-5 py-3.5 text-right">Current Balance</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {agents.map((agent) => {
                  const cat = categories.find((c) => c.id === agent.rate_category_id);
                  const balance = calculateAgentBalance(entries, agent.account_id);
                  const isDr = balance > 0;
                  const isCr = balance < 0;

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                        {agent.name}
                      </td>
                      <td className="px-5 py-4 text-slate-600 dark:text-slate-400">
                        {agent.phone ? (
                          <span className="flex items-center gap-1.5 font-mono text-xs">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {agent.phone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className="font-medium">
                          {cat?.name || 'Standard'}
                        </Badge>
                        {agent.rate_overrides && agent.rate_overrides.length > 0 && (
                          <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                            ({agent.rate_overrides.length} custom {agent.rate_overrides.length === 1 ? 'rate' : 'rates'})
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono font-semibold text-base">
                          {formatNumber(Math.abs(balance))}
                          {isDr && (
                            <Badge variant="info" className="ml-1 text-[11px] font-bold">
                              Dr (Owes us)
                            </Badge>
                          )}
                          {isCr && (
                            <Badge variant="warning" className="ml-1 text-[11px] font-bold">
                              Cr (Owed)
                            </Badge>
                          )}
                          {!isDr && !isCr && (
                            <Badge variant="default" className="ml-1 text-[11px]">
                              Settled
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/statement?agent_id=${agent.id}`}
                            className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors"
                            title="View Statement"
                          >
                            <FileText className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => openEditModal(agent)}
                            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Edit Agent"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(agent);
                              setDeleteError(null);
                            }}
                            className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                            title="Delete Agent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden space-y-3">
            {agents.map((agent) => {
              const cat = categories.find((c) => c.id === agent.rate_category_id);
              const balance = calculateAgentBalance(entries, agent.account_id);
              const isDr = balance > 0;
              const isCr = balance < 0;

              return (
                <div
                  key={agent.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">{agent.name}</h3>
                      {agent.phone && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{agent.phone}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {cat?.name || 'Standard'}
                    </Badge>
                  </div>

                  <div className="my-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Balance</span>
                    <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {formatNumber(Math.abs(balance))}
                      {isDr && <Badge variant="info" className="text-[10px]">Dr</Badge>}
                      {isCr && <Badge variant="warning" className="text-[10px]">Cr</Badge>}
                      {!isDr && !isCr && <Badge variant="default" className="text-[10px]">0.00</Badge>}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Link
                      href={`/statement?agent_id=${agent.id}`}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-600 flex items-center gap-1"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Statement
                    </Link>
                    <button
                      onClick={() => openEditModal(agent)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(agent);
                        setDeleteError(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-xs font-medium text-rose-600 flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent
          maxWidth="max-w-2xl"
          title={editingAgent ? 'Edit Agent' : 'New Agent'}
          description="Configure agent details, rate category slabs, and optional opening balance."
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Agent Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ravi"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Rate Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slabs.length} slabs)
                  </option>
                ))}
              </select>
            </div>

            {/* Slabs with Agent Overrides */}
            {selectedCategory && (
              <div className="pt-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Category Slabs & Optional Agent Rates
                </label>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2">Slab Range</th>
                        <th className="px-3 py-2">Standard Rate</th>
                        <th className="px-3 py-2 w-36">Agent Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedCategory.slabs
                        .sort((a, b) => a.from_qty - b.from_qty)
                        .map((slab, i, arr) => {
                          const nextSlab = arr[i + 1];
                          const label = getSlabRangeLabel(slab, nextSlab);
                          return (
                            <tr key={slab.id}>
                              <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                                {label}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                {formatNumber(slab.rate)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder={String(slab.rate)}
                                  value={overrides[slab.id] || ''}
                                  onChange={(e) => handleOverrideChange(slab.id, e.target.value)}
                                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-mono text-right"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Leave 'Agent Rate' empty to use the standard category rate.
                </p>
              </div>
            )}

            {/* Opening Balance (Only shown when creating new agent) */}
            {!editingAgent && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Opening Balance (Optional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={obAmount}
                      onChange={(e) => setObAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <select
                      value={obType}
                      onChange={(e) => setObType(e.target.value as 'dr' | 'cr')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    >
                      <option value="dr">Owes Us (Dr)</option>
                      <option value="cr">We Owe Agent (Cr)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <input
                      type="date"
                      value={obDate}
                      onChange={(e) => setObDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Automatically posts a balanced entry between Agent A/c and Opening Balance A/c.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Saving...' : editingAgent ? 'Update Agent' : 'Create Agent'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Agent"
        description={
          deleteError
            ? deleteError
            : `Are you sure you want to delete '${deleteTarget?.name}'? Note: Agents with existing transactions cannot be deleted.`
        }
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
