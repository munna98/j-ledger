import { describe, it, expect } from 'vitest';
import {
  calculateAgentStatement,
  calculateAgentBalance,
  buildSaleEntries,
  buildReceiptEntries,
  buildSaleCancelEntries,
  buildOpeningBalanceEntries,
} from './index';
import { Agent, Entry, Transaction, SYSTEM_ACCOUNTS } from '@/types';

describe('Account Statement & Ledger Table - Date Filter Verification', () => {
  const agentAccountId = 'acc_agent_tester';
  const testAgent: Agent = {
    id: 'agent_tester',
    name: 'Jaisal Express',
    phone: '9876543210',
    account_id: agentAccountId,
    rate_category_id: 'cat_standard',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  // Sample sequence of transactions spanning across January and February 2026
  const txOb: Transaction = {
    id: 'tx_ob',
    type: 'opening_balance',
    date: '2026-01-01',
    created_at: '2026-01-01T08:00:00.000Z',
    updated_at: '2026-01-01T08:00:00.000Z',
    opening_balance_details: {
      agent_id: testAgent.id,
      amount: 1000,
      balance_type: 'dr',
    },
  };

  const txSale1: Transaction = {
    id: 'tx_s1',
    type: 'sale',
    date: '2026-01-05',
    created_at: '2026-01-05T10:00:00.000Z',
    updated_at: '2026-01-05T10:00:00.000Z',
    sale_details: {
      agent_id: testAgent.id,
      party: 'Kochi Retail',
      qty: 20,
      rate: 400,
      amount: 80,
    },
  };

  const txRec1: Transaction = {
    id: 'tx_r1',
    type: 'receipt',
    date: '2026-01-10',
    created_at: '2026-01-10T11:00:00.000Z',
    updated_at: '2026-01-10T11:00:00.000Z',
    receipt_details: {
      agent_id: testAgent.id,
      received_in: 'bank',
      amount: 500,
      note: 'UPI Payment',
    },
  };

  const txSale2: Transaction = {
    id: 'tx_s2',
    type: 'sale',
    date: '2026-01-15',
    created_at: '2026-01-15T09:00:00.000Z',
    updated_at: '2026-01-15T09:00:00.000Z',
    sale_details: {
      agent_id: testAgent.id,
      party: 'Calicut Wholesale',
      qty: 50,
      rate: 380,
      amount: 190,
    },
  };

  const txCancel1: Transaction = {
    id: 'tx_c1',
    type: 'sale_cancel',
    date: '2026-01-20',
    created_at: '2026-01-20T14:00:00.000Z',
    updated_at: '2026-01-20T14:00:00.000Z',
    cancel_details: {
      sale_id: 'tx_s2',
      agent_id: testAgent.id,
      qty: 10,
      rate: 380,
      amount: 38,
      reason: 'Returned units',
    },
  };

  const txRec2: Transaction = {
    id: 'tx_r2',
    type: 'receipt',
    date: '2026-01-25',
    created_at: '2026-01-25T16:00:00.000Z',
    updated_at: '2026-01-25T16:00:00.000Z',
    receipt_details: {
      agent_id: testAgent.id,
      received_in: 'cash',
      amount: 300,
    },
  };

  const txSale3: Transaction = {
    id: 'tx_s3',
    type: 'sale',
    date: '2026-02-02',
    created_at: '2026-02-02T10:00:00.000Z',
    updated_at: '2026-02-02T10:00:00.000Z',
    sale_details: {
      agent_id: testAgent.id,
      party: 'Trivandrum Hub',
      qty: 100,
      rate: 375,
      amount: 375,
    },
  };

  const allTransactions: Transaction[] = [
    txOb,
    txSale1,
    txRec1,
    txSale2,
    txCancel1,
    txRec2,
    txSale3,
  ];

  // Corresponding ledger entries for agent account:
  // 2026-01-01: Dr 1000
  // 2026-01-05: Dr 80
  // 2026-01-10: Cr 500
  // 2026-01-15: Dr 190
  // 2026-01-20: Cr 38
  // 2026-01-25: Cr 300
  // 2026-02-02: Dr 375
  const allEntries: Entry[] = [
    {
      id: 'e_ob',
      transaction_id: 'tx_ob',
      account_id: agentAccountId,
      debit: 1000,
      credit: 0,
      date: '2026-01-01',
      narration: 'Opening Balance',
      created_at: '2026-01-01T08:00:00.000Z',
      updated_at: '2026-01-01T08:00:00.000Z',
    },
    {
      id: 'e_s1',
      transaction_id: 'tx_s1',
      account_id: agentAccountId,
      debit: 80,
      credit: 0,
      date: '2026-01-05',
      narration: 'Sale - Party: Kochi Retail (Qty: 20 @ 400.00)',
      created_at: '2026-01-05T10:00:00.000Z',
      updated_at: '2026-01-05T10:00:00.000Z',
    },
    {
      id: 'e_r1',
      transaction_id: 'tx_r1',
      account_id: agentAccountId,
      debit: 0,
      credit: 500,
      date: '2026-01-10',
      narration: 'Receipt via Bank - UPI Payment',
      created_at: '2026-01-10T11:00:00.000Z',
      updated_at: '2026-01-10T11:00:00.000Z',
    },
    {
      id: 'e_s2',
      transaction_id: 'tx_s2',
      account_id: agentAccountId,
      debit: 190,
      credit: 0,
      date: '2026-01-15',
      narration: 'Sale - Party: Calicut Wholesale (Qty: 50 @ 380.00)',
      created_at: '2026-01-15T09:00:00.000Z',
      updated_at: '2026-01-15T09:00:00.000Z',
    },
    {
      id: 'e_c1',
      transaction_id: 'tx_c1',
      account_id: agentAccountId,
      debit: 0,
      credit: 38,
      date: '2026-01-20',
      narration: 'Sale Cancel (Qty: 10 @ 380.00) - Returned units',
      created_at: '2026-01-20T14:00:00.000Z',
      updated_at: '2026-01-20T14:00:00.000Z',
    },
    {
      id: 'e_r2',
      transaction_id: 'tx_r2',
      account_id: agentAccountId,
      debit: 0,
      credit: 300,
      date: '2026-01-25',
      narration: 'Receipt via Cash',
      created_at: '2026-01-25T16:00:00.000Z',
      updated_at: '2026-01-25T16:00:00.000Z',
    },
    {
      id: 'e_s3',
      transaction_id: 'tx_s3',
      account_id: agentAccountId,
      debit: 375,
      credit: 0,
      date: '2026-02-02',
      narration: 'Sale - Party: Trivandrum Hub (Qty: 100 @ 375.00)',
      created_at: '2026-02-02T10:00:00.000Z',
      updated_at: '2026-02-02T10:00:00.000Z',
    },
  ];

  it('1. Verifies overall agent balance without date filter', () => {
    // 1000 + 80 - 500 + 190 - 38 - 300 + 375 = 807
    const balance = calculateAgentBalance(allEntries, agentAccountId);
    expect(balance).toBe(807);
  });

  it('2. Filters by mid-month date range (2026-01-10 to 2026-01-20)', () => {
    // Transactions before 2026-01-10:
    // 2026-01-01 Dr 1000
    // 2026-01-05 Dr 80
    // Expected opening balance: Dr 1080
    //
    // Filtered rows (2026-01-10 <= date <= 2026-01-20):
    // 2026-01-10 Receipt Cr 500 (running: 1080 - 500 = 580 Dr)
    // 2026-01-15 Sale Dr 190 (running: 580 + 190 = 770 Dr)
    // 2026-01-20 Cancel Cr 38 (running: 770 - 38 = 732 Dr)
    //
    // Excluded rows:
    // 2026-01-25 Receipt Cr 300
    // 2026-02-02 Sale Dr 375
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-10',
      '2026-01-20',
      allTransactions
    );

    expect(statement.fromDate).toBe('2026-01-10');
    expect(statement.toDate).toBe('2026-01-20');

    // Opening balance verification
    expect(statement.openingBalance.amount).toBe(1080);
    expect(statement.openingBalance.type).toBe('Dr');

    // Rows count and content
    expect(statement.rows).toHaveLength(3);

    expect(statement.rows[0].date).toBe('2026-01-10');
    expect(statement.rows[0].type).toBe('Receipt');
    expect(statement.rows[0].credit).toBe(500);
    expect(statement.rows[0].balance).toBe(580);
    expect(statement.rows[0].balanceType).toBe('Dr');

    expect(statement.rows[1].date).toBe('2026-01-15');
    expect(statement.rows[1].type).toBe('Sale');
    expect(statement.rows[1].debit).toBe(190);
    expect(statement.rows[1].balance).toBe(770);
    expect(statement.rows[1].balanceType).toBe('Dr');

    expect(statement.rows[2].date).toBe('2026-01-20');
    expect(statement.rows[2].type).toBe('Cancel');
    expect(statement.rows[2].credit).toBe(38);
    expect(statement.rows[2].balance).toBe(732);
    expect(statement.rows[2].balanceType).toBe('Dr');

    // Totals verification
    expect(statement.totalDebit).toBe(190);
    expect(statement.totalCredit).toBe(538); // 500 + 38
    expect(statement.closingBalance.amount).toBe(732);
    expect(statement.closingBalance.type).toBe('Dr');

    // Invariant: Opening balance + Debits - Credits = Closing balance
    expect(
      statement.openingBalance.amount + statement.totalDebit - statement.totalCredit
    ).toBe(statement.closingBalance.amount);
  });

  it('3. Boundary inclusivity: fromDate and toDate exact match', () => {
    // Transaction on fromDate (2026-01-05) must be in rows, not in opening balance
    // Transaction on toDate (2026-01-10) must be in rows
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-05',
      '2026-01-10',
      allTransactions
    );

    // Opening balance before 2026-01-05 is only 2026-01-01 (1000 Dr)
    expect(statement.openingBalance.amount).toBe(1000);
    expect(statement.openingBalance.type).toBe('Dr');

    // Rows must include exactly 2026-01-05 and 2026-01-10
    expect(statement.rows).toHaveLength(2);
    expect(statement.rows[0].date).toBe('2026-01-05');
    expect(statement.rows[1].date).toBe('2026-01-10');

    expect(statement.totalDebit).toBe(80);
    expect(statement.totalCredit).toBe(500);
    // 1000 + 80 - 500 = 580 Dr
    expect(statement.closingBalance.amount).toBe(580);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('4. Single-day date filter (fromDate === toDate)', () => {
    // Exact single day: 2026-01-15
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-15',
      '2026-01-15',
      allTransactions
    );

    // Opening balance before 2026-01-15:
    // 1000 + 80 - 500 = 580 Dr
    expect(statement.openingBalance.amount).toBe(580);
    expect(statement.openingBalance.type).toBe('Dr');

    // Only the sale on 2026-01-15 should be present
    expect(statement.rows).toHaveLength(1);
    expect(statement.rows[0].date).toBe('2026-01-15');
    expect(statement.rows[0].debit).toBe(190);
    expect(statement.rows[0].balance).toBe(770);

    expect(statement.totalDebit).toBe(190);
    expect(statement.totalCredit).toBe(0);
    expect(statement.closingBalance.amount).toBe(770);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('5. Open-ended start (no fromDate, only toDate)', () => {
    // Period up to 2026-01-15
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      undefined,
      '2026-01-15',
      allTransactions
    );

    // Opening balance must be 0 because fromDate is omitted
    expect(statement.openingBalance.amount).toBe(0);
    expect(statement.openingBalance.type).toBe('');

    // All entries on or before 2026-01-15:
    // 2026-01-01 (1000 Dr), 2026-01-05 (80 Dr), 2026-01-10 (500 Cr), 2026-01-15 (190 Dr)
    expect(statement.rows).toHaveLength(4);
    expect(statement.totalDebit).toBe(1270); // 1000 + 80 + 190
    expect(statement.totalCredit).toBe(500);
    expect(statement.closingBalance.amount).toBe(770);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('6. Open-ended end (fromDate specified, no toDate)', () => {
    // Period starting from 2026-01-20 to present
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-20',
      undefined,
      allTransactions
    );

    // Opening balance before 2026-01-20:
    // 1000 + 80 - 500 + 190 = 770 Dr
    expect(statement.openingBalance.amount).toBe(770);
    expect(statement.openingBalance.type).toBe('Dr');

    // Entries on or after 2026-01-20:
    // 2026-01-20 (38 Cr), 2026-01-25 (300 Cr), 2026-02-02 (375 Dr)
    expect(statement.rows).toHaveLength(3);
    expect(statement.totalDebit).toBe(375);
    expect(statement.totalCredit).toBe(338); // 38 + 300
    // 770 + 375 - 338 = 807 Dr
    expect(statement.closingBalance.amount).toBe(807);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('7. All Time filter (no fromDate and no toDate)', () => {
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      undefined,
      undefined,
      allTransactions
    );

    expect(statement.openingBalance.amount).toBe(0);
    expect(statement.openingBalance.type).toBe('');
    expect(statement.rows).toHaveLength(7);
    expect(statement.totalDebit).toBe(1645); // 1000 + 80 + 190 + 375
    expect(statement.totalCredit).toBe(838); // 500 + 38 + 300
    expect(statement.closingBalance.amount).toBe(807);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('8. Period with no activity: all transactions occurred before fromDate', () => {
    // Select dates in March 2026 (all sample transactions were in Jan-Feb)
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-03-01',
      '2026-03-31',
      allTransactions
    );

    // Opening balance should equal entire historical balance (807 Dr)
    expect(statement.openingBalance.amount).toBe(807);
    expect(statement.openingBalance.type).toBe('Dr');

    // No rows in the selected period
    expect(statement.rows).toHaveLength(0);
    expect(statement.totalDebit).toBe(0);
    expect(statement.totalCredit).toBe(0);

    // Closing balance must remain unchanged from opening balance
    expect(statement.closingBalance.amount).toBe(807);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('9. Period before any transactions occurred', () => {
    // Select dates in 2025
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2025-01-01',
      '2025-12-31',
      allTransactions
    );

    expect(statement.openingBalance.amount).toBe(0);
    expect(statement.openingBalance.type).toBe('');
    expect(statement.rows).toHaveLength(0);
    expect(statement.totalDebit).toBe(0);
    expect(statement.totalCredit).toBe(0);
    expect(statement.closingBalance.amount).toBe(0);
    expect(statement.closingBalance.type).toBe('');
  });

  it('10. Credit (Cr) opening balance and balance sign flip during period', () => {
    // Agent starts with an excess receipt (Cr opening balance)
    const crEntries: Entry[] = [
      // 2026-01-01: Receipt Cr 2000 (Agent overpaid)
      {
        id: 'e_cr1',
        transaction_id: 't_cr1',
        account_id: agentAccountId,
        debit: 0,
        credit: 2000,
        date: '2026-01-01',
        narration: 'Receipt via Bank - Advance deposit',
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T10:00:00.000Z',
      },
      // 2026-01-10: Sale Dr 1500 (partially consumes credit)
      {
        id: 'e_cr2',
        transaction_id: 't_cr2',
        account_id: agentAccountId,
        debit: 1500,
        credit: 0,
        date: '2026-01-10',
        narration: 'Sale - Party: Alpha',
        created_at: '2026-01-10T10:00:00.000Z',
        updated_at: '2026-01-10T10:00:00.000Z',
      },
      // 2026-01-15: Sale Dr 1000 (flips balance to Dr)
      {
        id: 'e_cr3',
        transaction_id: 't_cr3',
        account_id: agentAccountId,
        debit: 1000,
        credit: 0,
        date: '2026-01-15',
        narration: 'Sale - Party: Beta',
        created_at: '2026-01-15T10:00:00.000Z',
        updated_at: '2026-01-15T10:00:00.000Z',
      },
    ];

    // Filter statement from 2026-01-05 to 2026-01-20:
    // Opening balance before 2026-01-05 is Cr 2000
    const statement = calculateAgentStatement(
      crEntries,
      testAgent,
      '2026-01-05',
      '2026-01-20'
    );

    expect(statement.openingBalance.amount).toBe(2000);
    expect(statement.openingBalance.type).toBe('Cr');

    expect(statement.rows).toHaveLength(2);

    // Row 1: -2000 + 1500 = -500 (500 Cr)
    expect(statement.rows[0].date).toBe('2026-01-10');
    expect(statement.rows[0].debit).toBe(1500);
    expect(statement.rows[0].balance).toBe(500);
    expect(statement.rows[0].balanceType).toBe('Cr');

    // Row 2: -500 + 1000 = +500 (500 Dr - balance flips to Dr!)
    expect(statement.rows[1].date).toBe('2026-01-15');
    expect(statement.rows[1].debit).toBe(1000);
    expect(statement.rows[1].balance).toBe(500);
    expect(statement.rows[1].balanceType).toBe('Dr');

    expect(statement.totalDebit).toBe(2500);
    expect(statement.totalCredit).toBe(0);
    expect(statement.closingBalance.amount).toBe(500);
    expect(statement.closingBalance.type).toBe('Dr');
  });

  it('11. Multiple entries on the same day are correctly sorted and maintain running balance', () => {
    const sameDayEntries: Entry[] = [
      {
        id: 'e_same_1',
        transaction_id: 't_s1',
        account_id: agentAccountId,
        debit: 100,
        credit: 0,
        date: '2026-01-10',
        narration: 'Sale 1',
        created_at: '2026-01-10T09:00:00.000Z',
        updated_at: '2026-01-10T09:00:00.000Z',
      },
      {
        id: 'e_same_2',
        transaction_id: 't_s2',
        account_id: agentAccountId,
        debit: 200,
        credit: 0,
        date: '2026-01-10',
        narration: 'Sale 2',
        created_at: '2026-01-10T12:00:00.000Z',
        updated_at: '2026-01-10T12:00:00.000Z',
      },
      {
        id: 'e_same_3',
        transaction_id: 't_s3',
        account_id: agentAccountId,
        debit: 0,
        credit: 150,
        date: '2026-01-10',
        narration: 'Receipt 1',
        created_at: '2026-01-10T15:00:00.000Z',
        updated_at: '2026-01-10T15:00:00.000Z',
      },
    ];

    const statement = calculateAgentStatement(
      sameDayEntries,
      testAgent,
      '2026-01-10',
      '2026-01-10'
    );

    expect(statement.rows).toHaveLength(3);
    expect(statement.rows[0].balance).toBe(100);
    expect(statement.rows[1].balance).toBe(300);
    expect(statement.rows[2].balance).toBe(150);
    expect(statement.closingBalance.amount).toBe(150);
  });

  it('12. Ignores entries belonging to other agents when calculating statement', () => {
    const otherAgentEntries: Entry[] = [
      ...allEntries,
      {
        id: 'e_other',
        transaction_id: 'tx_other',
        account_id: 'acc_agent_someone_else',
        debit: 99999,
        credit: 0,
        date: '2026-01-15',
        narration: 'Other agent sale',
        created_at: '2026-01-15T10:00:00.000Z',
        updated_at: '2026-01-15T10:00:00.000Z',
      },
    ];

    const statement = calculateAgentStatement(
      otherAgentEntries,
      testAgent,
      '2026-01-10',
      '2026-01-20',
      allTransactions
    );

    // Other agent's entry should NOT be counted in rows or opening/closing balance
    expect(statement.rows).toHaveLength(3);
    expect(statement.closingBalance.amount).toBe(732);
  });

  it('13. Handles inverted date range gracefully (fromDate > toDate)', () => {
    // fromDate is after toDate
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-20',
      '2026-01-10',
      allTransactions
    );

    // Entries before 2026-01-20 go to opening balance
    // But since fromDate (2026-01-20) > toDate (2026-01-10), no entry can be >= fromDate and <= toDate
    expect(statement.rows).toHaveLength(0);
    expect(statement.totalDebit).toBe(0);
    expect(statement.totalCredit).toBe(0);
    expect(statement.closingBalance.amount).toBe(statement.openingBalance.amount);
  });

  it('14. Quick Date Range Presets logic simulation', () => {
    // Helper replicating setPreset logic from StatementPage
    function getPresetDates(
      preset: 'month' | 'last2' | 'last7' | 'last30' | 'all',
      baseDate: Date
    ): { fromDate: string; toDate: string } {
      const yyyy = baseDate.getFullYear();
      const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
      const dd = String(baseDate.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      if (preset === 'month') {
        return { fromDate: `${yyyy}-${mm}-01`, toDate: todayStr };
      } else if (preset === 'last2') {
        const past = new Date(baseDate);
        past.setDate(past.getDate() - 2);
        const pY = past.getFullYear();
        const pM = String(past.getMonth() + 1).padStart(2, '0');
        const pD = String(past.getDate()).padStart(2, '0');
        return { fromDate: `${pY}-${pM}-${pD}`, toDate: todayStr };
      } else if (preset === 'last7') {
        const past = new Date(baseDate);
        past.setDate(past.getDate() - 7);
        const pY = past.getFullYear();
        const pM = String(past.getMonth() + 1).padStart(2, '0');
        const pD = String(past.getDate()).padStart(2, '0');
        return { fromDate: `${pY}-${pM}-${pD}`, toDate: todayStr };
      } else if (preset === 'last30') {
        const past = new Date(baseDate);
        past.setDate(past.getDate() - 30);
        const pY = past.getFullYear();
        const pM = String(past.getMonth() + 1).padStart(2, '0');
        const pD = String(past.getDate()).padStart(2, '0');
        return { fromDate: `${pY}-${pM}-${pD}`, toDate: todayStr };
      } else {
        return { fromDate: '', toDate: '' };
      }
    }

    const testDate = new Date('2026-01-25T12:00:00Z');

    // 'month' preset: from 1st of month to test date
    const monthDates = getPresetDates('month', testDate);
    expect(monthDates.fromDate).toBe('2026-01-01');
    expect(monthDates.toDate).toBe('2026-01-25');

    const monthStatement = calculateAgentStatement(
      allEntries,
      testAgent,
      monthDates.fromDate,
      monthDates.toDate,
      allTransactions
    );
    expect(monthStatement.openingBalance.amount).toBe(0); // 2026-01-01 is in period, not before
    expect(monthStatement.rows).toHaveLength(6); // all 6 Jan entries
    expect(monthStatement.rows.some((r) => r.date === '2026-02-02')).toBe(false);

    // 'last2' preset: 2026-01-23 to 2026-01-25
    const last2Dates = getPresetDates('last2', testDate);
    expect(last2Dates.fromDate).toBe('2026-01-23');
    expect(last2Dates.toDate).toBe('2026-01-25');

    const last2Statement = calculateAgentStatement(
      allEntries,
      testAgent,
      last2Dates.fromDate,
      last2Dates.toDate,
      allTransactions
    );
    // Before Jan 23: Ob(1000) + s1(80) - r1(500) + s2(190) - c1(38) = 732 Dr
    expect(last2Statement.openingBalance.amount).toBe(732);
    // Only Rec2 (300 Cr on 2026-01-25) in this 2-day period
    expect(last2Statement.rows).toHaveLength(1);
    expect(last2Statement.rows[0].date).toBe('2026-01-25');

    // 'last7' preset: 2026-01-18 to 2026-01-25
    const last7Dates = getPresetDates('last7', testDate);
    expect(last7Dates.fromDate).toBe('2026-01-18');
    expect(last7Dates.toDate).toBe('2026-01-25');

    const last7Statement = calculateAgentStatement(
      allEntries,
      testAgent,
      last7Dates.fromDate,
      last7Dates.toDate,
      allTransactions
    );
    // Before Jan 18: Ob(1000) + s1(80) - r1(500) + s2(190) = 770 Dr
    expect(last7Statement.openingBalance.amount).toBe(770);
    // Rows in range Jan 18 - Jan 25: Cancel(38 Cr), Rec2(300 Cr)
    expect(last7Statement.rows).toHaveLength(2);
    expect(last7Statement.rows[0].date).toBe('2026-01-20');
    expect(last7Statement.rows[1].date).toBe('2026-01-25');

    // 'all' preset: empty fromDate and toDate
    const allDates = getPresetDates('all', testDate);
    expect(allDates.fromDate).toBe('');
    expect(allDates.toDate).toBe('');
    const allStatement = calculateAgentStatement(
      allEntries,
      testAgent,
      allDates.fromDate || undefined,
      allDates.toDate || undefined,
      allTransactions
    );
    expect(allStatement.rows).toHaveLength(7);
  });

  it('15. Verifies transaction_id and transaction_type drill references on statement rows', () => {
    const statement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-05',
      '2026-01-20',
      allTransactions
    );

    // Rows: s1 (sale), r1 (receipt), s2 (sale), c1 (cancel)
    expect(statement.rows).toHaveLength(4);

    expect(statement.rows[0].transaction_id).toBe('tx_s1');
    expect(statement.rows[0].transaction_type).toBe('sale');

    expect(statement.rows[1].transaction_id).toBe('tx_r1');
    expect(statement.rows[1].transaction_type).toBe('receipt');

    expect(statement.rows[2].transaction_id).toBe('tx_s2');
    expect(statement.rows[2].transaction_type).toBe('sale');

    expect(statement.rows[3].transaction_id).toBe('tx_c1');
    expect(statement.rows[3].transaction_type).toBe('sale_cancel');

    // Also verify fallback when transactions array is omitted
    const fallbackStatement = calculateAgentStatement(
      allEntries,
      testAgent,
      '2026-01-05',
      '2026-01-10'
    );
    expect(fallbackStatement.rows[0].transaction_id).toBe('tx_s1');
    expect(fallbackStatement.rows[0].transaction_type).toBe('sale');
    expect(fallbackStatement.rows[1].transaction_id).toBe('tx_r1');
    expect(fallbackStatement.rows[1].transaction_type).toBe('receipt');
  });
});
