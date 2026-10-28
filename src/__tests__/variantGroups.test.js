import { describe, it, expect } from 'vitest';
import { groupProducts, colourOf, sizeLabelOf, colourSwatch, colourCards, findGroupByName } from '../lib/variants';

const v = (id, c, s) => ({ id, groupId: 'g', baseName: 'Hells', name: `Hells - ${s} / ${c}`, options: { Size: s, Colour: c } });

describe('groupProducts', () => {
  it('folds variants by colour and keeps plain products single', () => {
    const out = groupProducts([v('1', 'Black', '37'), { id: 'p', name: 'Demo' }, v('2', 'Brown', '37'), v('3', 'Black', '38')]);
    expect(out.map((e) => e.type)).toEqual(['group', 'single']);
    expect(out[0].colours.map((c) => [c.colour, c.items.length])).toEqual([['Black', 2], ['Brown', 1]]);
  });
  it('reads colour and size labels', () => {
    expect(colourOf(v('1', 'Black', '37'))).toBe('Black');
    expect(sizeLabelOf(v('1', 'Black', '37'))).toBe('37');
    expect(colourOf({ options: { Size: '6' } })).toBe('');
    expect(sizeLabelOf({ options: { Size: '6' } })).toBe('6');
  });
});

describe('colourSwatch', () => {
  it('maps names, shades and unknowns', () => {
    expect(colourSwatch('Black')).toBe('#111827');
    expect(colourSwatch('dark brown')).toBe('#78350f');
    expect(colourSwatch('')).toBe('#cbd5e1');
    expect(colourSwatch('zzzz')).toBe('#cbd5e1');
  });
});

describe('colourCards', () => {
  it('makes one card per colour, sizes sorted, colours merged whatever the capitalisation', () => {
    const out = colourCards([v('1', 'black', '38'), v('2', 'Brown', '37'), v('3', 'Black', '37'), v('4', 'BLACK', '39'), { id: 'p', name: 'Demo' }]);
    expect(out.map((e) => e.type)).toEqual(['colour', 'colour', 'single']);
    expect(out.map((e) => e.colour)).toEqual(['Black', 'Brown', undefined]);
    expect(out[0].items.map(sizeLabelOf)).toEqual(['37', '38', '39']);
  });
  it('finds an existing product by name', () => {
    expect(findGroupByName([v('1', 'Black', '37')], '  HELLS ')?.groupId).toBe('g');
    expect(findGroupByName([v('1', 'Black', '37')], 'Boots')).toBeNull();
  });
});
