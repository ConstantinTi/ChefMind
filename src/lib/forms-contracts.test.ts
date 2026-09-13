import { describe, expect, it } from 'vitest';
import { CheckShoppingItemInput, SetMealPlanEntryInput } from '@/contracts/planning';
import { coerceBoolean, fromForm, fromFormWithBooleans } from './forms';

/**
 * These schemas are validated against three very different callers: an HTML
 * form (strings only), a REST handler (JSON) and an MCP tool (real types). The
 * form is the awkward one, and it is where the bugs were.
 */
describe('coerceBoolean', () => {
  it('passes real booleans through, for MCP and JSON callers', () => {
    expect(coerceBoolean(true)).toBe(true);
    expect(coerceBoolean(false)).toBe(false);
  });

  it('understands the strings a form can actually send', () => {
    expect(coerceBoolean('on')).toBe(true);
    expect(coerceBoolean('true')).toBe(true);
    expect(coerceBoolean('1')).toBe(true);
    expect(coerceBoolean('false')).toBe(false);
    expect(coerceBoolean('off')).toBe(false);
    expect(coerceBoolean('0')).toBe(false);
  });

  it('gives up rather than guessing, so the schema default applies', () => {
    expect(coerceBoolean('vielleicht')).toBeUndefined();
    expect(coerceBoolean(undefined)).toBeUndefined();
    expect(coerceBoolean(7)).toBeUndefined();
  });

  it('leaves a field out entirely when it cannot be read', () => {
    const form = new FormData();
    form.set('itemId', 'abc');
    form.set('checked', 'vielleicht');
    expect(fromFormWithBooleans(form, ['checked'])).toEqual({ itemId: 'abc' });
  });
});

describe('CheckShoppingItemInput', () => {
  /** Unticking used to be impossible: the box sent nothing and the default
   *  said `true`, so every attempt to un-check re-checked the item. */
  it('can untick an item from a form', () => {
    const form = new FormData();
    form.set('itemId', 'abc');
    form.set('checked', 'false');
    expect(CheckShoppingItemInput.parse(fromFormWithBooleans(form, ['checked'])))
      .toEqual({ itemId: 'abc', checked: false });
  });

  it('can tick an item from a form', () => {
    const form = new FormData();
    form.set('itemId', 'abc');
    form.set('checked', 'true');
    expect(CheckShoppingItemInput.parse(fromFormWithBooleans(form, ['checked'])))
      .toEqual({ itemId: 'abc', checked: true });
  });

  it('still defaults to ticking when no value is given', () => {
    expect(CheckShoppingItemInput.parse({ itemId: 'abc' })).toEqual({ itemId: 'abc', checked: true });
  });
});

describe('SetMealPlanEntryInput', () => {
  it('accepts a free-text entry without a recipe', () => {
    const form = new FormData();
    form.set('date', '2026-09-07');
    form.set('slot', 'abend');
    form.set('freeText', 'Reste');
    // An empty servings box must read as "not given", not as zero.
    form.set('servings', '');
    const parsed = SetMealPlanEntryInput.parse(fromForm(form));
    expect(parsed.freeText).toBe('Reste');
    expect(parsed.servings).toBeUndefined();
  });

  it('coerces the servings a number input submits as a string', () => {
    const form = new FormData();
    form.set('date', '2026-09-07');
    form.set('recipeId', 'r1');
    form.set('servings', '6');
    expect(SetMealPlanEntryInput.parse(fromForm(form)).servings).toBe(6);
  });
});
