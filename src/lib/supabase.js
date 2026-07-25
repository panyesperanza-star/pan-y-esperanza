import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'documentos';
const beneficiaryPhotosBucket = import.meta.env.VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET || 'beneficiary-photos';
const inventoryProductPhotosBucket = import.meta.env.VITE_SUPABASE_INVENTORY_PRODUCT_PHOTOS_BUCKET || 'inventory-product-photos';
const deliverySignaturesBucket = import.meta.env.VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET || 'delivery-signatures';

export const hasSupabaseConfig = Boolean(url && anonKey);
export const supabaseUrl = url || '';
export const supabaseAnonKey = anonKey || '';
export const supabase = hasSupabaseConfig ? createClient(url, anonKey) : null;
export const supabaseStorageBucket = storageBucket;
export const supabaseBeneficiaryPhotosBucket = beneficiaryPhotosBucket;
export const supabaseInventoryProductPhotosBucket = inventoryProductPhotosBucket;
export const supabaseDeliverySignaturesBucket = deliverySignaturesBucket;

export function getSystemConfigStatus() {
  return {
    databaseConfigured: hasSupabaseConfig,
    emailConfigured: false,
    storageConfigured: hasSupabaseConfig && Boolean(storageBucket && deliverySignaturesBucket)
  };
}

export async function checkSupabaseStorage() {
  if (!supabase) return false;
  const { error } = await supabase.storage.from(storageBucket).list('', { limit: 1 });
  return !error;
}
