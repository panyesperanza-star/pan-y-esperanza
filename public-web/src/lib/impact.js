import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const emptyImpact = {
  families: null,
  beneficiaries: null,
  volunteers: null,
  donors: null,
  deliveries: null,
  foodKg: null,
  companies: null,
  source: 'pending',
  updatedAt: null
};

export async function loadPublicImpact() {
  if (!supabaseUrl || !supabaseAnonKey) return emptyImpact;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [
    beneficiaries,
    families,
    volunteers,
    deliveries,
    donations,
    contacts
  ] = await Promise.all([
    safeSelect(supabase, 'beneficiaries', 'id,is_active,status,family_members,minors_count'),
    safeSelect(supabase, 'families', 'id,status'),
    safeSelect(supabase, 'volunteers', 'id,status,is_active'),
    safeSelect(supabase, 'deliveries', 'id,status,quantity,help_type,inventory_item_name,delivered_at'),
    safeSelect(supabase, 'donations', 'id,donor,donor_name,contact_name,amount,estimated_value,status'),
    safeSelect(supabase, 'accounting_contacts', 'id,name,kind,type,category,status')
  ]);

  const hasLiveData = [beneficiaries, families, volunteers, deliveries, donations, contacts]
    .some((result) => result.ok && result.rows.length > 0);

  if (!hasLiveData) return emptyImpact;

  const beneficiaryRows = beneficiaries.rows.filter((item) => isActive(item));
  const familyRows = families.rows.filter((item) => isActive(item));
  const volunteerRows = volunteers.rows.filter((item) => isActive(item));
  const deliveryRows = deliveries.rows.filter((item) => isActive(item));
  const donorNames = new Set();

  donations.rows
    .filter((item) => isActive(item))
    .forEach((item) => {
      const name = clean(item.donor || item.donor_name || item.contact_name);
      if (name) donorNames.add(name.toLowerCase());
    });

  contacts.rows
    .filter((item) => isActive(item))
    .forEach((item) => {
      const name = clean(item.name);
      if (name) donorNames.add(name.toLowerCase());
    });

  const companies = contacts.rows.filter((item) => {
    const label = `${item.kind || ''} ${item.type || ''} ${item.category || ''}`.toLowerCase();
    return isActive(item) && (label.includes('empresa') || label.includes('fundacion') || label.includes('fundación'));
  }).length;

  const foodKg = deliveryRows.reduce((total, item) => {
    const label = `${item.help_type || ''} ${item.inventory_item_name || ''}`.toLowerCase();
    if (!label.includes('alimento') && !label.includes('comida') && !label.includes('lote')) return total;
    const quantity = Number(item.quantity || 0);
    return Number.isFinite(quantity) ? total + quantity : total;
  }, 0);

  return {
    families: familyRows.length,
    beneficiaries: beneficiaryRows.length,
    volunteers: volunteerRows.length,
    donors: donorNames.size || donations.rows.filter((item) => isActive(item)).length,
    deliveries: deliveryRows.length,
    foodKg,
    companies,
    source: 'erp',
    updatedAt: new Date().toISOString()
  };
}

async function safeSelect(supabase, table, columns) {
  try {
    const { data, error } = await supabase.from(table).select(columns);
    if (error) return { ok: false, rows: [] };
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, rows: [] };
  }
}

function isActive(item) {
  const status = String(item?.status || '').toLowerCase();
  if (item?.is_active === false) return false;
  return !['anulada', 'anulado', 'archivada', 'archivado', 'cancelada', 'cancelado', 'voided'].includes(status);
}

function clean(value) {
  return String(value || '').trim();
}
