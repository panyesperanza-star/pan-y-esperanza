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
