import { describe, it, expect } from 'vitest';
import { memberLabel, FORMER_MEMBER, NEW_MEMBER } from '../lib/memberLabel';

describe('memberLabel', () => {
  const names = { a: 'Asha', b: 'Bilal' };
  const current = new Set(['me', 'a', 'c']);
  it('shows You for yourself and the saved name for others', () => {
    expect(memberLabel('me', { selfUid: 'me', names, current })).toBe('You');
    expect(memberLabel('a', { selfUid: 'me', names, current })).toBe('Asha');
  });
  it('a current member without a saved name is New member, never Former member', () => {
    expect(memberLabel('c', { selfUid: 'me', names, current })).toBe(NEW_MEMBER);
  });
  it('someone who is not in the shop any more is Former member', () => {
    expect(memberLabel('b', { selfUid: 'me', names: {}, current })).toBe(FORMER_MEMBER);
    expect(memberLabel('zzz', { selfUid: 'me', names, current })).toBe(FORMER_MEMBER);
  });
  it('before the member list is known it does not guess', () => {
    expect(memberLabel('c', { selfUid: 'me', names, current: null })).toBe(FORMER_MEMBER);
  });
  it('empty id gives an empty label', () => {
    expect(memberLabel('', { selfUid: 'me', names, current })).toBe('');
    expect(memberLabel(undefined, { selfUid: 'me', names, current })).toBe('');
  });
});
