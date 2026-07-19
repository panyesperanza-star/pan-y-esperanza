import { supabaseDeliverySignaturesBucket } from '../../lib/supabase';
import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

function isSignatureDataUrl(value) {
  return String(value || '').startsWith('data:image/png;base64,') || String(value || '').startsWith('data:image/');
}

function safeSegment(value, fallback = 'sin-id') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export class EntregaRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
    this.supabase = supabase;
    this.hasSupabaseConfig = hasSupabaseConfig;
    this.signatureBucket = supabaseDeliverySignaturesBucket;
  }

  async create(payload) {
    return this.repository.create('deliveries', payload);
  }

  async update(id, payload) {
    return this.repository.update('deliveries', id, payload);
  }

  async remove(id) {
    return this.repository.remove('deliveries', id);
  }

  async cancelWithRpc(id, reason) {
    if (!this.hasSupabaseConfig) return null;
    return this.repository.rpc('cancel_delivery', {
      p_delivery_id: id,
      p_reason: reason
    });
  }

  async saveSignatureImages({ delivery, beneficiary, signatureDataUrl, responsibleSignatureDataUrl } = {}) {
    return {
      receiver: await this.uploadSignature({
        delivery,
        beneficiary,
        role: 'receiver',
        dataUrl: signatureDataUrl
      }),
      responsible: await this.uploadSignature({
        delivery,
        beneficiary,
        role: 'responsible',
        dataUrl: responsibleSignatureDataUrl
      })
    };
  }

  async uploadSignature({ delivery, beneficiary, role, dataUrl } = {}) {
    if (!isSignatureDataUrl(dataUrl)) return null;

    if (!this.hasSupabaseConfig || !this.supabase?.storage) {
      return {
        bucket: null,
        path: null,
        storageUrl: null,
        dataUrl
      };
    }

    const deliveryId = safeSegment(delivery?.id, 'entrega');
    const beneficiaryId = safeSegment(beneficiary?.id || delivery?.beneficiary_id, 'beneficiario');
    const receipt = safeSegment(delivery?.receipt_number, 'sin-justificante');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const path = `deliveries/${deliveryId}/beneficiaries/${beneficiaryId}/${role}-${receipt}-${timestamp}.png`;
    const blob = await dataUrlToBlob(dataUrl);
    const { error } = await this.supabase.storage
      .from(this.signatureBucket)
      .upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: true });

    if (error) throw error;

    return {
      bucket: this.signatureBucket,
      path,
      storageUrl: `storage://${this.signatureBucket}/${path}`,
      dataUrl
    };
  }
}