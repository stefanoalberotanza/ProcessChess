import { describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { treeFromPgn } from '../pgn';
import type { Tree } from '../tree';
import {
  type DrillState,
  nextLine,
  repeatLine,
  reviewProgress,
  startReviewDrill,
  submitMove,
} from './index';

// Lines: e4 e5 Nf3 Nc6 Bc4 | e4 c5 Nf3; alternative user move 2.Nc3 Nf6 3.f4.
const WHITE = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. Nc3 Nf6 3. f4) 2... Nc6 3. Bc4 *';

function white(): Tree {
  return treeFromPgn(WHITE, { userColor: 'w', newId: counterIds() }).tree;
}

function at(tree: Tree, ...moves: string[]): string {
  let id = tree.rootId;
  for (const san of moves) {
    id = tree.children.get(id)!.find((c) => tree.nodes.get(c)!.san === san)!;
  }
  return id;
}

const sanOf = (s: DrillState, id: string | null | undefined) =>
  id ? s.tree.nodes.get(id)!.san : null;

describe('startReviewDrill', () => {
  it('auto-plays the moves before a due move, user moves included', () => {
    const tree = white();
    const bc4 = at(tree, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4');
    const s = startReviewDrill({ tree }, [bc4]);
    expect(s.queue).toHaveLength(1);
    expect(s.phase).toBe('user');
    expect(s.expectedId).toBe(bc4);
    expect(s.lastAutoMoves.map((m) => [m.san, m.isUserMove])).toEqual([
      ['e4', true],
      ['e5', false],
      ['Nf3', true],
      ['Nc6', false],
    ]);
    expect(s.lastOpponentMove?.san).toBe('Nc6');

    const r = submitMove(s, 'f1c4');
    expect(r.outcome).toBe('correct');
    expect(r.attempt).toMatchObject({ nodeId: bc4, result: 'correct' });
    expect(r.state.phase).toBe('line-complete');
    expect(r.pass).toBeUndefined();
    expect(r.state.passes).toEqual([]);
    expect(nextLine(r.state).phase).toBe('done');
  });

  it('asks only due moves and plays the rest of the line automatically', () => {
    const tree = white();
    const e4 = at(tree, 'e4');
    const nf3c5 = at(tree, 'e4', 'c5', 'Nf3');
    let s = startReviewDrill({ tree }, [nf3c5, e4]);
    expect(s.queue).toHaveLength(2);
    expect(s.expectedId).toBe(e4);
    expect(s.lastAutoMoves).toEqual([]);

    const r = submitMove(s, 'e2e4');
    expect(r.autoMoves?.map((m) => m.san)).toEqual(['e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(r.state.phase).toBe('line-complete');

    s = nextLine(r.state);
    expect(sanOf(s, s.currentId)).toBe('c5');
    expect(s.lastAutoMoves.map((m) => m.san)).toEqual(['e4', 'c5']);
    expect(s.expectedId).toBe(nf3c5);
    const r2 = submitMove(s, 'g1f3');
    expect(r2.attempt?.nodeId).toBe(nf3c5);
    expect(nextLine(r2.state).phase).toBe('done');
  });

  it('asks a move shared by several lines once and skips lines without due moves', () => {
    const tree = white();
    const s = startReviewDrill({ tree }, [at(tree, 'e4')]);
    expect(s.queue).toEqual([at(tree, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4')]);
  });

  it('ignores due ids that are not scheduled moves and is done without due moves', () => {
    const tree = white();
    expect(startReviewDrill({ tree }, []).phase).toBe('done');
    expect(startReviewDrill({ tree }, [at(tree, 'e4', 'e5', 'Nc3')]).phase).toBe('done');
  });

  it('a wrong answer is revealed, replayed and recorded as wrong', () => {
    const tree = white();
    const nf3 = at(tree, 'e4', 'e5', 'Nf3');
    let s = startReviewDrill({ tree }, [nf3]);
    const w = submitMove(s, 'd2d4');
    expect(w.outcome).toBe('wrong');
    expect(w.state.reveal).toBe('g1f3');
    s = w.state;
    const r = submitMove(s, 'g1f3');
    expect(r.attempt).toMatchObject({ nodeId: nf3, result: 'wrong', playedUci: 'd2d4' });
    expect(r.autoMoves?.map((m) => m.san)).toEqual(['Nc6', 'Bc4']);
  });

  it('after an alternative the rest of its subtree is played automatically', () => {
    const tree = white();
    const s = startReviewDrill({ tree }, [at(tree, 'e4', 'e5', 'Nf3')]);
    const r = submitMove(s, 'b1c3');
    expect(r.outcome).toBe('alternative');
    expect(r.autoMoves?.map((m) => m.san)).toEqual(['Nf6', 'f4']);
    expect(r.state.phase).toBe('line-complete');
  });

  it('works for black repertoires', () => {
    const tree = treeFromPgn('1. e4 c5 (1... e6) 2. Nf3 d6 (2... Nc6) 3. d4 (3. Bb5+ Bd7) *', {
      userColor: 'b',
      newId: counterIds(),
    }).tree;
    const bd7 = at(tree, 'e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Bd7');
    const s = startReviewDrill({ tree }, [bd7]);
    expect(s.lastAutoMoves.map((m) => m.san)).toEqual(['e4', 'c5', 'Nf3', 'd6', 'Bb5+']);
    expect(submitMove(s, 'c8d7').outcome).toBe('correct');
  });

  it('repeatLine asks the same moves again', () => {
    const tree = white();
    const e4 = at(tree, 'e4');
    const s = submitMove(startReviewDrill({ tree }, [e4]), 'e2e4').state;
    const again = repeatLine(s);
    expect(again.phase).toBe('user');
    expect(again.expectedId).toBe(e4);
  });
});

describe('reviewProgress', () => {
  it('counts the due moves answered so far', () => {
    const tree = white();
    let s = startReviewDrill({ tree }, [at(tree, 'e4'), at(tree, 'e4', 'c5', 'Nf3')]);
    expect(reviewProgress(s)).toEqual({ done: 0, total: 2 });
    s = submitMove(s, 'e2e4').state;
    expect(reviewProgress(s)).toEqual({ done: 1, total: 2 });
    s = nextLine(s);
    expect(reviewProgress(s)).toEqual({ done: 1, total: 2 });
    s = submitMove(s, 'g1f3').state;
    expect(reviewProgress(s)).toEqual({ done: 2, total: 2 });
    expect(reviewProgress(nextLine(s))).toEqual({ done: 2, total: 2 });
  });
});
