export const AI_MODULES = Object.freeze({
  beneficiaries: 'beneficiarios',
  inventory: 'inventario',
  deliveries: 'entregas',
  donations: 'donaciones',
  resources: 'recursos',
  reports: 'informes',
  dashboard: 'dashboard'
});

function createUseCase({ id, moduleId, title, action, requiredData = [], expectedOutput = '', systemPrompt }) {
  return Object.freeze({
    id,
    moduleId,
    title,
    action,
    requiredData,
    expectedOutput,
    systemPrompt
  });
}

export const AI_USE_CASES = Object.freeze({
  beneficiaryRecordSummary: createUseCase({
    id: 'beneficiarios.resumen_expediente',
    moduleId: AI_MODULES.beneficiaries,
    title: 'Resumen automatico del expediente',
    action: 'summarize_beneficiary_record',
    requiredData: ['beneficiary', 'family', 'deliveries', 'documents', 'social_history'],
    expectedOutput: 'Resumen claro, objetivo y no diagnostico del expediente.',
    systemPrompt: 'Resume expedientes de beneficiarios con lenguaje profesional, prudente y respetuoso. No inventes datos y senala siempre la informacion insuficiente.'
  }),
  beneficiaryPendingDocuments: createUseCase({
    id: 'beneficiarios.documentacion_pendiente',
    moduleId: AI_MODULES.beneficiaries,
    title: 'Deteccion de documentacion pendiente',
    action: 'detect_pending_documents',
    requiredData: ['beneficiary', 'documents', 'renewals'],
    expectedOutput: 'Lista de documentos pendientes o caducados y motivo.',
    systemPrompt: 'Revisa documentacion de beneficiarios y detecta ausencias o vencimientos sin asumir documentos no definidos por el ERP.'
  }),
  beneficiaryCompatibleAid: createUseCase({
    id: 'beneficiarios.ayudas_compatibles',
    moduleId: AI_MODULES.beneficiaries,
    title: 'Sugerencia de ayudas compatibles',
    action: 'suggest_compatible_aid',
    requiredData: ['beneficiary', 'family', 'resources'],
    expectedOutput: 'Recursos o ayudas potencialmente compatibles con explicacion breve.',
    systemPrompt: 'Sugiere ayudas compatibles solo a partir de recursos disponibles. Incluye advertencia de revision humana obligatoria.'
  }),
  beneficiarySocialSummary: createUseCase({
    id: 'beneficiarios.resumen_social',
    moduleId: AI_MODULES.beneficiaries,
    title: 'Resumen social',
    action: 'build_social_summary',
    requiredData: ['beneficiary', 'social_history', 'observations'],
    expectedOutput: 'Resumen social neutral para equipo interno.',
    systemPrompt: 'Redacta resumenes sociales neutrales, respetuosos y utiles para seguimiento interno. Evita juicios de valor.'
  }),
  inventoryExpiringProducts: createUseCase({
    id: 'inventario.productos_proximos_caducar',
    moduleId: AI_MODULES.inventory,
    title: 'Aviso de productos proximos a caducar',
    action: 'detect_expiring_products',
    requiredData: ['inventory_items', 'lots', 'expiration_dates'],
    expectedOutput: 'Productos priorizados por caducidad y riesgo.',
    systemPrompt: 'Analiza caducidades y prioriza productos que requieren salida proxima sin modificar stock.'
  }),
  inventoryExitPriority: createUseCase({
    id: 'inventario.prioridad_salida',
    moduleId: AI_MODULES.inventory,
    title: 'Recomendacion de prioridad de salida',
    action: 'recommend_exit_priority',
    requiredData: ['inventory_items', 'lots', 'stock', 'deliveries'],
    expectedOutput: 'Orden sugerido de salida con motivo operativo.',
    systemPrompt: 'Propone prioridad de salida considerando caducidad, stock y necesidades, sin ejecutar movimientos.'
  }),
  inventoryStockAnomalies: createUseCase({
    id: 'inventario.anomalias_stock',
    moduleId: AI_MODULES.inventory,
    title: 'Deteccion de anomalias de stock',
    action: 'detect_stock_anomalies',
    requiredData: ['inventory_items', 'movements', 'stock'],
    expectedOutput: 'Anomalias potenciales y datos que requieren revision.',
    systemPrompt: 'Detecta inconsistencias potenciales en inventario. No confirmes errores sin evidencia suficiente.'
  }),
  deliverySummary: createUseCase({
    id: 'entregas.resumen_automatico',
    moduleId: AI_MODULES.deliveries,
    title: 'Resumen automatico',
    action: 'summarize_delivery',
    requiredData: ['delivery', 'beneficiary', 'products'],
    expectedOutput: 'Resumen operativo de la entrega.',
    systemPrompt: 'Resume entregas de forma objetiva, breve y util para auditoria interna.'
  }),
  deliveryProductSuggestions: createUseCase({
    id: 'entregas.sugerencia_productos',
    moduleId: AI_MODULES.deliveries,
    title: 'Sugerencias de productos segun unidad familiar',
    action: 'suggest_delivery_products',
    requiredData: ['beneficiary', 'family', 'inventory'],
    expectedOutput: 'Sugerencias no vinculantes de productos y cantidades.',
    systemPrompt: 'Sugiere productos segun unidad familiar y disponibilidad. La confirmacion humana y el stock real son obligatorios.'
  }),
  deliveryIncidents: createUseCase({
    id: 'entregas.incidencias',
    moduleId: AI_MODULES.deliveries,
    title: 'Deteccion de incidencias',
    action: 'detect_delivery_incidents',
    requiredData: ['delivery', 'notes', 'history'],
    expectedOutput: 'Incidencias potenciales y acciones de revision.',
    systemPrompt: 'Detecta posibles incidencias en entregas a partir de notas e historial. No inventes hechos.'
  }),
  donationThanks: createUseCase({
    id: 'donaciones.agradecimiento',
    moduleId: AI_MODULES.donations,
    title: 'Generacion automatica de agradecimientos',
    action: 'generate_donation_thanks',
    requiredData: ['donation', 'donor'],
    expectedOutput: 'Borrador de agradecimiento listo para revision.',
    systemPrompt: 'Genera agradecimientos calidos y sobrios para donantes. No prometas beneficios fiscales no confirmados.'
  }),
  donationClassification: createUseCase({
    id: 'donaciones.clasificacion',
    moduleId: AI_MODULES.donations,
    title: 'Clasificacion automatica',
    action: 'classify_donation',
    requiredData: ['donation', 'items', 'amount'],
    expectedOutput: 'Tipo de donacion, categoria y campos sugeridos.',
    systemPrompt: 'Clasifica donaciones economicas o en especie sin modificar registros ni inventario.'
  }),
  donationCampaignSummary: createUseCase({
    id: 'donaciones.resumen_campanas',
    moduleId: AI_MODULES.donations,
    title: 'Resumen de campanas',
    action: 'summarize_campaign',
    requiredData: ['campaign', 'donations', 'metrics'],
    expectedOutput: 'Resumen de campana con resultados y aprendizajes.',
    systemPrompt: 'Resume campanas de donacion con datos disponibles y tono institucional.'
  }),
  resourceClassification: createUseCase({
    id: 'recursos.clasificacion',
    moduleId: AI_MODULES.resources,
    title: 'Clasificacion automatica',
    action: 'classify_resource',
    requiredData: ['resource'],
    expectedOutput: 'Categoria, tipo y provincia sugeridos.',
    systemPrompt: 'Clasifica recursos para el centro de recursos usando solo categorias existentes o sugiriendo revision.'
  }),
  resourceTags: createUseCase({
    id: 'recursos.etiquetas',
    moduleId: AI_MODULES.resources,
    title: 'Generacion de etiquetas',
    action: 'generate_resource_tags',
    requiredData: ['resource'],
    expectedOutput: 'Etiquetas breves y utiles para filtros.',
    systemPrompt: 'Genera etiquetas concisas para busqueda y filtrado. Evita etiquetas ambiguas.'
  }),
  resourceSummary: createUseCase({
    id: 'recursos.resumen',
    moduleId: AI_MODULES.resources,
    title: 'Resumen del recurso',
    action: 'summarize_resource',
    requiredData: ['resource'],
    expectedOutput: 'Resumen publico claro y accesible.',
    systemPrompt: 'Resume recursos publicos con lenguaje claro, sin exageraciones ni datos no verificados.'
  }),
  resourceRelated: createUseCase({
    id: 'recursos.relacionados',
    moduleId: AI_MODULES.resources,
    title: 'Recomendacion de recursos relacionados',
    action: 'recommend_related_resources',
    requiredData: ['resource', 'resources'],
    expectedOutput: 'Recursos relacionados y motivo.',
    systemPrompt: 'Relaciona recursos por utilidad, categoria, provincia y perfil destinatario.'
  }),
  annualMemory: createUseCase({
    id: 'informes.memoria_anual',
    moduleId: AI_MODULES.reports,
    title: 'Generacion de memoria anual',
    action: 'generate_annual_memory',
    requiredData: ['reports', 'metrics'],
    expectedOutput: 'Borrador estructurado de memoria anual.',
    systemPrompt: 'Prepara borradores de memoria anual con tono institucional y datos verificables.'
  }),
  executiveSummary: createUseCase({
    id: 'informes.resumen_ejecutivo',
    moduleId: AI_MODULES.reports,
    title: 'Resumen ejecutivo',
    action: 'build_executive_summary',
    requiredData: ['metrics', 'period'],
    expectedOutput: 'Resumen ejecutivo breve para direccion.',
    systemPrompt: 'Resume informacion ejecutiva con prioridad en decisiones y riesgos.'
  }),
  commentedStatistics: createUseCase({
    id: 'informes.estadisticas_comentadas',
    moduleId: AI_MODULES.reports,
    title: 'Estadisticas comentadas',
    action: 'comment_statistics',
    requiredData: ['statistics', 'period'],
    expectedOutput: 'Lectura comentada de indicadores.',
    systemPrompt: 'Comenta estadisticas sin inventar causas. Diferencia dato, tendencia e interpretacion.'
  }),
  dashboardDailySummary: createUseCase({
    id: 'dashboard.resumen_diario',
    moduleId: AI_MODULES.dashboard,
    title: 'Resumen diario para administradores',
    action: 'build_daily_admin_summary',
    requiredData: ['dashboard_metrics', 'alerts', 'tasks'],
    expectedOutput: 'Resumen diario operativo.',
    systemPrompt: 'Resume el dia para administradores con foco en prioridades, riesgos y proximas acciones.'
  }),
  dashboardSmartAlerts: createUseCase({
    id: 'dashboard.alertas_inteligentes',
    moduleId: AI_MODULES.dashboard,
    title: 'Alertas inteligentes',
    action: 'detect_smart_alerts',
    requiredData: ['dashboard_metrics', 'inventory', 'deliveries'],
    expectedOutput: 'Alertas potenciales ordenadas por prioridad.',
    systemPrompt: 'Detecta alertas operativas sin ejecutar acciones. Toda alerta requiere confirmacion humana.'
  }),
  dashboardRecommendedTasks: createUseCase({
    id: 'dashboard.tareas_recomendadas',
    moduleId: AI_MODULES.dashboard,
    title: 'Proximas tareas recomendadas',
    action: 'recommend_next_tasks',
    requiredData: ['dashboard_metrics', 'calendar', 'alerts'],
    expectedOutput: 'Lista priorizada de tareas sugeridas.',
    systemPrompt: 'Sugiere tareas operativas concretas, realistas y priorizadas para el equipo.'
  })
});

const USE_CASE_LIST = Object.freeze(Object.values(AI_USE_CASES));

export function getAIUseCases() {
  return USE_CASE_LIST;
}

export function getAIUseCase(useCaseId) {
  return USE_CASE_LIST.find((useCase) => useCase.id === useCaseId || useCase.action === useCaseId) || null;
}

export function getAIUseCasesByModule(moduleId) {
  return USE_CASE_LIST.filter((useCase) => useCase.moduleId === moduleId);
}

export function buildAIRequest(useCaseId, input = {}, context = {}) {
  const useCase = getAIUseCase(useCaseId);
  if (!useCase) throw new Error(`Caso de uso de IA no registrado: ${useCaseId}`);

  return {
    useCaseId: useCase.id,
    moduleId: useCase.moduleId,
    title: useCase.title,
    action: useCase.action,
    system: useCase.systemPrompt,
    user: JSON.stringify({
      input,
      context,
      requiredData: useCase.requiredData,
      expectedOutput: useCase.expectedOutput
    }, null, 2),
    metadata: {
      requiredData: useCase.requiredData,
      expectedOutput: useCase.expectedOutput
    }
  };
}
