import { normalize } from '../../lib/formatters';

export function sanitizeInventoryItemPayload(payload) {
  const { stock, ...editable } = payload || {};
  const item = {
    ...editable,
    name: String(editable.name || '').trim(),
    category: String(editable.category || '').trim(),
    lot: String(editable.lot || '').trim(),
    donor: String(editable.donor || '').trim(),
    location: String(editable.location || '').trim(),
    unit: String(editable.unit || '').trim(),
    low_stock_threshold: Number(editable.low_stock_threshold || 0),
    notes: String(editable.notes || '').trim()
  };

  if (!item.name) throw new Error('El nombre del producto es obligatorio.');
  if (!item.category) throw new Error('La categoria del producto es obligatoria.');
  if (!item.unit) throw new Error('La unidad del producto es obligatoria.');
  if (!Number.isFinite(item.low_stock_threshold) || item.low_stock_threshold < 0) {
    throw new Error('El stock minimo no puede ser negativo.');
  }

  return item;
}

export function findDuplicateInventoryItem(items = [], payload = {}, currentId) {
  return items.find((item) => (
    item.id !== currentId
    && normalize(item.name) === normalize(payload.name)
    && normalize(item.lot) === normalize(payload.lot)
  )) || null;
}

export function assertUniqueInventoryItem(items = [], payload = {}, currentId) {
  const duplicate = findDuplicateInventoryItem(items, payload, currentId);
  if (duplicate) {
    throw new Error(`Ya existe ${payload.name}${payload.lot ? ` con el lote ${payload.lot}` : ' sin lote asignado'}.`);
  }
}

export function sanitizeInventoryMovement(payload, items = []) {
  const movementType = payload?.movement_type;
  const quantity = Number(payload?.quantity || 0);
  const item = items.find((entry) => entry.id === payload?.item_id);

  if (!item) throw new Error('Selecciona un producto valido.');
  if (!['Entrada', 'Salida'].includes(movementType)) throw new Error('El tipo de movimiento no es valido.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor que cero.');

  const responsible = String(payload.responsible || '').trim();
  if (!responsible) throw new Error('El responsable del movimiento es obligatorio.');

  if (movementType === 'Salida' && quantity > Number(item.stock || 0)) {
    throw new Error(`Stock insuficiente. Disponible: ${item.stock} ${item.unit}.`);
  }

  return {
    item,
    movement: {
      item_id: item.id,
      movement_type: movementType,
      quantity,
      moved_at: payload.moved_at || new Date().toISOString().slice(0, 10),
      responsible,
      notes: String(payload.notes || '').trim()
    }
  };
}

export class InventarioService {
  constructor({
    repository,
    inventoryItems = [],
    audit = async () => {},
    assertPermission = () => {},
    notificacionService = null,
    hasSupabaseConfig = false
  } = {}) {
    if (!repository) throw new Error('InventarioService necesita un repository.');
    this.repository = repository;
    this.inventoryItems = inventoryItems;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.notificacionService = notificacionService;
    this.hasSupabaseConfig = hasSupabaseConfig;
  }

  async createItem(payload) {
    this.assertPermission('inventory', 'edit');
    const item = sanitizeInventoryItemPayload(payload);
    assertUniqueInventoryItem(this.inventoryItems, item);
    const created = await this.repository.createItem({
      ...item,
      ...(!this.hasSupabaseConfig ? { stock: 0 } : {})
    });
    await this.audit(`Creo producto de inventario ${item.name}`.trim());
    await this.notifyInventoryChanged('item_created', { item: created });
    return created;
  }

  async updateItem(id, payload) {
    this.assertPermission('inventory', 'edit');
    const item = sanitizeInventoryItemPayload(payload);
    assertUniqueInventoryItem(this.inventoryItems, item, id);
    const updated = await this.repository.updateItem(id, item);
    await this.audit(`Edito producto de inventario ${item.name}`.trim());
    await this.notifyInventoryChanged('item_updated', { item: updated });
    return updated;
  }

  async removeItem(id) {
    this.assertPermission('inventory', 'delete');
    const item = this.findItem(id);
    try {
      await this.repository.removeItem(id);
    } catch (error) {
      if (error?.code === '23503') {
        throw new Error('No se puede eliminar un producto con movimientos registrados.');
      }
      throw error;
    }
    await this.audit(`Elimino producto de inventario ${item?.name || ''}`.trim());
  }

  async createMovement(payload, options = {}) {
    if (options.requirePermission !== false) this.assertPermission('inventory', 'create');
    const { item, movement } = sanitizeInventoryMovement(payload, this.inventoryItems);
    const created = await this.repository.registerMovement(item, movement);
    if (options.audit !== false) {
      await this.audit(`Registro ${movement.movement_type.toLowerCase()} de inventario ${item.name}`.trim());
    }
    await this.notifyInventoryChanged('movement_created', { item, movement: created });
    return created;
  }

  async updateMovement(id, payload) {
    this.assertPermission('inventory', 'edit');
    const updated = await this.repository.updateMovement(id, {
      ...payload,
      updated_at: new Date().toISOString()
    });
    await this.audit(`Edito movimiento de inventario ${id}`.trim());
    return updated;
  }

  async regularizeStock(payload) {
    this.assertPermission('inventory', 'edit');
    const item = this.findItem(payload?.item_id);
    if (!item) throw new Error('Selecciona un producto valido.');

    const targetStock = Number(payload?.target_stock);
    if (!Number.isFinite(targetStock) || targetStock < 0) {
      throw new Error('El stock regularizado no puede ser negativo.');
    }

    const difference = targetStock - Number(item.stock || 0);
    if (difference === 0) return null;

    const movement = await this.createMovement({
      item_id: item.id,
      movement_type: difference > 0 ? 'Entrada' : 'Salida',
      quantity: Math.abs(difference),
      moved_at: payload.moved_at || new Date().toISOString().slice(0, 10),
      responsible: payload.responsible,
      notes: String(payload.notes || 'Regularizacion autorizada').trim()
    }, { requirePermission: false, audit: false });

    await this.audit(`Regularizacion de inventario ${item.name}`.trim());
    await this.notifyInventoryChanged('regularized', { item, movement });
    return movement;
  }

  async changeItemStatus(id, status) {
    this.assertPermission('inventory', 'edit');
    const item = this.findItem(id);
    const updated = await this.repository.updateItem(id, {
      status,
      updated_at: new Date().toISOString()
    });
    await this.audit(`Cambio de estado de inventario ${item?.name || id}`.trim());
    await this.notifyInventoryChanged('status_changed', { item: updated || item });
    return updated;
  }

  async setStockForMaintenance(id, stock) {
    const nextStock = Number(stock);
    if (!Number.isFinite(nextStock) || nextStock < 0) {
      throw new Error('El stock no puede ser negativo.');
    }
    return this.repository.updateItem(id, { stock: nextStock });
  }

  async resolveItemForOperation(payload, donorName = '') {
    if (payload.inventory_item_mode !== 'new') {
      const item = this.findItem(payload.inventory_item_id);
      if (!item) throw new Error('Selecciona un producto de inventario.');
      return item;
    }

    const existing = this.inventoryItems.find((entry) => (
      normalize(entry.name) === normalize(payload.inventory_name)
      && normalize(entry.lot) === normalize(payload.inventory_lot)
    ));
    if (existing) return existing;

    return this.createItemWithoutPermission({
      name: payload.inventory_name,
      category: payload.inventory_category || 'Alimentos',
      lot: payload.inventory_lot || '',
      expires_at: payload.inventory_expires_at || '',
      donor: payload.inventory_donor || donorName || '',
      location: payload.inventory_location || '',
      unit: payload.inventory_unit || 'unidades',
      low_stock_threshold: payload.inventory_low_stock_threshold || 0,
      notes: payload.inventory_notes || ''
    });
  }

  async createItemWithoutPermission(payload) {
    const item = sanitizeInventoryItemPayload(payload);
    assertUniqueInventoryItem(this.inventoryItems, item);
    const created = await this.repository.createItem({
      ...item,
      ...(!this.hasSupabaseConfig ? { stock: 0 } : {})
    });
    await this.audit(`Creo producto de inventario ${created.name}`.trim());
    await this.notifyInventoryChanged('item_created', { item: created });
    return created;
  }

  findItem(id) {
    return this.inventoryItems.find((item) => item.id === id);
  }

  async notifyInventoryChanged(type, payload = {}) {
    await this.notificacionService?.notifyInventoryChanged?.({ type, ...payload });
    const item = payload.item || this.findItem(payload.movement?.item_id);
    if (item && Number(item.stock || 0) <= Number(item.low_stock_threshold || 0)) {
      await this.notificacionService?.notifyInventoryChanged?.({ type: Number(item.stock || 0) <= 0 ? 'out_of_stock' : 'low_stock', item });
    }
  }
}
