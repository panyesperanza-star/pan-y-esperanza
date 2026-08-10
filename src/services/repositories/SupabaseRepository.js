const DATE_FIELDS = new Set([
  'birth_date',
  'first_attention_at',
  'joined_at',
  'last_help_at',
  'date',
  'uploaded_at',
  'expires_at',
  'delivered_at',
  'cancelled_at',
  'reception_at',
  'sent_at',
  'donated_at',
  'occurred_at',
  'movement_at',
  'document_at',
  'due_at',
  'paid_at',
  'payment_at',
  'repaid_at',
  'debt_at',
  'social_value_at',
  'received_at',
  'receipt_generated_at',
  'receipt_sent_at',
  'impact_report_generated_at',
  'voided_at',
  'income_at',
  'expense_at',
  'loan_at',
  'returned_at',
  'moved_at',
  'happened_at',
  'requested_at',
  'resolved_at',
  'issued_at',
  'proposed_pickup_at',
  'invited_at',
  'activated_at',
  'last_login_at',
  'last_otp_sent_at',
  'last_access_at',
  'portal_activated_at',
  'portal_deactivated_at',
  'read_at',
  'event_at',
  'end_at',
  'start_date',
  'end_date',
  'opens_at',
  'deadline_at',
  'last_verified_at',
  'linked_at',
  'last_printed_at',
  'last_validated_at',
  'suspended_at',
  'revoked_at',
  'expired_at',
  'renewal_due_at',
  'reviewed_at',
  'archived_at',
  'published_at',
  'unpublished_at',
  'withdrawn_at',
  'last_access_at',
  'verified_at',
  'started_at',
  'last_seen_at',
  'logged_out_at',
  'signature_signed_at',
  'responsible_signature_signed_at',
  'attendance_confirmed_at',
  'last_checked_at',
  'detected_at',
  'created_at',
  'updated_at'
]);

const OPTIONAL_TABLES = new Set([
  'accounting_events',
  'financial_accounts',
  'cash_bank_movements',
  'accounting_contacts',
  'accounting_documents',
  'loan_records',
  'loan_movements',
  'debt_records',
  'debt_movements',
  'social_value_events',
  'deletion_requests',
  'accounting_audit_trail',
  'beneficiary_portal_accounts',
  'beneficiary_portal_otps',
  'beneficiary_portal_notices',
  'beneficiary_portal_renewals',
  'beneficiary_portal_profile_updates',
  'collaborators',
  'collaborator_portal_otps',
  'collaborator_portal_profile_updates',
  'collaborator_portal_requests',
  'collaborator_certificates',
  'donors',
  'donor_portal_otps',
  'donor_portal_profile_updates',
  'donor_certificates',
  'donation_products',
  'portal_sessions',
  'notificaciones',
  'agenda_operativa',
  'campanas',
  'campana_beneficiarios',
  'campana_productos',
  'campana_voluntarios',
  'campana_entregas',
  'campana_agenda_eventos',
  'categorias_recursos',
  'recursos',
  'social_resources',
  'beneficiary_social_resources',
  'social_resource_portal_beneficiaries',
  'social_resource_followups',
  'social_resource_history',
  'social_resource_sources',
  'social_resource_detections',
  'community_posts',
  'community_interests',
  'platform_maintenance_logs',
  'official_credential_registry',
  'official_credential_events'
]);

const NEW_MODULE_OPTIONAL_TABLES = new Set([
  'social_resources',
  'beneficiary_social_resources',
  'social_resource_portal_beneficiaries',
  'social_resource_followups',
  'social_resource_history',
  'social_resource_sources',
  'social_resource_detections',
  'community_posts',
  'community_interests'
]);

const SECURITY_TABLES = new Set([
  'beneficiary_portal_otps',
  'collaborator_portal_otps',
  'donor_portal_otps',
  'portal_sessions'
]);
const SUPABASE_QUERY_TIMEOUT_MS = 12000;

function sanitizePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [
      key,
      DATE_FIELDS.has(key) && value === '' ? null : value
    ])
  );
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('could not find the table')
    || (message.includes('relation') && message.includes('does not exist'));
}

export class SupabaseRepository {
  constructor({ supabase, fallbackStore = null, allowMissingOptionalTables = false } = {}) {
    if (!supabase) throw new Error('SupabaseRepository necesita cliente Supabase.');
    this.supabase = supabase;
    this.fallbackStore = fallbackStore;
    this.allowMissingOptionalTables = allowMissingOptionalTables;
    this.mode = 'supabase';
  }

  async list(table) {
    const { data, error } = await withSupabaseQueryTimeout(
      this.supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false }),
      table,
      'list'
    );
    if (!error) return data || [];
    if (SECURITY_TABLES.has(table)) {
      registerSupabaseRepositoryError('list', table, error);
      throw error;
    }
    if (canIgnoreMissingTable(table, error, this.allowMissingOptionalTables)) return [];
    if (this.fallbackStore) return this.fallbackStore.list(table);
    registerSupabaseRepositoryError('list', table, error);
    throw error;
  }

  async loadAll(tables = []) {
    const entries = await Promise.all((tables || []).map(async (table) => {
      try {
        return [table, await this.list(table)];
      } catch (error) {
        if (canIgnoreMissingTable(table, error, this.allowMissingOptionalTables)) return [table, []];
        error.table = table;
        throw error;
      }
    }));
    return Object.fromEntries(entries);
  }

  async create(table, payload) {
    const cleanPayload = sanitizePayload(payload);
    const { data, error } = await this.supabase
      .from(table)
      .insert(cleanPayload)
      .select()
      .single();
    if (!error) return data;
    if (SECURITY_TABLES.has(table)) {
      registerSupabaseRepositoryError('create', table, error);
      throw error;
    }
    if (this.fallbackStore) return this.fallbackStore.create(table, payload);
    registerSupabaseRepositoryError('create', table, error);
    throw error;
  }

  async update(table, id, payload) {
    const cleanPayload = sanitizePayload(payload);
    const { data, error } = await this.supabase
      .from(table)
      .update(cleanPayload)
      .eq('id', id)
      .select()
      .single();
    if (!error) return data;
    if (SECURITY_TABLES.has(table)) {
      registerSupabaseRepositoryError('update', table, error);
      throw error;
    }
    if (this.fallbackStore) return this.fallbackStore.update(table, id, payload);
    registerSupabaseRepositoryError('update', table, error);
    throw error;
  }

  async remove(table, id) {
    const { error } = await withSupabaseQueryTimeout(
      this.supabase
        .from(table)
        .delete()
        .eq('id', id),
      table,
      'remove'
    );
    if (!error) return true;
    if (this.fallbackStore) return this.fallbackStore.remove(table, id);
    registerSupabaseRepositoryError('remove', table, error);
    throw error;
  }

  async rpc(functionName, params = {}) {
    const { data, error } = await this.supabase.rpc(functionName, params);
    if (error) throw error;
    return data;
  }

  async replaceLocalData() {
    throw new Error('La restauracion directa de datos locales no esta disponible con Supabase.');
  }

  async resetLocalDemo() {
    throw new Error('El reinicio demo local no esta disponible con Supabase.');
  }
}

function canIgnoreMissingTable(table, error, allowMissingOptionalTables) {
  if (!isMissingTableError(error)) return false;
  if (NEW_MODULE_OPTIONAL_TABLES.has(table)) return true;
  return allowMissingOptionalTables && OPTIONAL_TABLES.has(table);
}

function registerSupabaseRepositoryError(operation, table, error) {
  console.error('[Pan y Esperanza] Repository Supabase sin fallback', {
    operation,
    table,
    code: error?.code,
    message: error?.message
  });
}

function withSupabaseQueryTimeout(query, table, operation) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      const error = new Error(`La consulta Supabase ${operation} de ${table} ha superado el tiempo de espera.`);
      error.code = 'SUPABASE_QUERY_TIMEOUT';
      error.table = table;
      reject(error);
    }, SUPABASE_QUERY_TIMEOUT_MS);
  });

  return Promise.race([query, timeout]).finally(() => {
    globalThis.clearTimeout(timeoutId);
  });
}
