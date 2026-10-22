import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { edgeKeyAfter } from '../srs/line-state';
import type { SrsCard } from '../srs/schedule';

export type PuzzleCards = ReadonlyMap<string, readonly Pick<SrsCard, 'state' | 'due'>[]>;

const NEW = 0;
const REVIEW = 2;

/**
 * 0-based index in `line` (UCI from the initial position) of the first move the user, playing
 * `side`, must decide. Rule order: the most overdue due move; else the first learning or
 * relearning move; else the first user move without a card; else the first user move.
 */
export function criticalPly(
  line: readonly string[],
  side: 'w' | 'b',
  cards: PuzzleCards,
  now: Date,
): number {
  const first = side === 'w' ? 0 : 1;
  const chess = new Chess();
  let overdue = -1;
  let overdueDue = Infinity;
  let learning = -1;
  let uncarded = -1;
  for (let i = 0; i < line.length; i++) {
    const uci = line[i] as string;
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined,
    });
    if (i % 2 !== first) continue;
    const own = cards.get(edgeKeyAfter(toEpd(chess.fen()), uci)) ?? [];
    if (own.length === 0) {
      if (uncarded < 0) uncarded = i;
      continue;
    }
    for (const c of own) {
      if (c.state !== NEW && c.due.getTime() <= now.getTime() && c.due.getTime() < overdueDue) {
        overdue = i;
        overdueDue = c.due.getTime();
      }
      if (learning < 0 && c.state !== NEW && c.state !== REVIEW) learning = i;
    }
  }
  if (overdue >= 0) return overdue;
  if (learning >= 0) return learning;
  if (uncarded >= 0) return uncarded;
  return first;
}
