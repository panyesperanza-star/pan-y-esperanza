import { nextBeneficiaryCode, normalize, normalizeDocument } from '../../lib/formatters';

export function sanitizeBeneficiaryPayload(payload) {
  const {
    __family_mode,
    __new_family,
    __new_family_enabled,
    __allow_duplicate_document,
    ...beneficiaryPayload
  } = payload || {};

  return {
    ...beneficiaryPayload,
    document_id: normalizeDocument(beneficiaryPayload.document_id),
    family_id: beneficiaryPayload.family_id || null
  };
}

export function findDuplicateBeneficiaryDocument(beneficiaries = [], payload = {}, currentId) {
  const documentId = normalizeDocument(payload.document_id);
  if (!documentId) return null;
  return beneficiaries.find((item) => normalizeDocument(item.document_id) === documentId && item.id !== currentId) || null;
}

export function findDuplicateBeneficiaryCode(beneficiaries = [], payload = {}, currentId) {
  const code = normalize(payload.code);
  if (!code) return null;
  return beneficiaries.find((item) => normalize(item.code) === code && item.id !== currentId) || null;
}

export function assertUniqueBeneficiary(beneficiaries = [], payload = {}, currentId, options = {}) {
  const duplicateDocument = findDuplicateBeneficiaryDocument(beneficiaries, payload, currentId);
  if (duplicateDocument && !options.allowDuplicateDocument) {
    throw new Error(`Ya existe un beneficiario con DNI/NIE / NIE O PASAPORTE ${normalizeDocument(payload.document_id)}: ${duplicateDocument.full_name}.`);
  }

  const duplicateCode = findDuplicateBeneficiaryCode(beneficiaries, payload, currentId);
  if (duplicateCode) {
    throw new Error(`Ya existe un beneficiario registrado con codigo ${payload.code}.`);
  }
}

export class BeneficiarioService {
  constructor({ repository, beneficiaries = [], audit = async () => {}, assertPermission = () => {}, notificacionService = null } = {}) {
    if (!repository) throw new Error('BeneficiarioService necesita un repository.');
    this.repository = repository;
    this.beneficiaries = beneficiaries;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.notificacionService = notificacionService;
  }

  async create(payload) {
    const allowDuplicateDocument = payload?.__allow_duplicate_document === true;
    if (allowDuplicateDocument) this.assertPermission('beneficiaries', 'edit');
    assertUniqueBeneficiary(this.beneficiaries, payload, undefined, { allowDuplicateDocument });
    const cleanPayload = {
      ...sanitizeBeneficiaryPayload(payload),
      code: payload.code || nextBeneficiaryCode(this.beneficiaries)
    };
    const created = await this.repository.create(cleanPayload);
    await this.audit(`Creo beneficiario ${payload.full_name || ''}`.trim());
    await this.notificacionService?.notifyBeneficiaryChanged?.({ type: 'created', beneficiary: created });
    return created;
  }

  async update(id, payload) {
    const allowDuplicateDocument = payload?.__allow_duplicate_document === true;
    if (allowDuplicateDocument) this.assertPermission('beneficiaries', 'edit');
    assertUniqueBeneficiary(this.beneficiaries, payload, id, { allowDuplicateDocument });
    const cleanPayload = sanitizeBeneficiaryPayload(payload);
    const updated = await this.repository.update(id, cleanPayload);
    await this.audit(`Edito beneficiario ${payload.full_name || ''}`.trim());
    await this.notificacionService?.notifyBeneficiaryChanged?.({ type: 'updated', beneficiary: updated });
    return updated;
  }

  async remove(id) {
    this.assertPermission('beneficiaries', 'delete');
    await this.repository.remove(id);
    await this.audit('Elimino beneficiario');
  }

  async createDocument(payload) {
    const created = await this.repository.createDocument(payload);
    await this.notificacionService?.notifyBeneficiaryDocumentChanged?.({ type: 'pending', document: created, payload });
    return created;
  }

  async removeDocument(id) {
    this.assertPermission('beneficiaries', 'delete');
    return this.repository.removeDocument(id);
  }

  async createSocialHistory(payload) {
    return this.repository.createSocialHistory(payload);
  }

  async updateLastHelpAt(id, lastHelpAt) {
    return this.repository.updateLastHelpAt(id, lastHelpAt || null);
  }
}
