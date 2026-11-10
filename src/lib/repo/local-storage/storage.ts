import {
  Account,
  Agent,
  Entry,
  RateCategory,
  SYSTEM_ACCOUNTS,
  Transaction,
} from '@/types';

const STORAGE_KEYS = {
  ACCOUNTS: 'j_ledger_accounts',
  RATE_CATEGORIES: 'j_ledger_rate_categories',
  AGENTS: 'j_ledger_agents',
  TRANSACTIONS: 'j_ledger_transactions',
  ENTRIES: 'j_ledger_entries',
} as const;

// Fallback in-memory store for SSR & unit tests
const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  return memoryStore.get(key) ?? null;
}

function setItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // fallback
    }
  }
  memoryStore.set(key, value);
}

function removeItem(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // fallback
    }
  }
  memoryStore.delete(key);
}

export const DEFAULT_ACCOUNTS: Account[] = [
  {
    id: SYSTEM_ACCOUNTS.CASH,
    name: 'Cash A/c',
    type: 'cash',
    is_system: true,
    created_at: new Date().toISOString(),
  },
  {
    id: SYSTEM_ACCOUNTS.BANK,
    name: 'Bank A/c',
    type: 'bank',
    is_system: true,
    created_at: new Date().toISOString(),
  },
  {
    id: SYSTEM_ACCOUNTS.SALES,
    name: 'Sales A/c',
    type: 'sales',
    is_system: true,
    created_at: new Date().toISOString(),
  },
  {
    id: SYSTEM_ACCOUNTS.OPENING_BALANCE,
    name: 'Opening Balance A/c',
    type: 'opening_balance',
    is_system: true,
    created_at: new Date().toISOString(),
  },
];

export const DEFAULT_RATE_CATEGORIES: RateCategory[] = [
  {
    id: 'rc_standard',
    name: 'Standard',
    slabs: [
      { id: 'slab_1', from_qty: 1, rate: 385 },
      { id: 'slab_2', from_qty: 25, rate: 381.5 },
      { id: 'slab_3', from_qty: 50, rate: 380 },
      { id: 'slab_4', from_qty: 100, rate: 375 },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export class LocalStorageClient {
  public getAccounts(): Account[] {
    const raw = getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) {
      this.setAccounts(DEFAULT_ACCOUNTS);
      return DEFAULT_ACCOUNTS;
    }
    try {
      const parsed = JSON.parse(raw);
      // Ensure default system accounts exist
      let updated = false;
      for (const sysAcc of DEFAULT_ACCOUNTS) {
        if (!parsed.some((a: Account) => a.id === sysAcc.id)) {
          parsed.unshift(sysAcc);
          updated = true;
        }
      }
      if (updated) {
        this.setAccounts(parsed);
      }
      return parsed;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  }

  public setAccounts(accounts: Account[]): void {
    setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  }

  public getRateCategories(): RateCategory[] {
    const raw = getItem(STORAGE_KEYS.RATE_CATEGORIES);
    if (!raw) {
      this.setRateCategories(DEFAULT_RATE_CATEGORIES);
      return DEFAULT_RATE_CATEGORIES;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.setRateCategories(DEFAULT_RATE_CATEGORIES);
        return DEFAULT_RATE_CATEGORIES;
      }
      return parsed;
    } catch {
      return DEFAULT_RATE_CATEGORIES;
    }
  }

  public setRateCategories(categories: RateCategory[]): void {
    setItem(STORAGE_KEYS.RATE_CATEGORIES, JSON.stringify(categories));
  }

  public getAgents(): Agent[] {
    const raw = getItem(STORAGE_KEYS.AGENTS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public setAgents(agents: Agent[]): void {
    setItem(STORAGE_KEYS.AGENTS, JSON.stringify(agents));
  }

  public getTransactions(): Transaction[] {
    const raw = getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public setTransactions(transactions: Transaction[]): void {
    setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }

  public getEntries(): Entry[] {
    const raw = getItem(STORAGE_KEYS.ENTRIES);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public setEntries(entries: Entry[]): void {
    setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  }

  /**
   * Atomic multi-collection commit:
   * Saves updated transactions, entries, agents or accounts in one operation.
   */
  public commitBatch(batch: {
    transactions?: Transaction[];
    entries?: Entry[];
    agents?: Agent[];
    accounts?: Account[];
    rateCategories?: RateCategory[];
  }): void {
    if (batch.transactions !== undefined) {
      this.setTransactions(batch.transactions);
    }
    if (batch.entries !== undefined) {
      this.setEntries(batch.entries);
    }
    if (batch.agents !== undefined) {
      this.setAgents(batch.agents);
    }
    if (batch.accounts !== undefined) {
      this.setAccounts(batch.accounts);
    }
    if (batch.rateCategories !== undefined) {
      this.setRateCategories(batch.rateCategories);
    }
  }

  public resetAll(): void {
    removeItem(STORAGE_KEYS.ACCOUNTS);
    removeItem(STORAGE_KEYS.RATE_CATEGORIES);
    removeItem(STORAGE_KEYS.AGENTS);
    removeItem(STORAGE_KEYS.TRANSACTIONS);
    removeItem(STORAGE_KEYS.ENTRIES);
    memoryStore.clear();
  }
}

export const storageClient = new LocalStorageClient();
