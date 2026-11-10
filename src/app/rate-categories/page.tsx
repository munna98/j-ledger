'use client';

import * as React from 'react';
import { Plus, Edit2, Trash2, Layers, AlertCircle, Hash, TrendingDown } from 'lucide-react';
import { RateCategory, RateSlab } from '@/types';
import { rateCategoryRepo } from '@/lib/repo';
import { formatNumber } from '@/lib/format';
import { getSlabRangeLabel, validateSlabs } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';

interface SlabRowInput {
  id: string;
  from_qty: number;
  rate: number;
}

export default function RateCategoriesPage() {
  const [categories, setCategories] = React.useState<RateCategory[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Form modal state
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<RateCategory | null>(null);
  const [name, setName] = React.useState('');
  const [slabs, setSlabs] = React.useState<SlabRowInput[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = React.useState<RateCategory | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await rateCategoryRepo.getAll();
      setCategories(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const totalSlabsCount = React.useMemo(() => {
    return categories.reduce((sum, c) => sum + c.slabs.length, 0);
  }, [categories]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setSlabs([
      { id: 'slab_1', from_qty: 1, rate: 385 },
      { id: 'slab_2', from_qty: 25, rate: 381.5 },
      { id: 'slab_3', from_qty: 50, rate: 380 },
      { id: 'slab_4', from_qty: 100, rate: 375 },
    ]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (cat: RateCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlabs(cat.slabs.map((s) => ({ ...s })));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleAddSlab = () => {
    const last = slabs[slabs.length - 1];
    const nextFrom = last ? last.from_qty + 25 : 1;
    const nextRate = last ? last.rate : 100;
    setSlabs([
      ...slabs,
      {
        id: `slab_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        from_qty: nextFrom,
        rate: nextRate,
      },
    ]);
  };

  const handleRemoveSlab = (index: number) => {
    if (slabs.length <= 1) return;
    const next = slabs.filter((_, i) => i !== index);
    setSlabs(next);
  };

  const handleSlabChange = (index: number, field: 'from_qty' | 'rate', value: number) => {
    const next = [...slabs];
    next[index] = { ...next[index], [field]: value };
    setSlabs(next);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Category name is required');
      return;
    }

    const validation = validateSlabs(slabs);
    if (!validation.valid) {
      setFormError(validation.error || 'Invalid slabs');
      return;
    }

    try {
      setIsSubmitting(true);
      const sortedSlabs = [...slabs].sort((a, b) => a.from_qty - b.from_qty);

      if (editingCategory) {
        await rateCategoryRepo.update(editingCategory.id, {
          name: name.trim(),
          slabs: sortedSlabs,
        });
      } else {
        await rateCategoryRepo.create({
          name: name.trim(),
          slabs: sortedSlabs,
        });
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save rate category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await rateCategoryRepo.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete category');
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
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Layers className="h-6 w-6" />
            </div>
            Rate Categories & Slabs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Volume-based slab pricing tiers. Rates are resolved automatically upon transaction entry.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Category</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Rate Categories"
          value={categories.length}
          icon={Layers}
          variant="blue"
        />
        <StatCard
          title="Total Defined Slabs"
          value={totalSlabsCount}
          icon={Hash}
          variant="emerald"
        />
        <StatCard
          title="Volume Pricing"
          value="Automated"
          icon={TrendingDown}
          variant="slate"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 text-slate-500">
          <div className="animate-spin h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-medium">Loading rate categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0e1422] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 shadow-2xs">
          <Layers className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No Rate Categories</h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-sm mx-auto">
            Create your first category with quantity slab pricing to assign to agents.
          </p>
          <Button
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            <span>New Category</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {categories.map((cat) => {
            const sortedSlabs = [...cat.slabs].sort((a, b) => a.from_qty - b.from_qty);
            return (
              <div
                key={cat.id}
                className="bg-white dark:bg-[#0e1422] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-2xs flex flex-col justify-between hover:shadow-md transition-all duration-200"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-sm shrink-0">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                          {cat.name}
                        </h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {sortedSlabs.length} volume slabs
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Edit Category"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(cat);
                          setDeleteError(null);
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                        title="Delete Category"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Slabs Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5">Quantity Slab</th>
                          <th className="px-4 py-2.5">From Units</th>
                          <th className="px-4 py-2.5 text-right">Applicable Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {sortedSlabs.map((slab, index) => {
                          const nextSlab = sortedSlabs[index + 1];
                          const label = getSlabRangeLabel(slab, nextSlab);
                          return (
                            <tr key={slab.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                {label}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                                ≥ {slab.from_qty} units
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-base text-cyan-600 dark:text-cyan-400">
                                {formatNumber(slab.rate)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Rate applies to the entire order quantity</span>
                  <Badge variant="neutral" className="text-[10px]">Tier Auto-Resolved</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent
          maxWidth="max-w-2xl"
          title={editingCategory ? 'Edit Rate Category' : 'New Rate Category'}
          description="Enter from-quantity and rate per slab. 'To' quantity is calculated automatically."
        >
          <form onSubmit={handleFormSubmit} className="space-y-5">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard, Premium, Wholesale"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quantity Slabs *
                </label>
                <button
                  type="button"
                  onClick={handleAddSlab}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Volume Slab
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5 w-28">From Qty</th>
                      <th className="px-3.5 py-2.5">Derived Range</th>
                      <th className="px-3.5 py-2.5 w-32 text-right">Rate</th>
                      <th className="px-3.5 py-2.5 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {slabs.map((slab, index) => {
                      const nextSlab = slabs[index + 1];
                      const derivedRange = getSlabRangeLabel(slab, nextSlab);
                      const isFirst = index === 0;

                      return (
                        <tr key={slab.id}>
                          <td className="px-3.5 py-2">
                            <input
                              type="number"
                              min={isFirst ? 1 : 2}
                              readOnly={isFirst}
                              value={slab.from_qty}
                              onChange={(e) =>
                                handleSlabChange(index, 'from_qty', parseInt(e.target.value) || 0)
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-sm font-mono ${
                                isFirst
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {derivedRange}
                          </td>
                          <td className="px-3.5 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={slab.rate}
                              onChange={(e) =>
                                handleSlabChange(index, 'rate', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono text-right"
                            />
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            {!isFirst && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSlab(index)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Remove Slab"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Tip: Enter only the FROM quantity. The TO quantity is automatically derived from the next slab minus 1.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
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
                {isSubmitting ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Rate Category"
        description={
          deleteError
            ? deleteError
            : `Are you sure you want to delete '${deleteTarget?.name}'? This action cannot be undone.`
        }
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
