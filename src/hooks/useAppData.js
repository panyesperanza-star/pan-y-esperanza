import { useCallback, useEffect, useMemo, useState } from 'react';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion, isPlatformOwner, isSystemSuperadmin, verifyCurrentUserPassword } from '../lib/auth';
import { dataStore } from '../lib/dataStore';
import { buildDocumentNotesWithAutomationMeta, readDocumentAutomationMeta } from '../lib/documentAutomation';
import { sendEmailViaApi } from '../lib/emailClient';
import { normalize } from '../lib/formatters';
import { runSocialResourceWatchdog } from '../lib/socialResourceWatchdogClient';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import {
  applyPersonIdentityToUser,
  applyPersonIdentityToVolunteer,
  findVolunteerMatchesForUser,
  hasStrongVolunteerUserMatch,
  mergePersonIdentityPayloads,
  personIdentityPayloadFromUser,
  personIdentityPayloadFromVolunteer,
  userFullName
} from '../lib/personIdentity';
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
import { SocialResourceRepository } from '../services/socialResources/SocialResourceRepository';
import { SocialResourceService } from '../services/socialResources/SocialResourceService';
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
  donation_products: EMPTY_TABLE,
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
  volunteer_documents: EMPTY_TABLE,
  volunteer_training: EMPTY_TABLE,
  volunteer_time_entries: EMPTY_TABLE,
  volunteer_time_entry_corrections: EMPTY_TABLE,
  person_identities: EMPTY_TABLE,
  person_identity_link_audit: EMPTY_TABLE,
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
  social_resources: EMPTY_TABLE,
  beneficiary_social_resources: EMPTY_TABLE,
  social_resource_portal_beneficiaries: EMPTY_TABLE,
  social_resource_followups: EMPTY_TABLE,
  social_resource_history: EMPTY_TABLE,
  social_resource_sources: EMPTY_TABLE,
  social_resource_detections: EMPTY_TABLE,
  community_posts: EMPTY_TABLE,
  community_interests: EMPTY_TABLE,
  community_post_reports: EMPTY_TABLE,
  community_conversations: EMPTY_TABLE,
  community_messages: EMPTY_TABLE,
  community_post_recommendations: EMPTY_TABLE,
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
      setData(enrichOfficialCredentialData(enrichPersonIdentityData({
        ...EMPTY_APP_DATA,
        ...loadedData
      })));
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

  function compactPersonIdentityPayload(payload = {}) {
    return Object.fromEntries(Object.entries(payload).filter(([key, value]) => {
      if (key === 'updated_at') return true;
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    }));
  }

  async function createPersonIdentity(payload = {}) {
    const cleanPayload = compactPersonIdentityPayload({
      ...payload,
      created_by: currentUser?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    return repositoryCreate('person_identities', cleanPayload);
  }

  async function updatePersonIdentity(identityId, payload = {}) {
    if (!identityId) return null;
    const cleanPayload = compactPersonIdentityPayload({ ...payload, updated_at: new Date().toISOString() });
    if (Object.keys(cleanPayload).length <= 1) return null;
    return repositoryUpdate('person_identities', identityId, cleanPayload);
  }

  async function writePersonIdentityAudit(action, payload = {}) {
    await repositoryCreate('person_identity_link_audit', {
      person_identity_id: payload.person_identity_id || null,
      volunteer_id: payload.volunteer_id || null,
      app_user_id: payload.app_user_id || null,
      action,
      actor_id: currentUser?.id || null,
      actor_name: currentUserName(),
      reason: String(payload.reason || '').trim(),
      previous_values: payload.previous_values || {},
      next_values: payload.next_values || {},
      created_at: new Date().toISOString()
    });
  }

  async function ensureVolunteerPersonIdentity(volunteerId, payload = null) {
    const current = (appData.volunteers || []).find((item) => item.id === volunteerId) || {};
    const source = { ...current, ...(payload || {}) };
    if (source.person_identity_id) {
      await updatePersonIdentity(source.person_identity_id, personIdentityPayloadFromVolunteer(source));
      return source.person_identity_id;
    }
    const identity = await createPersonIdentity(personIdentityPayloadFromVolunteer({ ...source, id: volunteerId }));
    await repositoryUpdate('volunteers', volunteerId, { person_identity_id: identity.id });
    await writePersonIdentityAudit('created', {
      person_identity_id: identity.id,
      volunteer_id: volunteerId,
      reason: 'Identidad creada para expediente de voluntario',
      next_values: { volunteer_id: volunteerId }
    });
    return identity.id;
  }

  async function ensureUserPersonIdentity(userId, payload = null) {
    const current = (appData.app_users || []).find((item) => item.id === userId) || {};
    const source = { ...current, ...(payload || {}) };
    if (source.person_identity_id) {
      await updatePersonIdentity(source.person_identity_id, personIdentityPayloadFromUser(source));
      return source.person_identity_id;
    }
    const identity = await createPersonIdentity(personIdentityPayloadFromUser({ ...source, id: userId }));
    await repositoryUpdate('app_users', userId, { person_identity_id: identity.id });
    await writePersonIdentityAudit('created', {
      person_identity_id: identity.id,
      app_user_id: userId,
      reason: 'Identidad creada para usuario ERP',
      next_values: { app_user_id: userId }
    });
    return identity.id;
  }

  async function linkVolunteerUserIdentityRecords(volunteerId, userId, reason = 'Vinculacion verificada', preferredIdentityId = '') {
    assertPermission('users', 'edit');
    const volunteer = (appData.volunteers || []).find((item) => item.id === volunteerId);
    const user = (appData.app_users || []).find((item) => item.id === userId);
    if (!volunteer) throw new Error('No se ha encontrado el voluntario que se desea vincular.');
    if (!user) throw new Error('No se ha encontrado el usuario ERP que se desea vincular.');
    const existingIdentityId = preferredIdentityId || volunteer.person_identity_id || user.person_identity_id;
    if (volunteer.person_identity_id && user.person_identity_id && volunteer.person_identity_id !== user.person_identity_id && !preferredIdentityId) {
      throw new Error('El voluntario y el usuario ERP ya pertenecen a identidades distintas. Desvincule primero una de ellas antes de vincular.');
    }
    const volunteerPayload = personIdentityPayloadFromVolunteer(volunteer);
    const userPayload = personIdentityPayloadFromUser(user);
    const identityPayload = mergePersonIdentityPayloads(volunteerPayload, userPayload);
    const identityId = existingIdentityId || (await createPersonIdentity(identityPayload)).id;
    await updatePersonIdentity(identityId, identityPayload);
    await repositoryUpdate('volunteers', volunteerId, { person_identity_id: identityId });
    await repositoryUpdate('app_users', userId, { person_identity_id: identityId });
    await writePersonIdentityAudit('linked', {
      person_identity_id: identityId,
      volunteer_id: volunteerId,
      app_user_id: userId,
      reason,
      previous_values: { volunteer_person_identity_id: volunteer.person_identity_id || null, user_person_identity_id: user.person_identity_id || null },
      next_values: { person_identity_id: identityId }
    });
    await audit(`Identidad unica: vinculo voluntario ${volunteer.full_name || volunteerId} con usuario ${user.email || userId}`.trim());
    return identityId;
  }

  async function unlinkVolunteerUserIdentityRecords(volunteerId, userId, reason = 'Desvinculacion verificada') {
    assertPermission('users', 'edit');
    const volunteer = (appData.volunteers || []).find((item) => item.id === volunteerId);
    const user = (appData.app_users || []).find((item) => item.id === userId);
    if (!volunteer || !user) throw new Error('No se ha encontrado la relacion que se desea desvincular.');
    const identityId = volunteer.person_identity_id || user.person_identity_id || null;
    await repositoryUpdate('volunteers', volunteerId, { person_identity_id: null });
    await repositoryUpdate('app_users', userId, { person_identity_id: null });
    await writePersonIdentityAudit('unlinked', {
      person_identity_id: identityId,
      volunteer_id: volunteerId,
      app_user_id: userId,
      reason,
      previous_values: { person_identity_id: identityId },
      next_values: { volunteer_person_identity_id: null, user_person_identity_id: null }
    });
    await audit(`Identidad unica: desvinculo voluntario ${volunteer.full_name || volunteerId} de usuario ${user.email || userId}`.trim());
  }

  async function ensureUserVolunteerParticipation(userId, payload = {}, identityId = '', preferredVolunteerId = '', identityLinkDecision = '') {
    assertPermission('users', 'edit');
    const current = (appData.app_users || []).find((item) => item.id === userId) || {};
    const source = {
      ...current,
      ...payload,
      id: userId,
      person_identity_id: identityId || payload.person_identity_id || current.person_identity_id || ''
    };
    const resolvedIdentityId = source.person_identity_id || await ensureUserPersonIdentity(userId, source);
    const preferredVolunteer = preferredVolunteerId
      ? (appData.volunteers || []).find((volunteer) => volunteer.id === preferredVolunteerId)
      : null;
    if (preferredVolunteer) return preferredVolunteer;

    const linkedVolunteer = (appData.volunteers || []).find((volunteer) => volunteer.person_identity_id && volunteer.person_identity_id === resolvedIdentityId);
    if (linkedVolunteer) return linkedVolunteer;

    const matches = findVolunteerMatchesForUser({ ...source, person_identity_id: resolvedIdentityId }, appData.volunteers || []);
    const strongMatches = matches.filter(hasStrongVolunteerUserMatch);
    const continuesUnlinked = identityLinkDecision === 'continue-unlinked';
    if (strongMatches.length > 0 && !continuesUnlinked) {
      throw new Error('Ya existe un expediente de voluntario compatible. Vincule la identidad antes de activar la participacion como voluntario.');
    }
    if (matches.length > 0 && continuesUnlinked) {
      await writePersonIdentityAudit('updated', {
        person_identity_id: resolvedIdentityId,
        app_user_id: userId,
        reason: 'Coincidencia descartada manualmente - personas diferentes',
        previous_values: {
          matched_volunteers: matches.map(({ volunteer, reasons }) => ({
            volunteer_id: volunteer.id,
            volunteer_code: volunteer.code || null,
            reasons
          }))
        },
        next_values: { person_identity_id: resolvedIdentityId, participates_as_volunteer: true }
      });
    }

    const fullName = userFullName(source) || source.email || 'Usuario ERP';
    const today = new Date().toISOString().slice(0, 10);
    const createdVolunteer = await createVoluntarioService().create({
      code: nextVolunteerCodeForUserParticipation(appData.volunteers || []),
      full_name: fullName,
      document_id: source.document_id || '',
      phone: source.phone || '',
      email: source.email || '',
      status: 'Activo',
      joined_at: today,
      functions: source.position || source.role || 'Usuario ERP',
      availability: '',
      documentation: '',
      training: '',
      photo_data_url: '',
      person_identity_id: resolvedIdentityId,
      notes: 'Participacion como voluntario activada desde Usuario ERP.',
      created_at: `${today}T00:00:00`
    });

    await writePersonIdentityAudit('linked', {
      person_identity_id: resolvedIdentityId,
      volunteer_id: createdVolunteer?.id || null,
      app_user_id: userId,
      reason: 'Participa como voluntario desde Usuario ERP',
      previous_values: { app_user_id: userId, volunteer_id: null },
      next_values: { person_identity_id: resolvedIdentityId, volunteer_id: createdVolunteer?.id || null, participates_as_volunteer: true }
    });
    await audit(`Usuario ERP participa como voluntario: ${fullName}`.trim());
    return createdVolunteer;
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

  function createSocialResourceService(repositoryAdapter = createRepository()) {
    return new SocialResourceService({
      repository: new SocialResourceRepository({ dataStore, supabase, hasSupabaseConfig, repository: repositoryAdapter }),
      resources: appData.social_resources || [],
      links: appData.beneficiary_social_resources || [],
      portalAudience: appData.social_resource_portal_beneficiaries || [],
      sources: appData.social_resource_sources || [],
      detections: appData.social_resource_detections || [],
      beneficiaries: appData.beneficiaries || [],
      documents: appData.beneficiary_documents || [],
      audit,
      assertPermission,
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
      timeEntries: appData.volunteer_time_entries || [],
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
      resources: appData.social_resources || [],
      resourceLinks: appData.beneficiary_social_resources || [],
      portalAudience: appData.social_resource_portal_beneficiaries || [],
      communityPosts: appData.community_posts || [],
      communityInterests: appData.community_interests || [],
      communityReports: appData.community_post_reports || [],
      communityConversations: appData.community_conversations || [],
      communityMessages: appData.community_messages || [],
      communityPostRecommendations: appData.community_post_recommendations || [],
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

  async function trySendDonationThankYouEmail(donation, payload = {}, context = {}) {
    if (!donation?.id) return null;
    const email = String(donation.donor_email || payload.contact_email || payload.donor_email || '').trim();
    if (!email) {
      await audit(`Donaciones: justificante ${donation.id} sin envio automatico porque el donante no tiene email`);
      return null;
    }
    try {
      const result = await sendDonationThankYouEmail(donation.id, {
        donation,
        payload,
        context
      });
      await audit(`Donaciones: agradecimiento enviado a ${email}`);
      return result;
    } catch (error) {
      console.warn('[donaciones] No se pudo enviar el agradecimiento automatico:', error);
      await repositoryUpdate('donations', donation.id, {
        receipt_status: 'email_error',
        updated_at: new Date().toISOString()
      }).catch(() => null);
      await audit(`Donaciones: fallo envio agradecimiento ${donation.id}: ${error.message || 'error de correo'}`);
      return null;
    }
  }

  async function sendDonationThankYouEmail(donationId, options = {}) {
    const donation = options.donation
      || (appData.donations || []).find((item) => item.id === donationId);
    if (!donation?.id) throw new Error('No se ha encontrado la donacion.');
    const donor = findDonationDonor(donation, options.payload || {});
    const to = String(donation.donor_email || donor?.email || donor?.access_email || options.payload?.contact_email || '').trim();
    if (!to) throw new Error('El donante no tiene email para enviar el justificante.');
    const localData = buildDonationEmailData(donation, options.context || {});
    const { createDonationReceiptPdf } = await import('../lib/exporters');
    const { doc, filename, receiptNumber } = await createDonationReceiptPdf(
      donation,
      donor || { name: donation.donor, email: to },
      appData.organization_settings?.[0] || {},
      localData
    );
    const blob = doc.output('blob');
    const response = await sendEmailViaApi({
      to,
      subject: 'Gracias por su donacion - Pan y Esperanza',
      message: [
        `Estimado/a ${donation.donor || donor?.name || 'donante'},`,
        '',
        'Gracias por su colaboracion con Pan y Esperanza.',
        'Adjuntamos el justificante oficial de la donacion registrada.',
        '',
        'Su ayuda queda vinculada al sistema de trazabilidad de la asociacion para poder medir el impacto real generado.',
        '',
        'Muchas gracias por seguir llevando esperanza.'
      ].join('\n'),
      attachments: [{
        filename,
        blob,
        size: blob.size,
        contentType: 'application/pdf'
      }],
      organization: appData.organization_settings?.[0] || {},
      logEmail: true
    });
    await repositoryUpdate('donations', donation.id, {
      receipt_number: receiptNumber,
      receipt_generated_at: new Date().toISOString(),
      receipt_sent_at: new Date().toISOString(),
      receipt_status: 'sent',
      receipt_email_provider_id: response.id || null,
      receipt_email_log_id: response.emailLog?.id || null,
      updated_at: new Date().toISOString()
    });
    await reload();
    return response;
  }

  function findDonationDonor(donation = {}, payload = {}) {
    return (appData.donors || []).find((donor) => donor.id === donation.donor_id)
      || (appData.donors || []).find((donor) => normalize(donor.email || donor.access_email) === normalize(donation.donor_email || payload.contact_email))
      || (appData.donors || []).find((donor) => normalize(donor.name) === normalize(donation.donor || payload.donor_name))
      || null;
  }

  function buildDonationEmailData(donation = {}, context = {}) {
    const donationProduct = context.donationProduct;
    const inventoryMovement = context.inventoryMovement;
    return {
      ...appData,
      donation_products: donationProduct
        ? [donationProduct, ...(appData.donation_products || []).filter((item) => item.id !== donationProduct.id)]
        : appData.donation_products || [],
      inventory_movements: inventoryMovement
        ? [inventoryMovement, ...(appData.inventory_movements || []).filter((item) => item.id !== inventoryMovement.id)]
        : appData.inventory_movements || [],
      donations: [donation, ...(appData.donations || []).filter((item) => item.id !== donation.id)]
    };
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
      const donationPayload = {
        ...payload,
        reference,
        document_number: (isInternalDocumentType(payload.document_type) || isNoDocumentType(payload.document_type))
          ? payload.document_number
          : payload.document_number || reference
      };
      const result = await registerMonetaryEconomicOperation(donationPayload, {
        eventType: 'donation_money',
        direction: 'in',
        contactType: 'donor',
        contactName: payload.donor_name || payload.contact_name,
        defaultConcept: 'Donación monetaria',
        label: 'Donación monetaria',
        documentType: 'receipt',
        forceDocument: false
      });
      const donation = await createDonacionService().recordEconomicDonation(donationPayload);
      await repositoryUpdate('donations', donation.id, {
        accounting_event_id: result.event?.id || null,
        accounting_contact_id: result.contact?.id || donation.accounting_contact_id || null,
        updated_at: new Date().toISOString()
      });
      await updateAccountingEventSource(result.event, 'donations', donation.id);
      await trySendDonationThankYouEmail(donation, donationPayload);
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
      const { donation, donationProduct, inventoryMovement } = await createDonacionService().recordInKindDonation({
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
        donation_id: donation.id,
        donation_product_id: donationProduct?.id || null,
        inventory_item_id: item.id,
        contact_id: contact?.id || null,
        quantity,
        unit: item.unit || payload.inventory_unit || '',
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'create', null, socialEvent);
      if (donationProduct?.id) {
        await repositoryUpdate('donation_products', donationProduct.id, {
          accounting_event_id: event.id,
          social_value_event_id: socialEvent.id,
          updated_at: new Date().toISOString()
        });
      }
      await repositoryUpdate('donations', donation.id, {
        accounting_event_id: event.id,
        accounting_contact_id: contact?.id || null,
        inventory_item_id: item.id,
        inventory_movement_id: inventoryMovement?.id || null,
        updated_at: new Date().toISOString()
      });
      await updateAccountingEventSource(event, 'donations', donation.id);
      await trySendDonationThankYouEmail(donation, payload, {
        donationProduct,
        inventoryMovement,
        item
      });
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
    const socialResourceService = createSocialResourceService(repositoryAdapter);
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
    createSocialResource: async (payload) => {
      const created = await socialResourceService.createResource(payload);
      await reload();
      return created;
    },
    updateSocialResource: async (id, payload) => {
      const updated = await socialResourceService.updateResource(id, payload);
      await reload();
      return updated;
    },
    publishSocialResourceToPortal: async (id, payload) => {
      const updated = await socialResourceService.publishResourceToPortal(id, payload);
      await reload();
      return updated;
    },
    unpublishSocialResourceFromPortal: async (id) => {
      const updated = await socialResourceService.unpublishResourceFromPortal(id);
      await reload();
      return updated;
    },
    deleteSocialResource: async (id) => {
      await socialResourceService.deleteResource(id);
      await reload();
    },
    saveBeneficiarySocialResource: async (resourceId, beneficiaryId, payload) => {
      const linked = await socialResourceService.saveForBeneficiary(resourceId, beneficiaryId, payload);
      await reload();
      return linked;
    },
    deleteBeneficiarySocialResourceLink: async (id) => {
      await socialResourceService.deleteBeneficiaryLink(id);
      await reload();
    },
    createSocialResourceSource: async (payload) => {
      const created = await socialResourceService.createSource(payload);
      await reload();
      return created;
    },
    updateSocialResourceSource: async (id, payload) => {
      const updated = await socialResourceService.updateSource(id, payload);
      await reload();
      return updated;
    },
    deleteSocialResourceSource: async (id) => {
      await socialResourceService.deleteSource(id);
      await reload();
    },
    createSocialResourceDetection: async (payload) => {
      const created = await socialResourceService.createDetection(payload);
      await reload();
      return created;
    },
    approveSocialResourceDetection: async (id, payload) => {
      const result = await socialResourceService.approveDetection(id, payload);
      await reload();
      return result;
    },
    discardSocialResourceDetection: async (id, payload) => {
      const discarded = await socialResourceService.discardDetection(id, payload);
      await reload();
      return discarded;
    },
    checkSocialResourceSource: async (sourceId) => {
      assertPermission('social-resources', 'edit');
      const result = await runSocialResourceWatchdog({ sourceId });
      await reload();
      return result;
    },
    approveCommunityPost: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      const updated = await repositoryUpdate('community_posts', id, {
        status: 'approved',
        moderation_notes: String(payload.moderation_notes || payload.notes || post.moderation_notes || '').trim(),
        rejection_reason: '',
        reviewed_by: currentUser?.id || null,
        reviewed_by_name: currentUserName(),
        reviewed_at: new Date().toISOString()
      });
      try {
        await repositoryCreate('beneficiary_portal_notices', {
          beneficiary_id: updated.beneficiary_id,
          title: 'Publicacion aprobada',
          message: `Tu publicacion "${updated.title || 'Comunidad'}" ya esta visible en Comunidad.`,
          notice_type: 'community_post_approved',
          status: 'unread',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (noticeError) {
        console.warn('[Comunidad] No se pudo crear aviso de aprobacion en Portal Beneficiario:', noticeError);
      }
      await audit(`Comunidad: aprobo publicacion ${updated.title || updated.id}`.trim());
      await reload();
      return updated;
    },
    rejectCommunityPost: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const reason = String(payload.reason || payload.rejection_reason || '').trim();
      if (reason.length < 3) throw new Error('Indica un motivo de rechazo.');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      const updated = await repositoryUpdate('community_posts', id, {
        status: 'rejected',
        moderation_notes: String(payload.moderation_notes || '').trim(),
        rejection_reason: reason,
        reviewed_by: currentUser?.id || null,
        reviewed_by_name: currentUserName(),
        reviewed_at: new Date().toISOString()
      });
      try {
        await repositoryCreate('beneficiary_portal_notices', {
          beneficiary_id: updated.beneficiary_id,
          title: 'Publicacion rechazada',
          message: `Tu publicacion "${updated.title || 'Comunidad'}" no se ha aprobado. Motivo: ${reason}.`,
          notice_type: 'community_post_rejected',
          status: 'unread',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (noticeError) {
        console.warn('[Comunidad] No se pudo crear aviso de rechazo en Portal Beneficiario:', noticeError);
      }
      await audit(`Comunidad: rechazo publicacion ${updated.title || updated.id}`.trim());
      await reload();
      return updated;
    },
    withdrawCommunityPost: async (id) => {
      assertPermission('community-moderation', 'edit');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      const updated = await repositoryUpdate('community_posts', id, {
        status: 'withdrawn',
        withdrawn_at: new Date().toISOString(),
        reviewed_by: currentUser?.id || null,
        reviewed_by_name: currentUserName()
      });
      await audit(`Comunidad: retiro publicacion ${updated.title || updated.id}`.trim());
      await reload();
      return updated;
    },
    blockCommunityPost: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      const reason = String(payload.reason || payload.blocked_reason || '').trim();
      if (reason.length < 3) throw new Error('Indica el motivo del bloqueo.');
      const updated = await repositoryUpdate('community_posts', id, {
        status: 'blocked',
        blocked_reason: reason,
        blocked_at: new Date().toISOString(),
        blocked_by: currentUser?.id || null,
        blocked_by_name: currentUserName(),
        reviewed_by: currentUser?.id || null,
        reviewed_by_name: currentUserName()
      });
      await audit(`Comunidad: bloqueo publicacion ${updated.title || updated.id}`.trim());
      await reload();
      return updated;
    },
    recommendCommunityPost: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      if (post.status !== 'approved') throw new Error('Solo se pueden recomendar publicaciones aprobadas.');
      const beneficiaryIds = [...new Set((payload.beneficiary_ids || payload.beneficiaryIds || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
      if (!beneficiaryIds.length) throw new Error('Selecciona al menos un beneficiario.');
      const validBeneficiaryIds = new Set((appData.beneficiaries || []).map((item) => item.id));
      const notes = String(payload.notes || '').trim();
      const now = new Date().toISOString();
      const recommendations = [];

      for (const beneficiaryId of beneficiaryIds) {
        if (!validBeneficiaryIds.has(beneficiaryId)) continue;
        const current = (appData.community_post_recommendations || []).find((item) => item.post_id === id && item.beneficiary_id === beneficiaryId);
        const recommendationPayload = {
          post_id: id,
          beneficiary_id: beneficiaryId,
          recommended_by: currentUser?.id || null,
          recommended_by_name: currentUserName(),
          notes,
          status: 'active',
          updated_at: now
        };
        const recommendation = current
          ? await repositoryUpdate('community_post_recommendations', current.id, recommendationPayload)
          : await repositoryCreate('community_post_recommendations', { ...recommendationPayload, created_at: now });
        recommendations.push(recommendation);
        try {
          await repositoryCreate('beneficiary_portal_notices', {
            beneficiary_id: beneficiaryId,
            title: 'Publicacion recomendada',
            message: `El equipo de Pan y Esperanza ha recomendado para ti "${post.title || 'una publicacion'}" en Comunidad.`,
            notice_type: 'community_post_recommended',
            status: 'unread',
            created_at: now,
            updated_at: now
          });
        } catch (noticeError) {
          console.warn('[Comunidad] No se pudo crear aviso de recomendacion en Portal Beneficiario:', noticeError);
        }
      }

      if (!recommendations.length) throw new Error('No se pudo recomendar la publicacion a los beneficiarios seleccionados.');
      await audit(`Comunidad: recomendo publicacion ${post.title || id} a ${recommendations.length} beneficiarios`.trim());
      await reload();
      return recommendations;
    },
    updateCommunityInterestStatus: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const status = String(payload.status || '').trim();
      const interest = (appData.community_interests || []).find((item) => item.id === id);
      if (!interest) throw new Error('El interes de comunidad no existe.');
      const post = (appData.community_posts || []).find((item) => item.id === interest.post_id);
      const allowed = post?.category === 'offer'
        ? new Set(['new', 'reviewed', 'closed'])
        : new Set(['new', 'reviewed', 'referred', 'closed']);
      if (!allowed.has(status)) throw new Error('Estado de interes no valido para esta categoria.');
      const updated = await repositoryUpdate('community_interests', id, {
        status,
        status_notes: String(payload.status_notes || payload.notes || '').trim(),
        reviewed_by: currentUser?.id || null,
        reviewed_by_name: currentUserName(),
        reviewed_at: new Date().toISOString(),
        closed_at: status === 'closed' ? new Date().toISOString() : null
      });
      await audit(`Comunidad: actualizo interes ${updated.id} a ${status}`.trim());
      await reload();
      return updated;
    },
    updateCommunityPostResolution: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const allowed = new Set(['active', 'employment_filled', 'item_delivered', 'need_resolved', 'expired']);
      const resolutionStatus = String(payload.resolution_status || payload.status || '').trim();
      if (!allowed.has(resolutionStatus)) throw new Error('Estado de vigencia no valido.');
      const post = (appData.community_posts || []).find((item) => item.id === id);
      if (!post) throw new Error('La publicacion de comunidad no existe.');
      if (post.category === 'offer' && resolutionStatus === 'item_delivered') {
        throw new Error('El ERP no puede marcar un articulo como entregado. Solo puede hacerlo el propietario desde el Portal.');
      }
      const updated = await repositoryUpdate('community_posts', id, {
        resolution_status: resolutionStatus,
        resolution_notes: String(payload.resolution_notes || payload.notes || '').trim()
      });
      await audit(`Comunidad: actualizo vigencia de publicacion ${updated.title || updated.id} a ${resolutionStatus}`.trim());
      await reload();
      return updated;
    },
    updateCommunityConversationStatus: async (id, payload = {}) => {
      assertPermission('community-moderation', 'edit');
      const status = String(payload.status || '').trim();
      const allowed = new Set(['open', 'blocked', 'closed']);
      if (!allowed.has(status)) throw new Error('Estado de conversacion no valido.');
      const conversation = (appData.community_conversations || []).find((item) => item.id === id);
      if (!conversation) throw new Error('La conversacion de comunidad no existe.');
      const updated = await repositoryUpdate('community_conversations', id, {
        status,
        blocked_reason: status === 'blocked' ? String(payload.reason || payload.blocked_reason || conversation.blocked_reason || 'Bloqueada por moderacion').trim() : conversation.blocked_reason || '',
        closed_at: status === 'closed' || status === 'blocked' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });
      await audit(`Comunidad: actualizo conversacion ${updated.id} a ${status}`.trim());
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
      const identity = await createPersonIdentity(personIdentityPayloadFromVolunteer(payload));
      const created = await voluntarioService.create({ ...payload, person_identity_id: identity.id });
      if (created?.id) {
        await updatePersonIdentity(identity.id, personIdentityPayloadFromVolunteer({ ...payload, id: created.id }));
        await writePersonIdentityAudit('created', {
          person_identity_id: identity.id,
          volunteer_id: created.id,
          reason: 'Identidad creada al dar de alta voluntario',
          next_values: { volunteer_id: created.id }
        });
      }
      await reload();
      return created;
    },
    updateVolunteer: async (id, payload) => {
      const identityId = payload.person_identity_id || await ensureVolunteerPersonIdentity(id, payload);
      await updatePersonIdentity(identityId, personIdentityPayloadFromVolunteer({ ...payload, id }));
      const updated = await voluntarioService.update(id, { ...payload, person_identity_id: identityId });
      await reload();
      return updated;
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
    sendDonationThankYouEmail: async (donationId) => {
      return sendDonationThankYouEmail(donationId);
    },
    deleteVolunteer: async (id) => {
      await voluntarioService.remove(id);
      await reload();
    },
    createVolunteerHistory: async (payload) => {
      await voluntarioService.createHistory(payload);
      await reload();
    },
    createVolunteerDocument: async (payload) => {
      await voluntarioService.createDocument(payload);
      await reload();
    },
    updateVolunteerDocument: async (id, payload) => {
      await voluntarioService.updateDocument(id, payload);
      await reload();
    },
    deleteVolunteerDocument: async (id) => {
      await voluntarioService.removeDocument(id);
      await reload();
    },
    createVolunteerTraining: async (payload) => {
      await voluntarioService.createTraining(payload);
      await reload();
    },
    updateVolunteerTraining: async (id, payload) => {
      await voluntarioService.updateTraining(id, payload);
      await reload();
    },
    deleteVolunteerTraining: async (id) => {
      await voluntarioService.removeTraining(id);
      await reload();
    },
    toggleVolunteerAttendance: async (payload = {}) => {
      assertPermission('volunteers', 'edit');
      const volunteerId = String(payload.volunteer_id || payload.volunteerId || '').trim();
      const volunteer = (appData.volunteers || []).find((item) => item.id === volunteerId);
      if (!volunteer) throw new Error('No se ha localizado el voluntario para fichar.');
      const openEntry = (appData.volunteer_time_entries || [])
        .filter((entry) => entry.volunteer_id === volunteer.id && entry.status === 'open' && !entry.check_out_at)
        .sort((left, right) => new Date(right.check_in_at || 0) - new Date(left.check_in_at || 0))[0];
      const now = new Date().toISOString();
      const actorName = currentUserName();
      const actorId = currentUser?.id || null;

      if (openEntry) {
        const totalMinutes = minutesBetween(openEntry.check_in_at, now);
        const incidentType = totalMinutes > 720 ? 'Fichaje excesivamente largo' : '';
        const updated = await voluntarioService.updateTimeEntry(openEntry.id, {
          ...openEntry,
          check_out_at: now,
          total_minutes: totalMinutes,
          status: incidentType ? 'incident' : 'closed',
          incident_type: incidentType,
          registered_by_user_id: actorId,
          registered_by_name: actorName,
          notes: [openEntry.notes, incidentType].filter(Boolean).join(' | ')
        });
        await voluntarioService.createHistory({
          volunteer_id: volunteer.id,
          date: now.slice(0, 10),
          activity: `Participo en ${updated.activity_label || updated.activity_type || 'voluntariado'} · ${formatVolunteerMinutes(totalMinutes)}`,
          hours: Math.round((totalMinutes / 60) * 100) / 100,
          notes: JSON.stringify({
            source: 'volunteer_time_entries',
            time_entry_id: updated.id,
            method: updated.method,
            check_in_at: updated.check_in_at,
            check_out_at: updated.check_out_at,
            registered_by_name: updated.registered_by_name
          })
        });
        await reload();
        return { type: 'exit', volunteer, entry: updated, message: 'SALIDA registrada' };
      }

      const created = await voluntarioService.createTimeEntry({
        volunteer_id: volunteer.id,
        person_identity_id: volunteer.person_identity_id || payload.person_identity_id || null,
        activity_type: payload.activity_type || 'General',
        activity_label: payload.activity_label || payload.activity_type || 'Voluntariado',
        linked_entity_type: payload.linked_entity_type || '',
        linked_entity_id: payload.linked_entity_id || null,
        check_in_at: now,
        method: payload.method || 'manual',
        credential_uid: payload.credential_uid || '',
        device_info: payload.device_info || '',
        registered_by_user_id: actorId,
        registered_by_name: actorName,
        status: 'open'
      });
      await reload();
      return { type: 'entry', volunteer, entry: created, message: 'ENTRADA registrada' };
    },
    correctVolunteerAttendance: async (id, payload = {}) => {
      assertPermission('volunteers', 'edit');
      const currentEntry = (appData.volunteer_time_entries || []).find((entry) => entry.id === id);
      if (!currentEntry) throw new Error('No se ha localizado el fichaje que quieres corregir.');
      const reason = String(payload.reason || '').trim();
      if (!reason) throw new Error('Indica el motivo de la correccion.');
      const nextValues = {
        ...currentEntry,
        ...payload,
        total_minutes: payload.check_in_at && payload.check_out_at ? minutesBetween(payload.check_in_at, payload.check_out_at) : currentEntry.total_minutes,
        status: payload.status || (payload.check_out_at ? 'corrected' : currentEntry.status),
        incident_type: payload.incident_type || ''
      };
      delete nextValues.reason;
      const updated = await voluntarioService.updateTimeEntry(id, nextValues);
      await voluntarioService.createTimeEntryCorrection({
        time_entry_id: id,
        volunteer_id: currentEntry.volunteer_id,
        previous_values: currentEntry,
        next_values: updated,
        reason,
        corrected_by_user_id: currentUser?.id || null,
        corrected_by_name: currentUserName()
      });
      await reload();
      return updated;
    },
    updateOrganizationSettings: async (payload) => {
      await configuracionService.saveSettings(payload);
      await reload();
    },
    createUser: async (payload) => {
      const { linked_volunteer_id: linkedVolunteerId, identity_link_decision: identityLinkDecision, ...userPayload } = payload || {};
      let identityId = userPayload.person_identity_id || '';
      let linkedVolunteer = null;
      if (linkedVolunteerId) {
        linkedVolunteer = (appData.volunteers || []).find((item) => item.id === linkedVolunteerId) || null;
        identityId = await ensureVolunteerPersonIdentity(linkedVolunteerId);
      }
      if (!identityId) {
        const identity = await createPersonIdentity(personIdentityPayloadFromUser(userPayload));
        identityId = identity.id;
      } else {
        const basePayload = linkedVolunteer
          ? mergePersonIdentityPayloads(personIdentityPayloadFromVolunteer(linkedVolunteer), personIdentityPayloadFromUser(userPayload))
          : personIdentityPayloadFromUser(userPayload);
        await updatePersonIdentity(identityId, basePayload);
      }
      const shouldParticipateAsVolunteer = Boolean(userPayload.participates_as_volunteer);
      const createdUser = await usuarioService.create({
        ...userPayload,
        participates_as_volunteer: shouldParticipateAsVolunteer ? false : userPayload.participates_as_volunteer,
        person_identity_id: identityId
      });
      let finalUser = createdUser;
      if (createdUser?.id) {
        await updatePersonIdentity(identityId, personIdentityPayloadFromUser({ ...userPayload, id: createdUser.id }));
        if (linkedVolunteerId) {
          await repositoryUpdate('app_users', createdUser.id, { person_identity_id: identityId });
          await writePersonIdentityAudit('linked', {
            person_identity_id: identityId,
            volunteer_id: linkedVolunteerId,
            app_user_id: createdUser.id,
            reason: identityLinkDecision || 'Vinculado al crear usuario ERP',
            previous_values: { volunteer_person_identity_id: linkedVolunteer?.person_identity_id || null, user_person_identity_id: null },
            next_values: { person_identity_id: identityId }
          });
          await audit(`Identidad unica: vinculo voluntario ${linkedVolunteer?.full_name || linkedVolunteerId} con usuario ${createdUser.email || createdUser.id}`.trim());
        } else {
          await writePersonIdentityAudit('created', {
            person_identity_id: identityId,
            app_user_id: createdUser.id,
            reason: identityLinkDecision || 'Identidad creada al dar de alta usuario ERP',
            next_values: { app_user_id: createdUser.id }
          });
        }
        if (shouldParticipateAsVolunteer) {
          await ensureUserVolunteerParticipation(createdUser.id, { ...userPayload, id: createdUser.id }, identityId, linkedVolunteerId, identityLinkDecision);
          finalUser = await usuarioService.update(createdUser.id, { ...userPayload, person_identity_id: identityId, participates_as_volunteer: true });
        }
      }
      await reload();
      return finalUser;
    },
    sendUserWelcomeEmail: async (user, organization, logoUrl) => {
      await usuarioService.sendWelcomeEmail(user, organization, logoUrl);
    },
    updateUser: async (id, payload) => {
      const { linked_volunteer_id: linkedVolunteerId, identity_link_decision: identityLinkDecision, ...userPayload } = payload || {};
      const identityId = linkedVolunteerId
        ? await linkVolunteerUserIdentityRecords(linkedVolunteerId, id, identityLinkDecision || 'Vinculado al editar usuario ERP', userPayload.person_identity_id || '')
        : (userPayload.person_identity_id || await ensureUserPersonIdentity(id, userPayload));
      await updatePersonIdentity(identityId, personIdentityPayloadFromUser({ ...userPayload, id }));
      if (userPayload.participates_as_volunteer) {
        await ensureUserVolunteerParticipation(id, { ...userPayload, id }, identityId, linkedVolunteerId, identityLinkDecision);
      }
      const updated = await usuarioService.update(id, { ...userPayload, person_identity_id: identityId });
      await reload();
      return updated;
    },
    linkVolunteerUserIdentity: async ({ volunteerId, userId, reason }) => {
      const identityId = await linkVolunteerUserIdentityRecords(volunteerId, userId, reason);
      await reload();
      return identityId;
    },
    unlinkVolunteerUserIdentity: async ({ volunteerId, userId, reason }) => {
      await unlinkVolunteerUserIdentityRecords(volunteerId, userId, reason);
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

function nextVolunteerCodeForUserParticipation(volunteers = []) {
  const year = String(new Date().getFullYear());
  const usedCodes = new Set(
    volunteers
      .map((volunteer) => String(volunteer.code || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const highest = Array.from(usedCodes).reduce((max, code) => {
    const match = code.match(new RegExp(`^VOL-${year}-(\\d{4})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  let next = highest + 1;
  let candidate = `VOL-${year}-${String(next).padStart(4, '0')}`;
  while (usedCodes.has(candidate)) {
    next += 1;
    candidate = `VOL-${year}-${String(next).padStart(4, '0')}`;
  }
  return candidate;
}

function minutesBetween(start, end) {
  const startDate = new Date(start || 0);
  const endDate = new Date(end || 0);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function formatVolunteerMinutes(minutes = 0) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (!hours) return `${mins} min`;
  return `${hours} h ${String(mins).padStart(2, '0')} min`;
}
function enrichPersonIdentityData(data = {}) {
  const identities = data.person_identities || [];
  if (!identities.length) return data;
  const byId = new Map(identities.map((identity) => [identity.id, identity]));

  return {
    ...data,
    volunteers: (data.volunteers || []).map((volunteer) => applyPersonIdentityToVolunteer(volunteer, byId.get(volunteer.person_identity_id))),
    app_users: (data.app_users || []).map((user) => applyPersonIdentityToUser(user, byId.get(user.person_identity_id)))
  };
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
