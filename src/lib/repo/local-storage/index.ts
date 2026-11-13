import { IRepository } from '../types';
import { LocalStorageAccountRepo } from './account-repo';
import { LocalStorageRateCategoryRepo } from './rate-category-repo';
import { LocalStorageAgentRepo } from './agent-repo';
import { LocalStorageTransactionRepo } from './transaction-repo';
import { LocalStorageEntryRepo } from './entry-repo';
import { LocalStorageFundRepo } from './fund-repo';
import { storageClient } from './storage';

export class LocalStorageRepository implements IRepository {
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
