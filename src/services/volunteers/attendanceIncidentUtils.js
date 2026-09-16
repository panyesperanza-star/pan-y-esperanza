const EXCESSIVE_SHIFT_MINUTES = 12 * 60;
const REVIEW_STATUSES = new Set(['pending', 'reviewed', 'resolved', 'dismissed']);

export function attendanceIncidentType(entry = {}) {
  if (entry.incident_type) return entry.incident_type;
  if (entry.status === 'open' && !entry.check_out_at && elapsedMinutes(entry.check_in_at) > EXCESSIVE_SHIFT_MINUTES) {
    return 'Fichaje excesivamente largo';
  }
  return '';
}

export function attendanceIncidentReviewStatus(entry = {}) {
  if (REVIEW_STATUSES.has(entry.incident_review_status)) return entry.incident_review_status;
  return ['corrected', 'voided'].includes(entry.status) ? 'resolved' : 'pending';
}

export function attendanceIncidentRequiresReview(entry = {}) {
  return Boolean(attendanceIncidentType(entry)) && attendanceIncidentReviewStatus(entry) === 'pending';
}

function elapsedMinutes(start) {
  const startDate = new Date(start || 0);
  if (Number.isNaN(startDate.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - startDate.getTime()) / 60000));
}
