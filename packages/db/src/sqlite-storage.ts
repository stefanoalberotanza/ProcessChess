import { Chess } from 'chess.js';
import { toEpd } from '@processchess/core';
import { asc, eq } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { ulid } from 'ulid';
import * as schema from './schema';
import type { Opening } from './schema';
import type { Storage } from './storage';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Db = SqliteRemoteDatabase<typeof schema>;

/**
 * Storage implemented once over Drizzle's sqlite-proxy driver: each adapter only has
 * to provide the raw SQL transport and a way to run migrations.
 */
export class SqliteStorage implements Storage {
  constructor(
    protected readonly db: Db,
    private readonly runMigrations: () => Promise<void>,
    private readonly onClose: () => Promise<void> = async () => {},
  ) {}

  migrate() {
    return this.runMigrations();
  }

  async createCollection(input: Parameters<Storage['createCollection']>[0]) {
    const startFen = input.startFen ?? INITIAL_FEN;
    const chess = new Chess(startFen); // validates the FEN
    const [collection] = await this.db
      .insert(schema.collection)
      .values({
        id: ulid(),
        name: input.name,
        kind: input.kind,
        startFen: chess.fen(),
        userColor: input.userColor,
        evalMode: input.evalMode,
        source: input.source ?? null,
        license: input.license ?? null,
      })
      .returning();
    const [root] = await this.db
      .insert(schema.node)
      .values({
        id: ulid(),
        collectionId: collection!.id,
        parentId: null,
        epd: toEpd(chess.fen()),
        isUserMove: false,
      })
      .returning();
    return { collection: collection!, root: root! };
  }

  async getCollection(id: string) {
    return this.db.query.collection.findFirst({ where: eq(schema.collection.id, id) });
  }

  async listCollections() {
    return this.db.select().from(schema.collection).orderBy(asc(schema.collection.id));
  }

  async addNode(input: Parameters<Storage['addNode']>[0]) {
    const chess = await this.positionOf(input.parentId);
    const parent = await this.getNode(input.parentId);
    if (!parent || parent.collectionId !== input.collectionId) {
      throw new Error(`Parent node ${input.parentId} not in collection ${input.collectionId}`);
    }
    const u = input.uci;
    const move = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const [node] = await this.db
      .insert(schema.node)
      .values({
        id: ulid(),
        collectionId: input.collectionId,
        parentId: input.parentId,
        ord: input.ord ?? 0,
        epd: toEpd(chess.fen()),
        san: move.san,
        uci: move.lan,
        isUserMove: input.isUserMove,
        comment: input.comment ?? null,
      })
      .returning();
    return node!;
  }

  async getNode(id: string) {
    return this.db.query.node.findFirst({ where: eq(schema.node.id, id) });
  }

  async getChildren(parentId: string) {
    return this.db
      .select()
      .from(schema.node)
      .where(eq(schema.node.parentId, parentId))
      .orderBy(asc(schema.node.ord), asc(schema.node.id));
  }

  async findNodesByEpd(epd: string) {
    return this.db.select().from(schema.node).where(eq(schema.node.epd, epd));
  }

  async startSession(collectionId: string, rootNodeId: string) {
    const [s] = await this.db
      .insert(schema.session)
      .values({ id: ulid(), collectionId, rootNodeId, startedAt: new Date() })
      .returning();
    return s!;
  }

  async endSession(sessionId: string) {
    await this.db
      .update(schema.session)
      .set({ endedAt: new Date() })
      .where(eq(schema.session.id, sessionId));
  }

  async recordAttempt(input: Parameters<Storage['recordAttempt']>[0]) {
    const [a] = await this.db
      .insert(schema.attempt)
      .values({
        id: ulid(),
        sessionId: input.sessionId,
        nodeId: input.nodeId,
        ts: input.ts ?? new Date(),
        result: input.result,
        playedUci: input.playedUci ?? null,
        hints: input.hints ?? 0,
        timeMs: input.timeMs,
      })
      .returning();
    return a!;
  }

  async listAttempts(nodeId: string) {
    return this.db
      .select()
      .from(schema.attempt)
      .where(eq(schema.attempt.nodeId, nodeId))
      .orderBy(asc(schema.attempt.ts), asc(schema.attempt.id));
  }

  async seedOpenings(rows: Opening[]) {
    await this.db.delete(schema.opening);
    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      await this.db.insert(schema.opening).values(rows.slice(i, i + chunk));
    }
  }

  async getOpeningByEpd(epd: string) {
    return this.db.query.opening.findFirst({ where: eq(schema.opening.epd, epd) });
  }

  close() {
    return this.onClose();
  }

  /** Rebuilds the position of a node by replaying moves from the collection's start FEN. */
  private async positionOf(nodeId: string): Promise<Chess> {
    const path: string[] = [];
    let current = await this.getNode(nodeId);
    if (!current) throw new Error(`Unknown node ${nodeId}`);
    const collectionId = current.collectionId;
    while (current?.parentId) {
      path.push(current.uci!);
      current = await this.getNode(current.parentId);
    }
    const coll = await this.getCollection(collectionId);
    const chess = new Chess(coll!.startFen);
    for (const u of path.reverse()) {
      chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    }
    return chess;
  }
}
