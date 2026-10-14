import { weekOf, weekSource } from './week';

/** What `planWeek` needs from a collection. */
export interface WeekCollection {
  id: string;
  source: string | null;
  userColor: 'w' | 'b';
  archivedAt: Date | null;
}

/**
 * What to do for the week `current`: archive the non-archived week repertoires of other weeks,
 * create the colours that have no repertoire for `current` (archived ones count, so a week
 * repertoire archived by hand is not recreated that week).
 */
export function planWeek(
  collections: readonly WeekCollection[],
  current: string,
): { archive: string[]; create: ('w' | 'b')[] } {
  const archive = collections
    .filter((c) => {
      const week = weekOf(c.source);
      return !c.archivedAt && week !== null && week !== current;
    })
    .map((c) => c.id);
  const source = weekSource(current);
  const create = (['w', 'b'] as const).filter(
    (color) => !collections.some((c) => c.source === source && c.userColor === color),
  );
  return { archive, create };
}
