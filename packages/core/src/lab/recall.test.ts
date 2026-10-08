import { describe, expect, it } from 'vitest';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import { INITIAL_FEN, playLine } from '../position';
import { type RecallState, recallHint, restartRecall, startRecall, submitRecall } from './recall';

const ITALIAN = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'];

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function playAll(s: RecallState, moves: string[]) {
  const results = [];
  for (const m of moves) {
    const r = submitRecall(s, m);
    results.push(r);
    s = r.state;
  }
  return { state: s, results };
}

describe('recall session', () => {
  it('asks every move of the line, both sides, and logs one attempt per move', () => {
    const clock = fakeClock();
    const s = startRecall(ITALIAN, { clock: clock.now });
    expect(s.phase).toBe('play');
    expect(s.ply).toBe(0);
    expect(s.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6']);
    clock.advance(1500);
    const first = submitRecall(s, 'e2e4');
    expect(first.outcome).toBe('correct');
    expect(first.attempt).toEqual({
      ply: 1,
      epd: toEpd(INITIAL_FEN),
      uci: 'e2e4',
      result: 'correct',
      playedUci: 'e2e4',
      hints: 0,
      timeMs: 1500,
    });
    const { state, results } = playAll(first.state, ITALIAN.slice(1));
    expect(results.every((r) => r.outcome === 'correct')).toBe(true);
    expect(state.phase).toBe('done');
    expect(results.at(-1)!.run).toEqual({
      plies: 8,
      errors: 0,
      hints: 0,
      clean: true,
      timeMs: 1500,
    });
    // every attempt is keyed by the graph edge: position before + move
    results.forEach((r, i) => {
      expect(r.attempt!.epd).toBe(toEpd(playLine(INITIAL_FEN, ITALIAN.slice(0, i + 1))!.fen));
      expect(r.attempt!.uci).toBe(ITALIAN[i + 1]);
    });
  });

  it('on a wrong move reveals the right one and records the first mistake', () => {
    let s = startRecall(ITALIAN);
    s = submitRecall(s, 'e2e4').state;
    const w = submitRecall(s, 'c7c5');
    expect(w.outcome).toBe('wrong');
    expect(w.attempt).toBeUndefined();
    expect(w.state.phase).toBe('retry');
    expect(w.state.reveal).toBe('e7e5');
    const w2 = submitRecall(w.state, 'e7e6');
    const ok = submitRecall(w2.state, 'e7e5');
    expect(ok.outcome).toBe('correct');
    expect(ok.attempt).toMatchObject({ ply: 2, result: 'wrong', playedUci: 'c7c5' });
    const end = playAll(ok.state, ITALIAN.slice(2));
    expect(end.results.at(-1)!.run).toMatchObject({ errors: 1, clean: false });
  });

  it('gives graded hints that make the move a hint result', () => {
    let s = startRecall(ITALIAN);
    const h1 = recallHint(s);
    expect(h1.hint).toEqual({ level: 1, piece: 'p' });
    const h2 = recallHint(h1.state);
    expect(h2.hint).toEqual({ level: 2, piece: 'p', from: 'e2' });
    const h3 = recallHint(h2.state);
    expect(h3.hint).toEqual({ level: 3, piece: 'p', from: 'e2', uci: 'e2e4' });
    s = h3.state;
    const r = submitRecall(s, 'e2e4');
    expect(r.attempt).toMatchObject({ result: 'hint', hints: 3 });
    const end = playAll(r.state, ITALIAN.slice(1));
    expect(end.results.at(-1)!.run).toMatchObject({ hints: 1, errors: 0, clean: false });
  });

  it('restarts the same line', () => {
    let s = startRecall(ITALIAN);
    s = playAll(s, ITALIAN.slice(0, 3)).state;
    s = restartRecall(s);
    expect(s.ply).toBe(0);
    expect(s.phase).toBe('play');
  });

  it('rejects an illegal line and moves after the end', () => {
    expect(() => startRecall(['e2e5'])).toThrow(IllegalMoveError);
    const done = playAll(startRecall(['e2e4']), ['e2e4']).state;
    expect(() => submitRecall(done, 'e7e5')).toThrow(/done/);
  });
});
