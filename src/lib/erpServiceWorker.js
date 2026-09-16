const ERP_SW_CLEANUP_KEY = 'pye-erp-service-worker-cleanup-v5';
const PUBLIC_CACHE_PREFIX = 'pan-y-esperanza-public-';

export async function prepareErpNetworkSession() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return true;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyController = navigator.serviceWorker.controller;
    const needsLegacyCleanup = Boolean(legacyController)
      && sessionStorage.getItem(ERP_SW_CLEANUP_KEY) !== 'done';

    if (needsLegacyCleanup) {
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(PUBLIC_CACHE_PREFIX))
          .map((name) => caches.delete(name))
      );
      sessionStorage.setItem(ERP_SW_CLEANUP_KEY, 'done');
      window.location.reload();
      return false;
    }
  } catch {
    // A service worker cleanup failure must never prevent access to the ERP.
  }

  return true;
}
