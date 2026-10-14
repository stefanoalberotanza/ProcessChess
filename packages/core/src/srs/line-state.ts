import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { INITIAL_FEN } from '../position';
import type { SrsCard } from './schedule';

/** FSRS state of a line for its user: new, being learnt, or known (ADR 013). */
export type LineSrs = 'new' | 'learning' | 'known';

/** Key of a repertoire move: the position it reaches and the move (`node.epd` + `node.uci`). */
export function edgeKeyAfter(epdAfter: string, uci: string): string {
  return `${epdAfter} ${uci}`;
}

const REVIEW = 2;
const NEW = 0;

type Cards = ReadonlyMap<string, readonly Pick<SrsCard, 'state'>[]>;

// the moves present in a card map, to skip lines without any of them before replaying them
const movesOf = new WeakMap<Cards, Set<string>>();
function movesIn(cards: Cards): Set<string> {
  let moves = movesOf.get(cards);
  if (!moves) {
    moves = new Set([...cards.keys()].map((k) => k.slice(k.lastIndexOf(' ') + 1)));
    movesOf.set(cards, moves);
  }
  return moves;
}

/**
 * The FSRS state of `line` (UCI from the initial position) for the `side` that learns it, from the
 * cards of the user's repertoire moves keyed by `edgeKeyAfter`. `null` when no move of `side` has
 * a card (the line is not in a repertoire, or was never reviewed): callers fall back to the lab.
 * Known when every move of `side` is in review; new when all its cards are still new; learning
 * otherwise.
 */
export function lineSrsState(
  line: readonly string[],
  side: 'w' | 'b',
  cards: Cards,
): LineSrs | null {
  if (cards.size === 0) return null;
  const known = movesIn(cards);
  const first = side === 'w' ? 0 : 1;
  let any = false;
  for (let i = first; i < line.length; i += 2) if (known.has(line[i]!)) any = true;
  if (!any) return null;

  const chess = new Chess(INITIAL_FEN);
  let moves = 0;
  const states: number[] = [];
  for (const [i, uci] of line.entries()) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    if (i % 2 !== first) continue;
    moves++;
    for (const c of cards.get(edgeKeyAfter(toEpd(chess.fen()), uci)) ?? []) states.push(c.state);
  }
  if (states.length === 0) return null;
  if (states.length >= moves && states.every((s) => s === REVIEW)) return 'known';
  if (states.every((s) => s === NEW)) return 'new';
  return 'learning';
}

/**
 * True when every move of `side` in `line` has a card reviewed at or after `dayStart` (Unix ms of
 * the local day's start): the line was done today (ADR 013).
 */
export function lineReviewedOn(
  line: readonly string[],
  side: 'w' | 'b',
  cards: ReadonlyMap<string, readonly Pick<SrsCard, 'lastReview'>[]>,
  dayStart: number,
): boolean {
  const chess = new Chess(INITIAL_FEN);
  const first = side === 'w' ? 0 : 1;
  let moves = 0;
  for (const [i, uci] of line.entries()) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    if (i % 2 !== first) continue;
    moves++;
    const reviewed = (cards.get(edgeKeyAfter(toEpd(chess.fen()), uci)) ?? []).some(
      (c) => c.lastReview !== null && c.lastReview.getTime() >= dayStart,
    );
    if (!reviewed) return false;
  }
  return moves > 0;
}
