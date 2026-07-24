import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

const REPORT_TABLES = [
  'beneficiaries',
  'families',
  'deliveries',
  'inventory_items',
  'donations',
  'accounting_events',
  'financial_accounts',
  'cash_bank_movements',
  'accounting_contacts',
  'loan_records',
  'loan_movements',
  'debt_records',
  'debt_movements',
  'social_value_events',
  'treasury_incomes',
  'treasury_expenses',
  'treasury_loans',
  'treasury_accounts',
  'volunteers',
  'volunteer_history',
  'recursos',
  'categorias_recursos'
];

export class InformeRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async list(table) {
    return this.repository.list(table);
  }

  async getDataset(tables = REPORT_TABLES) {
    const entries = await Promise.all(tables.map(async (table) => [table, await this.list(table)]));
    return Object.fromEntries(entries);
  }
}
