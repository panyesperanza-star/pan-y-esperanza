import { buildAIRequest, getAIUseCase, getAIUseCases, getAIUseCasesByModule } from './prompts/useCases';
import { createAIProvider, NOOP_AI_PROVIDER, SUPPORTED_AI_PROVIDERS } from './providers';

function cleanText(value) {
  return String(value || '').trim();
}

function userLabel(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Sistema';
}

export class IAService {
  constructor({
    repository,
    audit = async () => {},
    currentUser = null,
    configuracionService = null,
    providerFactory = createAIProvider
  } = {}) {
    if (!repository) throw new Error('IAService necesita un repository.');
    this.repository = repository;
    this.audit = audit;
    this.currentUser = currentUser;
    this.configuracionService = configuracionService;
    this.providerFactory = providerFactory;
  }

  getSupportedProviders() {
    return SUPPORTED_AI_PROVIDERS;
  }

  getUseCases() {
    return getAIUseCases();
  }

  getUseCasesByModule(moduleId) {
    return getAIUseCasesByModule(moduleId);
  }

  async getConfiguration() {
    return this.repository.getConfiguration();
  }

  async saveConfiguration(payload) {
    const saved = await this.repository.saveConfiguration(payload);
    await this.auditInteraction({
      action: 'IA: actualizo configuracion',
      status: 'configured'
    });
    await this.configuracionService?.dashboardService?.notifyConfigurationChanged?.({ type: 'ai_settings_saved', settings: saved });
    return saved;
  }

  async prepareRequest(useCaseId, input = {}, context = {}) {
    const request = buildAIRequest(useCaseId, input, this.buildContext(context));
    return {
      ...request,
      prepared_at: new Date().toISOString()
    };
  }

  async executeUseCase(useCaseId, input = {}, context = {}) {
    const useCase = getAIUseCase(useCaseId);
    if (!useCase) throw new Error(`Caso de uso de IA no registrado: ${useCaseId}`);

    const configuration = await this.getConfiguration();
    const providerId = configuration.enabled ? configuration.provider : NOOP_AI_PROVIDER;
    const provider = this.providerFactory(providerId, configuration.providers || {});
    const request = await this.prepareRequest(useCase.id, input, context);
    const result = await provider.complete(request);

    await this.auditInteraction({
      action: `IA: preparo ${useCase.moduleId} - ${useCase.title}`,
      useCase,
      providerId: provider.id,
      status: result.status
    });

    return {
      ...result,
      useCase,
      providerConfigured: provider.isConfigured(),
      externalCall: false
    };
  }

  summarizeBeneficiaryRecord(input, context) {
    return this.executeUseCase('beneficiarios.resumen_expediente', input, context);
  }

  detectPendingBeneficiaryDocuments(input, context) {
    return this.executeUseCase('beneficiarios.documentacion_pendiente', input, context);
  }

  suggestCompatibleAid(input, context) {
    return this.executeUseCase('beneficiarios.ayudas_compatibles', input, context);
  }

  buildSocialSummary(input, context) {
    return this.executeUseCase('beneficiarios.resumen_social', input, context);
  }

  detectExpiringProducts(input, context) {
    return this.executeUseCase('inventario.productos_proximos_caducar', input, context);
  }

  recommendInventoryExitPriority(input, context) {
    return this.executeUseCase('inventario.prioridad_salida', input, context);
  }

  detectStockAnomalies(input, context) {
    return this.executeUseCase('inventario.anomalias_stock', input, context);
  }

  summarizeDelivery(input, context) {
    return this.executeUseCase('entregas.resumen_automatico', input, context);
  }

  suggestDeliveryProducts(input, context) {
    return this.executeUseCase('entregas.sugerencia_productos', input, context);
  }

  detectDeliveryIncidents(input, context) {
    return this.executeUseCase('entregas.incidencias', input, context);
  }

  generateDonationThanks(input, context) {
    return this.executeUseCase('donaciones.agradecimiento', input, context);
  }

  classifyDonation(input, context) {
    return this.executeUseCase('donaciones.clasificacion', input, context);
  }

  summarizeCampaign(input, context) {
    return this.executeUseCase('donaciones.resumen_campanas', input, context);
  }

  classifyResource(input, context) {
    return this.executeUseCase('recursos.clasificacion', input, context);
  }

  generateResourceTags(input, context) {
    return this.executeUseCase('recursos.etiquetas', input, context);
  }

  summarizeResource(input, context) {
    return this.executeUseCase('recursos.resumen', input, context);
  }

  recommendRelatedResources(input, context) {
    return this.executeUseCase('recursos.relacionados', input, context);
  }

  generateAnnualMemory(input, context) {
    return this.executeUseCase('informes.memoria_anual', input, context);
  }

  buildExecutiveSummary(input, context) {
    return this.executeUseCase('informes.resumen_ejecutivo', input, context);
  }

  commentStatistics(input, context) {
    return this.executeUseCase('informes.estadisticas_comentadas', input, context);
  }

  buildDailyAdminSummary(input, context) {
    return this.executeUseCase('dashboard.resumen_diario', input, context);
  }

  detectSmartAlerts(input, context) {
    return this.executeUseCase('dashboard.alertas_inteligentes', input, context);
  }

  recommendNextTasks(input, context) {
    return this.executeUseCase('dashboard.tareas_recomendadas', input, context);
  }

  serviceIntegrations() {
    return {
      configuracionService: Boolean(this.configuracionService),
      audit: true,
      providers: this.getSupportedProviders().map((provider) => provider.id)
    };
  }

  buildContext(context = {}) {
    return {
      ...context,
      requestedBy: {
        id: this.currentUser?.id || null,
        name: userLabel(this.currentUser),
        email: this.currentUser?.email || ''
      },
      requestedAt: new Date().toISOString()
    };
  }

  async auditInteraction({ action, useCase = null, providerId = NOOP_AI_PROVIDER, status = 'prepared' } = {}) {
    const cleanAction = cleanText(action);
    if (!cleanAction) return;

    const detailedAction = `${cleanAction} [proveedor:${providerId}; estado:${status}${useCase ? `; caso:${useCase.id}` : ''}]`;

    try {
      await this.audit(detailedAction);
    } catch (error) {
      if (!this.repository?.createAuditLog) throw error;
      await this.repository.createAuditLog({
        userName: userLabel(this.currentUser),
        userEmail: this.currentUser?.email || '',
        action: detailedAction
      });
    }
  }
}
