import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { openings } from './data';
import type { OpeningEntry, ResolvedOpening } from './types';

export class IllegalMoveError extends Error {
  constructor(
    readonly san: string,
    readonly ply: number,
  ) {
    super(`Illegal or unparsable move "${san}" at ply ${ply}`);
    this.name = 'IllegalMoveError';
  }
}

let index: Map<string, OpeningEntry> | undefined;

function openingIndex(): Map<string, OpeningEntry> {
  index ??= new Map(openings.map((e) => [e.epd, e]));
  return index;
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
 */
export function resolveOpening(movesSan: readonly string[]): ResolvedOpening | null {
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

  const lookup = openingIndex();
  for (let ply = epds.length; ply >= 1; ply--) {
    const entry = lookup.get(epds[ply - 1]!);
    if (entry) return { eco: entry.eco, name: entry.name, ...splitOpeningName(entry.name), ply };
  }
  return null;
}
