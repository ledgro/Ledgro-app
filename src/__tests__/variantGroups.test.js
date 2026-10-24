import { describe, it, expect } from 'vitest';
import { groupProducts, colourOf, sizeLabelOf } from '../lib/variants';

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
