import { useEffect } from 'react';
import { loadCatalog } from '../lib/catalogSync';
import { useCatalogStore } from '../store/catalogStore';

/**
 * Loads the shop catalog into the shared store. Cached products show at once; only products
 * changed since the last visit are read from the server. By default it skips the load when
 * the store already has products; pass { force: true } for screens that must check again.
 */
export function useCatalogLoader(shopId, { force = false } = {}) {
  const hydrateCatalog = useCatalogStore((s) => s.hydrateCatalog);
  useEffect(() => {
    if (!shopId) return undefined;
    if (!force && useCatalogStore.getState().items.some((i) => i.id)) return undefined;
    let cancelled = false;
    loadCatalog(shopId, { onCached: (items) => { if (!cancelled) hydrateCatalog(items); } })
      .then((items) => { if (!cancelled) hydrateCatalog(items); })
      .catch((err) => console.error('Failed to load catalog', err));
    return () => { cancelled = true; };
  }, [hydrateCatalog, shopId, force]);
}
