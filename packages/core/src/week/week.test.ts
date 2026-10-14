import { describe, expect, it } from 'vitest';
import { weekId, weekNumber, weekOf, weekSource } from './week';

describe('weekId', () => {
  it('is the ISO week of a local date', () => {
    expect(weekId(new Date(2026, 9, 14))).toBe('2026-W42'); // Wednesday
    expect(weekId(new Date(2026, 9, 12))).toBe('2026-W42'); // Monday
    expect(weekId(new Date(2026, 9, 18, 23, 59))).toBe('2026-W42'); // Sunday night
    expect(weekId(new Date(2026, 9, 19))).toBe('2026-W43');
  });

  it('crosses the year boundary like ISO 8601', () => {
    expect(weekId(new Date(2026, 11, 31))).toBe('2026-W53');
    expect(weekId(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(weekId(new Date(2027, 0, 4))).toBe('2027-W01');
    expect(weekId(new Date(2025, 11, 29))).toBe('2026-W01');
  });
});

describe('week sources', () => {
  it('round-trips and rejects other sources', () => {
    expect(weekSource('2026-W42')).toBe('week:2026-W42');
    expect(weekOf('week:2026-W42')).toBe('2026-W42');
    expect(weekOf('pgn')).toBeNull();
    expect(weekOf(null)).toBeNull();
    expect(weekNumber('2026-W07')).toBe(7);
  });
});
