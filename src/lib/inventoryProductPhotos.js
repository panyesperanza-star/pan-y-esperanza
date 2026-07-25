import { hasSupabaseConfig, supabase, supabaseInventoryProductPhotosBucket } from './supabase';

const STORAGE_SCHEME = 'storage://';
const SIGNED_URL_SECONDS = 60 * 60;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function dataUrlToBlob(dataUrl) {
  const [metadata, encoded] = String(dataUrl).split(',');
  if (!metadata || !encoded) throw new Error('La imagen optimizada no tiene un formato valido.');
  const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] || 'image/webp';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function parseInventoryProductPhotoUrl(photoUrl) {
  if (!String(photoUrl || '').startsWith(STORAGE_SCHEME)) return null;
  const reference = String(photoUrl).slice(STORAGE_SCHEME.length);
  const separator = reference.indexOf('/');
  if (separator < 1 || separator === reference.length - 1) return null;
  return { bucket: reference.slice(0, separator), path: reference.slice(separator + 1) };
}

async function createDisplayUrl(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`No se pudo obtener la imagen del producto: ${error.message}`);
  return data.signedUrl;
}

export async function uploadInventoryProductPhoto(productId, dataUrl) {
  if (!hasSupabaseConfig) {
    return { photoUrl: null, photoDataUrl: dataUrl, displayUrl: dataUrl };
  }

  const blob = dataUrlToBlob(dataUrl);
  const safeProductId = productId || crypto.randomUUID();
  const path = `products/${safeProductId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(supabaseInventoryProductPhotosBucket)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen del producto: ${error.message}`);

  const photoUrl = `${STORAGE_SCHEME}${supabaseInventoryProductPhotosBucket}/${path}`;
  const displayUrl = await createDisplayUrl(supabaseInventoryProductPhotosBucket, path);
  return { photoUrl, photoDataUrl: null, displayUrl };
}

export async function resolveInventoryProductPhotoUrl(item) {
  if (item?.photo_data_url) return item.photo_data_url;
  const photoUrl = item?.photo_url || item?.image_url || item?.photo || item?.image || item?.picture_url;
  if (!photoUrl) return null;
  const storageReference = parseInventoryProductPhotoUrl(photoUrl);
  if (!storageReference) return photoUrl;
  if (!hasSupabaseConfig) return null;
  return createDisplayUrl(storageReference.bucket, storageReference.path);
}

export async function removeInventoryProductPhoto(photoUrl) {
  const storageReference = parseInventoryProductPhotoUrl(photoUrl);
  if (!storageReference || !hasSupabaseConfig) return;
  const { error } = await supabase.storage.from(storageReference.bucket).remove([storageReference.path]);
  if (error) throw new Error(`No se pudo eliminar la imagen almacenada: ${error.message}`);
}

export async function optimizeInventoryProductPhoto(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WEBP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen no puede superar los 10 MB.');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const firstPass = renderSquareImage(image, 640, 0.8);
    return approximateDataUrlBytes(firstPass) <= 320 * 1024 ? firstPass : renderSquareImage(image, 480, 0.72);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('La imagen seleccionada no se puede leer.'));
    image.src = sourceUrl;
  });
}

function renderSquareImage(image, maxSize, quality) {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) throw new Error('La imagen seleccionada no tiene un tamano valido.');
  const targetSize = Math.min(maxSize, sourceSize);
  const sourceX = Math.max((image.naturalWidth - sourceSize) / 2, 0);
  const sourceY = Math.max((image.naturalHeight - sourceSize) / 2, 0);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no puede optimizar esta imagen.');
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);
  return canvas.toDataURL('image/webp', quality);
}

function approximateDataUrlBytes(dataUrl) {
  return Math.ceil((dataUrl.length - String(dataUrl).indexOf(',') - 1) * 0.75);
}
