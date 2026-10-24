import { describe, it, expect } from 'vitest';
import { groupProducts, colourOf, sizeLabelOf, findGroupByName } from '../lib/variants';

const v = (id, c, s) => ({ id, groupId: 'g', baseName: 'Hells', name: `Hells - ${s} / ${c}`, options: { Size: s, Colour: c } });

describe('groupProducts', () => {
  it('groups variants by colour', () => {
    const out = groupProducts([v('1', 'Black', '37'), v('2', 'Black', '38'), v('3', 'Brown', '37'), { id: 'p', name: 'Plain' }]);
    expect(out.map((e) => e.type)).toEqual(['group', 'single']);
    expect(out[0].colours.map((c) => [c.colour, c.items.length])).toEqual([['Black', 2], ['Brown', 1]]);
  });
  it('treats black / Black / BLACK as one colour and sorts sizes', () => {
    const out = groupProducts([v('1', 'black', '38'), v('2', 'Brown', '37'), v('3', 'Black', '42'), v('4', 'BLACK', '37'), v('5', 'brown', '38')]);
    expect(out[0].colours.map((c) => [c.colour, c.items.map(sizeLabelOf)])).toEqual([
      ['Black', ['37', '38', '42']],
      ['Brown', ['37', '38']],
    ]);
  });
  it('reads colour and size labels', () => {
    expect(colourOf(v('1', 'Black', '37'))).toBe('Black');
    expect(sizeLabelOf(v('1', 'Black', '37'))).toBe('37');
    expect(colourOf({ options: { Color: 'Red' } })).toBe('Red');
    expect(sizeLabelOf({ options: { Size: '6' } })).toBe('6');
  });
});

describe('findGroupByName', () => {
  const items = [v('1', 'Black', '37'), { id: 'p', name: 'Demo' }];
  it('finds the existing product whatever the capitalisation', () => {
    expect(findGroupByName(items, 'hells')?.groupId).toBe('g');
    expect(findGroupByName(items, '  HELLS ')?.groupId).toBe('g');
  });
  it('returns null for new names, plain products and blanks', () => {
    expect(findGroupByName(items, 'Boots')).toBeNull();
    expect(findGroupByName(items, 'Demo')).toBeNull();
    expect(findGroupByName(items, '')).toBeNull();
  });
});
