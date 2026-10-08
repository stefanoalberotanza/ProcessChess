import { describe, expect, it } from 'vitest';
import { type DayStat, addDays, dayKey, endOfLocalDay, fillDays, streak } from './index';

function day(d: string, attempts: number, extra: Partial<DayStat> = {}): DayStat {
  return { day: d, attempts, correct: attempts, hint: 0, wrong: 0, newCards: 0, timeMs: 0, ...extra };
}

describe('dayKey', () => {
  it('is the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('endOfLocalDay is the last millisecond of the day', () => {
    const end = endOfLocalDay(new Date(2026, 9, 8, 12));
    expect(end).toEqual(new Date(2026, 9, 8, 23, 59, 59, 999));
  });

  it('addDays moves across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('fillDays', () => {
  it('returns n days ending today with zeros where nothing was done, summing duplicates', () => {
    const rows = [
      day('2026-10-06', 3, { wrong: 1, correct: 2, timeMs: 500 }),
      day('2026-10-08', 2, { newCards: 2 }),
      day('2026-10-08', 1, { hint: 1, correct: 0, timeMs: 100 }),
      day('2026-09-01', 9), // out of range
    ];
    expect(fillDays(rows, '2026-10-08', 4)).toEqual([
      day('2026-10-05', 0, { correct: 0 }),
      day('2026-10-06', 3, { wrong: 1, correct: 2, timeMs: 500 }),
      day('2026-10-07', 0, { correct: 0 }),
      day('2026-10-08', 3, { correct: 2, hint: 1, newCards: 2, timeMs: 100 }),
    ]);
  });
});

describe('streak', () => {
  it('counts consecutive days with attempts ending today', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => day(d, 1));
    expect(streak(days, '2026-10-08')).toBe(4);
  });

  it('still counts when today has nothing yet', () => {
    const days = [day('2026-10-06', 1), day('2026-10-07', 2)];
    expect(streak(days, '2026-10-08')).toBe(2);
  });

  it('a gap ends the streak', () => {
    const days = [day('2026-10-04', 1), day('2026-10-06', 1), day('2026-10-07', 0)];
    expect(streak(days, '2026-10-08')).toBe(0);
    expect(streak([], '2026-10-08')).toBe(0);
  });
});
