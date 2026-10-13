import { loadOpenings, splitOpeningName } from '@processchess/core';
import type { Opening } from './schema';

/** Rows for the `opening` reference table, from the dataset bundled in core. */
export async function openingRows(): Promise<Opening[]> {
  const index = await loadOpenings();
  return [...index].map(([epd, [eco, name]]) => ({ epd, eco, name, ...splitOpeningName(name) }));
}
