/** Totals of one local day. Mirrors the counters of the `daily_stat` table. */
export interface DayStat {
  /** YYYY-MM-DD, local time. */
  day: string;
  attempts: number;
  correct: number;
  hint: number;
  wrong: number;
  /** Moves tried for the first time. */
  newCards: number;
  timeMs: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Local calendar day of `date` as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Last millisecond of the local day of `date`. */
export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** The day key `n` days after `day` (negative: before). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + n));
}

export function emptyDay(day: string): DayStat {
  return { day, attempts: 0, correct: 0, hint: 0, wrong: 0, newCards: 0, timeMs: 0 };
}

/** The `n` days ending with `today`, oldest first; rows of the same day are summed. */
export function fillDays(rows: readonly DayStat[], today: string, n: number): DayStat[] {
  const days = Array.from({ length: n }, (_, i) => emptyDay(addDays(today, i - n + 1)));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.attempts += r.attempts;
    d.correct += r.correct;
    d.hint += r.hint;
    d.wrong += r.wrong;
    d.newCards += r.newCards;
    d.timeMs += r.timeMs;
  }
  return days;
}

/**
 * Consecutive days with attempts, ending today, or yesterday when nothing was done today yet.
 */
export function streak(rows: readonly DayStat[], today: string): number {
  const active = new Set(rows.filter((r) => r.attempts > 0).map((r) => r.day));
  let day = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
