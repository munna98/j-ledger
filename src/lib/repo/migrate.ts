import { storageClient } from './local-storage/storage';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface MigrationSummary {
  accounts: number;
  rateCategories: number;
  agents: number;
  transactions: number;
  entries: number;
  funds: number;
}

/**
 * Migrates all local-storage data into the Supabase database (jledger_* tables).
 */
export async function migrateLocalStorageToSupabase(): Promise<MigrationSummary> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add credentials to .env.local first.');
  }

  const supabase = getSupabase();
  const summary: MigrationSummary = {
    accounts: 0,
    rateCategories: 0,
    agents: 0,
    transactions: 0,
    entries: 0,
    funds: 0,
  };

  // 1. Accounts
  const accounts = storageClient.getAccounts();
  if (accounts.length > 0) {
    const { error } = await supabase.from('jledger_accounts').upsert(accounts, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate accounts: ${error.message}`);
    summary.accounts = accounts.length;
  }

  // 2. Rate Categories
  const categories = storageClient.getRateCategories();
  if (categories.length > 0) {
    const { error } = await supabase.from('jledger_rate_categories').upsert(categories, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate rate categories: ${error.message}`);
    summary.rateCategories = categories.length;
  }

  // 3. Agents
  const agents = storageClient.getAgents();
  if (agents.length > 0) {
    const { error } = await supabase.from('jledger_agents').upsert(agents, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate agents: ${error.message}`);
    summary.agents = agents.length;
  }

  // 4. Transactions
  const transactions = storageClient.getTransactions();
  if (transactions.length > 0) {
    const { error } = await supabase.from('jledger_transactions').upsert(transactions, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate transactions: ${error.message}`);
    summary.transactions = transactions.length;
  }

  // 5. Entries
  const entries = storageClient.getEntries();
  if (entries.length > 0) {
    const { error } = await supabase.from('jledger_entries').upsert(entries, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate entries: ${error.message}`);
    summary.entries = entries.length;
  }

  // 6. Funds
  const funds = storageClient.getFunds();
  if (funds.length > 0) {
    const { error } = await supabase.from('jledger_fund_entries').upsert(funds, { onConflict: 'id' });
    if (error) throw new Error(`Failed to migrate funds: ${error.message}`);
    summary.funds = funds.length;
  }

  return summary;
}
