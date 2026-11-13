import { Entry } from '@/types';
import { IEntryRepo } from '../types';
import { getSupabase } from '@/lib/supabase/client';

const TABLE = 'jledger_entries';

export class SupabaseEntryRepo implements IEntryRepo {
  async getAll(): Promise<Entry[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').order('date', { ascending: false });
    if (error) {
      throw new Error(`Failed to fetch entries: ${error.message}`);
    }
    return (data || []).map(this.normalizeEntry);
  }

  async getByAccountId(accountId: string): Promise<Entry[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to fetch entries for account '${accountId}': ${error.message}`);
    }
    return (data || []).map(this.normalizeEntry);
  }

  async getByTransactionId(transactionId: string): Promise<Entry[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('transaction_id', transactionId);
    if (error) {
      throw new Error(`Failed to fetch entries for transaction '${transactionId}': ${error.message}`);
    }
    return (data || []).map(this.normalizeEntry);
  }

  private normalizeEntry(raw: any): Entry {
    return {
      ...raw,
      debit: Number(raw.debit) || 0,
      credit: Number(raw.credit) || 0,
    };
  }
}
