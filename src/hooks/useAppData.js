import { useCallback, useEffect, useMemo, useState } from 'react';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion, isSystemSuperadmin } from '../lib/auth';
import { constrainRolePermissionMatrix } from '../lib/constants';
import { dataStore } from '../lib/dataStore';
import { sendEmailViaApi } from '../lib/emailClient';
import { nextBeneficiaryCode, nextReceiptNumber, normalize, normalizeDocument } from '../lib/formatters';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { getApiHeaders } from '../lib/apiAuth';

export function useAppData(enabled = true, currentUser = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await dataStore.loadAll());
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
    else setLoading(false);
  }, [enabled, reload]);

  async function audit(action) {
    try {
      await dataStore.create('audit_logs', {
        user_name: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.email : 'Sistema',
        user_email: currentUser?.email || '',
        action,
        happened_at: new Date().toISOString()
      });
    } catch (error) {
      console.warn('[Pan y Esperanza] No se pudo registrar auditoria:', error);
    }
  }

  function sanitizeBeneficiaryPayload(payload) {
    const {
      __family_mode,
      __new_family,
      __new_family_enabled,
      ...beneficiaryPayload
    } = payload || {};
    return {
      ...beneficiaryPayload,
      document_id: normalizeDocument(beneficiaryPayload.document_id),
      family_id: beneficiaryPayload.family_id || null
    };
  }

  function sanitizeFamilyPayload(payload) {
    return {
      family_code: String(payload?.family_code || '').trim(),
      responsible_name: String(payload?.responsible_name || '').trim(),
      address: String(payload?.address || '').trim(),
      phone: String(payload?.phone || '').trim(),
      email: String(payload?.email || '').trim(),
      dependents_count: Number(payload?.dependents_count || 0),
      status: payload?.status || 'Activa',
      notes: String(payload?.notes || '').trim(),
      archived_at: payload?.archived_at || null,
      archive_reason: String(payload?.archive_reason || '').trim(),
      updated_at: new Date().toISOString()
    };
  }

  function withFamilyArchiveMarker(notes, archivedAt, archivedBy, reason) {
    const cleanNotes = String(notes || '')
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('[FAMILIA_ARCHIVADA]'))
      .join('\n')
      .trim();
    const marker = `[FAMILIA_ARCHIVADA] ${archivedAt} | ${archivedBy || 'Usuario'} | ${String(reason || '').trim()}`.trim();
    return [cleanNotes, marker].filter(Boolean).join('\n');
  }

  function currentUserName() {
    return `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim()
      || currentUser?.email
      || 'Usuario';
  }

  function sanitizeInventoryItemPayload(payload) {
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

  function assertUniqueInventoryItem(payload, currentId) {
    const duplicate = data.inventory_items.find((item) => (
      item.id !== currentId
      && normalize(item.name) === normalize(payload.name)
      && normalize(item.lot) === normalize(payload.lot)
    ));
    if (duplicate) {
      throw new Error(`Ya existe ${payload.name}${payload.lot ? ` con el lote ${payload.lot}` : ' sin lote asignado'}.`);
    }
  }

  function sanitizeInventoryMovement(payload) {
    const movementType = payload?.movement_type;
    const quantity = Number(payload?.quantity || 0);
    const item = data.inventory_items.find((entry) => entry.id === payload?.item_id);
    if (!item) throw new Error('Selecciona un producto válido.');
    if (!['Entrada', 'Salida'].includes(movementType)) throw new Error('El tipo de movimiento no es válido.');
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

  function buildDeliveryTrackingNote(delivery, beneficiary, item, quantity) {
    const parts = [
      `Se registra una entrega de ${delivery.help_type || 'ayuda'} a ${beneficiary.full_name || 'la persona beneficiaria'}.`
    ];
    if (item?.name) parts.push(`Producto: ${item.name}.`);
    if (quantity) parts.push(`Cantidad: ${quantity}${item?.unit ? ` ${item.unit}` : ''}.`);
    if (delivery.receipt_number) parts.push(`Justificante: ${delivery.receipt_number}.`);
    parts.push(`Responsable: ${delivery.responsible || currentUserName()}.`);
    if (delivery.notes) parts.push(`Observaciones: ${delivery.notes}`);
    return parts.join(' ');
  }

  function isLastActiveSuperadmin(userId) {
    const existing = data.app_users.find((user) => user.id === userId);
    return existing?.role === 'Superadministrador'
      && data.app_users.filter((user) => user.role === 'Superadministrador' && user.is_active && (user.status || 'Activo') === 'Activo' && user.id !== userId).length === 0;
  }

  function sanitizeUserPayload(payload) {
    const status = payload.status || (payload.is_active === false ? 'Inactivo' : 'Activo');
    return {
      ...payload,
      permission_matrix: constrainRolePermissionMatrix(payload.role, payload.permission_matrix || {}),
      status,
      is_active: status === 'Activo'
    };
  }

  function assertPermission(moduleId, actionId) {
    if (!canDo(currentUser, moduleId, actionId)) {
      throw new Error(`No tienes permiso para ${actionId === 'delete' ? 'eliminar' : 'realizar esta acción'} en este módulo.`);
    }
  }

  function assertSuperadmin() {
    if (currentUser?.role !== 'Superadministrador') {
      throw new Error('Solo el Superadministrador puede eliminar entregas definitivamente.');
    }
  }

  function assertSystemSuperadmin() {
    if (!isSystemSuperadmin(currentUser)) {
      throw new Error('Solo el Superadministrador del sistema puede resolver solicitudes de eliminación.');
    }
  }

  function assertDeletionRequester(moduleId) {
    if (isSystemSuperadmin(currentUser)) {
      throw new Error('El Superadministrador del sistema debe resolver solicitudes desde el panel del proveedor.');
    }
    if (canDeleteDefinitively(currentUser, permissionModuleForDeletion(moduleId), data.organization_settings?.[0] || {})) {
      throw new Error('Pan y Esperanza puede eliminar definitivamente este registro sin enviar solicitud.');
    }
    if (!canRequestDefinitiveDeletion(currentUser, permissionModuleForDeletion(moduleId), data.organization_settings?.[0] || {})) {
      throw new Error('No tienes permiso para solicitar eliminaciones definitivas en este módulo.');
    }
  }

  function permissionModuleForDeletion(moduleId) {
    if (String(moduleId || '').startsWith('treasury_')) return 'accounting';
    if (moduleId === 'financial_accounts') return 'accounting';
    return moduleId;
  }

  function assertAccountingSuperadmin() {
    if (currentUser?.role !== 'Superadministrador') {
      throw new Error('Solo el Superadministrador puede anular o eliminar registros contables.');
    }
  }

  function userMeta() {
    return {
      created_by: currentUser?.id || null,
      created_by_name: currentUserName(),
      created_by_email: currentUser?.email || ''
    };
  }

  function associationMeta() {
    const organization = data.organization_settings?.[0] || {};
    return {
      association_id: organization.id || 'main',
      association_name: organization.name || 'Asociación sin nombre'
    };
  }

  function providerEmail() {
    const organization = data.organization_settings?.[0] || {};
    const systemOwner = (data.app_users || []).find((user) => isSystemSuperadmin(user));
    return import.meta.env.VITE_SYSTEM_PROVIDER_EMAIL
      || import.meta.env.VITE_PROVIDER_EMAIL
      || organization.system_provider_email
      || organization.provider_email
      || organization.platform_owner_email
      || systemOwner?.email
      || 'elizabeth@panyesperanza.org'
      || '';
  }

  async function notifyDeletionRequestProvider(request) {
    const to = providerEmail();
    if (!to) {
      await audit(`Solicitud de eliminación ${request.id} creada sin correo de proveedor configurado`);
      return;
    }
    await sendEmailViaApi({
      to,
      subject: `Solicitud de eliminación pendiente - ${request.association_name}`,
      message: [
        'Se ha recibido una solicitud de eliminación definitiva.',
        '',
        `Asociación: ${request.association_name}`,
        `Usuario: ${request.requester_name || request.requester_email || '-'}`,
        `Registro solicitado: ${request.record_label || request.record_id}`,
        `Módulo: ${request.module}`,
        `Motivo: ${request.reason}`,
        request.notes ? `Observaciones: ${request.notes}` : ''
      ].filter(Boolean).join('\n'),
      organization: data.organization_settings?.[0] || {}
    });
  }

  async function notifyDeletionRequestRejected(request, resolutionReason) {
    if (!request?.requester_email) return;
    await sendEmailViaApi({
      to: request.requester_email,
      subject: `Solicitud de eliminación rechazada - ${request.record_label || request.record_id}`,
      message: [
        'La solicitud de eliminación definitiva ha sido rechazada por el proveedor del sistema.',
        '',
        `Registro: ${request.record_label || request.record_id}`,
        `Motivo de la solicitud: ${request.reason}`,
        `Motivo del rechazo: ${resolutionReason}`
      ].join('\n'),
      organization: data.organization_settings?.[0] || {}
    });
  }

  async function trySendDeletionEmail(sender, auditMessage) {
    try {
      await sender();
    } catch (error) {
      console.warn('[eliminaciones] No se pudo enviar notificación:', error);
      await audit(`${auditMessage}: ${error.message || 'error de correo'}`);
    }
  }

  async function executeApprovedDeletionRequest(request) {
    const moduleId = request.module;
    const recordId = request.record_id;
    if (moduleId === 'deliveries') {
      await dataStore.remove('deliveries', recordId);
      return 'entrega';
    }
    if (moduleId === 'beneficiaries') {
      await dataStore.remove('beneficiaries', recordId);
      return 'beneficiario';
    }
    if (moduleId === 'inventory') {
      await dataStore.remove('inventory_items', recordId);
      return 'producto de inventario';
    }
    if (moduleId === 'donations') {
      await dataStore.remove('donations', recordId);
      return 'donación';
    }
    if (moduleId === 'treasury_incomes') {
      await dataStore.remove('treasury_incomes', recordId);
      return 'ingreso de tesoreria';
    }
    if (moduleId === 'treasury_expenses') {
      await dataStore.remove('treasury_expenses', recordId);
      return 'gasto de tesoreria';
    }
    if (moduleId === 'treasury_loans') {
      await dataStore.remove('treasury_loans', recordId);
      return 'préstamo de tesorería';
    }
    if (moduleId === 'treasury_accounts') {
      await dataStore.remove('treasury_accounts', recordId);
      return 'cuenta de tesoreria';
    }
    if (moduleId === 'financial_accounts') {
      await dataStore.remove('financial_accounts', recordId);
      return 'cuenta contable';
    }
    throw new Error(`El módulo ${moduleId} todavía no tiene ejecutor de eliminación definitiva.`);
  }

  async function accountingAuditTrail(tableName, recordId, action, previousData, nextData) {
    await dataStore.create('accounting_audit_trail', {
      table_name: tableName,
      record_id: recordId || null,
      action,
      previous_data: previousData || null,
      next_data: nextData || null,
      user_id: currentUser?.id || null,
      user_name: currentUserName(),
      user_email: currentUser?.email || '',
      happened_at: new Date().toISOString()
    });
  }

  function findFinancialAccount(accountId) {
    const account = (data.financial_accounts || []).find((item) => item.id === accountId);
    if (!account || account.status === 'voided' || account.is_active === false) {
      throw new Error('Selecciona una cuenta activa de Caja o Banco.');
    }
    return account;
  }

  function isCashAccount(account) {
    const type = normalize(account?.account_type || account?.name || '');
    return type === 'cash' || type.includes('caja') || type.includes('efectivo');
  }

  function movementDelta(movement) {
    const amount = Number(movement?.amount || 0);
    if (['cash_out', 'bank_out', 'transfer_out'].includes(movement?.movement_type)) return -amount;
    return amount;
  }

  function assertNoUnauthorizedNegativeBalance(account, nextBalance, allowNegativeBalance) {
    if (nextBalance >= 0) return;
    if (currentUser?.role === 'Superadministrador' && allowNegativeBalance === true) return;
    throw new Error(`La operación dejaría saldo negativo en ${account.name}. Saldo disponible: ${Number(account.current_balance || 0).toFixed(2)} EUR.`);
  }

  function operationDate(value) {
    return String(value || new Date().toISOString()).slice(0, 10);
  }

  function operationDateTime(value) {
    return value ? String(value) : new Date().toISOString().slice(0, 16);
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function normalizeReferencePrefix(value) {
    const normalized = normalize(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    return normalized ? normalized.slice(0, 10) : 'DON';
  }

  function collectOperationalReferences() {
    return [
      ...(data.donations || []).flatMap((item) => [item.reference, item.notes]),
      ...(data.cash_bank_movements || []).flatMap((item) => [item.reference, item.notes]),
      ...(data.accounting_documents || []).flatMap((item) => [item.document_number, item.notes]),
      ...(data.accounting_events || []).flatMap((item) => [item.title, item.description])
    ].filter(Boolean).map(String);
  }

  function nextDonationReference(donorName, dateValue = new Date()) {
    const year = new Date(dateValue).getFullYear();
    const prefix = normalizeReferencePrefix(donorName);
    const references = collectOperationalReferences();
    const pattern = new RegExp(`${prefix}-${year}-(\\d{6})`, 'i');
    let last = references.reduce((max, value) => {
      const match = value.match(pattern);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let candidate = '';
    do {
      last += 1;
      candidate = `${prefix}-${year}-${String(last).padStart(6, '0')}`;
    } while (references.some((value) => value.includes(candidate)));
    return candidate;
  }

  function nextInternalDocumentNumber(dateValue = new Date()) {
    const year = new Date(dateValue).getFullYear();
    const references = collectOperationalReferences();
    const last = references.reduce((max, value) => {
      const match = String(value || '').match(new RegExp(`INT-${year}-(\\d{6})`, 'i'));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `INT-${year}-${String(last + 1).padStart(6, '0')}`;
  }

  function isInternalDocumentType(value) {
    const type = normalize(value);
    return type === 'documento interno' || type === 'document_internal' || type === 'internal_document' || type === 'sin documento' || type === 'no_document';
  }

  function assertPositiveNumber(value, label = 'El importe') {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} debe ser mayor que cero.`);
    return amount;
  }

  function positiveNumberOrNull(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return null;
  }

  function roundCurrency(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function inventoryItemUnitValue(item) {
    return positiveNumberOrNull(item?.unit_value, item?.estimated_unit_value, item?.economic_value, item?.price, item?.cost);
  }

  function latestSocialUnitValueForItem(itemId) {
    if (!itemId) return null;
    const event = activeAccountingRows(data.social_value_events || [])
      .filter((entry) => entry.value_type === 'received' && entry.inventory_item_id === itemId)
      .sort((a, b) => String(b.social_value_at || b.created_at || '').localeCompare(String(a.social_value_at || a.created_at || '')))[0];
    const quantity = positiveNumberOrNull(event?.quantity);
    const amount = positiveNumberOrNull(event?.amount);
    return quantity !== null && amount !== null ? roundCurrency(amount / quantity) : null;
  }

  function resolveInventoryUnitValueForOperation(payload, item, quantity) {
    const automaticValue = inventoryItemUnitValue(item) ?? latestSocialUnitValueForItem(item?.id);
    if (automaticValue !== null) return automaticValue;
    const explicitUnitValue = positiveNumberOrNull(payload.inventory_unit_value, payload.unit_value, payload.estimated_unit_value);
    if (explicitUnitValue !== null) return explicitUnitValue;
    const legacyTotal = positiveNumberOrNull(payload.amount, payload.estimated_value);
    return legacyTotal !== null && quantity > 0 ? roundCurrency(legacyTotal / quantity) : null;
  }

  function accountMovementType(account, direction) {
    return `${isCashAccount(account) ? 'cash' : 'bank'}_${direction}`;
  }

  function inactiveAccountingStatus(value) {
    const status = normalize(value || '');
    return status.includes('void')
      || status.includes('anulad')
      || status.includes('cancel')
      || status.includes('correct')
      || status.includes('corregid')
      || status.includes('revers')
      || status.includes('revert');
  }

  function accountingEventForRow(row) {
    if (!row?.accounting_event_id) return null;
    return (data.accounting_events || []).find((event) => event.id === row.accounting_event_id) || null;
  }

  function isActiveAccountingRow(row) {
    return !inactiveAccountingStatus(row?.status || row?.state)
      && !inactiveAccountingStatus(accountingEventForRow(row)?.status);
  }

  function activeAccountingRows(rows = []) {
    return rows.filter(isActiveAccountingRow);
  }

  function outstandingLoanAmount(loan) {
    if (!isActiveAccountingRow(loan)) return 0;
    const paid = activeAccountingRows(data.loan_movements || [])
      .filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received')
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(loan.principal_amount || 0) - paid);
  }

  function outstandingDebtAmount(debt) {
    if (!isActiveAccountingRow(debt)) return 0;
    const paid = activeAccountingRows(data.debt_movements || [])
      .filter((movement) => movement.debt_id === debt.id)
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(debt.original_amount || 0) - paid);
  }

  async function getOrCreateAccountingContact(contactType, payload = {}) {
    const safeType = ['supplier', 'donor', 'lender', 'creditor', 'beneficiary', 'other'].includes(contactType) ? contactType : 'other';
    const contactId = cleanText(payload.contact_id || payload.id);
    if (contactId) {
      const existingById = (data.accounting_contacts || []).find((contact) => (
        contact.id === contactId
        && normalize(contact.contact_type || 'other') === normalize(safeType)
      ));
      if (existingById) return existingById;
    }
    const name = cleanText(payload.name || payload.contact_name);
    if (!name && !contactId) return null;
    const existing = name ? (data.accounting_contacts || []).find((contact) => (
      normalize(contact.name) === normalize(name)
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (existing) return existing;
    const latestContacts = await dataStore.list('accounting_contacts').catch(() => data.accounting_contacts || []);
    const latestById = contactId ? (latestContacts || []).find((contact) => (
      contact.id === contactId
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (latestById) return latestById;
    if (!name) return null;
    const latestExisting = name ? (latestContacts || []).find((contact) => (
      normalize(contact.name) === normalize(name)
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    )) : null;
    if (latestExisting) return latestExisting;
    const contact = await dataStore.create('accounting_contacts', {
      contact_type: safeType,
      name,
      document_id: cleanText(payload.document_id),
      email: cleanText(payload.email),
      phone: cleanText(payload.phone),
      address: cleanText(payload.address),
      notes: cleanText(payload.notes),
      is_active: true
    });
    await accountingAuditTrail('accounting_contacts', contact.id, 'create', null, contact);
    return contact;
  }

  function sanitizeDonorContactPayload(payload = {}, current = {}) {
    const name = cleanText(payload.name || payload.contact_name || current.name);
    if (!name) throw new Error('El nombre del donante es obligatorio.');
    return {
      contact_type: 'donor',
      name,
      document_id: cleanText(payload.document_id),
      email: cleanText(payload.email),
      phone: cleanText(payload.phone),
      address: cleanText(payload.address),
      notes: cleanText(payload.notes),
      is_active: payload.is_active !== undefined ? payload.is_active !== false : current.is_active !== false,
      updated_at: new Date().toISOString()
    };
  }

  function donorHasDonationRelations(contact) {
    if (!contact) return false;
    const contactId = contact.id;
    const donorName = normalize(contact.name);
    return (data.accounting_events || []).some((event) => event.contact_id === contactId && event.event_type === 'donation_money' && isActiveAccountingRow(event))
      || (data.social_value_events || []).some((event) => event.contact_id === contactId && event.value_type === 'received' && event.event_type === 'in_kind_donation' && isActiveAccountingRow(event))
      || (data.donations || []).some((donation) => normalize(donation.donor) === donorName && !['voided', 'anulada', 'anulado'].includes(normalize(donation.status || donation.state)))
      || (data.treasury_incomes || []).some((income) => normalize(income.donor) === donorName && normalize([income.category, income.concept].join(' ')).includes('donacion'));
  }

  async function createAccountingEvent(payload) {
    const event = await dataStore.create('accounting_events', {
      status: 'active',
      currency: 'EUR',
      source_module: 'accounting',
      ...payload,
      ...userMeta()
    });
    await accountingAuditTrail('accounting_events', event.id, 'create', null, event);
    return event;
  }

  async function updateAccountingEventSource(event, sourceModule, sourceRecordId) {
    if (!event?.id || !sourceRecordId) return event;
    const updated = await dataStore.update('accounting_events', event.id, {
      source_module: sourceModule,
      source_record_id: sourceRecordId,
      updated_at: new Date().toISOString()
    });
    await accountingAuditTrail('accounting_events', event.id, 'update_source', event, updated);
    return updated;
  }

  async function createCashBankMovementForEvent({ event, account, movementType, amount, date, paymentMethod, reference, notes, allowNegativeBalance }) {
    const nextBalance = Number(account.current_balance || 0) + movementDelta({ movement_type: movementType, amount });
    assertNoUnauthorizedNegativeBalance(account, nextBalance, allowNegativeBalance === true);
    const movement = await dataStore.create('cash_bank_movements', {
      accounting_event_id: event.id,
      financial_account_id: account.id,
      movement_type: movementType,
      amount,
      currency: 'EUR',
      movement_at: date,
      payment_method: movementType.startsWith('cash') ? 'Efectivo' : cleanText(paymentMethod) || 'Transferencia',
      reference: cleanText(reference),
      status: 'active',
      notes: cleanText(notes),
      ...userMeta()
    });
    await accountingAuditTrail('cash_bank_movements', movement.id, 'create', null, movement);
    await applyAccountBalance(account, nextBalance, 'balance_update');
    return movement;
  }

  async function createEconomicDocument(eventId, payload, amount, date, contactId = null, forceDocument = false) {
    const documentPayload = buildAccountingDocumentPayload({
      ...payload,
      contact_id: contactId,
      force_document: forceDocument
    }, amount, date);
    return createAccountingDocumentForEvent(eventId, documentPayload);
  }

  async function registerInventoryEntryForOperation(item, payload, quantity, notes) {
    const movedAt = operationDate(payload.operation_at || payload.moved_at);
    const responsible = cleanText(payload.responsible) || currentUserName();
    if (hasSupabaseConfig) {
      const { data: movement, error } = await supabase.rpc('register_inventory_movement', {
        p_item_id: item.id,
        p_movement_type: 'Entrada',
        p_quantity: quantity,
        p_moved_at: movedAt,
        p_responsible: responsible,
        p_notes: notes
      });
      if (error) throw error;
      return movement;
    }
    const nextStock = Number(item.stock || 0) + quantity;
    await dataStore.update('inventory_items', item.id, { stock: nextStock });
    const movement = await dataStore.create('inventory_movements', {
      item_id: item.id,
      item_name: item.name,
      movement_type: 'Entrada',
      quantity,
      moved_at: movedAt,
      responsible,
      notes
    });
    await audit(`Registro entrada de inventario ${item.name}`.trim());
    return movement;
  }

  async function resolveInventoryItemForOperation(payload, donorName = '') {
    if (payload.inventory_item_mode !== 'new') {
      const item = (data.inventory_items || []).find((entry) => entry.id === payload.inventory_item_id);
      if (!item) throw new Error('Selecciona un producto de inventario.');
      return item;
    }
    const existing = (data.inventory_items || []).find((entry) => (
      normalize(entry.name) === normalize(payload.inventory_name)
      && normalize(entry.lot) === normalize(payload.inventory_lot)
    ));
    if (existing) return existing;
    const itemPayload = sanitizeInventoryItemPayload({
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
    assertUniqueInventoryItem(itemPayload);
    const created = await dataStore.create('inventory_items', {
      ...itemPayload,
      ...(!hasSupabaseConfig ? { stock: 0 } : {})
    });
    await audit(`Creo producto de inventario ${created.name}`.trim());
    return created;
  }

  async function registerMonetaryEconomicOperation(payload, options) {
    const amount = assertPositiveNumber(payload.amount);
    const date = operationDate(payload.operation_at);
    const account = findFinancialAccount(payload.financial_account_id);
    const contact = await getOrCreateAccountingContact(options.contactType, {
      contact_id: payload.contact_id || (options.contactType === 'donor' ? payload.donor_contact_id : ''),
      name: options.contactName,
      document_id: payload.contact_document_id,
      email: payload.contact_email,
      phone: payload.contact_phone,
      address: payload.contact_address
    });
    const title = cleanText(payload.concept) || options.defaultConcept;
    const event = await createAccountingEvent({
      event_type: options.eventType,
      occurred_at: date,
      title,
      description: cleanText(payload.notes) || `${options.label}. Fecha y hora operativa: ${operationDateTime(payload.operation_at)}`,
      amount,
      contact_id: contact?.id || null,
      financial_account_id: account.id,
      source_module: options.sourceModule || 'accounting',
      source_record_id: options.sourceRecordId || null
    });
    await createEconomicDocument(event.id, {
      ...payload,
      document_type: payload.document_type || options.documentType
    }, amount, date, contact?.id || null, options.forceDocument);
    const movement = await createCashBankMovementForEvent({
      event,
      account,
      movementType: accountMovementType(account, options.direction),
      amount,
      date,
      paymentMethod: payload.payment_method,
      reference: payload.reference,
      notes: title,
      allowNegativeBalance: payload.allow_negative_balance
    });
    return { amount, date, account, contact, event, movement, title };
  }

  async function performBankTransfer(payload) {
    const source = findFinancialAccount(payload?.from_account_id);
    const target = findFinancialAccount(payload?.to_account_id);
    if (source.id === target.id) throw new Error('La cuenta origen y destino deben ser diferentes.');
    const amount = assertPositiveNumber(payload?.amount);
    const reason = cleanText(payload?.reason || payload?.concept);
    if (reason.length < 3) throw new Error('El motivo es obligatorio.');
    const sourceNextBalance = Number(source.current_balance || 0) - amount;
    assertNoUnauthorizedNegativeBalance(source, sourceNextBalance, payload?.allow_negative_balance === true);
    const targetNextBalance = Number(target.current_balance || 0) + amount;
    const movementDate = operationDate(payload?.movement_datetime || payload?.operation_at || payload?.movement_at);
    const createdEvent = await createAccountingEvent({
      event_type: 'correction',
      occurred_at: movementDate,
      title: reason,
      description: `Transferencia interna de ${source.name} a ${target.name}. Fecha y hora operativa: ${operationDateTime(payload?.movement_datetime || payload?.operation_at)}`,
      amount,
      financial_account_id: source.id
    });
    const outMovement = await dataStore.create('cash_bank_movements', {
      accounting_event_id: createdEvent.id,
      financial_account_id: source.id,
      movement_type: 'transfer_out',
      amount,
      currency: 'EUR',
      movement_at: movementDate,
      payment_method: 'Transferencia',
      reference: cleanText(payload?.reference),
      status: 'active',
      notes: reason,
      ...userMeta()
    });
    const inMovement = await dataStore.create('cash_bank_movements', {
      accounting_event_id: createdEvent.id,
      financial_account_id: target.id,
      movement_type: 'transfer_in',
      amount,
      currency: 'EUR',
      movement_at: movementDate,
      payment_method: 'Transferencia',
      reference: cleanText(payload?.reference),
      status: 'active',
      notes: reason,
      ...userMeta()
    });
    await accountingAuditTrail('cash_bank_movements', outMovement.id, 'create', null, outMovement);
    await accountingAuditTrail('cash_bank_movements', inMovement.id, 'create', null, inMovement);
    await createAccountingDocumentForEvent(createdEvent.id, buildAccountingDocumentPayload(payload, amount, movementDate));
    await applyAccountBalance(source, sourceNextBalance, 'balance_update');
    await applyAccountBalance(target, targetNextBalance, 'balance_update');
    await audit(`Contabilidad: transferencia ${source.name} a ${target.name}`.trim());
  }

  async function performEconomicOperation(payload) {
    assertPermission('accounting', 'create');
    const operationType = payload?.operation_type;
    if (operationType === 'income') {
      await registerMonetaryEconomicOperation(payload, {
        eventType: 'income',
        direction: 'in',
        contactType: 'other',
        contactName: payload.contact_name,
        defaultConcept: 'Ingreso',
        label: 'Ingreso',
        documentType: 'receipt',
        forceDocument: false
      });
      await audit(`Contabilidad: nueva operación ingreso ${payload.concept || ''}`.trim());
      return;
    }
    if (operationType === 'expense') {
      await registerMonetaryEconomicOperation(payload, {
        eventType: 'expense',
        direction: 'out',
        contactType: 'supplier',
        contactName: payload.supplier_name || payload.contact_name,
        defaultConcept: 'Gasto',
        label: 'Gasto',
        documentType: 'ticket',
        forceDocument: true
      });
      await audit(`Contabilidad: nueva operación gasto ${payload.concept || ''}`.trim());
      return;
    }
    if (operationType === 'donation_money') {
      const date = operationDate(payload.operation_at);
      const reference = cleanText(payload.reference) || nextDonationReference(payload.donor_name || payload.contact_name, date);
      await registerMonetaryEconomicOperation({
        ...payload,
        reference,
        document_number: payload.document_number || reference
      }, {
        eventType: 'donation_money',
        direction: 'in',
        contactType: 'donor',
        contactName: payload.donor_name || payload.contact_name,
        defaultConcept: 'Donación monetaria',
        label: 'Donación monetaria',
        documentType: 'receipt',
        forceDocument: false
      });
      await audit(`Contabilidad: donación monetaria ${payload.donor_name || ''}`.trim());
      return;
    }
    if (operationType === 'economic_help') {
      const beneficiary = (data.beneficiaries || []).find((item) => item.id === payload.beneficiary_id);
      const result = await registerMonetaryEconomicOperation(payload, {
        eventType: 'expense',
        direction: 'out',
        contactType: 'beneficiary',
        contactName: beneficiary?.full_name || payload.beneficiary_name || payload.contact_name,
        defaultConcept: 'Ayuda económica',
        label: 'Ayuda económica',
        documentType: 'proof',
        forceDocument: true,
        sourceModule: 'beneficiaries',
        sourceRecordId: beneficiary?.id || null
      });
      const socialEvent = await dataStore.create('social_value_events', {
        accounting_event_id: result.event.id,
        value_type: 'delivered',
        event_type: 'delivery',
        social_value_at: result.date,
        amount: result.amount,
        currency: 'EUR',
        source_module: 'beneficiaries',
        source_record_id: beneficiary?.id || null,
        beneficiary_id: beneficiary?.id || null,
        contact_id: result.contact?.id || null,
        status: 'active',
        notes: result.title,
        ...userMeta()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'create', null, socialEvent);
      await audit(`Contabilidad: ayuda económica ${beneficiary?.full_name || payload.beneficiary_name || ''}`.trim());
      return;
    }
    if (operationType === 'inventory_purchase') {
      const supplierName = cleanText(payload.supplier_name || payload.contact_name);
      const item = await resolveInventoryItemForOperation(payload, supplierName);
      const quantity = assertPositiveNumber(payload.quantity, 'La cantidad');
      const result = await registerMonetaryEconomicOperation(payload, {
        eventType: 'purchase',
        direction: 'out',
        contactType: 'supplier',
        contactName: supplierName,
        defaultConcept: 'Compra de inventario',
        label: 'Compra de inventario',
        documentType: 'invoice',
        forceDocument: true
      });
      const inventoryMovement = await registerInventoryEntryForOperation(item, payload, quantity, `Compra registrada en Contabilidad: ${result.title}`);
      await updateAccountingEventSource(result.event, 'inventory', inventoryMovement?.id);
      await audit(`Contabilidad: compra de inventario ${item.name}`.trim());
      return;
    }
    if (operationType === 'donation_in_kind') {
      const quantity = assertPositiveNumber(payload.quantity, 'La cantidad');
      const date = operationDate(payload.operation_at);
      const donorName = cleanText(payload.donor_name || payload.contact_name);
      const contact = await getOrCreateAccountingContact('donor', {
        contact_id: payload.donor_contact_id || payload.contact_id,
        name: donorName,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      const item = await resolveInventoryItemForOperation(payload, donorName);
      const unitValue = resolveInventoryUnitValueForOperation(payload, item, quantity);
      if (unitValue === null) throw new Error('Indica el valor unitario estimado de la donación en especie.');
      const amount = roundCurrency(quantity * unitValue);
      const title = cleanText(payload.concept) || `Donación en especie: ${item.name}`;
      const reference = cleanText(payload.reference) || nextDonationReference(donorName || item.donor || item.name, date);
      const event = await createAccountingEvent({
        event_type: 'donation_in_kind',
        occurred_at: date,
        title,
        description: [cleanText(payload.notes) || 'Donación en especie registrada sin afectar caja ni banco.', `Referencia: ${reference}`].filter(Boolean).join(' '),
        amount,
        contact_id: contact?.id || null,
        financial_account_id: null
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'receipt',
        document_number: payload.document_number || reference,
        reference
      }, amount, date, contact?.id || null, true);
      const donation = await dataStore.create('donations', {
        donor: donorName || 'Donante',
        donor_kind: payload.donor_kind || 'Particular',
        donation_type: payload.donation_type || item.category || item.name,
        donated_at: date,
        estimated_value: amount,
        notes: [`Referencia: ${reference}`, cleanText(payload.notes || title)].filter(Boolean).join('\n')
      });
      const inventoryMovement = await registerInventoryEntryForOperation(item, payload, quantity, `Donación en especie: ${title}`);
      const socialEvent = await dataStore.create('social_value_events', {
        accounting_event_id: event.id,
        value_type: 'received',
        event_type: 'in_kind_donation',
        social_value_at: date,
        amount,
        currency: 'EUR',
        source_module: 'donations',
        source_record_id: donation.id,
        inventory_item_id: item.id,
        contact_id: contact?.id || null,
        quantity,
        unit: item.unit || payload.inventory_unit || '',
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'create', null, socialEvent);
      await updateAccountingEventSource(event, 'donations', donation.id);
      await audit(`Contabilidad: donación en especie ${donorName || item.name}`.trim());
      return;
    }
    if (operationType === 'loan_received') {
      const amount = assertPositiveNumber(payload.amount);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = await getOrCreateAccountingContact('lender', {
        name: payload.lender_name || payload.contact_name,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      if (!contact) throw new Error('Indica quién concede el préstamo.');
      const title = cleanText(payload.concept) || 'Préstamo recibido';
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Préstamo recibido registrado automáticamente.',
        amount,
        contact_id: contact.id,
        financial_account_id: account.id
      });
      const document = await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'contract'
      }, amount, date, contact.id, true);
      const loan = await dataStore.create('loan_records', {
        accounting_event_id: event.id,
        contact_id: contact.id,
        document_id: document?.id || null,
        loan_at: date,
        principal_amount: amount,
        currency: 'EUR',
        reason: title,
        status: 'active',
        notes: cleanText(payload.notes),
        ...userMeta()
      });
      await accountingAuditTrail('loan_records', loan.id, 'create', null, loan);
      const loanMovement = await dataStore.create('loan_movements', {
        loan_id: loan.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: 'loan_received',
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('loan_movements', loanMovement.id, 'create', null, loanMovement);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'in'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      await updateAccountingEventSource(event, 'loan_records', loan.id);
      await audit(`Contabilidad: préstamo recibido ${title}`.trim());
      return;
    }
    if (operationType === 'loan_repayment') {
      const loan = activeAccountingRows(data.loan_records || []).find((item) => item.id === payload.loan_id);
      if (!loan) throw new Error('Selecciona un préstamo pendiente.');
      const outstanding = outstandingLoanAmount(loan);
      if (outstanding <= 0) throw new Error('Este préstamo no tiene saldo pendiente.');
      const amount = assertPositiveNumber(payload.amount);
      if (amount > outstanding) throw new Error(`El importe supera el saldo pendiente del préstamo: ${outstanding.toFixed(2)} EUR.`);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = (data.accounting_contacts || []).find((item) => item.id === loan.contact_id);
      const title = cleanText(payload.concept) || `Devolución de préstamo: ${loan.reason}`;
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Devolución de préstamo registrada automáticamente.',
        amount,
        contact_id: loan.contact_id,
        financial_account_id: account.id,
        source_module: 'loan_records',
        source_record_id: loan.id
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'proof'
      }, amount, date, loan.contact_id, true);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'out'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      const nextOutstanding = Math.max(0, outstanding - amount);
      const movementType = nextOutstanding === 0 ? 'full_repayment' : 'partial_repayment';
      const loanMovement = await dataStore.create('loan_movements', {
        loan_id: loan.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('loan_movements', loanMovement.id, 'create', null, loanMovement);
      const updatedLoan = await dataStore.update('loan_records', loan.id, {
        status: nextOutstanding === 0 ? 'repaid' : 'partially_repaid',
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('loan_records', loan.id, 'update_status', loan, updatedLoan);
      await audit(`Contabilidad: devolución de préstamo ${contact?.name || loan.reason}`.trim());
      return;
    }
    if (operationType === 'supplier_debt') {
      const amount = assertPositiveNumber(payload.amount);
      const date = operationDate(payload.operation_at);
      const contact = await getOrCreateAccountingContact('supplier', {
        name: payload.supplier_name || payload.contact_name,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      if (!contact) throw new Error('Indica el proveedor o acreedor.');
      const title = cleanText(payload.concept) || 'Deuda con proveedor';
      const event = await createAccountingEvent({
        event_type: 'debt',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Deuda registrada sin salida inmediata de caja o banco.',
        amount,
        contact_id: contact.id,
        financial_account_id: null
      });
      const document = await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'invoice'
      }, amount, date, contact.id, true);
      const debt = await dataStore.create('debt_records', {
        accounting_event_id: event.id,
        contact_id: contact.id,
        document_id: document?.id || null,
        debt_at: date,
        due_at: payload.due_at || null,
        original_amount: amount,
        currency: 'EUR',
        reason: title,
        status: 'active',
        notes: cleanText(payload.notes),
        ...userMeta()
      });
      await accountingAuditTrail('debt_records', debt.id, 'create', null, debt);
      await updateAccountingEventSource(event, 'debt_records', debt.id);
      await audit(`Contabilidad: deuda con proveedor ${contact.name}`.trim());
      return;
    }
    if (operationType === 'debt_payment') {
      const debt = activeAccountingRows(data.debt_records || []).find((item) => item.id === payload.debt_id);
      if (!debt) throw new Error('Selecciona una deuda pendiente.');
      const outstanding = outstandingDebtAmount(debt);
      if (outstanding <= 0) throw new Error('Esta deuda no tiene saldo pendiente.');
      const amount = assertPositiveNumber(payload.amount);
      if (amount > outstanding) throw new Error(`El importe supera el saldo pendiente de la deuda: ${outstanding.toFixed(2)} EUR.`);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = (data.accounting_contacts || []).find((item) => item.id === debt.contact_id);
      const title = cleanText(payload.concept) || `Pago de deuda: ${debt.reason}`;
      const event = await createAccountingEvent({
        event_type: 'debt',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Pago de deuda registrado automáticamente.',
        amount,
        contact_id: debt.contact_id,
        financial_account_id: account.id,
        source_module: 'debt_records',
        source_record_id: debt.id
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'proof'
      }, amount, date, debt.contact_id, true);
      await createCashBankMovementForEvent({
        event,
        account,
        movementType: accountMovementType(account, 'out'),
        amount,
        date,
        paymentMethod: payload.payment_method,
        reference: payload.reference,
        notes: title,
        allowNegativeBalance: payload.allow_negative_balance
      });
      const nextOutstanding = Math.max(0, outstanding - amount);
      const movementType = nextOutstanding === 0 ? 'full_payment' : 'partial_payment';
      const debtMovement = await dataStore.create('debt_movements', {
        debt_id: debt.id,
        accounting_event_id: event.id,
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        payment_at: date,
        status: 'active',
        notes: title,
        ...userMeta()
      });
      await accountingAuditTrail('debt_movements', debtMovement.id, 'create', null, debtMovement);
      const updatedDebt = await dataStore.update('debt_records', debt.id, {
        status: nextOutstanding === 0 ? 'paid' : 'partially_paid',
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('debt_records', debt.id, 'update_status', debt, updatedDebt);
      await audit(`Contabilidad: pago de deuda ${contact?.name || debt.reason}`.trim());
      return;
    }
    if (operationType === 'transfer') {
      await performBankTransfer({
        ...payload,
        from_account_id: payload.from_account_id,
        to_account_id: payload.to_account_id,
        reason: payload.concept || payload.reason
      });
      return;
    }
    throw new Error('Selecciona un tipo de operación válido.');
  }

  function sanitizeFinancialAccountPayload(payload, initial = {}) {
    const name = String(payload?.name || '').trim();
    const accountType = payload?.account_type || 'cash';
    const allowed = ['cash', 'bank', 'bizum', 'paypal', 'card', 'other'];
    const openingBalance = Number(payload?.opening_balance || 0);
    if (!name) throw new Error('El nombre de la cuenta es obligatorio.');
    if (!allowed.includes(accountType)) throw new Error('El tipo de cuenta no es válido.');
    if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('El saldo inicial no puede ser negativo.');
    return {
      name,
      account_type: accountType,
      bank_name: String(payload?.bank_name || '').trim(),
      account_number: String(payload?.account_number || '').trim(),
      iban: String(payload?.iban || '').trim(),
      currency: 'EUR',
      opening_balance: initial.id ? Number(initial.opening_balance || 0) : openingBalance,
      current_balance: initial.id ? Number(initial.current_balance || 0) : openingBalance,
      status: initial.status || 'active',
      is_active: initial.is_active !== false,
      notes: String(payload?.notes || '').trim()
    };
  }

  function sanitizeCashBankMovementPayload(payload, forcedType) {
    const movementType = forcedType || payload?.movement_type;
    const allowed = ['cash_in', 'cash_out', 'bank_in', 'bank_out'];
    const amount = Number(payload?.amount || 0);
    const reason = String(payload?.reason || payload?.notes || '').trim();
    if (!allowed.includes(movementType)) throw new Error('El tipo de movimiento no es válido.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El importe debe ser mayor que cero.');
    if (reason.length < 3) throw new Error('El motivo es obligatorio.');
    const account = findFinancialAccount(payload?.financial_account_id);
    if (movementType.startsWith('cash') && !isCashAccount(account)) throw new Error('Selecciona una cuenta de caja para movimientos de efectivo.');
    if (movementType.startsWith('bank') && isCashAccount(account)) throw new Error('Selecciona una cuenta bancaria para movimientos de banco.');
    return {
      account,
      movement: {
        financial_account_id: account.id,
        movement_type: movementType,
        amount,
        currency: 'EUR',
        movement_at: operationDate(payload?.movement_datetime || payload?.movement_at),
        payment_method: movementType.startsWith('cash') ? 'Efectivo' : String(payload?.payment_method || 'Transferencia').trim(),
        reference: String(payload?.reference || '').trim(),
        status: 'active',
        notes: reason,
        ...userMeta()
      },
      event: {
        event_type: movementType.endsWith('_in') ? 'income' : 'expense',
        occurred_at: operationDate(payload?.movement_datetime || payload?.movement_at),
        title: reason,
        description: `Fecha y hora operativa: ${operationDateTime(payload?.movement_datetime)}${payload?.reference ? `. Referencia: ${payload.reference}` : ''}`,
        amount,
        currency: 'EUR',
        status: 'active',
        financial_account_id: account.id,
        source_module: 'accounting',
        ...userMeta()
      },
      document: buildAccountingDocumentPayload(payload, amount, operationDate(payload?.movement_datetime || payload?.movement_at))
    };
  }

  function buildAccountingDocumentPayload(payload, amount, documentAt) {
    const fileName = String(payload?.document_name || '').trim();
    const fileDataUrl = String(payload?.document_data_url || '').trim();
    const internalDocument = isInternalDocumentType(payload?.document_type);
    const documentNumber = String(payload?.document_number || '').trim() || (internalDocument ? nextInternalDocumentNumber(documentAt) : '');
    if (!fileName && !fileDataUrl && !documentNumber && payload?.force_document !== true) return null;
    const responsible = currentUserName();
    const concept = cleanText(payload?.concept || payload?.reason || payload?.notes || 'Operación registrada');
    const donor = cleanText(payload?.donor_name || payload?.contact_name || payload?.supplier_name || payload?.lender_name || payload?.creditor_name);
    const internalNotes = internalDocument
      ? [
        'Justificante interno generado automáticamente.',
        donor ? `Donante/persona o entidad: ${donor}.` : '',
        `Concepto: ${concept}.`,
        `Responsable: ${responsible}.`
      ].filter(Boolean).join(' ')
      : '';
    return {
      contact_id: payload?.contact_id || null,
      document_type: payload?.document_type || 'proof',
      document_number: documentNumber,
      document_at: documentAt,
      due_at: payload?.due_at || null,
      amount: Number(amount || 0),
      currency: 'EUR',
      file_name: fileName,
      file_data_url: fileDataUrl,
      status: 'active',
      notes: [String(payload?.document_notes || '').trim(), internalNotes].filter(Boolean).join('\n'),
      ...userMeta()
    };
  }

  async function createAccountingDocumentForEvent(eventId, documentPayload) {
    if (!documentPayload) return null;
    const document = await dataStore.create('accounting_documents', {
      ...documentPayload,
      accounting_event_id: eventId
    });
    await accountingAuditTrail('accounting_documents', document.id, 'create', null, document);
    return document;
  }

  async function applyAccountBalance(account, nextBalance, actionLabel) {
    const previous = { ...account };
    const updated = await dataStore.update('financial_accounts', account.id, {
      current_balance: nextBalance,
      updated_at: new Date().toISOString()
    });
    await accountingAuditTrail('financial_accounts', account.id, actionLabel, previous, updated);
    return updated;
  }

  async function readApiJson(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: 'Respuesta no válida del servidor.' };
    }
  }

  function formatApiError(result, fallback) {
    const base = result.error || fallback;
    if (!result.step) return base;
    const details = result.details ? ` Detalles: ${JSON.stringify(result.details)}` : '';
    return `${base} Paso: ${result.step}.${details}`;
  }

  async function adminUserRequest(action, payload = {}) {
    const response = await fetch('/api/admin-user', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({ action, ...payload })
    });
    const result = await readApiJson(response);
    if (!response.ok) throw new Error(formatApiError(result, 'No se pudo completar la operación de usuarios.'));
    return result;
  }

  function isMissingCancelDeliveryRpcError(error) {
    const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return text.includes('pgrst202')
      || text.includes('could not find the function')
      || text.includes('cancel_delivery')
      || text.includes('schema cache');
  }

  function deliverySocialEventMatches(delivery, event) {
    if (!delivery || event?.event_type !== 'delivery') return false;
    if (event.source_module === 'deliveries' && event.source_record_id === delivery.id) return true;
    return event.source_module === 'beneficiaries'
      && event.source_record_id === delivery.beneficiary_id
      && event.social_value_at === delivery.delivered_at;
  }

  async function voidDeliverySocialValueEvents(delivery, reason) {
    const socialEvents = activeAccountingRows(data.social_value_events || [])
      .filter((event) => deliverySocialEventMatches(delivery, event));
    for (const socialEvent of socialEvents) {
      const updated = await dataStore.update('social_value_events', socialEvent.id, {
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: reason,
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('social_value_events', socialEvent.id, 'void_delivery', socialEvent, updated);
    }
  }

  async function cancelDeliveryWithoutRpc(delivery, cleanReason) {
    if (currentUser?.role !== 'Superadministrador') {
      throw new Error('La función de anulación no está disponible en Supabase. Solo el Superadministrador puede usar la ruta de recuperación segura.');
    }

    const cancelledAt = new Date().toISOString();
    const cancelledByName = currentUserName();
    const item = data.inventory_items.find((entry) => entry.id === delivery.inventory_item_id);

    if (hasSupabaseConfig && item) {
      const { error } = await supabase.rpc('register_inventory_movement', {
        p_item_id: item.id,
        p_moved_at: cancelledAt.slice(0, 10),
        p_movement_type: 'Entrada',
        p_notes: `Reversión por anulación de entrega: ${cleanReason}`,
        p_quantity: Number(delivery.quantity || 0),
        p_responsible: cancelledByName
      });
      if (error) throw error;
    } else if (item) {
      await dataStore.update('inventory_items', item.id, { stock: Number(item.stock || 0) + Number(delivery.quantity || 0) });
      await dataStore.create('inventory_movements', {
        item_id: item.id,
        item_name: item.name,
        movement_type: 'Entrada',
        quantity: Number(delivery.quantity || 0),
        moved_at: cancelledAt,
        responsible: cancelledByName,
        notes: `Reversión por anulación de entrega: ${cleanReason}`
      });
    }

    const updatedDelivery = await dataStore.update('deliveries', delivery.id, {
      status: 'Anulada',
      cancelled_at: cancelledAt,
      cancelled_by: currentUser?.id || null,
      cancelled_by_name: cancelledByName,
      cancellation_reason: cleanReason
    });
    await voidDeliverySocialValueEvents(delivery, cleanReason);

    const lastActiveDelivery = data.deliveries
      .filter((item) => item.id !== delivery.id && item.beneficiary_id === delivery.beneficiary_id && item.status !== 'Anulada')
      .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)))[0];
    await dataStore.update('beneficiaries', delivery.beneficiary_id, { last_help_at: lastActiveDelivery?.delivered_at || null });
    await audit(`Anulo entrega ${delivery.receipt_number || delivery.id}. Motivo: ${cleanReason}`);
    return updatedDelivery;
  }

  function isActiveAccountingRowAfterEventVoid(row, voidedEventId) {
    if (!row || row.accounting_event_id === voidedEventId) return false;
    return isActiveAccountingRow(row);
  }

  function loanStatusFromPaidAmount(loan, paid) {
    const principal = Number(loan?.principal_amount || 0);
    if (principal <= 0 || paid <= 0) return 'active';
    return paid >= principal ? 'repaid' : 'partially_repaid';
  }

  function debtStatusFromPaidAmount(debt, paid) {
    const total = Number(debt?.original_amount || 0);
    if (total <= 0 || paid <= 0) return 'active';
    return paid >= total ? 'paid' : 'partially_paid';
  }

  async function syncLoanStatusAfterEventVoid(loan, voidedEventId, voidedAt) {
    if (!loan || loan.accounting_event_id === voidedEventId || inactiveAccountingStatus(loan.status)) return;
    const paid = (data.loan_movements || [])
      .filter((movement) => movement.loan_id === loan.id
        && movement.movement_type !== 'loan_received'
        && isActiveAccountingRowAfterEventVoid(movement, voidedEventId))
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    const nextStatus = loanStatusFromPaidAmount(loan, paid);
    if (loan.status === nextStatus) return;
    const updated = await dataStore.update('loan_records', loan.id, {
      status: nextStatus,
      updated_at: voidedAt
    });
    await accountingAuditTrail('loan_records', loan.id, 'sync_status_after_void', loan, updated);
  }

  async function syncDebtStatusAfterEventVoid(debt, voidedEventId, voidedAt) {
    if (!debt || debt.accounting_event_id === voidedEventId || inactiveAccountingStatus(debt.status)) return;
    const paid = (data.debt_movements || [])
      .filter((movement) => movement.debt_id === debt.id && isActiveAccountingRowAfterEventVoid(movement, voidedEventId))
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    const nextStatus = debtStatusFromPaidAmount(debt, paid);
    if (debt.status === nextStatus) return;
    const updated = await dataStore.update('debt_records', debt.id, {
      status: nextStatus,
      updated_at: voidedAt
    });
    await accountingAuditTrail('debt_records', debt.id, 'sync_status_after_void', debt, updated);
  }

  async function voidRelatedLoanDebtEntries(eventId, cleanReason) {
    if (!eventId) return;
    const voidedAt = new Date().toISOString();
    const affectedLoanIds = new Set();
    const affectedDebtIds = new Set();

    for (const movement of (data.loan_movements || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await dataStore.update('loan_movements', movement.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('loan_movements', movement.id, 'void_related_event', movement, updated);
      affectedLoanIds.add(movement.loan_id);
    }

    for (const loan of (data.loan_records || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await dataStore.update('loan_records', loan.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('loan_records', loan.id, 'void_related_event', loan, updated);
      affectedLoanIds.delete(loan.id);
    }

    for (const loanId of affectedLoanIds) {
      await syncLoanStatusAfterEventVoid((data.loan_records || []).find((loan) => loan.id === loanId), eventId, voidedAt);
    }

    for (const movement of (data.debt_movements || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await dataStore.update('debt_movements', movement.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('debt_movements', movement.id, 'void_related_event', movement, updated);
      affectedDebtIds.add(movement.debt_id);
    }

    for (const debt of (data.debt_records || []).filter((item) => item.accounting_event_id === eventId && !inactiveAccountingStatus(item.status))) {
      const updated = await dataStore.update('debt_records', debt.id, {
        status: 'voided',
        voided_at: voidedAt,
        void_reason: cleanReason,
        updated_at: voidedAt
      });
      await accountingAuditTrail('debt_records', debt.id, 'void_related_event', debt, updated);
      affectedDebtIds.delete(debt.id);
    }

    for (const debtId of affectedDebtIds) {
      await syncDebtStatusAfterEventVoid((data.debt_records || []).find((debt) => debt.id === debtId), eventId, voidedAt);
    }
  }

  const actions = useMemo(() => ({
    reloadData: reload,
    createDeletionRequest: async (payload) => {
      const moduleId = String(payload?.module || '').trim();
      assertDeletionRequester(moduleId);
      const reason = String(payload?.reason || '').trim();
      if (reason.length < 5) throw new Error('Indica un motivo válido para solicitar la eliminación.');
      const recordId = String(payload?.record_id || '').trim();
      if (!recordId) throw new Error('No se ha indicado el registro que se desea eliminar.');
      const existingPending = (data.deletion_requests || []).find((request) => (
        request.status === 'Pendiente'
        && request.module === moduleId
        && String(request.record_id) === recordId
      ));
      if (existingPending) throw new Error('Ya existe una solicitud pendiente para este registro.');
      const association = associationMeta();
      const created = await dataStore.create('deletion_requests', {
        ...association,
        module: moduleId,
        record_type: payload.record_type || moduleId,
        record_id: recordId,
        record_label: payload.record_label || recordId,
        requester_id: currentUser?.id || null,
        requester_name: currentUserName(),
        requester_email: currentUser?.email || '',
        requested_at: new Date().toISOString(),
        reason,
        notes: String(payload?.notes || '').trim(),
        status: 'Pendiente',
        relations_snapshot: Array.isArray(payload?.relations) ? payload.relations : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      await audit(`Solicitó eliminación definitiva de ${created.record_label || created.record_id}. Motivo: ${reason}`);
      await trySendDeletionEmail(
        () => notifyDeletionRequestProvider(created),
        `Falló notificación al proveedor para solicitud ${created.id}`
      );
      await reload();
      return created;
    },
    resolveDeletionRequest: async (id, payload) => {
      assertSystemSuperadmin();
      const request = (data.deletion_requests || []).find((item) => item.id === id);
      if (!request) throw new Error('La solicitud no existe.');
      if (request.status !== 'Pendiente') throw new Error('La solicitud ya está resuelta.');
      const decision = payload?.decision === 'Aprobada' ? 'Aprobada' : 'Rechazada';
      const resolutionReason = String(payload?.resolution_reason || '').trim();
      if (resolutionReason.length < 5) throw new Error('Indica un motivo de resolución válido.');
      let deletedRecordType = '';
      if (decision === 'Aprobada') {
        deletedRecordType = await executeApprovedDeletionRequest(request);
      }
      const resolved = await dataStore.update('deletion_requests', id, {
        status: decision,
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser?.id || null,
        resolved_by_name: currentUserName(),
        resolved_by_email: currentUser?.email || '',
        resolution_reason: resolutionReason,
        updated_at: new Date().toISOString()
      });
      await audit(`${decision === 'Aprobada' ? 'Aprobó y ejecutó' : 'Rechazó'} solicitud de eliminación ${request.record_label || request.record_id}. Motivo: ${resolutionReason}`);
      if (decision === 'Rechazada') {
        await trySendDeletionEmail(
          () => notifyDeletionRequestRejected(resolved, resolutionReason),
          `Falló notificación de rechazo para solicitud ${id}`
        );
      }
      await reload();
      return { request: resolved, deletedRecordType };
    },
    createBeneficiary: async (payload) => {
      dataStore.assertUniqueDocument(data.beneficiaries, payload);
      await dataStore.create('beneficiaries', {
        ...sanitizeBeneficiaryPayload(payload),
        code: payload.code || nextBeneficiaryCode(data.beneficiaries)
      });
      await audit(`Creo beneficiario ${payload.full_name || ''}`.trim());
      await reload();
    },
    createFamily: async (payload) => {
      assertPermission('families', 'create');
      const createdAt = payload?.created_at || new Date().toISOString();
      const created = await dataStore.create('families', {
        ...sanitizeFamilyPayload(payload),
        created_at: createdAt,
        updated_at: payload?.updated_at || createdAt
      });
      await audit(`Creo familia ${created.family_code || created.responsible_name || ''}`.trim());
      await reload();
      return created;
    },
    updateFamily: async (id, payload) => {
      assertPermission('families', 'edit');
      const updated = await dataStore.update('families', id, sanitizeFamilyPayload(payload));
      await audit(`Edito familia ${updated.family_code || updated.responsible_name || ''}`.trim());
      await reload();
      return updated;
    },
    archiveFamily: async (id, payload = {}) => {
      assertPermission('families', 'edit');
      const family = data.families.find((item) => item.id === id);
      if (!family) throw new Error('La familia no existe.');
      const archivedAt = new Date().toISOString();
      const archiveReason = String(payload.reason || payload.archive_reason || '').trim();
      const archived = await dataStore.update('families', id, {
        notes: withFamilyArchiveMarker(family.notes, archivedAt, currentUserName(), archiveReason),
        status: 'Archivada',
        archived_at: archivedAt,
        archive_reason: archiveReason,
        updated_at: archivedAt
      });
      await audit(`Archivo familia ${family.family_code || family.responsible_name || id}`.trim());
      await reload();
      return archived;
    },
    deleteFamily: async (id) => {
      if (currentUser?.role !== 'Superadministrador') throw new Error('Solo el Superadministrador puede eliminar familias.');
      const members = (data.beneficiaries || []).filter((item) => item.family_id === id);
      if (members.length) throw new Error('Esta familia tiene miembros asociados.');
      const family = data.families.find((item) => item.id === id);
      await dataStore.remove('families', id);
      await audit(`Elimino familia ${family?.family_code || id}`.trim());
      await reload();
    },
    createBeneficiaryDocument: async (payload) => {
      await dataStore.create('beneficiary_documents', payload);
      await reload();
    },
    deleteBeneficiaryDocument: async (id) => {
      assertPermission('beneficiaries', 'delete');
      await dataStore.remove('beneficiary_documents', id);
      await reload();
    },
    createSocialHistory: async (payload) => {
      await dataStore.create('social_history', payload);
      await reload();
    },
    updateBeneficiary: async (id, payload) => {
      dataStore.assertUniqueDocument(data.beneficiaries, payload, id);
      await dataStore.update('beneficiaries', id, sanitizeBeneficiaryPayload(payload));
      await audit(`Edito beneficiario ${payload.full_name || ''}`.trim());
      await reload();
    },
    deleteBeneficiary: async (id) => {
      assertPermission('beneficiaries', 'delete');
      await dataStore.remove('beneficiaries', id);
      await audit('Elimino beneficiario');
      await reload();
    },
    createDelivery: async (payload) => {
      assertPermission('deliveries', 'create');
      const beneficiary = data.beneficiaries.find((item) => item.id === payload.beneficiary_id);
      const family = data.families.find((item) => item.id === beneficiary?.family_id);
      const item = data.inventory_items.find((entry) => entry.id === payload.inventory_item_id);
      const quantity = Number(payload.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad de la entrega debe ser mayor que cero.');
      if (item && quantity > Number(item.stock || 0)) {
        throw new Error(`Stock insuficiente. Disponible: ${item.stock} ${item.unit}.`);
      }
      const createdDelivery = await dataStore.create('deliveries', {
        ...payload,
        receipt_number: payload.receipt_number || nextReceiptNumber(data.deliveries, payload.delivered_at),
        beneficiary_name: beneficiary?.full_name || '',
        family_id: family?.id || null,
        family_name: family?.family_code || '',
        inventory_item_name: item?.name || ''
      });
      if (beneficiary) {
        await dataStore.create('social_history', {
          beneficiary_id: beneficiary.id,
          family_id: family?.id || null,
          date: payload.delivered_at || new Date().toISOString().slice(0, 10),
          entry_type: 'Entrega de ayuda',
          notes: buildDeliveryTrackingNote(createdDelivery, beneficiary, item, quantity)
        });
      }
      if (!hasSupabaseConfig && beneficiary) await dataStore.update('beneficiaries', beneficiary.id, { last_help_at: payload.delivered_at });
      if (!hasSupabaseConfig && item && quantity > 0) {
        const nextStock = Number(item.stock || 0) - quantity;
        await dataStore.update('inventory_items', item.id, { stock: nextStock });
        await dataStore.create('inventory_movements', {
          item_id: item.id,
          item_name: item.name,
          movement_type: 'Salida',
          quantity,
          moved_at: payload.delivered_at,
          responsible: payload.responsible,
          notes: `Salida automatica por entrega a ${beneficiary?.full_name || 'beneficiario'}`
        });
      }
      await audit(`Registro entrega a ${beneficiary?.full_name || 'beneficiario'}`);
      await reload();
    },
    deleteDelivery: async (id) => {
      assertSuperadmin();
      await dataStore.remove('deliveries', id);
      await audit('Elimino definitivamente una entrega');
      await reload();
    },
    cancelDelivery: async (id, reason) => {
      if (!canDo(currentUser, 'deliveries', 'edit') && !canDo(currentUser, 'deliveries', 'create')) {
        throw new Error('No tienes permiso para anular entregas.');
      }
      const cleanReason = String(reason || '').trim();
      if (cleanReason.length < 5) throw new Error('Indica un motivo de anulación válido.');
      const delivery = data.deliveries.find((item) => item.id === id);
      if (!delivery || delivery.status === 'Anulada') throw new Error('La entrega no existe o ya está anulada.');
      if (hasSupabaseConfig) {
        const { error: cancelError } = await supabase.rpc('cancel_delivery', { p_delivery_id: id, p_reason: cleanReason });
        if (cancelError) {
          if (isMissingCancelDeliveryRpcError(cancelError)) await cancelDeliveryWithoutRpc(delivery, cleanReason);
          else throw cancelError;
        }
      } else {
        const cancelledAt = new Date().toISOString();
        const cancelledByName = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || 'Usuario';
        await dataStore.update('deliveries', id, {
          status: 'Anulada',
          cancelled_at: cancelledAt,
          cancelled_by: currentUser?.id || null,
          cancelled_by_name: cancelledByName,
          cancellation_reason: cleanReason
        });
        const item = data.inventory_items.find((entry) => entry.id === delivery.inventory_item_id);
        if (item) {
          await dataStore.update('inventory_items', item.id, { stock: Number(item.stock || 0) + Number(delivery.quantity || 0) });
          await dataStore.create('inventory_movements', {
            item_id: item.id,
            item_name: item.name,
            movement_type: 'Entrada',
            quantity: Number(delivery.quantity || 0),
            moved_at: cancelledAt,
            responsible: cancelledByName,
            notes: `Reversión por anulación de entrega: ${cleanReason}`
          });
        }
        const lastActiveDelivery = data.deliveries
          .filter((item) => item.id !== id && item.beneficiary_id === delivery.beneficiary_id && item.status !== 'Anulada')
          .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)))[0];
        await dataStore.update('beneficiaries', delivery.beneficiary_id, { last_help_at: lastActiveDelivery?.delivered_at || null });
        await voidDeliverySocialValueEvents(delivery, cleanReason);
      }
      if (!hasSupabaseConfig) await audit(`Anulo entrega ${delivery.receipt_number || id}. Motivo: ${cleanReason}`);
      await reload();
    },
    createEmailLog: async (payload) => {
      await dataStore.create('email_logs', payload);
      await reload();
    },
    updateEmailLog: async (id, payload) => {
      await dataStore.update('email_logs', id, payload);
      await reload();
    },
    deleteEmailLog: async (id) => {
      if (currentUser?.role !== 'Superadministrador') throw new Error('Solo el Superadministrador puede eliminar citas definitivamente.');
      await dataStore.remove('email_logs', id);
      await audit('Elimino definitivamente una cita de agenda');
      await reload();
    },
    createInventoryItem: async (payload) => {
      assertPermission('inventory', 'edit');
      const item = sanitizeInventoryItemPayload(payload);
      assertUniqueInventoryItem(item);
      await dataStore.create('inventory_items', { ...item, ...(!hasSupabaseConfig ? { stock: 0 } : {}) });
      await audit(`Creo producto de inventario ${item.name}`.trim());
      await reload();
    },
    updateInventoryItem: async (id, payload) => {
      assertPermission('inventory', 'edit');
      const item = sanitizeInventoryItemPayload(payload);
      assertUniqueInventoryItem(item, id);
      await dataStore.update('inventory_items', id, item);
      await audit(`Edito producto de inventario ${item.name}`.trim());
      await reload();
    },
    deleteInventoryItem: async (id) => {
      assertPermission('inventory', 'delete');
      const item = data.inventory_items.find((entry) => entry.id === id);
      try {
        await dataStore.remove('inventory_items', id);
      } catch (error) {
        if (error?.code === '23503') {
          throw new Error('No se puede eliminar un producto con movimientos registrados.');
        }
        throw error;
      }
      await audit(`Elimino producto de inventario ${item?.name || ''}`.trim());
      await reload();
    },
    createInventoryMovement: async (payload) => {
      assertPermission('inventory', 'create');
      const { item, movement } = sanitizeInventoryMovement(payload);
      if (hasSupabaseConfig) {
        const { error: movementError } = await supabase.rpc('register_inventory_movement', {
          p_item_id: movement.item_id,
          p_movement_type: movement.movement_type,
          p_quantity: movement.quantity,
          p_moved_at: movement.moved_at,
          p_responsible: movement.responsible,
          p_notes: movement.notes
        });
        if (movementError) throw movementError;
      } else {
        const nextStock = movement.movement_type === 'Entrada'
          ? Number(item.stock || 0) + movement.quantity
          : Number(item.stock || 0) - movement.quantity;
        await dataStore.update('inventory_items', item.id, { stock: nextStock });
        await dataStore.create('inventory_movements', { ...movement, item_name: item.name });
      }
      if (!hasSupabaseConfig) await audit(`Registro ${movement.movement_type.toLowerCase()} de inventario ${item.name}`.trim());
      await reload();
    },
    createDonorContact: async (payload) => {
      assertPermission('accounting', 'create');
      const cleanContact = sanitizeDonorContactPayload(payload, { is_active: true });
      const latestContacts = await dataStore.list('accounting_contacts').catch(() => data.accounting_contacts || []);
      const duplicate = (latestContacts || []).find((item) => (
        normalize(item.contact_type) === 'donor'
        && (
          normalize(item.name) === normalize(cleanContact.name)
          || (cleanContact.email && normalize(item.email) === normalize(cleanContact.email))
        )
      ));
      if (duplicate) return duplicate;
      const contact = await dataStore.create('accounting_contacts', {
        ...cleanContact,
        created_at: new Date().toISOString()
      });
      await accountingAuditTrail('accounting_contacts', contact.id, 'create_donor', null, contact);
      await audit(`Donantes: creo ficha de donante ${contact.name}`.trim());
      await reload();
      return contact;
    },
    updateDonorContact: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const current = (data.accounting_contacts || []).find((item) => item.id === id && normalize(item.contact_type) === 'donor');
      if (!current) throw new Error('El donante no existe.');
      const cleanContact = sanitizeDonorContactPayload(payload, current);
      const updated = await dataStore.update('accounting_contacts', id, cleanContact);
      await accountingAuditTrail('accounting_contacts', id, 'update_donor', current, updated);
      await audit(`Donantes: edito ficha de donante ${updated.name || current.name}`.trim());
      await reload();
      return updated;
    },
    archiveDonorContact: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const current = (data.accounting_contacts || []).find((item) => item.id === id && normalize(item.contact_type) === 'donor');
      if (!current) throw new Error('El donante no existe.');
      const updated = await dataStore.update('accounting_contacts', id, {
        notes: cleanText(payload?.notes ?? current.notes),
        is_active: payload?.is_active !== false ? true : false,
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('accounting_contacts', id, updated.is_active === false ? 'archive_donor' : 'unarchive_donor', current, updated);
      await audit(`Donantes: ${updated.is_active === false ? 'archivo' : 'desarchivo'} donante ${updated.name || current.name}`.trim());
      await reload();
      return updated;
    },
    deleteDonorContact: async (id) => {
      assertAccountingSuperadmin();
      const contact = (data.accounting_contacts || []).find((item) => item.id === id && normalize(item.contact_type) === 'donor');
      if (!contact) throw new Error('El donante no existe.');
      if (donorHasDonationRelations(contact)) {
        throw new Error('Este donante tiene donaciones registradas. Utilice Archivar.');
      }
      await dataStore.remove('accounting_contacts', id);
      await accountingAuditTrail('accounting_contacts', id, 'delete_donor_without_donations', contact, null);
      await audit(`Donantes: eliminó donante sin donaciones ${contact.name}`.trim());
      await reload();
    },
    createFinancialAccount: async (payload) => {
      assertPermission('accounting', 'create');
      const cleanAccount = sanitizeFinancialAccountPayload(payload);
      const account = await dataStore.create('financial_accounts', {
        ...cleanAccount,
        ...userMeta()
      });
      await accountingAuditTrail('financial_accounts', account.id, 'create', null, account);
      await audit(`Contabilidad: creo cuenta ${account.name}`.trim());
      await reload();
    },
    updateFinancialAccount: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const current = findFinancialAccount(id);
      const cleanAccount = sanitizeFinancialAccountPayload(payload, current);
      const updated = await dataStore.update('financial_accounts', id, cleanAccount);
      await accountingAuditTrail('financial_accounts', id, 'update', current, updated);
      await audit(`Contabilidad: edito cuenta ${updated.name || current.name}`.trim());
      await reload();
    },
    deleteFinancialAccount: async (id) => {
      assertAccountingSuperadmin();
      const account = (data.financial_accounts || []).find((item) => item.id === id);
      if (!account) throw new Error('La cuenta no existe.');
      const hasRelations = (data.cash_bank_movements || []).some((movement) => movement.financial_account_id === id)
        || (data.accounting_events || []).some((event) => event.financial_account_id === id);
      if (hasRelations) throw new Error('No se puede eliminar una cuenta con movimientos o eventos relacionados. Puedes desactivarla.');
      await dataStore.remove('financial_accounts', id);
      await accountingAuditTrail('financial_accounts', id, 'delete', account, null);
      await audit(`Contabilidad: elimino cuenta sin relaciones ${account.name}`.trim());
      await reload();
    },
    registerEconomicOperation: async (payload) => {
      await performEconomicOperation(payload);
      await reload();
    },
    registerCashBankMovement: async (payload) => {
      assertPermission('accounting', 'create');
      const { account, movement, event, document } = sanitizeCashBankMovementPayload(payload);
      const nextBalance = Number(account.current_balance || 0) + movementDelta(movement);
      assertNoUnauthorizedNegativeBalance(account, nextBalance, payload?.allow_negative_balance === true);
      const createdEvent = await dataStore.create('accounting_events', event);
      await accountingAuditTrail('accounting_events', createdEvent.id, 'create', null, createdEvent);
      const createdMovement = await dataStore.create('cash_bank_movements', {
        ...movement,
        accounting_event_id: createdEvent.id
      });
      await accountingAuditTrail('cash_bank_movements', createdMovement.id, 'create', null, createdMovement);
      await createAccountingDocumentForEvent(createdEvent.id, document);
      await applyAccountBalance(account, nextBalance, 'balance_update');
      await audit(`Contabilidad: registro movimiento ${movement.notes}`.trim());
      await reload();
    },
    registerBankTransfer: async (payload) => {
      assertPermission('accounting', 'create');
      await performBankTransfer(payload);
      await reload();
    },
    correctCashBankMovement: async (id, payload) => {
      assertPermission('accounting', 'edit');
      const original = (data.cash_bank_movements || []).find((movement) => movement.id === id);
      if (!original) throw new Error('El movimiento no existe.');
      if (original.status === 'voided') throw new Error('No se puede corregir un movimiento anulado.');
      if (original.status === 'corrected') throw new Error('Este movimiento ya fue corregido.');
      if (String(original.movement_type || '').startsWith('transfer_')) {
        throw new Error('Para corregir una transferencia, anula la transferencia y registra una nueva.');
      }
      const linkedEvent = (data.accounting_events || []).find((item) => item.id === original.accounting_event_id);
      if (['loan', 'debt'].includes(linkedEvent?.event_type)) {
        throw new Error('Para corregir un préstamo o deuda, anula el movimiento y registra la operación correcta desde Nueva operación.');
      }
      const correctionReason = String(payload?.correction_reason || '').trim();
      if (correctionReason.length < 5) throw new Error('Indica un motivo de corrección válido.');
      const account = findFinancialAccount(original.financial_account_id);
      const { movement, event, document } = sanitizeCashBankMovementPayload({
        ...payload,
        financial_account_id: account.id,
        movement_type: original.movement_type
      }, original.movement_type);
      const balanceAfterReversal = Number(account.current_balance || 0) - movementDelta(original);
      const nextBalance = balanceAfterReversal + movementDelta(movement);
      assertNoUnauthorizedNegativeBalance(account, nextBalance, payload?.allow_negative_balance === true);
      const previousMovement = { ...original };
      const correctedOriginal = await dataStore.update('cash_bank_movements', original.id, {
        status: 'corrected',
        void_reason: correctionReason,
        updated_at: new Date().toISOString()
      });
      await accountingAuditTrail('cash_bank_movements', original.id, 'mark_corrected', previousMovement, correctedOriginal);
      const previousEvent = linkedEvent;
      if (previousEvent) {
        const updatedEvent = await dataStore.update('accounting_events', previousEvent.id, {
          status: 'corrected',
          void_reason: correctionReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('accounting_events', previousEvent.id, 'mark_corrected', previousEvent, updatedEvent);
      }
      const createdEvent = await dataStore.create('accounting_events', {
        ...event,
        correction_of_event_id: original.accounting_event_id || null,
        description: `${event.description}. Corrección: ${correctionReason}`
      });
      await accountingAuditTrail('accounting_events', createdEvent.id, 'create_correction', null, createdEvent);
      const createdMovement = await dataStore.create('cash_bank_movements', {
        ...movement,
        accounting_event_id: createdEvent.id
      });
      await accountingAuditTrail('cash_bank_movements', createdMovement.id, 'create_correction', null, createdMovement);
      await createAccountingDocumentForEvent(createdEvent.id, document);
      await applyAccountBalance(account, nextBalance, 'balance_correction');
      await audit(`Contabilidad: corrigio movimiento ${original.id}`.trim());
      await reload();
    },
    voidCashBankMovement: async (id, reason) => {
      assertAccountingSuperadmin();
      const cleanReason = String(reason || '').trim();
      if (cleanReason.length < 5) throw new Error('Indica un motivo de anulación válido.');
      const original = (data.cash_bank_movements || []).find((movement) => movement.id === id);
      if (!original) throw new Error('El movimiento no existe.');
      if (original.status === 'voided') throw new Error('El movimiento ya está anulado.');
      const relatedMovements = original.accounting_event_id && String(original.movement_type || '').startsWith('transfer_')
        ? (data.cash_bank_movements || []).filter((movement) => movement.accounting_event_id === original.accounting_event_id && movement.status !== 'voided')
        : [original];
      for (const movement of relatedMovements) {
        const account = findFinancialAccount(movement.financial_account_id);
        const nextBalance = Number(account.current_balance || 0) - movementDelta(movement);
        const updatedMovement = await dataStore.update('cash_bank_movements', movement.id, {
          status: 'voided',
          voided_at: new Date().toISOString(),
          void_reason: cleanReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('cash_bank_movements', movement.id, 'void', movement, updatedMovement);
        await applyAccountBalance(account, nextBalance, 'balance_void');
      }
      const event = (data.accounting_events || []).find((item) => item.id === original.accounting_event_id);
      if (event) {
        const updatedEvent = await dataStore.update('accounting_events', event.id, {
          status: 'voided',
          voided_at: new Date().toISOString(),
          void_reason: cleanReason,
          updated_at: new Date().toISOString()
        });
        await accountingAuditTrail('accounting_events', event.id, 'void', event, updatedEvent);
        await voidRelatedLoanDebtEntries(event.id, cleanReason);
      }
      await audit(`Contabilidad: anulo movimiento ${id}`.trim());
      await reload();
    },
    createTreasuryIncome: async (payload) => {
      assertPermission('accounting', 'create');
      await dataStore.create('treasury_incomes', payload);
      await audit(`Contabilidad: registro historico de ingreso ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryIncome: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await dataStore.update('treasury_incomes', id, payload);
      await audit(`Contabilidad: actualizo ingreso historico ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryIncome: async (id) => {
      assertPermission('accounting', 'delete');
      await dataStore.remove('treasury_incomes', id);
      await audit('Contabilidad: elimino ingreso historico');
      await reload();
    },
    createTreasuryExpense: async (payload) => {
      assertPermission('accounting', 'create');
      await dataStore.create('treasury_expenses', payload);
      await audit(`Contabilidad: registro historico de gasto ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryExpense: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await dataStore.update('treasury_expenses', id, payload);
      await audit(`Contabilidad: actualizo gasto historico ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryExpense: async (id) => {
      assertPermission('accounting', 'delete');
      await dataStore.remove('treasury_expenses', id);
      await audit('Contabilidad: elimino gasto historico');
      await reload();
    },
    createTreasuryLoan: async (payload) => {
      assertPermission('accounting', 'create');
      await dataStore.create('treasury_loans', payload);
      await audit(`Contabilidad: registro histórico de préstamo ${payload.concept || payload.person || ''}`.trim());
      await reload();
    },
    updateTreasuryLoan: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await dataStore.update('treasury_loans', id, payload);
      await audit(`Contabilidad: actualizó préstamo histórico ${payload.concept || payload.person || ''}`.trim());
      await reload();
    },
    deleteTreasuryLoan: async (id) => {
      assertPermission('accounting', 'delete');
      await dataStore.remove('treasury_loans', id);
      await audit('Contabilidad: eliminó préstamo histórico');
      await reload();
    },
    createTreasuryAccount: async (payload) => {
      assertPermission('accounting', 'create');
      await dataStore.create('treasury_accounts', payload);
      await audit(`Contabilidad: registro cuenta historica ${payload.name || ''}`.trim());
      await reload();
    },
    updateTreasuryAccount: async (id, payload) => {
      assertPermission('accounting', 'edit');
      await dataStore.update('treasury_accounts', id, payload);
      await audit(`Contabilidad: actualizo cuenta historica ${payload.name || ''}`.trim());
      await reload();
    },
    deleteTreasuryAccount: async (id) => {
      assertPermission('accounting', 'delete');
      await dataStore.remove('treasury_accounts', id);
      await audit('Contabilidad: elimino cuenta historica');
      await reload();
    },
    createVolunteer: async (payload) => {
      await dataStore.create('volunteers', payload);
      await reload();
    },
    updateOrganizationSettings: async (payload) => {
      const current = data.organization_settings?.[0];
      if (current) await dataStore.update('organization_settings', current.id, payload);
      else await dataStore.create('organization_settings', { id: 'main', ...payload });
      await reload();
    },
    createUser: async (payload) => {
      const cleanPayload = sanitizeUserPayload(payload);
      if (hasSupabaseConfig) {
        const response = await fetch('/api/create-user', {
          method: 'POST',
          headers: await getApiHeaders(),
          body: JSON.stringify({ user: cleanPayload })
        });
        const result = await readApiJson(response);
        if (!response.ok) {
          if (result.code === 'SUPABASE_ADMIN_NOT_CONFIGURED') {
            throw new Error(formatApiError(result, 'Servicio de usuarios no configurado. Añada SUPABASE_SERVICE_ROLE_KEY en Vercel.'));
          }
          throw new Error(formatApiError(result, 'No se pudo crear el usuario.'));
        }
      } else {
        await dataStore.create('app_users', cleanPayload);
      }
      await audit(`Creo usuario ${payload.email || ''}`.trim());
      await reload();
    },
    updateUser: async (id, payload) => {
      const cleanPayload = sanitizeUserPayload(payload);
      if (cleanPayload.is_active === false && isLastActiveSuperadmin(id)) {
        throw new Error('No se puede desactivar al ultimo Superadministrador.');
      }
      if (hasSupabaseConfig) await adminUserRequest('update', { id, user: cleanPayload });
      else await dataStore.update('app_users', id, cleanPayload);
      await audit(`Edito usuario ${cleanPayload.email || ''}`.trim());
      await reload();
    },
    deactivateUser: async (id) => {
      const existing = data.app_users.find((user) => user.id === id);
      if (isLastActiveSuperadmin(id)) {
        throw new Error('No se puede desactivar al ultimo Superadministrador.');
      }
      if (hasSupabaseConfig) await adminUserRequest('deactivate', { id });
      else await dataStore.update('app_users', id, { is_active: false, status: 'Inactivo' });
      await audit(`Usuario desactivado: ${existing?.email || ''}`.trim());
      await reload();
    },
    reactivateUser: async (id) => {
      const existing = data.app_users.find((user) => user.id === id);
      if (hasSupabaseConfig) await adminUserRequest('reactivate', { id });
      else await dataStore.update('app_users', id, { is_active: true, status: 'Activo' });
      await audit(`Usuario reactivado: ${existing?.email || ''}`.trim());
      await reload();
    },
    blockUser: async (id) => {
      const existing = data.app_users.find((user) => user.id === id);
      if (isLastActiveSuperadmin(id)) {
        throw new Error('No se puede bloquear al ultimo Superadministrador.');
      }
      if (hasSupabaseConfig) await adminUserRequest('block', { id });
      else await dataStore.update('app_users', id, { is_active: false, status: 'Bloqueado' });
      await audit(`Usuario bloqueado: ${existing?.email || ''}`.trim());
      await reload();
    },
    deleteUser: async (id) => {
      assertPermission('users', 'delete');
      const existing = data.app_users.find((user) => user.id === id);
      if (isLastActiveSuperadmin(id)) {
        throw new Error('No se puede eliminar al ultimo Superadministrador activo.');
      }
      if (hasSupabaseConfig) await adminUserRequest('delete', { id });
      else await dataStore.remove('app_users', id);
      await audit(`Usuario eliminado: ${existing?.email || ''}`.trim());
      await reload();
    },
    resetUserPassword: async (id, password) => {
      if (hasSupabaseConfig) await adminUserRequest('reset-password', { id, password });
      else await dataStore.update('app_users', id, { password });
      await audit('Restableció contraseña de usuario');
      await reload();
    },
    updateUserLastAccess: async (id) => {
      await dataStore.update('app_users', id, { last_access_at: new Date().toISOString() });
      await audit('Inició sesión');
      await reload();
    },
    createAuditLog: async (payload) => {
      await dataStore.create('audit_logs', payload);
      await reload();
    },
    replaceAllData: async (payload) => {
      dataStore.replaceLocalData(payload);
      await reload();
    },
    prepareProductionEnvironment: async (scopes = []) => {
      if (currentUser?.role !== 'Superadministrador') {
        throw new Error('Solo el Superadministrador puede preparar el entorno de producción.');
      }
      const selected = new Set(scopes);
      const eventIds = new Set();
      const inventoryItemIds = new Set();
      const donationIds = new Set();
      const deliveryIds = new Set();
      const loanIds = new Set();
      const debtIds = new Set();

      if (selected.has('donations')) {
        (data.donations || []).forEach((item) => donationIds.add(item.id));
        (data.accounting_events || [])
          .filter((event) => ['donation_money', 'donation_in_kind'].includes(event.event_type) || event.source_module === 'donations')
          .forEach((event) => eventIds.add(event.id));
      }
      if (selected.has('deliveries')) {
        (data.deliveries || []).forEach((item) => deliveryIds.add(item.id));
      }
      if (selected.has('loans')) {
        (data.loan_records || []).forEach((item) => {
          loanIds.add(item.id);
          if (item.accounting_event_id) eventIds.add(item.accounting_event_id);
        });
        (data.loan_movements || []).forEach((item) => {
          if (item.accounting_event_id) eventIds.add(item.accounting_event_id);
        });
      }
      if (selected.has('debts')) {
        (data.debt_records || []).forEach((item) => {
          debtIds.add(item.id);
          if (item.accounting_event_id) eventIds.add(item.accounting_event_id);
        });
        (data.debt_movements || []).forEach((item) => {
          if (item.accounting_event_id) eventIds.add(item.accounting_event_id);
        });
      }
      if (selected.has('inventory')) {
        (data.inventory_items || []).forEach((item) => inventoryItemIds.add(item.id));
      }

      const removeRows = async (table, rows) => {
        for (const row of rows) await dataStore.remove(table, row.id);
        return rows.length;
      };

      const eventRelated = (row) => row.accounting_event_id && eventIds.has(row.accounting_event_id);
      const counts = {};
      counts.accounting_documents = await removeRows('accounting_documents', (data.accounting_documents || []).filter(eventRelated));
      counts.cash_bank_movements = await removeRows('cash_bank_movements', (data.cash_bank_movements || []).filter(eventRelated));
      counts.loan_movements = await removeRows('loan_movements', (data.loan_movements || []).filter((row) => loanIds.has(row.loan_id) || eventRelated(row)));
      counts.debt_movements = await removeRows('debt_movements', (data.debt_movements || []).filter((row) => debtIds.has(row.debt_id) || eventRelated(row)));
      counts.social_value_events = await removeRows('social_value_events', (data.social_value_events || []).filter((row) => (
        eventRelated(row)
        || donationIds.has(row.source_record_id)
        || deliveryIds.has(row.source_record_id)
        || inventoryItemIds.has(row.inventory_item_id)
      )));
      counts.deliveries = await removeRows('deliveries', (data.deliveries || []).filter((row) => deliveryIds.has(row.id)));
      counts.donations = await removeRows('donations', (data.donations || []).filter((row) => donationIds.has(row.id)));
      counts.loan_records = await removeRows('loan_records', (data.loan_records || []).filter((row) => loanIds.has(row.id)));
      counts.debt_records = await removeRows('debt_records', (data.debt_records || []).filter((row) => debtIds.has(row.id)));
      counts.inventory_movements = await removeRows('inventory_movements', (data.inventory_movements || []).filter((row) => inventoryItemIds.has(row.item_id)));
      counts.inventory_items = await removeRows('inventory_items', (data.inventory_items || []).filter((row) => inventoryItemIds.has(row.id)));
      counts.accounting_events = await removeRows('accounting_events', (data.accounting_events || []).filter((row) => eventIds.has(row.id)));

      await audit(`Preparó entorno de producción. Limpieza: ${Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(', ')}`);
      await reload();
      return counts;
    },
    resetDemo: () => {
      dataStore.resetLocalDemo();
      reload();
    }
  }), [data, reload, currentUser]);

  return { data, loading, error, actions };
}
