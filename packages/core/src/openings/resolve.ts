import { Chess } from 'chess.js';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import { INITIAL_FEN, playLine } from '../position';
import { openingIndex } from './data';
import type { OpeningClassification, OpeningLabel, ResolvedOpening } from './types';

export class OpeningsNotLoadedError extends Error {
  constructor() {
    super('Openings dataset not loaded: await loadOpenings() first');
    this.name = 'OpeningsNotLoadedError';
  }
}

/**
 * Splits "Family: Variation, Subvariation" into its family and variation parts. Names without
 * a colon split at the first comma ("King's Indian Attack, with Bf5").
 */
export function splitOpeningName(name: string): { family: string; variation: string | null } {
  let cut = name.indexOf(':');
  if (cut === -1) cut = name.indexOf(',');
  if (cut === -1) return { family: name.trim(), variation: null };
  return { family: name.slice(0, cut).trim(), variation: name.slice(cut + 1).trim() || null };
}

export interface NamedPly {
  ply: number;
  eco: string;
  name: string;
}

/** Replays `movesSan` and returns the dataset entry of every named position, in ply order. */
function namedPath(movesSan: readonly string[]): NamedPly[] {
  const lookup = openingIndex();
  if (!lookup) throw new OpeningsNotLoadedError();
  const chess = new Chess();
  const named: NamedPly[] = [];
  for (const [i, san] of movesSan.entries()) {
    try {
      chess.move(san);
    } catch {
      throw new IllegalMoveError(san, i + 1);
    }
    const entry = lookup.get(toEpd(chess.fen()));
    if (entry) named.push({ ply: i + 1, eco: entry[0], name: entry[1] });
  }
  return named;
}

/** Style label from White's first move (SAN from the initial position). */
export function labelOf(firstSan: string): OpeningLabel {
  if (firstSan === 'e4') return 'king';
  if (firstSan === 'd4') return 'queen';
  return 'flank';
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
  const last = namedPath(movesSan).at(-1);
  if (!last) return null;
  return { eco: last.eco, name: last.name, ...splitOpeningName(last.name), ply: last.ply };
}

/**
 * Classifies a line from the standard initial position as label › opening › variation
 * (see docs/adr/009-opening-classification.md).
 *
 * - `label`: style from White's first move (1.e4 king, 1.d4 queen, anything else flank).
 *   One-move names in the dataset are labels, never openings.
 * - `opening`: family of the deepest named position after ply 1; it starts at the first
 *   named position of the last contiguous run of that family (a family change = a new opening).
 * - `variation`: the variation part of the deepest name, if any.
 *
 * @throws IllegalMoveError if a move is illegal or not valid SAN.
 * @throws OpeningsNotLoadedError if `loadOpenings()` has not resolved yet.
 */
export function classifyOpening(movesSan: readonly string[]): OpeningClassification {
  const first = movesSan[0];
  return classifyNamedPath(first === undefined ? null : labelOf(first), namedPath(movesSan));
}

/** Style label of a first move given in UCI (`e2e4` king, `d2d4` queen, anything else flank). */
export function labelOfUci(uci: string): OpeningLabel {
  return uci === 'e2e4' ? 'king' : uci === 'd2d4' ? 'queen' : 'flank';
}

/** `classifyOpening` for a line in UCI from the initial position; null if a move is illegal. */
export function classifyOpeningUci(ucis: readonly string[]): OpeningClassification | null {
  const played = playLine(INITIAL_FEN, ucis);
  return played ? classifyOpening(played.san) : null;
}

/** Classification from the label and the named positions of a line (in ply order). */
export function classifyNamedPath(
  label: OpeningLabel | null,
  named: readonly NamedPly[],
): OpeningClassification {
  const ply = named.at(-1)?.ply ?? 0;
  const deep = named.filter((n) => n.ply >= 2);
  const last = deep.at(-1);
  if (!last) return { label, opening: null, variation: null, ply };
  const { family, variation } = splitOpeningName(last.name);
  let start = deep.length - 1;
  while (start > 0 && splitOpeningName(deep[start - 1]!.name).family === family) start--;
  const head = deep[start]!;
  return {
    label,
    opening: { eco: head.eco, name: family, ply: head.ply },
    variation: variation === null ? null : { eco: last.eco, name: variation, ply: last.ply },
    ply,
  };
}
