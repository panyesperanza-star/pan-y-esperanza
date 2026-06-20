export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value) {
  return value ? new Intl.DateTimeFormat('es-ES').format(new Date(value)) : '-';
}

export function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '-';
}

export function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function normalizeDocument(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

export function nextBeneficiaryCode(beneficiaries) {
  const last = beneficiaries.reduce((max, item) => {
    const match = String(item.code || '').match(/PYE-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PYE-${String(last + 1).padStart(5, '0')}`;
}

export function nextReceiptNumber(deliveries, dateValue = new Date()) {
  const year = new Date(dateValue).getFullYear();
  const last = deliveries.reduce((max, delivery) => {
    const match = String(delivery.receipt_number || '').match(/^PE-(\d{4})-(\d{6})$/);
    if (!match || Number(match[1]) !== year) return max;
    return Math.max(max, Number(match[2]));
  }, 0);
  return `PE-${year}-${String(last + 1).padStart(6, '0')}`;
}
