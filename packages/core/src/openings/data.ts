import data from './openings.json';
import type { OpeningEntry } from './types';

/** The full generated dataset (one entry per unique EPD). */
export const openings: readonly OpeningEntry[] = data as OpeningEntry[];
