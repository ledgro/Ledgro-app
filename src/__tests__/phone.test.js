import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../lib/phone';

describe('normalizePhone', () => {
  it.each([
    ['+91 98765-43210', '9876543210'],
    ['098765 43210', '9876543210'],
    ['(98765) 43210', '9876543210'],
    ['91 9876543210', '9876543210'],
    ['9876543210', '9876543210'],
    ['0495 2345678', '04952345678'],
    ['', ''],
  ])('%s -> %s', (input, out) => { expect(normalizePhone(input)).toBe(out); });
});
