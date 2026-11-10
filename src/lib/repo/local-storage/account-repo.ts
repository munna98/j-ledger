import { Account } from '@/types';
import { IAccountRepo } from '../types';
import { storageClient, DEFAULT_ACCOUNTS } from './storage';

export class LocalStorageAccountRepo implements IAccountRepo {
  async getAll(): Promise<Account[]> {
    return storageClient.getAccounts();
  }

  async getById(id: string): Promise<Account | null> {
    const accounts = storageClient.getAccounts();
    return accounts.find((a) => a.id === id) || null;
  }

  async create(account: Account): Promise<Account> {
    const accounts = storageClient.getAccounts();
    if (accounts.some((a) => a.id === account.id)) {
      throw new Error(`Account with ID '${account.id}' already exists`);
    }
    const updated = [...accounts, account];
    storageClient.setAccounts(updated);
    return account;
  }

  async ensureDefaultAccounts(): Promise<void> {
    const current = storageClient.getAccounts();
    let updated = false;
    const list = [...current];

    for (const def of DEFAULT_ACCOUNTS) {
      if (!list.some((a) => a.id === def.id)) {
        list.push(def);
        updated = true;
      }
    }

    if (updated) {
      storageClient.setAccounts(list);
    }
  }
}
