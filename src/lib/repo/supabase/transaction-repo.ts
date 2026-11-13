import {
  Entry,
  Transaction,
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
import { getSupabase } from '@/lib/supabase/client';
import {
  buildReceiptEntries,
  buildSaleCancelEntries,
  buildSaleEntries,
  round2,
} from '@/lib/accounting';
import { SupabaseAgentRepo } from './agent-repo';
import { SupabaseFundRepo } from './fund-repo';
import { SupabaseEntryRepo } from './entry-repo';

const TX_TABLE = 'jledger_transactions';
const ENTRIES_TABLE = 'jledger_entries';

export class SupabaseTransactionRepo implements ITransactionRepo {
  private agentRepo = new SupabaseAgentRepo();
  private fundRepo = new SupabaseFundRepo();
  private entryRepo = new SupabaseEntryRepo();

  async getAll(filter?: TransactionFilter): Promise<Transaction[]> {
    const supabase = getSupabase();
    let query = supabase.from(TX_TABLE).select('*');

    if (filter) {
      if (filter.type) {
        query = query.eq('type', filter.type);
      }
      if (filter.agent_id) {
        query = query.or(
          `sale_details->>agent_id.eq.${filter.agent_id},receipt_details->>agent_id.eq.${filter.agent_id},cancel_details->>agent_id.eq.${filter.agent_id},opening_balance_details->>agent_id.eq.${filter.agent_id}`
        );
      }
      if (filter.from_date) {
        query = query.gte('date', filter.from_date);
      }
      if (filter.to_date) {
        query = query.lte('date', filter.to_date);
      }
    }

    query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    return (data || []).map(this.normalizeTransaction);
  }

  async getById(id: string): Promise<Transaction | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TX_TABLE).select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch transaction '${id}': ${error.message}`);
    }
    return data ? this.normalizeTransaction(data) : null;
  }

  async getWithEntries(id: string): Promise<{ transaction: Transaction; entries: Entry[] } | null> {
    const tx = await this.getById(id);
    if (!tx) return null;
    const entries = await this.entryRepo.getByTransactionId(id);
    return { transaction: tx, entries };
  }

  async getSaleCancels(saleId: string): Promise<Transaction[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TX_TABLE)
      .select('*')
      .eq('type', 'sale_cancel')
      .eq('cancel_details->>sale_id', saleId);

    if (error) {
      throw new Error(`Failed to fetch cancels for sale '${saleId}': ${error.message}`);
    }

    return (data || []).map(this.normalizeTransaction);
  }

  async createSale(dto: CreateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const agent = await this.agentRepo.getById(dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    const txId = `tx_sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const latestFundRate = await this.fundRepo.getLatestRate();
    const fundRate = latestFundRate ?? undefined;
    const fundCost = fundRate != null ? round2((dto.qty * fundRate) / 100) : undefined;

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

    const supabase = getSupabase();
    const { error: txErr } = await supabase.from(TX_TABLE).insert(transaction);
    if (txErr) {
      throw new Error(`Failed to insert sale transaction: ${txErr.message}`);
    }

    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(entries);
    if (entriesErr) {
      // Rollback tx
      await supabase.from(TX_TABLE).delete().eq('id', txId);
      throw new Error(`Failed to insert sale entries: ${entriesErr.message}`);
    }

    return { transaction, entries };
  }

  async updateSale(id: string, dto: UpdateSaleDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const existing = await this.getById(id);
    if (!existing || existing.type !== 'sale' || !existing.sale_details) {
      throw new Error(`Sale transaction '${id}' not found`);
    }

    const agent = await this.agentRepo.getById(dto.agent_id);
    if (!agent) {
      throw new Error(`Agent '${dto.agent_id}' not found`);
    }

    const childCancels = await this.getSaleCancels(id);
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

    const supabase = getSupabase();

    // 1. Update sale transaction
    const { error: txErr } = await supabase.from(TX_TABLE).update(updatedSaleTx).eq('id', id);
    if (txErr) {
      throw new Error(`Failed to update sale transaction: ${txErr.message}`);
    }

    // 2. Replace sale entries
    await supabase.from(ENTRIES_TABLE).delete().eq('transaction_id', id);
    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(newSaleEntries);
    if (entriesErr) {
      throw new Error(`Failed to update sale entries: ${entriesErr.message}`);
    }

    // 3. If rate changed, recalculate all child cancels and replace their entries
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

        const updatedCancelTx: Transaction = {
          ...cancel,
          updated_at: now,
          cancel_details: {
            ...cancel.cancel_details,
            agent_id: dto.agent_id,
            rate: dto.rate,
            amount: newCancelAmount,
          },
        };

        await supabase.from(TX_TABLE).update(updatedCancelTx).eq('id', cancel.id);
        await supabase.from(ENTRIES_TABLE).delete().eq('transaction_id', cancel.id);
        await supabase.from(ENTRIES_TABLE).insert(newCancelEntries);
      }
    }

    return { transaction: updatedSaleTx, entries: newSaleEntries };
  }

  async deleteSale(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing || existing.type !== 'sale') {
      throw new Error(`Sale transaction '${id}' not found`);
    }

    const childCancels = await this.getSaleCancels(id);
    const supabase = getSupabase();

    // Delete child cancels (their entries will cascade delete)
    for (const cancel of childCancels) {
      await supabase.from(TX_TABLE).delete().eq('id', cancel.id);
    }

    // Delete sale (entries will cascade delete)
    const { error } = await supabase.from(TX_TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete sale: ${error.message}`);
    }
  }

  async createReceipt(dto: CreateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const agent = await this.agentRepo.getById(dto.agent_id);
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

    const supabase = getSupabase();
    const { error: txErr } = await supabase.from(TX_TABLE).insert(transaction);
    if (txErr) {
      throw new Error(`Failed to insert receipt transaction: ${txErr.message}`);
    }

    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(entries);
    if (entriesErr) {
      await supabase.from(TX_TABLE).delete().eq('id', txId);
      throw new Error(`Failed to insert receipt entries: ${entriesErr.message}`);
    }

    return { transaction, entries };
  }

  async updateReceipt(id: string, dto: UpdateReceiptDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    const existing = await this.getById(id);
    if (!existing || existing.type !== 'receipt') {
      throw new Error(`Receipt transaction '${id}' not found`);
    }

    const agent = await this.agentRepo.getById(dto.agent_id);
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

    const supabase = getSupabase();
    const { error: txErr } = await supabase.from(TX_TABLE).update(updatedTx).eq('id', id);
    if (txErr) {
      throw new Error(`Failed to update receipt transaction: ${txErr.message}`);
    }

    await supabase.from(ENTRIES_TABLE).delete().eq('transaction_id', id);
    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(newEntries);
    if (entriesErr) {
      throw new Error(`Failed to update receipt entries: ${entriesErr.message}`);
    }

    return { transaction: updatedTx, entries: newEntries };
  }

  async deleteReceipt(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing || existing.type !== 'receipt') {
      throw new Error(`Receipt transaction '${id}' not found`);
    }

    const supabase = getSupabase();
    const { error } = await supabase.from(TX_TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete receipt: ${error.message}`);
    }
  }

  async createSaleCancel(dto: CreateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    if (dto.qty <= 0) {
      throw new Error('Cancel quantity must be greater than zero');
    }

    const sale = await this.getById(dto.sale_id);
    if (!sale || sale.type !== 'sale' || !sale.sale_details) {
      throw new Error(`Sale transaction '${dto.sale_id}' not found`);
    }

    const agent = await this.agentRepo.getById(sale.sale_details.agent_id);
    if (!agent) {
      throw new Error(`Agent '${sale.sale_details.agent_id}' not found`);
    }

    const existingCancels = await this.getSaleCancels(dto.sale_id);
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

    const supabase = getSupabase();
    const { error: txErr } = await supabase.from(TX_TABLE).insert(transaction);
    if (txErr) {
      throw new Error(`Failed to insert cancel transaction: ${txErr.message}`);
    }

    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(entries);
    if (entriesErr) {
      await supabase.from(TX_TABLE).delete().eq('id', txId);
      throw new Error(`Failed to insert cancel entries: ${entriesErr.message}`);
    }

    return { transaction, entries };
  }

  async updateSaleCancel(id: string, dto: UpdateSaleCancelDTO): Promise<{ transaction: Transaction; entries: Entry[] }> {
    if (dto.qty <= 0) {
      throw new Error('Cancel quantity must be greater than zero');
    }

    const existingCancel = await this.getById(id);
    if (!existingCancel || existingCancel.type !== 'sale_cancel' || !existingCancel.cancel_details) {
      throw new Error(`Sale cancel transaction '${id}' not found`);
    }

    const sale = await this.getById(existingCancel.cancel_details.sale_id);
    if (!sale || sale.type !== 'sale' || !sale.sale_details) {
      throw new Error(`Parent sale for cancel '${id}' not found`);
    }

    const agent = await this.agentRepo.getById(sale.sale_details.agent_id);
    if (!agent) {
      throw new Error(`Agent '${sale.sale_details.agent_id}' not found`);
    }

    const allCancels = await this.getSaleCancels(sale.id);
    const otherCancels = allCancels.filter((c) => c.id !== id);
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

    const supabase = getSupabase();
    const { error: txErr } = await supabase.from(TX_TABLE).update(updatedTx).eq('id', id);
    if (txErr) {
      throw new Error(`Failed to update cancel transaction: ${txErr.message}`);
    }

    await supabase.from(ENTRIES_TABLE).delete().eq('transaction_id', id);
    const { error: entriesErr } = await supabase.from(ENTRIES_TABLE).insert(newEntries);
    if (entriesErr) {
      throw new Error(`Failed to update cancel entries: ${entriesErr.message}`);
    }

    return { transaction: updatedTx, entries: newEntries };
  }

  async deleteSaleCancel(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing || existing.type !== 'sale_cancel') {
      throw new Error(`Sale cancel transaction '${id}' not found`);
    }

    const supabase = getSupabase();
    const { error } = await supabase.from(TX_TABLE).delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete sale cancel: ${error.message}`);
    }
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

    // Opening balance or generic
    const supabase = getSupabase();
    await supabase.from(TX_TABLE).delete().eq('id', id);
  }

  private normalizeTransaction(raw: any): Transaction {
    const tx = { ...raw };
    if (tx.sale_details) {
      tx.sale_details = {
        ...tx.sale_details,
        qty: Number(tx.sale_details.qty) || 0,
        rate: Number(tx.sale_details.rate) || 0,
        amount: Number(tx.sale_details.amount) || 0,
        fund_rate: tx.sale_details.fund_rate != null ? Number(tx.sale_details.fund_rate) : undefined,
        fund_cost: tx.sale_details.fund_cost != null ? Number(tx.sale_details.fund_cost) : undefined,
      };
    }
    if (tx.receipt_details) {
      tx.receipt_details = {
        ...tx.receipt_details,
        amount: Number(tx.receipt_details.amount) || 0,
      };
    }
    if (tx.cancel_details) {
      tx.cancel_details = {
        ...tx.cancel_details,
        qty: Number(tx.cancel_details.qty) || 0,
        rate: Number(tx.cancel_details.rate) || 0,
        amount: Number(tx.cancel_details.amount) || 0,
      };
    }
    if (tx.opening_balance_details) {
      tx.opening_balance_details = {
        ...tx.opening_balance_details,
        amount: Number(tx.opening_balance_details.amount) || 0,
      };
    }
    return tx as Transaction;
  }
}
