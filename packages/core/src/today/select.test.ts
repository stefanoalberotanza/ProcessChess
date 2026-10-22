import { describe, expect, it } from 'vitest';
import { seededRandom } from '../lab/mix';
import { treeFromPgn } from '../pgn';
import type { CardMap } from '../srs/counts';
import { reviewCard, type SrsCard } from '../srs/schedule';
import type { SessionLine } from '../srs/session';
import { findChildByUci } from '../tree';
import type { Tree } from '../tree/types';
import {
  MIN_PUZZLES,
  SESSION_SIZE,
  dueCandidates,
  newCandidates,
  selectPuzzles,
  type PuzzleCandidate,
} from './select';

let n = 0;
const newId = () => `n${n++}`;
const NOW = new Date(2026, 9, 13, 10, 0);

function card(): SrsCard {
  return reviewCard(null, { ts: NOW, result: 'correct', hints: 0, timeMs: 3000 }).card;
}
function nodeAt(tree: Tree, ucis: string[]): string {
  let id = tree.rootId;
  for (const u of ucis) id = findChildByUci(tree, id, u)!.id;
  return id;
}

const cand = (tag: string, kind: PuzzleCandidate['kind']): PuzzleCandidate => ({
  line: [tag],
  side: 'w',
  kind,
});
const many = (prefix: string, count: number, kind: PuzzleCandidate['kind']) =>
  Array.from({ length: count }, (_, i) => cand(`${prefix}${i}`, kind));

describe('dueCandidates', () => {
  it('maps due and learning lines to due candidates', () => {
    const session: SessionLine[] = [
      { ucis: ['e2e4', 'e7e5'], kind: 'due', overdueMs: 5, side: 'w' },
      { ucis: ['d7d5', 'e4d5'], kind: 'learning', overdueMs: 0, side: 'b' },
    ];
    expect(dueCandidates(session)).toEqual([
      { line: ['e2e4', 'e7e5'], side: 'w', kind: 'due' },
      { line: ['d7d5', 'e4d5'], side: 'b', kind: 'due' },
    ]);
  });
});

describe('newCandidates', () => {
  const tree = treeFromPgn('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *', {
    userColor: 'w',
    newId,
  }).tree;

  it('returns the lines whose user moves have no card', () => {
    const cards: CardMap = new Map([[nodeAt(tree, ['e2e4', 'c7c5', 'g1f3']), card()]]);
    expect(newCandidates([{ tree, cards }])).toEqual([
      { line: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], side: 'w', kind: 'new' },
    ]);
  });

  it('uses the repertoire side', () => {
    const black = treeFromPgn('1. e4 e5 *', { userColor: 'b', newId }).tree;
    expect(newCandidates([{ tree: black, cards: new Map() }])).toEqual([
      { line: ['e2e4', 'e7e5'], side: 'b', kind: 'new' },
    ]);
  });

  it('skips a tree with a custom start', () => {
    const custom = treeFromPgn(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 *',
      { userColor: 'w', newId },
    ).tree;
    expect(newCandidates([{ tree: custom, cards: new Map() }])).toEqual([]);
  });
});

describe('selectPuzzles', () => {
  const due = many('d', 5, 'due');
  const fresh = many('n', 5, 'new');

  it('returns SESSION_SIZE puzzles mixing due and new ones', () => {
    const kinds = new Set<string>();
    for (const seed of 'abcdefgh') {
      const out = selectPuzzles([...due, ...fresh], { random: seededRandom(seed) });
      expect(out).toHaveLength(SESSION_SIZE);
      for (const c of out) kinds.add(c.kind);
    }
    expect(kinds).toEqual(new Set(['due', 'new']));
  });

  it('is deterministic for a seed', () => {
    const run = () => selectPuzzles([...due, ...fresh], { random: seededRandom('a') });
    expect(run()).toEqual(run());
  });

  it('honours a custom size', () => {
    expect(selectPuzzles([...due, ...fresh], { size: 2, random: seededRandom('a') })).toHaveLength(
      2,
    );
  });

  it('returns a line present as new and due once, as due', () => {
    const out = selectPuzzles([{ ...cand('x', 'new') }, cand('x', 'due')], {
      random: seededRandom('a'),
    });
    expect(out).toEqual([cand('x', 'due')]);
  });

  it('uses fill only to reach MIN_PUZZLES', () => {
    const fill = many('f', 3, 'fill');
    const short = selectPuzzles([...many('d', 2, 'due'), ...fill], { random: seededRandom('a') });
    expect(short).toHaveLength(MIN_PUZZLES);
    expect(short.filter((c) => c.kind === 'fill')).toHaveLength(1);
    const enough = selectPuzzles([...many('d', 3, 'due'), ...fill], { random: seededRandom('a') });
    expect(enough.map((c) => c.kind)).toEqual(['due', 'due', 'due']);
  });

  it('returns every candidate when there are fewer than size', () => {
    const out = selectPuzzles([cand('a', 'due'), cand('b', 'new'), cand('c', 'new')], {
      random: seededRandom('a'),
    });
    expect(out).toHaveLength(3);
  });

  it('returns nothing without candidates', () => {
    expect(selectPuzzles([], { random: seededRandom('a') })).toEqual([]);
  });
});
