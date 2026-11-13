import { FundEntry } from '@/types';
import { CreateFundDTO, IFundRepo, UpdateFundDTO } from '../types';
import { getSupabase } from '@/lib/supabase/client';
import { round2 } from '@/lib/accounting';

const TABLE = 'jledger_fund_entries';

export class SupabaseFundRepo implements IFundRepo {
  async getAll(): Promise<FundEntry[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch fund entries: ${error.message}`);
    }
    return (data || []).map(this.normalizeFundEntry);
  }

  async getById(id: string): Promise<FundEntry | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch fund entry '${id}': ${error.message}`);
    }
    return data ? this.normalizeFundEntry(data) : null;
  }

  async create(dto: CreateFundDTO): Promise<FundEntry> {
    if (dto.qty <= 0) throw new Error('Qty must be greater than zero');
    if (dto.rate <= 0) throw new Error('Rate must be greater than zero');

    const now = new Date().toISOString();
    const id = `fund_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const amount = round2((dto.qty * dto.rate) / 100);

    const entry: FundEntry = {
      id,
      date: dto.date,
      qty: dto.qty,
      rate: dto.rate,
      amount,
      note: dto.note?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).insert(entry).select().single();
    if (error) {
      throw new Error(`Failed to create fund entry: ${error.message}`);
    }
    return this.normalizeFundEntry(data);
  }

  async update(id: string, dto: UpdateFundDTO): Promise<FundEntry> {
    if (dto.qty <= 0) throw new Error('Qty must be greater than zero');
    if (dto.rate <= 0) throw new Error('Rate must be greater than zero');

    const existing = await this.getById(id);
    if (!existing) throw new Error(`Fund entry '${id}' not found`);

    const now = new Date().toISOString();
    const amount = round2((dto.qty * dto.rate) / 100);

    const updated = {
      date: dto.date,
      qty: dto.qty,
      rate: dto.rate,
      amount,
      note: dto.note?.trim() || null,
      updated_at: now,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).update(updated).eq('id', id).select().single();
    if (error) {
      throw new Error(`Failed to update fund entry '${id}': ${error.message}`);
    }
    return this.normalizeFundEntry(data);
  }

  async delete(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete fund entry '${id}': ${error.message}`);
    }
  }

  async getLatestRate(): Promise<number | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select('rate')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return Number(data.rate);
  }

  private normalizeFundEntry(raw: any): FundEntry {
    return {
      ...raw,
      qty: Number(raw.qty) || 0,
      rate: Number(raw.rate) || 0,
      amount: Number(raw.amount) || 0,
      note: raw.note || undefined,
    };
  }
}
