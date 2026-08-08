import { normalize, todayISO } from './formatters';

export const COMPATIBILITY_LEVELS = {
  high: {
    id: 'high',
    label: 'Alta compatibilidad',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    card: 'border-emerald-200 bg-emerald-50/60'
  },
  possible: {
    id: 'possible',
    label: 'Posible compatibilidad',
    dot: 'bg-amber-400',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    card: 'border-amber-200 bg-amber-50/60'
  },
  insufficient: {
    id: 'insufficient',
    label: 'Informacion insuficiente',
    dot: 'bg-slate-300',
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    card: 'border-slate-200 bg-slate-50'
  },
  incompatible: {
    id: 'incompatible',
    label: 'No compatible',
    dot: 'bg-red-500',
    badge: 'border-red-200 bg-red-50 text-red-800',
    card: 'border-red-200 bg-red-50/60'
  }
};

const DOCUMENT_RULES = [
  { key: 'dni', label: 'DNI/NIE/Pasaporte', aliases: ['dni', 'nie', 'pasaporte', 'documento identidad'] },
  { key: 'empadronamiento', label: 'Empadronamiento', aliases: ['empadronamiento', 'padron'] },
  { key: 'familia_numerosa', label: 'Familia numerosa', aliases: ['familia numerosa'] },
  { key: 'discapacidad', label: 'Discapacidad', aliases: ['discapacidad', 'dependencia'] },
  { key: 'ingresos', label: 'Justificante de ingresos', aliases: ['ingresos', 'nomina', 'renta', 'prestacion'] },
  { key: 'empleo', label: 'Situacion laboral', aliases: ['demanda de empleo', 'desempleo', 'vida laboral', 'situacion laboral'] },
  { key: 'alquiler', label: 'Contrato o recibo de alquiler', aliases: ['alquiler', 'contrato de arrendamiento', 'recibo vivienda'] },
  { key: 'informe_social', label: 'Informe social', aliases: ['informe social'] }
];

export function buildSocialResourceRecommendations({
  beneficiary = null,
  resources = [],
  documents = [],
  links = []
} = {}) {
  if (!beneficiary) {
    return {
      beneficiary: null,
      results: [],
      recommendations: [],
      topRecommendation: null,
      counts: emptyCounts(),
      endingSoonCount: 0,
      nextDeadlineDays: null,
      summaryText: 'Selecciona un beneficiario para calcular recomendaciones.'
    };
  }

  const beneficiaryDocuments = documents.filter((doc) => doc.beneficiary_id === beneficiary.id);
  const beneficiaryLinks = links.filter((link) => link.beneficiary_id === beneficiary.id);
  const linkedResourceIds = new Set(beneficiaryLinks.map((link) => link.resource_id));
  const results = resources.map((resource) => analyzeResourceCompatibility(resource, beneficiary, beneficiaryDocuments, linkedResourceIds));
  const recommendations = results
    .filter((item) => item.level.id !== 'incompatible')
    .sort(compareRecommendations);
  const counts = results.reduce((acc, item) => {
    acc[item.level.id] += 1;
    return acc;
  }, emptyCounts());
  const endingSoon = recommendations.filter((item) => item.deadline?.isSoon);
  const topRecommendation = recommendations[0] || null;

  return {
    beneficiary,
    results,
    recommendations,
    topRecommendation,
    counts,
    endingSoonCount: endingSoon.length,
    nextDeadlineDays: endingSoon.length ? Math.min(...endingSoon.map((item) => item.deadline.daysRemaining)) : null,
    summaryText: buildRecommendationSummary(recommendations, endingSoon)
  };
}

export function buildSocialResourceMonitoring({
  resources = [],
  beneficiaries = [],
  documents = [],
  links = [],
  today = todayISO()
} = {}) {
  const resourceAlerts = resources.map((resource) => buildResourceAlert(resource, today));
  const closingSoon = resourceAlerts.filter((item) => item.flags.closingSoon);
  const needsReview = resourceAlerts.filter((item) => item.flags.needsReview);
  const open = resourceAlerts.filter((item) => item.flags.open);
  const newlyCreated = resourceAlerts.filter((item) => item.flags.new);
  const activeBeneficiaries = beneficiaries.filter((beneficiary) => beneficiary.is_active !== false);
  const pendingBeneficiaryIds = new Set();
  const affectedByNewResource = newlyCreated.map((alert) => {
    const affected = activeBeneficiaries.filter((beneficiary) => {
      const analysis = analyzeResourceCompatibility(
        alert.resource,
        beneficiary,
        documents.filter((document) => document.beneficiary_id === beneficiary.id),
        new Set(links.filter((link) => link.beneficiary_id === beneficiary.id).map((link) => link.resource_id))
      );
      const compatible = ['high', 'possible'].includes(analysis.level.id);
      if (compatible && !analysis.isLinked) pendingBeneficiaryIds.add(beneficiary.id);
      return compatible;
    });
    return { ...alert, affectedCount: affected.length, beneficiaries: affected };
  });

  activeBeneficiaries.forEach((beneficiary) => {
    const analysis = buildSocialResourceRecommendations({ beneficiary, resources, documents, links });
    if (analysis.recommendations.some((item) => ['high', 'possible'].includes(item.level.id) && !item.isLinked)) {
      pendingBeneficiaryIds.add(beneficiary.id);
    }
  });

  return {
    alerts: resourceAlerts,
    closingSoon,
    needsReview,
    open,
    newlyCreated,
    affectedByNewResource,
    pendingBeneficiaryCount: pendingBeneficiaryIds.size
  };
}

export function analyzeResourceCompatibility(resource = {}, beneficiary = {}, documents = [], linkedResourceIds = new Set()) {
  const checks = [];
  const missing = [];
  const blockers = [];
  const priorities = [];
  const documentation = analyzeRequiredDocumentation(resource, documents);
  const deadline = analyzeDeadline(resource.deadline_at);
  const expedienteText = beneficiarySearchText(beneficiary, documents);
  const resourceText = resourceSearchText(resource);
  const age = calculateAge(beneficiary.birth_date);

  const lifecycle = buildResourceAlert(resource);
  if (resource.status === 'Cerrado') blockers.push('El recurso figura como cerrado.');
  if (deadline.isExpired) blockers.push('El plazo de solicitud ha finalizado.');
  if (deadline.isSoon) priorities.push(`Finaliza en ${deadline.daysRemaining} dia${deadline.daysRemaining === 1 ? '' : 's'}.`);
  if (resource.status === 'Activo' && lifecycle.verified && !deadline.isExpired) checks.push('Convocatoria abierta y verificada.');
  if (resource.status === 'Proximamente') missing.push('Convocatoria marcada como proximamente.');
  if (resource.status === 'Pendiente de verificar') missing.push('Convocatoria pendiente de verificar.');
  if (!lifecycle.verified) missing.push('Fuente oficial pendiente de verificar.');

  if (hasValue(resource.age_min)) {
    if (age === null) missing.push('Edad no verificada en el expediente.');
    else if (age >= Number(resource.age_min)) checks.push('Cumple edad minima.');
    else blockers.push('No cumple la edad minima registrada.');
  }
  if (hasValue(resource.age_max)) {
    if (age === null) missing.push('Edad no verificada en el expediente.');
    else if (age <= Number(resource.age_max)) checks.push('Cumple edad maxima.');
    else blockers.push('Supera la edad maxima registrada.');
  }

  if (resource.municipality) {
    const beneficiaryMunicipality = normalize([
      beneficiary.municipality,
      beneficiary.city,
      beneficiary.locality,
      beneficiary.address_full,
      beneficiary.postal_code
    ].filter(Boolean).join(' '));
    const resourceMunicipality = normalize(resource.municipality);
    if (!beneficiaryMunicipality) missing.push('Municipio del beneficiario no indicado.');
    else if (beneficiaryMunicipality.includes(resourceMunicipality) || resourceMunicipality.includes(beneficiaryMunicipality)) checks.push('Municipio compatible.');
    else blockers.push('Municipio distinto al del recurso.');
  }

  if (Number(beneficiary.family_members || 0) > 0) checks.push('Unidad familiar registrada.');
  else missing.push('Unidad familiar pendiente de confirmar.');

  const minors = Number(beneficiary.minors_count || 0);
  if (requiresMinors(resource)) {
    if (minors > 0) checks.push('Constan menores en la unidad familiar.');
    else blockers.push('No constan menores para un recurso orientado a infancia/familia.');
  }

  if (resource.family_situation) {
    const profile = normalize([beneficiary.situation, beneficiary.marital_status, beneficiary.notes, beneficiary.requested_help].filter(Boolean).join(' '));
    if (!profile) missing.push('Situacion familiar no documentada.');
    else if (profile.includes(normalize(resource.family_situation))) checks.push('Situacion familiar compatible.');
    else missing.push('Situacion familiar pendiente de comprobacion.');
  }

  if (resource.employment_situation || mentionsEmployment(resourceText)) {
    if (hasAny(expedienteText, ['desempleo', 'paro', 'empleo', 'laboral', 'trabajo'])) checks.push('Situacion laboral consta en el expediente.');
    else missing.push('Situacion laboral pendiente de comprobar.');
  }

  if (resource.housing_situation || mentionsHousing(resourceText)) {
    if (hasAny(expedienteText, ['alquiler', 'vivienda', 'desahucio', 'habitacion', 'hipoteca'])) checks.push('Situacion de vivienda consta en el expediente.');
    else missing.push('Situacion de vivienda pendiente de comprobar.');
  }

  if (mentionsIncome(resourceText)) {
    if (hasAny(expedienteText, ['ingresos', 'nomina', 'renta', 'prestacion'])) checks.push('Existen referencias a ingresos/prestaciones.');
    else missing.push('Ingresos de la unidad familiar.');
  }

  if (mentionsDisability(resourceText)) {
    if (hasAny(expedienteText, ['discapacidad', 'dependencia'])) checks.push('Discapacidad/dependencia consta en el expediente.');
    else missing.push('Discapacidad/dependencia si aplica al recurso.');
  }

  documentation.available.forEach((item) => checks.push(`Documento disponible: ${item.label}.`));
  documentation.pending.forEach((item) => missing.push(`Documento pendiente: ${item.label}.`));
  documentation.expired.forEach((item) => missing.push(`Documento caducado: ${item.label}.`));

  const level = resolveCompatibilityLevel({ checks, missing, blockers });
  const score = compatibilityScore({ checks, missing, blockers, priorities, level });
  const isLinked = linkedResourceIds.has(resource.id);

  return {
    resource,
    level,
    score,
    checks: unique(checks).slice(0, 6),
    missing: unique(missing).slice(0, 6),
    blockers: unique(blockers).slice(0, 6),
    priorities: unique(priorities),
    documentation,
    deadline,
    lifecycle,
    isLinked,
    phrase: level.id === 'incompatible'
      ? 'No parece compatible con los datos actuales.'
      : 'Podria cumplir los requisitos, pendiente de validacion por el organismo correspondiente.'
  };
}

export function buildResourceAlert(resource = {}, today = todayISO()) {
  const deadline = analyzeDeadline(resource.deadline_at, today);
  const createdDays = daysBetween(resource.created_at, today);
  const verified = isResourceOfficiallyVerified(resource);
  const verificationDays = daysBetween(resource.last_verified_at, today);
  const closed = deadline.isExpired || resource.status === 'Cerrado';
  const closingSoon = !closed && deadline.isSoon;
  const isNew = Number.isFinite(createdDays) && createdDays >= 0 && createdDays <= 14;
  const needsVerification = resource.status === 'Pendiente de verificar'
    || !verified
    || !resource.last_verified_at
    || (Number.isFinite(verificationDays) && verificationDays > 30);
  const open = resource.status === 'Activo' && verified && !closed;
  let kind = 'open';
  let label = 'Convocatoria abierta';
  let tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';

  if (closed) {
    kind = 'closed';
    label = deadline.isExpired ? 'Plazo finalizado' : 'Convocatoria cerrada';
    tone = 'border-slate-200 bg-slate-100 text-slate-700';
  } else if (closingSoon) {
    kind = 'closing-soon';
    label = 'Cierra proximamente';
    tone = 'border-red-200 bg-red-50 text-red-800';
  } else if (isNew) {
    kind = 'new';
    label = 'Nueva convocatoria';
    tone = 'border-blue-200 bg-blue-50 text-blue-800';
  } else if (needsVerification) {
    kind = 'needs-review';
    label = 'Necesita revision';
    tone = 'border-amber-200 bg-amber-50 text-amber-800';
  }

  return {
    resource,
    kind,
    label,
    tone,
    verified,
    flags: {
      closed,
      closingSoon,
      needsReview,
      open,
      new: isNew
    },
    deadline,
    daysSinceCreated: createdDays,
    daysSinceVerification: verificationDays,
    sourceLabel: resource.official_url || '',
    verifiedBy: resource.verified_by_name || resource.verified_by || ''
  };
}

export function isResourceOfficiallyVerified(resource = {}) {
  return Boolean(String(resource.official_url || '').trim() && resource.last_verified_at && (resource.verified_by || resource.verified_by_name));
}

function resolveCompatibilityLevel({ checks, missing, blockers }) {
  if (blockers.length) return COMPATIBILITY_LEVELS.incompatible;
  if (checks.length >= 3 && missing.length <= 1) return COMPATIBILITY_LEVELS.high;
  if (checks.length >= 1) return COMPATIBILITY_LEVELS.possible;
  return COMPATIBILITY_LEVELS.insufficient;
}

function compatibilityScore({ checks, missing, blockers, priorities, level }) {
  if (level.id === 'incompatible') return -100 + checks.length - blockers.length * 10;
  return checks.length * 12 + priorities.length * 6 - missing.length * 3;
}

function compareRecommendations(a, b) {
  const levelWeight = { high: 0, possible: 1, insufficient: 2, incompatible: 3 };
  const byLevel = levelWeight[a.level.id] - levelWeight[b.level.id];
  if (byLevel !== 0) return byLevel;
  const byPriority = Number(Boolean(b.deadline?.isSoon)) - Number(Boolean(a.deadline?.isSoon));
  if (byPriority !== 0) return byPriority;
  return b.score - a.score;
}

function buildRecommendationSummary(recommendations, endingSoon) {
  if (!recommendations.length) return 'No hay recursos recomendados con los datos actuales.';
  const resourceLabel = recommendations.length === 1 ? '1 posible recurso encontrado.' : `${recommendations.length} posibles recursos encontrados.`;
  const deadlineLabel = endingSoon.length
    ? `${endingSoon.length} convocatoria${endingSoon.length === 1 ? '' : 's'} finaliza${endingSoon.length === 1 ? '' : 'n'} pronto.`
    : 'Sin cierres urgentes detectados.';
  return `${resourceLabel} ${deadlineLabel}`;
}

function analyzeDeadline(deadline, todayValue = todayISO()) {
  if (!deadline) return { hasDeadline: false, isExpired: false, isSoon: false, daysRemaining: null };
  const today = new Date(`${todayValue}T00:00:00`);
  const target = new Date(`${String(deadline).slice(0, 10)}T00:00:00`);
  const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return {
    hasDeadline: true,
    isExpired: daysRemaining < 0,
    isSoon: daysRemaining >= 0 && daysRemaining <= 15,
    daysRemaining
  };
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function analyzeRequiredDocumentation(resource, documents) {
  const requiredText = normalize([resource.required_documents, resource.requirements].filter(Boolean).join(' '));
  const required = DOCUMENT_RULES.filter((rule) => rule.aliases.some((alias) => requiredText.includes(normalize(alias))));
  const available = [];
  const pending = [];
  const expired = [];

  required.forEach((rule) => {
    const matches = documents.filter((doc) => {
      const docText = normalize([doc.document_type, doc.file_name, doc.notes, doc.status, doc.review_status].filter(Boolean).join(' '));
      return rule.aliases.some((alias) => docText.includes(normalize(alias)));
    });
    if (!matches.length) {
      pending.push(rule);
      return;
    }
    const hasExpired = matches.some(isExpiredDocument);
    if (hasExpired) expired.push(rule);
    else available.push(rule);
  });

  return { required, available, pending, expired };
}

function isExpiredDocument(doc) {
  const expiresAt = doc.expires_at || doc.expiry_date || doc.valid_until;
  if (expiresAt && String(expiresAt).slice(0, 10) < todayISO()) return true;
  const state = normalize([doc.status, doc.review_status, doc.estado].filter(Boolean).join(' '));
  return state.includes('caduc');
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date(`${todayISO()}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function resourceSearchText(resource) {
  return normalize([
    resource.name,
    resource.category,
    resource.description,
    resource.requirements,
    resource.target_audience,
    resource.required_documents,
    resource.application_method,
    resource.family_situation,
    resource.employment_situation,
    resource.housing_situation,
    resource.notes
  ].filter(Boolean).join(' '));
}

function beneficiarySearchText(beneficiary, documents) {
  return normalize([
    beneficiary.situation,
    beneficiary.requested_help,
    beneficiary.notes,
    beneficiary.marital_status,
    beneficiary.address_full,
    beneficiary.nationality,
    ...documents.flatMap((doc) => [doc.document_type, doc.file_name, doc.notes, doc.status, doc.review_status])
  ].filter(Boolean).join(' '));
}

function requiresMinors(resource) {
  const text = resourceSearchText(resource);
  return normalize(resource.category) === 'infancia y familia' || hasAny(text, ['menor', 'infancia', 'hijo', 'familia con menores']);
}

function mentionsEmployment(text) {
  return hasAny(text, ['desempleo', 'paro', 'empleo', 'laboral', 'trabajo']);
}

function mentionsHousing(text) {
  return hasAny(text, ['vivienda', 'alquiler', 'desahucio', 'habitacion', 'hipoteca']);
}

function mentionsIncome(text) {
  return hasAny(text, ['ingresos', 'renta', 'nomina', 'prestacion', 'iprem']);
}

function mentionsDisability(text) {
  return hasAny(text, ['discapacidad', 'dependencia']);
}

function hasAny(text, terms) {
  const normalizedText = normalize(text);
  return terms.some((term) => normalizedText.includes(normalize(term)));
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function emptyCounts() {
  return { high: 0, possible: 0, insufficient: 0, incompatible: 0 };
}
