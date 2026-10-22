import { dayKey } from '../srs/stats';

export const PRACTICE_SLOT_MS = 15 * 60 * 1000;

/** Distinct local days (YYYY-MM-DD, ascending) of the start timestamps (Unix ms) of 15-minute practice slots. */
export function practiceDays(slots: readonly number[]): string[] {
  return [...new Set(slots.map((ms) => dayKey(new Date(ms))))].sort();
}

function previousDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

/** Consecutive days ending today, or yesterday when today has none yet. */
export function currentStreak(days: readonly string[], today: Date): number {
  const set = new Set(days);
  let day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(dayKey(day))) day = previousDay(day);
  let streak = 0;
  while (set.has(dayKey(day))) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}
