import { describe, expect, it } from 'vitest';
import { currentStreak, practiceDays, PRACTICE_SLOT_MS } from './streak';

const today = new Date(2026, 9, 16, 12);
const ago = (n: number) => {
  const d = new Date(2026, 9, 16 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('practiceDays', () => {
  it('uses 15-minute slots', () => {
    expect(PRACTICE_SLOT_MS).toBe(900000);
  });

  it('maps slots of the same local day to one entry, ascending', () => {
    const a = new Date(2026, 9, 16, 10, 0).getTime();
    const b = new Date(2026, 9, 16, 10, 15).getTime();
    const c = new Date(2026, 9, 15, 9, 0).getTime();
    expect(practiceDays([a, b, c])).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('splits slots either side of local midnight', () => {
    const before = new Date(2026, 9, 15, 23, 45).getTime();
    const after = new Date(2026, 9, 16, 0, 0).getTime();
    expect(practiceDays([after, before])).toEqual(['2026-10-15', '2026-10-16']);
  });
});

describe('currentStreak', () => {
  it('is 0 without days', () => {
    expect(currentStreak([], today)).toBe(0);
  });
  it('counts today only', () => {
    expect(currentStreak([ago(0)], today)).toBe(1);
  });
  it('counts today and four previous days', () => {
    expect(currentStreak([0, 1, 2, 3, 4].map(ago), today)).toBe(5);
  });
  it('stays alive from yesterday when today has none', () => {
    expect(currentStreak([ago(1), ago(2), ago(3)], today)).toBe(3);
  });
  it('resets on a missing day', () => {
    expect(currentStreak([ago(0), ago(2)], today)).toBe(1);
  });
  it('is 0 when the last day is two days ago', () => {
    expect(currentStreak([ago(2)], today)).toBe(0);
  });
  it('crosses month and year boundaries', () => {
    expect(currentStreak(['2026-12-30', '2026-12-31', '2027-01-01'], new Date(2027, 0, 1, 8))).toBe(
      3,
    );
  });
  it('ignores duplicates', () => {
    expect(currentStreak([ago(0), ago(0), ago(1), ago(1)], today)).toBe(2);
  });
});
