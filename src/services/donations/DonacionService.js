import { normalize } from '../../lib/formatters';

function cleanText(value) {
  return String(value || '').trim();
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
    if (duplicate) return duplicate;

    const contact = await this.repository.createDonorContact({
      ...cleanContact,
      created_at: new Date().toISOString()
    });
    await this.accountingAuditTrail('accounting_contacts', contact.id, 'create_donor', null, contact);
    await this.audit(`Donantes: creo ficha de donante ${contact.name}`.trim());
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
    await this.audit(`Donantes: eliminó donante sin donaciones ${contact.name}`.trim());
  }

  async recordEconomicDonation(payload = {}) {
    this.assertPermission('accounting', 'create');
    const donorName = cleanText(payload.donor_name || payload.contact_name);
    await this.audit(`Contabilidad: donación monetaria ${donorName}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'economic', donorName, payload });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'economic', donorName, payload });
  }

  async recordPortalDonationRequest(payload = {}, context = {}) {
    const donation = await this.repository.createDonation(payload);
    const donorName = cleanText(payload.donor || context.donor?.name || '');
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
    const donation = await this.repository.createDonation({
      donor: cleanDonorName || 'Donante',
      donor_kind: payload.donor_kind || 'Particular',
      donation_type: payload.donation_type || item.category || item.name,
      donated_at: date,
      estimated_value: amount,
      notes: [`Referencia: ${reference}`, cleanText(payload.notes || title)].filter(Boolean).join('\n')
    });

    const inventoryMovement = await this.inventarioService.createMovement({
      item_id: item.id,
      movement_type: 'Entrada',
      quantity,
      moved_at: date,
      responsible: cleanText(payload.responsible) || this.currentUserName(),
      notes: `Donación en especie: ${title}`
    }, { requirePermission: false });

    await this.audit(`Contabilidad: donación en especie ${cleanDonorName || item.name}`.trim());
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

    return { donation, inventoryMovement };
  }

  async removeDonation(id) {
    await this.repository.removeDonation(id);
    await this.audit(`Donaciones: eliminó donación ${id}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'deleted', donationId: id });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'deleted', donationId: id });
  }

  findDonorContact(id) {
    return (this.data.accounting_contacts || []).find((item) => item.id === id && normalize(item.contact_type) === 'donor');
  }
}
