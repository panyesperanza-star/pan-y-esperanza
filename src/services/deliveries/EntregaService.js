import { nextReceiptNumber } from '../../lib/formatters';

export function buildDeliveryTrackingNote(delivery, beneficiary, item, quantity, responsibleFallback) {
  const parts = [
    `Se registra una entrega de ${delivery.help_type || 'ayuda'} a ${beneficiary.full_name || 'la persona beneficiaria'}.`
  ];
  if (item?.name) parts.push(`Producto: ${item.name}.`);
  if (quantity) parts.push(`Cantidad: ${quantity}${item?.unit ? ` ${item.unit}` : ''}.`);
  if (delivery.receipt_number) parts.push(`Justificante: ${delivery.receipt_number}.`);
  parts.push(`Responsable: ${delivery.responsible || responsibleFallback}.`);
  if (delivery.notes) parts.push(`Observaciones: ${delivery.notes}`);
  return parts.join(' ');
}

function hasSignature(value) {
  return Boolean(String(value || '').trim());
}

export class EntregaService {
  constructor({
    repository,
    beneficiarioService,
    inventarioService,
    dashboardService,
    configuracionService = null,
    notificacionService = null,
    deliveries = [],
    beneficiaries = [],
    families = [],
    inventoryItems = [],
    audit = async () => {},
    assertPermission = () => {},
    assertCanDelete = () => {},
    assertCancelFallback = () => {},
    canCancel = () => false,
    currentUser = null,
    currentUserName = () => 'Usuario',
    hasSupabaseConfig = false,
    isMissingCancelDeliveryRpcError = () => false,
    voidDeliverySocialValueEvents = async () => {}
  } = {}) {
    if (!repository) throw new Error('EntregaService necesita un repository.');
    if (!beneficiarioService) throw new Error('EntregaService necesita BeneficiarioService.');
    if (!inventarioService) throw new Error('EntregaService necesita InventarioService.');
    this.repository = repository;
    this.beneficiarioService = beneficiarioService;
    this.inventarioService = inventarioService;
    this.dashboardService = dashboardService;
    this.configuracionService = configuracionService;
    this.notificacionService = notificacionService;
    this.deliveries = deliveries;
    this.beneficiaries = beneficiaries;
    this.families = families;
    this.inventoryItems = inventoryItems;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.assertCanDelete = assertCanDelete;
    this.assertCancelFallback = assertCancelFallback;
    this.canCancel = canCancel;
    this.currentUser = currentUser;
    this.currentUserName = currentUserName;
    this.hasSupabaseConfig = hasSupabaseConfig;
    this.isMissingCancelDeliveryRpcError = isMissingCancelDeliveryRpcError;
    this.voidDeliverySocialValueEvents = voidDeliverySocialValueEvents;
  }

  async create(payload) {
    this.assertPermission('deliveries', 'create');
    if (this.isDigitalSignatureRequired() && !hasSignature(payload.signature_data_url)) {
      throw new Error('La firma digital del receptor es obligatoria para registrar la entrega.');
    }

    const { beneficiary, family, item, quantity } = this.validateDeliveryPayload(payload);

    let createdDelivery = await this.repository.create({
      ...payload,
      receipt_number: payload.receipt_number || nextReceiptNumber(this.deliveries, payload.delivered_at),
      beneficiary_name: beneficiary?.full_name || '',
      family_id: family?.id || null,
      family_name: family?.family_code || '',
      inventory_item_name: item?.name || ''
    });

    const signatureUpdate = await this.buildSignatureUpdate(createdDelivery, beneficiary, payload);
    if (Object.keys(signatureUpdate).length) {
      createdDelivery = await this.repository.update(createdDelivery.id, signatureUpdate);
    }

    if (beneficiary) {
      await this.beneficiarioService.createSocialHistory({
        beneficiary_id: beneficiary.id,
        family_id: family?.id || null,
        date: payload.delivered_at || new Date().toISOString().slice(0, 10),
        entry_type: 'Entrega de ayuda',
        notes: buildDeliveryTrackingNote(createdDelivery, beneficiary, item, quantity, this.currentUserName())
      });
    }

    if (!this.hasSupabaseConfig && beneficiary) {
      await this.beneficiarioService.updateLastHelpAt(beneficiary.id, payload.delivered_at);
    }

    if (!this.hasSupabaseConfig && item && quantity > 0) {
      await this.inventarioService.createMovement({
        item_id: item.id,
        movement_type: 'Salida',
        quantity,
        moved_at: payload.delivered_at,
        responsible: payload.responsible,
        notes: `Salida automatica por entrega a ${beneficiary?.full_name || 'beneficiario'}`
      }, { requirePermission: false });
    }

    if (signatureUpdate.signature_data_url && beneficiary) {
      await this.registerSignatureHistory(createdDelivery, beneficiary, 'Firma digital registrada durante la entrega.');
    }

    await this.audit(`Registro entrega a ${beneficiary?.full_name || 'beneficiario'}`);
    await this.dashboardService?.notifyDeliveryChanged?.({ type: 'created', delivery: createdDelivery });
    await this.notificacionService?.notifyDeliveryChanged?.({ type: 'created', delivery: createdDelivery });
    return createdDelivery;
  }

  async saveSignature(id, payload = {}) {
    this.assertPermission('deliveries', 'edit');
    const delivery = this.deliveries.find((item) => item.id === id);
    if (!delivery || delivery.status === 'Anulada') throw new Error('La entrega no existe o esta anulada.');

    if (this.isDigitalSignatureRequired() && !hasSignature(payload.signature_data_url || delivery.signature_data_url)) {
      throw new Error('La firma digital del receptor es obligatoria.');
    }

    const beneficiary = this.beneficiaries.find((item) => item.id === delivery.beneficiary_id);
    const signatureUpdate = await this.buildSignatureUpdate(delivery, beneficiary, payload);
    if (!Object.keys(signatureUpdate).length) throw new Error('Confirma una firma digital antes de guardar.');

    const updated = await this.repository.update(id, {
      ...signatureUpdate,
      receiver_name: payload.receiver_name ?? delivery.receiver_name,
      receiver_document_id: payload.receiver_document_id ?? delivery.receiver_document_id,
      reception_at: payload.reception_at ?? delivery.reception_at
    });

    if (beneficiary) {
      await this.registerSignatureHistory(updated, beneficiary, 'Firma digital actualizada y asociada al justificante.');
    }

    await this.audit(`Entregas: registro firma digital ${delivery.receipt_number || id}`.trim());
    await this.dashboardService?.notifyDeliveryChanged?.({ type: 'signature_saved', delivery: updated });
    await this.notificacionService?.notifyDeliveryChanged?.({ type: 'signature_saved', delivery: updated });
    return updated;
  }

  async remove(id) {
    this.assertCanDelete();
    await this.repository.remove(id);
    await this.audit('Elimino definitivamente una entrega');
    await this.dashboardService?.notifyDeliveryChanged?.({ type: 'deleted', deliveryId: id });
    await this.notificacionService?.notifyDeliveryChanged?.({ type: 'deleted', deliveryId: id });
  }

  async cancel(id, reason) {
    if (!this.canCancel()) {
      throw new Error('No tienes permiso para anular entregas.');
    }

    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 5) throw new Error('Indica un motivo de anulacion valido.');

    const delivery = this.deliveries.find((item) => item.id === id);
    if (!delivery || delivery.status === 'Anulada') throw new Error('La entrega no existe o ya esta anulada.');

    if (this.hasSupabaseConfig) {
      try {
        const cancelled = await this.repository.cancelWithRpc(id, cleanReason);
        await this.dashboardService?.notifyDeliveryChanged?.({ type: 'cancelled', delivery: cancelled || delivery });
        await this.notificacionService?.notifyDeliveryChanged?.({ type: 'cancelled', delivery: cancelled || delivery });
        return cancelled;
      } catch (error) {
        if (!this.isMissingCancelDeliveryRpcError(error)) throw error;
        this.assertCancelFallback();
      }
    }

    const cancelled = await this.cancelWithoutRpc(delivery, cleanReason);
    await this.audit(`Anulo entrega ${delivery.receipt_number || id}. Motivo: ${cleanReason}`);
    await this.dashboardService?.notifyDeliveryChanged?.({ type: 'cancelled', delivery: cancelled });
    await this.notificacionService?.notifyDeliveryChanged?.({ type: 'cancelled', delivery: cancelled });
    return cancelled;
  }

  async cancelWithoutRpc(delivery, cleanReason) {
    const cancelledAt = new Date().toISOString();
    const cancelledByName = this.currentUserName();
    const item = this.inventoryItems.find((entry) => entry.id === delivery.inventory_item_id);

    const updatedDelivery = await this.repository.update(delivery.id, {
      status: 'Anulada',
      cancelled_at: cancelledAt,
      cancelled_by: this.currentUser?.id || null,
      cancelled_by_name: cancelledByName,
      cancellation_reason: cleanReason
    });

    if (item && Number(delivery.quantity || 0) > 0) {
      await this.inventarioService.createMovement({
        item_id: item.id,
        movement_type: 'Entrada',
        quantity: Number(delivery.quantity || 0),
        moved_at: this.hasSupabaseConfig ? cancelledAt.slice(0, 10) : cancelledAt,
        responsible: cancelledByName,
        notes: `Reversion por anulacion de entrega: ${cleanReason}`
      }, { requirePermission: false });
    }

    const lastActiveDelivery = this.deliveries
      .filter((item) => item.id !== delivery.id && item.beneficiary_id === delivery.beneficiary_id && item.status !== 'Anulada')
      .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)))[0];
    await this.beneficiarioService.updateLastHelpAt(delivery.beneficiary_id, lastActiveDelivery?.delivered_at || null);
    await this.voidDeliverySocialValueEvents(delivery, cleanReason);
    return updatedDelivery;
  }

  validateDeliveryPayload(payload) {
    const beneficiary = this.beneficiaries.find((item) => item.id === payload.beneficiary_id);
    if (!beneficiary) throw new Error('Selecciona un beneficiario valido.');

    const family = this.families.find((item) => item.id === beneficiary?.family_id);
    const item = this.inventoryItems.find((entry) => entry.id === payload.inventory_item_id);
    const quantity = Number(payload.quantity || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad de la entrega debe ser mayor que cero.');
    }

    if (payload.inventory_item_id && !item) {
      throw new Error('Selecciona un producto de inventario valido.');
    }

    if (item && quantity > Number(item.stock || 0)) {
      throw new Error(`Stock insuficiente. Disponible: ${item.stock} ${item.unit}.`);
    }

    return { beneficiary, family, item, quantity };
  }

  isDigitalSignatureRequired() {
    return this.configuracionService?.isDeliverySignatureRequired?.() === true;
  }

  async buildSignatureUpdate(delivery, beneficiary, payload = {}) {
    const uploaded = await this.repository.saveSignatureImages?.({
      delivery,
      beneficiary,
      signatureDataUrl: payload.signature_data_url,
      responsibleSignatureDataUrl: payload.responsible_signature_data_url
    });

    const now = new Date().toISOString();
    const update = {};

    if (hasSignature(payload.signature_data_url)) {
      update.signature_data_url = uploaded?.receiver?.dataUrl || payload.signature_data_url;
      update.signature_storage_bucket = uploaded?.receiver?.bucket || delivery.signature_storage_bucket || null;
      update.signature_storage_path = uploaded?.receiver?.path || delivery.signature_storage_path || null;
      update.signature_signed_at = now;
    }

    if (hasSignature(payload.responsible_signature_data_url)) {
      update.responsible_signature_data_url = uploaded?.responsible?.dataUrl || payload.responsible_signature_data_url;
      update.responsible_signature_storage_bucket = uploaded?.responsible?.bucket || delivery.responsible_signature_storage_bucket || null;
      update.responsible_signature_storage_path = uploaded?.responsible?.path || delivery.responsible_signature_storage_path || null;
      update.responsible_signature_signed_at = now;
    }

    return update;
  }

  async registerSignatureHistory(delivery, beneficiary, message) {
    return this.beneficiarioService.createSocialHistory({
      beneficiary_id: beneficiary.id,
      family_id: delivery.family_id || beneficiary.family_id || null,
      date: delivery.delivered_at || new Date().toISOString().slice(0, 10),
      entry_type: 'Firma digital',
      notes: `${message} Entrega ${delivery.receipt_number || delivery.id}.`
    });
  }
}
