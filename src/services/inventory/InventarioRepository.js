import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class InventarioRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
    this.hasSupabaseConfig = hasSupabaseConfig;
  }

  async createItem(payload) {
    return this.repository.create('inventory_items', payload);
  }

  async updateItem(id, payload) {
    return this.repository.update('inventory_items', id, payload);
  }

  async removeItem(id) {
    return this.repository.remove('inventory_items', id);
  }

  async updateMovement(id, payload) {
    return this.repository.update('inventory_movements', id, payload);
  }

  async registerMovement(item, movement) {
    if (this.hasSupabaseConfig) {
      return this.repository.rpc('register_inventory_movement', {
        p_item_id: movement.item_id,
        p_movement_type: movement.movement_type,
        p_quantity: movement.quantity,
        p_moved_at: String(movement.moved_at || new Date().toISOString()).slice(0, 10),
        p_responsible: movement.responsible,
        p_notes: movement.notes,
        p_donation_id: movement.donation_id || null,
        p_donation_product_id: movement.donation_product_id || null,
        p_delivery_id: movement.delivery_id || null,
        p_source_module: movement.source_module || null,
        p_source_record_id: movement.source_record_id || null
      });
    }

    const nextStock = movement.movement_type === 'Entrada'
      ? Number(item.stock || 0) + movement.quantity
      : Number(item.stock || 0) - movement.quantity;

    await this.repository.update('inventory_items', item.id, { stock: nextStock });
    return this.repository.create('inventory_movements', { ...movement, item_name: item.name });
  }
}
