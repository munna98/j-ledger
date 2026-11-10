'use client';

import * as React from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Receipt,
  AlertCircle,
  Landmark,
  Banknote,
  ArrowRight,
} from 'lucide-react';
import { Agent, Transaction, Entry } from '@/types';
import { transactionRepo, agentRepo, entryRepo } from '@/lib/repo';
import { formatNumber, formatDate } from '@/lib/format';
import { calculateAgentBalance, round2 } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';

export default function ReceiptsPage() {
  const [receipts, setReceipts] = React.useState<Transaction[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingReceipt, setEditingReceipt] = React.useState<Transaction | null>(null);
  const [date, setDate] = React.useState('');
  const [agentId, setAgentId] = React.useState('');
  const [receivedIn, setReceivedIn] = React.useState<'cash' | 'bank'>('bank');
  const [amount, setAmount] = React.useState<number | ''>('');
  const [note, setNote] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = React.useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allReceipts, allAgents, allEntries] = await Promise.all([
        transactionRepo.getAll({ type: 'receipt' }),
        agentRepo.getAll(),
        entryRepo.getAll(),
      ]);
      setReceipts(allReceipts);
      setAgents(allAgents);
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

  const selectedAgent = React.useMemo(() => {
    return agents.find((a) => a.id === agentId) || null;
  }, [agents, agentId]);

  // Current balance of the selected agent
  const currentAgentBalance = React.useMemo(() => {
    if (!selectedAgent) return 0;
    // If editing, exclude this receipt's current entry to show clean base balance
    if (editingReceipt) {
      const filteredEntries = entries.filter((e) => e.transaction_id !== editingReceipt.id);
      return calculateAgentBalance(filteredEntries, selectedAgent.account_id);
    }
    return calculateAgentBalance(entries, selectedAgent.account_id);
  }, [selectedAgent, entries, editingReceipt]);

  // Projected balance after this receipt
  const projectedAgentBalance = React.useMemo(() => {
    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
    // A receipt reduces Dr (agent owes us), so it subtracts amount from balance
    return round2(currentAgentBalance - numAmount);
  }, [currentAgentBalance, amount]);

  const openCreateModal = () => {
    setEditingReceipt(null);
    setDate(new Date().toISOString().split('T')[0]);
    setAgentId(agents[0]?.id || '');
    setReceivedIn('bank');
    setAmount('');
    setNote('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (rec: Transaction) => {
    if (!rec.receipt_details) return;
    setEditingReceipt(rec);
    setDate(rec.date);
    setAgentId(rec.receipt_details.agent_id);
    setReceivedIn(rec.receipt_details.received_in);
    setAmount(rec.receipt_details.amount);
    setNote(rec.receipt_details.note || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!agentId) {
      setFormError('Please select an agent');
      return;
    }
    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (!numAmount || numAmount <= 0) {
      setFormError('Amount must be greater than zero');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingReceipt) {
        await transactionRepo.updateReceipt(editingReceipt.id, {
          date,
          agent_id: agentId,
          received_in: receivedIn,
          amount: numAmount,
          note: note.trim() || undefined,
        });
      } else {
        await transactionRepo.createReceipt({
          date,
          agent_id: agentId,
          received_in: receivedIn,
          amount: numAmount,
          note: note.trim() || undefined,
        });
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save receipt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await transactionRepo.deleteReceipt(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
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
            <Receipt className="h-6 w-6 text-blue-600" />
            Receipts
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Record funds received via Cash or Bank with automatic double-entry credits to agent accounts.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          disabled={agents.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Receipt</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading receipts...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Receipt className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create an Agent First</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            You need at least one agent to record payment receipts.
          </p>
          <a
            href="/agents"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Go to Agents
          </a>
        </div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Receipt className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Receipts Recorded</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Record payments received from agents via Cash or Bank.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Create Receipt
          </button>
        </div>
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Agent</th>
                  <th className="px-5 py-3.5">Received In</th>
                  <th className="px-5 py-3.5">Note</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receipts.map((rec) => {
                  const details = rec.receipt_details!;
                  const agent = agents.find((a) => a.id === details.agent_id);

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(rec.date)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                        {agent?.name || 'Unknown Agent'}
                      </td>
                      <td className="px-5 py-4">
                        {details.received_in === 'bank' ? (
                          <Badge variant="info" className="flex items-center gap-1 w-fit font-medium">
                            <Landmark className="h-3 w-3" />
                            Bank
                          </Badge>
                        ) : (
                          <Badge variant="success" className="flex items-center gap-1 w-fit font-medium">
                            <Banknote className="h-3 w-3" />
                            Cash
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {details.note || <span className="text-slate-400 italic">None</span>}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                        {formatNumber(details.amount)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(rec)}
                            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Edit Receipt"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(rec)}
                            className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                            title="Delete Receipt"
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
            {receipts.map((rec) => {
              const details = rec.receipt_details!;
              const agent = agents.find((a) => a.id === details.agent_id);

              return (
                <div
                  key={rec.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {agent?.name || 'Unknown Agent'}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{formatDate(rec.date)}</p>
                    </div>
                    {details.received_in === 'bank' ? (
                      <Badge variant="info" className="flex items-center gap-1 text-xs">
                        <Landmark className="h-3 w-3" />
                        Bank
                      </Badge>
                    ) : (
                      <Badge variant="success" className="flex items-center gap-1 text-xs">
                        <Banknote className="h-3 w-3" />
                        Cash
                      </Badge>
                    )}
                  </div>

                  <div className="my-3 py-2.5 px-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
                    <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                      Received Amount
                    </span>
                    <span className="font-mono font-bold text-lg text-emerald-700 dark:text-emerald-300">
                      {formatNumber(details.amount)}
                    </span>
                  </div>

                  {details.note && (
                    <p className="text-xs text-slate-500 italic mb-3">Note: {details.note}</p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => openEditModal(rec)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(rec)}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-xs font-medium text-rose-600 flex items-center gap-1 cursor-pointer"
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

      {/* Create / Edit Receipt Modal */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent
          maxWidth="max-w-lg"
          title={editingReceipt ? 'Edit Receipt' : 'Record Receipt'}
          description="Record payment received into Cash or Bank A/c."
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
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Agent *
                </label>
                <select
                  required
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
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

            {/* Received In (Cash vs Bank) */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                Received In *
              </label>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Received In">
                <button
                  type="button"
                  role="radio"
                  aria-checked={receivedIn === 'bank'}
                  tabIndex={receivedIn === 'bank' ? 0 : -1}
                  data-nav-input={receivedIn === 'bank' ? 'true' : undefined}
                  onClick={() => setReceivedIn('bank')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    receivedIn === 'bank'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 ring-2 ring-blue-500/20'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Landmark className="h-4 w-4" />
                  Bank A/c
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={receivedIn === 'cash'}
                  tabIndex={receivedIn === 'cash' ? 0 : -1}
                  data-nav-input={receivedIn === 'cash' ? 'true' : undefined}
                  onClick={() => setReceivedIn('cash')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    receivedIn === 'cash'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  Cash A/c
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
                  setAmount(val);
                }}
                placeholder="5000.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base font-mono text-right font-bold"
              />
            </div>

            {/* Agent Balance Before & After Comparison */}
            {selectedAgent && (
              <div className="p-3.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
                  Agent Ledger Impact
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div>
                    <div className="text-slate-500 text-[11px]">Before Receipt</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                      {formatNumber(Math.abs(currentAgentBalance))}
                      {currentAgentBalance > 0 && <Badge variant="info" className="text-[10px]">Dr</Badge>}
                      {currentAgentBalance < 0 && <Badge variant="warning" className="text-[10px]">Cr</Badge>}
                      {currentAgentBalance === 0 && <Badge variant="default" className="text-[10px]">0.00</Badge>}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-slate-400" />

                  <div className="text-right">
                    <div className="text-slate-500 text-[11px]">After Receipt</div>
                    <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 justify-end mt-0.5">
                      {formatNumber(Math.abs(projectedAgentBalance))}
                      {projectedAgentBalance > 0 && <Badge variant="info" className="text-[10px]">Dr</Badge>}
                      {projectedAgentBalance < 0 && <Badge variant="warning" className="text-[10px]">Cr</Badge>}
                      {projectedAgentBalance === 0 && <Badge variant="default" className="text-[10px]">Settled</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. NEFT ref 12345, Cheque #004"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

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
                {isSubmitting ? 'Saving...' : editingReceipt ? 'Update Receipt' : 'Record Receipt'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Receipt"
        description="Are you sure you want to delete this receipt? Its double-entry records will be removed and the agent's balance will be restored."
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
