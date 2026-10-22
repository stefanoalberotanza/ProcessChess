import { findChildByUci, startRecall, submitRecall, treeFromPgn } from '@processchess/core';
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

const SLOT = 900_000;
const BASE = 1_700_000_100_000; // a multiple of SLOT
const LINE = ['e2e4', 'e7e5'];

async function fsrsAttempt(ts: number) {
  const edit = treeFromPgn('1. e4 e5 *', { userColor: 'w', newId });
  const collection = await storage.createCollectionFromTree(
    { name: 'White', kind: 'opening', evalMode: 'exact' },
    edit,
  );
  const e4 = findChildByUci(edit.tree, edit.tree.rootId, 'e2e4')!.id;
  const session = await storage.startSession(collection.id, edit.tree.rootId);
  await storage.recordAttempt({
    sessionId: session.id,
    nodeId: e4,
    result: 'correct',
    hints: 0,
    timeMs: 1000,
    ts: new Date(ts),
  });
}

async function labAttempt(ts: number) {
  const runId = newId();
  const r = submitRecall(startRecall(LINE, { clock: () => ts }), 'e2e4');
  await storage.recordLabAttempt({ runId, ...r.attempt!, ts: new Date(ts) });
}

describe('practiceTimes', () => {
  it('returns the distinct 15-minute slots of both logs, ascending, from sinceMs', async () => {
    expect(BASE % SLOT).toBe(0);
    await labAttempt(BASE - 1); // before sinceMs
    await fsrsAttempt(BASE + 5 * 60_000); // slot 0
    await labAttempt(BASE + 14 * 60_000); // slot 0 again
    await labAttempt(BASE + 3 * SLOT + 1); // slot 3
    expect(await storage.practiceTimes(BASE)).toEqual([BASE, BASE + 3 * SLOT]);
  });

  it('is empty without attempts', async () => {
    expect(await storage.practiceTimes(0)).toEqual([]);
  });
});
