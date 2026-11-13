export type AccountType = 'cash' | 'bank' | 'sales' | 'agent' | 'opening_balance';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  is_system?: boolean;
  created_at: string;
}

export const SYSTEM_ACCOUNTS = {
  CASH: 'acc_cash',
  BANK: 'acc_bank',
  SALES: 'acc_sales',
  OPENING_BALANCE: 'acc_opening_balance',
} as const;

export interface Entry {
  id: string;
  transaction_id: string;
  account_id: string;
  debit: number;
  credit: number;
  date: string; // YYYY-MM-DD
  narration: string;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'sale' | 'receipt' | 'sale_cancel' | 'opening_balance';

export interface SalePayload {
  agent_id: string;
  party: string;
  qty: number;
  rate: number;
  amount: number;
  fund_rate?: number;  // snapshotted fund rate at time of sale creation
  fund_cost?: number;  // qty × fund_rate / 100
}

export interface FundEntry {
  id: string;
  date: string;      // YYYY-MM-DD
  qty: number;
  rate: number;      // fund add rate
  amount: number;    // qty × rate / 100
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface ReceiptPayload {
  agent_id: string;
  received_in: 'cash' | 'bank';
  amount: number;
  note?: string;
}

export interface SaleCancelPayload {
  sale_id: string;
  agent_id: string;
  qty: number;
  rate: number; // Sale's current rate when created/recalculated
  amount: number; // (qty * rate) / 100
  reason?: string;
}

export interface OpeningBalancePayload {
  agent_id: string;
  amount: number;
  balance_type: 'dr' | 'cr'; // dr = agent owes us, cr = agent owed
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  sale_details?: SalePayload;
  receipt_details?: ReceiptPayload;
  cancel_details?: SaleCancelPayload;
  opening_balance_details?: OpeningBalancePayload;
}

export interface RateSlab {
  id: string;
  from_qty: number;
  rate: number;
}

export interface RateCategory {
  id: string;
  name: string;
  slabs: RateSlab[];
  created_at: string;
  updated_at: string;
}

export interface AgentRateOverride {
  slab_id: string;
  rate: number;
}

export interface Agent {
  id: string;
  name: string;
  phone?: string;
  account_id: string;
  rate_category_id: string;
  rate_overrides?: AgentRateOverride[];
  created_at: string;
  updated_at: string;
}

export interface StatementRow {
  date: string;
  type?: string;
  particulars: string;
  qty?: number;
  rate?: number;
  debit: number;
  credit: number;
  balance: number;
  balanceType: 'Dr' | 'Cr' | '';
  transaction_id?: string;
  transaction_type?: TransactionType;
}

export interface AgentStatement {
  agent: Agent;
  fromDate: string;
  toDate: string;
  openingBalance: {
    amount: number;
    type: 'Dr' | 'Cr' | '';
  };
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: {
    amount: number;
    type: 'Dr' | 'Cr' | '';
  };
}
