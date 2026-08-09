import { normalize } from '../../lib/formatters';

const DONOR_KIND_MARKER = '[DONANTE_TIPO]';
const DONOR_CONTACT_MARKER = '[DONANTE_CONTACTO]';
const COLLABORATOR_KINDS = new Set(['empresa', 'comercio', 'iglesia', 'asociacion', 'fundacion', 'administracion', 'institucion', 'entidad', 'colaborador']);

function cleanText(value) {
  return String(value || '').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function markerValue(notes, marker) {
  const line = String(notes || '').split(/\r?\n/).find((item) => item.startsWith(marker));
  return line ? cleanText(line.slice(marker.length)) : '';
}

function resolveDonorKind(payload = {}, current = {}) {
  return cleanText(
    payload.kind
    || payload.donor_kind
    || markerValue(payload.notes, DONOR_KIND_MARKER)
    || markerValue(current.notes, DONOR_KIND_MARKER)
    || current.kind
  ) || inferCollaboratorKind(payload.name || current.name);
}

function resolveContactPerson(payload = {}, current = {}) {
  return cleanText(
    payload.contact_person
    || payload.contactPerson
    || payload.contact_name
    || markerValue(payload.notes, DONOR_CONTACT_MARKER)
    || markerValue(current.notes, DONOR_CONTACT_MARKER)
  );
}

function inferCollaboratorKind(name = '') {
  const value = normalize(name);
  if (value.includes('iglesia') || value.includes('parroquia')) return 'Iglesia';
  if (value.includes('fundacion')) return 'Fundacion';
  if (value.includes('asociacion')) return 'Asociacion';
  if (value.includes('ayuntamiento') || value.includes('administracion')) return 'Administracion';
  if (/\b(sl|s l|sa|s a)\b/.test(value) || value.includes('empresa')) return 'Empresa';
  if (value.includes('entidad')) return 'Entidad';
  return '';
}

function isCollaboratorKind(kind) {
  return COLLABORATOR_KINDS.has(normalize(kind));
}

function isAnonymousKind(kind) {
  const value = normalize(kind);
  return value.includes('anonimo') || value.includes('anonima');
}

function safeAmount(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}

function safeDate(...values) {
  const value = values.map(cleanText).find(Boolean) || new Date().toISOString();
  return value.slice(0, 10);
}

function compactNotes(...values) {
  return values.map(cleanText).filter(Boolean).join('\n');
}

function nextDonorCode(donors = []) {
  const max = donors.reduce((highest, item) => {
    const match = String(item?.code || '').match(/DON-(\d+)/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `DON-${String(max + 1).padStart(5, '0')}`;
}

function nextCollaboratorCode(collaborators = []) {
  const max = collaborators.reduce((highest, item) => {
    const match = String(item?.code || '').match(/COL-(\d+)/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `COL-${String(max + 1).padStart(6, '0')}`;
}

export function sanitizeDonorContactPayload(payload = {}, current = {}) {
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

export function donorHasDonationRelations(contact, data = {}, isActiveAccountingRow = () => true) {
  if (!contact) return false;
  const contactId = contact.id;
  const donorName = normalize(contact.name);
  return (data.accounting_events || []).some((event) => event.contact_id === contactId && event.event_type === 'donation_money' && isActiveAccountingRow(event))
    || (data.social_value_events || []).some((event) => event.contact_id === contactId && event.value_type === 'received' && event.event_type === 'in_kind_donation' && isActiveAccountingRow(event))
    || (data.donations || []).some((donation) => normalize(donation.donor) === donorName && !['voided', 'anulada', 'anulado'].includes(normalize(donation.status || donation.state)))
    || (data.treasury_incomes || []).some((income) => normalize(income.donor) === donorName && normalize([income.category, income.concept].join(' ')).includes('donacion'));
}

export class DonacionService {
  constructor({
    repository,
    inventarioService,
    dashboardService,
    notificacionService = null,
    data = {},
    audit = async () => {},
    accountingAuditTrail = async () => {},
    assertPermission = () => {},
    assertAccountingSuperadmin = () => {},
    currentUserName = () => 'Usuario',
    isActiveAccountingRow = () => true
  } = {}) {
    if (!repository) throw new Error('DonacionService necesita un repository.');
    this.repository = repository;
    this.inventarioService = inventarioService;
    this.dashboardService = dashboardService;
    this.notificacionService = notificacionService;
    this.data = data;
    this.audit = audit;
    this.accountingAuditTrail = accountingAuditTrail;
    this.assertPermission = assertPermission;
    this.assertAccountingSuperadmin = assertAccountingSuperadmin;
    this.currentUserName = currentUserName;
    this.isActiveAccountingRow = isActiveAccountingRow;
  }

  async createDonorContact(payload) {
    this.assertPermission('accounting', 'create');
    const cleanContact = sanitizeDonorContactPayload(payload, { is_active: true });
    const latestContacts = await this.repository.listDonorContacts().catch(() => this.data.accounting_contacts || []);
    const duplicate = (latestContacts || []).find((item) => (
      normalize(item.contact_type) === 'donor'
      && (
        normalize(item.name) === normalize(cleanContact.name)
        || (cleanContact.email && normalize(item.email) === normalize(cleanContact.email))
      )
    ));
    if (duplicate) {
      await this.syncCollaboratorPortalAccess(duplicate, payload);
      await this.syncDonorPortalAccess(duplicate, payload);
      return duplicate;
    }

    const contact = await this.repository.createDonorContact({
      ...cleanContact,
      created_at: new Date().toISOString()
    });
    await this.accountingAuditTrail('accounting_contacts', contact.id, 'create_donor', null, contact);
    await this.audit(`Donantes: creo ficha de donante ${contact.name}`.trim());
    await this.syncCollaboratorPortalAccess(contact, payload);
    await this.syncDonorPortalAccess(contact, payload);
    return contact;
  }

  async updateDonorContact(id, payload) {
    this.assertPermission('accounting', 'edit');
    const current = this.findDonorContact(id);
    if (!current) throw new Error('El donante no existe.');
    const cleanContact = sanitizeDonorContactPayload(payload, current);
    const updated = await this.repository.updateDonorContact(id, cleanContact);
    await this.accountingAuditTrail('accounting_contacts', id, 'update_donor', current, updated);
    await this.audit(`Donantes: edito ficha de donante ${updated.name || current.name}`.trim());
    await this.syncCollaboratorPortalAccess(updated, payload, current, { deactivateWhenInactive: true });
    await this.syncDonorPortalAccess(updated, payload, current, { deactivateWhenInactive: true });
    return updated;
  }

  async archiveDonorContact(id, payload) {
    this.assertPermission('accounting', 'edit');
    const current = this.findDonorContact(id);
    if (!current) throw new Error('El donante no existe.');
    const updated = await this.repository.updateDonorContact(id, {
      notes: cleanText(payload?.notes ?? current.notes),
      is_active: payload?.is_active !== false,
      updated_at: new Date().toISOString()
    });
    await this.accountingAuditTrail('accounting_contacts', id, updated.is_active === false ? 'archive_donor' : 'unarchive_donor', current, updated);
    await this.audit(`Donantes: ${updated.is_active === false ? 'archivo' : 'desarchivo'} donante ${updated.name || current.name}`.trim());
    await this.syncCollaboratorPortalAccess(updated, payload, current, { deactivateWhenInactive: true });
    await this.syncDonorPortalAccess(updated, payload, current, { deactivateWhenInactive: true });
    return updated;
  }

  async deleteDonorContact(id) {
    this.assertAccountingSuperadmin();
    const contact = this.findDonorContact(id);
    if (!contact) throw new Error('El donante no existe.');
    if (donorHasDonationRelations(contact, this.data, this.isActiveAccountingRow)) {
      throw new Error('Este donante tiene donaciones registradas. Utilice Archivar.');
    }
    await this.repository.removeDonorContact(id);
    await this.accountingAuditTrail('accounting_contacts', id, 'delete_donor_without_donations', contact, null);
    await this.audit(`Donantes: elimino donante sin donaciones ${contact.name}`.trim());
  }

  async recordEconomicDonation(payload = {}) {
    this.assertPermission('accounting', 'create');
    const donorName = cleanText(payload.donor_name || payload.contact_name || payload.donor || payload.name);
    const donorEmail = cleanText(payload.contact_email || payload.donor_email || payload.email);
    const contact = {
      name: donorName,
      email: donorEmail,
      phone: cleanText(payload.contact_phone || payload.phone),
      address: cleanText(payload.contact_address || payload.address),
      is_active: true
    };
    const [collaborator, donor] = await Promise.all([
      this.syncCollaboratorPortalAccess(contact, payload),
      this.syncDonorPortalAccess(contact, payload)
    ]);
    const amount = safeAmount(payload.amount, payload.estimated_value);
    const paymentMethod = cleanText(payload.payment_method || payload.method || 'No indicado');
    const donation = await this.repository.createDonation({
      donor_id: donor?.id || payload.donor_id || null,
      collaborator_id: collaborator?.id || payload.collaborator_id || null,
      accounting_contact_id: cleanText(payload.donor_contact_id || payload.contact_id) || null,
      donor: donor?.name || donorName || 'Donante',
      donor_email: donor?.email || donorEmail,
      donor_kind: payload.donor_kind || payload.kind || 'Particular',
      donation_type: 'Economica',
      status: payload.status || 'Recibida',
      state: payload.state || payload.status || 'Recibida',
      payment_method: paymentMethod,
      donated_at: safeDate(payload.donated_at, payload.operation_at, payload.movement_datetime, payload.movement_at, payload.date),
      estimated_value: amount,
      amount,
      reference: cleanText(payload.reference) || null,
      campaign_id: cleanText(payload.campaign_id) || null,
      frequency: cleanText(payload.frequency || 'Puntual'),
      notes: compactNotes(payload.concept, payload.reference ? `Referencia: ${payload.reference}` : '', payload.notes),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.audit(`Contabilidad: donacion monetaria ${donorName}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'economic', donorName, donation, payload });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'economic', donorName, donation, payload });
    return donation;
  }

  async recordPortalDonationRequest(payload = {}, context = {}) {
    const contextDonor = context.donor || null;
    const donorName = cleanText(payload.donor || contextDonor?.name || payload.donor_name || 'Donante');
    const donorEmail = cleanText(payload.donor_email || contextDonor?.email || payload.email);
    const donor = contextDonor || await this.syncDonorPortalAccess({
      name: donorName,
      email: donorEmail,
      phone: cleanText(payload.phone || payload.contact_phone),
      is_active: true
    }, payload);
    const donation = await this.repository.createDonation({
      ...payload,
      donor_id: payload.donor_id || donor?.id || null,
      donor: donor?.name || donorName,
      donor_email: donor?.email || donorEmail,
      donor_kind: payload.donor_kind || 'Particular',
      status: payload.status || 'Pendiente',
      state: payload.state || payload.status || 'Pendiente',
      updated_at: new Date().toISOString()
    });
    await this.audit(`Portal donaciones: solicitud de donacion economica ${donorName}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: context.source || 'donor_portal', donation, payload });
    await this.notificacionService?.notifyDonationChanged?.({ type: context.source || 'donor_portal', donation, payload });
    return donation;
  }

  async recordInKindDonation({
    payload = {},
    item,
    quantity,
    amount,
    date,
    reference,
    title,
    donorName
  } = {}) {
    this.assertPermission('accounting', 'create');
    if (!this.inventarioService) throw new Error('DonacionService necesita InventarioService.');
    if (!item?.id) throw new Error('Selecciona un producto de inventario valido.');

    const cleanDonorName = cleanText(donorName || payload.donor_name || payload.contact_name);
    const contact = {
      name: cleanDonorName,
      email: cleanText(payload.contact_email || payload.donor_email),
      phone: cleanText(payload.contact_phone),
      address: cleanText(payload.contact_address),
      is_active: true
    };
    const [collaborator, donor] = await Promise.all([
      this.syncCollaboratorPortalAccess(contact, payload),
      this.syncDonorPortalAccess(contact, payload)
    ]);
    const safeQuantity = Number(quantity || 0);
    const safeTotal = safeAmount(amount);
    const unitValue = safeQuantity > 0 ? Math.round((safeTotal / safeQuantity) * 10000) / 10000 : 0;
    const donation = await this.repository.createDonation({
      donor_id: donor?.id || payload.donor_id || null,
      collaborator_id: collaborator?.id || payload.collaborator_id || null,
      accounting_contact_id: cleanText(payload.donor_contact_id || payload.contact_id) || null,
      inventory_item_id: item.id,
      donor: donor?.name || cleanDonorName || 'Donante',
      donor_email: donor?.email || cleanText(payload.contact_email || payload.donor_email),
      donor_kind: payload.donor_kind || 'Particular',
      donation_type: payload.donation_type || item.category || item.name,
      status: payload.status || 'Recibida',
      state: payload.state || payload.status || 'Recibida',
      donated_at: date,
      estimated_value: safeTotal,
      amount: safeTotal,
      quantity: quantity ? String(quantity) : '',
      reference,
      unit_value: unitValue,
      campaign_id: cleanText(payload.campaign_id) || null,
      payment_method: cleanText(payload.payment_method),
      notes: compactNotes(`Referencia: ${reference}`, payload.notes || title),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const donationProduct = await this.repository.createDonationProduct({
      donation_id: donation.id,
      donor_id: donation.donor_id || null,
      accounting_contact_id: donation.accounting_contact_id || null,
      inventory_item_id: item.id,
      product_name: item.name,
      category: item.category || payload.inventory_category || '',
      lot: item.lot || payload.inventory_lot || '',
      unit: item.unit || payload.inventory_unit || '',
      quantity_received: safeQuantity,
      estimated_unit_value: unitValue,
      estimated_total_value: safeTotal,
      expires_at: item.expires_at || payload.inventory_expires_at || null,
      received_at: date,
      status: 'received',
      notes: compactNotes(payload.notes, title),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const inventoryMovement = await this.inventarioService.createMovement({
      item_id: item.id,
      movement_type: 'Entrada',
      quantity,
      moved_at: date,
      responsible: cleanText(payload.responsible) || this.currentUserName(),
      notes: `Donacion en especie: ${title}`,
      donation_id: donation.id,
      donation_product_id: donationProduct.id,
      source_module: 'donations',
      source_record_id: donation.id
    }, { requirePermission: false });

    await Promise.all([
      this.repository.updateDonation(donation.id, {
        inventory_movement_id: inventoryMovement?.id || null,
        updated_at: new Date().toISOString()
      }),
      this.repository.updateDonationProduct(donationProduct.id, {
        inventory_movement_id: inventoryMovement?.id || null,
        updated_at: new Date().toISOString()
      })
    ]);

    await this.audit(`Contabilidad: donacion en especie ${cleanDonorName || item.name}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({
      type: 'in_kind',
      donation,
      inventoryMovement,
      item,
      quantity,
      amount
    });
    await this.notificacionService?.notifyDonationChanged?.({
      type: 'in_kind',
      donation,
      inventoryMovement,
      item,
      quantity,
      amount
    });

    return { donation, donationProduct, inventoryMovement };
  }

  async removeDonation(id) {
    await this.repository.removeDonation(id);
    await this.audit(`Donaciones: elimino donacion ${id}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'deleted', donationId: id });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'deleted', donationId: id });
  }

  findDonorContact(id) {
    return (this.data.accounting_contacts || []).find((item) => item.id === id && normalize(item.contact_type) === 'donor');
  }

  async syncDonorPortalAccess(contact = {}, payload = {}, previous = {}, options = {}) {
    const email = cleanText(contact.email || payload.email || payload.contact_email || payload.donor_email).toLowerCase();
    const name = cleanText(contact.name || payload.name || payload.donor_name || payload.contact_name || payload.donor);
    if (!name) return null;

    const kind = resolveDonorKind(payload, contact) || resolveDonorKind(payload, previous) || 'Particular';
    if (isAnonymousKind(kind)) return null;

    const [donors, collaborators] = await Promise.all([
      this.repository.listDonors().catch(() => this.data.donors || []),
      this.repository.listCollaborators().catch(() => this.data.collaborators || [])
    ]);
    const existing = (donors || []).find((item) => (
      (email && (lower(item.email) === lower(email) || lower(item.access_email) === lower(email)))
      || normalize(item.name) === normalize(name)
    ));
    if (!email) return existing || null;
    const linkedCollaborator = (collaborators || []).find((item) => lower(item.email) === lower(email) || lower(item.access_email) === lower(email));
    const shouldBeActive = contact.is_active !== false && payload.is_active !== false;

    if (!shouldBeActive) {
      if (!options.deactivateWhenInactive) return existing || null;
      if (existing?.is_active !== false) {
        const updated = await this.repository.updateDonor(existing.id, {
          is_active: false,
          updated_at: new Date().toISOString()
        });
        await this.audit(`Portal donante: acceso desactivado para ${existing.name || name}`.trim());
        return updated;
      }
      return existing || null;
    }

    const donorPayload = {
      code: existing?.code || nextDonorCode(donors),
      name,
      email,
      access_email: lower(existing?.access_email || email),
      phone: cleanText(contact.phone || payload.phone || payload.contact_phone || previous.phone),
      address: cleanText(contact.address || payload.address || payload.contact_address || previous.address),
      type: kind || previous.type || 'Particular',
      status: 'Activo',
      portal_status: 'Activo',
      collaborator_id: linkedCollaborator?.id || previous.collaborator_id || null,
      is_active: true,
      portal_activated_at: existing?.portal_activated_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existing) {
      const updated = await this.repository.updateDonor(existing.id, donorPayload);
      await this.audit(`Portal donante: acceso actualizado para ${updated.name || name}`.trim());
      return updated;
    }

    const created = await this.repository.createDonor({
      ...donorPayload,
      impact: {},
      created_at: new Date().toISOString()
    });
    await this.audit(`Portal donante: acceso activado para ${created.name || name}`.trim());
    return created;
  }

  async syncCollaboratorPortalAccess(contact = {}, payload = {}, previous = {}, options = {}) {
    const email = cleanText(contact.email || payload.email || payload.contact_email || payload.donor_email);
    const name = cleanText(contact.name || payload.name || payload.donor_name || payload.contact_name);
    if (!email || !name) return null;

    const kind = resolveDonorKind(payload, contact) || resolveDonorKind(payload, previous);
    const shouldBeActive = contact.is_active !== false && isCollaboratorKind(kind);
    const collaborators = await this.repository.listCollaborators().catch(() => this.data.collaborators || []);
    const existing = (collaborators || []).find((item) => lower(item.email) === lower(email));

    if (!shouldBeActive) {
      if (!options.deactivateWhenInactive) return existing || null;
      if (existing?.is_active !== false) {
        const updated = await this.repository.updateCollaborator(existing.id, {
          is_active: false,
          updated_at: new Date().toISOString()
        });
        await this.audit(`Portal colaboradores: acceso desactivado para ${existing.name || name}`.trim());
        return updated;
      }
      return existing || null;
    }

    const collaboratorPayload = {
      code: existing?.code || nextCollaboratorCode(collaborators),
      type: kind || 'Colaborador',
      name,
      contact_name: resolveContactPerson(payload, contact) || resolveContactPerson(payload, previous),
      email,
      phone: cleanText(contact.phone || payload.phone || payload.contact_phone),
      address: cleanText(contact.address || payload.address || payload.contact_address),
      access_email: email,
      status: 'Activo',
      is_active: true,
      portal_status: 'Activo',
      notes: cleanText(contact.notes || payload.notes || previous.notes),
      updated_at: new Date().toISOString()
    };

    if (existing) {
      const updated = await this.repository.updateCollaborator(existing.id, collaboratorPayload);
      await this.audit(`Portal colaboradores: acceso actualizado para ${updated.name || name}`.trim());
      return updated;
    }

    const created = await this.repository.createCollaborator({
      ...collaboratorPayload,
      impact: {},
      created_at: new Date().toISOString()
    });
    await this.audit(`Portal colaboradores: acceso activado para ${created.name || name}`.trim());
    return created;
  }
}
