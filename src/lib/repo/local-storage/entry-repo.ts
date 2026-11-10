import { Entry } from '@/types';
import { IEntryRepo } from '../types';
import { storageClient } from './storage';

export class LocalStorageEntryRepo implements IEntryRepo {
  async getAll(): Promise<Entry[]> {
    return storageClient.getEntries();
  }

  async getByAccountId(accountId: string): Promise<Entry[]> {
    const entries = storageClient.getEntries();
    return entries.filter((e) => e.account_id === accountId);
  }

  async getByTransactionId(transactionId: string): Promise<Entry[]> {
    const entries = storageClient.getEntries();
    return entries.filter((e) => e.transaction_id === transactionId);
  }
}
