import { getUserStatus } from '../../lib/auth';
import { formatDate, normalize, todayISO } from '../../lib/formatters';
import { PriorityEngineService } from '../priorities/PriorityEngineService';

const STALE_HELP_DAYS = 30;
const EXPIRY_WINDOW_DAYS = 30;

export class DashboardService {
  constructor({
    beneficiarioService = null,
    inventarioService = null,
    entregaService = null,
    donacionService = null,
    voluntarioService = null,
    recursoService = null,
    notificacionService = null,
    agendaOperativaService = null,
    priorityEngineService = null
  } = {}) {
    this.configureIntegrations({
      beneficiarioService,
      inventarioService,
      entregaService,
      donacionService,
      voluntarioService,
      recursoService,
      notificacionService,
      agendaOperativaService,
      priorityEngineService
    });
  }

  configureIntegrations({
    beneficiarioService = this.beneficiarioService,
    inventarioService = this.inventarioService,
    entregaService = this.entregaService,
    donacionService = this.donacionService,
    voluntarioService = this.voluntarioService,
    recursoService = this.recursoService,
    notificacionService = this.notificacionService,
    agendaOperativaService = this.agendaOperativaService,
    priorityEngineService = this.priorityEngineService
  } = {}) {
    this.beneficiarioService = beneficiarioService;
    this.inventarioService = inventarioService;
    this.entregaService = entregaService;
    this.donacionService = donacionService;
    this.voluntarioService = voluntarioService;
    this.recursoService = recursoService;
    this.notificacionService = notificacionService;
    this.agendaOperativaService = agendaOperativaService;
    this.priorityEngineService = priorityEngineService;
    return this;
  }

  buildOperationsCenter({ data = {}, today = todayISO(), pendingPasswordResets = null } = {}) {
    const operations = buildOperations(data, today, pendingPasswordResets);
    const priorityEngine = this.resolvePriorityEngine();
    const systemPriorities = priorityEngine.generate({ data, today, operations });
    return {
      ...operations,
      systemPriorities,
      integrations: this.integrations()
    };
  }

  integrations() {
    return {
      beneficiarioService: Boolean(this.beneficiarioService),
      inventarioService: Boolean(this.inventarioService),
      entregaService: Boolean(this.entregaService),
      donacionService: Boolean(this.donacionService),
      voluntarioService: Boolean(this.voluntarioService),
      recursoService: Boolean(this.recursoService),
      notificacionService: Boolean(this.notificacionService),
      agendaOperativaService: Boolean(this.agendaOperativaService),
      priorityEngineService: Boolean(this.priorityEngineService)
    };
  }

  resolvePriorityEngine() {
    if (this.priorityEngineService) {
      this.priorityEngineService.configureIntegrations?.({
        notificacionService: this.notificacionService,
        agendaOperativaService: this.agendaOperativaService,
        dashboardService: this
      });
      return this.priorityEngineService;
    }
    return new PriorityEngineService({
      notificacionService: this.notificacionService,
      agendaOperativaService: this.agendaOperativaService,
      dashboardService: this
    });
  }
  async notifyDeliveryChanged() {
    return true;
  }

  async notifyDonationChanged() {
    return true;
  }

  async notifyVolunteerChanged() {
    return true;
  }

  async notifyConfigurationChanged() {
    return true;
  }

  async notifyNotificationChanged() {
    return true;
  }

  async notifyAgendaChanged() {
    return true;
  }

  async notifyCampaignChanged() {
    return true;
  }
}

function buildOperations(data, today, pendingPasswordResets) {
  const activeDeliveries = (data.deliveries || []).filter((item) => item.status !== 'Anulada');
  const activeBeneficiaries = (data.beneficiaries || []).filter((item) => item.is_active);
  const latestDeliveryByBeneficiary = latestDeliveriesMap(activeDeliveries);
  const priorityFamilies = buildFamilyPriorities(data, activeDeliveries, latestDeliveryByBeneficiary, today);
  const criticalFamilies = priorityFamilies.filter((item) => item.priorityLevel === 'Critica');
  const urgentFamilies = priorityFamilies.filter((item) => ['Critica', 'Alta'].includes(item.priorityLevel));
  const staleBeneficiaries = activeBeneficiaries.filter((beneficiary) => {
    const latest = beneficiary.last_help_at || latestDeliveryByBeneficiary.get(beneficiary.id)?.delivered_at;
    const reference = latest || beneficiary.joined_at || beneficiary.created_at;
    const days = daysBetween(reference, today);
    return Number.isFinite(days) && days >= STALE_HELP_DAYS;
  });
  const inventoryItems = data.inventory_items || [];
  const outOfStock = inventoryItems.filter((item) => Number(item.stock || 0) <= 0);
  const lowStock = inventoryItems.filter((item) => Number(item.stock || 0) > 0 && Number(item.stock || 0) <= Number(item.low_stock_threshold || 0));
  const criticalStock = inventoryItems.filter((item) => Number(item.stock || 0) <= Number(item.low_stock_threshold || 0));
  const expiringSoon = inventoryItems
    .filter((item) => {
      const days = daysBetween(today, item.expires_at);
      return Number.isFinite(days) && days <= EXPIRY_WINDOW_DAYS;
    })
    .sort((a, b) => daysBetween(today, a.expires_at) - daysBetween(today, b.expires_at));
  const pendingEmails = (data.email_logs || []).filter(isPendingEmail);
  const pendingReceipts = activeDeliveries.filter(isPendingReceipt);
  const todayDeliveries = activeDeliveries.filter((item) => toDateKey(item.delivered_at) === today);
  const newBeneficiaries = activeBeneficiaries.filter((item) => toDateKey(item.joined_at || item.created_at) === today);
  const pendingDonations = (data.donations || []).filter(isPendingDonation);
  const accountingEventsById = new Map((data.accounting_events || []).map((event) => [event.id, event]));
  const loanRecords = activeAccountingRows(data.loan_records || [], accountingEventsById);
  const loanRecordIds = new Set(loanRecords.map((loan) => loan.id));
  const loanMovements = activeAccountingRows(data.loan_movements || [], accountingEventsById).filter((movement) => loanRecordIds.has(movement.loan_id));
  const debtRecords = activeAccountingRows(data.debt_records || [], accountingEventsById);
  const debtRecordIds = new Set(debtRecords.map((debt) => debt.id));
  const debtMovements = activeAccountingRows(data.debt_movements || [], accountingEventsById).filter((movement) => debtRecordIds.has(movement.debt_id));
  const pendingLoans = loanRecords
    .map((loan) => ({ ...loan, outstanding: loanOutstanding(loan, loanMovements) }))
    .filter((loan) => loan.outstanding > 0);
  const pendingDebts = debtRecords
    .map((debt) => ({ ...debt, outstanding: debtOutstanding(debt, debtMovements) }))
    .filter((debt) => debt.outstanding > 0);
  const overdueDebts = pendingDebts.filter((debt) => {
    const days = daysBetween(today, debt.due_at);
    return debt.due_at && Number.isFinite(days) && days < 0;
  });
  const upcomingDebtPayments = pendingDebts.filter((debt) => {
    const days = daysBetween(today, debt.due_at);
    return debt.due_at && Number.isFinite(days) && days >= 0 && days <= 14;
  });
  const pendingBeneficiaries = buildPendingBeneficiaries(data, staleBeneficiaries, newBeneficiaries, latestDeliveryByBeneficiary);
  const recentDonations = sortByRecent(data.donations || [], ['donated_at', 'created_at']).slice(0, 6);
  const availableVolunteers = (data.volunteers || [])
    .filter((volunteer) => isActiveVolunteer(volunteer) && String(volunteer.availability || '').trim())
    .slice(0, 6);
  const pendingResources = (data.recursos || [])
    .filter(isPendingResource)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .slice(0, 6);
  const activeCampaigns = (data.campanas || [])
    .filter((campaign) => ['Activa', 'Planificada'].includes(campaign.status))
    .sort((a, b) => String(a.start_date || a.created_at || '').localeCompare(String(b.start_date || b.created_at || '')))
    .slice(0, 8);
  const unreadNotifications = (data.notificaciones || [])
    .filter((notification) => !notification.leida && notification.estado !== 'Archivada')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 8);
  const todayAgenda = buildTodayAgenda(data, today, todayDeliveries);
  const recentActivity = buildRecentActivity(data).slice(0, 8);
  const criticalProducts = [...outOfStock, ...lowStock, ...expiringSoon]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 8);

  const operations = {
    activeDeliveries,
    activeBeneficiaries,
    priorityFamilies,
    criticalFamilies,
    urgentFamilies,
    staleBeneficiaries,
    outOfStock,
    lowStock,
    criticalStock,
    criticalProducts,
    expiringSoon,
    pendingEmails,
    pendingReceipts,
    todayDeliveries,
    newBeneficiaries,
    pendingBeneficiaries,
    pendingDonations,
    recentDonations,
    availableVolunteers,
    pendingResources,
    activeCampaigns,
    unreadNotifications,
    todayAgenda,
    recentActivity,
    pendingLoans,
    pendingLoanAmount: pendingLoans.reduce((total, loan) => total + Number(loan.outstanding || 0), 0),
    pendingDebts,
    pendingDebtAmount: pendingDebts.reduce((total, debt) => total + Number(debt.outstanding || 0), 0),
    overdueDebts,
    upcomingDebtPayments,
    pendingPasswordResets,
    summary: buildSummary(data, activeDeliveries, today)
  };

  return {
    ...operations,
    daySummary: buildDaySummary(operations),
    aiPanel: buildAIPanel(operations)
  };
}

function buildSummary(data, activeDeliveries, today) {
  const month = today.slice(0, 7);
  return {
    activeBeneficiaries: (data.beneficiaries || []).filter((item) => item.is_active).length,
    activeFamilies: (data.families || []).length,
    deliveriesThisMonth: activeDeliveries.filter((item) => String(item.delivered_at || '').startsWith(month)).length,
    activeUsers: (data.app_users || []).filter((user) => getUserStatus(user) === 'Activo').length
  };
}

function buildDaySummary(operations) {
  return [
    { label: 'Agenda de hoy', value: operations.todayAgenda.length },
    { label: 'Entregas de hoy', value: operations.todayDeliveries.length },
    { label: 'Notificaciones', value: operations.unreadNotifications.length },
    { label: 'Campanas activas', value: operations.activeCampaigns.length },
    { label: 'Productos criticos', value: operations.criticalProducts.length },
    { label: 'Beneficiarios pendientes', value: operations.pendingBeneficiaries.length },
    { label: 'Voluntarios disponibles', value: operations.availableVolunteers.length }
  ];
}

function buildTodayAgenda(data, today, todayDeliveries) {
  const agendaEvents = (data.agenda_operativa || [])
    .filter((event) => toDateKey(event.event_at || event.created_at) === today)
    .map((event) => ({
      id: event.id,
      title: event.title,
      detail: [event.event_type, event.responsible].filter(Boolean).join(' - '),
      date: event.event_at,
      status: event.status || 'Pendiente',
      moduleId: 'agenda'
    }));
  const deliveryEvents = todayDeliveries.map((delivery) => ({
    id: `delivery-${delivery.id}`,
    title: delivery.beneficiary_name || delivery.receiver_name || 'Entrega registrada',
    detail: delivery.help_type || 'Entrega de hoy',
    date: delivery.delivered_at,
    status: delivery.status || 'Registrada',
    moduleId: 'deliveries'
  }));
  return [...agendaEvents, ...deliveryEvents].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, 8);
}

function buildPendingBeneficiaries(data, staleBeneficiaries, newBeneficiaries, latestDeliveryByBeneficiary) {
  const documents = data.beneficiary_documents || [];
  const pendingDocsByBeneficiary = new Set(documents
    .filter((doc) => !doc.file_data_url || normalize(doc.notes).includes('pendiente'))
    .map((doc) => doc.beneficiary_id)
    .filter(Boolean));
  const byId = new Map();
  for (const beneficiary of [...staleBeneficiaries, ...newBeneficiaries]) {
    byId.set(beneficiary.id, {
      ...beneficiary,
      pending_reason: staleBeneficiaries.some((item) => item.id === beneficiary.id)
        ? 'Sin ayuda reciente'
        : 'Alta reciente'
    });
  }
  for (const beneficiary of (data.beneficiaries || []).filter((item) => pendingDocsByBeneficiary.has(item.id))) {
    byId.set(beneficiary.id, { ...beneficiary, pending_reason: 'Documentacion pendiente' });
  }
  return [...byId.values()]
    .map((beneficiary) => ({
      ...beneficiary,
      latest_delivery_at: beneficiary.last_help_at || latestDeliveryByBeneficiary.get(beneficiary.id)?.delivered_at || ''
    }))
    .sort((a, b) => String(a.latest_delivery_at || '').localeCompare(String(b.latest_delivery_at || '')))
    .slice(0, 8);
}

function buildRecentActivity(data) {
  const activity = [
    ...(data.deliveries || []).map((item) => ({
      id: `delivery-${item.id}`,
      title: 'Entrega',
      detail: item.beneficiary_name || item.receiver_name || item.help_type || 'Entrega registrada',
      date: item.delivered_at || item.created_at,
      moduleId: 'deliveries'
    })),
    ...(data.donations || []).map((item) => ({
      id: `donation-${item.id}`,
      title: 'Donacion',
      detail: item.donor || item.donation_type || 'Donacion registrada',
      date: item.donated_at || item.created_at,
      moduleId: 'donations'
    })),
    ...(data.inventory_movements || []).map((item) => ({
      id: `inventory-${item.id}`,
      title: 'Inventario',
      detail: item.product_name || item.item_name || item.type || 'Movimiento registrado',
      date: item.moved_at || item.created_at,
      moduleId: 'inventory'
    })),
    ...(data.beneficiaries || []).map((item) => ({
      id: `beneficiary-${item.id}`,
      title: 'Beneficiario',
      detail: item.full_name || item.code || 'Expediente actualizado',
      date: item.updated_at || item.joined_at || item.created_at,
      moduleId: 'beneficiaries'
    })),
    ...(data.notificaciones || []).map((item) => ({
      id: `notification-${item.id}`,
      title: item.origen || 'Notificacion',
      detail: item.titulo || item.mensaje || 'Aviso registrado',
      date: item.created_at,
      moduleId: 'notifications'
    }))
  ];
  return sortByRecent(activity, ['date']);
}

function buildAIPanel(operations) {
  const alerts = [
    operations.criticalFamilies.length > 0 && `${operations.criticalFamilies.length} familias criticas`,
    operations.criticalProducts.length > 0 && `${operations.criticalProducts.length} productos criticos`,
    operations.unreadNotifications.length > 0 && `${operations.unreadNotifications.length} notificaciones pendientes`,
    operations.activeCampaigns.length > 0 && `${operations.activeCampaigns.length} campanas activas`,
    operations.expiringSoon.length > 0 && `${operations.expiringSoon.length} caducidades proximas`,
    operations.pendingResources.length > 0 && `${operations.pendingResources.length} recursos pendientes`,
    operations.availableVolunteers.length > 0 && `${operations.availableVolunteers.length} voluntarios disponibles`
  ].filter(Boolean);
  return {
    status: 'Preparado',
    summary: alerts.length
      ? `Panel preparado para resumir ${alerts.join(', ')} cuando se active IA.`
      : 'Panel preparado para generar resumen inteligente cuando se active IA.',
    recommendations: [
      operations.criticalProducts.length > 0 ? 'Priorizar productos agotados o proximos a caducar.' : 'Mantener seguimiento preventivo de inventario.',
      operations.pendingBeneficiaries.length > 0 ? 'Revisar expedientes pendientes antes de planificar entregas.' : 'No hay expedientes pendientes destacados.',
      operations.todayAgenda.length > 0 ? 'Usar la agenda del dia para ordenar responsables y tareas.' : 'Planificar la jornada desde Agenda Operativa si aparecen nuevas necesidades.'
    ]
  };
}

function buildFamilyPriorities(data, activeDeliveries, latestDeliveryByBeneficiary, today) {
  const groups = new Map();
  (data.families || []).forEach((family) => {
    groups.set(`family-${family.id}`, {
      id: `family-${family.id}`,
      family,
      beneficiaries: [],
      moduleId: 'families'
    });
  });

  (data.beneficiaries || []).filter((item) => item.is_active).forEach((beneficiary) => {
    const key = beneficiary.family_id && groups.has(`family-${beneficiary.family_id}`)
      ? `family-${beneficiary.family_id}`
      : `beneficiary-${beneficiary.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        family: null,
        beneficiaries: [],
        moduleId: 'beneficiaries'
      });
    }
    groups.get(key).beneficiaries.push(beneficiary);
  });

  return [...groups.values()]
    .map((group) => enrichFamilyGroup(group, activeDeliveries, latestDeliveryByBeneficiary, today))
    .filter((group) => group.priorityScore >= 25)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.membersCount - a.membersCount);
}

function enrichFamilyGroup(group, activeDeliveries, latestDeliveryByBeneficiary, today) {
  const beneficiaries = group.beneficiaries;
  const memberFallback = Math.max(...beneficiaries.map((item) => Number(item.family_members || 1)), 0);
  const membersCount = Math.max(beneficiaries.length, memberFallback, Number(group.family?.dependents_count || 0)) || 1;
  const minorsCount = beneficiaries.length
    ? beneficiaries.reduce((sum, item) => sum + Number(item.minors_count || 0), 0)
    : Number(group.family?.dependents_count || 0);
  const beneficiaryIds = new Set(beneficiaries.map((item) => item.id));
  const latestDelivery = activeDeliveries
    .filter((delivery) => beneficiaryIds.has(delivery.beneficiary_id))
    .sort((a, b) => String(b.delivered_at || '').localeCompare(String(a.delivered_at || '')))[0];
  const latestFromBeneficiaries = beneficiaries
    .map((item) => item.last_help_at || latestDeliveryByBeneficiary.get(item.id)?.delivered_at)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0];
  const latestHelpAt = latestDelivery?.delivered_at || latestFromBeneficiaries || '';
  const reference = latestHelpAt || beneficiaries.map((item) => item.joined_at || item.created_at).filter(Boolean).sort()[0];
  const daysWithoutHelp = daysBetween(reference, today);
  const situations = beneficiaries.map((item) => normalize(item.situation));
  const hasUrgentSituation = situations.some((item) => item.includes('urgente'));
  const hasPrioritySituation = situations.some((item) => item.includes('prioritario') || item.includes('vulnerable'));
  const primaryBeneficiary = beneficiaries.find((item) => normalize(item.situation).includes('urgente'))
    || beneficiaries.find((item) => normalize(item.situation).includes('prioritario'))
    || beneficiaries[0]
    || null;
  const reasons = [];
  let priorityScore = 0;

  if (hasUrgentSituation) {
    priorityScore += 50;
    reasons.push('situacion urgente registrada');
  }
  if (hasPrioritySituation) {
    priorityScore += 35;
    reasons.push('situacion prioritaria o vulnerable');
  }
  if (!latestHelpAt && beneficiaries.length) {
    priorityScore += 35;
    reasons.push('sin ayudas registradas');
  }
  if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= 60) {
    priorityScore += 30;
    reasons.push(`${daysWithoutHelp} dias sin ayuda`);
  } else if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= STALE_HELP_DAYS) {
    priorityScore += 15;
    reasons.push(`${daysWithoutHelp} dias sin ayuda`);
  }
  if (minorsCount > 0) {
    priorityScore += 10;
    reasons.push(`${minorsCount} menores`);
  }
  if (minorsCount >= 3) priorityScore += 10;
  if (membersCount >= 5) {
    priorityScore += 10;
    reasons.push(`${membersCount} miembros`);
  }

  return {
    ...group,
    familyId: group.family?.id || primaryBeneficiary?.family_id || '',
    beneficiaryIds: beneficiaries.map((item) => item.id).filter(Boolean),
    primaryBeneficiaryId: primaryBeneficiary?.id || '',
    code: group.family?.family_code || beneficiaries[0]?.code || '',
    name: group.family?.responsible_name || beneficiaries[0]?.full_name || 'Familia sin nombre',
    membersCount,
    minorsCount,
    daysWithoutHelp,
    daysWithoutHelpText: Number.isFinite(daysWithoutHelp) ? String(daysWithoutHelp) : 'Sin registro',
    lastHelpText: latestHelpAt ? formatDate(latestHelpAt) : 'Sin ayuda registrada',
    priorityReason: sentenceCase(reasons[0] || 'seguimiento social'),
    priorityScore,
    priorityLevel: priorityLevel(priorityScore)
  };
}

function priorityLevel(score) {
  if (score >= 70) return 'Critica';
  if (score >= 45) return 'Alta';
  if (score >= 25) return 'Media';
  return 'Normal';
}

function latestDeliveriesMap(deliveries) {
  return deliveries.reduce((acc, delivery) => {
    const current = acc.get(delivery.beneficiary_id);
    if (!current || String(delivery.delivered_at || '') > String(current.delivered_at || '')) {
      acc.set(delivery.beneficiary_id, delivery);
    }
    return acc;
  }, new Map());
}

function isPendingReceipt(delivery) {
  return !delivery.receipt_number || !delivery.signature_data_url;
}

function isPendingEmail(log) {
  const status = normalize(log.status || '');
  const result = normalize(log.result || '');
  return status.includes('pendiente') || status.includes('pending') || result.includes('pendiente') || result.includes('pending');
}

function isPendingDonation(donation) {
  if (donation.is_pending === true) return true;
  const status = normalize(donation.status || donation.state || donation.delivery_status || '');
  return ['pendiente', 'pending', 'solicitada', 'comprometida'].includes(status);
}

function isPendingResource(resource) {
  const status = normalize(resource.status || resource.estado || '');
  return resource.publicado !== true || ['draft', 'borrador', 'unpublished', 'despublicado', 'pendiente'].includes(status);
}

function isActiveVolunteer(volunteer) {
  const status = normalize(volunteer.status || volunteer.estado || volunteer.notes || '');
  return !status.includes('archivad') && !status.includes('inactiv') && !status.includes('baja');
}

function activeAccountingRows(rows, eventsById) {
  return rows.filter((row) => !isInactiveAccounting(row) && !isInactiveAccounting(eventsById.get(row.accounting_event_id)));
}

function isInactiveAccounting(row) {
  const status = normalize(row?.status || row?.state || '');
  return status.includes('void')
    || status.includes('anulad')
    || status.includes('cancel')
    || status.includes('correct')
    || status.includes('corregid')
    || status.includes('revers')
    || status.includes('revert');
}

function loanOutstanding(loan, movements) {
  const paid = movements
    .filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received')
    .reduce((total, movement) => total + Number(movement.amount || 0), 0);
  return Math.max(0, Number(loan.principal_amount || 0) - paid);
}

function debtOutstanding(debt, movements) {
  const paid = movements
    .filter((movement) => movement.debt_id === debt.id)
    .reduce((total, movement) => total + Number(movement.amount || 0), 0);
  return Math.max(0, Number(debt.original_amount || 0) - paid);
}

function daysBetween(from, to) {
  if (!from || !to) return Number.NaN;
  const start = new Date(toDateKey(from));
  const end = new Date(toDateKey(to));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function toDateKey(value) {
  return value ? String(value).slice(0, 10) : '';
}

function sortByRecent(items, fields) {
  return [...items].sort((a, b) => {
    const aDate = fields.map((field) => a[field]).find(Boolean) || '';
    const bDate = fields.map((field) => b[field]).find(Boolean) || '';
    return String(bDate).localeCompare(String(aDate));
  });
}

function sentenceCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
