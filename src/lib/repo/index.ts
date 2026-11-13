import { IRepository } from './types';
import { LocalStorageAccountRepo } from './local-storage/account-repo';
import { LocalStorageRateCategoryRepo } from './local-storage/rate-category-repo';
import { LocalStorageAgentRepo } from './local-storage/agent-repo';
import { LocalStorageTransactionRepo } from './local-storage/transaction-repo';
import { LocalStorageEntryRepo } from './local-storage/entry-repo';
import { LocalStorageFundRepo } from './local-storage/fund-repo';
import { storageClient } from './local-storage/storage';

class LocalStorageRepository implements IRepository {
  public accounts = new LocalStorageAccountRepo();
  public rateCategories = new LocalStorageRateCategoryRepo();
  public agents = new LocalStorageAgentRepo();
  public transactions = new LocalStorageTransactionRepo();
  public entries = new LocalStorageEntryRepo();
  public funds = new LocalStorageFundRepo();

  async resetAllData(): Promise<void> {
    storageClient.resetAll();
  }
}

export const repository: IRepository = new LocalStorageRepository();

export const accountRepo = repository.accounts;
export const rateCategoryRepo = repository.rateCategories;
export const agentRepo = repository.agents;
export const transactionRepo = repository.transactions;
export const entryRepo = repository.entries;
export const fundRepo = repository.funds;

export function getRepo(): IRepository {
  return repository;
}

export * from './types';
