import { Chess, type Square } from 'chess.js';
import type { AttemptResult, Hint } from '../drill/drill';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import { INITIAL_FEN, playMove } from '../position';

/**
 * Recall session (opening lab, ADR 011): the user replays a whole line from memory, both sides.
 * A wrong move reveals the right one, which must then be played; hints are graded like the
 * drill's.
 */
export interface RecallState {
  readonly ucis: readonly string[];
  readonly sans: readonly string[];
  /** fens[i] = board before ply i+1; fens[length] = final board. */
  readonly fens: readonly string[];
  /** Moves already played (index of the next move to play). */
  readonly ply: number;
  readonly phase: 'play' | 'retry' | 'done';
  readonly reveal: string | null;
  readonly hintLevel: 0 | 1 | 2 | 3;
  readonly firstWrongUci: string | null;
  readonly shownAt: number;
  readonly errors: number;
  readonly hinted: number;
  readonly totalMs: number;
  readonly clock: () => number;
}

/** One move of a recall, keyed by the graph edge it exercises (position before + move). */
export interface RecallAttempt {
  /** 1-based ply in the line. */
  ply: number;
  epd: string;
  uci: string;
  result: AttemptResult;
  /** The first wrong move, or the move played. */
  playedUci: string;
  hints: number;
  timeMs: number;
}

export interface RecallRun {
  plies: number;
  /** Moves with at least one mistake. */
  errors: number;
  /** Moves played with hints (and no mistake). */
  hints: number;
  clean: boolean;
  timeMs: number;
}

export interface RecallResult {
  state: RecallState;
  outcome: 'correct' | 'wrong';
  attempt?: RecallAttempt;
  run?: RecallRun;
}

export function startRecall(
  ucis: readonly string[],
  opts: { startFen?: string; clock?: () => number } = {},
): RecallState {
  const fens = [opts.startFen ?? INITIAL_FEN];
  const sans: string[] = [];
  ucis.forEach((u, i) => {
    const r = playMove(fens[i]!, u);
    if (!r) throw new IllegalMoveError(u, i + 1);
    fens.push(r.fen);
    sans.push(r.san);
  });
  const clock = opts.clock ?? Date.now;
  return {
    ucis: [...ucis],
    sans,
    fens,
    ply: 0,
    phase: ucis.length ? 'play' : 'done',
    reveal: null,
    hintLevel: 0,
    firstWrongUci: null,
    shownAt: clock(),
    errors: 0,
    hinted: 0,
    totalMs: 0,
    clock,
  };
}

export function restartRecall(state: RecallState): RecallState {
  return startRecall(state.ucis, { startFen: state.fens[0]!, clock: state.clock });
}

export function submitRecall(state: RecallState, uci: string): RecallResult {
  if (state.phase === 'done') throw new Error('Recall is done');
  const expected = state.ucis[state.ply]!;
  const move = uci.toLowerCase();
  if (move !== expected) {
    return {
      outcome: 'wrong',
      state: {
        ...state,
        phase: 'retry',
        reveal: expected,
        firstWrongUci: state.firstWrongUci ?? move,
      },
    };
  }
  const timeMs = state.clock() - state.shownAt;
  const result: AttemptResult = state.firstWrongUci
    ? 'wrong'
    : state.hintLevel > 0
      ? 'hint'
      : 'correct';
  const attempt: RecallAttempt = {
    ply: state.ply + 1,
    epd: toEpd(state.fens[state.ply]!),
    uci: expected,
    result,
    playedUci: state.firstWrongUci ?? move,
    hints: state.hintLevel,
    timeMs,
  };
  const ply = state.ply + 1;
  const done = ply >= state.ucis.length;
  const next: RecallState = {
    ...state,
    ply,
    phase: done ? 'done' : 'play',
    reveal: null,
    hintLevel: 0,
    firstWrongUci: null,
    shownAt: state.clock(),
    errors: state.errors + (result === 'wrong' ? 1 : 0),
    hinted: state.hinted + (result === 'hint' ? 1 : 0),
    totalMs: state.totalMs + timeMs,
  };
  const run: RecallRun | undefined = done
    ? {
        plies: state.ucis.length,
        errors: next.errors,
        hints: next.hinted,
        clean: next.errors === 0 && next.hinted === 0,
        timeMs: next.totalMs,
      }
    : undefined;
  return { state: next, outcome: 'correct', attempt, ...(run ? { run } : {}) };
}

export function recallHint(state: RecallState): { state: RecallState; hint: Hint } {
  if (state.phase === 'done') throw new Error('Recall is done');
  const expected = state.ucis[state.ply]!;
  const from = expected.slice(0, 2);
  const piece = new Chess(state.fens[state.ply]!).get(from as Square)!.type;
  const level = Math.min(3, state.hintLevel + 1) as 1 | 2 | 3;
  const hint: Hint =
    level === 1
      ? { level, piece }
      : level === 2
        ? { level, piece, from }
        : { level, piece, from, uci: expected };
  return { state: { ...state, hintLevel: level }, hint };
}
