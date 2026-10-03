import fs from 'fs';

let content = `import { create } from 'zustand';

// Drop the prefix trie entirely in favor of a robust array filter, which allows substring/word-start matching, handles duplicates properly, and performs adequately for a few thousand items without expensive rebuilds.
export const useCatalogStore = create((set, get) => ({
  items: [],

  // Initialize the catalog from Firestore data
  hydrateCatalog: (catalogItems) => {
    // skip items without a name, or ensure they don't throw
    const validItems = catalogItems.filter(item => item && item.name);
    set({ items: validItems });
  },

  // Add a new item dynamically when user types something not in the list
  addItem: (item) => {
    if (!item || !item.name) return;
    set((state) => {
      // If updating an existing item (based on id)
      if (item.id) {
        const existingIndex = state.items.findIndex(i => i.id === item.id);
        if (existingIndex !== -1) {
           const newItems = [...state.items];
           // Merge, do not overwrite completely
           newItems[existingIndex] = { ...newItems[existingIndex], ...item };
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

    const matches = items.filter(item => {
      const normalizedName = String(item.name).normalize('NFC').trim().toLowerCase();
      // Allow substring search for better UX (e.g. searching 'atta' matches 'Aashirvaad Atta')
      return normalizedName.includes(normalizedQuery);
    });

    // Sort by frequency (desc) if available, and cap at 20
    return matches.sort((a, b) => (b.frequency || 0) - (a.frequency || 0)).slice(0, 20);
  }
}));
`;

fs.writeFileSync('src/store/catalogStore.js', content);
