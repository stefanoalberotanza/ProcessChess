import { Chess } from 'chess.js';
import { loadOpenings, resolveOpening, toEpd } from '@processchess/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from './adapters/memory';
import { openingRows } from './openings';
import type { SqliteStorage } from './sqlite-storage';
import { INITIAL_FEN } from './sqlite-storage';

let storage: SqliteStorage;

beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.migrate();
});
afterEach(() => storage.close());

describe('SqliteStorage (in-memory)', () => {
  it('migrate is idempotent', async () => {
    await expect(storage.migrate()).resolves.toEqual([]);
  });

  it('stores an opening collection from the initial position with nodes and attempts', async () => {
    const { collection, root } = await storage.createCollection({
      name: 'Italian repertoire',
      kind: 'opening',
      userColor: 'w',
      evalMode: 'exact',
      source: 'user',
    });
    expect(collection.startFen).toBe(INITIAL_FEN);
    expect(root.parentId).toBeNull();
    expect(root.epd).toBe(toEpd(INITIAL_FEN));

    // 1.e4 e5 2.Nf3 Nc6 3.Bc4, user plays White; 1.d4 as an accepted alternative.
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];
    let parent = root;
    const nodes = [];
    for (const [i, uci] of line.entries()) {
      parent = await storage.addNode({
        collectionId: collection.id,
        parentId: parent.id,
        uci,
        isUserMove: i % 2 === 0,
      });
      nodes.push(parent);
    }
    const alt = await storage.addNode({
      collectionId: collection.id,
      parentId: root.id,
      uci: 'd2d4',
      isUserMove: true,
      ord: 1,
    });

    expect(nodes.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    const children = await storage.getChildren(root.id);
    expect(children.map((n) => n.san)).toEqual(['e4', 'd4']);
    expect(alt.isUserMove).toBe(true);

    const last = nodes.at(-1)!;
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']) chess.move(san);
    expect(last.epd).toBe(toEpd(chess.fen()));
    expect(await storage.findNodesByEpd(last.epd)).toHaveLength(1);

    const s = await storage.startSession(collection.id, root.id);
    const t0 = new Date('2026-01-01T10:00:00Z');
    await storage.recordAttempt({
      sessionId: s.id,
      nodeId: last.id,
      result: 'wrong',
      playedUci: 'f1b5',
      timeMs: 4200,
      ts: t0,
    });
    await storage.recordAttempt({
      sessionId: s.id,
      nodeId: last.id,
      result: 'hint',
      playedUci: 'f1c4',
      hints: 1,
      timeMs: 3000,
      ts: new Date(t0.getTime() + 1000),
    });
    await storage.endSession(s.id);

    const attempts = await storage.listAttempts(last.id);
    expect(attempts.map((a) => [a.result, a.playedUci, a.hints])).toEqual([
      ['wrong', 'f1b5', 0],
      ['hint', 'f1c4', 1],
    ]);
    expect(attempts[0]!.ts).toEqual(t0);
  });

  it('stores a mate collection starting from a FEN', async () => {
    // Back-rank mate in 1: 1.Re8#.
    const fen = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
    const { collection, root } = await storage.createCollection({
      name: 'Back rank',
      kind: 'mate',
      startFen: fen,
      userColor: 'w',
      evalMode: 'exact',
    });
    expect(collection.kind).toBe('mate');
    expect(root.epd).toBe(toEpd(fen));

    const mate = await storage.addNode({
      collectionId: collection.id,
      parentId: root.id,
      uci: 'e1e8',
      isUserMove: true,
    });
    expect(mate.san).toBe('Re8#');

    const s = await storage.startSession(collection.id, root.id);
    const a = await storage.recordAttempt({
      sessionId: s.id,
      nodeId: mate.id,
      result: 'correct',
      playedUci: 'e1e8',
      timeMs: 1500,
    });
    expect(a.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(await storage.listAttempts(mate.id)).toHaveLength(1);
  });

  it('rejects illegal moves and invalid FEN', async () => {
    const { collection, root } = await storage.createCollection({
      name: 'x',
      kind: 'opening',
      userColor: 'w',
      evalMode: 'exact',
    });
    await expect(
      storage.addNode({
        collectionId: collection.id,
        parentId: root.id,
        uci: 'e2e5',
        isUserMove: true,
      }),
    ).rejects.toThrow();
    await expect(
      storage.createCollection({
        name: 'bad',
        kind: 'mate',
        startFen: 'not a fen',
        userColor: 'w',
        evalMode: 'exact',
      }),
    ).rejects.toThrow();
  });

  it('enforces the kind/eval_mode check constraints', async () => {
    await expect(
      storage.createCollection({
        name: 'bad',
        kind: 'puzzle' as never,
        userColor: 'w',
        evalMode: 'exact',
      }),
    ).rejects.toThrow();
  });

  it('seeds the opening reference table consistently with resolveOpening', async () => {
    const rows = await openingRows();
    await storage.seedOpenings(rows);
    const chess = new Chess();
    const moves = ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'];
    for (const m of moves) chess.move(m);
    const row = await storage.getOpeningByEpd(toEpd(chess.fen()));
    await loadOpenings();
    const resolved = resolveOpening(moves)!;
    expect(row).toMatchObject({
      eco: resolved.eco,
      name: resolved.name,
      family: resolved.family,
      variation: resolved.variation,
    });
  });
});
