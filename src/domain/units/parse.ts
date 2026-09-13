import type { Quantity, Unit } from './types';
import { isUnit } from './units';

/**
 * German unit spellings as they actually appear in recipes, cookbooks and on
 * handwritten cards. Keys are lowercased and stripped of trailing dots.
 */
const UNIT_ALIASES: Readonly<Record<string, Unit>> = {
  mg: 'mg', milligramm: 'mg',
  g: 'g', gr: 'g', gramm: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  ml: 'ml', milliliter: 'ml',
  cl: 'cl', zentiliter: 'cl',
  dl: 'dl', deziliter: 'dl',
  l: 'l', ltr: 'l', liter: 'l',
  tl: 'tl', teel: 'tl', teeloeffel: 'tl', 'teelöffel': 'tl',
  el: 'el', essl: 'el', essloeffel: 'el', 'esslöffel': 'el',
  tasse: 'tasse', tassen: 'tasse',
  cup: 'cup', cups: 'cup',
  stk: 'stk', st: 'stk', 'stück': 'stk', stueck: 'stk', stk_: 'stk',
  zehe: 'zehe', zehen: 'zehe',
  scheibe: 'scheibe', scheiben: 'scheibe',
  bund: 'bund', bd: 'bund',
  dose: 'dose', dosen: 'dose',
  glas: 'glas', 'gläser': 'glas', glaeser: 'glas',
  pck: 'pck', pkg: 'pck', pckg: 'pck', packung: 'pck', packungen: 'pck',
  'päckchen': 'pck', paeckchen: 'pck', beutel: 'pck',
  blatt: 'blatt', 'blätter': 'blatt', blaetter: 'blatt',
  stange: 'stange', stangen: 'stange',
  'würfel': 'wuerfel', wuerfel: 'wuerfel',
  kugel: 'kugel', kugeln: 'kugel',
  zweig: 'zweig', zweige: 'zweig',
  prise: 'prise', prisen: 'prise',
  msp: 'msp', messerspitze: 'msp', messerspitzen: 'msp',
  schuss: 'schuss',
  spritzer: 'spritzer',
  handvoll: 'handvoll',
  tropfen: 'tropfen',
  etwas: 'etwas',
};

const VULGAR_VALUES: Readonly<Record<string, number>> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/** Phrases that mean "no measurable amount". */
const TO_TASTE = /\b(nach\s+(geschmack|belieben|bedarf)|n\.?\s?b\.?|je\s+nach\s+geschmack)\b/i;
const UNQUANTIFIED = /\b(zum\s+\w+|f[üu]r\s+die\s+form|zum\s+bestreuen|zum\s+anbraten|zum\s+fetten)\b/i;

export function normalizeUnitToken(token: string): Unit | null {
  const key = token
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/\s+/g, '');
  const alias = UNIT_ALIASES[key];
  if (alias) return alias;
  return isUnit(key) ? key : null;
}

/** Parses "1 1/2", "1/2", "½", "1,5", "1.5" into a number. */
function parseNumberToken(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;

  // Unicode vulgar fraction, possibly with a leading whole number: "1½"
  const vulgarMatch = t.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (vulgarMatch) {
    const whole = vulgarMatch[1] ? Number(vulgarMatch[1]) : 0;
    return whole + (VULGAR_VALUES[vulgarMatch[2]!] ?? 0);
  }

  // Mixed or plain fraction: "1 1/2" or "3/4"
  const fracMatch = t.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const whole = fracMatch[1] ? Number(fracMatch[1]) : 0;
    const num = Number(fracMatch[2]);
    const den = Number(fracMatch[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  // Decimal, German comma or English point
  const dec = Number(t.replace(',', '.'));
  return Number.isFinite(dec) ? dec : null;
}

/**
 * Order is load-bearing: regex alternation is first-match-wins, so the longest
 * forms must come first. With the plain-decimal branch first, "1 1/2 EL" would
 * parse as a bare "1" and silently drop the half.
 */
const NUMBER_PATTERN = [
  String.raw`\d+\s+\d+\s*\/\s*\d+`,                 // mixed fraction: "1 1/2"
  String.raw`\d*\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]`,                  // vulgar, with optional whole: "1½"
  String.raw`\d+\s*\/\s*\d+`,                         // plain fraction: "3/4"
  String.raw`\d+(?:[.,]\d+)?`,                          // decimal: "0,5"
].join('|');

/**
 * Parses the leading amount of an ingredient line and returns it plus the rest.
 * Handles ranges ("2-3", "2–3", "2 bis 3") and the "ca." prefix.
 */
export function parseQuantity(input: string): { quantity: Quantity; rest: string } {
  const text = input.trim();

  if (TO_TASTE.test(text)) return { quantity: { kind: 'toTaste' }, rest: text.replace(TO_TASTE, '').trim() };

  const approx = /^(?:ca\.?|etwa|ungef[äa]hr|rund)\s+/i.test(text);
  const body = text.replace(/^(?:ca\.?|etwa|ungef[äa]hr|rund)\s+/i, '');

  const rangeRe = new RegExp(`^(${NUMBER_PATTERN})\\s*(?:-|–|—|bis)\\s*(${NUMBER_PATTERN})\\s*(.*)$`, 'i');
  const range = body.match(rangeRe);
  if (range) {
    const min = parseNumberToken(range[1]!);
    const max = parseNumberToken(range[2]!);
    if (min !== null && max !== null) {
      const { unit, rest } = takeUnit(range[3] ?? '');
      return { quantity: { kind: 'range', min, max, unit }, rest };
    }
  }

  const singleRe = new RegExp(`^(${NUMBER_PATTERN})\\s*(.*)$`, 'i');
  const single = body.match(singleRe);
  if (single) {
    const amount = parseNumberToken(single[1]!);
    if (amount !== null) {
      const { unit, rest } = takeUnit(single[2] ?? '');
      return { quantity: { kind: approx ? 'approx' : 'exact', amount, unit }, rest };
    }
  }

  // No number at all — but a bare vague unit still counts ("etwas Petersilie").
  const { unit, rest } = takeUnit(body);
  if (unit) return { quantity: { kind: 'exact', amount: 1, unit }, rest };

  return { quantity: { kind: 'unquantified' }, rest: body };
}

function takeUnit(text: string): { unit: Unit | null; rest: string } {
  const t = text.trimStart();
  const m = t.match(/^([A-Za-zÄÖÜäöüß.]+)\s*(.*)$/s);
  if (!m) return { unit: null, rest: t };
  const unit = normalizeUnitToken(m[1]!);
  return unit ? { unit, rest: (m[2] ?? '').trim() } : { unit: null, rest: t };
}

export interface ParsedIngredientLine {
  quantity: Quantity;
  /** The ingredient itself: "Mehl (Type 550)". */
  name: string;
  /** How it must be prepared: "fein gewürfelt". */
  preparation: string | null;
  note: string | null;
  /** 0..1 — below ~0.5 the editor should highlight the row for review. */
  confidence: number;
}

/**
 * Turns one line of a pasted ingredient list into structured data.
 *
 * "2-3 EL Olivenöl, kaltgepresst" -> range 2..3 EL, name "Olivenöl",
 * preparation "kaltgepresst".
 */
export function parseIngredientLine(input: string): ParsedIngredientLine {
  const line = input.replace(/\s+/g, ' ').trim().replace(/^[-•*]\s*/, '');
  if (!line) {
    return { quantity: { kind: 'unquantified' }, name: '', preparation: null, note: null, confidence: 0 };
  }

  const unquantified = UNQUANTIFIED.test(line);
  const { quantity, rest } = parseQuantity(line);

  let remainder = rest;
  let note: string | null = null;

  // A parenthesised aside is a note, not part of the name.
  const paren = remainder.match(/\(([^)]*)\)/);
  if (paren) {
    note = paren[1]!.trim();
    remainder = remainder.replace(paren[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // Everything after the first comma is preparation instructions.
  let preparation: string | null = null;
  const comma = remainder.indexOf(',');
  if (comma >= 0) {
    preparation = remainder.slice(comma + 1).trim() || null;
    remainder = remainder.slice(0, comma).trim();
  }

  const name = remainder.trim();

  let confidence = 1;
  if (quantity.kind === 'unquantified' && !unquantified) confidence -= 0.4;
  if (!name) confidence -= 0.5;
  if ('unit' in quantity && quantity.unit === null) confidence -= 0.1;

  return {
    quantity: unquantified && quantity.kind === 'unquantified' ? { kind: 'unquantified' } : quantity,
    name,
    preparation,
    note,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/** Parses a pasted block, one ingredient per line, skipping blanks. */
export function parseIngredientList(block: string): ParsedIngredientLine[] {
  return block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}
