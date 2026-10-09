import { addLine, findChildByUci, loadOpenings, pathTo, treeFromPgn } from '@processchess/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { nodeSqliteExecutor } from './adapters/memory';
import { SqliteStorage, newId } from './sqlite-storage';

// Expected names and ECO codes are copied from data/openings/*.tsv.

let storage: SqliteStorage;
let sqlite: DatabaseSync;

beforeAll(() => loadOpenings());
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  storage = new SqliteStorage(nodeSqliteExecutor(sqlite), false, async () => sqlite.close());
  await storage.migrate();
});
afterEach(() => storage.close());

const RUY = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *';
const QGD = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 *';

async function importPgn(pgn: string, userColor: 'w' | 'b' = 'w') {
  const edit = treeFromPgn(pgn, { userColor, newId });
  const collection = await storage.createCollectionFromTree(
    { name: pgn.slice(0, 10), kind: 'opening', evalMode: 'exact', source: 'pgn' },
    edit,
  );
  return { collection, tree: edit.tree };
}

async function nodeAt(collectionId: string, ucis: string[]) {
  const tree = await storage.loadTree(collectionId);
  let id = tree.rootId;
  for (const uci of ucis) id = findChildByUci(tree, id, uci)!.id;
  return (await storage.getNode(id))!;
}

describe('opening classification on nodes', () => {
  it('classifies imported nodes as label › opening › variation', async () => {
    const { collection } = await importPgn(RUY);
    const e4 = await nodeAt(collection.id, ['e2e4']);
    expect(e4).toMatchObject({ openingLabel: 'king', openingName: null, openingEco: null });
    const bb5 = await nodeAt(collection.id, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    expect(bb5).toMatchObject({
      openingLabel: 'king',
      openingName: 'Ruy Lopez',
      openingVariation: null,
      openingEco: 'C60',
    });
    const tree = await storage.loadTree(collection.id);
    const leaf = [...tree.nodes.values()].find((n) => n.san === 'Be7')!;
    expect(await storage.getNode(leaf.id)).toMatchObject({
      openingName: 'Ruy Lopez',
      openingVariation: 'Closed',
      openingEco: 'C84',
    });
  });

  it('classifies nodes added later', async () => {
    const { collection, tree } = await importPgn(RUY);
    const added = addLine(tree, tree.rootId, ['d2d4', 'd7d5', 'c2c4', 'e7e6'], { newId });
    await storage.applyTreeChanges(collection.id, added.changes);
    expect(await storage.getNode(added.leafId)).toMatchObject({
      openingLabel: 'queen',
      openingName: "Queen's Gambit Declined",
      openingEco: 'D30',
    });
    const loaded = await storage.loadTree(collection.id);
    const parent = pathTo(loaded, added.leafId).at(-2)!;
    const node = await storage.addNode({
      collectionId: collection.id,
      parentId: parent.id,
      uci: 'c7c6',
      isUserMove: false,
    });
    // D10 Slav Defense: 1. d4 d5 2. c4 c6
    expect(node).toMatchObject({ openingName: 'Slav Defense', openingEco: 'D10' });
  });

  it('leaves custom-start collections unclassified', async () => {
    const { collection } = await importPgn('[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *');
    const tree = await storage.loadTree(collection.id);
    for (const n of tree.nodes.values()) {
      expect(await storage.getNode(n.id)).toMatchObject({ openingLabel: null, openingName: null });
    }
  });
});

describe('openingStats', () => {
  async function drill(collectionId: string, ucis: string[], result: 'correct' | 'wrong') {
    const tree = await storage.loadTree(collectionId);
    const s = await storage.startSession(collectionId, tree.rootId);
    const node = await nodeAt(collectionId, ucis);
    await storage.recordAttempt({ sessionId: s.id, nodeId: node.id, result, timeMs: 100 });
  }

  it('groups attempts by label, opening and variation', async () => {
    const ruy = (await importPgn(RUY)).collection.id;
    const qgd = (await importPgn(QGD)).collection.id;
    await drill(ruy, ['e2e4'], 'correct');
    await drill(ruy, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], 'correct');
    await drill(ruy, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], 'wrong');
    await drill(qgd, ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5'], 'correct');

    const byLabel = await storage.openingStats({ by: 'label' });
    expect(byLabel.map((r) => [r.label, r.attempts, r.correct, r.wrong])).toEqual([
      ['king', 3, 2, 1],
      ['queen', 1, 1, 0],
    ]);

    const byOpening = await storage.openingStats({ by: 'opening' });
    expect(byOpening.map((r) => [r.opening, r.attempts])).toEqual([
      ["Queen's Gambit Declined", 1],
      ['Ruy Lopez', 2],
    ]);

    const byVariation = await storage.openingStats({ by: 'variation' });
    expect(byVariation.map((r) => [r.opening, r.variation, r.attempts])).toEqual([
      ["Queen's Gambit Declined", 'Modern Variation', 1],
      ['Ruy Lopez', null, 2],
    ]);
    expect(await storage.openingStats({ by: 'label', userColor: 'b' })).toEqual([]);
  });

  it('excludes archived collections', async () => {
    const ruy = (await importPgn(RUY)).collection.id;
    await drill(ruy, ['e2e4'], 'correct');
    await storage.archiveCollection(ruy);
    expect(await storage.openingStats({ by: 'label' })).toEqual([]);
  });

  it('backfills nodes stored before classification existed', async () => {
    const { collection } = await importPgn(RUY);
    sqlite.exec('update node set opening_label = null, opening_name = null, opening_eco = null');
    expect(await nodeAt(collection.id, ['e2e4'])).toMatchObject({ openingLabel: null });
    expect(await storage.reclassifyOpenings()).toBe(1);
    expect(await nodeAt(collection.id, ['e2e4'])).toMatchObject({ openingLabel: 'king' });
    expect(await storage.reclassifyOpenings()).toBe(0);
  });
});
