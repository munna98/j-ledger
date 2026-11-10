import {
  Account,
  Agent,
  Entry,
  RateCategory,
  Transaction,
  TransactionType,
  AgentRateOverride,
} from '@/types';

export interface CreateAgentDTO {
  name: string;
  phone?: string;
  rate_category_id: string;
  rate_overrides?: AgentRateOverride[];
  opening_balance?: {
    amount: number;
    balance_type: 'dr' | 'cr';
    date?: string;
  };
}

export interface UpdateAgentDTO {
  name: string;
  phone?: string;
  rate_category_id: string;
  rate_overrides?: AgentRateOverride[];
}

export interface CreateSaleDTO {
  date: string;
  agent_id: string;
  party: string;
  qty: number;
  rate: number;
}

export interface UpdateSaleDTO {
  date: string;
  agent_id: string;
  party: string;
  qty: number;
  rate: number;
}

export interface CreateReceiptDTO {
  date: string;
  agent_id: string;
  received_in: 'cash' | 'bank';
  amount: number;
  note?: string;
}

export interface UpdateReceiptDTO {
  date: string;
  agent_id: string;
  received_in: 'cash' | 'bank';
  amount: number;
  note?: string;
}

export interface CreateSaleCancelDTO {
  sale_id: string;
  date: string;
  qty: number;
  reason?: string;
}

export interface UpdateSaleCancelDTO {
  qty: number;
  reason?: string;
  date?: string;
}

export interface TransactionFilter {
  type?: TransactionType;
  agent_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface IAccountRepo {
  getAll(): Promise<Account[]>;
  getById(id: string): Promise<Account | null>;
  create(account: Account): Promise<Account>;
  ensureDefaultAccounts(): Promise<void>;
}

export interface IRateCategoryRepo {
  getAll(): Promise<RateCategory[]>;
  getById(id: string): Promise<RateCategory | null>;
  create(category: Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>): Promise<RateCategory>;
  update(id: string, category: Partial<Omit<RateCategory, 'id' | 'created_at' | 'updated_at'>>): Promise<RateCategory>;
  delete(id: string): Promise<void>;
}

export interface IAgentRepo {
  getAll(): Promise<Agent[]>;
  getById(id: string): Promise<Agent | null>;
  create(dto: CreateAgentDTO): Promise<Agent>;
  update(id: string, dto: UpdateAgentDTO): Promise<Agent>;
  delete(id: string): Promise<void>;
  hasTransactions(agentId: string): Promise<boolean>;
}

export interface IEntryRepo {
  getAll(): Promise<Entry[]>;
  getByAccountId(accountId: string): Promise<Entry[]>;
  getByTransactionId(transactionId: string): Promise<Entry[]>;
}

export interface ITransactionRepo {
  getAll(filter?: TransactionFilter): Promise<Transaction[]>;
  getById(id: string): Promise<Transaction | null>;
  getWithEntries(id: string): Promise<{ transaction: Transaction; entries: Entry[] } | null>;
  getSaleCancels(saleId: string): Promise<Transaction[]>;

  createSale(dto: CreateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  updateSale(id: string, dto: UpdateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  deleteSale(id: string): Promise<void>;

  createReceipt(dto: CreateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  updateReceipt(id: string, dto: UpdateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  deleteReceipt(id: string): Promise<void>;

  createSaleCancel(dto: CreateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  updateSaleCancel(id: string, dto: UpdateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }>;
  deleteSaleCancel(id: string): Promise<void>;

  deleteTransaction(id: string): Promise<void>;
}

export interface IRepository {
  accounts: IAccountRepo;
  rateCategories: IRateCategoryRepo;
  agents: IAgentRepo;
  transactions: ITransactionRepo;
  entries: IEntryRepo;
  resetAllData(): Promise<void>;
}
