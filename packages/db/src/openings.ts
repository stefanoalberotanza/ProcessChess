import { openings, splitOpeningName } from '@processchess/core';
import type { Opening } from './schema';

/** Rows for the `opening` reference table, from the dataset bundled in core. */
export function openingRows(): Opening[] {
  return openings.map((o) => ({
    epd: o.epd,
    eco: o.eco,
    name: o.name,
    uci: o.uci,
    ply: o.ply,
    ...splitOpeningName(o.name),
  }));
}
