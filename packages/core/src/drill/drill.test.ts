import { describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { treeFromPgn } from '../pgn';
import type { Tree } from '../tree';
import {
  type DrillState,
  drillProgress,
  enumerateLines,
  lineStatus,
  nextLine,
  repeatLine,
  requestHint,
  startLineDrill,
  submitMove,
} from './index';

// White repertoire: main 1.e4 e5 2.Nf3 Nc6 3.Bc4; 1...c5 2.Nf3; alternative user move 2.Nc3 Nf6 3.f4.
const WHITE = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. Nc3 Nf6 3. f4) 2... Nc6 3. Bc4 *';

function white(): Tree {
  return treeFromPgn(WHITE, { userColor: 'w', newId: counterIds() }).tree;
}

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const sanOf = (s: DrillState, id: string | null | undefined) =>
  id ? s.tree.nodes.get(id)!.san : null;

/** Plays the given UCI moves, returning the final state and all results. */
function play(state: DrillState, moves: string[]) {
  const results = [];
  for (const m of moves) {
    const r = submitMove(state, m);
    results.push(r);
    state = r.state;
  }
  return { state, results };
}

describe('enumerateLines', () => {
  it('follows every opponent branch and only the main user move', () => {
    const tree = white();
    const lines = enumerateLines(tree).map((l) => l.nodeIds.map((id) => tree.nodes.get(id)!.san));
    expect(lines).toEqual([
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
      ['e4', 'c5', 'Nf3'],
    ]);
  });

  it('works for black repertoires (opponent moves first)', () => {
    const tree = treeFromPgn('1. e4 c5 (1... e6) 2. Nf3 d6 (2... Nc6) 3. d4 (3. Bb5+ Bd7) *', {
      userColor: 'b',
      newId: counterIds(),
    }).tree;
    const lines = enumerateLines(tree).map((l) => l.nodeIds.map((id) => tree.nodes.get(id)!.san));
    expect(lines).toEqual([
      ['e4', 'c5', 'Nf3', 'd6', 'd4'],
      ['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Bd7'],
    ]);
  });
});

describe('startLineDrill', () => {
  it('starts at the root waiting for the main user move', () => {
    const s = startLineDrill({ tree: white() }, { clock: fakeClock().now });
    expect(s.phase).toBe('user');
    expect(sanOf(s, s.expectedId)).toBe('e4');
    expect(s.currentId).toBe(s.tree.rootId);
    expect(s.queue).toHaveLength(2);
  });

  it('plays the opponent first move automatically for black', () => {
    const tree = treeFromPgn('1. e4 c5 2. Nf3 d6 *', { userColor: 'b', newId: counterIds() }).tree;
    const s = startLineDrill({ tree }, {});
    expect(sanOf(s, s.currentId)).toBe('e4');
    expect(s.lastOpponentMove?.san).toBe('e4');
    expect(sanOf(s, s.expectedId)).toBe('c5');
  });

  it('is done immediately for an empty tree', () => {
    const tree = treeFromPgn('*', { userColor: 'w', newId: counterIds() }).tree;
    expect(startLineDrill({ tree }, {}).phase).toBe('done');
  });
});

describe('submitMove', () => {
  it('accepts correct moves, auto-plays the reply and records clean attempts', () => {
    const clock = fakeClock();
    let s = startLineDrill({ tree: white() }, { clock: clock.now });
    clock.advance(2500);
    const r1 = submitMove(s, 'e2e4');
    expect(r1.outcome).toBe('correct');
    expect(r1.attempt).toMatchObject({
      result: 'correct',
      playedUci: 'e2e4',
      hints: 0,
      timeMs: 2500,
    });
    expect(sanOf(r1.state, r1.attempt!.nodeId)).toBe('e4');
    expect(r1.opponentMove).toMatchObject({ san: 'e5', uci: 'e7e5' });
    expect(sanOf(r1.state, r1.state.expectedId)).toBe('Nf3');
    s = r1.state;
    clock.advance(700);
    const { state, results } = play(s, ['g1f3', 'f1c4']);
    expect(results[0]!.attempt!.timeMs).toBe(700);
    expect(results.map((r) => r.outcome)).toEqual(['correct', 'correct']);
    expect(state.phase).toBe('line-complete');
    expect(results[1]!.pass).toEqual({ lineId: s.line.id, clean: true, diverged: false });
    expect(state.passes).toHaveLength(1);
  });

  it('on a wrong move reveals the right one and requires replaying it', () => {
    let s = startLineDrill({ tree: white() }, {});
    const w1 = submitMove(s, 'd2d4');
    expect(w1.outcome).toBe('wrong');
    expect(w1.attempt).toBeUndefined();
    expect(w1.state.phase).toBe('retry');
    expect(w1.state.reveal).toBe('e2e4');
    const w2 = submitMove(w1.state, 'c2c4');
    expect(w2.outcome).toBe('wrong');
    const ok = submitMove(w2.state, 'e2e4');
    expect(ok.outcome).toBe('correct');
    expect(ok.attempt).toMatchObject({ result: 'wrong', playedUci: 'd2d4' });
    expect(ok.state.reveal).toBeNull();
    s = play(ok.state, ['g1f3', 'f1c4']).state;
    expect(s.passes.at(-1)).toMatchObject({ clean: false });
  });

  it('accepts a sibling user move as an alternative and continues in its subtree', () => {
    const s = startLineDrill({ tree: white() }, {});
    const r = play(s, ['e2e4', 'b1c3']);
    expect(r.results[1]!.outcome).toBe('alternative');
    expect(r.results[1]!.attempt).toMatchObject({ result: 'correct', playedUci: 'b1c3' });
    expect(sanOf(r.state, r.results[1]!.attempt!.nodeId)).toBe('Nc3');
    expect(r.results[1]!.opponentMove?.san).toBe('Nf6');
    expect(sanOf(r.state, r.state.expectedId)).toBe('f4');
    const end = submitMove(r.state, 'f2f4');
    expect(end.pass).toEqual({ lineId: s.line.id, clean: true, diverged: true });
  });

  it('throws when no move is expected', () => {
    let s = startLineDrill({ tree: white() }, {});
    s = play(s, ['e2e4', 'g1f3', 'f1c4']).state;
    expect(() => submitMove(s, 'e1e2')).toThrow(/line-complete/);
  });
});

describe('requestHint', () => {
  it('gives piece, then origin square, then the move', () => {
    let s = startLineDrill({ tree: white() }, {});
    const h1 = requestHint(s);
    expect(h1.hint).toEqual({ level: 1, piece: 'p' });
    const h2 = requestHint(h1.state);
    expect(h2.hint).toEqual({ level: 2, piece: 'p', from: 'e2' });
    const h3 = requestHint(h2.state);
    expect(h3.hint).toEqual({ level: 3, piece: 'p', from: 'e2', uci: 'e2e4' });
    expect(requestHint(h3.state).hint.level).toBe(3);
    s = h3.state;
    const r = submitMove(s, 'e2e4');
    expect(r.attempt).toMatchObject({ result: 'hint', hints: 3 });
    const end = play(r.state, ['g1f3', 'f1c4']);
    expect(end.state.passes.at(-1)!.clean).toBe(false);
  });

  it('a wrong move after a hint is recorded as wrong', () => {
    const s = requestHint(startLineDrill({ tree: white() }, {})).state;
    const r = play(s, ['d2d4', 'e2e4']);
    expect(r.results[1]!.attempt).toMatchObject({ result: 'wrong', hints: 1, playedUci: 'd2d4' });
  });
});

describe('line cleanliness and ordering', () => {
  it('a line is clean after N consecutive clean passes (default 3)', () => {
    let s = startLineDrill({ tree: white() }, {});
    const lineId = s.line.id;
    for (let i = 0; i < 3; i++) {
      expect(lineStatus(s.passes, lineId).clean).toBe(false);
      s = play(s, ['e2e4', 'g1f3', 'f1c4']).state;
      s = repeatLine(s);
    }
    expect(lineStatus(s.passes, lineId)).toEqual({ cleanStreak: 3, clean: true });
    expect(drillProgress(s)).toEqual({ clean: 1, total: 2 });
  });

  it('honours a custom threshold; errors reset the streak; diverged clean passes do not count', () => {
    const id = 'L';
    const p = (clean: boolean, diverged = false) => ({ lineId: id, clean, diverged });
    expect(lineStatus([p(true), p(true)], id, 2).clean).toBe(true);
    expect(lineStatus([p(true), p(false), p(true)], id, 2)).toEqual({
      cleanStreak: 1,
      clean: false,
    });
    expect(lineStatus([p(true), p(true, true)], id, 2)).toEqual({ cleanStreak: 1, clean: false });
    expect(lineStatus([p(true), p(false, true)], id, 2).cleanStreak).toBe(0);
  });

  it('puts lines that are not clean yet first, in tree order', () => {
    const tree = white();
    const [mainLine, sicilian] = enumerateLines(tree);
    const passes = [1, 2, 3].map(() => ({ lineId: mainLine!.id, clean: true, diverged: false }));
    const s = startLineDrill({ tree, passes }, {});
    expect(s.queue).toEqual([sicilian!.id, mainLine!.id]);
    expect(s.line.id).toBe(sicilian!.id);
    expect(drillProgress(s)).toEqual({ clean: 1, total: 2 });
  });

  it('shuffles within each group with an injected rng, deterministically', () => {
    const tree = treeFromPgn('1. e4 e5 (1... c5) (1... e6) (1... c6) *', {
      userColor: 'w',
      newId: counterIds(),
    }).tree;
    const ids = enumerateLines(tree).map((l) => l.id);
    const plain = startLineDrill({ tree }, {});
    expect(plain.queue).toEqual(ids);
    const seq = [0.9, 0.1, 0.5];
    const rng = () => seq.shift() ?? 0;
    const a = startLineDrill({ tree }, { shuffle: true, rng });
    expect([...a.queue].sort()).toEqual([...ids].sort());
    expect(a.queue).not.toEqual(ids);
    const seq2 = [0.9, 0.1, 0.5];
    const b = startLineDrill({ tree }, { shuffle: true, rng: () => seq2.shift() ?? 0 });
    expect(b.queue).toEqual(a.queue);
  });

  it('can start from a chosen line', () => {
    const tree = white();
    const [, sicilian] = enumerateLines(tree);
    expect(startLineDrill({ tree }, { lineId: sicilian!.id }).line.id).toBe(sicilian!.id);
  });

  it('can be limited to the lines through a node', () => {
    const tree = white();
    const [mainLine, sicilian] = enumerateLines(tree);
    const c5 = sicilian!.nodeIds[1]!; // 1...c5
    const s = startLineDrill({ tree }, { throughNodeId: c5 });
    expect(s.queue).toEqual([sicilian!.id]);
    expect(drillProgress(s).total).toBe(1);
    const all = startLineDrill({ tree }, { throughNodeId: tree.rootId });
    expect(all.queue).toEqual([mainLine!.id, sicilian!.id]);
  });

  it('nextLine walks the queue and ends with done', () => {
    let s = startLineDrill({ tree: white() }, {});
    s = nextLine(s);
    expect(sanOf(s, s.line.nodeIds.at(-1))).toBe('Nf3');
    expect(s.phase).toBe('user');
    s = nextLine(s);
    expect(s.phase).toBe('done');
  });

  it('repeatLine restarts the current line from the root', () => {
    let s = startLineDrill({ tree: white() }, {});
    s = play(s, ['e2e4']).state;
    s = repeatLine(s);
    expect(s.currentId).toBe(s.tree.rootId);
    expect(s.passes).toHaveLength(0);
    expect(sanOf(s, s.expectedId)).toBe('e4');
  });
});
