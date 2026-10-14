import { describe, it, expect } from 'vitest';
import { buildCombos, comboKey, parseValues, variantLabel, variantName, MAX_VALUES_PER_AXIS } from '../lib/variants';

describe('variants', () => {
  it('parses comma separated values, trimming and removing duplicates', () => {
    expect(parseValues(' 6, 7 ,7,8,, black , BLACK')).toEqual(['6', '7', '8', 'black']);
    expect(parseValues('')).toEqual([]);
    expect(parseValues(Array.from({ length: 50 }, (_, i) => i).join(','))).toHaveLength(MAX_VALUES_PER_AXIS);
  });

  it('builds every combination of the options', () => {
    const combos = buildCombos([{ name: 'Size', values: '6,7' }, { name: 'Colour', values: 'Black, Brown' }]);
    expect(combos).toHaveLength(4);
    expect(combos[0]).toEqual({ Size: '6', Colour: 'Black' });
    expect(combos[3]).toEqual({ Size: '7', Colour: 'Brown' });
  });

  it('ignores empty options and rejects repeated option names', () => {
    expect(buildCombos([{ name: 'Size', values: '6' }, { name: '', values: '1,2' }, { name: 'Colour', values: '' }])).toEqual([{ Size: '6' }]);
    expect(buildCombos([{ name: 'Size', values: '6' }, { name: 'size', values: '7' }])).toEqual([]);
    expect(buildCombos([])).toEqual([]);
  });

  it('keeps at most 3 options', () => {
    const axes = ['A', 'B', 'C', 'D'].map((n) => ({ name: n, values: '1' }));
    expect(Object.keys(buildCombos(axes)[0])).toEqual(['A', 'B', 'C']);
  });

  it('names a variant from the base name and its options', () => {
    expect(variantLabel({ Size: '8', Colour: 'Black' })).toBe('8 / Black');
    expect(variantName('Heels shoe', { Size: '8', Colour: 'Black' })).toBe('Heels shoe - 8 / Black');
    expect(variantName('  Rice  ', {})).toBe('Rice');
    expect(variantName('x'.repeat(120), { Size: '8' }).length).toBe(100);
  });

  it('gives each combination a stable key', () => {
    expect(comboKey({ Size: '8' })).toBe(comboKey({ Size: '8' }));
    expect(comboKey({ Size: '8' })).not.toBe(comboKey({ Size: '9' }));
  });
});
