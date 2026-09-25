import { describe, it, expect, beforeEach } from 'vitest';
import { PrefixTrie } from './catalogStore';

describe('PrefixTrie', () => {
  let trie;
  const sampleItems = [
    { id: 1, name: 'Apple' },
    { id: 2, name: 'Apricot' },
    { id: 3, name: 'Banana' }
  ];

  beforeEach(() => {
    trie = new PrefixTrie();
    sampleItems.forEach(item => trie.insert(item));
  });

  it('returns empty array when prefix is empty or null', () => {
    expect(trie.searchPrefix('')).toEqual([]);
    expect(trie.searchPrefix(null)).toEqual([]);
  });

  it('performs case-insensitive prefix searches', () => {
    const results = trie.searchPrefix('ap');
    expect(results.map(r => r.name)).toEqual(['Apple', 'Apricot']);
  });

  it('returns an empty array when no matches exist', () => {
    expect(trie.searchPrefix('xyz')).toEqual([]);
  });
});
