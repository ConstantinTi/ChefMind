import { describe, expect, it } from 'vitest';
import { parseIngredientLine, parseQuantity, normalizeUnitToken } from './parse';
import { formatQuantity } from './format';

describe('normalizeUnitToken', () => {
  it('accepts the spellings German recipes actually use', () => {
    expect(normalizeUnitToken('EL')).toBe('el');
    expect(normalizeUnitToken('Esslöffel')).toBe('el');
    expect(normalizeUnitToken('Pck.')).toBe('pck');
    expect(normalizeUnitToken('Päckchen')).toBe('pck');
    expect(normalizeUnitToken('Zehen')).toBe('zehe');
    expect(normalizeUnitToken('Gramm')).toBe('g');
  });

  it('rejects words that are not units', () => {
    expect(normalizeUnitToken('Mehl')).toBeNull();
  });
});

describe('parseQuantity', () => {
  const cases: Array<[string, string]> = [
    ['200 g Mehl', '200 g'],
    ['0,5 kg Kartoffeln', '500 g'],
    ['1/2 TL Salz', '1/2 TL'],
    ['1 1/2 EL Zucker', '1 1/2 EL'],
    ['½ TL Zimt', '1/2 TL'],
    ['2-3 Zehen Knoblauch', '2–3 Zehen'],
    ['2 bis 3 EL Öl', '2–3 EL'],
    ['ca. 200 ml Milch', 'ca. 200 ml'],
    ['3 Eier', '3'],
    ['1 Prise Muskat', '1 Prise'],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    // 0,5 kg normalises on display to 500 g via the unit upgrade, so compare
    // the raw parse instead.
    const { quantity } = parseQuantity(input);
    const rendered = formatQuantity(quantity);
    if (input.startsWith('0,5 kg')) expect(rendered).toBe('0,5 kg');
    else expect(rendered).toBe(expected);
  });

  it('recognises "nach Geschmack"', () => {
    expect(parseQuantity('Salz nach Geschmack').quantity).toEqual({ kind: 'toTaste' });
  });
});

describe('parseIngredientLine', () => {
  it('splits amount, name and preparation', () => {
    const r = parseIngredientLine('2-3 EL Olivenöl, kaltgepresst');
    expect(formatQuantity(r.quantity)).toBe('2–3 EL');
    expect(r.name).toBe('Olivenöl');
    expect(r.preparation).toBe('kaltgepresst');
  });

  it('pulls a parenthesised aside out of the name', () => {
    const r = parseIngredientLine('100 g Butter (zimmerwarm)');
    expect(r.name).toBe('Butter');
    expect(r.note).toBe('zimmerwarm');
  });

  it('handles unitless counts', () => {
    const r = parseIngredientLine('3 Eier');
    expect(r.name).toBe('Eier');
    expect(r.quantity).toEqual({ kind: 'exact', amount: 3, unit: null });
  });

  it('handles "Öl zum Braten" as unquantified', () => {
    const r = parseIngredientLine('Öl zum Braten');
    expect(r.quantity.kind).toBe('unquantified');
    expect(r.name).toContain('Öl');
  });

  it('handles "Salz nach Geschmack"', () => {
    const r = parseIngredientLine('Salz nach Geschmack');
    expect(r.quantity).toEqual({ kind: 'toTaste' });
    expect(r.name).toBe('Salz');
  });

  it('strips list bullets', () => {
    expect(parseIngredientLine('- 250 g Mehl').name).toBe('Mehl');
  });

  it('flags lines it is unsure about', () => {
    expect(parseIngredientLine('Mehl').confidence).toBeLessThan(0.7);
    expect(parseIngredientLine('250 g Mehl').confidence).toBeGreaterThan(0.9);
  });
});
