import { normalize } from '../../lib/formatters';

const VOLUNTEER_META_START = '[PYE_VOLUNTEER_META]';
const VOLUNTEER_META_END = '[/PYE_VOLUNTEER_META]';
const VOLUNTEER_STATUSES = new Set(['Activo', 'Inactivo', 'Archivado', 'Baja']);
const DOCUMENT_STATUSES = new Set(['Vigente', 'Pendiente', 'Caducado', 'No requerido']);

function cleanText(value) {
  return String(value || '').trim();
}

function parseVolunteerMeta(notes) {
  const raw = String(notes || '');
  const start = raw.indexOf(VOLUNTEER_META_START);
  const end = raw.indexOf(VOLUNTEER_META_END);
  if (start === -1 || end === -1 || end <= start) return { meta: {}, visibleNotes: raw.trim() };

  const json = raw.slice(start + VOLUNTEER_META_START.length, end).trim();
  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + VOLUNTEER_META_END.length).trim();

  try {
    return {
      meta: JSON.parse(json || '{}') || {},
      visibleNotes: [before, after].filter(Boolean).join('\n')
    };
  } catch {
    return { meta: {}, visibleNotes: raw.trim() };
  }
}

function volunteerStatus(volunteer = {}) {
  const { meta } = parseVolunteerMeta(volunteer.notes || '');
  return volunteer.status || meta.status || (meta.archived_at ? 'Archivado' : 'Activo');
}

function cleanDate(value) {
  const text = cleanText(value);
  return text || null;
}

function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanStatus(value, allowedStatuses, fallback) {
  const status = cleanText(value);
  return allowedStatuses.has(status) ? status : fallback;
}

export function sanitizeVolunteerPayload(payload = {}) {
  const fullName = cleanText(payload.full_name);
  if (!fullName) throw new Error('El nombre del voluntario es obligatorio.');
  const code = cleanText(payload.code);
  if (!code) throw new Error('El código del voluntario es obligatorio.');

  const email = cleanText(payload.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El email del voluntario no es valido.');
  }

  const volunteer = {
    code,
    full_name: fullName,
    document_id: cleanText(payload.document_id),
    phone: cleanText(payload.phone),
    email,
    status: cleanStatus(payload.status, VOLUNTEER_STATUSES, 'Activo'),
    joined_at: cleanDate(payload.joined_at) || new Date().toISOString().slice(0, 10),
    left_at: cleanDate(payload.left_at),
    leave_reason: cleanText(payload.leave_reason),
    address: cleanText(payload.address),
    emergency_contact: cleanText(payload.emergency_contact),
    emergency_phone: cleanText(payload.emergency_phone),
    functions: cleanText(payload.functions || payload.tasks),
    photo_data_url: cleanText(payload.photo_data_url),
    training: cleanText(payload.training),
    availability: cleanText(payload.availability),
    documentation: cleanText(payload.documentation),
    notes: String(payload.notes || '').trim(),
    person_identity_id: payload.person_identity_id || undefined,
    created_at: payload.created_at || undefined
  };

  return Object.fromEntries(Object.entries(volunteer).filter(([, value]) => value !== undefined));
}

export function sanitizeVolunteerDocumentPayload(payload = {}, volunteers = []) {
  const volunteerId = cleanText(payload.volunteer_id);
  if (!volunteerId) throw new Error('Selecciona un voluntario.');
  if (volunteers.length && !volunteers.some((volunteer) => volunteer.id === volunteerId)) {
    throw new Error('El voluntario seleccionado no existe.');
  }

  const documentType = cleanText(payload.document_type);
  if (!documentType) throw new Error('Indica el tipo de documento.');

  return {
    volunteer_id: volunteerId,
    document_type: documentType,
    status: cleanStatus(payload.status, DOCUMENT_STATUSES, 'Pendiente'),
    file_name: cleanText(payload.file_name),
    file_data_url: cleanText(payload.file_data_url),
    uploaded_at: cleanDate(payload.uploaded_at),
    expires_at: cleanDate(payload.expires_at),
    reviewed_at: cleanDate(payload.reviewed_at),
    reviewed_by: cleanText(payload.reviewed_by),
    notes: cleanText(payload.notes),
    history: Array.isArray(payload.history) ? payload.history : []
  };
}

export function sanitizeVolunteerTrainingPayload(payload = {}, volunteers = []) {
  const volunteerId = cleanText(payload.volunteer_id);
  if (!volunteerId) throw new Error('Selecciona un voluntario.');
  if (volunteers.length && !volunteers.some((volunteer) => volunteer.id === volunteerId)) {
    throw new Error('El voluntario seleccionado no existe.');
  }

  const courseName = cleanText(payload.course_name);
  if (!courseName) throw new Error('Indica el nombre de la formación.');

  const hours = cleanNumber(payload.hours);
  if (hours !== null && hours < 0) throw new Error('Las horas no pueden ser negativas.');

  return {
    volunteer_id: volunteerId,
    course_name: courseName,
    course_date: cleanDate(payload.course_date),
    hours,
    entity: cleanText(payload.entity),
    certificate_file_name: cleanText(payload.certificate_file_name),
    certificate_file_data_url: cleanText(payload.certificate_file_data_url),
    expires_at: cleanDate(payload.expires_at),
    status: cleanStatus(payload.status, DOCUMENT_STATUSES, 'Vigente'),
    notes: cleanText(payload.notes)
  };
}

export function sanitizeVolunteerHistoryPayload(payload = {}, volunteers = []) {
  const volunteerId = cleanText(payload.volunteer_id);
  if (!volunteerId) throw new Error('Selecciona un voluntario.');
  if (volunteers.length && !volunteers.some((volunteer) => volunteer.id === volunteerId)) {
    throw new Error('El voluntario seleccionado no existe.');
  }

  const activity = cleanText(payload.activity);
  if (!activity) throw new Error('La actividad del historial es obligatoria.');

  const hours = payload.hours === '' || payload.hours === null || payload.hours === undefined
    ? null
    : Number(payload.hours);
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
    throw new Error('Las horas no pueden ser negativas.');
  }

  return {
    volunteer_id: volunteerId,
    date: payload.date || new Date().toISOString().slice(0, 10),
    activity,
    hours,
    notes: String(payload.notes || '').trim()
  };
}

function historyAuditAction(activity) {
  const normalized = normalize(activity);
  if (normalized.includes('documento')) return 'anadio documentacion';
  if (normalized.includes('formacion')) return 'registro formacion';
  if (normalized.includes('asistencia')) return 'registro asistencia';
  if (normalized.includes('turno')) return 'asigno turno';
  return 'registro historial';
}

export class VoluntarioService {
  constructor({
    repository,
    volunteers = [],
    audit = async () => {},
    assertCanDelete = () => {},
    usuarioService = null,
    entregaService = null,
    notificacionService = null,
    dashboardService = null
  } = {}) {
    if (!repository) throw new Error('VoluntarioService necesita un repository.');
    this.repository = repository;
    this.volunteers = volunteers;
    this.audit = audit;
    this.assertCanDelete = assertCanDelete;
    this.usuarioService = usuarioService;
    this.entregaService = entregaService;
    this.notificacionService = notificacionService;
    this.dashboardService = dashboardService;
  }

  async list() {
    return this.repository.listVolunteers();
  }

  async create(payload) {
    const volunteer = sanitizeVolunteerPayload(payload);
    const created = await this.repository.createVolunteer(volunteer);
    await this.audit(`Creo voluntario ${created.full_name || volunteer.full_name}`.trim());
    await this.notifyVolunteerChanged('created', created);
    return created;
  }

  async update(id, payload) {
    const current = this.findVolunteer(id);
    const previousStatus = volunteerStatus(current);
    const volunteer = sanitizeVolunteerPayload(payload);
    const nextStatus = volunteerStatus(volunteer);
    const updated = await this.repository.updateVolunteer(id, volunteer);

    if (previousStatus !== nextStatus && nextStatus === 'Archivado') {
      await this.audit(`Desactivo voluntario ${updated.full_name || volunteer.full_name || id}`.trim());
    } else if (previousStatus !== nextStatus && nextStatus === 'Activo') {
      await this.audit(`Activo voluntario ${updated.full_name || volunteer.full_name || id}`.trim());
    } else {
      await this.audit(`Actualizo voluntario ${updated.full_name || volunteer.full_name || id}`.trim());
    }

    await this.notifyVolunteerChanged('updated', updated);
    return updated;
  }

  async remove(id) {
    this.assertCanDelete();
    const volunteer = this.findVolunteer(id);
    await this.repository.removeVolunteer(id);
    await this.audit(`Elimino definitivamente un voluntario ${volunteer?.full_name || ''}`.trim());
    await this.notifyVolunteerChanged('deleted', { id, volunteer });
  }

  async createHistory(payload) {
    const history = sanitizeVolunteerHistoryPayload(payload, this.volunteers);
    const created = await this.repository.createHistory(history);
    await this.audit(`Voluntarios: ${historyAuditAction(history.activity)} ${history.activity || ''}`.trim());
    await this.notifyVolunteerChanged('history_created', created);
    return created;
  }

  async createDocument(payload) {
    const document = sanitizeVolunteerDocumentPayload(payload, this.volunteers);
    const history = appendTimelineEntry(document.history, 'Documento registrado', document.reviewed_by || 'Sistema');
    const created = await this.repository.createDocument({ ...document, history });
    await this.audit(`Voluntarios: registro documento ${document.document_type}`.trim());
    await this.notifyVolunteerChanged('document_created', created);
    return created;
  }

  async updateDocument(id, payload) {
    const document = sanitizeVolunteerDocumentPayload(payload, this.volunteers);
    const history = appendTimelineEntry(document.history, `Documento actualizado: ${document.status}`, document.reviewed_by || 'Sistema');
    const updated = await this.repository.updateDocument(id, { ...document, history });
    await this.audit(`Voluntarios: actualizo documento ${document.document_type}`.trim());
    await this.notifyVolunteerChanged('document_updated', updated);
    return updated;
  }

  async removeDocument(id) {
    await this.repository.removeDocument(id);
    await this.audit('Voluntarios: elimino documento');
    await this.notifyVolunteerChanged('document_deleted', { id });
    return true;
  }

  async createTraining(payload) {
    const training = sanitizeVolunteerTrainingPayload(payload, this.volunteers);
    const created = await this.repository.createTraining(training);
    await this.audit(`Voluntarios: registro formacion ${training.course_name}`.trim());
    await this.notifyVolunteerChanged('training_created', created);
    return created;
  }

  async updateTraining(id, payload) {
    const training = sanitizeVolunteerTrainingPayload(payload, this.volunteers);
    const updated = await this.repository.updateTraining(id, training);
    await this.audit(`Voluntarios: actualizo formacion ${training.course_name}`.trim());
    await this.notifyVolunteerChanged('training_updated', updated);
    return updated;
  }

  async removeTraining(id) {
    await this.repository.removeTraining(id);
    await this.audit('Voluntarios: elimino formacion');
    await this.notifyVolunteerChanged('training_deleted', { id });
    return true;
  }

  async assignShift(payload) {
    return this.createHistory({ ...payload, activity: payload.activity || 'Turno asignado' });
  }

  async recordAttendance(payload) {
    return this.createHistory({ ...payload, activity: payload.activity || 'Asistencia registrada' });
  }

  async addDocumentation(payload) {
    return this.createHistory({ ...payload, activity: payload.activity || 'Documento: Documentacion' });
  }

  async removeDocumentation(id) {
    const history = await this.repository.updateHistory(id, {
      notes: '[DOCUMENTO_RETIRADO]',
      activity: 'Documento retirado'
    });
    await this.audit('Voluntarios: retiro documentacion');
    await this.notifyVolunteerChanged('documentation_removed', history);
    return history;
  }

  findVolunteer(id) {
    return this.volunteers.find((volunteer) => volunteer.id === id);
  }

  async notifyVolunteerChanged(type, payload) {
    await this.dashboardService?.notifyVolunteerChanged?.({ type, payload });
    await this.notificacionService?.notifyVolunteerChanged?.({ type, payload });
  }
}

function appendTimelineEntry(history = [], event, user) {
  const entries = Array.isArray(history) ? history : [];
  return [
    ...entries,
    {
      date: new Date().toISOString(),
      event,
      user
    }
  ];
}
