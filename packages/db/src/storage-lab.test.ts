import { startRecall, submitRecall } from '@processchess/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from './adapters/memory';
import { newId } from './sqlite-storage';
import type { SqliteStorage } from './sqlite-storage';

let storage: SqliteStorage;
beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.migrate();
});
afterEach(() => storage.close());

const ITALIAN = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'];
const SICILIAN = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'];

/** Plays a recall (wrong moves as {wrong, then}) and stores it like the UI does. */
async function run(line: string[], moves: (string | { wrong: string })[], t0: number) {
  const runId = newId();
  let s = startRecall(line, { clock: () => t0 });
  let i = 0;
  for (const m of moves) {
    const r = submitRecall(s, typeof m === 'string' ? m : m.wrong);
    s = r.state;
    if (r.attempt) {
      await storage.recordLabAttempt({ runId, ...r.attempt, ts: new Date(t0 + i++) });
    }
    if (r.run) {
      await storage.recordLabRun({
        id: runId,
        line,
        eco: 'C50',
        name: 'Italian Game',
        ...r.run,
        ts: new Date(t0 + 100),
      });
    }
  }
}

describe('opening lab storage', () => {
  it('summarises runs per line: count, clean streak, last run', async () => {
    await run(ITALIAN, ITALIAN, 1000);
    await run(ITALIAN, [ITALIAN[0]!, { wrong: 'c7c5' }, ...ITALIAN.slice(1)], 2000);
    await run(ITALIAN, ITALIAN, 3000);
    await run(ITALIAN, ITALIAN, 4000);
    const summaries = await storage.labRunSummaries();
    expect(summaries.get(ITALIAN.join(' '))).toEqual({
      runs: 4,
      cleanStreak: 2,
      lastAt: new Date(4100),
      lastClean: true,
    });
    expect(summaries.has(SICILIAN.join(' '))).toBe(false);
    const runs = await storage.labRuns(ITALIAN);
    expect(runs.map((r) => r.clean)).toEqual([true, false, true, true]);
    expect(runs[1]).toMatchObject({ errors: 1, plies: 8, line: ITALIAN.join(' ') });
  });

  it('keeps the history per graph edge, shared by the lines through it', async () => {
    await run(ITALIAN, ITALIAN, 1000);
    await run(SICILIAN, [SICILIAN[0]!, { wrong: 'e7e5' }, ...SICILIAN.slice(1)], 2000);
    const stats = await storage.labEdgeStats();
    // 1.e4 from the initial position was played in both lines
    const e4 = stats.get(`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - e2e4`)!;
    expect(e4).toEqual({
      total: 2,
      firstTry: 2,
      recent: ['correct', 'correct'],
      lastWrongUci: null,
    });
    const c5 = [...stats.entries()].find(([k]) => k.endsWith(' c7c5'))![1];
    expect(c5).toEqual({ total: 1, firstTry: 0, recent: ['wrong'], lastWrongUci: 'e7e5' });
  });

  it('records the moves of an unfinished run', async () => {
    await run(ITALIAN, ITALIAN.slice(0, 3), 1000);
    expect((await storage.labRunSummaries()).size).toBe(0);
    expect((await storage.labEdgeStats()).size).toBe(3);
  });
});
