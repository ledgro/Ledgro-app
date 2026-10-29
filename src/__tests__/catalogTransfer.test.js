import { describe, it, expect } from 'vitest';
import { buildCatalogCsv, buildCatalogBackup, parseCatalogFile, planImport, parseCsv } from '../lib/catalogTransfer';

const v = (id, c, s, extra = {}) => ({ id, groupId: 'g', baseName: 'Hells', name: `Hells - ${s} / ${c}`, options: { Size: s, Colour: c }, lastUsedPrice: 38000, costPrice: 25000, stockCount: 4, unit: 'piece', category: 'Ladies', ...extra });
const items = [v('1', 'Black', '37'), v('2', 'Brown', '38'), { id: 'p', name: 'Socks, "cotton"', lastUsedPrice: 5000, stockCount: null, unit: 'pair' }];
let n = 0;
const newId = () => `new${++n}`;

describe('catalog CSV', () => {
  it('round-trips products, variants and awkward characters', () => {
    const csv = buildCatalogCsv(items);
    const out = planImport(parseCatalogFile(csv), [], newId);
    expect(out.errors).toEqual([]);
    expect(out.creates.map((c) => c.payload.name)).toEqual(['Hells - 37 / Black', 'Hells - 38 / Brown', 'Socks, "cotton"']);
    const [a, b, c] = out.creates.map((x) => x.payload);
    expect(a.groupId).toBe(b.groupId);
    expect(a.lastUsedPrice).toBe(38000);
    expect(a.costPrice).toBe(25000);
    expect(c.stockCount).toBeNull();
  });
  it('skips what the shop already has and never overwrites', () => {
    const csv = buildCatalogCsv(items);
    const out = planImport(parseCatalogFile(csv), [{ id: 'x', name: 'hells - 37 / black' }], newId);
    expect(out.skipped).toBe(1);
    expect(out.creates).toHaveLength(2);
  });
  it('joins an existing product group of the same name', () => {
    const csv = buildCatalogCsv([v('9', 'Red', '40')]);
    const out = planImport(parseCatalogFile(csv), [v('1', 'Black', '37', { groupId: 'old' })], newId);
    expect(out.creates[0].payload.groupId).toBe('old');
  });
  it('reports bad rows with line numbers', () => {
    const out = planImport(parseCatalogFile('Product,Price,Stock\nOk,100,3\n,50,1\nBad,abc,1\nNeg,10,-2\n'), [], newId);
    expect(out.creates).toHaveLength(1);
    expect(out.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
  it('neutralises spreadsheet formulas', () => {
    expect(buildCatalogCsv([{ id: 'f', name: '=SUM(A1)', lastUsedPrice: 100 }])).toContain("'=SUM(A1)");
  });
  it('rejects files that are not product files', () => {
    expect(() => parseCatalogFile('{"hello":1}')).toThrow();
    expect(() => parseCatalogFile('a,b\n1,2')).toThrow();
  });
  it('parses quoted newlines', () => {
    expect(parseCsv('a,"b\nc",d\n1,2,3')).toEqual([['a', 'b\nc', 'd'], ['1', '2', '3']]);
  });
});

describe('catalog backup', () => {
  it('keeps photos and groups through a backup file', () => {
    const photo = 'data:image/jpeg;base64,AAAA';
    const withImg = [v('1', 'Black', '37', { hasImage: true }), v('2', 'Black', '38', { hasImage: true })];
    const json = buildCatalogBackup(withImg, { 'g~black': photo });
    const out = planImport(parseCatalogFile(json), [], newId);
    expect(out.creates).toHaveLength(2);
    expect(out.creates[0].image).toBe(photo);
    expect(out.creates[0].payload.groupId).toBe(out.creates[1].payload.groupId);
    expect(out.creates[0].payload.lastUsedPrice).toBe(38000);
  });
});

describe('import hardening', () => {
  const bk = (products) => JSON.stringify({ app: 'ledgro', kind: 'catalog', version: 1, products });
  it('backup joins the existing product of the same name', () => {
    const existing = [{ id: 'a', groupId: 'G1', baseName: 'Hells', name: 'Hells - 37 / Black', options: { Size: '37', Colour: 'Black' } }];
    const recs = parseCatalogFile(bk([{ name: 'Hells - 38 / Black', baseName: 'Hells', groupId: 'X', options: { Size: '38', Colour: 'Black' }, price: 38000 }]));
    const { creates } = planImport(recs, existing, () => 'NEW');
    expect(creates[0].payload.groupId).toBe('G1');
  });
  it('cleans odd backup options and flags a null price', () => {
    const recs = parseCatalogFile(bk([
      { name: 'A', price: 100, options: ['x'] },
      { name: 'B', price: 100, options: { Size: 'x'.repeat(200), Bad: { a: 1 } } },
      { name: 'C', price: null },
    ]));
    const { creates, errors } = planImport(recs, [], () => 'N');
    expect(creates[0].payload.options).toBeUndefined();
    expect(creates[1].payload.options).toEqual({ Size: 'x'.repeat(30) });
    expect(errors).toHaveLength(1);
  });
  it('escapes tab-led cells and strips the quote on re-import', () => {
    const csv = buildCatalogCsv([{ id: '1', name: '=cmd', lastUsedPrice: 100 }]);
    const recs = parseCatalogFile(csv);
    expect(recs[0].name).toBe('=cmd');
  });
});
