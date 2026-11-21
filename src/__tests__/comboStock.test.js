import { describe, it, expect } from 'vitest';
import { buildCombos, comboKey, remapComboStock } from '../lib/variants';

const ax = (size, colour) => [{ name: 'Size', values: size }, { name: 'Colour', values: colour }];
const stockOf = (axes, stock) => Object.fromEntries(buildCombos(axes).map((c) => [comboKey(c), stock[comboKey(c)]]));
const re = (from, to, stock) => remapComboStock(buildCombos(from), buildCombos(to), stock);

describe('remapComboStock', () => {
  const from = ax('6, 7', '');
  const typed = { [comboKey({ Size: '6' })]: '4', [comboKey({ Size: '7' })]: '9' };
  it('keeps stock when a colour is added', () => {
    const to = ax('6, 7', 'Black');
    const out = re(from, to, typed);
    expect(out[comboKey({ Size: '6', Colour: 'Black' })]).toBe('4');
    expect(out[comboKey({ Size: '7', Colour: 'Black' })]).toBe('9');
  });
  it('keeps stock while the colour is typed letter by letter', () => {
    const a = ax('6, 7', 'B');
    const step1 = re(from, a, typed);
    const step2 = re(a, ax('6, 7', 'Bl'), step1);
    expect(stockOf(ax('6, 7', 'Bl'), step2)[comboKey({ Size: '6', Colour: 'Bl' })]).toBe('4');
  });
  it('keeps stock when a size value is fixed or one is added', () => {
    expect(re(from, ax('6, 7, 8', ''), typed)[comboKey({ Size: '7' })]).toBe('9');
    expect(re(from, ax('6, 70', ''), typed)[comboKey({ Size: '70' })]).toBe('9');
  });
  it('keeps stock when the colour is removed again', () => {
    const withColour = re(from, ax('6, 7', 'Black'), typed);
    const back = re(ax('6, 7', 'Black'), from, withColour);
    expect(back[comboKey({ Size: '6' })]).toBe('4');
  });
});
