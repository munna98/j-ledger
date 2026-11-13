import { IRepository } from './types';
import { SupabaseRepository } from './supabase';

// Exclusively use Supabase as the primary data store
export const repository: IRepository = new SupabaseRepository();

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
export * from './migrate';
