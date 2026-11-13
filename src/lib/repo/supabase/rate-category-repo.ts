import { RateCategory } from '@/types';
import { IRateCategoryRepo } from '../types';
import { getSupabase } from '@/lib/supabase/client';
import { validateSlabs } from '@/lib/accounting';

const TABLE = 'jledger_rate_categories';

export class SupabaseRateCategoryRepo implements IRateCategoryRepo {
  async getAll(): Promise<RateCategory[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to fetch rate categories: ${error.message}`);
    }
    return (data || []) as RateCategory[];
  }

  async getById(id: string): Promise<RateCategory | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch rate category '${id}': ${error.message}`);
    }
    return data as RateCategory | null;
  }

  async create(category: Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>): Promise<RateCategory> {
    const validation = validateSlabs(category.slabs);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid slabs configuration');
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();
    const sortedSlabs = [...category.slabs].sort((a, b) => a.from_qty - b.from_qty);

    const newCategory: RateCategory = {
      id: `rc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: category.name.trim(),
      slabs: sortedSlabs,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase.from(TABLE).insert(newCategory).select().single();
    if (error) {
      throw new Error(`Failed to create rate category: ${error.message}`);
    }
    return data as RateCategory;
  }

  async update(
    id: string,
    category: Partial<Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<RateCategory> {
    const existing = await this.getById(id);
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

    const updated = {
      name: category.name ? category.name.trim() : existing.name,
      slabs,
      updated_at: new Date().toISOString(),
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).update(updated).eq('id', id).select().single();
    if (error) {
      throw new Error(`Failed to update rate category: ${error.message}`);
    }
    return data as RateCategory;
  }

  async delete(id: string): Promise<void> {
    const supabase = getSupabase();

    // Check if category is used by any agent
    const { count, error: countError } = await supabase
      .from('jledger_agents')
      .select('id', { count: 'exact', head: true })
      .eq('rate_category_id', id);

    if (countError) {
      throw new Error(`Failed to check category usage: ${countError.message}`);
    }

    if (count && count > 0) {
      throw new Error('Cannot delete rate category: it is assigned to one or more agents');
    }

    const all = await this.getAll();
    if (all.length <= 1) {
      throw new Error('Cannot delete the only remaining rate category');
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete rate category: ${error.message}`);
    }
  }
}
