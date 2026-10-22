import { dayKey } from '@processchess/core';

/** The day of the last Today session, `{ day }` (one session per day). */
const KEY = 'pc.today';

/** Fallback when storage is unavailable: the limit holds until reload. */
let memory: string | null = null;

/** Marks the local day of `now` as the day a Today session began. */
export function markTodayStarted(now = new Date()): void {
  const day = dayKey(now);
  memory = day;
  try {
    localStorage.setItem(KEY, JSON.stringify({ day }));
  } catch {
    // storage unavailable: the memory fallback is enough until reload
  }
}

/** True when a Today session already began on the local day of `now`. */
export function startedToday(now = new Date()): boolean {
  const day = dayKey(now);
  if (memory === day) return true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { day?: unknown }).day === day;
  } catch {
    return false;
  }
}
