import { describe, expect, it } from 'vitest';
import { treeFromPgn } from '../pgn';
import { findChildByUci } from '../tree';
import type { Tree } from '../tree/types';
import type { CardMap } from './counts';
import { reviewCard, type SrsCard } from './schedule';
import { repertoireSession } from './session';

let n = 0;
const newId = () => `n${n++}`;
const NOW = new Date(2026, 9, 13, 10, 0);
const DAY = 86_400_000;

function card(due: number, state: number): SrsCard {
  const c = reviewCard(null, { ts: NOW, result: 'correct', hints: 0, timeMs: 3000 }).card;
  return { ...c, due: new Date(due), state };
}
function nodeAt(tree: Tree, ucis: string[]): string {
  let id = tree.rootId;
  for (const u of ucis) id = findChildByUci(tree, id, u)!.id;
  return id;
}

// White: 1.e4 e5 2.Nf3 Nc6 and 1.e4 c5 2.Nf3 — lines branch on the opponent's moves (sibling user
// moves are accepted alternatives of one line, see enumerateLines)
const tree = treeFromPgn('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *', { userColor: 'w', newId }).tree;
const E4 = nodeAt(tree, ['e2e4']);
const NF3 = nodeAt(tree, ['e2e4', 'e7e5', 'g1f3']);
const NF3C5 = nodeAt(tree, ['e2e4', 'c7c5', 'g1f3']);

describe('repertoireSession', () => {
  it('is empty without cards', () => {
    expect(repertoireSession([{ tree, cards: new Map() }], NOW)).toEqual([]);
  });

  it('brings a due move back on the shortest line that contains it', () => {
    const cards: CardMap = new Map([[E4, card(NOW.getTime() - DAY, 2)]]);
    expect(repertoireSession([{ tree, cards }], NOW)).toEqual([
      { ucis: ['e2e4', 'c7c5', 'g1f3'], kind: 'due', overdueMs: DAY, side: 'w' },
    ]);
  });

  it('puts the most overdue line first, then the learning ones', () => {
    const cards: CardMap = new Map([
      [NF3C5, card(NOW.getTime() - DAY, 2)],
      [NF3, card(NOW.getTime() - 3 * DAY, 2)],
      [E4, card(NOW.getTime() + DAY, 1)],
    ]);
    const out = repertoireSession([{ tree, cards }], NOW);
    expect(out.map((l) => [l.kind, l.ucis.at(-1)])).toEqual([
      ['due', 'b8c6'],
      ['due', 'g1f3'],
    ]);
    // E4 is learning but both lines through it are already in the session as due
  });

  it('lists a learning line when nothing on it is due', () => {
    const cards: CardMap = new Map([[NF3, card(NOW.getTime() + DAY, 1)]]);
    expect(repertoireSession([{ tree, cards }], NOW)).toEqual([
      { ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], kind: 'learning', overdueMs: 0, side: 'w' },
    ]);
  });

  it('ignores a collection with a custom start', () => {
    const custom = treeFromPgn(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 *',
      { userColor: 'w', newId },
    ).tree;
    const cards: CardMap = new Map([[nodeAt(custom, ['e2e4']), card(NOW.getTime() - DAY, 2)]]);
    expect(repertoireSession([{ tree: custom, cards }], NOW)).toEqual([]);
  });
});
