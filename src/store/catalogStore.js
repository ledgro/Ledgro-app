import { create } from 'zustand';

// Drop the prefix trie entirely in favor of a robust array filter, which allows substring/word-start matching, handles duplicates properly, and performs adequately for a few thousand items without expensive rebuilds.
export const useCatalogStore = create((set, get) => ({
  items: [],

  // Initialize the catalog from Firestore data
  hydrateCatalog: (catalogItems) => {
    // skip items without a name, or ensure they don't throw
    const validItems = catalogItems.filter(item => item && item.name && !item.deleted);
    set({ items: validItems });
  },

  // Add a new item dynamically when user types something not in the list
  addItem: (item) => {
    if (!item || !item.name) return;
    set((state) => {
      if (item.id) {
        const existingIndex = state.items.findIndex(i => i.id === item.id);
        if (existingIndex !== -1) {
           const newItems = [...state.items];
           // Merge, do not overwrite completely
           newItems[existingIndex] = { ...newItems[existingIndex], ...item };
           return { items: newItems };
        }
        // A typed-at-the-till entry (no id yet) now has its real document: adopt the id
        const nameKey = (item.name || '').trim().toLowerCase();
        const localIndex = state.items.findIndex(i => !i.id && (i.name || '').trim().toLowerCase() === nameKey);
        if (localIndex !== -1) {
           const newItems = [...state.items];
           newItems[localIndex] = { ...newItems[localIndex], ...item };
           return { items: newItems };
        }
      } else {
        // Deduplicate by exact name if no ID is provided to avoid appending copies endlessly
        const existingIndex = state.items.findIndex(i => i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        if (existingIndex !== -1) {
           const newItems = [...state.items];
           newItems[existingIndex] = { ...newItems[existingIndex], ...item };
           return { items: newItems };
        }
      }

      return { items: [...state.items, item] };
    });
  },

  removeItem: (itemId) => {
    set((state) => {
      return { items: state.items.filter(i => i.id !== itemId) };
    });
  },

  reset: () => {
    set({ items: [] });
  },

  search: (queryStr) => {
    const { items } = get();
    if (!queryStr) return [];

    // Normalize string to handle diacritics/NFC forms safely (especially for Malayalam)
    const normalizedQuery = queryStr.normalize('NFC').trim().toLowerCase();

    if (!normalizedQuery) return [];

    const words = normalizedQuery.split(/\s+/);
    const norm = (v) => String(v || '').normalize('NFC').trim().toLowerCase();
    const scored = [];
    for (const item of items) {
      const name = norm(item.name);
      const hay = `${name} ${norm(item.category)}`;
      if (!words.every((w) => hay.includes(w))) continue;
      // Rank: name starts with query > a name word starts with it > anywhere.
      const rank = name.startsWith(normalizedQuery) ? 0
        : words.every((w) => name.split(/[\s/-]+/).some((t) => t.startsWith(w))) ? 1 : 2;
      scored.push({ item, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || (b.item.frequency || 0) - (a.item.frequency || 0));
    return scored.slice(0, 30).map((x) => x.item);
  }
}));
