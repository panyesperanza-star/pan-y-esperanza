import { normalize, todayISO } from '../../lib/formatters.js';

const VOLUNTEER_META_START = '[PYE_VOLUNTEER_META]';
const VOLUNTEER_META_END = '[/PYE_VOLUNTEER_META]';

export function enrichVolunteers(volunteers = []) {
  return volunteers
    .map((volunteer, index) => parseVolunteer(volunteer, index))
    .sort((a, b) => compareVolunteerRows(a, b, 'code'));
}

export function filterAndSortVolunteers(volunteers = [], searchTerm = '', sortBy = 'code') {
  const query = normalize(searchTerm);
  const filtered = query
    ? volunteers.filter((volunteer) => volunteerSearchText(volunteer).includes(query))
    : volunteers;

  return [...filtered].sort((a, b) => compareVolunteerRows(a, b, sortBy));
}

export function parseVolunteer(volunteer, index = 0) {
  const { meta, visibleNotes } = parseVolunteerMeta(volunteer.notes || '');
  const joined = volunteer.joined_at || meta.joined_at || volunteer.created_at || todayISO();
  const status = volunteer.status || meta.status || (volunteer.left_at || meta.archived_at ? 'Archivado' : 'Activo');
  return {
    ...volunteer,
    meta,
    visibleNotes,
    code: volunteer.code || meta.code || fallbackVolunteerCode(index, joined),
    joined_at: joined,
    status,
    address: volunteer.address || meta.address || '',
    emergency_contact: volunteer.emergency_contact || meta.emergency_contact || '',
    emergency_phone: volunteer.emergency_phone || meta.emergency_phone || '',
    functions: volunteer.functions || meta.tasks || '',
    tasks: volunteer.functions || meta.tasks || '',
    photo_data_url: volunteer.photo_data_url || meta.photo_data_url || '',
    archived_at: volunteer.left_at || meta.archived_at || '',
    archived_by: meta.archived_by || '',
    archive_reason: volunteer.leave_reason || meta.archive_reason || '',
    left_at: volunteer.left_at || meta.archived_at || '',
    leave_reason: volunteer.leave_reason || meta.archive_reason || '',
    notes: visibleNotes
  };
}

export function volunteerPayloadFromForm(form, volunteers, current = null) {
  const code = current
    ? nextAvailableVolunteerCode(volunteers, current.code || form.code, current.id)
    : nextAvailableVolunteerCode(volunteers, form.code);
  const payload = {
    code,
    full_name: form.full_name,
    document_id: form.document_id,
    phone: form.phone,
    email: form.email,
    status: form.status || 'Activo',
    joined_at: form.joined_at || todayISO(),
    left_at: form.left_at || null,
    leave_reason: form.leave_reason || '',
    address: form.address || '',
    emergency_contact: form.emergency_contact || '',
    emergency_phone: form.emergency_phone || '',
    functions: form.functions || form.tasks || '',
    photo_data_url: form.photo_data_url || '',
    training: form.training,
    availability: form.availability,
    documentation: form.documentation,
    person_identity_id: form.person_identity_id || current?.person_identity_id || null,
    notes: String(form.notes || '').trim()
  };
  if (current?.created_at) payload.created_at = current.created_at;
  return payload;
}

export function volunteerPayloadFromParsed(volunteer, updates = {}) {
  return {
    code: updates.code || volunteer.code,
    full_name: volunteer.full_name,
    document_id: volunteer.document_id,
    phone: volunteer.phone,
    email: volunteer.email,
    status: updates.status || volunteer.status || 'Activo',
    joined_at: updates.joined_at || volunteer.joined_at || todayISO(),
    left_at: Object.prototype.hasOwnProperty.call(updates, 'left_at') ? updates.left_at : (volunteer.left_at || null),
    leave_reason: Object.prototype.hasOwnProperty.call(updates, 'leave_reason') ? updates.leave_reason : (volunteer.leave_reason || ''),
    address: updates.address || volunteer.address || '',
    emergency_contact: updates.emergency_contact || volunteer.emergency_contact || '',
    emergency_phone: updates.emergency_phone || volunteer.emergency_phone || '',
    functions: updates.functions || volunteer.functions || volunteer.tasks || '',
    photo_data_url: updates.photo_data_url || volunteer.photo_data_url || '',
    training: volunteer.training,
    availability: volunteer.availability,
    documentation: volunteer.documentation,
    created_at: volunteer.created_at,
    person_identity_id: volunteer.person_identity_id || null,
    notes: String(volunteer.visibleNotes || volunteer.notes || '').trim()
  };
}

export function nextVolunteerCode(volunteers, currentId = '') {
  return nextAvailableVolunteerCode(volunteers, '', currentId);
}

export function nextAvailableVolunteerCode(volunteers, preferred = '', currentId = '') {
  const usedCodes = new Set(
    (volunteers || [])
      .filter((volunteer) => volunteer.id !== currentId)
      .map((volunteer) => normalizeVolunteerCode(volunteer.code))
      .filter(Boolean)
  );
  const normalizedPreferred = normalizeVolunteerCode(preferred);
  const preferredMatch = normalizedPreferred.match(/^VOL-(\d{4})-(\d{4})$/);
  const year = preferredMatch?.[1] || String(new Date().getFullYear());
  const highest = Array.from(usedCodes).reduce((max, code) => {
    const match = code.match(new RegExp(`^VOL-${year}-(\\d{4})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const preferredNumber = preferredMatch ? Number(preferredMatch[2]) : 0;
  const canUsePreferred = preferredMatch
    && !usedCodes.has(normalizedPreferred)
    && (Boolean(currentId) || preferredNumber > highest);
  let nextNumber = canUsePreferred ? preferredNumber : highest + 1;
  let candidate = `VOL-${year}-${String(nextNumber).padStart(4, '0')}`;

  while (usedCodes.has(candidate)) {
    nextNumber += 1;
    candidate = `VOL-${year}-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}

export function compareVolunteerRows(a, b, sortBy = 'code') {
  if (sortBy === 'name') {
    return compareVolunteerValues(a.full_name, b.full_name)
      || compareVolunteerValues(a.code, b.code)
      || compareVolunteerValues(a.id, b.id);
  }
  if (sortBy === 'joined_at') {
    return compareVolunteerValues(a.joined_at, b.joined_at)
      || compareVolunteerValues(a.code, b.code)
      || compareVolunteerValues(a.id, b.id);
  }
  if (sortBy === 'status') {
    return compareVolunteerValues(a.status, b.status)
      || compareVolunteerValues(a.code, b.code)
      || compareVolunteerValues(a.id, b.id);
  }
  return compareVolunteerValues(a.code, b.code)
    || compareVolunteerValues(a.full_name, b.full_name)
    || compareVolunteerValues(a.id, b.id);
}

export function normalizeVolunteerCode(value) {
  return String(value || '').trim().toUpperCase();
}

function volunteerSearchText(volunteer) {
  return [
    volunteer.code,
    volunteer.full_name,
    volunteer.document_id,
    volunteer.phone,
    volunteer.email
  ].map((value) => normalize(value)).join(' ');
}

function compareVolunteerValues(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function parseVolunteerMeta(notes) {
  const raw = String(notes || '');
  const start = raw.indexOf(VOLUNTEER_META_START);
  const end = raw.indexOf(VOLUNTEER_META_END);
  if (start === -1 || end === -1 || end <= start) return { meta: {}, visibleNotes: raw.trim() };
  const json = raw.slice(start + VOLUNTEER_META_START.length, end).trim();
  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + VOLUNTEER_META_END.length).trim();
  return { meta: safeJson(json), visibleNotes: [before, after].filter(Boolean).join('\n') };
}

function fallbackVolunteerCode(index, dateValue) {
  const year = String(dateValue || todayISO()).slice(0, 4) || new Date().getFullYear();
  return `VOL-${year}-${String(index + 1).padStart(4, '0')}`;
}

function safeJson(value) {
  try {
    return JSON.parse(value || '{}') || {};
  } catch {
    return {};
  }
}
