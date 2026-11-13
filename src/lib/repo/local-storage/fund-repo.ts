import { FundEntry } from '@/types';
import { CreateFundDTO, IFundRepo, UpdateFundDTO } from '../types';
import { storageClient } from './storage';
import { round2 } from '@/lib/accounting';

export class LocalStorageFundRepo implements IFundRepo {
  async getAll(): Promise<FundEntry[]> {
    const list = storageClient.getFunds();
    // Sort descending by date, then created_at
    return list.sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.created_at.localeCompare(a.created_at);
    });
  }

  async getById(id: string): Promise<FundEntry | null> {
    const list = storageClient.getFunds();
    return list.find((f) => f.id === id) ?? null;
  }

  async create(dto: CreateFundDTO): Promise<FundEntry> {
    if (dto.qty <= 0) throw new Error('Qty must be greater than zero');
    if (dto.rate <= 0) throw new Error('Rate must be greater than zero');

    const now = new Date().toISOString();
    const id = `fund_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const amount = round2((dto.qty * dto.rate) / 100);

    const entry: FundEntry = {
      id,
      date: dto.date,
      qty: dto.qty,
      rate: dto.rate,
      amount,
      note: dto.note?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };

    const all = storageClient.getFunds();
    storageClient.setFunds([entry, ...all]);
    return entry;
  }

  async update(id: string, dto: UpdateFundDTO): Promise<FundEntry> {
    if (dto.qty <= 0) throw new Error('Qty must be greater than zero');
    if (dto.rate <= 0) throw new Error('Rate must be greater than zero');

    const all = storageClient.getFunds();
    const existing = all.find((f) => f.id === id);
    if (!existing) throw new Error(`Fund entry '${id}' not found`);

    const now = new Date().toISOString();
    const amount = round2((dto.qty * dto.rate) / 100);

    const updated: FundEntry = {
      ...existing,
      date: dto.date,
      qty: dto.qty,
      rate: dto.rate,
      amount,
      note: dto.note?.trim() || undefined,
      updated_at: now,
    };

    storageClient.setFunds(all.map((f) => (f.id === id ? updated : f)));
    return updated;
  }

  async delete(id: string): Promise<void> {
    const all = storageClient.getFunds();
    if (!all.find((f) => f.id === id)) {
      throw new Error(`Fund entry '${id}' not found`);
    }
    storageClient.setFunds(all.filter((f) => f.id !== id));
  }

  async getLatestRate(): Promise<number | null> {
    const all = storageClient.getFunds();
    if (all.length === 0) return null;
    // Sort by date desc, then created_at desc — pick the most recent entry
    const sorted = [...all].sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.created_at.localeCompare(a.created_at);
    });
    return sorted[0].rate;
  }
}
