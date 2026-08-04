import { useCallback, useEffect, useMemo, useState } from 'react';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion, isPlatformOwner, isSystemSuperadmin, verifyCurrentUserPassword } from '../lib/auth';
import { dataStore } from '../lib/dataStore';
import { buildDocumentNotesWithAutomationMeta, readDocumentAutomationMeta } from '../lib/documentAutomation';
import { sendEmailViaApi } from '../lib/emailClient';
import { normalize } from '../lib/formatters';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { AgendaOperativaRepository } from '../services/agenda/AgendaOperativaRepository';
import { AgendaOperativaService } from '../services/agenda/AgendaOperativaService';
import { BeneficiarioPortalRepository } from '../services/beneficiaryPortal/BeneficiarioPortalRepository';
import { BeneficiarioPortalService } from '../services/beneficiaryPortal/BeneficiarioPortalService';
import { BeneficiarioRepository } from '../services/beneficiaries/BeneficiarioRepository';
import { BeneficiarioService } from '../services/beneficiaries/BeneficiarioService';
import { CampanaRepository } from '../services/campaigns/CampanaRepository';
import { CampanaService } from '../services/campaigns/CampanaService';
import { ColaboradorRepository } from '../services/collaborators/ColaboradorRepository';
import { ColaboradorService } from '../services/collaborators/ColaboradorService';
import { ConfiguracionRepository } from '../services/configuration/ConfiguracionRepository';
import { ConfiguracionService } from '../services/configuration/ConfiguracionService';
import { IARepository } from '../services/ai/IARepository';
import { IAService } from '../services/ai/IAService';
import { DashboardService } from '../services/dashboard/DashboardService';
import { PriorityRepository } from '../services/priorities/PriorityRepository';
import { PriorityEngineService } from '../services/priorities/PriorityEngineService';
import { EntregaRepository } from '../services/deliveries/EntregaRepository';
import { EntregaService } from '../services/deliveries/EntregaService';
import { DonacionRepository } from '../services/donations/DonacionRepository';
import { DonacionService } from '../services/donations/DonacionService';
import { DonanteRepository } from '../services/donors/DonanteRepository';
import { DonanteService } from '../services/donors/DonanteService';
import { InformeRepository } from '../services/reports/InformeRepository';
import { InformeService } from '../services/reports/InformeService';
import { InventarioRepository } from '../services/inventory/InventarioRepository';
import { InventarioService } from '../services/inventory/InventarioService';
import { NotificacionRepository } from '../services/notifications/NotificacionRepository';
import { NotificacionService } from '../services/notifications/NotificacionService';
import { PlatformMaintenanceRepository } from '../services/platform/PlatformMaintenanceRepository';
import { PlatformMaintenanceService } from '../services/platform/PlatformMaintenanceService';
import { createRepositoryAdapter } from '../services/repositories/RepositoryProvider';
import { RecursoRepository } from '../services/resources/RecursoRepository';
import { RecursoService } from '../services/resources/RecursoService';
import { UsuarioRepository } from '../services/users/UsuarioRepository';
import { UsuarioService } from '../services/users/UsuarioService';
import { VoluntarioRepository } from '../services/volunteers/VoluntarioRepository';
import { VoluntarioService } from '../services/volunteers/VoluntarioService';

const EMPTY_TABLE = Object.freeze([]);
const APP_DATA_LOAD_TIMEOUT_MS = 15000;
const EMPTY_APP_DATA = Object.freeze({
  organization_settings: EMPTY_TABLE,
  families: EMPTY_TABLE,
  beneficiaries: EMPTY_TABLE,
  social_history: EMPTY_TABLE,
  beneficiary_documents: EMPTY_TABLE,
  beneficiary_portal_accounts: EMPTY_TABLE,
  beneficiary_portal_otps: EMPTY_TABLE,
  beneficiary_portal_notices: EMPTY_TABLE,
  beneficiary_portal_renewals: EMPTY_TABLE,
  beneficiary_portal_profile_updates: EMPTY_TABLE,
  collaborators: EMPTY_TABLE,
  collaborator_portal_otps: EMPTY_TABLE,
  collaborator_portal_profile_updates: EMPTY_TABLE,
  collaborator_portal_requests: EMPTY_TABLE,
  collaborator_certificates: EMPTY_TABLE,
  donors: EMPTY_TABLE,
  donor_portal_otps: EMPTY_TABLE,
  donor_portal_profile_updates: EMPTY_TABLE,
  donor_certificates: EMPTY_TABLE,
  portal_sessions: EMPTY_TABLE,
  deliveries: EMPTY_TABLE,
  email_logs: EMPTY_TABLE,
  inventory_items: EMPTY_TABLE,
  inventory_movements: EMPTY_TABLE,
  donations: EMPTY_TABLE,
  accounting_events: EMPTY_TABLE,
  financial_accounts: EMPTY_TABLE,
  cash_bank_movements: EMPTY_TABLE,
  accounting_contacts: EMPTY_TABLE,
  accounting_documents: EMPTY_TABLE,
  loan_records: EMPTY_TABLE,
  loan_movements: EMPTY_TABLE,
  debt_records: EMPTY_TABLE,
  debt_movements: EMPTY_TABLE,
  social_value_events: EMPTY_TABLE,
  deletion_requests: EMPTY_TABLE,
  accounting_audit_trail: EMPTY_TABLE,
  treasury_incomes: EMPTY_TABLE,
  treasury_expenses: EMPTY_TABLE,
  treasury_loans: EMPTY_TABLE,
  treasury_accounts: EMPTY_TABLE,
  volunteers: EMPTY_TABLE,
  volunteer_history: EMPTY_TABLE,
  notificaciones: EMPTY_TABLE,
  agenda_operativa: EMPTY_TABLE,
  campanas: EMPTY_TABLE,
  campana_beneficiarios: EMPTY_TABLE,
  campana_productos: EMPTY_TABLE,
  campana_voluntarios: EMPTY_TABLE,
  campana_entregas: EMPTY_TABLE,
  campana_agenda_eventos: EMPTY_TABLE,
  categorias_recursos: EMPTY_TABLE,
  recursos: EMPTY_TABLE,
  roles: EMPTY_TABLE,
  audit_logs: EMPTY_TABLE,
  platform_maintenance_logs: EMPTY_TABLE,
  official_credential_registry: EMPTY_TABLE,
  official_credential_events: EMPTY_TABLE,
  app_users: EMPTY_TABLE
});
const PLATFORM_OWNER_TABLES = new Set(['platform_maintenance_logs']);

function appDataTablesForUser(user) {
  const tables = Object.keys(EMPTY_APP_DATA);
  if (isPlatformOwner(user)) return tables;
  return tables.filter((table) => !PLATFORM_OWNER_TABLES.has(table));
}

export function useAppData(enabled = true, currentUser = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const appData = data || EMPTY_APP_DATA;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const repository = createRepository();
      const loadedData = await withAppDataTimeout(
        repository.loadAll(appDataTablesForUser(currentUser)),
        APP_DATA_LOAD_TIMEOUT_MS
      );
      setData(enrichOfficialCredentialData({
        ...EMPTY_APP_DATA,
        ...loadedData
      }));
    } catch (err) {
      setData((current) => current || EMPTY_APP_DATA);
      setError(err.message || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (enabled) reload();
    else setLoading(false);
  }, [enabled, reload]);

  async function audit(action) {
    try {
      await repositoryCreate('audit_logs', {
        user_name: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.email : 'Sistema',
        user_email: currentUser?.email || '',
        action,
        happened_at: new Date().toISOString()
      });
    } catch (error) {
      console.warn('[Pan y Esperanza] No se pudo registrar auditoria:', error);
    }
  }

  function sanitizeFamilyPayload(payload) {
    return {
      family_code: String(payload?.family_code || '').trim(),
      responsible_name: String(payload?.responsible_name || '').trim(),
      address: String(payload?.address || '').trim(),
      phone: String(payload?.phone || '').trim(),
      email: String(payload?.email || '').trim(),
      dependents_count: Number(payload?.dependents_count || 0),
      status: payload?.status || 'Activa',
      notes: String(payload?.notes || '').trim(),
      archived_at: payload?.archived_at || null,
      archive_reason: String(payload?.archive_reason || '').trim(),
      updated_at: new Date().toISOString()
    };
  }

  function withFamilyArchiveMarker(notes, archivedAt, archivedBy, reason) {
    const cleanNotes = String(notes || '')
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('[FAMILIA_ARCHIVADA]'))
      .join('\n')
      .trim();
    const marker = `[FAMILIA_ARCHIVADA] ${archivedAt} | ${archivedBy || 'Usuario'} | ${String(reason || '').trim()}`.trim();
    return [cleanNotes, marker].filter(Boolean).join('\n');
  }

  function currentUserName() {
    return `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim()
      || currentUser?.email
      || 'Usuario';
  }

  function assertPermission(moduleId, actionId) {
    if (!canDo(currentUser, moduleId, actionId)) {
      throw new Error(`No tienes permiso para ${actionId === 'delete' ? 'eliminar' : 'realizar esta acción'} en este módulo.`);
    }
  }

  function createRepository() {
    return createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async function repositoryList(table) {
    return createRepository().list(table);
  }

  async function repositoryCreate(table, payload) {
    return createRepository().create(table, payload);
  }

  async function repositoryUpdate(table, id, payload) {
    return createRepository().update(table, id, payload);
  }

  async function repositoryRemove(table, id) {
    return createRepository().remove(table, id);
  }

  async function repositoryReplaceLocalData(payload) {
    return createRepository().replaceLocalData(payload);
  }

  async function repositoryResetLocalDemo() {
    return createRepository().resetLocalDemo();
  }

  async function manageOfficialCredential(credential = {}, action, reason = '') {
    const credentialUid = String(credential.credentialUid || credential.credential_uid || credential.credentialId || '').trim();
    if (!credentialUid) throw new Error('La credencial no tiene un ID oficial asignado.');
    if (!action) throw new Error('Indica la acción que deseas registrar sobre la credencial.');

    if (action === 'replace' && (!hasSupabaseConfig || !supabase)) {
      throw new Error('La sustitución de credenciales requiere Supabase para emitir un ID oficial nuevo.');
    }

    if (hasSupabaseConfig && supabase) {
      const { data: result, error: rpcError } = await supabase.rpc('manage_official_credential', {
        p_credential_uid: credentialUid,
        p_action: action,
        p_reason: String(reason || '').trim()
      });
      if (rpcError) throw rpcError;
      await audit(`Credencial oficial ${credentialUid}: ${action}`);
      await reload();
      return result;
    }

    await repositoryCreate('official_credential_events', {
      credential_uid: credentialUid,
      subject_type: credential.kind || credential.subject_type || 'beneficiary',
      subject_id: credential.subjectId || credential.subject_id || credential.id || crypto.randomUUID(),
      event_type: action,
      status_from: credential.credentialStatus || credential.credential_status || 'active',
      status_to: credential.credentialStatus || credential.credential_status || 'active',
      actor_id: currentUser?.id || null,
      actor_name: currentUserName(),
      actor_email: currentUser?.email || '',
      reason: String(reason || '').trim(),
      metadata: {
        demo: true,
        qr_version: credential.qrVersion || credential.credential_qr_version || 1,
        print_count: credential.printCount || credential.credential_print_count || 0
      },
      created_at: new Date().toISOString()
    });
    await audit(`Credencial oficial ${credentialUid}: ${action}`);
    await reload();
    return null;
  }

  function createInventarioService(repositoryAdapter = createRepository(), notificacionService = null) {
    return new InventarioService({
      repository: new InventarioRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      inventoryItems: appData.inventory_items || [],
      audit,
      assertPermission,
      notificacionService,
      hasSupabaseConfig
    });
  }

  function createDashboardService(notificacionService = null) {
    return new DashboardService({ notificacionService });
  }
  function createPriorityEngineService({
    repositoryAdapter = createRepository(),
    notificacionService = null,
    agendaOperativaService = null,
    dashboardService = null
  } = {}) {
    return new PriorityEngineService({
      repository: new PriorityRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      notificacionService,
      agendaOperativaService,
      dashboardService,
      audit,
      currentUser
    });
  }

  function createNotificacionService(repositoryAdapter = createRepository(), dashboardService = null) {
    return new NotificacionService({
      repository: new NotificacionRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      notifications: appData.notificaciones || [],
      audit,
      dashboardService,
      currentUser
    });
  }

  function createBeneficiarioService(repositoryAdapter = createRepository(), notificacionService = null) {
    return new BeneficiarioService({
      repository: new BeneficiarioRepository({ dataStore, repository: repositoryAdapter }),
      beneficiaries: appData.beneficiaries || [],
      audit,
      assertPermission,
      notificacionService
    });
  }

  function createDonacionService(inventarioService = createInventarioService(), dashboardService = createDashboardService(), repositoryAdapter = createRepository(), notificacionService = null) {
    return new DonacionService({
      repository: new DonacionRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      inventarioService,
      dashboardService,
      notificacionService,
      data: appData,
      audit,
      accountingAuditTrail,
      assertPermission,
      assertAccountingSuperadmin,
      currentUserName,
      isActiveAccountingRow
    });
  }

  function createRecursoService(repositoryAdapter = createRepository(), notificacionService = null) {
    return new RecursoService({
      repository: new RecursoRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      resources: appData.recursos || [],
      audit,
      assertPermission,
      notificacionService,
      currentUser
    });
  }

  function createVoluntarioService({
    repositoryAdapter = createRepository(),
    usuarioService = null,
    entregaService = null,
    dashboardService = createDashboardService(),
    notificacionService = null
  } = {}) {
    return new VoluntarioService({
      repository: new VoluntarioRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      volunteers: appData.volunteers || [],
      audit,
      assertCanDelete: () => {
        if (currentUser?.role !== 'Superadministrador') {
          throw new Error('Solo el Superadministrador puede eliminar voluntarios definitivamente.');
        }
      },
      usuarioService,
      entregaService,
      dashboardService,
      notificacionService
    });
  }

  function createInformeService({
    repositoryAdapter = createRepository(),
    beneficiarioService = null,
    inventarioService = null,
    entregaService = null,
    donacionService = null,
    voluntarioService = null,
    recursoService = null
  } = {}) {
    return new InformeService({
      repository: new InformeRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      data: appData,
      audit,
      beneficiarioService,
      inventarioService,
      entregaService,
      donacionService,
      voluntarioService,
      recursoService
    });
  }

  function createConfiguracionService({
    repositoryAdapter = createRepository(),
    usuarioService = null,
    dashboardService = createDashboardService(),
    notificacionService = null
  } = {}) {
    return new ConfiguracionService({
      repository: new ConfiguracionRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      settings: appData.organization_settings?.[0] || {},
      audit,
      usuarioService,
      dashboardService,
      notificacionService
    });
  }

  function createPlatformMaintenanceService(repositoryAdapter = createRepository()) {
    return new PlatformMaintenanceService({
      repository: new PlatformMaintenanceRepository({ repository: repositoryAdapter }),
      currentUser,
      verifyPassword: verifyCurrentUserPassword,
      audit
    });
  }

  function createEntregaService({
    repositoryAdapter = createRepository(),
    beneficiarioService = null,
    inventarioService = null,
    dashboardService = createDashboardService(),
    configuracionService = null,
    notificacionService = null,
    assertPermissionOverride = assertPermission
  } = {}) {
    return new EntregaService({
      repository: new EntregaRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      beneficiarioService: beneficiarioService || createBeneficiarioService(repositoryAdapter, notificacionService),
      inventarioService: inventarioService || createInventarioService(repositoryAdapter, notificacionService),
      dashboardService,
      configuracionService,
      notificacionService,
      deliveries: appData.deliveries || [],
      beneficiaries: appData.beneficiaries || [],
      families: appData.families || [],
      inventoryItems: appData.inventory_items || [],
      audit,
      assertPermission: assertPermissionOverride,
      assertCanDelete: assertSuperadmin,
      assertCancelFallback: () => {
        if (currentUser?.role !== 'Superadministrador') {
          throw new Error('La funcion de anulacion no esta disponible en Supabase. Solo el Superadministrador puede usar la ruta de recuperacion segura.');
        }
      },
      canCancel: () => canDo(currentUser, 'deliveries', 'edit') || canDo(currentUser, 'deliveries', 'create'),
      currentUser,
      currentUserName,
      hasSupabaseConfig,
      isMissingCancelDeliveryRpcError,
      voidDeliverySocialValueEvents
    });
  }

  function createBeneficiarioPortalService({
    repositoryAdapter = createRepository(),
    beneficiarioService = null,
    entregaService = null,
    recursoService = null,
    notificacionService = null
  } = {}) {
    return new BeneficiarioPortalService({
      repository: new BeneficiarioPortalRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      beneficiaries: appData.beneficiaries || [],
      deliveries: appData.deliveries || [],
      documents: appData.beneficiary_documents || [],
      socialHistory: appData.social_history || [],
      resources: appData.recursos || [],
      notifications: appData.notificaciones || [],
      organizationSettings: appData.organization_settings?.[0] || {},
      audit,
      beneficiarioService,
      entregaService,
      recursoService,
      notificacionService
    });
  }

  function createColaboradorService({
    repositoryAdapter = createRepository(),
    donacionService = null,
    recursoService = null,
    notificacionService = null,
    dashboardService = null
  } = {}) {
    return new ColaboradorService({
      repository: new ColaboradorRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      collaborators: appData.collaborators || [],
      donations: appData.donations || [],
      resources: appData.recursos || [],
      campaigns: appData.campanas || [],
      certificates: appData.collaborator_certificates || [],
      audit,
      donacionService,
      recursoService,
      notificacionService,
      dashboardService,
      assertPermission
    });
  }

  function createDonanteService({
    repositoryAdapter = createRepository(),
    donacionService = null,
    notificacionService = null,
    dashboardService = null
  } = {}) {
    return new DonanteService({
      repository: new DonanteRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      donors: appData.donors || [],
      donations: appData.donations || [],
      campaigns: appData.campanas || [],
      certificates: appData.donor_certificates || [],
      audit,
      donacionService,
      notificacionService,
      dashboardService,
      assertPermission
    });
  }

  function createIAService({
    repositoryAdapter = createRepository(),
    configuracionService = null
  } = {}) {
    return new IAService({
      repository: new IARepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      audit,
      currentUser,
      configuracionService
    });
  }

  function createAgendaOperativaService({
    repositoryAdapter = createRepository(),
    beneficiarioService = null,
    entregaService = null,
    inventarioService = null,
    voluntarioService = null,
    donacionService = null,
    dashboardService = createDashboardService(),
    notificacionService = null
  } = {}) {
    return new AgendaOperativaService({
      repository: new AgendaOperativaRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      data: appData,
      audit,
      assertPermission,
      beneficiarioService,
      entregaService,
      inventarioService,
      voluntarioService,
      donacionService,
      dashboardService,
      notificacionService,
      currentUser
    });
  }

  function assertSuperadmin() {
    if (currentUser?.role !== 'Superadministrador') {
      throw new Error('Solo el Superadministrador puede eliminar entregas definitivamente.');
    }
  }

  function assertSystemSuperadmin() {
    if (!isSystemSuperadmin(currentUser)) {
      throw new Error('Solo el Superadministrador del sistema puede resolver solicitudes de eliminación.');
    }
  }

  function assertDeletionRequester(moduleId) {
    if (isSystemSuperadmin(currentUser)) {
      throw new Error('El Superadministrador del sistema debe resolver solicitudes desde el panel del proveedor.');
    }
    if (canDeleteDefinitively(currentUser, permissionModuleForDeletion(moduleId), appData.organization_settings?.[0] || {})) {
      throw new Error('Pan y Esperanza puede eliminar definitivamente este registro sin enviar solicitud.');
    }
    if (!canRequestDefinitiveDeletion(currentUser, permissionModuleForDeletion(moduleId), appData.organization_settings?.[0] || {})) {
      throw new Error('No tienes permiso para solicitar eliminaciones definitivas en este módulo.');
    }
  }

  function permissionModuleForDeletion(moduleId) {
    if (String(moduleId || '').startsWith('treasury_')) return 'accounting';
    if (moduleId === 'financial_accounts') return 'accounting';
    return moduleId;
  }

  function assertAccountingSuperadmin() {
    if (currentUser?.role !== 'Superadministrador') {
      throw new Error('Solo el Superadministrador puede anular o eliminar registros contables.');
    }
  }

  function userMeta() {
    return {
      created_by: currentUser?.id || null,
      created_by_name: currentUserName(),
      created_by_email: currentUser?.email || ''
    };
  }

  function associationMeta() {
    const organization = appData.organization_settings?.[0] || {};
    return {
      association_id: organization.id || 'main',
      association_name: organization.name || 'Asociación sin nombre'
    };
  }

  function providerEmail() {
    const organization = appData.organization_settings?.[0] || {};
    const systemOwner = (appData.app_users || []).find((user) => isSystemSuperadmin(user));
    return import.meta.env.VITE_SYSTEM_PROVIDER_EMAIL
      || import.meta.env.VITE_PROVIDER_EMAIL
      || organization.system_provider_email
      || organization.provider_email
      || organization.platform_owner_email
      || systemOwner?.email
      || 'elizabeth@panyesperanza.org'
      || '';
  }

  async function notifyDeletionRequestProvider(request) {
    const to = providerEmail();
    if (!to) {
      await audit(`Solicitud de eliminación ${request.id} creada sin correo de proveedor configurado`);
      return;
    }
    await sendEmailViaApi({
      to,
      subject: `Solicitud de eliminación pendiente - ${request.association_name}`,
      message: [
        'Se ha recibido una solicitud de eliminación definitiva.',
        '',
        `Asociación: ${request.association_name}`,
        `Usuario: ${request.requester_name || request.requester_email || '-'}`,
        `Registro solicitado: ${request.record_label || request.record_id}`,
        `Módulo: ${request.module}`,
        `Motivo: ${request.reason}`,
        request.notes ? `Observaciones: ${request.notes}` : ''
      ].filter(Boolean).join('\n'),
      organization: appData.organization_settings?.[0] || {}
    });
  }

  async function notifyDeletionRequestRejected(request, resolutionReason) {
    if (!request?.requester_email) return;
    await sendEmailViaApi({
      to: request.requester_email,
      subject: `Solicitud de eliminación rechazada - ${request.record_label || request.record_id}`,
      message: [
        'La solicitud de eliminación definitiva ha sido rechazada por el proveedor del sistema.',
        '',
        `Registro: ${request.record_label || request.record_id}`,
        `Motivo de la solicitud: ${request.reason}`,
        `Motivo del rechazo: ${resolutionReason}`
      ].join('\n'),
      organization: appData.organization_settings?.[0] || {}
    });
  }

  async function trySendDeletionEmail(sender, auditMessage) {
    try {
      await sender();
    } catch (error) {
      console.warn('[eliminaciones] No se pudo enviar notificación:', error);
      await audit(`${auditMessage}: ${error.message || 'error de correo'}`);
    }
  }

  async function executeApprovedDeletionRequest(request) {
    const moduleId = request.module;
    const recordId = request.record_id;
    if (moduleId === 'deliveries') {
      await createEntregaService().remove(recordId);
      return 'entrega';
    }
    if (moduleId === 'beneficiaries') {
      await createBeneficiarioService().remove(recordId);
      return 'beneficiario';
    }
    if (moduleId === 'inventory') {
      await createInventarioService().removeItem(recordId);
      return 'producto de inventario';
    }
    if (moduleId === 'donations') {
      await createDonacionService().removeDonation(recordId);
      return 'donación';
    }
    if (moduleId === 'treasury_incomes') {
      await repositoryRemove('treasury_incomes', recordId);
      return 'ingreso de tesorería';
    }
    if (moduleId === 'treasury_expenses') {
      await repositoryRemove('treasury_expenses', recordId);
      return 'gasto de tesorería';
    }
    if (moduleId === 'treasury_loans') {
      await repositoryRemove('treasury_loans', recordId);
      return 'préstamo de tesorería';
    }
    if (moduleId === 'treasury_accounts') {
      await repositoryRemove('treasury_accounts', recordId);
      return 'cuenta de tesorería';
    }
    if (moduleId === 'financial_accounts') {
      await repositoryRemove('financial_accounts', recordId);
      return 'cuenta contable';
    }
    throw new Error(`El módulo ${moduleId} todavía no tiene ejecutor de eliminación definitiva.`);
  }

  async function accountingAuditTrail(tableName, recordId, action, previousData, nextData) {
    await repositoryCreate('accounting_audit_trail', {
      table_name: tableName,
      record_id: recordId || null,
      action,
      previous_data: previousData || null,
      next_data: nextData || null,
      user_id: currentUser?.id || null,
      user_name: currentUserName(),
      user_email: currentUser?.email || '',
      happened_at: new Date().toISOString()
    });
  }

  function findFinancialAccount(accountId) {
    const account = (appData.financial_accounts || []).find((item) => item.id === accountId);
    if (!account || account.status === 'voided' || account.is_active === false) {
      throw new Error('Selecciona una cuenta activa de Caja o Banco.');
    }
    return account;
  }

  function isCashAccount(account) {
    const type = normalize(account?.account_type || account?.name || '');
    return type === 'cash' || type.includes('caja') || type.includes('efectivo');
  }

  function movementDelta(movement) {
    const amount = Number(movement?.amount || 0);
    if (['cash_out', 'bank_out', 'transfer_out'].includes(movement?.movement_type)) return -amount;
    return amount;
  }

  function assertNoUnauthorizedNegativeBalance(account, nextBalance, allowNegativeBalance) {
    if (nextBalance >= 0) return;
    if (currentUser?.role === 'Superadministrador' && allowNegativeBalance === true) return;
    throw new Error(`La operación dejaría saldo negativo en ${account.name}. Saldo disponible: ${Number(account.current_balance || 0).toFixed(2)} EUR.`);
  }

  function operationDate(value) {
    return String(value || new Date().toISOString()).slice(0, 10);
  }

  function operationDateTime(value) {
    return value ? String(value) : new Date().toISOString().slice(0, 16);
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function collectOperationalReferences() {
    return [
      ...(appData.donations || []).flatMap((item) => [item.reference, item.notes]),
      ...(appData.cash_bank_movements || []).flatMap((item) => [item.reference, item.notes]),
      ...(appData.accounting_documents || []).flatMap((item) => [item.document_number, item.notes]),
      ...(appData.accounting_events || []).flatMap((item) => [item.title, item.description])
    ].filter(Boolean).map(String);
  }

  function nextDonationReference(dateValue = new Date()) {
    const year = new Date(dateValue).getFullYear();
    const prefix = 'DON';
    const references = collectOperationalReferences();
    const pattern = new RegExp(`${prefix}-${year}-(\\d{6})`, 'i');
    let last = references.reduce((max, value) => {
      const match = value.match(pattern);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let candidate = '';
    do {
      last += 1;
      candidate = `${prefix}-${year}-${String(last).padStart(6, '0')}`;
    } while (references.some((value) => value.includes(candidate)));
    return candidate;
  }

  function nextInternalDocumentNumber(dateValue = new Date()) {
    const year = new Date(dateValue).getFullYear();
    const references = collectOperationalReferences();
    const last = references.reduce((max, value) => {
      const match = String(value || '').match(new RegExp(`INT-${year}-(\\d{6})`, 'i'));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `INT-${year}-${String(last + 1).padStart(6, '0')}`;
  }

  function isInternalDocumentType(value) {
    const type = normalize(value);
    return type === 'documento interno' || type === 'document_internal' || type === 'internal_document';
  }

  function isNoDocumentType(value) {
    const type = normalize(value);
    return type === 'sin documento' || type === 'no_document';
  }

  function assertPositiveNumber(value, label = 'El importe') {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} debe ser mayor que cero.`);
    return amount;
  }

  function positiveNumberOrNull(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return null;
  }

  function roundCurrency(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function inventoryItemUnitValue(item) {
    return positiveNumberOrNull(item?.unit_value, item?.estimated_unit_value, item?.economic_value, item?.price, item?.cost);
  }

  function latestSocialUnitValueForItem(itemId) {
    if (!itemId) return null;
    const event = activeAccountingRows(appData.social_value_events || [])
      .filter((entry) => entry.value_type === 'received' && entry.inventory_item_id === itemId)
      .sort((a, b) => String(b.social_value_at || b.created_at || '').localeCompare(String(a.social_value_at || a.created_at || '')))[0];
    const quantity = positiveNumberOrNull(event?.quantity);
    const amount = positiveNumberOrNull(event?.amount);
    return quantity !== null && amount !== null ? roundCurrency(amount / quantity) : null;
  }

  function resolveInventoryUnitValueForOperation(payload, item, quantity) {
    const automaticValue = inventoryItemUnitValue(item) ?? latestSocialUnitValueForItem(item?.id);
    if (automaticValue !== null) return automaticValue;
    const explicitUnitValue = positiveNumberOrNull(payload.inventory_unit_value, payload.unit_value, payload.estimated_unit_value);
    if (explicitUnitValue !== null) return explicitUnitValue;
    const legacyTotal = positiveNumberOrNull(payload.amount, payload.estimated_value);
    return legacyTotal !== null && quantity > 0 ? roundCurrency(legacyTotal / quantity) : null;
  }

  function accountMovementType(account, direction) {
    return `${isCashAccount(account) ? 'cash' : 'bank'}_${direction}`;
  }

  function inactiveAccountingStatus(value) {
    const status = normalize(value || '');
    return status.includes('void')
      || status.includes('anulad')
      || status.includes('cancel')
      || status.includes('correct')
      || status.includes('corregid')
      || status.includes('revers')
      || status.includes('revert');
  }

  function accountingEventForRow(row) {
    if (!row?.accounting_event_id) return null;
    return (appData.accounting_events || []).find((event) => event.id === row.accounting_event_id) || null;
  }

  function isActiveAccountingRow(row) {
    return !inactiveAccountingStatus(row?.status || row?.state)
      && !inactiveAccountingStatus(accountingEventForRow(row)?.status);
  }

  function activeAccountingRows(rows = []) {
    return rows.filter(isActiveAccountingRow);
  }

  function outstandingLoanAmount(loan) {
    if (!isActiveAccountingRow(loan)) return 0;
    const paid = activeAccountingRows(appData.loan_movements || [])
      .filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received')
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(loan.principal_amount || 0) - paid);
  }

  function outstandingDebtAmount(debt) {
    if (!isActiveAccountingRow(debt)) return 0;
    const paid = activeAccountingRows(appData.debt_movements || [])
      .filter((movement) => movement.debt_id === debt.id)
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(debt.original_amount || 0) - paid);
  }

  async function getOrCreateAccountingContact(contactType, payload = {}) {
    const safeType = ['supplier', 'donor', 'lender', 'creditor', 'beneficiary', 'other'].includes(contactType) ? contactType : 'other';
    const contactId = cleanText(payload.contact_id || payload.id);
    if (contactId) {
      const existingById = (appData.accounting_contacts || []).find((contact) => (
        contact.id === contactId
        && normalize(contact.contact_type || 'other') === normalize(safeType)
      ));
      if (existingById) return existingById;
    }
    const name = cleanText(payload.name || payload.contact_name);
    if (!name && !contactId) return null;
    const existing = name ? (appData.accounting_contacts || []).find((contact) => (
      normalize(contact.name) === normalize(name)
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (existing) return existing;
    const latestContacts = await repositoryList('accounting_contacts').catch(() => appData.accounting_contacts || []);
    const latestById = contactId ? (latestContacts || []).find((contact) => (
      contact.id === contactId
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (latestById) return latestById;
    if (!name) return null;
    const latestExisting = name ? (latestContacts || []).find((contact) => (
      normalize(contact.name) === normalize(name)
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (latestExisting) return latestExisting;
    const contact = await repositoryCreate('accounting_contacts', {
      contact_type: safeType,
      name,
      document_id: cleanText(payload.document_id),
      email: cleanText(payload.email),
      phone: cleanText(payload.phone),
      address: cleanText(payload.address),
      notes: cleanText(payload.notes),
      is_active: true
    });
    await accountingAuditTrail('accounting_contacts', contact.id, 'create', null, contact);
    return contact;
  }

  async function createAccountingEvent(payload) {
    const event = await repositoryCreate('accounting_events', {
      status: 'active',
      currency: 'EUR',
      source_module: 'accounting',
      ...payload,
      ...userMeta()
    });
    await accountingAuditTrail('accounting_events', event.id, 'create', null, event);
    return event;
  }

  async function updateAccountingEventSource(event, sourceModule, sourceRecordId) {
    if (!event?.id || !sourceRecordId) return event;
    const updated = await repositoryUpdate('accounting_events', event.id, {
      source_module: sourceModule,
      source_record_id: sourceRecordId,
      updated_at: new Date().toISOString()
    });
    await accountingAuditTrail('accounting_events', event.id, 'update_source', event, updated);
    return updated;
  }

  async function createCashBankMovementForEvent({ event, account, movementType, amount, date, paymentMethod, reference, notes, allowNegativeBalance }) {
    const nextBalance = Number(account.current_balance || 0) + movementDelta({ movement_type: movementType, amount });
    assertNoUnauthorizedNegativeBalance(account, nextBalance, allowNegativeBalance === true);
    const movement = await repositoryCreate('cash_bank_movements', {
      accounting_event_id: event.id,
      financial_account_id: account.id,
      movement_type: movementType,
      amount,
      currency: 'EUR',
      movement_at: date,
      payment_method: movementType.startsWith('cash') ? 'Efectivo' : cleanText(paymentMethod) || 'Transferencia',
      reference: cleanText(reference),
      status: 'active',
      notes: cleanText(notes),
      ...userMeta()
    });
    await accountingAuditTrail('cash_bank_movements', movement.id, 'create', null, movement);
    await applyAccountBalance(account, nextBalance, 'balance_update');
    return movement;
  }

  async function createEconomicDocument(eventId, payload, amount, date, contactId = null, forceDocument = false) {
    const documentPayload = buildAccountingDocumentPayload({
      ...payload,
      contact_id: contactId,
      force_document: forceDocument
    }, amount, date);
    return createAccountingDocumentForEvent(eventId, documentPayload);
  }

  async function registerInventoryEntryForOperation(item, payload, quantity, notes) {
    const movedAt = operationDate(payload.operation_at || payload.moved_at);
    const responsible = cleanText(payload.responsible) || currentUserName();
    return createInventarioService().createMovement({
      item_id: item.id,
      movement_type: 'Entrada',
      quantity,
      moved_at: movedAt,
      responsible,
      notes
    }, { requirePermission: false });
  }

  async function resolveInventoryItemForOperation(payload, donorName = '') {
    return createInventarioService().resolveItemForOperation(payload, donorName);
  }

  async function registerMonetaryEconomicOperation(payload, options) {
    const amount = assertPositiveNumber(payload.amount);
    const date = operationDate(payload.operation_at);
    const account = findFinancialAccount(payload.financial_account_id);
    const contact = await getOrCreateAccountingContact(options.contactType, {
      contact_id: payload.contact_id || (options.contactType === 'donor' ? payload.donor_contact_id : ''),
      name: options.contactName,
      document_id: payload.contact_document_id,
      email: payload.contact_email,
      phone: payload.contact_phone,
      address: payload.contact_address
    });
    const title = cleanText(payload.concept) || options.defaultConcept;
    const event = await createAccountingEvent({
      event_type: options.eventType,
      occurred_at: date,
      title,
      description: cleanText(payload.notes) || `${options.label}. Fecha y hora operativa: ${operationDateTime(payload.operation_at)}`,
      amount,
      contact_id: contact?.id || null,
      financial_account_id: account.id,
      source_module: options.sourceModule || 'accounting',
      source_record_id: options.sourceRecordId || null
    });
    await createEconomicDocument(event.id, {
      ...payload,
      document_type: payload.document_type || options.documentType
    }, amount, date, contact?.id || null, options.forceDocument);
    const movement = await createCashBankMovementForEvent({
      event,
      account,
      movementType: accountMovementType(account, options.direction),
      amount,
      date,
      paymentMethod: payload.payment_method,
      reference: payload.reference,
      notes: title,
      allowNegativeBalance: payload.allow_negative_balance
    });
    return { amount, date, account, contact, event, movement, title };
  }

  async function performBankTransfer(payload) {
    const source = findFinancialAccount(payload?.from_account_id);
    const target = findFinancialAccount(payload?.to_account_id);
    if (source.id === target.id) throw new Error('La cuenta origen y destino deben ser diferentes.');
    const amount = assertPositiveNumber(payload?.amount);
    const reason = cleanText(payload?.reason || payload?.concept);
    if (reason.length < 3) throw new Error('El motivo es obligatorio.');
    const sourceNextBalance = Number(source.current_balance || 0) - amount;
    assertNoUnauthorizedNegativeBalance(source, sourceNextBalance, payload?.allow_negative_balance === true);
    const targetNextBalance = Number(target.current_balance || 0) + amount;
    const movementDate = operationDate(payload?.movement_datetime || payload?.operation_at || payload?.movement_at);
    const createdEvent = await createAccountingEvent({
      event_type: 'correction',
      occurred_at: movementDate,
      title: reason,
      description: `Transferencia interna de ${source.name} a ${target.name}. Fecha y hora operativa: ${operationDateTime(payload?.movement_datetime || payload?.operation_at)}`,
      amount,
      financial_account_id: source.id
    });
    const outMovement = await repositoryCreate('cash_bank_movements', {
      accounting_event_id: createdEvent.id,
      financial_account_id: source.id,
      movement_type: 'transfer_out',
      amount,
      currency: 'EUR',
      movement_at: movementDate,
      payment_method: 'Transferencia',
      reference: cleanText(payload?.reference),
      status: 'active',
      notes: reason,
      ...userMeta()
    });
    const inMovement = await repositoryCreate('cash_bank_movements', {
      accounting_event_id: createdEvent.id,
      financial_account_id: target.id,
      movement_type: 'transfer_in',
      amount,
      currency: 'EUR',
      movement_at: movementDate,
      payment_method: 'Transferencia',
      reference: cleanText(payload?.reference),
      status: 'active',
      notes: reason,
      ...userMeta()
    });
    await accountingAuditTrail('cash_bank_movements', outMovement.id, 'create', null, outMovement);
    await accountingAuditTrail('cash_bank_movements', inMovement.id, 'create', null, inMovement);
    await createAccountingDocumentForEvent(createdEvent.id, buildAccountingDocumentPayload(payload, amount, movementDate));
    await applyAccountBalance(source, sourceNextBalance, 'balance_update');
    await applyAccountBalance(target, targetNextBalance, 'balance_update');
    await audit(`Contabilidad: transferencia ${source.name} a ${target.name}`.trim());
  }

  async function performEconomicOperation(payload) {
    assertPermission('accounting', 'create');
    const operationType = payload?.operation_type;
    if (operationType === 'income') {
      await registerMonetaryEconomicOperation(payload, {
        eventType: 'income',
        direction: 'in',
        contactType: 'other',
        contactName: payload.contact_name,
        defaultConcept: 'Ingreso',
        label: 'Ingreso',
        documentType: 'receipt',
        forceDocument: false
      });
      await audit(`Contabilidad: nueva operación ingreso ${payload.concept || ''}`.trim());
      return;
    }
    if (operationType === 'expense') {
      await registerMonetaryEconomicOperation(payload, {
        eventType: 'expense',
        direction: 'out',
        contactType: 'supplier',
        contactName: payload.supplier_name || payload.contact_name,
        defaultConcept: 'Gasto',
        label: 'Gasto',
        documentType: 'ticket',
        forceDocument: true
      });
      await audit(`Contabilidad: nueva operación gasto ${payload.concept || ''}`.trim());
      return;
    }
    if (operationType === 'donation_money') {
      const date = operationDate(payload.operation_at);
      const reference = nextDonationReference(date);
      await registerMonetaryEconomicOperation({
        ...payload,
        reference,
        document_number: (isInternalDocumentType(payload.document_type) || isNoDocumentType(payload.document_type))
          ? payload.document_number
          : payload.document_number || reference
      }, {
        eventType: 'donation_money',
        direction: 'in',
        contactType: 'donor',
        contactName: payload.donor_name || payload.contact_name,
        defaultConcept: 'Donación monetaria',
        label: 'Donación monetaria',
        documentType: 'receipt',
        forceDocument: false
      });
      await createDonacionService().recordEconomicDonation(payload);
      return;
    }
    if (operationType === 'economic_help') {
      const beneficiary = (appData.beneficiaries || []).find((item) => item.id === payload.beneficiary_id);
      const result = await registerMonetaryEconomicOperation(payload, {
        eventType: 'expense',
        direction: 'out',
        contactType: 'beneficiary',
        contactName: beneficiary?.full_name || payload.beneficiary_name || payload.contact_name,
        defaultConcept: 'Ayuda económica',
        label: 'Ayuda económica',
        documentType: 'proof',
        forceDocument: true,
        sourceModule: 'beneficiaries',
        sourceRecordId: beneficiary?.id || null
      });
      const socialEvent = await repositoryCreate('social_value_events', {
        accounting_event_id: result.event.id,
        value_type: 'delivered',
        event_type: 'delivery',
        social_value_at: result.date,
        amount: result.amount,
        currency: 'EUR',
        source_module: 'beneficiaries',
        source_record_id: beneficiary?.id || null,
        beneficiary_id: beneficiary?.id || null,
        contact_id: result.contact?.id || null,
        status: 'active',
        notes: result.title,
        ...userMeta()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'create', null, socialEvent);
      await audit(`Contabilidad: ayuda económica ${beneficiary?.full_name || payload.beneficiary_name || ''}`.trim());
      return;
    }
    if (operationType === 'inventory_purchase') {
      const supplierName = cleanText(payload.supplier_name || payload.contact_name);
      const item = await resolveInventoryItemForOperation(payload, supplierName);
      const quantity = assertPositiveNumber(payload.quantity, 'La cantidad');
      const result = await registerMonetaryEconomicOperation(payload, {
        eventType: 'purchase',
        direction: 'out',
        contactType: 'supplier',
        contactName: supplierName,
        defaultConcept: 'Compra de inventario',
        label: 'Compra de inventario',
        documentType: 'invoice',
        forceDocument: true
      });
      const inventoryMovement = await registerInventoryEntryForOperation(item, payload, quantity, `Compra registrada en Contabilidad: ${result.title}`);
      await updateAccountingEventSource(result.event, 'inventory', inventoryMovement?.id);
      await audit(`Contabilidad: compra de inventario ${item.name}`.trim());
      return;
    }
    if (operationType === 'donation_in_kind') {
      const quantity = assertPositiveNumber(payload.quantity, 'La cantidad');
      const date = operationDate(payload.operation_at);
      const donorName = cleanText(payload.donor_name || payload.contact_name);
      const contact = await getOrCreateAccountingContact('donor', {
        contact_id: payload.donor_contact_id || payload.contact_id,
        name: donorName,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      const item = await resolveInventoryItemForOperation(payload, donorName);
      const unitValue = resolveInventoryUnitValueForOperation(payload, item, quantity);
      if (unitValue === null) throw new Error('Indica el valor unitario estimado de la donación en especie.');
      const amount = roundCurrency(quantity * unitValue);
      const title = cleanText(payload.concept) || `Donación en especie: ${item.name}`;
      const reference = nextDonationReference(date);
      const event = await createAccountingEvent({
        event_type: 'donation_in_kind',
        occurred_at: date,
        title,
        description: [cleanText(payload.notes) || 'Donación en especie registrada sin afectar caja ni banco.', `Referencia: ${reference}`].filter(Boolean).join(' '),
        amount,
        contact_id: contact?.id || null,
        financial_account_id: null
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'receipt',
        document_number: (isInternalDocumentType(payload.document_type) || isNoDocumentType(payload.document_type))
          ? payload.document_number
          : payload.document_number || reference,
        reference
      }, amount, date, contact?.id || null, true);
      const { donation, inventoryMovement } = await createDonacionService().recordInKindDonation({
        payload,
        item,
        quantity,
        amount,
        date,
        reference,
        title,
        donorName
      });
      const socialEvent = await repositoryCreate('social_value_events', {
        accounting_event_id: event.id,
        value_type: 'received',
        event_type: 'in_kind_donation',
        social_value_at: date,
        amount,
        currency: 'EUR',
        source_module: 'donations',
        source_record_id: donation.id,
        inventory_item_id: item.id,
        contact_id: contact?.id || null,
        quantity,
        unit: item.unit || payload.inventory_unit || '',
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'create', null, socialEvent);
      await updateAccountingEventSource(event, 'donations', donation.id);
      return;
    }
    if (operationType === 'loan_received') {
      const amount = assertPositiveNumber(payload.amount);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = await getOrCreateAccountingContact('lender', {
        name: payload.lender_name || payload.contact_name,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      if (!contact) throw new Error('Indica quién concede el préstamo.');
      const title = cleanText(payload.concept) || 'Préstamo recibido';
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Préstamo recibido registrado automáticamente.',
        amount,
        contact_id: contact.id,
        financial_account_id: account.id
      });
      const document = await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'contract'
      }, amount, date, contact.id, true);
      const loan = await repositoryCreate('loan_records', {
        accounting_event_id: event.id,
        contact_id: contact.id,
        document_id: document?.id || null,
        loan_at: date,
        principal_amount: amount,
        currency: 'EUR',
        reason: title,
        status: 'active',
        notes: cleanText(payload.notes),
        ...userMeta()
      });
      await accountingAuditTrail('loan_records', loan.id, 'create', null, loan);
      const loanMovement = await repositoryCreate('loan_movements', {
        loan_id: loan.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: 'loan_received',
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('loan_movements', loanMovement.id, 'create', null, loanMovement);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'in'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      await updateAccountingEventSource(event, 'loan_records', loan.id);
      await audit(`Contabilidad: préstamo recibido ${title}`.trim());
      return;
    }
    if (operationType === 'loan_repayment') {
      const loan = activeAccountingRows(appData.loan_records || []).find((item) => item.id === payload.loan_id);
      if (!loan) throw new Error('Selecciona un préstamo pendiente.');
      const outstanding = outstandingLoanAmount(loan);
      if (outstanding <= 0) throw new Error('Este préstamo no tiene saldo pendiente.');
      const amount = assertPositiveNumber(payload.amount);
      if (amount > outstanding) throw new Error(`El importe supera el saldo pendiente del préstamo: ${outstanding.toFixed(2)} EUR.`);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = (appData.accounting_contacts || []).find((item) => item.id === loan.contact_id);
      const title = cleanText(payload.concept) || `Devolución de préstamo: ${loan.reason}`;
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Devolución de préstamo registrada automáticamente.',
        amount,
        contact_id: loan.contact_id,
        financial_account_id: account.id,
        source_module: 'loan_records',
        source_record_id: loan.id
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'proof'
      }, amount, date, loan.contact_id, true);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'out'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      const nextOutstanding = Math.max(0, outstanding - amount);
      const movementType = nextOutstanding === 0 ? 'full_repayment' : 'partial_repayment';
      const loanMovement = await repositoryCreate('loan_movements', {
        loan_id: loan.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('loan_movements', loanMovement.id, 'create', null, loanMovement);
      const updatedLoan = await repositoryUpdate('loan_records', loan.id, {
        status: nextOutstanding === 0 ? 'repaid' : 'partially_repaid',
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('loan_records', loan.id, 'update_status', loan, updatedLoan);
      await audit(`Contabilidad: devolución de préstamo ${contact?.name || loan.reason}`.trim());
      return;
    }
    if (operationType === 'supplier_debt') {
      const amount = assertPositiveNumber(payload.amount);
      const date = operationDate(payload.operation_at);
      const contact = await getOrCreateAccountingContact('supplier', {
        name: payload.supplier_name || payload.contact_name,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      if (!contact) throw new Error('Indica el proveedor o acreedor.');
      const title = cleanText(payload.concept) || 'Deuda con proveedor';
      const event = await createAccountingEvent({
        event_type: 'debt',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Deuda registrada sin salida inmediata de caja o banco.',
        amount,
        contact_id: contact.id,
        financial_account_id: null
      });
      const document = await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'invoice'
      }, amount, date, contact.id, true);
      const debt = await repositoryCreate('debt_records', {
        accounting_event_id: event.id,
        contact_id: contact.id,
        document_id: document?.id || null,
        debt_at: date,
        due_at: payload.due_at || null,
        original_amount: amount,
        currency: 'EUR',
        reason: title,
        status: 'active',
        notes: cleanText(payload.notes),
        ...userMeta()
      });
      await accountingAuditTrail('debt_records', debt.id, 'create', null, debt);
      await updateAccountingEventSource(event, 'debt_records', debt.id);
      await audit(`Contabilidad: deuda con proveedor ${contact.name}`.trim());
      return;
    }
    if (operationType === 'debt_payment') {
      const debt = activeAccountingRows(appData.debt_records || []).find((item) => item.id === payload.debt_id);
      if (!debt) throw new Error('Selecciona una deuda pendiente.');
      const outstanding = outstandingDebtAmount(debt);
      if (outstanding <= 0) throw new Error('Esta deuda no tiene saldo pendiente.');
      const amount = assertPositiveNumber(payload.amount);
      if (amount > outstanding) throw new Error(`El importe supera el saldo pendiente de la deuda: ${outstanding.toFixed(2)} EUR.`);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = (appData.accounting_contacts || []).find((item) => item.id === debt.contact_id);
      const title = cleanText(payload.concept) || `Pago de deuda: ${debt.reason}`;
      const event = await createAccountingEvent({
        event_type: 'debt',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Pago de deuda registrado automáticamente.',
        amount,
        contact_id: debt.contact_id,
        financial_account_id: account.id,
        source_module: 'debt_records',
        source_record_id: debt.id
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'proof'
      }, amount, date, debt.contact_id, true);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'out'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      const nextOutstanding = Math.max(0, outstanding - amount);
      const movementType = nextOutstanding === 0 ? 'full_payment' : 'partial_payment';
      const debtMovement = await repositoryCreate('debt_movements', {
        debt_id: debt.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('debt_movements', debtMovement.id, 'create', null, debtMovement);
      const updatedDebt = await repositoryUpdate('debt_records', debt.id, {
        status: nextOutstanding === 0 ? 'paid' : 'partially_paid',
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('debt_records', debt.id, 'update_status', debt, updatedDebt);
      await audit(`Contabilidad: pago de deuda ${contact?.name || debt.reason}`.trim());
      return;
    }
    if (operationType === 'transfer') {
      await performBankTransfer({
        ...payload,
        from_account_id: payload.from_account_id,
        to_account_id: payload.to_account_id,
        reason: payload.concept || payload.reason
      });
      return;
    }
    throw new Error('Selecciona un tipo de operación válido.');
  }

  function sanitizeFinancialAccountPayload(payload, initial = {}) {
    const name = String(payload?.name || '').trim();
    const accountType = payload?.account_type || 'cash';
    const allowed = ['cash', 'bank', 'bizum', 'paypal', 'card', 'other'];
    const openingBalance = Number(payload?.opening_balance || 0);
    if (!name) throw new Error('El nombre de la cuenta es obligatorio.');
    if (!allowed.includes(accountType)) throw new Error('El tipo de cuenta no es válido.');
    if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('El saldo inicial no puede ser negativo.');
    return {
      name,
      account_type: accountType,
      bank_name: String(payload?.bank_name || '').trim(),
      account_number: String(payload?.account_number || '').trim(),
      iban: String(payload?.iban || '').trim(),
      currency: 'EUR',
      opening_balance: initial.id ? Number(initial.opening_balance || 0) : openingBalance,
      current_balance: initial.id ? Number(initial.current_balance || 0) : openingBalance,
      status: initial.status || 'active',
      is_active: initial.is_active !== false,
      notes: String(payload?.notes || '').trim()
    };
  }

  function sanitizeCashBankMovementPayload(payload, forcedType) {
    const movementType = forcedType || payload?.movement_type;
    const allowed = ['cash_in', 'cash_out', 'bank_in', 'bank_out'];
    const amount = Number(payload?.amount || 0);
    const reason = String(payload?.reason || payload?.notes || '').trim();
    if (!allowed.includes(movementType)) throw new Error('El tipo de movimiento no es válido.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El importe debe ser mayor que cero.');
    if (reason.length < 3) throw new Error('El motivo es obligatorio.');
    const account = findFinancialAccount(payload?.financial_account_id);
    if (movementType.startsWith('cash') && !isCashAccount(account)) throw new Error('Selecciona una cuenta de caja para movimientos de efectivo.');
    if (movementType.startsWith('bank') && isCashAccount(account)) throw new Error('Selecciona una cuenta bancaria para movimientos de banco.');
    return {
      account,
      movement: {
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        movement_at: operationDate(payload?.movement_datetime || payload?.movement_at),
        payment_method: movementType.startsWith('cash') ? 'Efectivo' : String(payload?.payment_method || 'Transferencia').trim(),
        reference: String(payload?.reference || '').trim(),
        status: 'active',
        notes: reason,
        ...userMeta()
      },
      event: {
        event_type: movementType.endsWith('_in') ? 'income' : 'expense',
        occurred_at: operationDate(payload?.movement_datetime || payload?.movement_at),
        title: reason,
        description: `Fecha y hora operativa: ${operationDateTime(payload?.movement_datetime)}${payload?.reference ? `. Referencia: ${payload.reference}` : ''}`,
        amount,
        currency: 'EUR',
        status: 'active',
        financial_account_id: account.id,
        source_module: 'accounting',
        ...userMeta()
      },
      document: buildAccountingDocumentPayload(payload, amount, operationDate(payload?.movement_datetime || payload?.movement_at))
    };
  }

  function buildAccountingDocumentPayload(payload, amount, documentAt) {
    const fileName = String(payload?.document_name || '').trim();
    const fileDataUrl = String(payload?.document_data_url || '').trim();
    const internalDocument = isInternalDocumentType(payload?.document_type);
    const noDocument = isNoDocumentType(payload?.document_type);
    if (noDocument && !fileName && !fileDataUrl) return null;
    const documentNumber = noDocument ? '' : String(payload?.document_number || '').trim() || (internalDocument ? nextInternalDocumentNumber(documentAt) : '');
    if (!fileName && !fileDataUrl && !documentNumber && payload?.force_document !== true) return null;
    const responsible = currentUserName();
    const concept = cleanText(payload?.concept || payload?.reason || payload?.notes || 'Operación registrada');
    const donor = cleanText(payload?.donor_name || payload?.contact_name || payload?.supplier_name || payload?.lender_name || payload?.creditor_name);
    const internalNotes = internalDocument
      ? [
        'Justificante interno generado automáticamente.',
        donor ? `Donante/persona o entidad: ${donor}.` : '',
        `Concepto: ${concept}.`,
        `Responsable: ${responsible}.`
      ].filter(Boolean).join(' ')
      : '';
    return {
      contact_id: payload?.contact_id || null,
      document_type: payload?.document_type || 'proof',
      document_number: documentNumber,
      document_at: documentAt,
      due_at: payload?.due_at || null,
      amount: Number(amount || 0),
      currency: 'EUR',
      file_name: fileName,
      file_data_url: fileDataUrl,
      status: 'active',
      notes: [String(payload?.document_notes || '').trim(), internalNotes].filter(Boolean).join('\n'),
      ...userMeta()
    };
  }

  async function createAccountingDocumentForEvent(eventId, documentPayload) {
    if (!documentPayload) return null;
    const document = await repositoryCreate('accounting_documents', {
      ...documentPayload,
      accounting_event_id: eventId
    });
    await accountingAuditTrail('accounting_documents', document.id, 'create', null, document);
    return document;
  }

  async function applyAccountBalance(account, nextBalance, actionLabel) {
    const previous = { ...account };
    const updated = await repositoryUpdate('financial_accounts', account.id, {
      current_balance: nextBalance,
      updated_at: new Date().toISOString()
    });
    await accountingAuditTrail('financial_accounts', account.id, actionLabel, previous, updated);
    return updated;
  }

  function isMissingCancelDeliveryRpcError(error) {
    const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return text.includes('pgrst202')
      || text.includes('could not find the function')
      || text.includes('cancel_delivery')
      || text.includes('schema cache');
  }

  function deliverySocialEventMatches(delivery, event) {
    if (!delivery || event?.event_type !== 'delivery') return false;
    if (event.source_module === 'deliveries' && event.source_record_id === delivery.id) return true;
    return event.source_module === 'beneficiaries'
      && event.source_record_id === delivery.beneficiary_id
      && event.social_value_at === delivery.delivered_at;
  }

  async function voidDeliverySocialValueEvents(delivery, reason) {
    const socialEvents = activeAccountingRows(appData.social_value_events || [])
      .filter((event) => deliverySocialEventMatches(delivery, event));
    for (const socialEvent of socialEvents) {
      const updated = await repositoryUpdate('social_value_events', socialEvent.id, {
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: reason,
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'void_delivery', socialEvent, updated);
    }
  }

  function isActiveAccountingRowAfterEventVoid(row, voidedEventId) {
    if (!row || row.accounting_event_id === voidedEventId) return false;
    return isActiveAccountingRow(row);
  }

  function loanStatusFromPaidAmount(loan, paid) {
    const principal = Number(loan?.principal_amount || 0);
    if (principal <= 0 || paid <= 0) return 'active';
    return paid >= principal ? 'repaid' : 'partially_repaid';
  }

  function debtStatusFromPaidAmount(debt, paid) {
    const total = Number(debt?.original_amount || 0);
    if (total <= 0 || paid <= 0) return 'active';
    return paid >= total ? 'paid' : 'partially_paid';
  }

  async function syncLoanStatusAfterEventVoid(loan, voidedEventId, voidedAt) {
    if (!loan || loan.accounting_event_id === voidedEventId || inactiveAccountingStatus(loan.status)) return;
    const paid = (appData.loan_movements || [])
      .filter((movement) => movement.loan_id === loan.id
        && movement.movement_type !== 'loan_received'
        && isActiveAccountingRowAfterEventVoid(movement, voidedEventId))
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    const nextStatus = loanStatusFromPaidAmount(loan, paid);
    if (loan.status === nextStatus) return;
    const updated = await repositoryUpdate('loan_records', loan.id, {
      status: nextStatus,
      updated_at: voidedAt
    });
    await accountingAuditTrail('loan_records', loan.id, 'sync_status_after_void', loan, updated);
  }

  async function syncDebtStatusAfterEventVoid(debt, voidedEventId, voidedAt) {
    if (!debt || debt.accounting_event_id === voidedEventId || inactiveAccountingStatus(debt.status)) return;
    const paid = (appData.debt_movements || [])
      .filter((movement) => movement.debt_id === debt.id && isActiveAccountingRowAfterEventVoid(movement, voidedEventId))
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    const nextStatus = debtStatusFromPaidAmount(debt, paid);
    if (debt.status === nextStatus) return;
    const updated = await repositoryUpdate('debt_records', debt.id, {
      status: nextStatus,
      updated_at: voidedAt
    });
    await accountingAuditTrail('debt_records', debt.id, 'sync_status_after_void', debt, updated);
  }

  async function voidRelatedLoanDebtEntries(eventId, cleanReason) {
    if (!eventId) return;
    const voidedAt = new Date().toISOString();
    const affectedLoanIds = new Set();
    const affectedDebtIds = new Set();

    for (const movement of (appData.loan_movements || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await repositoryUpdate('loan_movements', movement.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('loan_movements', movement.id, 'void_related_event', movement, updated);
      affectedLoanIds.add(movement.loan_id);
    }

    for (const loan of (appData.loan_records || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await repositoryUpdate('loan_records', loan.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('loan_records', loan.id, 'void_related_event', loan, updated);
      affectedLoanIds.delete(loan.id);
    }

    for (const loanId of affectedLoanIds) {
      await syncLoanStatusAfterEventVoid((appData.loan_records || []).find((loan) => loan.id === loanId), eventId, voidedAt);
    }

    for (const movement of (appData.debt_movements || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await repositoryUpdate('debt_movements', movement.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('debt_movements', movement.id, 'void_related_event', movement, updated);
      affectedDebtIds.add(movement.debt_id);
    }

    for (const debt of (appData.debt_records || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await repositoryUpdate('debt_records', debt.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('debt_records', debt.id, 'void_related_event', debt, updated);
      affectedDebtIds.delete(debt.id);
    }

    for (const debtId of affectedDebtIds) {
      await syncDebtStatusAfterEventVoid((appData.debt_records || []).find((debt) => debt.id === debtId), eventId, voidedAt);
    }
  }

  const actions = useMemo(() => {
    const repositoryAdapter = createRepository();
    const dashboardService = createDashboardService();
    const notificacionService = createNotificacionService(repositoryAdapter, dashboardService);
    const usuarioService = new UsuarioService({
      repository: new UsuarioRepository({ dataStore, repository: repositoryAdapter }),
      users: appData.app_users || [],
      audit
    });
    const beneficiarioService = createBeneficiarioService(repositoryAdapter, notificacionService);
    const inventarioService = createInventarioService(repositoryAdapter, notificacionService);
    const configuracionService = createConfiguracionService({
      repositoryAdapter,
      usuarioService,
      dashboardService,
      notificacionService
    });
    const donacionService = createDonacionService(inventarioService, dashboardService, repositoryAdapter, notificacionService);
    const recursoService = createRecursoService(repositoryAdapter, notificacionService);
    const colaboradorService = createColaboradorService({
      repositoryAdapter,
      donacionService,
      recursoService,
      notificacionService,
      dashboardService
    });
    const donanteService = createDonanteService({
      repositoryAdapter,
      donacionService,
      notificacionService,
      dashboardService
    });
    const entregaService = createEntregaService({
      repositoryAdapter,
      beneficiarioService,
      inventarioService,
      dashboardService,
      configuracionService,
      notificacionService
    });
    const beneficiarioPortalService = createBeneficiarioPortalService({
      repositoryAdapter,
      beneficiarioService,
      entregaService,
      recursoService,
      notificacionService
    });
    const voluntarioService = createVoluntarioService({
      repositoryAdapter,
      usuarioService,
      entregaService,
      dashboardService,
      notificacionService
    });
    const informeService = createInformeService({
      repositoryAdapter,
      beneficiarioService,
      inventarioService,
      entregaService,
      donacionService,
      voluntarioService,
      recursoService
    });

    const iaService = createIAService({
      repositoryAdapter,
      configuracionService
    });
    const agendaService = createAgendaOperativaService({
      repositoryAdapter,
      beneficiarioService,
      entregaService,
      inventarioService,
      voluntarioService,
      donacionService,
      dashboardService,
      notificacionService
    });
    const priorityEngineService = createPriorityEngineService({
      repositoryAdapter,
      notificacionService,
      agendaOperativaService: agendaService,
      dashboardService
    });
    const campanaService = new CampanaService({
      repository: new CampanaRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      data: appData,
      audit,
      assertPermission,
      inventarioService,
      beneficiarioService,
      agendaOperativaService: agendaService,
      notificacionService,
      dashboardService,
      currentUser
    });
    dashboardService.configureIntegrations?.({
      beneficiarioService,
      inventarioService,
      entregaService,
      donacionService,
      voluntarioService,
      recursoService,
      notificacionService,
      agendaOperativaService: agendaService,
      priorityEngineService
    });

    return ({
    agenda: agendaService,
    beneficiarioPortal: beneficiarioPortalService,
    campanas: campanaService,
    colaboradorPortal: colaboradorService,
    configuracion: configuracionService,
    dashboard: dashboardService,
    donantePortal: donanteService,
    ia: iaService,
    notifications: notificacionService,
    priorities: priorityEngineService,
    reports: informeService,
    reloadData: reload,
    manageOfficialCredential,
    recordOfficialCredentialPrint: async (credential) => manageOfficialCredential(credential, 'print'),
    recordOfficialCredentialDownload: async (credential) => manageOfficialCredential(credential, 'download_pdf'),
    replaceOfficialCredential: async (credential, reason = '') => manageOfficialCredential(credential, 'replace', reason),
    suspendOfficialCredential: async (credential, reason = '') => manageOfficialCredential(credential, 'suspend', reason),
    revokeOfficialCredential: async (credential, reason = '') => manageOfficialCredential(credential, 'revoke', reason),
    reactivateOfficialCredential: async (credential, reason = '') => manageOfficialCredential(credential, 'reactivate', reason),
    expireOfficialCredential: async (credential, reason = '') => manageOfficialCredential(credential, 'expire', reason),
    markNotificationRead: async (id) => {
      await notificacionService.markAsRead(id);
      await reload();
    },
    markAllNotificationsRead: async () => {
      await notificacionService.markAllAsRead();
      await reload();
    },
    updateSocialCareCase: async (reference = {}, payload = {}) => {
      assertPermission('social-care', 'edit');
      const now = new Date().toISOString();
      const status = String(payload.status || '').trim();
      const notes = String(payload.notes || '').trim();
      const isResolved = status === 'applied';
      let updatedRequest = null;

      if (reference.request_id) {
        const updatePayload = {
          status: status || 'pending',
          notes,
          updated_at: now
        };
        if (isResolved) {
          updatePayload.resolved_at = now;
          updatePayload.reviewed_by = currentUser?.id || null;
        }
        updatedRequest = await repositoryUpdate('beneficiary_portal_profile_updates', reference.request_id, updatePayload);
      }

      if (reference.document_id) {
        const document = (appData.beneficiary_documents || []).find((item) => item.id === reference.document_id);
        if (!document) throw new Error('El documento vinculado al caso no existe.');
        const currentMeta = readDocumentAutomationMeta(document);
        const nextMeta = {
          ...currentMeta,
          version: 1,
          updatedAt: now,
          socialCare: {
            ...(currentMeta.socialCare || {}),
            status: status || 'pending',
            notes,
            updatedAt: now,
            reviewedBy: currentUser?.id || null,
            ...(isResolved ? { resolvedAt: now } : {})
          }
        };
        await beneficiarioService.updateDocument(reference.document_id, {
          notes: buildDocumentNotesWithAutomationMeta(document, nextMeta)
        });
      }

      const relatedNotifications = (appData.notificaciones || []).filter((notification) => isRelatedSocialCareNotification(notification, reference));
      for (const notification of relatedNotifications) {
        const metadata = {
          ...(notification.metadata || {}),
          social_care_status: status || 'pending',
          social_care_notes: notes,
          social_care_updated_at: now,
          social_care_reviewed_by: currentUser?.id || null
        };
        if (isResolved) {
          metadata.social_care_resolved_at = now;
        }
        await repositoryUpdate('notificaciones', notification.id, {
          metadata,
          ...(isResolved ? {
            leida: true,
            estado: 'Leida',
            read_at: now,
            read_by: currentUser?.id || null
          } : {}),
          updated_at: now
        });
      }

      if (isResolved && payload.notifyUser && reference.beneficiary_id) {
        await repositoryCreate('beneficiary_portal_notices', {
          beneficiary_id: reference.beneficiary_id,
          title: 'Solicitud atendida',
          message: 'El equipo de Pan y Esperanza ha atendido tu solicitud. Si necesitas ampliar información, puedes contactar con la asociación.',
          notice_type: 'request',
          status: 'unread',
          created_at: now,
          updated_at: now
        });
      }

      await audit(`Centro de Atencion Social: actualizo caso ${reference.request_id || reference.delivery_id || reference.document_id || reference.notification_id || ''}`.trim());
      await reload();
      return updatedRequest;
    },
    createAgendaEvent: async (payload) => {
      const created = await agendaService.createEvent(payload);
      await reload();
      return created;
    },
    updateAgendaEvent: async (id, payload) => {
      const updated = await agendaService.updateEvent(id, payload);
      await reload();
      return updated;
    },
    deleteAgendaEvent: async (id) => {
      await agendaService.deleteEvent(id);
      await reload();
    },
    createAgendaCampaign: async (payload) => {
      const created = await agendaService.createCampaign(payload);
      await reload();
      return created;
    },
    updateAgendaCampaign: async (id, payload) => {
      const updated = await agendaService.updateCampaign(id, payload);
      await reload();
      return updated;
    },
    cancelAgendaCampaign: async (id) => {
      const updated = await agendaService.cancelCampaign(id);
      await reload();
      return updated;
    },
    generateOperationalCampaign: async (payload) => {
      const result = await campanaService.generateCampaign(payload);
      await reload();
      return result;
    },
    createDeletionRequest: async (payload) => {
      const moduleId = String(payload?.module || '').trim();
      assertDeletionRequester(moduleId);
      const reason = String(payload?.reason || '').trim();
      if (reason.length < 5) throw new Error('Indica un motivo válido para solicitar la eliminación.');
      const recordId = String(payload?.record_id || '').trim();
      if (!recordId) throw new Error('No se ha indicado el registro que se desea eliminar.');
      const existingPending = (appData.deletion_requests || []).find((request) => (
        request.status === 'Pendiente'
        && request.module === moduleId
        && String(request.record_id) === recordId
      ));
      if (existingPending) throw new Error('Ya existe una solicitud pendiente para este registro.');
      const association = associationMeta();
      const created = await repositoryCreate('deletion_requests', {
        ...association,
        module: moduleId,
        record_type: payload.record_type || moduleId,
        record_id: recordId,
        record_label: payload.record_label || recordId,
        requester_id: currentUser?.id || null,
        requester_name: currentUserName(),
        requester_email: currentUser?.email || '',
        requested_at: new Date().toISOString(),
        reason,
        notes: String(payload?.notes || '').trim(),
        status: 'Pendiente',
        relations_snapshot: Array.isArray(payload?.relations) ? payload.relations : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      await audit(`Solicitó eliminación definitiva de ${created.record_label || created.record_id}. Motivo: ${reason}`);
      await trySendDeletionEmail(
        () => notifyDeletionRequestProvider(created),
        `Falló notificación al proveedor para solicitud ${created.id}`
      );
      await reload();
      return created;
    },
    resolveDeletionRequest: async (id, payload) => {
      assertSystemSuperadmin();
      const request = (appData.deletion_requests || []).find((item) => item.id === id);
      if (!request) throw new Error('La solicitud no existe.');
      if (request.status !== 'Pendiente') throw new Error('La solicitud ya está resuelta.');
      const decision = payload?.decision === 'Aprobada' ? 'Aprobada' : 'Rechazada';
      const resolutionReason = String(payload?.resolution_reason || '').trim();
      if (resolutionReason.length < 5) throw new Error('Indica un motivo de resolución válido.');
      let deletedRecordType = '';
      if (decision === 'Aprobada') {
        deletedRecordType = await executeApprovedDeletionRequest(request);
      }
      const resolved = await repositoryUpdate('deletion_requests', id, {
        status: decision,
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser?.id || null,
        resolved_by_name: currentUserName(),
        resolved_by_email: currentUser?.email || '',
        resolution_reason: resolutionReason,
        updated_at: new Date().toISOString()
      });
      await audit(`${decision === 'Aprobada' ? 'Aprobó y ejecutó' : 'Rechazó'} solicitud de eliminación ${request.record_label || request.record_id}. Motivo: ${resolutionReason}`);
      if (decision === 'Rechazada') {
        await trySendDeletionEmail(
          () => notifyDeletionRequestRejected(resolved, resolutionReason),
          `Falló notificación de rechazo para solicitud ${id}`
        );
      }
      await reload();
      return { request: resolved, deletedRecordType };
    },
    createBeneficiary: async (payload) => {
      await beneficiarioService.create(payload);
      await reload();
    },
    createFamily: async (payload) => {
      assertPermission('families', 'create');
      const createdAt = payload?.created_at || new Date().toISOString();
      const created = await repositoryCreate('families', {
        ...sanitizeFamilyPayload(payload),
        created_at: createdAt,
        updated_at: payload?.updated_at || createdAt
      });
      await audit(`Creo familia ${created.family_code || created.responsible_name || ''}`.trim());
      await reload();
      return created;
    },
    updateFamily: async (id, payload) => {
      assertPermission('families', 'edit');
      const updated = await repositoryUpdate('families', id, sanitizeFamilyPayload(payload));
      await audit(`Edito familia ${updated.family_code || updated.responsible_name || ''}`.trim());
      await reload();
      return updated;
    },
    archiveFamily: async (id, payload = {}) => {
      assertPermission('families', 'edit');
      const family = appData.families.find((item) => item.id === id);
      if (!family) throw new Error('La familia no existe.');
      const archivedAt = new Date().toISOString();
      const archiveReason = String(payload.reason || payload.archive_reason || '').trim();
      const archived = await repositoryUpdate('families', id, {
        notes: withFamilyArchiveMarker(family.notes, archivedAt, currentUserName(), archiveReason),
        status: 'Archivada',
        archived_at: archivedAt,
        archive_reason: archiveReason,
        updated_at: archivedAt
      });
      await audit(`Archivo familia ${family.family_code || family.responsible_name || id}`.trim());
      await reload();
      return archived;
    },
    deleteFamily: async (id) => {
      if (currentUser?.role !== 'Superadministrador') throw new Error('Solo el Superadministrador puede eliminar familias.');
      const members = (appData.beneficiaries || []).filter((item) => item.family_id === id);
      if (members.length) throw new Error('Esta familia tiene miembros asociados.');
      const family = appData.families.find((item) => item.id === id);
      await repositoryRemove('families', id);
      await audit(`Elimino familia ${family?.family_code || id}`.trim());
      await reload();
    },
    createBeneficiaryDocument: async (payload) => {
      await beneficiarioService.createDocument(payload);
      await reload();
    },
    updateBeneficiaryDocument: async (id, payload) => {
      const updated = await beneficiarioService.updateDocument(id, payload);
      await reload();
      return updated;
    },
    deleteBeneficiaryDocument: async (id) => {
      await beneficiarioService.removeDocument(id);
      await reload();
    },
    createSocialHistory: async (payload) => {
      await beneficiarioService.createSocialHistory(payload);
      await reload();
    },
    updateBeneficiary: async (id, payload) => {
      await beneficiarioService.update(id, payload);
      await reload();
    },
    deleteBeneficiary: async (id) => {
      await beneficiarioService.remove(id);
      await reload();
    },
    activateBeneficiaryPortal: async (id) => {
      const result = await beneficiarioPortalService.activateAccess(id);
      await reload();
      return result;
    },
    deactivateBeneficiaryPortal: async (id) => {
      const result = await beneficiarioPortalService.deactivateAccess(id);
      await reload();
      return result;
    },
    regenerateBeneficiaryPortalPin: async (id) => {
      const result = await beneficiarioPortalService.regeneratePin(id);
      await reload();
      return result;
    },
    sendBeneficiaryPortalAccess: async (id, options = {}) => {
      const result = await beneficiarioPortalService.sendAccess(id, options);
      await reload();
      return result;
    },
    createBeneficiaryPortalNotice: async (id, payload = {}) => {
      const result = await beneficiarioPortalService.createNotice(id, payload);
      await reload();
      return result;
    },
    activatePendingBeneficiaryPortals: async () => {
      const result = await beneficiarioPortalService.activatePendingAccesses();
      await reload();
      return result;
    },
    createDelivery: async (payload) => {
      const result = await entregaService.create(payload);
      await reload();
      return result;
    },
    createSmartDelivery: async (payload) => {
      const smartDeliveryService = createEntregaService({
        assertPermissionOverride: (moduleId, actionId) => {
          if (moduleId === 'deliveries' && actionId === 'create' && canDo(currentUser, 'smart-deliveries', 'create')) return;
          assertPermission(moduleId, actionId);
        }
      });
      const result = await smartDeliveryService.create(payload);
      await reload();
      return result;
    },
    deleteDelivery: async (id) => {
      await entregaService.remove(id);
      await reload();
    },
    cancelDelivery: async (id, reason) => {
      await entregaService.cancel(id, reason);
      await reload();
    },
    saveDeliverySignature: async (id, payload) => {
      const updated = await entregaService.saveSignature(id, payload);
      await reload();
      return updated;
    },
    createEmailLog: async (payload) => {
      await repositoryCreate('email_logs', payload);
      await reload();
    },
    updateEmailLog: async (id, payload) => {
      await repositoryUpdate('email_logs', id, payload);
      await reload();
    },
    deleteEmailLog: async (id) => {
      if (currentUser?.role !== 'Superadministrador') throw new Error('Solo el Superadministrador puede eliminar citas definitivamente.');
      await repositoryRemove('email_logs', id);
      await audit('Elimino definitivamente una cita de agenda');
      await reload();
    },
    createInventoryItem: async (payload, options = {}) => {
      const created = Number(options.initialQuantity || 0) > 0
        ? await inventarioService.createItemWithInitialStock(payload, {
          initialQuantity: options.initialQuantity,
          moved_at: options.moved_at,
          responsible: cleanText(options.responsible) || currentUserName(),
          notes: options.notes
        })
        : await inventarioService.createItem(payload);
      await reload();
      return created;
    },
    updateInventoryItem: async (id, payload) => {
      const updated = await inventarioService.updateItem(id, payload);
      await reload();
      return updated;
    },
    deleteInventoryItem: async (id) => {
      await inventarioService.removeItem(id);
      await reload();
    },
    createInventoryMovement: async (payload) => {
      const result = await inventarioService.createMovement(payload);
      await reload();
      return result;
    },
    createInventoryMovements: async (payloads = []) => {
      const results = [];
      for (const payload of payloads) {
        results.push(await inventarioService.createMovement(payload));
      }
      await reload();
      return results;
    },
    createDonorContact: async (payload) => {
      const contact = await donacionService.createDonorContact(payload);
      await reload();
      return contact;
    },
    updateDonorContact: async (id, payload) => {
      const updated = await donacionService.updateDonorContact(id, payload);
      await reload();
      return updated;
    },
    archiveDonorContact: async (id, payload) => {
      const updated = await donacionService.archiveDonorContact(id, payload);
      await reload();
      return updated;
    },
    deleteDonorContact: async (id) => {
      await donacionService.deleteDonorContact(id);
      await reload();
    },
    createResource: async (payload) => {
      const created = await recursoService.create(payload);
      await reload();
      return created;
    },
    updateResource: async (id, payload) => {
      const updated = await recursoService.update(id, payload);
      await reload();
      return updated;
    },
    publishResource: async (id) => {
      const updated = await recursoService.publish(id);
      await reload();
      return updated;
    },
    unpublishResource: async (id) => {
      const updated = await recursoService.unpublish(id);
      await reload();
      return updated;
    },
    archiveResource: async (id) => {
      const updated = await recursoService.archive(id);
      await reload();
      return updated;
    },
    createFinancialAccount: async (payload) => {
      assertPermission('accounting', 'create');
      const cleanAccount = sanitizeFinancialAccountPayload(payload);
      const account = await repositoryCreate('financial_accounts', {
        ...cleanAccount,
        ...userMeta()
      });
      await accountingAuditTrail('financial_accounts', account.id, 'create', null, account);
      await audit(`Contabilidad: creo cuenta ${account.name}`.trim());
      await reload();
    },
    updateFinancialAccount: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const current = findFinancialAccount(id);
      const cleanAccount = sanitizeFinancialAccountPayload(payload, current);
      const updated = await repositoryUpdate('financial_accounts', id, cleanAccount);
      await accountingAuditTrail('financial_accounts', id, 'update', current, updated);
      await audit(`Contabilidad: edito cuenta ${updated.name || current.name}`.trim());
      await reload();
    },
    deleteFinancialAccount: async (id) => {
      assertAccountingSuperadmin();
      const account = (appData.financial_accounts || []).find((item) => item.id === id);
      if (!account) throw new Error('La cuenta no existe.');
      const hasRelations = (appData.cash_bank_movements || []).some((movement) => movement.financial_account_id === id)
        || (appData.accounting_events || []).some((event) => event.financial_account_id === id);
      if (hasRelations) throw new Error('No se puede eliminar una cuenta con movimientos o eventos relacionados. Puedes desactivarla.');
      await repositoryRemove('financial_accounts', id);
      await accountingAuditTrail('financial_accounts', id, 'delete', account, null);
      await audit(`Contabilidad: elimino cuenta sin relaciones ${account.name}`.trim());
      await reload();
    },
    registerEconomicOperation: async (payload) => {
      await performEconomicOperation(payload);
      await reload();
    },
    registerCashBankMovement: async (payload) => {
      assertPermission('accounting', 'create');
      const { account, movement, event, document } = sanitizeCashBankMovementPayload(payload);
      const nextBalance = Number(account.current_balance || 0) + movementDelta(movement);
      assertNoUnauthorizedNegativeBalance(account, nextBalance, payload?.allow_negative_balance === true);
      const createdEvent = await repositoryCreate('accounting_events', event);
      await accountingAuditTrail('accounting_events', createdEvent.id, 'create', null, createdEvent);
      const createdMovement = await repositoryCreate('cash_bank_movements', {
        ...movement,
        accounting_event_id: createdEvent.id
      });
      await accountingAuditTrail('cash_bank_movements', createdMovement.id, 'create', null, createdMovement);
      await createAccountingDocumentForEvent(createdEvent.id, document);
      await applyAccountBalance(account, nextBalance, 'balance_update');
      await audit(`Contabilidad: registro movimiento ${movement.notes}`.trim());
      await reload();
    },
    registerBankTransfer: async (payload) => {
      assertPermission('accounting', 'create');
      await performBankTransfer(payload);
      await reload();
    },
    correctCashBankMovement: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const original = (appData.cash_bank_movements || []).find((movement) => movement.id === id);
      if (!original) throw new Error('El movimiento no existe.');
      if (original.status === 'voided') throw new Error('No se puede corregir un movimiento anulado.');
      if (original.status === 'corrected') throw new Error('Este movimiento ya fue corregido.');
      if (String(original.movement_type || '').startsWith('transfer_')) {
        throw new Error('Para corregir una transferencia, anula la transferencia y registra una nueva.');
      }
      const linkedEvent = (appData.accounting_events || []).find((item) => item.id === original.accounting_event_id);
      if (['loan', 'debt'].includes(linkedEvent?.event_type)) {
        throw new Error('Para corregir un préstamo o deuda, anula el movimiento y registra la operación correcta desde Nueva operación.');
      }
      const correctionReason = String(payload?.correction_reason || '').trim();
      if (correctionReason.length < 5) throw new Error('Indica un motivo de corrección válido.');
      const account = findFinancialAccount(original.financial_account_id);
      const { movement, event, document } = sanitizeCashBankMovementPayload({
        ...payload,
        financial_account_id: account.id,
        movement_type: original.movement_type
      }, original.movement_type);
      const balanceAfterReversal = Number(account.current_balance || 0) - movementDelta(original);
      const nextBalance = balanceAfterReversal + movementDelta(movement);
      assertNoUnauthorizedNegativeBalance(account, nextBalance, payload?.allow_negative_balance === true);
      const previousMovement = { ...original };
      const correctedOriginal = await repositoryUpdate('cash_bank_movements', original.id, {
        status: 'corrected',
        void_reason: correctionReason,
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('cash_bank_movements', original.id, 'mark_corrected', previousMovement, correctedOriginal);
      const previousEvent = linkedEvent;
      if (previousEvent) {
        const updatedEvent = await repositoryUpdate('accounting_events', previousEvent.id, {
          status: 'corrected',
          void_reason: correctionReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('accounting_events', previousEvent.id, 'mark_corrected', previousEvent, updatedEvent);
      }
      const createdEvent = await repositoryCreate('accounting_events', {
        ...event,
        correction_of_event_id: original.accounting_event_id || null,
        description: `${event.description}. Corrección: ${correctionReason}`
      });
      await accountingAuditTrail('accounting_events', createdEvent.id, 'create_correction', null, createdEvent);
      const createdMovement = await repositoryCreate('cash_bank_movements', {
        ...movement,
        accounting_event_id: createdEvent.id
      });
      await accountingAuditTrail('cash_bank_movements', createdMovement.id, 'create_correction', null, createdMovement);
      await createAccountingDocumentForEvent(createdEvent.id, document);
      await applyAccountBalance(account, nextBalance, 'balance_correction');
      await audit(`Contabilidad: corrigio movimiento ${original.id}`.trim());
      await reload();
    },
    voidCashBankMovement: async (id, reason) => {
      assertAccountingSuperadmin();
      const cleanReason = String(reason || '').trim();
      if (cleanReason.length < 5) throw new Error('Indica un motivo de anulación válido.');
      const original = (appData.cash_bank_movements || []).find((movement) => movement.id === id);
      if (!original) throw new Error('El movimiento no existe.');
      if (original.status === 'voided') throw new Error('El movimiento ya está anulado.');
      const relatedMovements = original.accounting_event_id && String(original.movement_type || '').startsWith('transfer_')
        ? (appData.cash_bank_movements || []).filter((movement) => movement.accounting_event_id === original.accounting_event_id && movement.status !== 'voided')
        : [original];
      for (const movement of relatedMovements) {
        const account = findFinancialAccount(movement.financial_account_id);
        const nextBalance = Number(account.current_balance || 0) - movementDelta(movement);
        const updatedMovement = await repositoryUpdate('cash_bank_movements', movement.id, {
          status: 'voided',
          voided_at: new Date().toISOString(),
          void_reason: cleanReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('cash_bank_movements', movement.id, 'void', movement, updatedMovement);
        await applyAccountBalance(account, nextBalance, 'balance_void');
      }
      const event = (appData.accounting_events || []).find((item) => item.id === original.accounting_event_id);
      if (event) {
        const updatedEvent = await repositoryUpdate('accounting_events', event.id, {
          status: 'voided',
          voided_at: new Date().toISOString(),
          void_reason: cleanReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('accounting_events', event.id, 'void', event, updatedEvent);
        await voidRelatedLoanDebtEntries(event.id, cleanReason);
      }
      await audit(`Contabilidad: anulo movimiento ${id}`.trim());
      await reload();
    },
    createTreasuryIncome: async (payload) => {
      assertPermission('accounting', 'create');
      await repositoryCreate('treasury_incomes', payload);
      await audit(`Contabilidad: registro historico de ingreso ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryIncome: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await repositoryUpdate('treasury_incomes', id, payload);
      await audit(`Contabilidad: actualizo ingreso historico ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryIncome: async (id) => {
      assertPermission('accounting', 'delete');
      await repositoryRemove('treasury_incomes', id);
      await audit('Contabilidad: elimino ingreso historico');
      await reload();
    },
    createTreasuryExpense: async (payload) => {
      assertPermission('accounting', 'create');
      await repositoryCreate('treasury_expenses', payload);
      await audit(`Contabilidad: registro historico de gasto ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryExpense: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await repositoryUpdate('treasury_expenses', id, payload);
      await audit(`Contabilidad: actualizo gasto historico ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryExpense: async (id) => {
      assertPermission('accounting', 'delete');
      await repositoryRemove('treasury_expenses', id);
      await audit('Contabilidad: elimino gasto historico');
      await reload();
    },
    createTreasuryLoan: async (payload) => {
      assertPermission('accounting', 'create');
      await repositoryCreate('treasury_loans', payload);
      await audit(`Contabilidad: registro histórico de préstamo ${payload.concept || payload.person || ''}`.trim());
      await reload();
    },
    updateTreasuryLoan: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await repositoryUpdate('treasury_loans', id, payload);
      await audit(`Contabilidad: actualizó préstamo histórico ${payload.concept || payload.person || ''}`.trim());
      await reload();
    },
    deleteTreasuryLoan: async (id) => {
      assertPermission('accounting', 'delete');
      await repositoryRemove('treasury_loans', id);
      await audit('Contabilidad: eliminó préstamo histórico');
      await reload();
    },
    createTreasuryAccount: async (payload) => {
      assertPermission('accounting', 'create');
      await repositoryCreate('treasury_accounts', payload);
      await audit(`Contabilidad: registro cuenta historica ${payload.name || ''}`.trim());
      await reload();
    },
    updateTreasuryAccount: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await repositoryUpdate('treasury_accounts', id, payload);
      await audit(`Contabilidad: actualizo cuenta historica ${payload.name || ''}`.trim());
      await reload();
    },
    deleteTreasuryAccount: async (id) => {
      assertPermission('accounting', 'delete');
      await repositoryRemove('treasury_accounts', id);
      await audit('Contabilidad: elimino cuenta historica');
      await reload();
    },
    createVolunteer: async (payload) => {
      await voluntarioService.create(payload);
      await reload();
    },
    updateVolunteer: async (id, payload) => {
      await voluntarioService.update(id, payload);
      await reload();
    },
    createCollaborator: async (payload) => {
      await colaboradorService.create(payload);
      await reload();
    },
    updateCollaborator: async (id, payload) => {
      await colaboradorService.update(id, payload);
      await reload();
    },
    activateCollaboratorPortal: async (id) => {
      await colaboradorService.activatePortal(id);
      await reload();
    },
    deactivateCollaboratorPortal: async (id) => {
      await colaboradorService.deactivatePortal(id);
      await reload();
    },
    resendCollaboratorAccess: async (id) => {
      const result = await colaboradorService.resendAccess(id);
      await reload();
      return result;
    },
    createDonor: async (payload) => {
      const created = await donanteService.create(payload);
      await reload();
      return created;
    },
    updateDonor: async (id, payload) => {
      const updated = await donanteService.update(id, payload);
      await reload();
      return updated;
    },
    activateDonorPortal: async (id) => {
      const updated = await donanteService.activatePortal(id);
      await reload();
      return updated;
    },
    deactivateDonorPortal: async (id) => {
      const updated = await donanteService.deactivatePortal(id);
      await reload();
      return updated;
    },
    resendDonorAccess: async (id) => {
      const result = await donanteService.resendAccess(id);
      await reload();
      return result;
    },
    deleteVolunteer: async (id) => {
      await voluntarioService.remove(id);
      await reload();
    },
    createVolunteerHistory: async (payload) => {
      await voluntarioService.createHistory(payload);
      await reload();
    },
    updateOrganizationSettings: async (payload) => {
      await configuracionService.saveSettings(payload);
      await reload();
    },
    createUser: async (payload) => {
      await usuarioService.create(payload);
      await reload();
    },
    sendUserWelcomeEmail: async (user, organization, logoUrl) => {
      await usuarioService.sendWelcomeEmail(user, organization, logoUrl);
    },
    updateUser: async (id, payload) => {
      await usuarioService.update(id, payload);
      await reload();
    },
    deactivateUser: async (id) => {
      await usuarioService.deactivate(id);
      await reload();
    },
    reactivateUser: async (id) => {
      await usuarioService.reactivate(id);
      await reload();
    },
    blockUser: async (id) => {
      await usuarioService.block(id);
      await reload();
    },
    deleteUser: async (id) => {
      assertPermission('users', 'delete');
      await usuarioService.remove(id);
      await reload();
    },
    resetUserPassword: async (id, password) => {
      await usuarioService.resetPassword(id, password);
      await reload();
    },
    updateUserLastAccess: async (id) => {
      await usuarioService.updateLastAccess(id);
      await reload();
    },
    createAuditLog: async (payload) => {
      await usuarioService.createAuditLog(payload);
      await reload();
    },
    preparePlatformMaintenanceOperation: async (payload) => {
      if (!isPlatformOwner(currentUser)) {
        throw new Error('Solo el Platform Owner de ALTHEMON puede preparar operaciones de plataforma.');
      }
      const result = await createPlatformMaintenanceService().prepareOperation(payload);
      return result;
    },
    replaceAllData: async (payload) => {
      await repositoryReplaceLocalData(payload);
      await reload();
    },
    prepareProductionEnvironment: async (scopes = []) => {
      if (currentUser?.role !== 'Superadministrador') {
        throw new Error('Solo el Superadministrador puede preparar el entorno de producción.');
      }
      const allowedScopes = new Set(['donations', 'inventory', 'inventory_entries', 'inventory_exits', 'accounting_movements', 'agenda', 'communications']);
      const selected = new Set(scopes.filter((scope) => allowedScopes.has(scope)));
      const eventIds = new Set();
      const inventoryItemIds = new Set();
      const inventoryMovementIds = new Set();
      const donationIds = new Set();
      const emailLogIds = new Set();
      const appointmentLogKinds = new Set(['appointment', 'appointment_reminder', 'appointment_status_notice']);
      const emailLogMeta = (log) => (Array.isArray(log.attachments) ? (log.attachments.find((item) => item?.kind) || {}) : {});

      if (selected.has('donations')) {
        (appData.donations || []).forEach((item) => donationIds.add(item.id));
        (appData.accounting_events || [])
          .filter((event) => ['donation_money', 'donation_in_kind'].includes(event.event_type) || event.source_module === 'donations')
          .forEach((event) => eventIds.add(event.id));
      }
      if (selected.has('accounting_movements')) {
        (appData.accounting_events || []).forEach((event) => eventIds.add(event.id));
      }
      if (selected.has('inventory')) {
        (appData.inventory_items || []).forEach((item) => inventoryItemIds.add(item.id));
      }
      if (selected.has('inventory_entries')) {
        (appData.inventory_movements || []).filter((item) => item.movement_type === 'Entrada').forEach((item) => inventoryMovementIds.add(item.id));
      }
      if (selected.has('inventory_exits')) {
        (appData.inventory_movements || []).filter((item) => item.movement_type === 'Salida').forEach((item) => inventoryMovementIds.add(item.id));
      }
      if (selected.has('agenda')) {
        (appData.email_logs || []).filter((log) => appointmentLogKinds.has(emailLogMeta(log).kind)).forEach((log) => emailLogIds.add(log.id));
      }
      if (selected.has('communications')) {
        (appData.email_logs || []).filter((log) => !appointmentLogKinds.has(emailLogMeta(log).kind)).forEach((log) => emailLogIds.add(log.id));
      }

      const removeRows = async (table, rows) => {
        for (const row of rows) await repositoryRemove(table, row.id);
        return rows.length;
      };

      const eventRelated = (row) => row.accounting_event_id && eventIds.has(row.accounting_event_id);
      const counts = {};
      const accountingDocumentsToRemove = (appData.accounting_documents || []).filter(eventRelated);
      const cashBankMovementsToRemove = (appData.cash_bank_movements || []).filter(eventRelated);
      const loanMovementsToRemove = (appData.loan_movements || []).filter(eventRelated);
      const debtMovementsToRemove = (appData.debt_movements || []).filter(eventRelated);
      const auditRecordIds = new Set([
        ...eventIds,
        ...accountingDocumentsToRemove.map((row) => row.id),
        ...cashBankMovementsToRemove.map((row) => row.id),
        ...loanMovementsToRemove.map((row) => row.id),
        ...debtMovementsToRemove.map((row) => row.id)
      ]);
      counts.accounting_audit_trail = await removeRows('accounting_audit_trail', (appData.accounting_audit_trail || []).filter((row) => (
        selected.has('accounting_movements')
        || auditRecordIds.has(row.record_id)
      )));
      counts.accounting_documents = await removeRows('accounting_documents', accountingDocumentsToRemove);
      counts.cash_bank_movements = await removeRows('cash_bank_movements', cashBankMovementsToRemove);
      counts.loan_movements = await removeRows('loan_movements', loanMovementsToRemove);
      counts.debt_movements = await removeRows('debt_movements', debtMovementsToRemove);
      counts.social_value_events = await removeRows('social_value_events', (appData.social_value_events || []).filter((row) => (
        eventRelated(row)
        || donationIds.has(row.source_record_id)
        || inventoryItemIds.has(row.inventory_item_id)
      )));
      counts.donations = await removeRows('donations', (appData.donations || []).filter((row) => donationIds.has(row.id)));
      const inventoryMovementsToRemove = (appData.inventory_movements || []).filter((row) => inventoryItemIds.has(row.item_id) || inventoryMovementIds.has(row.id));
      const stockByItem = new Map((appData.inventory_items || []).map((item) => [item.id, Number(item.stock || 0)]));
      for (const movement of inventoryMovementsToRemove.filter((row) => !inventoryItemIds.has(row.item_id))) {
        const currentStock = stockByItem.get(movement.item_id);
        if (currentStock === undefined) continue;
        const nextStock = movement.movement_type === 'Entrada'
          ? Math.max(0, currentStock - Number(movement.quantity || 0))
          : currentStock + Number(movement.quantity || 0);
        stockByItem.set(movement.item_id, nextStock);
        await createInventarioService().setStockForMaintenance(movement.item_id, nextStock);
      }
      counts.inventory_movements = await removeRows('inventory_movements', inventoryMovementsToRemove);
      counts.inventory_items = await removeRows('inventory_items', (appData.inventory_items || []).filter((row) => inventoryItemIds.has(row.id)));
      counts.accounting_events = await removeRows('accounting_events', (appData.accounting_events || []).filter((row) => eventIds.has(row.id)));
      counts.email_logs = await removeRows('email_logs', (appData.email_logs || []).filter((row) => emailLogIds.has(row.id)));

      await audit(`Preparó entorno de producción. Limpieza: ${Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(', ')}`);
      await reload();
      return counts;
    },
    resetDemo: async () => {
      await repositoryResetLocalDemo();
      await reload();
    }
    });
  }, [data, reload, currentUser]);

  return { data, loading, error, actions };
}

function withAppDataTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      const error = new Error('La carga inicial del ERP ha superado el tiempo de espera. Intenta recargar la pagina.');
      error.code = 'APP_DATA_LOAD_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    globalThis.clearTimeout(timeoutId);
  });
}

function isRelatedSocialCareNotification(notification, reference = {}) {
  if (!notification) return false;
  const metadata = notification.metadata || {};
  return Boolean(
    (reference.notification_id && notification.id === reference.notification_id)
    || (reference.request_id && metadata.request_id === reference.request_id)
    || (reference.delivery_id && metadata.delivery_id === reference.delivery_id)
    || (reference.delivery_id && notification.entity_type === 'delivery' && notification.entity_id === reference.delivery_id)
    || (reference.document_id && metadata.document_id === reference.document_id)
    || (reference.document_id && notification.entity_type === 'beneficiary_document' && notification.entity_id === reference.document_id)
  );
}

function enrichOfficialCredentialData(data = {}) {
  const registry = data.official_credential_registry || [];
  const events = data.official_credential_events || [];
  const byUid = new Map(registry.map((item) => [String(item.credential_uid || '').trim(), item]));
  const bySubject = new Map(registry.map((item) => [`${item.subject_type}:${item.subject_id}`, item]));
  const credentialsBySubject = new Map();
  const eventsBySubject = new Map();

  registry.forEach((item) => {
    const key = `${item.subject_type}:${item.subject_id}`;
    const list = credentialsBySubject.get(key) || [];
    list.push(item);
    credentialsBySubject.set(key, list);
  });

  events.forEach((item) => {
    const key = `${item.subject_type}:${item.subject_id}`;
    const list = eventsBySubject.get(key) || [];
    list.push(item);
    eventsBySubject.set(key, list);
  });

  credentialsBySubject.forEach((list) => {
    list.sort((left, right) => new Date(right.issued_at || right.created_at || 0) - new Date(left.issued_at || left.created_at || 0));
  });
  eventsBySubject.forEach((list) => {
    list.sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  });

  const enrichRows = (rows = [], subjectType) => rows.map((row) => {
    const uid = String(row.credential_uid || row.official_credential_id || row.credential_id || '').trim();
    const subjectKey = `${subjectType}:${row.id}`;
    const subjectCredentials = credentialsBySubject.get(subjectKey) || [];
    const activeCredential = subjectCredentials.find((item) => item.status === 'active') || null;
    const credential = activeCredential || (uid && byUid.get(uid)) || bySubject.get(subjectKey);
    if (!credential) return row;
    return {
      ...row,
      credential_uid: credential.credential_uid || uid,
      credential_status: credential.status || 'active',
      credential_status_reason: credential.status_reason || '',
      credential_expires_at: credential.expires_at || null,
      credential_qr_version: credential.qr_version || 1,
      credential_issued_at: credential.issued_at || row.credential_issued_at || row.created_at,
      credential_last_printed_at: credential.last_printed_at || null,
      credential_last_printed_by: credential.last_printed_by || null,
      credential_print_count: credential.print_count || 0,
      credential_last_validated_at: credential.last_validated_at || null,
      credential_validation_count: credential.validation_count || 0,
      credential_replaces_uid: credential.replaces_credential_uid || null,
      credential_replaced_by_uid: credential.replaced_by_credential_uid || null,
      credential_history: {
        credentials: subjectCredentials,
        events: eventsBySubject.get(subjectKey) || []
      }
    };
  });

  return {
    ...data,
    beneficiaries: enrichRows(data.beneficiaries, 'beneficiary'),
    volunteers: enrichRows(data.volunteers, 'volunteer'),
    collaborators: enrichRows(data.collaborators, 'collaborator'),
    donors: enrichRows(data.donors, 'donor'),
    app_users: enrichRows(data.app_users, 'user')
  };
}
