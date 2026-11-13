import { IRepository } from '../types';
import { SupabaseAccountRepo } from './account-repo';
import { SupabaseRateCategoryRepo } from './rate-category-repo';
import { SupabaseAgentRepo } from './agent-repo';
import { SupabaseTransactionRepo } from './transaction-repo';
import { SupabaseEntryRepo } from './entry-repo';
import { SupabaseFundRepo } from './fund-repo';
import { getSupabase } from '@/lib/supabase/client';

export class SupabaseRepository implements IRepository {
  public accounts = new SupabaseAccountRepo();
  public rateCategories = new SupabaseRateCategoryRepo();
  public agents = new SupabaseAgentRepo();
  public transactions = new SupabaseTransactionRepo();
  public entries = new SupabaseEntryRepo();
  public funds = new SupabaseFundRepo();

  async resetAllData(): Promise<void> {
    const supabase = getSupabase();
    // Delete in dependency order
    await supabase.from('jledger_entries').delete().neq('id', '');
    await supabase.from('jledger_transactions').delete().neq('id', '');
    await supabase.from('jledger_agents').delete().neq('id', '');
    await supabase.from('jledger_accounts').delete().eq('is_system', false);
    await supabase.from('jledger_fund_entries').delete().neq('id', '');
  }
}
