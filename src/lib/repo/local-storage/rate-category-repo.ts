import { RateCategory } from '@/types';
import { IRateCategoryRepo } from '../types';
import { storageClient, DEFAULT_RATE_CATEGORIES } from './storage';
import { validateSlabs } from '@/lib/accounting';

export class LocalStorageRateCategoryRepo implements IRateCategoryRepo {
  async getAll(): Promise<RateCategory[]> {
    return storageClient.getRateCategories();
  }

  async getById(id: string): Promise<RateCategory | null> {
    const list = storageClient.getRateCategories();
    return list.find((c) => c.id === id) || null;
  }

  async create(category: Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>): Promise<RateCategory> {
    const validation = validateSlabs(category.slabs);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid slabs configuration');
    }

    const list = storageClient.getRateCategories();
    const now = new Date().toISOString();
    const sortedSlabs = [...category.slabs].sort((a, b) => a.from_qty - b.from_qty);

    const newCategory: RateCategory = {
      id: `rc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: category.name.trim(),
      slabs: sortedSlabs,
      created_at: now,
      updated_at: now,
    };

    storageClient.setRateCategories([...list, newCategory]);
    return newCategory;
  }

  async update(
    id: string,
    category: Partial<Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<RateCategory> {
    const list = storageClient.getRateCategories();
    const existing = list.find((c) => c.id === id);
    if (!existing) {
      throw new Error(`Rate Category with ID '${id}' not found`);
    }

    const slabs = category.slabs ? [...category.slabs].sort((a, b) => a.from_qty - b.from_qty) : existing.slabs;
    if (category.slabs) {
      const validation = validateSlabs(slabs);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid slabs configuration');
      }
    }

    const updated: RateCategory = {
      ...existing,
      name: category.name ? category.name.trim() : existing.name,
      slabs,
      updated_at: new Date().toISOString(),
    };

    const nextList = list.map((c) => (c.id === id ? updated : c));
    storageClient.setRateCategories(nextList);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const agents = storageClient.getAgents();
    const isUsed = agents.some((a) => a.rate_category_id === id);
    if (isUsed) {
      throw new Error('Cannot delete rate category: it is assigned to one or more agents');
    }

    const list = storageClient.getRateCategories();
    if (list.length <= 1) {
      throw new Error('Cannot delete the only remaining rate category');
    }

    const nextList = list.filter((c) => c.id !== id);
    storageClient.setRateCategories(nextList);
  }
}
