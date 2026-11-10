import {
  Entry,
  SYSTEM_ACCOUNTS,
  RateSlab,
  AgentRateOverride,
  Agent,
  AgentStatement,
  StatementRow,
  Transaction,
} from '@/types';
import { formatNumber } from '@/lib/format';

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Validates that an array of entries is perfectly balanced.
 * Throws an Error if total debits != total credits or any amount is negative.
 */
export function validateBalancedEntries(entries: Entry[]): boolean {
  if (!entries || entries.length === 0) {
    throw new Error('Entries array cannot be empty');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    if (entry.debit < 0 || entry.credit < 0) {
      throw new Error(`Negative amounts not allowed in entries: Dr ${entry.debit}, Cr ${entry.credit}`);
    }
    if (entry.debit > 0 && entry.credit > 0) {
      throw new Error(`Single entry cannot have both debit and credit: Dr ${entry.debit}, Cr ${entry.credit}`);
    }
    totalDebit = round2(totalDebit + entry.debit);
    totalCredit = round2(totalCredit + entry.credit);
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Unbalanced entries: Total Dr (${totalDebit}) does not equal Total Cr (${totalCredit})`);
  }

  return true;
}

export interface BuildSaleParams {
  transaction_id: string;
  date: string;
  agent_account_id: string;
  party: string;
  qty: number;
  rate: number;
  created_at?: string;
  updated_at?: string;
}

export function buildSaleEntries(params: BuildSaleParams): { entries: Entry[]; amount: number } {
  const { transaction_id, date, agent_account_id, party, qty, rate } = params;
  const now = new Date().toISOString();
  const created_at = params.created_at || now;
  const updated_at = params.updated_at || now;
  const amount = round2(qty * rate);

  const narration = `Sale - Party: ${party.trim() || 'Direct'} (Qty: ${qty} @ ${formatNumber(rate)})`;

  const entries: Entry[] = [
    {
      id: `${transaction_id}_dr`,
      transaction_id,
      account_id: agent_account_id,
      debit: amount,
      credit: 0,
      date,
      narration,
      created_at,
      updated_at,
    },
    {
      id: `${transaction_id}_cr`,
      transaction_id,
      account_id: SYSTEM_ACCOUNTS.SALES,
      debit: 0,
      credit: amount,
      date,
      narration,
      created_at,
      updated_at,
    },
  ];

  validateBalancedEntries(entries);
  return { entries, amount };
}

export interface BuildReceiptParams {
  transaction_id: string;
  date: string;
  agent_account_id: string;
  received_in: 'cash' | 'bank';
  amount: number;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export function buildReceiptEntries(params: BuildReceiptParams): { entries: Entry[]; amount: number } {
  const { transaction_id, date, agent_account_id, received_in, note } = params;
  const now = new Date().toISOString();
  const created_at = params.created_at || now;
  const updated_at = params.updated_at || now;
  const amount = round2(params.amount);

  const destinationAccountId =
    received_in === 'cash' ? SYSTEM_ACCOUNTS.CASH : SYSTEM_ACCOUNTS.BANK;

  const narration = `Receipt via ${received_in === 'cash' ? 'Cash' : 'Bank'}${note ? ` - ${note.trim()}` : ''}`;

  const entries: Entry[] = [
    {
      id: `${transaction_id}_dr`,
      transaction_id,
      account_id: destinationAccountId,
      debit: amount,
      credit: 0,
      date,
      narration,
      created_at,
      updated_at,
    },
    {
      id: `${transaction_id}_cr`,
      transaction_id,
      account_id: agent_account_id,
      debit: 0,
      credit: amount,
      date,
      narration,
      created_at,
      updated_at,
    },
  ];

  validateBalancedEntries(entries);
  return { entries, amount };
}

export interface BuildSaleCancelParams {
  transaction_id: string;
  sale_id: string;
  date: string;
  agent_account_id: string;
  qty: number;
  rate: number;
  reason?: string;
  created_at?: string;
  updated_at?: string;
}

export function buildSaleCancelEntries(params: BuildSaleCancelParams): { entries: Entry[]; amount: number } {
  const { transaction_id, date, agent_account_id, qty, rate, reason } = params;
  const now = new Date().toISOString();
  const created_at = params.created_at || now;
  const updated_at = params.updated_at || now;
  const amount = round2(qty * rate);

  const narration = `Sale Cancel (Qty: ${qty} @ ${formatNumber(rate)})${reason ? ` - ${reason.trim()}` : ''}`;

  const entries: Entry[] = [
    {
      id: `${transaction_id}_dr`,
      transaction_id,
      account_id: SYSTEM_ACCOUNTS.SALES,
      debit: amount,
      credit: 0,
      date,
      narration,
      created_at,
      updated_at,
    },
    {
      id: `${transaction_id}_cr`,
      transaction_id,
      account_id: agent_account_id,
      debit: 0,
      credit: amount,
      date,
      narration,
      created_at,
      updated_at,
    },
  ];

  validateBalancedEntries(entries);
  return { entries, amount };
}

export interface BuildOpeningBalanceParams {
  transaction_id: string;
  date: string;
  agent_account_id: string;
  amount: number;
  balance_type: 'dr' | 'cr';
  created_at?: string;
  updated_at?: string;
}

export function buildOpeningBalanceEntries(params: BuildOpeningBalanceParams): { entries: Entry[]; amount: number } {
  const { transaction_id, date, agent_account_id, balance_type } = params;
  const now = new Date().toISOString();
  const created_at = params.created_at || now;
  const updated_at = params.updated_at || now;
  const amount = round2(params.amount);

  const narration = `Opening Balance (${balance_type === 'dr' ? 'Owes us' : 'Agent owed'})`;

  let entries: Entry[];
  if (balance_type === 'dr') {
    // Dr Agent A/c | Cr Opening Balance A/c
    entries = [
      {
        id: `${transaction_id}_dr`,
        transaction_id,
        account_id: agent_account_id,
        debit: amount,
        credit: 0,
        date,
        narration,
        created_at,
        updated_at,
      },
      {
        id: `${transaction_id}_cr`,
        transaction_id,
        account_id: SYSTEM_ACCOUNTS.OPENING_BALANCE,
        debit: 0,
        credit: amount,
        date,
        narration,
        created_at,
        updated_at,
      },
    ];
  } else {
    // Dr Opening Balance A/c | Cr Agent A/c
    entries = [
      {
        id: `${transaction_id}_dr`,
        transaction_id,
        account_id: SYSTEM_ACCOUNTS.OPENING_BALANCE,
        debit: amount,
        credit: 0,
        date,
        narration,
        created_at,
        updated_at,
      },
      {
        id: `${transaction_id}_cr`,
        transaction_id,
        account_id: agent_account_id,
        debit: 0,
        credit: amount,
        date,
        narration,
        created_at,
        updated_at,
      },
    ];
  }

  validateBalancedEntries(entries);
  return { entries, amount };
}

/**
 * Calculates current balance for an agent's account from all entries.
 * Positive = Agent owes us (Debit balance).
 * Negative = We owe agent (Credit balance).
 */
export function calculateAgentBalance(entries: Entry[], agentAccountId: string): number {
  let net = 0;
  for (const entry of entries) {
    if (entry.account_id === agentAccountId) {
      net = round2(net + (entry.debit - entry.credit));
    }
  }
  return net;
}

/**
 * Derives the label for a slab based on its from_qty and the next slab's from_qty.
 */
export function getSlabRangeLabel(slab: RateSlab, nextSlab?: RateSlab): string {
  if (!nextSlab) {
    return `${slab.from_qty}+`;
  }
  const toQty = nextSlab.from_qty - 1;
  return `${slab.from_qty}-${toQty}`;
}

/**
 * Validates rate category slabs:
 * - First slab starts at 1
 * - from_qty strictly increases
 * - Rates are positive numbers
 */
export function validateSlabs(slabs: RateSlab[]): { valid: boolean; error?: string } {
  if (!slabs || slabs.length === 0) {
    return { valid: false, error: 'At least one slab is required' };
  }

  const sorted = [...slabs].sort((a, b) => a.from_qty - b.from_qty);

  if (sorted[0].from_qty !== 1) {
    return { valid: false, error: 'First slab must start at quantity 1' };
  }

  for (let i = 0; i < sorted.length; i++) {
    if (isNaN(sorted[i].rate) || sorted[i].rate <= 0) {
      return { valid: false, error: `Invalid rate for slab starting at ${sorted[i].from_qty}` };
    }
    if (i > 0 && sorted[i].from_qty <= sorted[i - 1].from_qty) {
      return { valid: false, error: 'From-quantities must strictly increase' };
    }
  }

  return { valid: true };
}

/**
 * Finds matching slab for a given quantity.
 * Matching slab is the one with the highest from_qty <= qty.
 */
export function findMatchingSlab(slabs: RateSlab[], qty: number): { slab?: RateSlab; index: number; nextSlab?: RateSlab } {
  if (!slabs || slabs.length === 0 || qty < 1) {
    return { index: -1 };
  }

  const sorted = [...slabs].sort((a, b) => a.from_qty - b.from_qty);
  let matchedIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    if (qty >= sorted[i].from_qty) {
      matchedIndex = i;
    } else {
      break;
    }
  }

  if (matchedIndex === -1) {
    return { index: -1 };
  }

  return {
    slab: sorted[matchedIndex],
    index: matchedIndex,
    nextSlab: sorted[matchedIndex + 1],
  };
}

/**
 * Resolves the rate for a given agent and qty:
 * Checks agent's specific slab rate override first, then category slab rate.
 */
export function resolveRate(
  slabs: RateSlab[],
  overrides: AgentRateOverride[] | undefined,
  qty: number
): { rate: number; slabLabel: string; isOverridden: boolean; slab?: RateSlab } {
  const { slab, nextSlab } = findMatchingSlab(slabs, qty);
  if (!slab) {
    return { rate: 0, slabLabel: '', isOverridden: false };
  }

  const slabLabel = getSlabRangeLabel(slab, nextSlab);
  const override = overrides?.find((o) => o.slab_id === slab.id && o.rate > 0);

  if (override) {
    return {
      rate: override.rate,
      slabLabel,
      isOverridden: true,
      slab,
    };
  }

  return {
    rate: slab.rate,
    slabLabel,
    isOverridden: false,
    slab,
  };
}

/**
 * Computes agent statement strictly from entries for the agent's account.
 */
export function calculateAgentStatement(
  entries: Entry[],
  agent: Agent,
  fromDate?: string,
  toDate?: string,
  transactions?: Transaction[]
): AgentStatement {
  // Pre-index transactions if provided
  const txMap = new Map<string, Transaction>();
  if (transactions) {
    for (const t of transactions) {
      txMap.set(t.id, t);
    }
  }

  // Filter entries for this agent's account
  const agentEntries = entries
    .filter((e) => e.account_id === agent.account_id)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.created_at.localeCompare(b.created_at);
    });

  let openingBalanceAmount = 0;
  const filteredEntries: Entry[] = [];

  for (const entry of agentEntries) {
    if (fromDate && entry.date < fromDate) {
      openingBalanceAmount = round2(openingBalanceAmount + (entry.debit - entry.credit));
    } else if (!toDate || entry.date <= toDate) {
      filteredEntries.push(entry);
    }
  }

  const openingBalanceType: 'Dr' | 'Cr' | '' =
    openingBalanceAmount > 0 ? 'Dr' : openingBalanceAmount < 0 ? 'Cr' : '';

  let runningBalance = openingBalanceAmount;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: StatementRow[] = [];

  for (const entry of filteredEntries) {
    runningBalance = round2(runningBalance + (entry.debit - entry.credit));
    totalDebit = round2(totalDebit + entry.debit);
    totalCredit = round2(totalCredit + entry.credit);

    const rowBalType: 'Dr' | 'Cr' | '' =
      runningBalance > 0 ? 'Dr' : runningBalance < 0 ? 'Cr' : '';

    const tx = txMap.get(entry.transaction_id);
    let typeStr = 'Transaction';
    let particulars = entry.narration;
    let qty: number | undefined;
    let rate: number | undefined;

    if (tx) {
      if (tx.type === 'sale') {
        typeStr = 'Sale';
        qty = tx.sale_details?.qty;
        rate = tx.sale_details?.rate;
        particulars = tx.sale_details?.party?.trim() ? tx.sale_details.party.trim() : 'Sale';
      } else if (tx.type === 'receipt') {
        typeStr = 'Receipt';
        const mode = tx.receipt_details?.received_in === 'cash' ? 'Cash A/c' : 'Bank A/c';
        particulars = tx.receipt_details?.note?.trim()
          ? `${mode} • ${tx.receipt_details.note.trim()}`
          : mode;
      } else if (tx.type === 'sale_cancel') {
        typeStr = 'Cancel';
        qty = tx.cancel_details?.qty;
        rate = tx.cancel_details?.rate;
        particulars = tx.cancel_details?.reason?.trim() ? tx.cancel_details.reason.trim() : 'Sale Cancel';
      } else if (tx.type === 'opening_balance') {
        typeStr = 'Opening Balance';
        particulars = 'Opening Balance';
      }
    } else {
      // Fallback: extract type, qty, rate and clean particulars from narration if transactions array not provided
      if (entry.narration.startsWith('Sale -')) {
        typeStr = 'Sale';
        const partyMatch = entry.narration.match(/Party:\s*([^()]+)/i);
        if (partyMatch && partyMatch[1].trim() && partyMatch[1].trim() !== 'Direct') {
          particulars = partyMatch[1].trim();
        } else {
          particulars = 'Sale';
        }
        const qtyMatch = entry.narration.match(/Qty:\s*(\d+(\.\d+)?)/i);
        const rateMatch = entry.narration.match(/@\s*([\d,]+(\.\d+)?)/i);
        if (qtyMatch) qty = parseFloat(qtyMatch[1]);
        if (rateMatch) rate = parseFloat(rateMatch[1].replace(/,/g, ''));
      } else if (entry.narration.startsWith('Sale Cancel')) {
        typeStr = 'Cancel';
        const reasonMatch = entry.narration.match(/-\s*(.+)$/);
        particulars = reasonMatch ? reasonMatch[1].trim() : 'Sale Cancel';
        const qtyMatch = entry.narration.match(/Qty:\s*(\d+(\.\d+)?)/i);
        const rateMatch = entry.narration.match(/@\s*([\d,]+(\.\d+)?)/i);
        if (qtyMatch) qty = parseFloat(qtyMatch[1]);
        if (rateMatch) rate = parseFloat(rateMatch[1].replace(/,/g, ''));
      } else if (entry.narration.startsWith('Receipt')) {
        typeStr = 'Receipt';
        const isCash = /Cash/i.test(entry.narration);
        const noteMatch = entry.narration.match(/-\s*(.+)$/);
        const mode = isCash ? 'Cash A/c' : 'Bank A/c';
        particulars = noteMatch ? `${mode} • ${noteMatch[1].trim()}` : mode;
      } else if (entry.narration.startsWith('Opening Balance')) {
        typeStr = 'Opening Balance';
        particulars = 'Opening Balance';
      }
    }

    rows.push({
      date: entry.date,
      type: typeStr,
      particulars,
      qty,
      rate,
      debit: entry.debit,
      credit: entry.credit,
      balance: Math.abs(runningBalance),
      balanceType: rowBalType,
      transaction_id: entry.transaction_id,
      transaction_type: tx?.type,
    });
  }

  const closingBalanceType: 'Dr' | 'Cr' | '' =
    runningBalance > 0 ? 'Dr' : runningBalance < 0 ? 'Cr' : '';

  return {
    agent,
    fromDate: fromDate || '',
    toDate: toDate || '',
    openingBalance: {
      amount: Math.abs(openingBalanceAmount),
      type: openingBalanceType,
    },
    rows,
    totalDebit,
    totalCredit,
    closingBalance: {
      amount: Math.abs(runningBalance),
      type: closingBalanceType,
    },
  };
}
