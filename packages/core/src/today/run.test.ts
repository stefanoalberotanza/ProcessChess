import { describe, expect, it } from 'vitest';
import { HEARTS, moveCorrect, moveWrong, puzzleDone, startRun } from './run';

describe('today run', () => {
  it('starts with full hearts and no combo', () => {
    expect(startRun(4)).toEqual({
      hearts: HEARTS,
      combo: 0,
      bestCombo: 0,
      puzzle: 0,
      total: 4,
      clean: 0,
      hinted: 0,
      errored: 0,
      status: 'playing',
    });
    expect(HEARTS).toBe(5);
  });

  it('a first wrong try costs a heart and breaks the combo', () => {
    let run = startRun(4);
    run = moveCorrect(run, 'correct');
    run = moveCorrect(run, 'correct');
    run = moveWrong(run, true);
    expect(run.hearts).toBe(HEARTS - 1);
    expect(run.combo).toBe(0);
    expect(run.bestCombo).toBe(2);
  });

  it('further wrong tries on the same move are free', () => {
    const run = startRun(4);
    expect(moveWrong(run, false)).toEqual(run);
  });

  it('five first-try wrongs stop the run', () => {
    let run = startRun(4);
    for (let i = 0; i < HEARTS; i++) run = moveWrong(run, true);
    expect(run.hearts).toBe(0);
    expect(run.status).toBe('stopped');
  });

  it('correct moves extend the combo and track the best', () => {
    let run = startRun(4);
    for (let i = 0; i < 3; i++) run = moveCorrect(run, 'correct');
    expect(run.combo).toBe(3);
    expect(run.bestCombo).toBe(3);
  });

  it('a hint leaves combo and best unchanged', () => {
    let run = startRun(4);
    run = moveCorrect(run, 'correct');
    run = moveCorrect(run, 'hint');
    expect(run.combo).toBe(1);
    expect(run.bestCombo).toBe(1);
    expect(run.hearts).toBe(HEARTS);
  });

  it('a wrong result leaves the combo at 0', () => {
    let run = startRun(4);
    run = moveWrong(run, true);
    run = moveCorrect(run, 'wrong');
    expect(run.combo).toBe(0);
    expect(run.hearts).toBe(HEARTS - 1);
  });

  it('puzzleDone classifies errored, then hinted, else clean, and advances', () => {
    let run = startRun(4);
    run = puzzleDone(run, { errors: 1, hints: 2 });
    expect(run.errored).toBe(1);
    run = puzzleDone(run, { errors: 0, hints: 1 });
    expect(run.hinted).toBe(1);
    run = puzzleDone(run, { errors: 0, hints: 0 });
    expect(run.clean).toBe(1);
    expect(run.puzzle).toBe(3);
    expect(run.status).toBe('playing');
  });

  it('completes after the last puzzle', () => {
    let run = startRun(2);
    run = puzzleDone(run, { errors: 0, hints: 0 });
    run = puzzleDone(run, { errors: 0, hints: 0 });
    expect(run.status).toBe('complete');
    expect(run.puzzle).toBe(2);
  });

  it('losing the last heart on the last move of the last puzzle is stopped, not complete', () => {
    let run = startRun(1);
    for (let i = 0; i < HEARTS - 1; i++) run = moveWrong(run, true);
    run = moveWrong(run, true);
    run = moveCorrect(run, 'wrong');
    run = puzzleDone(run, { errors: 1, hints: 0 });
    expect(run.status).toBe('stopped');
  });

  it('a stopped run ignores every later call', () => {
    let run = startRun(3);
    for (let i = 0; i < HEARTS; i++) run = moveWrong(run, true);
    const stopped = run;
    expect(moveCorrect(stopped, 'correct')).toEqual(stopped);
    expect(moveWrong(stopped, true)).toEqual(stopped);
    expect(puzzleDone(stopped, { errors: 0, hints: 0 })).toEqual(stopped);
  });
});
