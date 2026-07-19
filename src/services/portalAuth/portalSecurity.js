const OTP_TTL_MINUTES = 10;
const SESSION_TTL_HOURS = 8;

export function cleanPortalText(value) {
  return String(value || '').trim();
}

export function nowISO() {
  return new Date().toISOString();
}

export function safePortalId() {
  return crypto.randomUUID();
}

export function expiresInMinutes(minutes = OTP_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function isExpired(expiresAt) {
  return !expiresAt || new Date(expiresAt).getTime() < Date.now();
}

export function publicOtpChallenge(otp, delivery = {}) {
  return {
    id: otp.id,
    action: otp.action,
    expiresAt: otp.expires_at,
    channel: delivery.channel || otp.channel || 'email',
    provider: delivery.provider || 'notification-service',
    deliveryStatus: delivery.status || 'queued'
  };
}

export function buildPortalSession({ portal, subjectType, subjectId, email = '', channel = 'email' }) {
  return {
    id: safePortalId(),
    token: safePortalId(),
    portal,
    subject_type: subjectType,
    subject_id: subjectId,
    email: cleanPortalText(email).toLowerCase(),
    channel,
    status: 'active',
    started_at: nowISO(),
    expires_at: sessionExpiresAt(),
    last_seen_at: nowISO(),
    created_at: nowISO(),
    updated_at: nowISO()
  };
}

export function toClientSession(session) {
  if (!session) return null;
  return {
    token: session.token,
    portal: session.portal,
    subjectType: session.subject_type,
    subjectId: session.subject_id,
    email: session.email,
    expiresAt: session.expires_at,
    startedAt: session.started_at
  };
}

export function assertSessionShape(session, portal) {
  if (!session?.token || !session?.subjectId || session.portal !== portal) {
    throw new Error('La sesion no es valida. Vuelve a acceder al portal.');
  }
}
