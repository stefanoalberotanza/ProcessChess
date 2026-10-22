export const HEARTS = 5;

export interface TodayRun {
  hearts: number;
  combo: number;
  bestCombo: number;
  puzzle: number; // 0-based index of the puzzle in play
  total: number;
  clean: number;
  hinted: number;
  errored: number; // finished puzzles by outcome
  status: 'playing' | 'complete' | 'stopped';
}

export function startRun(total: number): TodayRun {
  return {
    hearts: HEARTS,
    combo: 0,
    bestCombo: 0,
    puzzle: 0,
    total,
    clean: 0,
    hinted: 0,
    errored: 0,
    status: 'playing',
  };
}

/** A wrong try. `firstTry`: the first wrong try on this move (costs a heart and breaks the combo). */
export function moveWrong(run: TodayRun, firstTry: boolean): TodayRun {
  if (run.status !== 'playing' || !firstTry) return run;
  const hearts = run.hearts - 1;
  return { ...run, hearts, combo: 0, status: hearts <= 0 ? 'stopped' : 'playing' };
}

/** The right move was played; `result` is the attempt result (`'correct'` extends the combo, `'hint'` leaves it, `'wrong'` leaves it at 0). */
export function moveCorrect(run: TodayRun, result: 'correct' | 'hint' | 'wrong'): TodayRun {
  if (run.status !== 'playing' || result === 'hint') return run;
  if (result === 'wrong') return { ...run, combo: 0 };
  const combo = run.combo + 1;
  return { ...run, combo, bestCombo: Math.max(run.bestCombo, combo) };
}

export function puzzleDone(run: TodayRun, summary: { errors: number; hints: number }): TodayRun {
  if (run.status !== 'playing') return run;
  const puzzle = run.puzzle + 1;
  return {
    ...run,
    puzzle,
    errored: run.errored + (summary.errors > 0 ? 1 : 0),
    hinted: run.hinted + (summary.errors === 0 && summary.hints > 0 ? 1 : 0),
    clean: run.clean + (summary.errors === 0 && summary.hints === 0 ? 1 : 0),
    status: puzzle >= run.total ? 'complete' : 'playing',
  };
}
