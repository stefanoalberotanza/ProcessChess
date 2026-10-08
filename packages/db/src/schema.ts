import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

// All primary keys are ULIDs (see docs/adr/002-storage.md). Timestamps are Unix ms.

export const COLLECTION_KINDS = ['opening', 'game', 'mate', 'pattern', 'endgame'] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const EVAL_MODES = ['exact', 'result'] as const;
export type EvalMode = (typeof EVAL_MODES)[number];

export const COLORS = ['w', 'b'] as const;
export type Color = (typeof COLORS)[number];

export const ATTEMPT_RESULTS = ['correct', 'hint', 'wrong'] as const;
export type AttemptResult = (typeof ATTEMPT_RESULTS)[number];

export const STAT_SCOPES = ['collection', 'kind'] as const;
export type StatScope = (typeof STAT_SCOPES)[number];

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const collection = sqliteTable(
  'collection',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: COLLECTION_KINDS }).notNull(),
    /** Full FEN of the starting position (the standard one for openings). */
    startFen: text('start_fen').notNull(),
    userColor: text('user_color', { enum: COLORS }).notNull(),
    evalMode: text('eval_mode', { enum: EVAL_MODES }).notNull(),
    source: text('source'),
    license: text('license'),
    createdAt: createdAt(),
    /** Set when archived. Collections are never deleted; archived ones are hidden by default. */
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    check('collection_kind_check', sql`${t.kind} in ('opening','game','mate','pattern','endgame')`),
    check('collection_user_color_check', sql`${t.userColor} in ('w','b')`),
    check('collection_eval_mode_check', sql`${t.evalMode} in ('exact','result')`),
  ],
);

/**
 * A position in a collection's move tree. The root node has no parent and no move;
 * every other node is the position reached after `san`/`uci`. Sibling user moves
 * are accepted alternatives; `ord` = 0 is the main line.
 */
export const node = sqliteTable(
  'node',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collection.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => node.id, {
      onDelete: 'cascade',
    }),
    ord: integer('ord').notNull().default(0),
    epd: text('epd').notNull(),
    san: text('san'),
    uci: text('uci'),
    isUserMove: integer('is_user_move', { mode: 'boolean' }).notNull().default(false),
    comment: text('comment'),
    openingEco: text('opening_eco'),
    openingName: text('opening_name'),
  },
  (t) => [
    index('node_epd_idx').on(t.epd),
    index('node_collection_idx').on(t.collectionId),
    index('node_parent_idx').on(t.parentId),
    check('node_move_check', sql`(${t.parentId} is null) = (${t.uci} is null)`),
  ],
);

/** FSRS state, one card per user move (see docs/adr/003-srs.md). Mirrors ts-fsrs `Card`. */
export const card = sqliteTable('card', {
  id: text('id').primaryKey(),
  nodeId: text('node_id')
    .notNull()
    .unique()
    .references(() => node.id, { onDelete: 'cascade' }),
  due: integer('due', { mode: 'timestamp_ms' }).notNull(),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  learningSteps: integer('learning_steps').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: integer('state').notNull().default(0),
  lastReview: integer('last_review', { mode: 'timestamp_ms' }),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collection.id, { onDelete: 'cascade' }),
  rootNodeId: text('root_node_id')
    .notNull()
    .references(() => node.id),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
});

/** Append-only log of every move the user plays in a drill. Never updated or deleted. */
export const attempt = sqliteTable(
  'attempt',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id),
    nodeId: text('node_id')
      .notNull()
      .references(() => node.id),
    ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
    result: text('result', { enum: ATTEMPT_RESULTS }).notNull(),
    playedUci: text('played_uci'),
    hints: integer('hints').notNull().default(0),
    timeMs: integer('time_ms').notNull(),
  },
  (t) => [
    index('attempt_node_ts_idx').on(t.nodeId, t.ts),
    index('attempt_session_idx').on(t.sessionId),
    check('attempt_result_check', sql`${t.result} in ('correct','hint','wrong')`),
  ],
);

/**
 * Daily aggregates, derivable from `attempt`. `scope` = 'collection' → `scopeKey` is a
 * collection id; `scope` = 'kind' → `scopeKey` is a CollectionKind.
 */
export const dailyStat = sqliteTable(
  'daily_stat',
  {
    day: text('day').notNull(), // YYYY-MM-DD, local time
    scope: text('scope', { enum: STAT_SCOPES }).notNull(),
    scopeKey: text('scope_key').notNull(),
    attempts: integer('attempts').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    hint: integer('hint').notNull().default(0),
    wrong: integer('wrong').notNull().default(0),
    newCards: integer('new_cards').notNull().default(0),
    timeMs: integer('time_ms').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.scope, t.scopeKey] }),
    check('daily_stat_scope_check', sql`${t.scope} in ('collection','kind')`),
  ],
);

/** Reference table of named openings (lichess-org/chess-openings, CC0), keyed by EPD. */
export const opening = sqliteTable(
  'opening',
  {
    epd: text('epd').primaryKey(),
    eco: text('eco').notNull(),
    name: text('name').notNull(),
    family: text('family').notNull(),
    variation: text('variation'),
  },
  (t) => [index('opening_eco_idx').on(t.eco)],
);

/**
 * Append-only log of completed passes through a line (line = leaf node id, see
 * docs/adr/006-line-drill.md). The clean streak of a line is derived from it.
 */
export const linePass = sqliteTable(
  'line_pass',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collection.id),
    /** Leaf node id of the planned line; not a foreign key, lines are derived. */
    lineId: text('line_id').notNull(),
    clean: integer('clean', { mode: 'boolean' }).notNull(),
    diverged: integer('diverged', { mode: 'boolean' }).notNull(),
    ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('line_pass_collection_ts_idx').on(t.collectionId, t.ts)],
);

export type Collection = typeof collection.$inferSelect;
export type NewCollection = typeof collection.$inferInsert;
export type Node = typeof node.$inferSelect;
export type NewNode = typeof node.$inferInsert;
export type Card = typeof card.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Attempt = typeof attempt.$inferSelect;
export type NewAttempt = typeof attempt.$inferInsert;
export type DailyStat = typeof dailyStat.$inferSelect;
export type Opening = typeof opening.$inferSelect;
export type LinePass = typeof linePass.$inferSelect;

/**
 * Opening lab (ADR 011): one row per completed recall of an opening line. Append-only.
 * `line` is the practised line as space-separated UCI moves from the initial position.
 */
export const labRun = sqliteTable(
  'lab_run',
  {
    id: text('id').primaryKey(),
    ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
    line: text('line').notNull(),
    eco: text('eco'),
    name: text('name'),
    plies: integer('plies').notNull(),
    errors: integer('errors').notNull(),
    hints: integer('hints').notNull(),
    clean: integer('clean', { mode: 'boolean' }).notNull(),
    timeMs: integer('time_ms').notNull(),
  },
  (t) => [index('lab_run_line_ts_idx').on(t.line, t.ts)],
);

/**
 * Opening lab: one row per move of a recall, keyed by the opening-graph edge it exercises
 * (position before as EPD + move). Append-only. `run_id` is the run the move belongs to; the run
 * row is written when the recall ends, so it is not a foreign key (unfinished runs keep their
 * moves).
 */
export const labAttempt = sqliteTable(
  'lab_attempt',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
    epd: text('epd').notNull(),
    uci: text('uci').notNull(),
    ply: integer('ply').notNull(),
    result: text('result', { enum: ATTEMPT_RESULTS }).notNull(),
    playedUci: text('played_uci').notNull(),
    hints: integer('hints').notNull().default(0),
    timeMs: integer('time_ms').notNull(),
  },
  (t) => [
    index('lab_attempt_edge_ts_idx').on(t.epd, t.uci, t.ts),
    check('lab_attempt_result_check', sql`${t.result} in ('correct','hint','wrong')`),
  ],
);

export type LabRun = typeof labRun.$inferSelect;
export type LabAttempt = typeof labAttempt.$inferSelect;
