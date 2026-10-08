import {
  type CardMap,
  type DayStat,
  INITIAL_FEN,
  type LinePassRecord,
  type ReviewInput,
  type SrsCard,
  type Tree,
  type TreeChanges,
  type TreeEdit,
  archiveCollection,
  createTree,
  emptyTree,
  fenAt,
  dayKey,
  playMove,
  reviewCard,
  toEpd,
} from '@processchess/core';
import { and, asc, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type SqliteRemoteDatabase, drizzle } from 'drizzle-orm/sqlite-proxy';
import { ulid } from 'ulid';
import type { SqlExecutor } from './executor';
import { runMigrations } from './migrator';
import * as schema from './schema';
import type { Card, CollectionKind, Node, Opening } from './schema';
import type {
  CollectionSummary,
  MoveHistory,
  NewAttemptInput,
  NewCollectionInput,
  NewLinePassInput,
  NewNodeInput,
  Storage,
} from './storage';

export { INITIAL_FEN };

export type Db = SqliteRemoteDatabase<typeof schema>;

/** ULID generator, to pass as `newId` to core tree operations. */
export const newId = (): string => ulid();

const CHUNK = 100;

function toSrsCard(c: Card): SrsCard {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsedDays,
    scheduledDays: c.scheduledDays,
    learningSteps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.lastReview,
  };
}

/** What one attempt adds to the daily stats of its day. */
function statDelta(a: ReviewInput, isNew: boolean): Omit<DayStat, 'day'> {
  return {
    attempts: 1,
    correct: a.result === 'correct' ? 1 : 0,
    hint: a.result === 'hint' ? 1 : 0,
    wrong: a.result === 'wrong' ? 1 : 0,
    newCards: isNew ? 1 : 0,
    timeMs: a.timeMs,
  };
}

const STAT_FIELDS = ['attempts', 'correct', 'hint', 'wrong', 'newCards', 'timeMs'] as const;

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Storage over any SQLite reachable through a `SqlExecutor` (Drizzle `sqlite-proxy`). */
export class SqliteStorage implements Storage {
  protected readonly db: Db;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    /** Raw SQL access, for adapters and tests. */
    readonly exec: SqlExecutor,
    readonly persistent: boolean,
    private readonly onClose: () => Promise<void> = async () => {},
  ) {
    this.db = drizzle(exec, { schema });
  }

  /** Serialises transactions: SQLite has one connection per adapter. */
  private tx<T>(
    fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    const run = this.queue.then(() => this.db.transaction(fn));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async migrate() {
    await this.exec('PRAGMA foreign_keys = ON', [], 'run');
    const applied = await runMigrations(this.exec);
    const [missing] = await this.db
      .select({ id: schema.attempt.id })
      .from(schema.attempt)
      .leftJoin(schema.card, eq(schema.card.nodeId, schema.attempt.nodeId))
      .where(isNull(schema.card.id))
      .limit(1);
    if (missing) await this.rebuildDerived();
    return applied;
  }

  async createCollection(input: NewCollectionInput) {
    const tree = emptyTree(input.startFen ?? INITIAL_FEN, input.userColor, ulid()); // validates FEN
    const changes = { inserted: [...tree.nodes.values()], updated: [], deleted: [] };
    const collection = await this.createCollectionFromTree(input, { tree, changes });
    return { collection, root: (await this.getNode(tree.rootId))! };
  }

  async createCollectionFromTree(
    input: Omit<NewCollectionInput, 'startFen' | 'userColor'>,
    edit: TreeEdit,
  ) {
    return this.tx(async (tx) => {
      const [collection] = await tx
        .insert(schema.collection)
        .values({
          id: ulid(),
          name: input.name,
          kind: input.kind,
          startFen: edit.tree.startFen,
          userColor: edit.tree.userColor,
          evalMode: input.evalMode,
          source: input.source ?? null,
          license: input.license ?? null,
        })
        .returning();
      const nodes = [...edit.tree.nodes.values()];
      for (const part of chunks(nodes)) {
        await tx
          .insert(schema.node)
          .values(part.map((n) => ({ ...n, collectionId: collection!.id })));
      }
      return collection!;
    });
  }

  async getCollection(id: string) {
    return this.db.query.collection.findFirst({ where: eq(schema.collection.id, id) });
  }

  async listCollections(opts: { includeArchived?: boolean } = {}) {
    return this.db
      .select()
      .from(schema.collection)
      .where(opts.includeArchived ? undefined : isNull(schema.collection.archivedAt))
      .orderBy(asc(schema.collection.id));
  }

  async collectionSummaries(
    opts: { includeArchived?: boolean } = {},
  ): Promise<CollectionSummary[]> {
    const last = this.db
      .select({
        collectionId: schema.session.collectionId,
        lastTrainedAt: sql<number>`max(${schema.session.startedAt})`.as('last_trained_at'),
      })
      .from(schema.session)
      .groupBy(schema.session.collectionId)
      .as('last');
    const rows = await this.db
      .select({ collection: schema.collection, lastTrainedAt: last.lastTrainedAt })
      .from(schema.collection)
      .leftJoin(last, eq(last.collectionId, schema.collection.id))
      .where(opts.includeArchived ? undefined : isNull(schema.collection.archivedAt))
      .orderBy(asc(schema.collection.id));
    return rows.map((r) => ({
      collection: r.collection,
      lastTrainedAt: r.lastTrainedAt === null ? null : new Date(Number(r.lastTrainedAt)),
    }));
  }

  async archiveCollection(id: string) {
    const c = await this.getCollection(id);
    if (!c) throw new Error(`Unknown collection ${id}`);
    const archived = archiveCollection(c);
    await this.db
      .update(schema.collection)
      .set({ archivedAt: archived.archivedAt })
      .where(eq(schema.collection.id, id));
  }

  async unarchiveCollection(id: string) {
    await this.db
      .update(schema.collection)
      .set({ archivedAt: null })
      .where(eq(schema.collection.id, id));
  }

  async loadTree(collectionId: string): Promise<Tree> {
    const c = await this.getCollection(collectionId);
    if (!c) throw new Error(`Unknown collection ${collectionId}`);
    const rows = await this.db
      .select()
      .from(schema.node)
      .where(eq(schema.node.collectionId, collectionId));
    return createTree(
      c.startFen,
      c.userColor,
      rows.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        ord: n.ord,
        epd: n.epd,
        san: n.san,
        uci: n.uci,
        isUserMove: n.isUserMove,
        comment: n.comment,
      })),
    );
  }

  async applyTreeChanges(collectionId: string, changes: TreeChanges) {
    if (!changes.inserted.length && !changes.updated.length && !changes.deleted.length) return;
    await this.tx(async (tx) => {
      for (const part of chunks(changes.deleted)) {
        await tx
          .delete(schema.node)
          .where(and(eq(schema.node.collectionId, collectionId), inArray(schema.node.id, part)));
      }
      for (const part of chunks(changes.inserted)) {
        await tx.insert(schema.node).values(part.map((n) => ({ ...n, collectionId })));
      }
      for (const u of changes.updated) {
        await tx
          .update(schema.node)
          .set({ ord: u.ord, comment: u.comment })
          .where(and(eq(schema.node.id, u.id), eq(schema.node.collectionId, collectionId)));
      }
    });
  }

  async nodeIdsWithAttempts(collectionId: string) {
    const rows = await this.db
      .selectDistinct({ id: schema.attempt.nodeId })
      .from(schema.attempt)
      .innerJoin(schema.node, eq(schema.node.id, schema.attempt.nodeId))
      .where(eq(schema.node.collectionId, collectionId));
    return new Set(rows.map((r) => r.id));
  }

  async addNode(input: NewNodeInput) {
    const parent = await this.getNode(input.parentId);
    if (!parent || parent.collectionId !== input.collectionId) {
      throw new Error(`Parent node ${input.parentId} not in collection ${input.collectionId}`);
    }
    const tree = await this.loadTree(input.collectionId);
    const played = playMove(fenAt(tree, input.parentId), input.uci);
    if (!played) throw new Error(`Illegal move ${input.uci}`);
    const [node] = await this.db
      .insert(schema.node)
      .values({
        id: ulid(),
        collectionId: input.collectionId,
        parentId: input.parentId,
        ord: input.ord ?? 0,
        epd: toEpd(played.fen),
        san: played.san,
        uci: played.uci,
        isUserMove: input.isUserMove,
        comment: input.comment ?? null,
      })
      .returning();
    return node!;
  }

  async getNode(id: string): Promise<Node | undefined> {
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

  async recordAttempt(input: NewAttemptInput) {
    return this.tx(async (tx) => {
      const [attempt] = await tx
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
      const [owner] = await tx
        .select({ id: schema.collection.id, kind: schema.collection.kind })
        .from(schema.node)
        .innerJoin(schema.collection, eq(schema.collection.id, schema.node.collectionId))
        .where(eq(schema.node.id, input.nodeId));
      const [row] = await tx.select().from(schema.card).where(eq(schema.card.nodeId, input.nodeId));
      const { card, isNew } = reviewCard(row ? toSrsCard(row) : null, attempt!);
      await tx
        .insert(schema.card)
        .values({ id: ulid(), nodeId: input.nodeId, ...card })
        .onConflictDoUpdate({ target: schema.card.nodeId, set: card });
      const delta = statDelta(attempt!, isNew);
      const day = dayKey(attempt!.ts);
      for (const [scope, scopeKey] of [
        ['collection', owner!.id],
        ['kind', owner!.kind],
      ] as const) {
        await tx
          .insert(schema.dailyStat)
          .values({ day, scope, scopeKey, ...delta })
          .onConflictDoUpdate({
            target: [schema.dailyStat.day, schema.dailyStat.scope, schema.dailyStat.scopeKey],
            set: Object.fromEntries(
              STAT_FIELDS.map((f) => [f, sql`${schema.dailyStat[f]} + ${delta[f]}`]),
            ),
          });
      }
      return { attempt: attempt!, card };
    });
  }

  async listCards(collectionId: string): Promise<CardMap> {
    const rows = await this.db
      .select({ card: schema.card })
      .from(schema.card)
      .innerJoin(schema.node, eq(schema.node.id, schema.card.nodeId))
      .where(eq(schema.node.collectionId, collectionId));
    return new Map(rows.map((r) => [r.card.nodeId, toSrsCard(r.card)]));
  }

  async dailyStats(range: { from: string; to: string; collectionId?: string }) {
    const d = schema.dailyStat;
    const scope = range.collectionId
      ? and(eq(d.scope, 'collection'), eq(d.scopeKey, range.collectionId))
      : eq(d.scope, 'kind');
    const rows = await this.db
      .select({
        day: d.day,
        attempts: sql<number>`sum(${d.attempts})`,
        correct: sql<number>`sum(${d.correct})`,
        hint: sql<number>`sum(${d.hint})`,
        wrong: sql<number>`sum(${d.wrong})`,
        newCards: sql<number>`sum(${d.newCards})`,
        timeMs: sql<number>`sum(${d.timeMs})`,
      })
      .from(d)
      .where(and(scope, between(d.day, range.from, range.to)))
      .groupBy(d.day)
      .orderBy(asc(d.day));
    return rows.map((r): DayStat => ({
      day: r.day,
      ...(Object.fromEntries(STAT_FIELDS.map((f) => [f, Number(r[f])])) as Omit<DayStat, 'day'>),
    }));
  }

  async rebuildDerived() {
    await this.tx(async (tx) => {
      const log = await tx
        .select({
          attempt: schema.attempt,
          collectionId: schema.collection.id,
          kind: schema.collection.kind,
        })
        .from(schema.attempt)
        .innerJoin(schema.node, eq(schema.node.id, schema.attempt.nodeId))
        .innerJoin(schema.collection, eq(schema.collection.id, schema.node.collectionId))
        .orderBy(sql`${schema.attempt}.rowid`); // log order = insertion order
      const cards = new Map<string, SrsCard>();
      const stats = new Map<string, DayStat & { scope: 'collection' | 'kind'; scopeKey: string }>();
      for (const { attempt, collectionId, kind } of log) {
        const { card, isNew } = reviewCard(cards.get(attempt.nodeId) ?? null, attempt);
        cards.set(attempt.nodeId, card);
        const delta = statDelta(attempt, isNew);
        const day = dayKey(attempt.ts);
        for (const [scope, scopeKey] of [
          ['collection', collectionId],
          ['kind', kind as CollectionKind],
        ] as const) {
          const key = `${day} ${scope} ${scopeKey}`;
          const s = stats.get(key) ?? {
            day,
            scope,
            scopeKey,
            attempts: 0,
            correct: 0,
            hint: 0,
            wrong: 0,
            newCards: 0,
            timeMs: 0,
          };
          for (const f of STAT_FIELDS) s[f] += delta[f];
          stats.set(key, s);
        }
      }
      await tx.delete(schema.card);
      await tx.delete(schema.dailyStat);
      for (const part of chunks([...cards])) {
        await tx
          .insert(schema.card)
          .values(part.map(([nodeId, card]) => ({ id: ulid(), nodeId, ...card })));
      }
      for (const part of chunks([...stats.values()])) {
        await tx.insert(schema.dailyStat).values(part);
      }
    });
  }

  async listAttempts(nodeId: string) {
    return this.db
      .select()
      .from(schema.attempt)
      .where(eq(schema.attempt.nodeId, nodeId))
      .orderBy(asc(schema.attempt.ts), asc(schema.attempt.id));
  }

  async getMoveHistory(nodeId: string, limit = 20): Promise<MoveHistory> {
    const recent = await this.db
      .select()
      .from(schema.attempt)
      .where(eq(schema.attempt.nodeId, nodeId))
      .orderBy(desc(schema.attempt.ts), desc(schema.attempt.id))
      .limit(limit);
    const [totals] = await this.db
      .select({
        total: sql<number>`count(*)`,
        firstTry: sql<number>`coalesce(sum(case when ${schema.attempt.result} = 'correct' then 1 else 0 end), 0)`,
      })
      .from(schema.attempt)
      .where(eq(schema.attempt.nodeId, nodeId));
    const [wrong] = await this.db
      .select({
        uci: schema.attempt.playedUci,
        count: sql<number>`count(*)`.as('n'),
        lastTs: sql<number>`max(${schema.attempt.ts})`.as('last_ts'),
      })
      .from(schema.attempt)
      .where(and(eq(schema.attempt.nodeId, nodeId), eq(schema.attempt.result, 'wrong')))
      .groupBy(schema.attempt.playedUci)
      .orderBy(desc(sql`n`), desc(sql`last_ts`))
      .limit(1);
    const total = Number(totals?.total ?? 0);
    const firstTry = Number(totals?.firstTry ?? 0);
    return {
      recent: recent.reverse(),
      total,
      firstTry,
      firstTryRate: total === 0 ? null : firstTry / total,
      mostFrequentWrong: wrong?.uci ? { uci: wrong.uci, count: Number(wrong.count) } : null,
    };
  }

  async recordLinePass(input: NewLinePassInput) {
    await this.db.insert(schema.linePass).values({
      id: ulid(),
      sessionId: input.sessionId,
      collectionId: input.collectionId,
      lineId: input.lineId,
      clean: input.clean,
      diverged: input.diverged,
      ts: input.ts ?? new Date(),
    });
  }

  async listLinePasses(collectionId: string): Promise<LinePassRecord[]> {
    const rows = await this.db
      .select({
        lineId: schema.linePass.lineId,
        clean: schema.linePass.clean,
        diverged: schema.linePass.diverged,
      })
      .from(schema.linePass)
      .where(eq(schema.linePass.collectionId, collectionId))
      .orderBy(asc(schema.linePass.ts), asc(schema.linePass.id));
    return rows;
  }

  async seedOpenings(rows: Opening[]) {
    await this.tx(async (tx) => {
      await tx.delete(schema.opening);
      for (const part of chunks(rows, 500)) await tx.insert(schema.opening).values(part);
    });
  }

  async getOpeningByEpd(epd: string) {
    return this.db.query.opening.findFirst({ where: eq(schema.opening.epd, epd) });
  }

  close() {
    return this.onClose();
  }
}
