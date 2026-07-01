import { hasSupabaseConfig, supabase, supabaseBeneficiaryPhotosBucket } from './supabase';

const STORAGE_SCHEME = 'storage://';
const SIGNED_URL_SECONDS = 60 * 60;

function log(step, detail = '') {
  console.info(`[BeneficiaryPhoto] ${step}`, detail);
}

function dataUrlToBlob(dataUrl) {
  const [metadata, encoded] = String(dataUrl).split(',');
  if (!metadata || !encoded) throw new Error('La imagen optimizada no tiene un formato valido.');
  const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] || 'image/webp';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function parseBeneficiaryPhotoUrl(photoUrl) {
  if (!String(photoUrl || '').startsWith(STORAGE_SCHEME)) return null;
  const reference = String(photoUrl).slice(STORAGE_SCHEME.length);
  const separator = reference.indexOf('/');
  if (separator < 1 || separator === reference.length - 1) return null;
  return { bucket: reference.slice(0, separator), path: reference.slice(separator + 1) };
}

async function createDisplayUrl(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`No se pudo obtener la fotografia: ${error.message}`);
  return data.signedUrl;
}

export async function uploadBeneficiaryPhoto(beneficiaryId, dataUrl) {
  if (!hasSupabaseConfig) {
    log('Modo local: fotografia guardada en los datos de demostracion');
    return { photoUrl: null, photoDataUrl: dataUrl, displayUrl: dataUrl };
  }

  const blob = dataUrlToBlob(dataUrl);
  const path = `beneficiaries/${beneficiaryId}/${crypto.randomUUID()}.webp`;
  log('Iniciando subida', { bucket: supabaseBeneficiaryPhotosBucket, path, bytes: blob.size });
  const { error } = await supabase.storage
    .from(supabaseBeneficiaryPhotosBucket)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
  if (error) {
    console.error('[BeneficiaryPhoto] Error de subida', error);
    throw new Error(`No se pudo subir la fotografia: ${error.message}`);
  }

  const photoUrl = `${STORAGE_SCHEME}${supabaseBeneficiaryPhotosBucket}/${path}`;
  const displayUrl = await createDisplayUrl(supabaseBeneficiaryPhotosBucket, path);
  log('Subida completada', { photoUrl });
  return { photoUrl, photoDataUrl: null, displayUrl };
}

export async function resolveBeneficiaryPhotoUrl(beneficiary) {
  if (beneficiary?.photo_data_url) return beneficiary.photo_data_url;
  const photoUrl = beneficiary?.photo_url || beneficiary?.photo || beneficiary?.avatar_url;
  if (!photoUrl) return null;
  const storageReference = parseBeneficiaryPhotoUrl(photoUrl);
  if (!storageReference) return photoUrl;
  if (!hasSupabaseConfig) return null;

  try {
    const displayUrl = await createDisplayUrl(storageReference.bucket, storageReference.path);
    log('URL firmada recuperada', { path: storageReference.path });
    return displayUrl;
  } catch (error) {
    console.error('[BeneficiaryPhoto] Error al recuperar la fotografia', error);
    throw error;
  }
}

export async function removeBeneficiaryPhoto(photoUrl) {
  const storageReference = parseBeneficiaryPhotoUrl(photoUrl);
  if (!storageReference || !hasSupabaseConfig) return;
  log('Eliminando objeto', { path: storageReference.path });
  const { error } = await supabase.storage.from(storageReference.bucket).remove([storageReference.path]);
  if (error) {
    console.error('[BeneficiaryPhoto] Error al eliminar el objeto', error);
    throw new Error(`No se pudo eliminar la fotografia almacenada: ${error.message}`);
  }
}
