import { create } from 'zustand';

// Owner-only cost data, keyed by product id: { costPrice, source }. Loaded once per shop for admins.
export const useCostStore = create((set) => ({
  shopId: null,
  costs: {},
  loaded: false,
  loading: null,
  error: false,
  setAll: (shopId, costs) => set({ shopId, costs, loaded: true, error: false }),
  setError: (error) => set({ error }),
  setOne: (id, data) => set((s) => ({ costs: { ...s.costs, [id]: { costPrice: data.costPrice ?? null, source: data.source || '' } } })),
  reset: () => set({ shopId: null, costs: {}, loaded: false, error: false, loading: null }),
}));
