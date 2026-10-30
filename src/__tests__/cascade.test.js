import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Deleting a shop must remove every sub-collection the rules know about, or personal data stays behind.
describe('deleteShopCascade', () => {
  it('covers every sub-collection of a shop in firestore.rules', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const shopsBlock = rules.slice(rules.indexOf('match /shops/{shopId}'), rules.indexOf('match /users/{userId}'));
    const inRules = [...shopsBlock.matchAll(/match \/(\w+)\/\{\w+\}/g)].map((m) => m[1]).filter((n) => n !== 'shops');
    const src = readFileSync('src/lib/firestoreUtils.js', 'utf8');
    const listed = (src.match(/for \(const sub of \[([^\]]+)\]/)?.[1] || '').match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) || [];
    expect(inRules.length).toBeGreaterThan(5);
    expect([...listed].sort()).toEqual([...inRules].sort());
  });
});
