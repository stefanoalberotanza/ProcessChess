import { describe, expect, it } from 'vitest';
import { type WeekCollection, planWeek } from './plan';

const col = (
  id: string,
  source: string | null,
  userColor: 'w' | 'b',
  archived = false,
): WeekCollection => ({ id, source, userColor, archivedAt: archived ? new Date(0) : null });

describe('planWeek', () => {
  it('creates both colours on a fresh profile', () => {
    expect(planWeek([], '2026-W42')).toEqual({ archive: [], create: ['w', 'b'] });
  });

  it('archives past week repertoires and leaves other collections alone', () => {
    const plan = planWeek(
      [
        col('a', 'week:2026-W41', 'w'),
        col('b', 'week:2026-W41', 'b'),
        col('c', 'pgn', 'w'),
        col('d', null, 'b'),
      ],
      '2026-W42',
    );
    expect(plan).toEqual({ archive: ['a', 'b'], create: ['w', 'b'] });
  });

  it('does nothing when the current week already exists (restart)', () => {
    const plan = planWeek(
      [col('a', 'week:2026-W42', 'w'), col('b', 'week:2026-W42', 'b')],
      '2026-W42',
    );
    expect(plan).toEqual({ archive: [], create: [] });
  });

  it('does not recreate a colour archived by hand this week', () => {
    const plan = planWeek([col('a', 'week:2026-W42', 'w', true)], '2026-W42');
    expect(plan).toEqual({ archive: [], create: ['b'] });
  });

  it('does not archive again what is already archived', () => {
    expect(planWeek([col('a', 'week:2026-W40', 'w', true)], '2026-W42').archive).toEqual([]);
  });
});
