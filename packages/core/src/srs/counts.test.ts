import { describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { treeFromPgn } from '../pgn';
import type { Tree } from '../tree';
import { CardState, type SrsCard, cardCounts, dueNodeIds, scheduledNodeIds } from './index';

// Main 1.e4 e5 2.Nf3 Nc6 3.Bc4; 1...c5 2.Nf3; alternative user move 2.Nc3 Nf6 3.f4.
const WHITE = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. Nc3 Nf6 3. f4) 2... Nc6 3. Bc4 *';

const MIN = 60_000;
const NOW = new Date(2026, 9, 8, 12, 0);
const END_OF_DAY = new Date(2026, 9, 8, 23, 59, 59, 999);

function white(): Tree {
  return treeFromPgn(WHITE, { userColor: 'w', newId: counterIds() }).tree;
}

const sans = (tree: Tree, ids: Iterable<string>) => [...ids].map((id) => tree.nodes.get(id)!.san);

/** Finds the node reached by SAN moves from the root. */
function at(tree: Tree, ...moves: string[]): string {
  let id = tree.rootId;
  for (const san of moves) {
    id = tree.children.get(id)!.find((c) => tree.nodes.get(c)!.san === san)!;
  }
  return id;
}

function card(due: Date, state = CardState.Review): SrsCard {
  return {
    due,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state,
    lastReview: new Date(due.getTime() - 86_400_000),
  };
}

describe('scheduledNodeIds', () => {
  it('lists the user moves of every line, alternatives excluded, in line order', () => {
    const tree = white();
    expect(sans(tree, scheduledNodeIds(tree))).toEqual(['e4', 'Nf3', 'Bc4', 'Nf3']);
  });

  it('works for black repertoires', () => {
    const tree = treeFromPgn('1. e4 c5 (1... e6) 2. Nf3 d6 (2... Nc6) 3. d4 (3. Bb5+ Bd7) *', {
      userColor: 'b',
      newId: counterIds(),
    }).tree;
    expect(sans(tree, scheduledNodeIds(tree))).toEqual(['c5', 'd6', 'Bd7']);
  });
});

describe('dueNodeIds', () => {
  it('returns scheduled moves whose card is due, in line order', () => {
    const tree = white();
    const cards = new Map([
      [at(tree, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4'), card(new Date(NOW.getTime() - MIN))],
      [at(tree, 'e4'), card(NOW)],
      [at(tree, 'e4', 'e5', 'Nf3'), card(new Date(NOW.getTime() + MIN))],
      [at(tree, 'e4', 'e5', 'Nc3'), card(new Date(NOW.getTime() - MIN))], // alternative
    ]);
    expect(sans(tree, dueNodeIds(tree, cards, NOW))).toEqual(['e4', 'Bc4']);
  });
});

describe('cardCounts', () => {
  it('counts new, learning, review and due cards of scheduled moves', () => {
    const tree = white();
    const cards = new Map([
      [at(tree, 'e4'), card(new Date(NOW.getTime() - MIN))],
      [at(tree, 'e4', 'e5', 'Nf3'), card(new Date(NOW.getTime() + 10 * MIN), CardState.Learning)],
      [at(tree, 'e4', 'c5', 'Nf3'), card(new Date(END_OF_DAY.getTime() + MIN))],
      [at(tree, 'e4', 'e5', 'Nc3'), card(new Date(NOW.getTime() - MIN))], // alternative
    ]);
    expect(cardCounts(tree, cards, NOW, END_OF_DAY)).toEqual({
      total: 4,
      new: 1,
      learning: 1,
      review: 2,
      dueNow: 1,
      dueToday: 2,
      nextDue: new Date(NOW.getTime() + 10 * MIN),
    });
  });

  it('has no next due date without cards', () => {
    const tree = white();
    expect(cardCounts(tree, new Map(), NOW, END_OF_DAY)).toMatchObject({
      total: 4,
      new: 4,
      dueNow: 0,
      nextDue: null,
    });
  });
});
