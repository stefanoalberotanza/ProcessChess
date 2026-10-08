import { Chess } from 'chess.js';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import { openingIndex } from './data';
import type { ResolvedOpening } from './types';

export class OpeningsNotLoadedError extends Error {
  constructor() {
    super('Openings dataset not loaded: await loadOpenings() first');
    this.name = 'OpeningsNotLoadedError';
  }
}

/** Splits "Family: Variation, Subvariation" into its family and variation parts. */
export function splitOpeningName(name: string): { family: string; variation: string | null } {
  const colon = name.indexOf(':');
  if (colon === -1) return { family: name.trim(), variation: null };
  return { family: name.slice(0, colon).trim(), variation: name.slice(colon + 1).trim() || null };
}

/**
 * Names the opening reached by `movesSan`, played from the standard initial position.
 *
 * Starts from the final position and walks back one ply at a time until a position
 * present in the dataset is found, so transpositions are recognised and lines that
 * leave theory report the last named position (with its ply).
 *
 * @throws IllegalMoveError if a move is illegal or not valid SAN.
 * @throws OpeningsNotLoadedError if `loadOpenings()` has not resolved yet.
 */
export function resolveOpening(movesSan: readonly string[]): ResolvedOpening | null {
  const lookup = openingIndex();
  if (!lookup) throw new OpeningsNotLoadedError();
  const chess = new Chess();
  const epds: string[] = [];
  for (const [i, san] of movesSan.entries()) {
    try {
      chess.move(san);
    } catch {
      throw new IllegalMoveError(san, i + 1);
    }
    epds.push(toEpd(chess.fen()));
  }

  for (let ply = epds.length; ply >= 1; ply--) {
    const entry = lookup.get(epds[ply - 1]!);
    if (entry) {
      const [eco, name] = entry;
      return { eco, name, ...splitOpeningName(name), ply };
    }
  }
  return null;
}
