import { useCallback, useEffect, useMemo, useState } from 'react';
import { dataStore } from '../lib/dataStore';
import { nextBeneficiaryCode, nextReceiptNumber, normalizeDocument } from '../lib/formatters';
import { hasSupabaseConfig } from '../lib/supabase';

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
    await dataStore.create('audit_logs', {
      user_name: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.email : 'Sistema',
      user_email: currentUser?.email || '',
      action,
      happened_at: new Date().toISOString()
    });
  }

  const actions = useMemo(() => ({
    createBeneficiary: async (payload) => {
      dataStore.assertUniqueDocument(data.beneficiaries, payload);
      await dataStore.create('beneficiaries', {
        ...payload,
        document_id: normalizeDocument(payload.document_id),
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
      await dataStore.remove('beneficiary_documents', id);
      await reload();
    },
    createSocialHistory: async (payload) => {
      await dataStore.create('social_history', payload);
      await reload();
    },
    updateBeneficiary: async (id, payload) => {
      dataStore.assertUniqueDocument(data.beneficiaries, payload, id);
      await dataStore.update('beneficiaries', id, { ...payload, document_id: normalizeDocument(payload.document_id) });
      await audit(`Edito beneficiario ${payload.full_name || ''}`.trim());
      await reload();
    },
    deleteBeneficiary: async (id) => {
      await dataStore.remove('beneficiaries', id);
      await audit('Elimino beneficiario');
      await reload();
    },
    createDelivery: async (payload) => {
      const beneficiary = data.beneficiaries.find((item) => item.id === payload.beneficiary_id);
      const family = data.families.find((item) => item.id === beneficiary?.family_id);
      const item = data.inventory_items.find((entry) => entry.id === payload.inventory_item_id);
      const quantity = Number(payload.quantity || 0);
      await dataStore.create('deliveries', {
        ...payload,
        receipt_number: payload.receipt_number || nextReceiptNumber(data.deliveries, payload.delivered_at),
        beneficiary_name: beneficiary?.full_name || '',
        family_id: family?.id || '',
        family_name: family?.family_code || '',
        inventory_item_name: item?.name || ''
      });
      if (!hasSupabaseConfig && beneficiary) await dataStore.update('beneficiaries', beneficiary.id, { last_help_at: payload.delivered_at });
      if (!hasSupabaseConfig && item && quantity > 0) {
        const nextStock = Math.max(Number(item.stock || 0) - quantity, 0);
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
      await dataStore.remove('deliveries', id);
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
      await dataStore.create('inventory_items', payload);
      await audit(`Creo inventario ${payload.name || ''}`.trim());
      await reload();
    },
    updateInventoryItem: async (id, payload) => {
      await dataStore.update('inventory_items', id, payload);
      await audit(`Edito inventario ${payload.name || ''}`.trim());
      await reload();
    },
    createInventoryMovement: async (payload) => {
      const item = data.inventory_items.find((entry) => entry.id === payload.item_id);
      const quantity = Number(payload.quantity || 0);
      const stock = payload.movement_type === 'Entrada' ? Number(item.stock || 0) + quantity : Math.max(Number(item.stock || 0) - quantity, 0);
      await dataStore.create('inventory_movements', { ...payload, item_name: item?.name || '' });
      if (item) await dataStore.update('inventory_items', item.id, { stock });
      await audit(`Registro movimiento de inventario ${item?.name || ''}`.trim());
      await reload();
    },
    createDonation: async (payload) => {
      await dataStore.create('donations', payload);
      await reload();
    },
    deleteDonation: async (id) => {
      await dataStore.remove('donations', id);
      await reload();
    },
    createDonor: async (payload) => {
      await dataStore.create('donors', payload);
      await audit(`Creo donante ${payload.name || ''}`.trim());
      await reload();
    },
    updateDonor: async (id, payload) => {
      await dataStore.update('donors', id, payload);
      await audit(`Edito donante ${payload.name || ''}`.trim());
      await reload();
    },
    deleteDonor: async (id) => {
      await dataStore.remove('donors', id);
      await audit('Elimino donante');
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
      await dataStore.create('app_users', payload);
      await audit(`Creo usuario ${payload.email || ''}`.trim());
      await reload();
    },
    updateUser: async (id, payload) => {
      const existing = data.app_users.find((user) => user.id === id);
      if (existing?.role === 'Superadministrador' && payload.is_active === false && data.app_users.filter((user) => user.role === 'Superadministrador' && user.is_active && user.id !== id).length === 0) {
        throw new Error('No se puede desactivar al ultimo Superadministrador.');
      }
      await dataStore.update('app_users', id, payload);
      await audit(`Edito usuario ${payload.email || ''}`.trim());
      await reload();
    },
    deactivateUser: async (id) => {
      const existing = data.app_users.find((user) => user.id === id);
      if (existing?.role === 'Superadministrador' && data.app_users.filter((user) => user.role === 'Superadministrador' && user.is_active && user.id !== id).length === 0) {
        throw new Error('No se puede desactivar al ultimo Superadministrador.');
      }
      await dataStore.update('app_users', id, { is_active: false });
      await audit(`Desactivo usuario ${existing?.email || ''}`.trim());
      await reload();
    },
    resetUserPassword: async (id, password) => {
      await dataStore.update('app_users', id, { password });
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
