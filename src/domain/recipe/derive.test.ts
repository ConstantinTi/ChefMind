import { describe, expect, it } from 'vitest';
import { initialServings } from './derive';

describe('initialServings', () => {
  const portions = { baseServings: 2, servingUnit: 'portion' as const };
  const slices = { baseServings: 12, servingUnit: 'scheibe' as const };

  it('opens a portion-based recipe at the household default', () => {
    expect(initialServings(portions, 4)).toBe(4);
  });

  it('uses the household number even when the recipe asks for more', () => {
    expect(initialServings({ baseServings: 8, servingUnit: 'portion' }, 4)).toBe(4);
  });

  /**
   * A Hefezopf stored as 12 Scheiben with "1 Zopf, ca. 35 cm" is not something
   * you bake four of — rescaling it to 4 would produce a third of a loaf.
   */
  it('leaves anything not counted in portions alone', () => {
    expect(initialServings(slices, 4)).toBe(12);
    expect(initialServings({ baseServings: 1, servingUnit: 'glas' }, 4)).toBe(1);
  });

  it('falls back to the recipe when the household number is nonsense', () => {
    expect(initialServings(portions, 0)).toBe(2);
    expect(initialServings(portions, -1)).toBe(2);
    expect(initialServings(portions, Number.NaN)).toBe(2);
  });
});
