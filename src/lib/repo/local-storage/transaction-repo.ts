import {
  Entry,
  Transaction,
  SYSTEM_ACCOUNTS,
} from '@/types';
import {
  CreateReceiptDTO,
  CreateSaleCancelDTO,
  CreateSaleDTO,
  ITransactionRepo,
  TransactionFilter,
  UpdateReceiptDTO,
  UpdateSaleCancelDTO,
  UpdateSaleDTO,
} from '../types';
import { storageClient } from './storage';
import {
  buildOpeningBalanceEntries,
  buildReceiptEntries,
  buildSaleCancelEntries,
  buildSaleEntries,
  round2,
} from '@/lib/accounting';

export class LocalStorageTransactionRepo implements ITransactionRepo {
  async getAll(filter?: TransactionFilter): Promise<Transaction[]> {
    let list = storageClient.getTransactions();

    if (filter) {
      if (filter.type) {
        list = list.filter((t) => t.type === filter.type);
      }
      if (filter.agent_id) {
        list = list.filter((t) => {
          return (
            t.sale_details?.agent_id === filter.agent_id ||
            t.receipt_details?.agent_id === filter.agent_id ||
            t.cancel_details?.agent_id === filter.agent_id ||
            t.opening_balance_details?.agent_id === filter.agent_id
          );
        });
      }
      if (filter.from_date) {
        list = list.filter((t) => t.date >= filter.from_date!);
      }
      if (filter.to_date) {
        list = list.filter((t) => t.date <= filter.to_date!);
      }
    }

    // Sort descending by date, then created_at
    return list.sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.created_at.localeCompare(a.created_at);
    });
  }

  async getById(id: string): Promise<Transaction | null> {
    const list = storageClient.getTransactions();
    return list.find((t) => t.id === id) || null;
  }

  async getWithEntries(id: string): Promise<{ transaction: Transaction; entries: Entry[] } | null> {
    const tx = await this.getById(id);
    if (!tx) return null;
    const allEntries = storageClient.getEntries();
    const entries = allEntries.filter((e) => e.transaction_id === id);
    return { transaction: tx, entries };
  }

  async getSaleCancels(saleId: string): Promise<Transaction[]> {
    const list = storageClient.getTransactions();
    return list.filter((t) => t.type === 'sale_cancel' && t.cancel_details?.sale_id === saleId);
  }

  async createSale(dto: CreateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    const txId = `tx_sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    // Snapshot latest fund rate if available
    const funds = storageClient.getFunds();
    let fundRate: number | undefined;
    let fundCost: number | undefined;
    if (funds.length > 0) {
      const sortedFunds = [...funds].sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
        return b.created_at.localeCompare(a.created_at);
      });
      fundRate = sortedFunds[0].rate;
      fundCost = round2((dto.qty * fundRate) / 100);
    }

    const { entries, amount } = buildSaleEntries({
      transaction_id: txId,
      date: dto.date,
      agent_account_id: agent.account_id,
      party: dto.party,
      qty: dto.qty,
      rate: dto.rate,
      created_at: now,
      updated_at: now,
    });

    const transaction: Transaction = {
      id: txId,
      type: 'sale',
      date: dto.date,
      created_at: now,
      updated_at: now,
      sale_details: {
        agent_id: dto.agent_id,
        party: dto.party.trim(),
        qty: dto.qty,
        rate: dto.rate,
        amount,
        fund_rate: fundRate,
        fund_cost: fundCost,
      },
    };

    const allTx = storageClient.getTransactions();
    const allEntries = storageClient.getEntries();

    storageClient.commitBatch({
      transactions: [transaction, ...allTx],
      entries: [...allEntries, ...entries],
    });

    return { transaction, entries };
  }

  async updateSale(id: string, dto: UpdateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const txList = storageClient.getTransactions();
    const existing = txList.find((t) => t.id === id);
    if (!existing || existing.type !== 'sale' || !existing.sale_details) {
      throw new Error(`Sale transaction '${id}' not found`);
    }

    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    // Check cancels linked to this sale
    const childCancels = txList.filter(
      (t) => t.type === 'sale_cancel' && t.cancel_details?.sale_id === id
    );

    const totalCancelledQty = childCancels.reduce(
      (sum, c) => sum + (c.cancel_details?.qty || 0),
      0
    );

    if (dto.qty < totalCancelledQty) {
      throw new Error(
        `Cannot set quantity to ${dto.qty}. Already cancelled quantity is ${totalCancelledQty}.`
      );
    }

    const now = new Date().toISOString();

    // Rebuild sale entries
    const { entries: newSaleEntries, amount: newSaleAmount } = buildSaleEntries({
      transaction_id: id,
      date: dto.date,
      agent_account_id: agent.account_id,
      party: dto.party,
      qty: dto.qty,
      rate: dto.rate,
      created_at: existing.created_at,
      updated_at: now,
    });

    // Keep existing fund rate snapshot if present, recalculate cost with updated qty
    const existingFundRate = existing.sale_details.fund_rate;
    const updatedFundCost =
      existingFundRate != null ? round2((dto.qty * existingFundRate) / 100) : existing.sale_details.fund_cost;

    const updatedSaleTx: Transaction = {
      ...existing,
      date: dto.date,
      updated_at: now,
      sale_details: {
        agent_id: dto.agent_id,
        party: dto.party.trim(),
        qty: dto.qty,
        rate: dto.rate,
        amount: newSaleAmount,
        fund_rate: existingFundRate,
        fund_cost: updatedFundCost,
      },
    };

    // If rate changed, recalculate all child cancels and rebuild their entries
    const updatedCancelTransactions: Transaction[] = [];
    let updatedCancelEntries: Entry[] = [];
    const affectedCancelIds = new Set(childCancels.map((c) => c.id));

    if (existing.sale_details.rate !== dto.rate || existing.sale_details.agent_id !== dto.agent_id) {
      for (const cancel of childCancels) {
        if (!cancel.cancel_details) continue;
        const { entries: newCancelEntries, amount: newCancelAmount } = buildSaleCancelEntries({
          transaction_id: cancel.id,
          sale_id: id,
          date: cancel.date,
          agent_account_id: agent.account_id,
          qty: cancel.cancel_details.qty,
          rate: dto.rate,
          reason: cancel.cancel_details.reason,
          created_at: cancel.created_at,
          updated_at: now,
        });

        updatedCancelTransactions.push({
          ...cancel,
          updated_at: now,
          cancel_details: {
            ...cancel.cancel_details,
            agent_id: dto.agent_id,
            rate: dto.rate,
            amount: newCancelAmount,
          },
        });

        updatedCancelEntries.push(...newCancelEntries);
      }
    } else {
      updatedCancelTransactions.push(...childCancels);
    }

    // Atomic update: filter out old entries for sale + cancels, replace with new
    const oldEntries = storageClient.getEntries();
    const retainedEntries = oldEntries.filter(
      (e) => e.transaction_id !== id && !affectedCancelIds.has(e.transaction_id)
    );

    // If cancel entries weren't recalculated, keep old ones
    if (updatedCancelEntries.length === 0 && childCancels.length > 0) {
      const existingCancelEntries = oldEntries.filter((e) => affectedCancelIds.has(e.transaction_id));
      updatedCancelEntries = existingCancelEntries;
    }

    const nextEntries = [...retainedEntries, ...newSaleEntries, ...updatedCancelEntries];

    const nextTransactions = txList.map((t) => {
      if (t.id === id) return updatedSaleTx;
      const matchedCancel = updatedCancelTransactions.find((c) => c.id === t.id);
      if (matchedCancel) return matchedCancel;
      return t;
    });

    storageClient.commitBatch({
      transactions: nextTransactions,
      entries: nextEntries,
    });

    return { transaction: updatedSaleTx, entries: newSaleEntries };
  }

  async deleteSale(id: string): Promise<void> {
    const txList = storageClient.getTransactions();
    const existing = txList.find((t) => t.id === id);
    if (!existing || existing.type !== 'sale') {
      throw new Error(`Sale transaction '${id}' not found`);
    }

    const childCancels = txList.filter(
      (t) => t.type === 'sale_cancel' && t.cancel_details?.sale_id === id
    );

    const idsToDelete = new Set([id, ...childCancels.map((c) => c.id)]);

    const nextTransactions = txList.filter((t) => !idsToDelete.has(t.id));
    const oldEntries = storageClient.getEntries();
    const nextEntries = oldEntries.filter((e) => !idsToDelete.has(e.transaction_id));

    storageClient.commitBatch({
      transactions: nextTransactions,
      entries: nextEntries,
    });
  }

  async createReceipt(dto: CreateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    const txId = `tx_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const { entries, amount } = buildReceiptEntries({
      transaction_id: txId,
      date: dto.date,
      agent_account_id: agent.account_id,
      received_in: dto.received_in,
      amount: dto.amount,
      note: dto.note,
      created_at: now,
      updated_at: now,
    });

    const transaction: Transaction = {
      id: txId,
      type: 'receipt',
      date: dto.date,
      created_at: now,
      updated_at: now,
      receipt_details: {
        agent_id: dto.agent_id,
        received_in: dto.received_in,
        amount,
        note: dto.note?.trim(),
      },
    };

    const allTx = storageClient.getTransactions();
    const allEntries = storageClient.getEntries();

    storageClient.commitBatch({
      transactions: [transaction, ...allTx],
      entries: [...allEntries, ...entries],
    });

    return { transaction, entries };
  }

  async updateReceipt(id: string, dto: UpdateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const txList = storageClient.getTransactions();
    const existing = txList.find((t) => t.id === id);
    if (!existing || existing.type !== 'receipt') {
      throw new Error(`Receipt transaction '${id}' not found`);
    }

    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    const now = new Date().toISOString();

    const { entries: newEntries, amount } = buildReceiptEntries({
      transaction_id: id,
      date: dto.date,
      agent_account_id: agent.account_id,
      received_in: dto.received_in,
      amount: dto.amount,
      note: dto.note,
      created_at: existing.created_at,
      updated_at: now,
    });

    const updatedTx: Transaction = {
      ...existing,
      date: dto.date,
      updated_at: now,
      receipt_details: {
        agent_id: dto.agent_id,
        received_in: dto.received_in,
        amount,
        note: dto.note?.trim(),
      },
    };

    const nextTxList = txList.map((t) => (t.id === id ? updatedTx : t));
    const oldEntries = storageClient.getEntries();
    const nextEntries = [...oldEntries.filter((e) => e.transaction_id !== id), ...newEntries];

    storageClient.commitBatch({
      transactions: nextTxList,
      entries: nextEntries,
    });

    return { transaction: updatedTx, entries: newEntries };
  }

  async deleteReceipt(id: string): Promise<void> {
    const txList = storageClient.getTransactions();
    const existing = txList.find((t) => t.id === id);
    if (!existing || existing.type !== 'receipt') {
      throw new Error(`Receipt transaction '${id}' not found`);
    }

    const nextTxList = txList.filter((t) => t.id !== id);
    const oldEntries = storageClient.getEntries();
    const nextEntries = oldEntries.filter((e) => e.transaction_id !== id);

    storageClient.commitBatch({
      transactions: nextTxList,
      entries: nextEntries,
    });
  }

  async createSaleCancel(dto: CreateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    if (dto.qty <= 0) {
      throw new Error('Cancel quantity must be greater than zero');
    }

    const txList = storageClient.getTransactions();
    const sale = txList.find((t) => t.id === dto.sale_id);
    if (!sale || sale.type !== 'sale' || !sale.sale_details) {
      throw new Error(`Sale transaction '${dto.sale_id}' not found`);
    }

    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === sale.sale_details!.agent_id);
    if (!agent) {
      throw new Error(`Agent '${sale.sale_details.agent_id}' not found`);
    }

    const existingCancels = txList.filter(
      (t) => t.type === 'sale_cancel' && t.cancel_details?.sale_id === dto.sale_id
    );

    const alreadyCancelledQty = existingCancels.reduce(
      (sum, c) => sum + (c.cancel_details?.qty || 0),
      0
    );

    const availableQty = round2(sale.sale_details.qty - alreadyCancelledQty);
    if (dto.qty > availableQty) {
      throw new Error(
        `Cannot cancel ${dto.qty}. Available uncancelled quantity is ${availableQty}.`
      );
    }

    const txId = `tx_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const currentRate = sale.sale_details.rate;

    const { entries, amount } = buildSaleCancelEntries({
      transaction_id: txId,
      sale_id: sale.id,
      date: dto.date,
      agent_account_id: agent.account_id,
      qty: dto.qty,
      rate: currentRate,
      reason: dto.reason,
      created_at: now,
      updated_at: now,
    });

    const transaction: Transaction = {
      id: txId,
      type: 'sale_cancel',
      date: dto.date,
      created_at: now,
      updated_at: now,
      cancel_details: {
        sale_id: sale.id,
        agent_id: agent.id,
        qty: dto.qty,
        rate: currentRate,
        amount,
        reason: dto.reason?.trim(),
      },
    };

    const allEntries = storageClient.getEntries();

    storageClient.commitBatch({
      transactions: [transaction, ...txList],
      entries: [...allEntries, ...entries],
    });

    return { transaction, entries };
  }

  async updateSaleCancel(id: string, dto: UpdateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    if (dto.qty <= 0) {
      throw new Error('Cancel quantity must be greater than zero');
    }

    const txList = storageClient.getTransactions();
    const existingCancel = txList.find((t) => t.id === id);
    if (!existingCancel || existingCancel.type !== 'sale_cancel' || !existingCancel.cancel_details) {
      throw new Error(`Sale cancel transaction '${id}' not found`);
    }

    const sale = txList.find((t) => t.id === existingCancel.cancel_details!.sale_id);
    if (!sale || sale.type !== 'sale' || !sale.sale_details) {
      throw new Error(`Parent sale for cancel '${id}' not found`);
    }

    const agents = storageClient.getAgents();
    const agent = agents.find((a) => a.id === sale.sale_details!.agent_id);
    if (!agent) {
      throw new Error(`Agent '${sale.sale_details.agent_id}' not found`);
    }

    const otherCancels = txList.filter(
      (t) =>
        t.type === 'sale_cancel' &&
        t.cancel_details?.sale_id === sale.id &&
        t.id !== id
    );

    const otherCancelledQty = otherCancels.reduce(
      (sum, c) => sum + (c.cancel_details?.qty || 0),
      0
    );

    const availableQty = round2(sale.sale_details.qty - otherCancelledQty);
    if (dto.qty > availableQty) {
      throw new Error(
        `Cannot cancel ${dto.qty}. Available uncancelled quantity is ${availableQty}.`
      );
    }

    const now = new Date().toISOString();
    const date = dto.date || existingCancel.date;
    const currentRate = sale.sale_details.rate;

    const { entries: newEntries, amount } = buildSaleCancelEntries({
      transaction_id: id,
      sale_id: sale.id,
      date,
      agent_account_id: agent.account_id,
      qty: dto.qty,
      rate: currentRate,
      reason: dto.reason !== undefined ? dto.reason : existingCancel.cancel_details.reason,
      created_at: existingCancel.created_at,
      updated_at: now,
    });

    const updatedTx: Transaction = {
      ...existingCancel,
      date,
      updated_at: now,
      cancel_details: {
        ...existingCancel.cancel_details,
        qty: dto.qty,
        rate: currentRate,
        amount,
        reason: dto.reason !== undefined ? dto.reason?.trim() : existingCancel.cancel_details.reason,
      },
    };

    const nextTxList = txList.map((t) => (t.id === id ? updatedTx : t));
    const oldEntries = storageClient.getEntries();
    const nextEntries = [...oldEntries.filter((e) => e.transaction_id !== id), ...newEntries];

    storageClient.commitBatch({
      transactions: nextTxList,
      entries: nextEntries,
    });

    return { transaction: updatedTx, entries: newEntries };
  }

  async deleteSaleCancel(id: string): Promise<void> {
    const txList = storageClient.getTransactions();
    const existing = txList.find((t) => t.id === id);
    if (!existing || existing.type !== 'sale_cancel') {
      throw new Error(`Sale cancel transaction '${id}' not found`);
    }

    const nextTxList = txList.filter((t) => t.id !== id);
    const oldEntries = storageClient.getEntries();
    const nextEntries = oldEntries.filter((e) => e.transaction_id !== id);

    storageClient.commitBatch({
      transactions: nextTxList,
      entries: nextEntries,
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    const tx = await this.getById(id);
    if (!tx) return;
    if (tx.type === 'sale') {
      return this.deleteSale(id);
    }
    if (tx.type === 'receipt') {
      return this.deleteReceipt(id);
    }
    if (tx.type === 'sale_cancel') {
      return this.deleteSaleCancel(id);
    }

    // Opening balance or other
    const txList = storageClient.getTransactions().filter((t) => t.id !== id);
    const entries = storageClient.getEntries().filter((e) => e.transaction_id !== id);
    storageClient.commitBatch({ transactions: txList, entries });
  }
}
