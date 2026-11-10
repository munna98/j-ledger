import {
  Account,
  Agent,
  Entry,
  Transaction,
} from '@/types';
import { CreateAgentDTO, IAgentRepo, UpdateAgentDTO } from '../types';
import { storageClient } from './storage';
import { buildOpeningBalanceEntries } from '@/lib/accounting';

export class LocalStorageAgentRepo implements IAgentRepo {
  async getAll(): Promise<Agent[]> {
    return storageClient.getAgents();
  }

  async getById(id: string): Promise<Agent | null> {
    const list = storageClient.getAgents();
    return list.find((a) => a.id === id) || null;
  }

  async hasTransactions(agentId: string): Promise<boolean> {
    const transactions = storageClient.getTransactions();
    const hasTx = transactions.some((t) => {
      return (
        t.sale_details?.agent_id === agentId ||
        t.receipt_details?.agent_id === agentId ||
        t.cancel_details?.agent_id === agentId ||
        t.opening_balance_details?.agent_id === agentId
      );
    });

    if (hasTx) return true;

    const agent = storageClient.getAgents().find((a) => a.id === agentId);
    if (!agent) return false;

    const entries = storageClient.getEntries();
    return entries.some((e) => e.account_id === agent.account_id);
  }

  async create(dto: CreateAgentDTO): Promise<Agent> {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const accountId = `acc_agent_${agentId}`;
    const now = new Date().toISOString();

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

    const account: Account = {
      id: accountId,
      name: `${agent.name} A/c`,
      type: 'agent',
      created_at: now,
    };

    const currentAgents = storageClient.getAgents();
    const currentAccounts = storageClient.getAccounts();
    const currentTransactions = storageClient.getTransactions();
    const currentEntries = storageClient.getEntries();

    let newTransactions: Transaction[] = currentTransactions;
    let newEntries: Entry[] = currentEntries;

    // Handle optional opening balance transaction
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

      newTransactions = [obTransaction, ...currentTransactions];
      newEntries = [...currentEntries, ...obEntries];
    }

    storageClient.commitBatch({
      agents: [...currentAgents, agent],
      accounts: [...currentAccounts, account],
      transactions: newTransactions,
      entries: newEntries,
    });

    return agent;
  }

  async update(id: string, dto: UpdateAgentDTO): Promise<Agent> {
    const list = storageClient.getAgents();
    const existing = list.find((a) => a.id === id);
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

    // Update account name if agent name changed
    const accounts = storageClient.getAccounts();
    const nextAccounts = accounts.map((acc) => {
      if (acc.id === existing.account_id) {
        return {
          ...acc,
          name: `${updated.name} A/c`,
        };
      }
      return acc;
    });

    const nextAgents = list.map((a) => (a.id === id ? updated : a));

    storageClient.commitBatch({
      agents: nextAgents,
      accounts: nextAccounts,
    });

    return updated;
  }

  async delete(id: string): Promise<void> {
    const hasTx = await this.hasTransactions(id);
    if (hasTx) {
      throw new Error('Cannot delete agent: This agent has recorded transactions.');
    }

    const list = storageClient.getAgents();
    const agent = list.find((a) => a.id === id);
    if (!agent) {
      throw new Error(`Agent with ID '${id}' not found`);
    }

    const nextAgents = list.filter((a) => a.id !== id);
    const accounts = storageClient.getAccounts().filter((acc) => acc.id !== agent.account_id);

    storageClient.commitBatch({
      agents: nextAgents,
      accounts,
    });
  }
}
