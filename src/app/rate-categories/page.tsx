'use client';

import * as React from 'react';
import { Plus, Edit2, Trash2, Layers, AlertCircle } from 'lucide-react';
import { RateCategory, RateSlab } from '@/types';
import { rateCategoryRepo } from '@/lib/repo';
import { formatNumber } from '@/lib/format';
import { getSlabRangeLabel, validateSlabs } from '@/lib/accounting';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            Rate Categories
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quantity slab pricing rules. First slab starts at 1, 'to' quantity is derived, last slab is open-ended.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Category</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading rate categories...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Layers className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No Rate Categories</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Create your first category with quantity slab pricing.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Create Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {categories.map((cat) => {
            const sortedSlabs = [...cat.slabs].sort((a, b) => a.from_qty - b.from_qty);
            return (
              <div
                key={cat.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{cat.name}</h2>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Edit Category"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(cat);
                          setDeleteError(null);
                        }}
                        className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                        title="Delete Category"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Slabs Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="px-3.5 py-2">Slab Range</th>
                          <th className="px-3.5 py-2">From Qty</th>
                          <th className="px-3.5 py-2 text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedSlabs.map((slab, index) => {
                          const nextSlab = sortedSlabs[index + 1];
                          const label = getSlabRangeLabel(slab, nextSlab);
                          return (
                            <tr key={slab.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                                {label}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">
                                {slab.from_qty}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                                {formatNumber(slab.rate)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-400">
                  {sortedSlabs.length} {sortedSlabs.length === 1 ? 'slab' : 'slabs'} defined • Rate applies to entire quantity
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
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard, Premium, Wholesale"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Quantity Slabs *
                </label>
                <button
                  type="button"
                  onClick={handleAddSlab}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Slab
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 w-28">From Qty</th>
                      <th className="px-3 py-2">Derived Range</th>
                      <th className="px-3 py-2 w-32">Rate</th>
                      <th className="px-3 py-2 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {slabs.map((slab, index) => {
                      const nextSlab = slabs[index + 1];
                      const derivedRange = getSlabRangeLabel(slab, nextSlab);
                      const isFirst = index === 0;

                      return (
                        <tr key={slab.id}>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={isFirst ? 1 : 2}
                              readOnly={isFirst}
                              value={slab.from_qty}
                              onChange={(e) =>
                                handleSlabChange(index, 'from_qty', parseInt(e.target.value) || 0)
                              }
                              className={`w-full px-2.5 py-1.5 rounded-md border text-sm font-mono ${
                                isFirst
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                            {derivedRange}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={slab.rate}
                              onChange={(e) =>
                                handleSlabChange(index, 'rate', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
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
              <p className="text-xs text-slate-400 mt-2">
                Tip: Enter only the FROM quantity. The TO quantity is automatically derived from the next slab minus 1.
              </p>
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
                {isSubmitting ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </button>
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
