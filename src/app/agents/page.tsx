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
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { Agent, AgentRateOverride, RateCategory, Entry } from '@/types';
import { agentRepo, rateCategoryRepo, entryRepo } from '@/lib/repo';
import { formatNumber } from '@/lib/format';
import { calculateAgentBalance, getSlabRangeLabel, round2 } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AgentsPage() {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [categories, setCategories] = React.useState<RateCategory[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Search and Balance Filter
  const [searchQuery, setSearchQuery] = React.useState('');
  const [balanceFilter, setBalanceFilter] = React.useState<'all' | 'dr' | 'cr' | 'settled'>('all');

  // Form modal state
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<Agent | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [showSlabCustomization, setShowSlabCustomization] = React.useState(false);

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

  // KPI Calculations across agents
  const stats = React.useMemo(() => {
    let totalReceivables = 0; // Dr
    let totalPayables = 0; // Cr

    for (const agent of agents) {
      const bal = calculateAgentBalance(entries, agent.account_id);
      if (bal > 0) {
        totalReceivables += bal;
      } else if (bal < 0) {
        totalPayables += Math.abs(bal);
      }
    }

    const netPosition = round2(totalReceivables - totalPayables);

    return {
      totalAgents: agents.length,
      totalReceivables,
      totalPayables,
      netPosition,
    };
  }, [agents, entries]);

  // Filtered agents
  const filteredAgents = React.useMemo(() => {
    return agents.filter((agent) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        agent.name.toLowerCase().includes(q) ||
        (agent.phone && agent.phone.includes(q));

      if (!matchesSearch) return false;

      if (balanceFilter === 'all') return true;

      const balance = calculateAgentBalance(entries, agent.account_id);
      if (balanceFilter === 'dr') return balance > 0;
      if (balanceFilter === 'cr') return balance < 0;
      if (balanceFilter === 'settled') return balance === 0;
      return true;
    });
  }, [agents, entries, searchQuery, balanceFilter]);

  const activeOverrideCount = React.useMemo(() => {
    return Object.values(overrides).filter((v) => v !== '' && v !== undefined).length;
  }, [overrides]);

  const openCreateModal = () => {
    setEditingAgent(null);
    setName('');
    setPhone('');
    setCategoryId(categories[0]?.id || '');
    setOverrides({});
    setShowSlabCustomization(false);
    setObAmount('');
    setObType('dr');
    setObDate(new Date().toISOString().split('T')[0]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = async (agent: Agent) => {
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
    setShowSlabCustomization(Object.keys(existingOverrides).length > 0);

    // Fetch existing opening balance for this agent
    try {
      const obTx = await agentRepo.getOpeningBalance(agent.id);
      if (obTx && obTx.opening_balance_details) {
        setObAmount(String(obTx.opening_balance_details.amount));
        setObType(obTx.opening_balance_details.balance_type);
        setObDate(obTx.date || new Date().toISOString().split('T')[0]);
      } else {
        setObAmount('');
        setObType('dr');
        setObDate(agent.created_at ? agent.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
      }
    } catch {
      setObAmount('');
      setObType('dr');
      setObDate(new Date().toISOString().split('T')[0]);
    }

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

    const openingBalanceAmount = obAmount ? parseFloat(obAmount) : 0;
    if (isNaN(openingBalanceAmount) || openingBalanceAmount < 0) {
      setFormError('Opening balance amount cannot be negative');
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingAgent) {
        await agentRepo.update(editingAgent.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          rate_category_id: categoryId,
          rate_overrides: rateOverrides,
          opening_balance: {
            amount: openingBalanceAmount,
            balance_type: obType,
            date: obDate || new Date().toISOString().split('T')[0],
          },
        });
      } else {
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Users className="h-6 w-6" />
            </div>
            Agents & Ledgers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Agent profiles, custom rate overrides, opening balances, and live receivables tracking.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Agent</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Receivables (Dr)"
          value={formatNumber(stats.totalReceivables)}
          icon={ArrowUpRight}
          variant="amber"
        />
        <StatCard
          title="Total Payables (Cr)"
          value={formatNumber(stats.totalPayables)}
          icon={ArrowDownLeft}
          variant="emerald"
        />
        <StatCard
          title="Net Book Balance"
          value={formatNumber(Math.abs(stats.netPosition))}
          icon={Scale}
          variant="blue"
        />
        <StatCard
          title="Registered Agents"
          value={stats.totalAgents}
          icon={Users}
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
            placeholder="Search by agent name or phone number..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg border border-slate-200/60 dark:border-slate-800">
          {(
            [
              { id: 'all', label: 'All Agents' },
              { id: 'dr', label: 'Owes Us (Dr)' },
              { id: 'cr', label: 'Advances (Cr)' },
              { id: 'settled', label: 'Settled' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.id}
              onClick={() => setBalanceFilter(filter.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                balanceFilter === filter.id
                  ? 'bg-white dark:bg-[#0e1422] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-medium">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <Users className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Agents Found</h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            Add your first agent to start recording transactions and generating ledger statements.
          </p>
          <Button
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            <span>New Agent</span>
          </Button>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <Users className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {searchQuery || balanceFilter !== 'all' ? 'No matching agents found' : 'No Agents'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            Try adjusting your search criteria or balance filter.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery('');
              setBalanceFilter('all');
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800/80">
                <tr>
                  <th className="px-5 py-3.5">Agent Name</th>
                  <th className="px-5 py-3.5">Contact Phone</th>
                  <th className="px-5 py-3.5">Pricing Tier</th>
                  <th className="px-5 py-3.5 text-right">Current Ledger Balance</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredAgents.map((agent) => {
                  const cat = categories.find((c) => c.id === agent.rate_category_id);
                  const balance = calculateAgentBalance(entries, agent.account_id);
                  const isDr = balance > 0;
                  const isCr = balance < 0;

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{agent.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600 dark:text-slate-400">
                        {agent.phone ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {agent.phone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-medium">
                            <Layers className="h-3 w-3 mr-1 text-slate-400" />
                            {cat?.name || 'Standard'}
                          </Badge>
                          {agent.rate_overrides && agent.rate_overrides.length > 0 && (
                            <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-full border border-purple-200/60 dark:border-purple-800/60">
                              {agent.rate_overrides.length} custom {agent.rate_overrides.length === 1 ? 'slab' : 'slabs'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2 font-mono font-bold text-base">
                          <span className={isDr ? 'text-amber-600 dark:text-amber-400' : isCr ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}>
                            {formatNumber(Math.abs(balance))}
                          </span>
                          {isDr && (
                            <Badge variant="warning" dot className="text-[11px] font-bold">
                              Dr (Owes Us)
                            </Badge>
                          )}
                          {isCr && (
                            <Badge variant="success" dot className="text-[11px] font-bold">
                              Cr (Advance)
                            </Badge>
                          )}
                          {!isDr && !isCr && (
                            <Badge variant="neutral" className="text-[11px]">
                              0.00 Settled
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/statement?agent_id=${agent.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-900/60 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 text-xs font-semibold transition-colors"
                            title="View Statement"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Statement</span>
                          </Link>
                          <button
                            onClick={() => openEditModal(agent)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Edit Agent"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(agent);
                              setDeleteError(null);
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
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
            {filteredAgents.map((agent) => {
              const cat = categories.find((c) => c.id === agent.rate_category_id);
              const balance = calculateAgentBalance(entries, agent.account_id);
              const isDr = balance > 0;
              const isCr = balance < 0;

              return (
                <div
                  key={agent.id}
                  className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">{agent.name}</h3>
                        {agent.phone && (
                          <p className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />
                            {agent.phone}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {cat?.name || 'Standard'}
                    </Badge>
                  </div>

                  <div className="py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Current Balance</span>
                    <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{formatNumber(Math.abs(balance))}</span>
                      {isDr && <Badge variant="warning" dot className="text-[10px]">Dr</Badge>}
                      {isCr && <Badge variant="success" dot className="text-[10px]">Cr</Badge>}
                      {!isDr && !isCr && <Badge variant="neutral" className="text-[10px]">0.00</Badge>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Link
                      href={`/statement?agent_id=${agent.id}`}
                      className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      View Statement
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(agent)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(agent);
                          setDeleteError(null);
                        }}
                        className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
          title={editingAgent ? 'Edit Agent Profile' : 'New Agent Registration'}
          description="Configure agent credentials, rate category slabs, and optional opening balance."
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Agent Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Default Rate Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slabs.length} slab tiers)
                  </option>
                ))}
              </select>
            </div>

            {/* Slabs with Agent Overrides */}
            {selectedCategory && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setShowSlabCustomization((prev) => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Category Slabs & Custom Rates
                    </span>
                    {activeOverrideCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        {activeOverrideCount} custom override{activeOverrideCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        Standard rates ({selectedCategory.slabs.length} slabs)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium shrink-0 ml-2">
                    <span>{showSlabCustomization ? 'Hide' : 'Customize'}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        showSlabCustomization && 'rotate-180'
                      )}
                    />
                  </div>
                </button>

                {showSlabCustomization && (
                  <div className="p-3.5 pt-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 mt-3">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 text-xs text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-3.5 py-2">Volume Slab</th>
                            <th className="px-3.5 py-2 text-right">Standard Rate</th>
                            <th className="px-3.5 py-2 w-36 text-right">Agent Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {selectedCategory.slabs
                            .sort((a, b) => a.from_qty - b.from_qty)
                            .map((slab, i, arr) => {
                              const nextSlab = arr[i + 1];
                              const label = getSlabRangeLabel(slab, nextSlab);
                              return (
                                <tr key={slab.id}>
                                  <td className="px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200">
                                    {label}
                                  </td>
                                  <td className="px-3.5 py-2 text-right font-mono text-slate-500 dark:text-slate-400">
                                    {formatNumber(slab.rate)}
                                  </td>
                                  <td className="px-3.5 py-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder={String(slab.rate)}
                                      value={overrides[slab.id] || ''}
                                      onChange={(e) => handleOverrideChange(slab.id, e.target.value)}
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-mono text-right focus:ring-1 focus:ring-purple-500"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Leave &apos;Agent Rate&apos; empty to use standard category rates. Specify custom rates only for exceptional pricing.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Opening Balance */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {editingAgent ? 'Opening Balance' : 'Initial Opening Balance (Optional)'}
                </label>
                {editingAgent && (
                  <span className="text-[11px] text-slate-400">
                    Set amount to 0 or blank to clear
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={obAmount}
                    onChange={(e) => setObAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div className="sm:col-span-1">
                  <select
                    value={obType}
                    onChange={(e) => setObType(e.target.value as 'dr' | 'cr')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-purple-500/20"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {editingAgent
                  ? 'Posts or updates the double-entry journal between the Agent Account and Opening Balance Equity Account.'
                  : 'Posts a double-entry journal between the Agent Account and Opening Balance Equity Account.'}
              </p>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-slate-900 flex justify-end gap-3 pt-3 pb-1 -mx-2 px-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : editingAgent ? 'Update Agent' : 'Create Agent'}
              </Button>
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
            : `Are you sure you want to delete '${deleteTarget?.name}'? Note: Agents with existing ledger transactions cannot be deleted.`
        }
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
