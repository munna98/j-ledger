import {
  Account,
  Agent,
  Transaction,
} from '@/types';
import { CreateAgentDTO, IAgentRepo, UpdateAgentDTO } from '../types';
import { getSupabase } from '@/lib/supabase/client';
import { buildOpeningBalanceEntries, round2 } from '@/lib/accounting';

const AGENTS_TABLE = 'jledger_agents';
const ACCOUNTS_TABLE = 'jledger_accounts';
const TRANSACTIONS_TABLE = 'jledger_transactions';
const ENTRIES_TABLE = 'jledger_entries';

export class SupabaseAgentRepo implements IAgentRepo {
  async getAll(): Promise<Agent[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(AGENTS_TABLE).select('*').order('name');
    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }
    return (data || []) as Agent[];
  }

  async getById(id: string): Promise<Agent | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(AGENTS_TABLE).select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch agent '${id}': ${error.message}`);
    }
    return data as Agent | null;
  }

  async hasTransactions(agentId: string): Promise<boolean> {
    const supabase = getSupabase();

    // Check transactions where agent is referenced in payloads
    const { data: txList, error: txError } = await supabase
      .from(TRANSACTIONS_TABLE)
      .select('id, type, sale_details, receipt_details, cancel_details, opening_balance_details')
      .or(
        `sale_details->>agent_id.eq.${agentId},receipt_details->>agent_id.eq.${agentId},cancel_details->>agent_id.eq.${agentId},opening_balance_details->>agent_id.eq.${agentId}`
      );

    if (txError) {
      throw new Error(`Failed to check agent transactions: ${txError.message}`);
    }

    // Filter out transactions that aren't opening_balance if any exist
    const nonObTxs = (txList || []).filter((t) => t.type !== 'opening_balance');
    if (nonObTxs.length > 0) return true;

    // Check if agent's account has any entries other than opening balance
    const agent = await this.getById(agentId);
    if (!agent) return false;

    const { data: entries, error: entriesError } = await supabase
      .from(ENTRIES_TABLE)
      .select('transaction_id')
      .eq('account_id', agent.account_id);

    if (entriesError) {
      throw new Error(`Failed to check agent ledger entries: ${entriesError.message}`);
    }

    if (!entries || entries.length === 0) return false;

    // Check if entries belong to anything other than opening balance
    const obTxIds = new Set((txList || []).filter((t) => t.type === 'opening_balance').map((t) => t.id));
    return entries.some((e) => !obTxIds.has(e.transaction_id));
  }

  async getOpeningBalance(agentId: string): Promise<Transaction | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TRANSACTIONS_TABLE)
      .select('*')
      .eq('type', 'opening_balance')
      .eq('opening_balance_details->>agent_id', agentId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch opening balance: ${error.message}`);
    }
    return data as Transaction | null;
  }

  async create(dto: CreateAgentDTO): Promise<Agent> {
    const supabase = getSupabase();
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const accountId = `acc_agent_${agentId}`;
    const now = new Date().toISOString();

    const account: Account = {
      id: accountId,
      name: `${dto.name.trim()} A/c`,
      type: 'agent',
      created_at: now,
    };

    const agent: Agent = {
      id: agentId,
      name: dto.name.trim(),
      phone: dto.phone?.trim() || undefined,
      account_id: accountId,
      rate_category_id: dto.rate_category_id,
      rate_overrides: dto.rate_overrides || [],
      created_at: now,
      updated_at: now,
    };

    // 1. Create agent ledger account
    const { error: accErr } = await supabase.from(ACCOUNTS_TABLE).insert(account);
    if (accErr) {
      throw new Error(`Failed to create agent account: ${accErr.message}`);
    }

    // 2. Create agent record
    const { error: agentErr } = await supabase.from(AGENTS_TABLE).insert(agent);
    if (agentErr) {
      // Rollback account
      await supabase.from(ACCOUNTS_TABLE).delete().eq('id', accountId);
      throw new Error(`Failed to create agent: ${agentErr.message}`);
    }

    // 3. Handle optional opening balance
    if (dto.opening_balance && dto.opening_balance.amount > 0) {
      const obTxId = `tx_ob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const obDate = dto.opening_balance.date || new Date().toISOString().split('T')[0];

      const { entries: obEntries, amount } = buildOpeningBalanceEntries({
        transaction_id: obTxId,
        date: obDate,
        agent_account_id: accountId,
        amount: dto.opening_balance.amount,
        balance_type: dto.opening_balance.balance_type,
        created_at: now,
        updated_at: now,
      });

      const obTransaction: Transaction = {
        id: obTxId,
        type: 'opening_balance',
        date: obDate,
        created_at: now,
        updated_at: now,
        opening_balance_details: {
          agent_id: agentId,
          amount,
          balance_type: dto.opening_balance.balance_type,
        },
      };

      const { error: txErr } = await supabase.from(TRANSACTIONS_TABLE).insert(obTransaction);
      if (txErr) {
        console.error('Failed to insert opening balance transaction:', txErr.message);
      } else {
        const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(obEntries);
        if (entriesErr) {
          console.error('Failed to insert opening balance entries:', entriesErr.message);
        }
      }
    }

    return agent;
  }

  async update(id: string, dto: UpdateAgentDTO): Promise<Agent> {
    const supabase = getSupabase();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Agent with ID '${id}' not found`);
    }

    const now = new Date().toISOString();
    const updated: Agent = {
      ...existing,
      name: dto.name.trim(),
      phone: dto.phone !== undefined ? dto.phone.trim() || undefined : existing.phone,
      rate_category_id: dto.rate_category_id || existing.rate_category_id,
      rate_overrides: dto.rate_overrides !== undefined ? dto.rate_overrides : existing.rate_overrides,
      updated_at: now,
    };

    // 1. Update agent record
    const { error: agentErr } = await supabase.from(AGENTS_TABLE).update(updated).eq('id', id);
    if (agentErr) {
      throw new Error(`Failed to update agent: ${agentErr.message}`);
    }

    // 2. Update account name if agent name changed
    if (existing.name !== updated.name) {
      await supabase
        .from(ACCOUNTS_TABLE)
        .update({ name: `${updated.name} A/c` })
        .eq('id', existing.account_id);
    }

    // 3. Update opening balance if specified
    if (dto.opening_balance !== undefined) {
      const existingObTx = await this.getOpeningBalance(id);
      const newAmount = dto.opening_balance ? round2(dto.opening_balance.amount) : 0;

      if (dto.opening_balance && newAmount > 0) {
        const obDate = dto.opening_balance.date || (existingObTx?.date ?? now.split('T')[0]);
        const obBalanceType = dto.opening_balance.balance_type;
        const obTxId = existingObTx?.id || `tx_ob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const obCreatedAt = existingObTx?.created_at || now;

        const { entries: obEntries, amount } = buildOpeningBalanceEntries({
          transaction_id: obTxId,
          date: obDate,
          agent_account_id: existing.account_id,
          amount: newAmount,
          balance_type: obBalanceType,
          created_at: obCreatedAt,
          updated_at: now,
        });

        const obTransaction: Transaction = {
          id: obTxId,
          type: 'opening_balance',
          date: obDate,
          created_at: obCreatedAt,
          updated_at: now,
          opening_balance_details: {
            agent_id: id,
            amount,
            balance_type: obBalanceType,
          },
        };

        if (existingObTx) {
          // Delete existing entries (cascade will delete them if tx deleted, or delete entries manually)
          await supabase.from(ENTRIES_TABLE).delete().eq('transaction_id', existingObTx.id);
          await supabase.from(TRANSACTIONS_TABLE).update(obTransaction).eq('id', existingObTx.id);
          await supabase.from(ENTRIES_TABLE).insert(obEntries);
        } else {
          await supabase.from(TRANSACTIONS_TABLE).insert(obTransaction);
          await supabase.from(ENTRIES_TABLE).insert(obEntries);
        }
      } else if (existingObTx) {
        // Remove existing OB transaction (cascade deletes entries)
        await supabase.from(TRANSACTIONS_TABLE).delete().eq('id', existingObTx.id);
      }
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const hasTx = await this.hasTransactions(id);
    if (hasTx) {
      throw new Error('Cannot delete agent: This agent has recorded transactions.');
    }

    const agent = await this.getById(id);
    if (!agent) {
      throw new Error(`Agent with ID '${id}' not found`);
    }

    const supabase = getSupabase();

    // Delete any opening balance transaction if present
    const obTx = await this.getOpeningBalance(id);
    if (obTx) {
      await supabase.from(TRANSACTIONS_TABLE).delete().eq('id', obTx.id);
    }

    // Delete agent
    const { error: agentErr } = await supabase.from(AGENTS_TABLE).delete().eq('id', id);
    if (agentErr) {
      throw new Error(`Failed to delete agent: ${agentErr.message}`);
    }

    // Delete account
    await supabase.from(ACCOUNTS_TABLE).delete().eq('id', agent.account_id);
  }
}
