import { describe, it, expect } from 'vitest';
import { planColourEdit, axesOf } from '../lib/colourEdit';

const v = (id, size, colour, extra = {}) => ({ id, groupId: 'g', baseName: 'Hells', name: `Hells - ${size} / ${colour}`, options: { Size: size, Colour: colour }, lastUsedPrice: 38000, stockCount: 5, unit: 'piece', ...extra });
const black = [v('1', '37', 'Black'), v('2', '38', 'Black')];
const brown = [v('3', '37', 'Brown')];
const all = [...black, ...brown];
const entry = { name: 'Hells', colour: 'Black', items: black, rep: black[0] };
const form = (o = {}) => ({ base: 'Hells', colour: 'Black', price: '380', cost: '', category: '', lowStock: '', active: true, rows: black.map((i) => ({ id: i.id, stock: String(i.stockCount) })), newSizes: '', ...o });
const plan = (f) => planColourEdit({ entry, groupItems: all, allItems: all, form: f });

describe('planColourEdit', () => {
  it('finds the size and colour options', () => {
    expect(axesOf(black)).toEqual({ colourAxis: 'Colour', sizeAxis: 'Size' });
  });
  it('adds sizes to this colour only and keeps the colour', () => {
    const p = plan(form({ newSizes: '39, 40, 38' }));
    expect(p.creates.map((c) => c.name)).toEqual(['Hells - 39 / Black', 'Hells - 40 / Black']);
    expect(p.creates[0].groupId).toBe('g');
    expect(p.removes).toEqual([]);
  });
  it('removing a size row deletes only that size', () => {
    const p = plan(form({ rows: [{ id: '1', stock: '5' }, { id: '2', stock: '5', remove: true }] }));
    expect(p.removes).toEqual(['2']);
    expect(p.updates.map((u) => u.id)).toEqual(['1']);
  });
  it('stock change is a difference, untouched stock is left alone', () => {
    const p = plan(form({ rows: [{ id: '1', stock: '8' }, { id: '2', stock: '5' }] }));
    expect(p.updates[0].stockDiff).toBe(3);
    expect(p.updates[1].stockDiff).toBeNull();
  });
  it('renames the colour on every size', () => {
    const p = plan(form({ colour: 'dark brown' }));
    expect(p.updates.map((u) => u.data.name)).toEqual(['Hells - 37 / Dark Brown', 'Hells - 38 / Dark Brown']);
    expect(p.colourChanged).toBe(true);
  });
  it('refuses a colour that already exists', () => {
    expect(plan(form({ colour: 'brown' })).error).toMatch(/already exists/);
  });
  it('renaming the product renames the other colours too', () => {
    const p = plan(form({ base: 'Heels' }));
    expect(p.updates.find((u) => u.id === '3').data.name).toBe('Heels - 37 / Brown');
  });
  it('refuses to leave a colour with no sizes', () => {
    expect(plan(form({ rows: [{ id: '1', remove: true }, { id: '2', remove: true }] })).error).toMatch(/at least one size/);
  });
  it('validates price', () => {
    expect(plan(form({ price: '' })).error).toMatch(/price/);
  });
  it('adds a colour to a product that was saved without one, in place', () => {
    const bare = [{ id: 'a', groupId: 'g2', baseName: 'Slides', name: 'Slides - 8', options: { Size: '8' }, lastUsedPrice: 1000, stockCount: 2 }, { id: 'b', groupId: 'g2', baseName: 'Slides', name: 'Slides - 9', options: { Size: '9' }, lastUsedPrice: 1000, stockCount: 1 }];
    const e = { name: 'Slides', colour: '', items: bare, rep: bare[0] };
    const p = planColourEdit({ entry: e, groupItems: bare, allItems: bare, form: { base: 'Slides', colour: 'blue', price: '10', rows: bare.map((i) => ({ id: i.id, stock: String(i.stockCount) })), newSizes: '10' } });
    expect(p.updates.map((u) => u.data.name)).toEqual(['Slides - 8 / Blue', 'Slides - 9 / Blue']);
    expect(p.creates.map((c) => c.name)).toEqual(['Slides - 10 / Blue']);
    expect(p.creates).toHaveLength(1);
  });
  it('a colourless product with no colour typed stays colourless', () => {
    const bare = [{ id: 'a', groupId: 'g2', baseName: 'Slides', name: 'Slides - 8', options: { Size: '8' }, lastUsedPrice: 1000, stockCount: 2 }];
    const e = { name: 'Slides', colour: '', items: bare, rep: bare[0] };
    const p = planColourEdit({ entry: e, groupItems: bare, allItems: bare, form: { base: 'Slides', colour: '', price: '10', rows: [{ id: 'a', stock: '2' }], newSizes: '9' } });
    expect(p.creates[0].name).toBe('Slides - 9');
  });
});
