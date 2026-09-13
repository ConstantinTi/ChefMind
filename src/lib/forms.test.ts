import { describe, expect, it } from 'vitest';
import { fromForm } from './forms';
import { SetMealPlanEntryInput, AddShoppingItemInput } from '@/contracts/planning';

describe('fromForm', () => {
  it('turns FormData into a plain object', () => {
    const fd = new FormData();
    fd.set('date', '2026-09-14');
    fd.set('slot', 'abend');
    expect(fromForm(fd)).toEqual({ date: '2026-09-14', slot: 'abend' });
  });

  it('drops empty fields so nullish schemas see "not provided"', () => {
    const fd = new FormData();
    fd.set('date', '2026-09-14');
    fd.set('recipeId', '');
    fd.set('note', '   ');
    expect(fromForm(fd)).toEqual({ date: '2026-09-14' });
  });

  it('passes a plain object through untouched, so .bind() actions still work', () => {
    const bound = { id: 'abc' };
    expect(fromForm(bound)).toBe(bound);
  });
});

describe('the schemas accept what the forms actually submit', () => {
  it('parses the Wochenplan form', () => {
    const fd = new FormData();
    fd.set('date', '2026-09-14');
    fd.set('slot', 'abend');
    fd.set('recipeId', 'tomatensuppe');
    fd.set('servings', '6'); // a form submits a string, not a number
    const parsed = SetMealPlanEntryInput.parse(fromForm(fd));
    expect(parsed.servings).toBe(6);
    expect(parsed.date).toBe('2026-09-14');
  });

  it('parses the Wochenplan form with the servings field left empty', () => {
    const fd = new FormData();
    fd.set('date', '2026-09-14');
    fd.set('slot', 'mittag');
    fd.set('recipeId', 'tomatensuppe');
    fd.set('servings', '');
    expect(() => SetMealPlanEntryInput.parse(fromForm(fd))).not.toThrow();
  });

  it('parses the Einkaufsliste form', () => {
    const fd = new FormData();
    fd.set('listId', 'l1');
    fd.set('label', 'Backpapier');
    fd.set('display', '');
    const parsed = AddShoppingItemInput.parse(fromForm(fd));
    expect(parsed).toMatchObject({ listId: 'l1', label: 'Backpapier', display: '' });
  });
});
