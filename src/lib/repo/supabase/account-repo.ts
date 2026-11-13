import { Account } from '@/types';
import { IAccountRepo } from '../types';
import { getSupabase } from '@/lib/supabase/client';
import { DEFAULT_ACCOUNTS } from '../local-storage/storage';

const TABLE = 'jledger_accounts';

export class SupabaseAccountRepo implements IAccountRepo {
  async getAll(): Promise<Account[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').order('name');
    if (error) {
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }
    return (data || []) as Account[];
  }

  async getById(id: string): Promise<Account | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch account '${id}': ${error.message}`);
    }
    return data as Account | null;
  }

  async create(account: Account): Promise<Account> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).insert(account).select().single();
    if (error) {
      throw new Error(`Failed to create account '${account.name}': ${error.message}`);
    }
    return data as Account;
  }

  async ensureDefaultAccounts(): Promise<void> {
    const supabase = getSupabase();
    for (const def of DEFAULT_ACCOUNTS) {
      const { error } = await supabase
        .from(TABLE)
        .upsert(def, { onConflict: 'id' });
      if (error) {
        console.error(`Failed to ensure default account '${def.name}':`, error.message);
      }
    }
  }
}
