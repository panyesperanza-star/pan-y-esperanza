import { useCallback, useEffect, useMemo, useState } from 'react';
import { canDo } from '../lib/auth';
import { constrainRolePermissionMatrix } from '../lib/constants';
import { dataStore } from '../lib/dataStore';
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
    return {
      ...payload,
      document_id: normalizeDocument(payload.document_id),
      family_id: payload.family_id || null
    };
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
    if (!item) throw new Error('Selecciona un producto valido.');
    if (!['Entrada', 'Salida'].includes(movementType)) throw new Error('El tipo de movimiento no es valido.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor que cero.');
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
        responsible: String(payload.responsible || '').trim() || currentUserName(),
        notes: String(payload.notes || '').trim()
      }
    };
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
    throw new Error(`La operacion dejaria saldo negativo en ${account.name}. Saldo disponible: ${Number(account.current_balance || 0).toFixed(2)} EUR.`);
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

  function activeAccountingRows(rows = []) {
    return rows.filter((item) => {
      const status = normalize(item?.status || item?.state || '');
      return !status.includes('void')
        && !status.includes('anulad')
        && !status.includes('cancel')
        && !status.includes('correct')
        && !status.includes('corregid')
        && !status.includes('revers')
        && !status.includes('revert');
    });
  }

  function outstandingLoanAmount(loan) {
    const paid = activeAccountingRows(data.loan_movements || [])
      .filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received')
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(loan.principal_amount || 0) - paid);
  }

  function outstandingDebtAmount(debt) {
    const paid = activeAccountingRows(data.debt_movements || [])
      .filter((movement) => movement.debt_id === debt.id)
      .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    return Math.max(0, Number(debt.original_amount || 0) - paid);
  }

  async function getOrCreateAccountingContact(contactType, payload = {}) {
    const name = cleanText(payload.name || payload.contact_name);
    if (!name) return null;
    const safeType = ['supplier', 'donor', 'lender', 'creditor', 'beneficiary', 'other'].includes(contactType) ? contactType : 'other';
    const existing = (data.accounting_contacts || []).find((contact) => (
      normalize(contact.name) === normalize(name)
      && normalize(contact.contact_type || 'other') === normalize(safeType)
    ));
    if (existing) return existing;
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
      await audit(`Contabilidad: nueva operacion ingreso ${payload.concept || ''}`.trim());
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
      await audit(`Contabilidad: nueva operacion gasto ${payload.concept || ''}`.trim());
      return;
    }
    if (operationType === 'donation_money') {
      await registerMonetaryEconomicOperation(payload, {
        eventType: 'donation_money',
        direction: 'in',
        contactType: 'donor',
        contactName: payload.donor_name || payload.contact_name,
        defaultConcept: 'Donacion monetaria',
        label: 'Donacion monetaria',
        documentType: 'receipt',
        forceDocument: false
      });
      await audit(`Contabilidad: donacion monetaria ${payload.donor_name || ''}`.trim());
      return;
    }
    if (operationType === 'economic_help') {
      const beneficiary = (data.beneficiaries || []).find((item) => item.id === payload.beneficiary_id);
      const result = await registerMonetaryEconomicOperation(payload, {
        eventType: 'expense',
        direction: 'out',
        contactType: 'beneficiary',
        contactName: beneficiary?.full_name || payload.beneficiary_name || payload.contact_name,
        defaultConcept: 'Ayuda economica',
        label: 'Ayuda economica',
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
      await audit(`Contabilidad: ayuda economica ${beneficiary?.full_name || payload.beneficiary_name || ''}`.trim());
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
        name: donorName,
        document_id: payload.contact_document_id,
        email: payload.contact_email,
        phone: payload.contact_phone,
        address: payload.contact_address
      });
      const item = await resolveInventoryItemForOperation(payload, donorName);
      const unitValue = resolveInventoryUnitValueForOperation(payload, item, quantity);
      if (unitValue === null) throw new Error('Indica el valor unitario estimado de la donacion en especie.');
      const amount = roundCurrency(quantity * unitValue);
      const title = cleanText(payload.concept) || `Donacion en especie: ${item.name}`;
      const event = await createAccountingEvent({
        event_type: 'donation_in_kind',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Donacion en especie registrada sin afectar caja ni banco.',
        amount,
        contact_id: contact?.id || null,
        financial_account_id: null
      });
      await createEconomicDocument(event.id, {
        ...payload,
        document_type: payload.document_type || 'receipt'
      }, amount, date, contact?.id || null, true);
      const donation = await dataStore.create('donations', {
        donor: donorName || 'Donante',
        donor_kind: payload.donor_kind || 'Particular',
        donation_type: payload.donation_type || item.category || item.name,
        donated_at: date,
        estimated_value: amount,
        notes: cleanText(payload.notes || title)
      });
      const inventoryMovement = await registerInventoryEntryForOperation(item, payload, quantity, `Donacion en especie: ${title}`);
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
      await audit(`Contabilidad: donacion en especie ${donorName || item.name}`.trim());
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
      if (!contact) throw new Error('Indica quien concede el prestamo.');
      const title = cleanText(payload.concept) || 'Prestamo recibido';
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Prestamo recibido registrado automaticamente.',
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
      await audit(`Contabilidad: prestamo recibido ${title}`.trim());
      return;
    }
    if (operationType === 'loan_repayment') {
      const loan = (data.loan_records || []).find((item) => item.id === payload.loan_id);
      if (!loan) throw new Error('Selecciona un prestamo pendiente.');
      const outstanding = outstandingLoanAmount(loan);
      const amount = assertPositiveNumber(payload.amount);
      if (amount > outstanding) throw new Error(`El importe supera el saldo pendiente del prestamo: ${outstanding.toFixed(2)} EUR.`);
      const date = operationDate(payload.operation_at);
      const account = findFinancialAccount(payload.financial_account_id);
      const contact = (data.accounting_contacts || []).find((item) => item.id === loan.contact_id);
      const title = cleanText(payload.concept) || `Devolucion de prestamo: ${loan.reason}`;
      const event = await createAccountingEvent({
        event_type: 'loan',
        occurred_at: date,
        title,
        description: cleanText(payload.notes) || 'Devolucion de prestamo registrada automaticamente.',
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
      await audit(`Contabilidad: devolucion de prestamo ${contact?.name || loan.reason}`.trim());
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
      const debt = (data.debt_records || []).find((item) => item.id === payload.debt_id);
      if (!debt) throw new Error('Selecciona una deuda pendiente.');
      const outstanding = outstandingDebtAmount(debt);
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
        description: cleanText(payload.notes) || 'Pago de deuda registrado automaticamente.',
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
    throw new Error('Selecciona un tipo de operacion valido.');
  }

  function sanitizeFinancialAccountPayload(payload, initial = {}) {
    const name = String(payload?.name || '').trim();
    const accountType = payload?.account_type || 'cash';
    const allowed = ['cash', 'bank', 'bizum', 'paypal', 'card', 'other'];
    const openingBalance = Number(payload?.opening_balance || 0);
    if (!name) throw new Error('El nombre de la cuenta es obligatorio.');
    if (!allowed.includes(accountType)) throw new Error('El tipo de cuenta no es valido.');
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
    if (!allowed.includes(movementType)) throw new Error('El tipo de movimiento no es valido.');
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
    const documentNumber = String(payload?.document_number || '').trim();
    if (!fileName && !fileDataUrl && !documentNumber && payload?.force_document !== true) return null;
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
      notes: String(payload?.document_notes || '').trim(),
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
      return { error: 'Respuesta no valida del servidor.' };
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
    if (!response.ok) throw new Error(formatApiError(result, 'No se pudo completar la operacion de usuarios.'));
    return result;
  }

  const actions = useMemo(() => ({
    reloadData: reload,
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
      await dataStore.create('families', payload);
      await reload();
    },
    updateFamily: async (id, payload) => {
      await dataStore.update('families', id, payload);
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
      await dataStore.create('deliveries', {
        ...payload,
        receipt_number: payload.receipt_number || nextReceiptNumber(data.deliveries, payload.delivered_at),
        beneficiary_name: beneficiary?.full_name || '',
        family_id: family?.id || null,
        family_name: family?.family_code || '',
        inventory_item_name: item?.name || ''
      });
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
        if (cancelError) throw cancelError;
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
    createDonation: async (payload) => {
      await dataStore.create('donations', payload);
      await reload();
    },
    deleteDonation: async (id) => {
      assertPermission('donations', 'delete');
      await dataStore.remove('donations', id);
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
      const correctionReason = String(payload?.correction_reason || '').trim();
      if (correctionReason.length < 5) throw new Error('Indica un motivo de correccion valido.');
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
      const previousEvent = (data.accounting_events || []).find((item) => item.id === original.accounting_event_id);
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
        description: `${event.description}. Correccion: ${correctionReason}`
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
      if (cleanReason.length < 5) throw new Error('Indica un motivo de anulacion valido.');
      const original = (data.cash_bank_movements || []).find((movement) => movement.id === id);
      if (!original) throw new Error('El movimiento no existe.');
      if (original.status === 'voided') throw new Error('El movimiento ya esta anulado.');
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
      }
      await audit(`Contabilidad: anulo movimiento ${id}`.trim());
      await reload();
    },
    createTreasuryIncome: async (payload) => {
      await dataStore.create('treasury_incomes', payload);
      await audit(`Modifico tesoreria: ingreso ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryIncome: async (id, payload) => {
      await dataStore.update('treasury_incomes', id, payload);
      await audit(`Modifico tesoreria: ingreso ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryIncome: async (id) => {
      assertPermission('treasury', 'delete');
      await dataStore.remove('treasury_incomes', id);
      await audit('Modifico tesoreria: elimino ingreso');
      await reload();
    },
    createTreasuryExpense: async (payload) => {
      await dataStore.create('treasury_expenses', payload);
      await audit(`Modifico tesoreria: gasto ${payload.concept || ''}`.trim());
      await reload();
    },
    updateTreasuryExpense: async (id, payload) => {
      await dataStore.update('treasury_expenses', id, payload);
      await audit(`Modifico tesoreria: gasto ${payload.concept || ''}`.trim());
      await reload();
    },
    deleteTreasuryExpense: async (id) => {
      assertPermission('treasury', 'delete');
      await dataStore.remove('treasury_expenses', id);
      await audit('Modifico tesoreria: elimino gasto');
      await reload();
    },
    createTreasuryLoan: async (payload) => {
      await dataStore.create('treasury_loans', payload);
      await reload();
    },
    updateTreasuryLoan: async (id, payload) => {
      await dataStore.update('treasury_loans', id, payload);
      await reload();
    },
    deleteTreasuryLoan: async (id) => {
      assertPermission('treasury', 'delete');
      await dataStore.remove('treasury_loans', id);
      await reload();
    },
    createTreasuryAccount: async (payload) => {
      await dataStore.create('treasury_accounts', payload);
      await reload();
    },
    updateTreasuryAccount: async (id, payload) => {
      await dataStore.update('treasury_accounts', id, payload);
      await reload();
    },
    deleteTreasuryAccount: async (id) => {
      assertPermission('treasury', 'delete');
      await dataStore.remove('treasury_accounts', id);
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
            throw new Error(formatApiError(result, 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.'));
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
      await audit('Restablecio contrasena de usuario');
      await reload();
    },
    updateUserLastAccess: async (id) => {
      await dataStore.update('app_users', id, { last_access_at: new Date().toISOString() });
      await audit('Inicio sesion');
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
    resetDemo: () => {
      dataStore.resetLocalDemo();
      reload();
    }
  }), [data, reload, currentUser]);

  return { data, loading, error, actions };
}
