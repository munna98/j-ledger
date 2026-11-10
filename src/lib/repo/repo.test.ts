import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from './index';
import { validateBalancedEntries, calculateAgentBalance } from '@/lib/accounting';
import { SYSTEM_ACCOUNTS } from '@/types';

describe('Repository Layer with LocalStorage', () => {
  beforeEach(async () => {
    await repository.resetAllData();
  });

  it('Initializes with default accounts and default rate category', async () => {
    const accounts = await repository.accounts.getAll();
    expect(accounts.some((a) => a.id === SYSTEM_ACCOUNTS.CASH)).toBe(true);
    expect(accounts.some((a) => a.id === SYSTEM_ACCOUNTS.BANK)).toBe(true);
    expect(accounts.some((a) => a.id === SYSTEM_ACCOUNTS.SALES)).toBe(true);
    expect(accounts.some((a) => a.id === SYSTEM_ACCOUNTS.OPENING_BALANCE)).toBe(true);

    const categories = await repository.rateCategories.getAll();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0].name).toBe('Standard');
  });

  it('Creates agent with auto-created Account and Opening Balance', async () => {
    const categories = await repository.rateCategories.getAll();
    const standardCat = categories[0];

    const agent = await repository.agents.create({
      name: 'Ravi',
      phone: '9876543210',
      rate_category_id: standardCat.id,
      opening_balance: {
        amount: 2500,
        balance_type: 'dr',
        date: '2026-01-01',
      },
    });

    expect(agent.id).toBeDefined();
    expect(agent.account_id).toBe(`acc_agent_${agent.id}`);

    // Check account was created
    const agentAcc = await repository.accounts.getById(agent.account_id);
    expect(agentAcc).not.toBeNull();
    expect(agentAcc?.name).toBe('Ravi A/c');

    // Check opening balance entries were created and balanced
    const entries = await repository.entries.getByAccountId(agent.account_id);
    expect(entries).toHaveLength(1);
    expect(entries[0].debit).toBe(2500);

    const allEntries = await repository.entries.getAll();
    const obEntries = allEntries.filter((e) => e.transaction_id.startsWith('tx_ob_'));
    expect(obEntries).toHaveLength(2);
    expect(validateBalancedEntries(obEntries)).toBe(true);

    // Ravi's balance is 2500 Dr
    const balance = calculateAgentBalance(allEntries, agent.account_id);
    expect(balance).toBe(2500);
  });

  it('Runs Worked Examples 1-3 end-to-end and balances books', async () => {
    const categories = await repository.rateCategories.getAll();
    const standardCat = categories[0];

    // Create Agent Ravi
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: standardCat.id,
    });

    // 1. Sale: agent Ravi, qty 30, rate 381.5, amount 11,445
    const { transaction: saleTx, entries: saleEntries } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Walk-in',
      qty: 30,
      rate: 381.5,
    });
    expect(saleTx.sale_details?.amount).toBe(11445);
    expect(validateBalancedEntries(saleEntries)).toBe(true);

    // Check Ravi balance: 11,445 Dr
    let allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(11445);

    // 2. Receipt: Ravi pays 5,000 by Bank
    const { transaction: recTx, entries: recEntries } = await repository.transactions.createReceipt({
      date: '2026-01-11',
      agent_id: ravi.id,
      received_in: 'bank',
      amount: 5000,
      note: 'Cheque deposit',
    });
    expect(recTx.receipt_details?.amount).toBe(5000);
    expect(validateBalancedEntries(recEntries)).toBe(true);

    // Check Ravi balance: 11,445 - 5,000 = 6,445 Dr
    allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(6445);

    // 3. Partial cancel: 10 qty @ sale's rate (381.5) -> 3,815
    const { transaction: cancelTx, entries: cancelEntries } = await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-12',
      qty: 10,
      reason: 'Returned 10 qty',
    });
    expect(cancelTx.cancel_details?.amount).toBe(3815);
    expect(validateBalancedEntries(cancelEntries)).toBe(true);

    // Check Ravi balance: 6,445 - 3,815 = 2,630 Dr
    allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(2630);
  });

  it('Sale Rate Edit automatically recalculates linked cancels and rebuilds entries', async () => {
    const categories = await repository.rateCategories.getAll();
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: categories[0].id,
    });

    // Sale: 30 qty @ 381.5 = 11,445
    const { transaction: saleTx } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party X',
      qty: 30,
      rate: 381.5,
    });

    // Cancel 10 qty @ 381.5 = 3,815
    const { transaction: cancelTx } = await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-12',
      qty: 10,
    });

    // Edit sale: update rate to 400.0 (and qty stays 30)
    // New sale amount: 30 * 400 = 12,000
    // Cancel should recalculate to: 10 * 400 = 4,000
    await repository.transactions.updateSale(saleTx.id, {
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party X',
      qty: 30,
      rate: 400,
    });

    // Verify updated cancel
    const updatedCancel = await repository.transactions.getById(cancelTx.id);
    expect(updatedCancel?.cancel_details?.rate).toBe(400);
    expect(updatedCancel?.cancel_details?.amount).toBe(4000);

    // Verify all entries balance
    const allEntries = await repository.entries.getAll();
    const cancelEntries = allEntries.filter((e) => e.transaction_id === cancelTx.id);
    expect(validateBalancedEntries(cancelEntries)).toBe(true);
    expect(cancelEntries.find((e) => e.debit > 0)?.debit).toBe(4000);

    // Net balance: 12,000 Dr - 4,000 Cr = 8,000 Dr
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(8000);
  });

  it('Blocks reducing sale qty below already cancelled qty', async () => {
    const categories = await repository.rateCategories.getAll();
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: categories[0].id,
    });

    const { transaction: saleTx } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party Y',
      qty: 20,
      rate: 300,
    });

    await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-11',
      qty: 15,
    });

    // Attempting to set qty to 10 (less than 15 cancelled) must reject
    await expect(
      repository.transactions.updateSale(saleTx.id, {
        date: '2026-01-10',
        agent_id: ravi.id,
        party: 'Party Y',
        qty: 10,
        rate: 300,
      })
    ).rejects.toThrow(/Already cancelled quantity is 15/);
  });

  it('Blocks deleting an agent who has transactions', async () => {
    const categories = await repository.rateCategories.getAll();
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: categories[0].id,
    });

    await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party Z',
      qty: 5,
      rate: 100,
    });

    await expect(repository.agents.delete(ravi.id)).rejects.toThrow(
      'Cannot delete agent: This agent has recorded transactions.'
    );
  });

  it('Deleting a sale also deletes all its child cancels and entries atomically', async () => {
    const categories = await repository.rateCategories.getAll();
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: categories[0].id,
    });

    const { transaction: saleTx } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party W',
      qty: 25,
      rate: 200,
    });

    const { transaction: cancelTx } = await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-11',
      qty: 5,
    });

    await repository.transactions.deleteSale(saleTx.id);

    expect(await repository.transactions.getById(saleTx.id)).toBeNull();
    expect(await repository.transactions.getById(cancelTx.id)).toBeNull();

    const allEntries = await repository.entries.getAll();
    expect(allEntries.some((e) => e.transaction_id === saleTx.id)).toBe(false);
    expect(allEntries.some((e) => e.transaction_id === cancelTx.id)).toBe(false);
  });
});
