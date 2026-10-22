import { describe, expect, it } from 'vitest';
import { toEpd } from '../fen';
import { INITIAL_FEN, playMove } from '../position';
import { edgeKeyAfter } from '../srs/line-state';
import { criticalPly, type PuzzleCards } from './puzzle';

const LINE = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'];
const NOW = new Date('2026-10-16T12:00:00Z');
const DAY = 86_400_000;

type Spec = { state: number; due: Date };

/** Cards keyed by the edge of each ply, by playing `LINE` with chess.js. */
function cardsAt(specs: Record<number, Spec>): PuzzleCards {
  const map = new Map<string, Spec[]>();
  let fen = INITIAL_FEN;
  LINE.forEach((uci, i) => {
    const m = playMove(fen, uci);
    if (!m) throw new Error(`illegal ${uci}`);
    fen = m.fen;
    const spec = specs[i];
    if (spec) map.set(edgeKeyAfter(toEpd(fen), uci), [spec]);
  });
  return map as PuzzleCards;
}

const due = (daysAgo: number, state = 2): Spec => ({
  state,
  due: new Date(NOW.getTime() - daysAgo * DAY),
});
const later = (state = 2): Spec => ({ state, due: new Date(NOW.getTime() + 5 * DAY) });

describe('criticalPly', () => {
  it('a due move: the most overdue user move decides', () => {
    const cards = cardsAt({ 0: due(1), 2: due(3), 4: later() });
    expect(criticalPly(LINE, 'w', cards, NOW)).toBe(2);
  });

  it('a learning move that is not due is used when nothing is due', () => {
    expect(criticalPly(LINE, 'w', cardsAt({ 0: later(), 2: later(1), 4: later() }), NOW)).toBe(2);
    expect(criticalPly(LINE, 'w', cardsAt({ 0: later(), 2: later(3), 4: later() }), NOW)).toBe(2);
  });

  it('with no cards: the first user move', () => {
    expect(criticalPly(LINE, 'w', new Map(), NOW)).toBe(0);
    expect(criticalPly(LINE, 'b', new Map(), NOW)).toBe(1);
  });

  it('a line with some cards and a user move without one: the first move without a card', () => {
    expect(criticalPly(LINE, 'w', cardsAt({ 0: later(), 4: later() }), NOW)).toBe(2);
  });

  it('all known and not due: the first user move', () => {
    expect(criticalPly(LINE, 'w', cardsAt({ 0: later(), 2: later(), 4: later() }), NOW)).toBe(0);
    expect(criticalPly(LINE, 'b', cardsAt({ 1: later(), 3: later(), 5: later() }), NOW)).toBe(1);
  });

  it("only the user's side counts", () => {
    const cards = cardsAt({ 1: due(9), 0: later(), 2: later(), 4: later() });
    expect(criticalPly(LINE, 'w', cards, NOW)).toBe(0);
  });
});
