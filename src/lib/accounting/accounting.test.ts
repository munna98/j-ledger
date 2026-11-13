import { describe, it, expect } from 'vitest';
import {
  buildSaleEntries,
  buildReceiptEntries,
  buildSaleCancelEntries,
  buildOpeningBalanceEntries,
  validateBalancedEntries,
  calculateAgentBalance,
  calculateAgentStatement,
  resolveRate,
  getSlabRangeLabel,
  validateSlabs,
  computeFundCost,
  computeSaleProfit,
  calculateFundStats,
} from './index';
import { formatNumber, formatDate } from '@/lib/format';
import { SYSTEM_ACCOUNTS, RateSlab, AgentRateOverride, Agent, Entry, Transaction, FundEntry } from '@/types';

describe('Accounting Pure Functions & Posting Logic', () => {
  const raviAccountId = 'acc_agent_ravi';
  const raviAgent: Agent = {
    id: 'agent_ravi',
    name: 'Ravi',
    phone: '9876543210',
    account_id: raviAccountId,
    rate_category_id: 'cat_standard',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('Example 1: Sale creates balanced entries (Dr Ravi 114.45 | Cr Sales 114.45)', () => {
    const { entries, amount } = buildSaleEntries({
      transaction_id: 'tx_sale_1',
      date: '2026-01-10',
      agent_account_id: raviAccountId,
      party: 'Cash Customer',
      qty: 30,
      rate: 381.5,
    });

    expect(amount).toBe(114.45);
    expect(entries).toHaveLength(2);
    expect(validateBalancedEntries(entries)).toBe(true);

    const drEntry = entries.find((e) => e.debit > 0);
    const crEntry = entries.find((e) => e.credit > 0);

    expect(drEntry?.account_id).toBe(raviAccountId);
    expect(drEntry?.debit).toBe(114.45);
    expect(crEntry?.account_id).toBe(SYSTEM_ACCOUNTS.SALES);
    expect(crEntry?.credit).toBe(114.45);
  });

  it('Example 2: Receipt creates balanced entries (Dr Bank 5,000 | Cr Ravi 5,000)', () => {
    const { entries, amount } = buildReceiptEntries({
      transaction_id: 'tx_rec_1',
      date: '2026-01-11',
      agent_account_id: raviAccountId,
      received_in: 'bank',
      amount: 5000,
      note: 'NEFT ref 12345',
    });

    expect(amount).toBe(5000);
    expect(entries).toHaveLength(2);
    expect(validateBalancedEntries(entries)).toBe(true);

    const drEntry = entries.find((e) => e.debit > 0);
    const crEntry = entries.find((e) => e.credit > 0);

    expect(drEntry?.account_id).toBe(SYSTEM_ACCOUNTS.BANK);
    expect(drEntry?.debit).toBe(5000);
    expect(crEntry?.account_id).toBe(raviAccountId);
    expect(crEntry?.credit).toBe(5000);
  });

  it('Example 3: Partial cancel of sale creates balanced entries (Dr Sales 38.15 | Cr Ravi 38.15)', () => {
    const { entries, amount } = buildSaleCancelEntries({
      transaction_id: 'tx_cancel_1',
      sale_id: 'tx_sale_1',
      date: '2026-01-12',
      agent_account_id: raviAccountId,
      qty: 10,
      rate: 381.5,
      reason: 'Damaged packaging returned',
    });

    expect(amount).toBe(38.15);
    expect(entries).toHaveLength(2);
    expect(validateBalancedEntries(entries)).toBe(true);

    const drEntry = entries.find((e) => e.debit > 0);
    const crEntry = entries.find((e) => e.credit > 0);

    expect(drEntry?.account_id).toBe(SYSTEM_ACCOUNTS.SALES);
    expect(drEntry?.debit).toBe(38.15);
    expect(crEntry?.account_id).toBe(raviAccountId);
    expect(crEntry?.credit).toBe(38.15);
  });

  it('Example 4: Opening balance creates balanced entries for Owes Us (Dr) and Agent Owed (Cr)', () => {
    // Owes us: Dr Agent A/c | Cr Opening Balance A/c
    const owesUs = buildOpeningBalanceEntries({
      transaction_id: 'tx_ob_1',
      date: '2026-01-01',
      agent_account_id: raviAccountId,
      amount: 2500,
      balance_type: 'dr',
    });
    expect(owesUs.amount).toBe(2500);
    expect(validateBalancedEntries(owesUs.entries)).toBe(true);
    expect(owesUs.entries.find((e) => e.debit > 0)?.account_id).toBe(raviAccountId);
    expect(owesUs.entries.find((e) => e.credit > 0)?.account_id).toBe(SYSTEM_ACCOUNTS.OPENING_BALANCE);

    // Agent owed: Dr Opening Balance A/c | Cr Agent A/c
    const agentOwed = buildOpeningBalanceEntries({
      transaction_id: 'tx_ob_2',
      date: '2026-01-01',
      agent_account_id: raviAccountId,
      amount: 1500,
      balance_type: 'cr',
    });
    expect(agentOwed.amount).toBe(1500);
    expect(validateBalancedEntries(agentOwed.entries)).toBe(true);
    expect(agentOwed.entries.find((e) => e.debit > 0)?.account_id).toBe(SYSTEM_ACCOUNTS.OPENING_BALANCE);
    expect(agentOwed.entries.find((e) => e.credit > 0)?.account_id).toBe(raviAccountId);
  });

  it('Editing a sale rebuilds entries and keeps them strictly balanced', () => {
    // Initial sale: 30 qty @ 381.5 = 11,445
    const initial = buildSaleEntries({
      transaction_id: 'tx_sale_edit',
      date: '2026-01-10',
      agent_account_id: raviAccountId,
      party: 'Party A',
      qty: 30,
      rate: 381.5,
      created_at: '2026-01-10T10:00:00.000Z',
    });
    expect(initial.amount).toBe(114.45);
    expect(validateBalancedEntries(initial.entries)).toBe(true);

    // Edit sale: revised to 35 qty @ 380 = 133
    const edited = buildSaleEntries({
      transaction_id: 'tx_sale_edit', // preserves transaction_id
      date: '2026-01-10',
      agent_account_id: raviAccountId,
      party: 'Party A Modified',
      qty: 35,
      rate: 380,
      created_at: initial.entries[0].created_at,
      updated_at: '2026-01-11T12:00:00.000Z',
    });

    expect(edited.amount).toBe(133);
    expect(validateBalancedEntries(edited.entries)).toBe(true);
    expect(edited.entries[0].transaction_id).toBe('tx_sale_edit');
    expect(edited.entries[0].created_at).toBe('2026-01-10T10:00:00.000Z');
    expect(edited.entries[0].updated_at).toBe('2026-01-11T12:00:00.000Z');
  });

  it('Recalculates cancel entries when sale rate is edited', () => {
    // When sale rate changes from 381.5 to 390, a 10 qty cancel recalculates from 38.15 to 39.00
    const originalCancel = buildSaleCancelEntries({
      transaction_id: 'tx_cancel_1',
      sale_id: 'tx_sale_1',
      date: '2026-01-12',
      agent_account_id: raviAccountId,
      qty: 10,
      rate: 381.5,
    });
    expect(originalCancel.amount).toBe(38.15);

    const recalculatedCancel = buildSaleCancelEntries({
      transaction_id: 'tx_cancel_1',
      sale_id: 'tx_sale_1',
      date: '2026-01-12',
      agent_account_id: raviAccountId,
      qty: 10,
      rate: 390, // new rate from edited sale
    });
    expect(recalculatedCancel.amount).toBe(39);
    expect(validateBalancedEntries(recalculatedCancel.entries)).toBe(true);
  });

  it('Rate categories and slab matching logic', () => {
    const slabs: RateSlab[] = [
      { id: 's1', from_qty: 1, rate: 385 },
      { id: 's2', from_qty: 25, rate: 381.5 },
      { id: 's3', from_qty: 50, rate: 380 },
      { id: 's4', from_qty: 100, rate: 375 },
    ];

    expect(validateSlabs(slabs).valid).toBe(true);
    expect(getSlabRangeLabel(slabs[0], slabs[1])).toBe('1-24');
    expect(getSlabRangeLabel(slabs[1], slabs[2])).toBe('25-49');
    expect(getSlabRangeLabel(slabs[2], slabs[3])).toBe('50-99');
    expect(getSlabRangeLabel(slabs[3], undefined)).toBe('100+');

    // Qty 24 falls in 1-24
    const res24 = resolveRate(slabs, undefined, 24);
    expect(res24.rate).toBe(385);
    expect(res24.slabLabel).toBe('1-24');

    // Qty 25 falls in 25-49
    const res25 = resolveRate(slabs, undefined, 25);
    expect(res25.rate).toBe(381.5);
    expect(res25.slabLabel).toBe('25-49');

    // Agent override for 25-49 slab
    const overrides: AgentRateOverride[] = [{ slab_id: 's2', rate: 379.5 }];
    const resOverride = resolveRate(slabs, overrides, 25);
    expect(resOverride.rate).toBe(379.5);
    expect(resOverride.isOverridden).toBe(true);
  });

  it('Agent Statement: calculates opening balance, running balance and totals strictly from entries', () => {
    const allEntries: Entry[] = [
      // Pre-period opening balance: Dr 2,000 on 2026-01-01
      {
        id: 'e1',
        transaction_id: 't1',
        account_id: raviAccountId,
        debit: 2000,
        credit: 0,
        date: '2026-01-01',
        narration: 'Opening Balance (Owes us)',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      // Sale on 2026-01-10: Dr 11,445
      {
        id: 'e2',
        transaction_id: 't2',
        account_id: raviAccountId,
        debit: 11445,
        credit: 0,
        date: '2026-01-10',
        narration: 'Sale - Party: Shop (Qty: 30 @ 381.50)',
        created_at: '2026-01-10T00:00:00.000Z',
        updated_at: '2026-01-10T00:00:00.000Z',
      },
      // Receipt on 2026-01-11: Cr 5,000
      {
        id: 'e3',
        transaction_id: 't3',
        account_id: raviAccountId,
        debit: 0,
        credit: 5000,
        date: '2026-01-11',
        narration: 'Receipt via Bank',
        created_at: '2026-01-11T00:00:00.000Z',
        updated_at: '2026-01-11T00:00:00.000Z',
      },
      // Partial Cancel on 2026-01-12: Cr 3,815
      {
        id: 'e4',
        transaction_id: 't4',
        account_id: raviAccountId,
        debit: 0,
        credit: 3815,
        date: '2026-01-12',
        narration: 'Sale Cancel (Qty: 10 @ 381.50)',
        created_at: '2026-01-12T00:00:00.000Z',
        updated_at: '2026-01-12T00:00:00.000Z',
      },
    ];

    // Net balance overall: 2,000 + 11,445 - 5,000 - 3,815 = 4,630 (Dr)
    const currentBalance = calculateAgentBalance(allEntries, raviAccountId);
    expect(currentBalance).toBe(4630);

    // Filter statement from 2026-01-05 to 2026-01-15:
    // Opening balance before 2026-01-05 is Dr 2,000
    const statement = calculateAgentStatement(allEntries, raviAgent, '2026-01-05', '2026-01-15');
    expect(statement.openingBalance.amount).toBe(2000);
    expect(statement.openingBalance.type).toBe('Dr');

    expect(statement.rows).toHaveLength(3);
    // Row 1 (Sale): 2000 + 11445 = 13445 Dr
    expect(statement.rows[0].debit).toBe(11445);
    expect(statement.rows[0].balance).toBe(13445);
    expect(statement.rows[0].balanceType).toBe('Dr');
    expect(statement.rows[0].type).toBe('Sale');
    expect(statement.rows[0].qty).toBe(30);
    expect(statement.rows[0].rate).toBe(381.5);
    expect(statement.rows[0].particulars).toBe('Shop');

    // Row 2 (Receipt): 13445 - 5000 = 8445 Dr
    expect(statement.rows[1].credit).toBe(5000);
    expect(statement.rows[1].balance).toBe(8445);
    expect(statement.rows[1].balanceType).toBe('Dr');
    expect(statement.rows[1].type).toBe('Receipt');
    expect(statement.rows[1].particulars).toBe('Bank A/c');

    // Row 3 (Cancel): 8445 - 3815 = 4630 Dr
    expect(statement.rows[2].credit).toBe(3815);
    expect(statement.rows[2].balance).toBe(4630);
    expect(statement.rows[2].balanceType).toBe('Dr');
    expect(statement.rows[2].type).toBe('Cancel');

    expect(statement.totalDebit).toBe(11445);
    expect(statement.totalCredit).toBe(8815);
    expect(statement.closingBalance.amount).toBe(4630);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('Formats dates in dd-mm-yy format correctly', () => {
    expect(formatDate('2026-11-10')).toBe('10-11-26');
    expect(formatDate('2026-01-05')).toBe('05-01-26');
    expect(formatDate('2026-05-20T10:30:00.000Z')).toBe('20-05-26');
    expect(formatDate('')).toBe('—');
  });

  it('Agent Statement with transactions cleanly shows Party name without prefix, and Cash/Bank A/c', () => {
    const txSale: Transaction = {
      id: 'tx_s1',
      type: 'sale',
      date: '2026-01-10',
      created_at: '2026-01-10T10:00:00.000Z',
      updated_at: '2026-01-10T10:00:00.000Z',
      sale_details: {
        agent_id: raviAgent.id,
        party: 'Akshay',
        qty: 15,
        rate: 400,
        amount: 6000,
      },
    };

    const txRecCash: Transaction = {
      id: 'tx_r1',
      type: 'receipt',
      date: '2026-01-11',
      created_at: '2026-01-11T10:00:00.000Z',
      updated_at: '2026-01-11T10:00:00.000Z',
      receipt_details: {
        agent_id: raviAgent.id,
        received_in: 'cash',
        amount: 2000,
      },
    };

    const txRecBank: Transaction = {
      id: 'tx_r2',
      type: 'receipt',
      date: '2026-01-12',
      created_at: '2026-01-12T10:00:00.000Z',
      updated_at: '2026-01-12T10:00:00.000Z',
      receipt_details: {
        agent_id: raviAgent.id,
        received_in: 'bank',
        amount: 1500,
        note: 'Cheque 123',
      },
    };

    const testEntries: Entry[] = [
      {
        id: 'e_s1',
        transaction_id: 'tx_s1',
        account_id: raviAccountId,
        debit: 6000,
        credit: 0,
        date: '2026-01-10',
        narration: 'Sale - Party: Akshay',
        created_at: '2026-01-10T10:00:00.000Z',
        updated_at: '2026-01-10T10:00:00.000Z',
      },
      {
        id: 'e_r1',
        transaction_id: 'tx_r1',
        account_id: raviAccountId,
        debit: 0,
        credit: 2000,
        date: '2026-01-11',
        narration: 'Receipt via Cash',
        created_at: '2026-01-11T10:00:00.000Z',
        updated_at: '2026-01-11T10:00:00.000Z',
      },
      {
        id: 'e_r2',
        transaction_id: 'tx_r2',
        account_id: raviAccountId,
        debit: 0,
        credit: 1500,
        date: '2026-01-12',
        narration: 'Receipt via Bank',
        created_at: '2026-01-12T10:00:00.000Z',
        updated_at: '2026-01-12T10:00:00.000Z',
      },
    ];

    const statement = calculateAgentStatement(
      testEntries,
      raviAgent,
      undefined,
      undefined,
      [txSale, txRecCash, txRecBank]
    );

    expect(statement.rows[0].type).toBe('Sale');
    expect(statement.rows[0].particulars).toBe('Akshay'); // Instead of Party: Akshay
    expect(statement.rows[0].qty).toBe(15);
    expect(statement.rows[0].rate).toBe(400);

    expect(statement.rows[1].type).toBe('Receipt');
    expect(statement.rows[1].particulars).toBe('Cash A/c'); // Instead of Via Cash

    expect(statement.rows[2].type).toBe('Receipt');
    expect(statement.rows[2].particulars).toBe('Bank A/c • Cheque 123'); // Instead of Via Bank
  });

  it('Fund calculations: computeFundCost, computeSaleProfit, and calculateFundStats', () => {
    // 1. Cost & profit formulas
    expect(computeFundCost(30, 350)).toBe(105);
    expect(computeSaleProfit(30, 381.5, 350)).toBe(9.45);

    // 2. Fund stats with funds, sales and cancels
    const funds: FundEntry[] = [
      {
        id: 'f1',
        date: '2026-01-10',
        qty: 100,
        rate: 350,
        amount: 350,
        created_at: '2026-01-10T10:00:00.000Z',
        updated_at: '2026-01-10T10:00:00.000Z',
      },
      {
        id: 'f2',
        date: '2026-01-11',
        qty: 50,
        rate: 360,
        amount: 180,
        created_at: '2026-01-11T10:00:00.000Z',
        updated_at: '2026-01-11T10:00:00.000Z',
      },
    ];

    const sales: Transaction[] = [
      {
        id: 's1',
        type: 'sale',
        date: '2026-01-10',
        created_at: '2026-01-10T11:00:00.000Z',
        updated_at: '2026-01-10T11:00:00.000Z',
        sale_details: {
          agent_id: raviAgent.id,
          party: 'Direct',
          qty: 30,
          rate: 381.5,
          amount: 114.45,
          fund_rate: 350,
          fund_cost: 105,
        },
      },
      {
        id: 's2_legacy',
        type: 'sale',
        date: '2026-01-09',
        created_at: '2026-01-09T10:00:00.000Z',
        updated_at: '2026-01-09T10:00:00.000Z',
        sale_details: {
          agent_id: raviAgent.id,
          party: 'Old Party',
          qty: 10,
          rate: 400,
          amount: 40,
          // no fund_rate — legacy sale
        },
      },
    ];

    const cancels: Transaction[] = [
      {
        id: 'c1',
        type: 'sale_cancel',
        date: '2026-01-10',
        created_at: '2026-01-10T12:00:00.000Z',
        updated_at: '2026-01-10T12:00:00.000Z',
        cancel_details: {
          sale_id: 's1',
          agent_id: raviAgent.id,
          qty: 10,
          rate: 381.5,
          amount: 38.15,
        },
      },
    ];

    const stats = calculateFundStats(funds, sales, cancels);

    // Total Funded: 350 + 180 = 530
    expect(stats.totalFunded).toBe(530);

    // s1 net qty = 30 - 10 = 20. Cost = 20 * 350 / 100 = 70.
    // s2_legacy has no fund_rate so cost = 0.
    expect(stats.totalFundCost).toBe(70);

    // Remaining Fund = 530 - 70 = 460
    expect(stats.remainingFund).toBe(460);

    // Total Sales Revenue = (114.45 - 38.15) + 40 = 76.30 + 40 = 116.30
    expect(stats.totalSalesRevenue).toBe(116.3);

    // Total Profit = 116.30 - 70 = 46.30
    expect(stats.totalProfit).toBe(46.3);
  });
});
