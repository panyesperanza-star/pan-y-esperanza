export function normalizeInventoryStockNumber(value) {
  const parsed = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatInventoryQuantity(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(normalizeInventoryStockNumber(value));
}

export function normalizeInventoryUnit(unit) {
  const cleanUnit = String(unit || '').trim();
  if (!cleanUnit || /^\d+([.,]\d+)?$/.test(cleanUnit)) return 'unidades';
  return cleanUnit;
}

export function isValidInventoryUnit(unit) {
  return normalizeInventoryUnit(unit) === String(unit || '').trim();
}

export function formatInventoryStockLabel(item, { prefix = 'Stock disponible: ' } = {}) {
  return `${prefix}${formatInventoryQuantity(item?.stock)} ${normalizeInventoryUnit(item?.unit)}`;
}
