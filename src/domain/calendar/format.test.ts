import { describe, expect, it } from 'vitest';
import { formatDateLong, formatDateShort, formatMinutes, isoWeekNumber } from './format';

describe('formatMinutes', () => {
  it('keeps short times in minutes', () => {
    expect(formatMinutes(45)).toBe('45 Min.');
  });

  it('splits an hour and a remainder', () => {
    expect(formatMinutes(90)).toBe('1 Std. 30 Min.');
  });

  it('drops a zero remainder', () => {
    expect(formatMinutes(120)).toBe('2 Std.');
  });

  it('treats nothing and zero as no time at all', () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
  });
});

describe('formatDate', () => {
  it('writes the month out and drops the leading zero', () => {
    expect(formatDateLong('2026-09-07')).toBe('7. September');
    expect(formatDateShort('2026-09-07')).toBe('7.9.');
  });

  it('handles both ends of the year', () => {
    expect(formatDateLong('2026-01-01')).toBe('1. Januar');
    expect(formatDateLong('2026-12-31')).toBe('31. Dezember');
  });
});

describe('isoWeekNumber', () => {
  it('numbers an ordinary week', () => {
    // 2026-09-07 is a Monday.
    expect(isoWeekNumber('2026-09-07')).toBe(37);
    expect(isoWeekNumber('2026-09-13')).toBe(37);
  });

  it('starts a new week on the Monday', () => {
    expect(isoWeekNumber('2026-09-14')).toBe(38);
  });

  it('puts early January in the previous year last week where ISO says so', () => {
    // 2027-01-01 is a Friday, so it belongs to week 53 of 2026.
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    // 2026-01-01 is a Thursday, which makes it week 1.
    expect(isoWeekNumber('2026-01-01')).toBe(1);
  });

  it('puts a late-December Monday in week 1 of the next year', () => {
    // 2025-12-29 is a Monday whose Thursday lands in 2026.
    expect(isoWeekNumber('2025-12-29')).toBe(1);
  });
});
