import { hasSupabaseConfig, supabase, supabaseStorageBucket } from './supabase';

const STORAGE_SCHEME = 'storage://';
const SIGNED_URL_SECONDS = 60 * 60;

function cleanText(value) {
  return String(value || '').trim();
}

function sanitizePathSegment(value, fallback = 'documento') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    || fallback;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el documento adjunto.'));
    reader.readAsDataURL(file);
  });
}

export function parseStorageDocumentUrl(value) {
  const text = cleanText(value);
  if (!text.startsWith(STORAGE_SCHEME)) return null;
  const reference = text.slice(STORAGE_SCHEME.length);
  const separator = reference.indexOf('/');
  if (separator < 1 || separator === reference.length - 1) return null;
  return {
    bucket: reference.slice(0, separator),
    path: reference.slice(separator + 1)
  };
}

export async function uploadBeneficiaryDocumentFile({ beneficiaryId, file }) {
  if (!file) throw new Error('Selecciona un archivo para subir.');
  if (!hasSupabaseConfig) {
    return {
      fileDataUrl: await fileToDataUrl(file),
      storagePath: '',
      storageBucket: '',
      storageReference: ''
    };
  }

  const extension = cleanText(file.name).includes('.') ? cleanText(file.name).split('.').pop() : 'bin';
  const fileName = sanitizePathSegment(file.name, `documento.${extension}`);
  const path = `beneficiary-documents/${beneficiaryId}/${crypto.randomUUID()}-${fileName}`;
  const { error } = await supabase.storage
    .from(supabaseStorageBucket)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false
    });
  if (error) throw new Error(`No se pudo subir el documento a Storage: ${error.message}`);

  const storageReference = `${STORAGE_SCHEME}${supabaseStorageBucket}/${path}`;
  return {
    fileDataUrl: storageReference,
    storagePath: path,
    storageBucket: supabaseStorageBucket,
    storageReference
  };
}

export async function resolveBeneficiaryDocumentUrl(value) {
  const storageReference = parseStorageDocumentUrl(value);
  if (!storageReference) return cleanText(value);
  if (!hasSupabaseConfig) return '';

  const { data, error } = await supabase.storage
    .from(storageReference.bucket)
    .createSignedUrl(storageReference.path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`No se pudo abrir el documento: ${error.message}`);
  return data.signedUrl;
}

export async function removeBeneficiaryDocumentFile(value) {
  const storageReference = parseStorageDocumentUrl(value);
  if (!storageReference || !hasSupabaseConfig) return;
  const { error } = await supabase.storage
    .from(storageReference.bucket)
    .remove([storageReference.path]);
  if (error) throw new Error(`No se pudo eliminar el archivo de Storage: ${error.message}`);
}
