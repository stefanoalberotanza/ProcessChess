import { findChildByUci, playLine, INITIAL_FEN, toEpd, treeFromPgn } from '@processchess/core';
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

const epdAfter = (ucis: string[]) => toEpd(playLine(INITIAL_FEN, ucis)!.fen);

async function repertoire(pgn: string, color: 'w' | 'b', name = 'R') {
  const edit = treeFromPgn(pgn, { userColor: color, newId });
  const c = await storage.createCollectionFromTree(
    { name, kind: 'opening', evalMode: 'exact' },
    edit,
  );
  return { collection: c, tree: edit.tree };
}

describe('repertoireMovesAt', () => {
  it('finds a user move by the position it reaches and the move, also by another move order', async () => {
    // 1.d4 Nf6 2.c4 e6 3.Nc3 and 1.c4 e6 2.d4 Nf6 3.Nc3 reach the same position with 3.Nc3
    const { collection, tree } = await repertoire('1. d4 Nf6 2. c4 e6 3. Nc3 *', 'w');
    let id = tree.rootId;
    for (const u of ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3']) id = findChildByUci(tree, id, u)!.id;
    const nc3 = { collectionId: collection.id, nodeId: id, rootNodeId: tree.rootId };
    expect(
      await storage.repertoireMovesAt(
        epdAfter(['c2c4', 'e7e6', 'd2d4', 'g8f6', 'b1c3']),
        'b1c3',
        'w',
      ),
    ).toEqual([nc3]);
    // same position reached by another move: no match (the card is about this move)
    expect(
      await storage.repertoireMovesAt(
        epdAfter(['c2c4', 'e7e6', 'd2d4', 'g8f6', 'b1c3']),
        'd2d4',
        'w',
      ),
    ).toEqual([]);
  });

  it('ignores opponent moves, the other colour and archived collections', async () => {
    const white = await repertoire('1. e4 e5 2. Nf3 *', 'w', 'W');
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4', 'e7e5']), 'e7e5', 'b')).toEqual([]);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'b')).toEqual([]);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toHaveLength(1);
    await storage.archiveCollection(white.collection.id);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toEqual([]);
  });

  it('returns one match per collection of that colour', async () => {
    await repertoire('1. e4 e5 *', 'w', 'A');
    await repertoire('1. e4 c5 *', 'w', 'B');
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toHaveLength(2);
  });
});

describe('repertoireCards', () => {
  it('maps a reviewed user move to its card by resulting position and move', async () => {
    const { collection, tree } = await repertoire('1. e4 e5 2. Nf3 *', 'w', 'W');
    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    const e5 = findChildByUci(tree, e4.id, 'e7e5')!;
    const session = await storage.startSession(collection.id, tree.rootId);
    const { card } = await storage.recordAttempt({
      sessionId: session.id,
      nodeId: e4.id,
      result: 'correct',
      hints: 0,
      timeMs: 2000,
    });
    const cards = await storage.repertoireCards();
    expect(cards.get(`${e4.epd} ${e4.uci}`)).toEqual([card]);
    expect(cards.has(`${e5.epd} ${e5.uci}`)).toBe(false); // opponent move, no card
    await storage.archiveCollection(collection.id);
    expect((await storage.repertoireCards()).size).toBe(0);
  });
});

describe('custom-start collections', () => {
  it('never take part in the repertoire backbone', async () => {
    // a collection whose start is not the initial position (no a2 pawn)
    const odd = treeFromPgn(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 *',
      { userColor: 'w', newId },
    );
    const c = await storage.createCollectionFromTree(
      { name: 'Odd', kind: 'opening', evalMode: 'exact' },
      odd,
    );
    const e4 = findChildByUci(odd.tree, odd.tree.rootId, 'e2e4')!;
    expect(await storage.repertoireMovesAt(e4.epd, 'e2e4', 'w')).toEqual([]);
    const session = await storage.startSession(c.id, odd.tree.rootId);
    await storage.recordAttempt({
      sessionId: session.id,
      nodeId: e4.id,
      result: 'correct',
      hints: 0,
      timeMs: 2000,
    });
    expect((await storage.repertoireCards()).has(`${e4.epd} e2e4`)).toBe(false);
  });
});
