import {
  SubtreeHasAttemptsError,
  addLine,
  deleteSubtree,
  enumerateLines,
  findChildByUci,
  setComment,
  setMainLine,
  startLineDrill,
  submitMove,
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

const PGN = '1. e4 e5 (1... c5 { Sicilian } 2. Nf3) 2. Nf3 Nc6 3. Bc4 *';

async function importFixture() {
  const edit = treeFromPgn(PGN, { userColor: 'w', newId });
  const collection = await storage.createCollectionFromTree(
    { name: 'White', kind: 'opening', evalMode: 'exact', source: 'pgn' },
    edit,
  );
  return { collection, tree: edit.tree };
}

describe('trees', () => {
  it('stores a tree built in core and loads it back identically', async () => {
    const { collection, tree } = await importFixture();
    expect(collection.userColor).toBe('w');
    const loaded = await storage.loadTree(collection.id);
    expect(loaded.rootId).toBe(tree.rootId);
    expect([...loaded.nodes.values()].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...tree.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(loaded.children).toEqual(tree.children);
  });

  it('persists addLine, setMainLine, setComment and deleteSubtree changes', async () => {
    const { collection } = await importFixture();
    let tree = await storage.loadTree(collection.id);
    const added = addLine(tree, tree.rootId, ['d2d4', 'd7d5'], { newId });
    await storage.applyTreeChanges(collection.id, added.changes);
    const main = setMainLine(added.tree, added.leafId);
    await storage.applyTreeChanges(collection.id, main.changes);
    const commented = setComment(main.tree, added.leafId, 'Queen pawn');
    await storage.applyTreeChanges(collection.id, commented.changes);
    tree = await storage.loadTree(collection.id);
    expect(tree.children).toEqual(commented.tree.children);
    expect(tree.nodes.get(added.leafId)!.comment).toBe('Queen pawn');

    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    const del = deleteSubtree(tree, e4.id, await storage.nodeIdsWithAttempts(collection.id));
    await storage.applyTreeChanges(collection.id, del.changes);
    tree = await storage.loadTree(collection.id);
    expect(tree.nodes.size).toBe(3);
  });

  it('refuses to delete a subtree with attempts', async () => {
    const { collection, tree } = await importFixture();
    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    const s = await storage.startSession(collection.id, tree.rootId);
    await storage.recordAttempt({ sessionId: s.id, nodeId: e4.id, result: 'correct', timeMs: 100 });
    const withAttempts = await storage.nodeIdsWithAttempts(collection.id);
    expect(withAttempts).toEqual(new Set([e4.id]));
    expect(() => deleteSubtree(tree, e4.id, withAttempts)).toThrow(SubtreeHasAttemptsError);
  });

  it('rolls back a failing batch of changes', async () => {
    const { collection, tree } = await importFixture();
    const added = addLine(tree, tree.rootId, ['d2d4'], { newId });
    const bad = {
      ...added.changes,
      inserted: [...added.changes.inserted, { ...added.changes.inserted[0]! }],
    };
    await expect(storage.applyTreeChanges(collection.id, bad)).rejects.toThrow();
    expect((await storage.loadTree(collection.id)).nodes.size).toBe(tree.nodes.size);
  });
});

describe('archiving', () => {
  it('hides archived collections by default and never deletes them', async () => {
    const { collection } = await importFixture();
    await storage.archiveCollection(collection.id);
    expect(await storage.listCollections()).toEqual([]);
    const all = await storage.listCollections({ includeArchived: true });
    expect(all[0]!.archivedAt).toBeInstanceOf(Date);
    expect((await storage.collectionSummaries()).length).toBe(0);
    await storage.unarchiveCollection(collection.id);
    expect(await storage.listCollections()).toHaveLength(1);
  });
});

describe('collection summaries', () => {
  it('reports the last training date', async () => {
    const { collection, tree } = await importFixture();
    expect((await storage.collectionSummaries())[0]!.lastTrainedAt).toBeNull();
    const s = await storage.startSession(collection.id, tree.rootId);
    const [summary] = await storage.collectionSummaries();
    expect(summary!.lastTrainedAt).toEqual(s.startedAt);
  });
});

describe('drill records', () => {
  it('stores line passes and feeds them back to the drill', async () => {
    const { collection, tree } = await importFixture();
    const session = await storage.startSession(collection.id, tree.rootId);
    let state = startLineDrill({ tree, passes: await storage.listLinePasses(collection.id) });
    for (const uci of ['e2e4', 'g1f3', 'f1c4']) {
      const r = submitMove(state, uci);
      if (r.attempt) await storage.recordAttempt({ sessionId: session.id, ...r.attempt });
      if (r.pass)
        await storage.recordLinePass({
          sessionId: session.id,
          collectionId: collection.id,
          ...r.pass,
        });
      state = r.state;
    }
    const passes = await storage.listLinePasses(collection.id);
    expect(passes).toEqual([{ lineId: enumerateLines(tree)[0]!.id, clean: true, diverged: false }]);
    expect(startLineDrill({ tree, passes }).passes).toEqual(passes);
  });

  it('computes the move history: last 20, first-try rate, most frequent wrong move', async () => {
    const { collection, tree } = await importFixture();
    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    const s = await storage.startSession(collection.id, tree.rootId);
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const results: [string, string | null][] = [
      ['wrong', 'd2d4'],
      ['correct', 'e2e4'],
      ['wrong', 'c2c4'],
      ['wrong', 'd2d4'],
      ['hint', 'e2e4'],
      ...Array.from({ length: 20 }, () => ['correct', 'e2e4'] as [string, string]),
    ];
    for (const [i, [result, uci]] of results.entries()) {
      await storage.recordAttempt({
        sessionId: s.id,
        nodeId: e4.id,
        result: result as 'correct' | 'hint' | 'wrong',
        playedUci: uci,
        timeMs: 1000,
        ts: new Date(t0 + i * 1000),
      });
    }
    const h = await storage.getMoveHistory(e4.id);
    expect(h.total).toBe(25);
    expect(h.recent).toHaveLength(20);
    expect(h.recent[0]!.ts.getTime()).toBe(t0 + 5000);
    expect(h.recent.at(-1)!.ts.getTime()).toBe(t0 + 24000);
    expect(h.firstTry).toBe(21);
    expect(h.firstTryRate).toBeCloseTo(21 / 25);
    expect(h.mostFrequentWrong).toEqual({ uci: 'd2d4', count: 2 });
  });

  it('returns an empty history for a node without attempts', async () => {
    const { tree } = await importFixture();
    expect(await storage.getMoveHistory(tree.rootId)).toEqual({
      recent: [],
      total: 0,
      firstTry: 0,
      firstTryRate: null,
      mostFrequentWrong: null,
    });
  });
});

describe('lookups', () => {
  it('returns undefined for missing rows', async () => {
    expect(await storage.getCollection('nope')).toBeUndefined();
    expect(await storage.getNode('nope')).toBeUndefined();
  });
});
