const VOLUNTEER_META_START = '[PYE_VOLUNTEER_META]';
const VOLUNTEER_META_END = '[/PYE_VOLUNTEER_META]';

export function cleanPersonText(value) {
  return String(value || '').trim();
}

export function normalizePersonDocument(value) {
  return cleanPersonText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizePersonEmail(value) {
  return cleanPersonText(value).toLowerCase();
}

export function normalizePersonPhone(value) {
  const digits = cleanPersonText(value).replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function normalizePersonName(value) {
  return cleanPersonText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitPersonName(fullName = '') {
  const parts = cleanPersonText(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

export function userFullName(user = {}) {
  return cleanPersonText(
    user.full_name || [user.first_name, user.last_name].map(cleanPersonText).filter(Boolean).join(' ')
  );
}

export function readVolunteerIdentityMeta(notes = '') {
  const raw = String(notes || '');
  const start = raw.indexOf(VOLUNTEER_META_START);
  const end = raw.indexOf(VOLUNTEER_META_END);
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    return JSON.parse(raw.slice(start + VOLUNTEER_META_START.length, end).trim() || '{}') || {};
  } catch {
    return {};
  }
}

export function personIdentityPayloadFromVolunteer(volunteer = {}) {
  const meta = readVolunteerIdentityMeta(volunteer.notes || '');
  return cleanPersonIdentityPayload({
    full_name: volunteer.full_name,
    document_id: volunteer.document_id,
    email: volunteer.email,
    phone: volunteer.phone,
    photo_data_url: volunteer.photo_data_url || volunteer.profile_photo || volunteer.photo_url || meta.photo_data_url || '',
    source_type: 'volunteer',
    source_id: volunteer.id || null
  });
}

export function personIdentityPayloadFromUser(user = {}) {
  return cleanPersonIdentityPayload({
    full_name: userFullName(user),
    document_id: user.document_id,
    email: user.email,
    phone: user.phone,
    photo_data_url: user.profile_photo || user.photo_data_url || user.photo_url || '',
    source_type: 'user',
    source_id: user.id || null
  });
}

export function mergePersonIdentityPayloads(primary = {}, secondary = {}) {
  return cleanPersonIdentityPayload({
    full_name: primary.full_name || secondary.full_name,
    document_id: primary.document_id || secondary.document_id,
    email: primary.email || secondary.email,
    phone: primary.phone || secondary.phone,
    photo_data_url: primary.photo_data_url || secondary.photo_data_url,
    source_type: primary.source_type || secondary.source_type || 'manual',
    source_id: primary.source_id || secondary.source_id || null
  });
}

export function applyPersonIdentityToVolunteer(volunteer = {}, identity = null) {
  if (!identity) return volunteer;
  return {
    ...volunteer,
    person_identity: identity,
    full_name: identity.full_name || volunteer.full_name,
    document_id: identity.document_id || volunteer.document_id,
    email: identity.email || volunteer.email,
    phone: identity.phone || volunteer.phone,
    photo_data_url: identity.photo_data_url || volunteer.photo_data_url
  };
}

export function applyPersonIdentityToUser(user = {}, identity = null) {
  if (!identity) return user;
  const { first_name, last_name } = splitPersonName(identity.full_name || userFullName(user));
  return {
    ...user,
    person_identity: identity,
    first_name: first_name || user.first_name,
    last_name: last_name || user.last_name,
    full_name: identity.full_name || userFullName(user),
    document_id: identity.document_id || user.document_id,
    email: identity.email || user.email,
    phone: identity.phone || user.phone,
    profile_photo: identity.photo_data_url || user.profile_photo,
    photo_data_url: identity.photo_data_url || user.photo_data_url
  };
}

export function buildVolunteerUserIdentityCandidates(volunteers = [], users = []) {
  const rows = [];
  volunteers.forEach((volunteer) => {
    users.forEach((user) => {
      const reasons = identityMatchReasons(volunteer, user);
      if (!reasons.length) return;
      rows.push({
        volunteer,
        user,
        reasons,
        alreadyLinked: Boolean(volunteer.person_identity_id && volunteer.person_identity_id === user.person_identity_id),
        conflict: Boolean(volunteer.person_identity_id && user.person_identity_id && volunteer.person_identity_id !== user.person_identity_id)
      });
    });
  });
  return rows.sort((left, right) => right.reasons.length - left.reasons.length || String(left.volunteer.full_name || '').localeCompare(String(right.volunteer.full_name || ''), 'es'));
}

export function findVolunteerMatchesForUser(user = {}, volunteers = []) {
  return buildVolunteerUserIdentityCandidates(volunteers, [user])
    .filter((candidate) => !candidate.alreadyLinked);
}

export function identityMatchReasons(volunteer = {}, user = {}) {
  const reasons = [];
  const volunteerDocument = normalizePersonDocument(volunteer.document_id);
  const userDocument = normalizePersonDocument(user.document_id);
  const volunteerEmail = normalizePersonEmail(volunteer.email);
  const userEmail = normalizePersonEmail(user.email);
  const volunteerPhone = normalizePersonPhone(volunteer.phone);
  const userPhone = normalizePersonPhone(user.phone);
  const volunteerName = normalizePersonName(volunteer.full_name);
  const userName = normalizePersonName(userFullName(user));

  if (volunteerDocument && userDocument && volunteerDocument === userDocument) reasons.push('Documento coincidente');
  if (volunteerEmail && userEmail && volunteerEmail === userEmail) reasons.push('Email coincidente');
  if (volunteerPhone && userPhone && volunteerPhone === userPhone) reasons.push('Telefono coincidente');
  if (volunteerName && userName && areSimilarNames(volunteerName, userName)) reasons.push('Nombre similar');
  return reasons;
}

export function cleanPersonIdentityPayload(payload = {}) {
  return {
    full_name: cleanPersonText(payload.full_name),
    document_id: cleanPersonText(payload.document_id),
    email: normalizePersonEmail(payload.email),
    phone: cleanPersonText(payload.phone),
    photo_data_url: cleanPersonText(payload.photo_data_url),
    source_type: cleanPersonText(payload.source_type || 'manual'),
    source_id: payload.source_id || null,
    updated_at: new Date().toISOString()
  };
}

function areSimilarNames(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftParts = new Set(left.split(' ').filter(Boolean));
  const rightParts = new Set(right.split(' ').filter(Boolean));
  const common = [...leftParts].filter((part) => rightParts.has(part));
  return common.length >= 2 || (common.length === 1 && Math.max(leftParts.size, rightParts.size) <= 2);
}
