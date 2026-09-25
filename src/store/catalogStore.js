import { create } from 'zustand';

class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
    this.itemData = null; // store the actual catalog item here
  }
}

export class PrefixTrie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(item) {
    let node = this.root;
    const word = item.name.toLowerCase();

    for (let char of word) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }

    node.isEndOfWord = true;
    node.itemData = item;
  }

  // Returns all items that match the given prefix
  searchPrefix(prefix) {
    if (!prefix) return [];

    let node = this.root;
    const word = prefix.toLowerCase();

    for (let char of word) {
      if (!node.children[char]) {
        return [];
      }
      node = node.children[char];
    }

    const results = [];
    this.collectAllWords(node, results);
    return results;
  }

  collectAllWords(node, results) {
    if (node.isEndOfWord) {
      results.push(node.itemData);
    }

    for (let char in node.children) {
      this.collectAllWords(node.children[char], results);
    }
  }
}

export const useCatalogStore = create((set, get) => ({
  trie: new PrefixTrie(),
  items: [],

  // Initialize the catalog from Firestore data
  hydrateCatalog: (catalogItems) => {
    const newTrie = new PrefixTrie();
    catalogItems.forEach(item => newTrie.insert(item));

    set({
      trie: newTrie,
      items: catalogItems
    });
  },

  // Add a new item dynamically when user types something not in the list
  addItem: (item) => {
    set((state) => {
      // If updating an existing item (based on id)
      if (item.id) {
        const existingIndex = state.items.findIndex(i => i.id === item.id);
        if (existingIndex !== -1) {
           const newItems = [...state.items];
           newItems[existingIndex] = item;
           // Rebuild trie
           const newTrie = new PrefixTrie();
           newItems.forEach(i => newTrie.insert(i));
           return { items: newItems, trie: newTrie };
        }
      }


      // Create a new Trie to trigger re-renders properly or mutate if careful.
      // We will mutate the existing trie for performance and just spread the items array to trigger a react re-render.
      state.trie.insert(item);
      return { items: [...state.items, item] };
    });
  },

  search: (prefix) => {
    const { trie } = get();
    return trie.searchPrefix(prefix);
  }
}));
