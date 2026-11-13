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

    // 1. Sale: agent Ravi, qty 30, rate 381.5, amount (30 * 381.5) / 100 = 114.45
    const { transaction: saleTx, entries: saleEntries } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Walk-in',
      qty: 30,
      rate: 381.5,
    });
    expect(saleTx.sale_details?.amount).toBe(114.45);
    expect(validateBalancedEntries(saleEntries)).toBe(true);

    // Check Ravi balance: 114.45 Dr
    let allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(114.45);

    // 2. Receipt: Ravi pays 50.00 by Bank
    const { transaction: recTx, entries: recEntries } = await repository.transactions.createReceipt({
      date: '2026-01-11',
      agent_id: ravi.id,
      received_in: 'bank',
      amount: 50,
      note: 'Bank deposit',
    });
    expect(recTx.receipt_details?.amount).toBe(50);
    expect(validateBalancedEntries(recEntries)).toBe(true);

    // Check Ravi balance: 114.45 - 50 = 64.45 Dr
    allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(64.45);

    // 3. Partial cancel: 10 qty @ sale's rate (381.5) -> (10 * 381.5) / 100 = 38.15
    const { transaction: cancelTx, entries: cancelEntries } = await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-12',
      qty: 10,
      reason: 'Returned 10 qty',
    });
    expect(cancelTx.cancel_details?.amount).toBe(38.15);
    expect(validateBalancedEntries(cancelEntries)).toBe(true);

    // Check Ravi balance: 64.45 - 38.15 = 26.30 Dr
    allEntries = await repository.entries.getAll();
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(26.3);
  });

  it('Sale Rate Edit automatically recalculates linked cancels and rebuilds entries', async () => {
    const categories = await repository.rateCategories.getAll();
    const ravi = await repository.agents.create({
      name: 'Ravi',
      rate_category_id: categories[0].id,
    });

    // Sale: 30 qty @ 381.5 = (30 * 381.5) / 100 = 114.45
    const { transaction: saleTx } = await repository.transactions.createSale({
      date: '2026-01-10',
      agent_id: ravi.id,
      party: 'Party X',
      qty: 30,
      rate: 381.5,
    });

    // Cancel 10 qty @ 381.5 = (10 * 381.5) / 100 = 38.15
    const { transaction: cancelTx } = await repository.transactions.createSaleCancel({
      sale_id: saleTx.id,
      date: '2026-01-12',
      qty: 10,
    });

    // Edit sale: update rate to 400.0 (and qty stays 30)
    // New sale amount: (30 * 400) / 100 = 120
    // Cancel should recalculate to: (10 * 400) / 100 = 40
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
    expect(updatedCancel?.cancel_details?.amount).toBe(40);

    // Verify all entries balance
    const allEntries = await repository.entries.getAll();
    const cancelEntries = allEntries.filter((e) => e.transaction_id === cancelTx.id);
    expect(validateBalancedEntries(cancelEntries)).toBe(true);
    expect(cancelEntries.find((e) => e.debit > 0)?.debit).toBe(40);

    // Net balance: 120 Dr - 40 Cr = 80 Dr
    expect(calculateAgentBalance(allEntries, ravi.account_id)).toBe(80);
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

  it('Edits opening balance in agent profile (update, add, and clear)', async () => {
    const categories = await repository.rateCategories.getAll();
    const standardCat = categories[0];

    // 1. Create agent with opening balance of 2,500 Dr
    const agent = await repository.agents.create({
      name: 'Priya',
      phone: '9123456789',
      rate_category_id: standardCat.id,
      opening_balance: {
        amount: 2500,
        balance_type: 'dr',
        date: '2026-01-01',
      },
    });

    let obTx = await repository.agents.getOpeningBalance(agent.id);
    expect(obTx).not.toBeNull();
    expect(obTx?.opening_balance_details?.amount).toBe(2500);
    expect(obTx?.opening_balance_details?.balance_type).toBe('dr');
    expect(obTx?.date).toBe('2026-01-01');

    let entries = await repository.entries.getAll();
    expect(calculateAgentBalance(entries, agent.account_id)).toBe(2500);

    // 2. Edit agent opening balance: change to 4,000 Cr on 2026-01-05
    await repository.agents.update(agent.id, {
      name: 'Priya Sharma',
      rate_category_id: standardCat.id,
      opening_balance: {
        amount: 4000,
        balance_type: 'cr',
        date: '2026-01-05',
      },
    });

    obTx = await repository.agents.getOpeningBalance(agent.id);
    expect(obTx).not.toBeNull();
    expect(obTx?.opening_balance_details?.amount).toBe(4000);
    expect(obTx?.opening_balance_details?.balance_type).toBe('cr');
    expect(obTx?.date).toBe('2026-01-05');

    entries = await repository.entries.getAll();
    // Cr balance is represented as negative in calculateAgentBalance
    expect(calculateAgentBalance(entries, agent.account_id)).toBe(-4000);

    // Verify all OB entries are balanced
    const agentObEntries = entries.filter((e) => e.transaction_id === obTx?.id);
    expect(agentObEntries).toHaveLength(2);
    expect(validateBalancedEntries(agentObEntries)).toBe(true);

    // 3. Clear opening balance by setting amount to 0
    await repository.agents.update(agent.id, {
      name: 'Priya Sharma',
      rate_category_id: standardCat.id,
      opening_balance: {
        amount: 0,
        balance_type: 'dr',
      },
    });

    obTx = await repository.agents.getOpeningBalance(agent.id);
    expect(obTx).toBeNull();

    entries = await repository.entries.getAll();
    expect(calculateAgentBalance(entries, agent.account_id)).toBe(0);
    expect(entries.some((e) => e.account_id === agent.account_id)).toBe(false);

    // 4. Add opening balance to an agent who had none
    await repository.agents.update(agent.id, {
      name: 'Priya Sharma',
      rate_category_id: standardCat.id,
      opening_balance: {
        amount: 1500,
        balance_type: 'dr',
        date: '2026-02-01',
      },
    });

    obTx = await repository.agents.getOpeningBalance(agent.id);
    expect(obTx).not.toBeNull();
    expect(obTx?.opening_balance_details?.amount).toBe(1500);
    expect(obTx?.opening_balance_details?.balance_type).toBe('dr');
    expect(obTx?.date).toBe('2026-02-01');

    entries = await repository.entries.getAll();
    expect(calculateAgentBalance(entries, agent.account_id)).toBe(1500);
  });
});
