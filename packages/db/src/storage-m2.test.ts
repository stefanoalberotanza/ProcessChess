import {
  CardState,
  type ReviewInput,
  dayKey,
  findChildByUci,
  replayCard,
  reviewCard,
  treeFromPgn,
} from '@processchess/core';
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

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date(2026, 9, 8, 10, 0).getTime();

async function setup(kind: 'opening' | 'game' = 'opening') {
  const edit = treeFromPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 *', { userColor: 'w', newId });
  const collection = await storage.createCollectionFromTree(
    { name: 'White', kind, evalMode: 'exact' },
    edit,
  );
  const tree = edit.tree;
  const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!.id;
  const nf3 = findChildByUci(tree, findChildByUci(tree, e4, 'e7e5')!.id, 'g1f3')!.id;
  const session = await storage.startSession(collection.id, tree.rootId);
  const record = (nodeId: string, ts: number, r: Omit<ReviewInput, 'ts'>) =>
    storage.recordAttempt({ sessionId: session.id, nodeId, ts: new Date(ts), ...r });
  return { collection, e4, nf3, record };
}

const correct = { result: 'correct', hints: 0, timeMs: 3000 } as const;
const fast = { result: 'correct', hints: 0, timeMs: 900 } as const;
const wrong = { result: 'wrong', hints: 0, timeMs: 4000 } as const;
const hinted = { result: 'hint', hints: 2, timeMs: 6000 } as const;

describe('cards', () => {
  it('recordAttempt creates the card of the move with FSRS', async () => {
    const { e4, record, collection } = await setup();
    const { attempt, card } = await record(e4, T0, correct);
    expect(attempt.nodeId).toBe(e4);
    expect(card).toEqual(reviewCard(null, { ts: new Date(T0), ...correct }).card);
    expect((await storage.listCards(collection.id)).get(e4)).toEqual(card);
  });

  it('later attempts update the same card', async () => {
    const { e4, record, collection } = await setup();
    await record(e4, T0, correct);
    const { card } = await record(e4, T0 + 10 * MIN, wrong);
    expect(card.reps).toBe(2);
    expect(card).toEqual(
      replayCard([
        { ts: new Date(T0), ...correct },
        { ts: new Date(T0 + 10 * MIN), ...wrong },
      ]),
    );
    const cards = await storage.listCards(collection.id);
    expect(cards.size).toBe(1);
    expect(cards.get(e4)!.state).not.toBe(CardState.New);
  });

  it('listCards is per collection', async () => {
    const a = await setup();
    const b = await setup();
    await a.record(a.e4, T0, correct);
    expect((await storage.listCards(b.collection.id)).size).toBe(0);
  });
});

describe('daily stats', () => {
  it('are updated per collection and per kind with every attempt', async () => {
    const { e4, nf3, record, collection } = await setup();
    await record(e4, T0, correct);
    await record(nf3, T0 + MIN, wrong);
    await record(nf3, T0 + 2 * MIN, hinted);
    await record(e4, T0 + DAY, fast);
    const today = dayKey(new Date(T0));
    const tomorrow = dayKey(new Date(T0 + DAY));
    const expected = [
      {
        day: today,
        attempts: 3,
        correct: 1,
        hint: 1,
        wrong: 1,
        newCards: 2,
        timeMs: 13000,
      },
      { day: tomorrow, attempts: 1, correct: 1, hint: 0, wrong: 0, newCards: 0, timeMs: 900 },
    ];
    expect(await storage.dailyStats({ from: today, to: tomorrow })).toEqual(expected);
    expect(
      await storage.dailyStats({ from: today, to: tomorrow, collectionId: collection.id }),
    ).toEqual(expected);
    expect(await storage.dailyStats({ from: tomorrow, to: tomorrow })).toEqual([expected[1]]);
  });

  it('global totals sum the collections', async () => {
    const a = await setup('opening');
    const b = await setup('game');
    await a.record(a.e4, T0, correct);
    await b.record(b.e4, T0, wrong);
    const day = dayKey(new Date(T0));
    expect(await storage.dailyStats({ from: day, to: day })).toEqual([
      { day, attempts: 2, correct: 1, hint: 0, wrong: 1, newCards: 2, timeMs: 7000 },
    ]);
    expect(
      (await storage.dailyStats({ from: day, to: day, collectionId: b.collection.id }))[0]!
        .attempts,
    ).toBe(1);
  });
});

describe('derived state', () => {
  async function snapshot(collectionId: string, day: string) {
    return {
      cards: await storage.listCards(collectionId),
      stats: await storage.dailyStats({ from: day, to: day }),
      collectionStats: await storage.dailyStats({ from: day, to: day, collectionId }),
    };
  }

  it('rebuildDerived replays the log into identical cards and stats', async () => {
    const { e4, nf3, record, collection } = await setup();
    await record(e4, T0, correct);
    await record(nf3, T0 + MIN, wrong);
    await record(nf3, T0 + 5 * MIN, hinted);
    await record(e4, T0 + 6 * MIN, fast);
    const day = dayKey(new Date(T0));
    const before = await snapshot(collection.id, day);
    await storage.rebuildDerived();
    expect(await snapshot(collection.id, day)).toEqual(before);
  });

  it('migrate backfills cards and stats for attempts recorded without them (M1 data)', async () => {
    const { e4, record, collection } = await setup();
    await record(e4, T0, correct);
    const day = dayKey(new Date(T0));
    const before = await snapshot(collection.id, day);
    await storage.exec('DELETE FROM card', [], 'run');
    await storage.exec('DELETE FROM daily_stat', [], 'run');
    expect(await storage.migrate()).toEqual([]);
    expect(await snapshot(collection.id, day)).toEqual(before);
  });
});
