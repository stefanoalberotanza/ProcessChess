const DAY = 86_400_000;

/** ISO 8601 week of a local date, e.g. '2026-W42' (weeks start on Monday). */
export function weekId(date: Date): string {
  // the Thursday of the date's week decides the year
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const firstThursday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const PREFIX = 'week:';

/** `collection.source` of a week repertoire. */
export function weekSource(week: string): string {
  return `${PREFIX}${week}`;
}

/** The week of a week repertoire's source; null for any other collection. */
export function weekOf(source: string | null): string | null {
  return source?.startsWith(PREFIX) ? source.slice(PREFIX.length) : null;
}

/** 42 for '2026-W42'. */
export function weekNumber(week: string): number {
  return parseInt(week.slice(week.indexOf('W') + 1), 10);
}
