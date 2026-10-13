import type {
  CardMap,
  DayStat,
  LinePassRecord,
  RecallAttempt,
  RecallRun,
  SrsCard,
  Tree,
  TreeChanges,
  TreeEdit,
} from '@processchess/core';
import type {
  Attempt,
  AttemptResult,
  Collection,
  LabRun,
  CollectionKind,
  Color,
  EvalMode,
  Node,
  Opening,
  OpeningLabel,
  Session,
} from './schema';

export interface NewCollectionInput {
  name: string;
  kind: CollectionKind;
  /** Defaults to the standard initial position. */
  startFen?: string;
  userColor: Color;
  evalMode: EvalMode;
  source?: string | null;
  license?: string | null;
}

export interface NewNodeInput {
  collectionId: string;
  parentId: string;
  /** Move in UCI from the parent position; SAN and EPD are derived with chess.js. */
  uci: string;
  isUserMove: boolean;
  ord?: number;
  comment?: string | null;
}

export interface NewAttemptInput {
  sessionId: string;
  nodeId: string;
  result: AttemptResult;
  playedUci?: string | null;
  hints?: number;
  timeMs: number;
  /** Defaults to now. */
  ts?: Date;
}

export interface NewLinePassInput extends LinePassRecord {
  sessionId: string;
  collectionId: string;
  ts?: Date;
}

export interface CollectionSummary {
  collection: Collection;
  /** Start of the most recent session, null if never trained. */
  lastTrainedAt: Date | null;
}

export interface MoveHistory {
  /** Up to `limit` most recent attempts, oldest first. */
  recent: Attempt[];
  total: number;
  /** Attempts with result `correct` (right at the first try, no hints). */
  firstTry: number;
  /** firstTry / total, null when there are no attempts. */
  firstTryRate: number | null;
  /** Most frequent first wrong move (UCI) among `wrong` attempts; ties → most recent. */
  mostFrequentWrong: { uci: string; count: number } | null;
}

export interface OpeningStatsQuery {
  /** Grouping: style label, opening family, or opening family + variation. */
  by: 'label' | 'opening' | 'variation';
  /** Only moves of this side: collections where the user plays it, lab moves it played. */
  userColor?: Color;
  /** Repertoire drills, opening lab, or both (default). */
  source?: 'repertoire' | 'lab' | 'all';
}

/** Attempt totals for one label, opening or variation (non-archived collections + lab). */
export interface OpeningStatsRow {
  label: OpeningLabel | null;
  opening: string | null;
  variation: string | null;
  attempts: number;
  correct: number;
  hint: number;
  wrong: number;
  /** Time of the most recent attempt. */
  lastAttemptAt: Date;
}

/**
 * Persistence boundary of the app. Implemented once over SQLite (`SqliteStorage`); adapters
 * (in-memory for tests, OPFS on the web, tauri-plugin-sql on native) only provide the SQL
 * executor.
 */
export interface Storage {
  /** False when data lives in memory only (e.g. OPFS unavailable). */
  readonly persistent: boolean;

  /**
   * Applies pending migrations, then rebuilds the derived state if attempts exist without a
   * card (data from before M2). Idempotent. Returns the tags applied now.
   */
  migrate(): Promise<string[]>;

  /** Creates an empty collection with its root node (the start position). */
  createCollection(input: NewCollectionInput): Promise<{ collection: Collection; root: Node }>;
  /** Creates a collection from a tree built in memory (e.g. by `treeFromPgn`). */
  createCollectionFromTree(
    input: Omit<NewCollectionInput, 'startFen' | 'userColor'>,
    edit: TreeEdit,
  ): Promise<Collection>;
  getCollection(id: string): Promise<Collection | undefined>;
  /** Non-archived collections unless `includeArchived`. */
  listCollections(opts?: { includeArchived?: boolean }): Promise<Collection[]>;
  collectionSummaries(opts?: { includeArchived?: boolean }): Promise<CollectionSummary[]>;
  /** Collections are never deleted (ADR 002). */
  archiveCollection(id: string): Promise<void>;
  unarchiveCollection(id: string): Promise<void>;

  loadTree(collectionId: string): Promise<Tree>;
  /** Persists the result of a core tree operation atomically. */
  applyTreeChanges(collectionId: string, changes: TreeChanges): Promise<void>;
  /** Nodes of the collection that have at least one attempt (for `deleteSubtree`). */
  nodeIdsWithAttempts(collectionId: string): Promise<Set<string>>;

  /** Adds a single move below `parentId`. Throws if illegal in the parent position. */
  addNode(input: NewNodeInput): Promise<Node>;
  getNode(id: string): Promise<Node | undefined>;
  getChildren(parentId: string): Promise<Node[]>;
  findNodesByEpd(epd: string): Promise<Node[]>;

  startSession(collectionId: string, rootNodeId: string): Promise<Session>;
  endSession(sessionId: string): Promise<void>;

  /**
   * Appends to the attempt log and, in the same transaction, updates the derived state: the
   * FSRS card of the move and the daily stats. Attempts are never updated or deleted.
   */
  recordAttempt(input: NewAttemptInput): Promise<{ attempt: Attempt; card: SrsCard }>;
  listAttempts(nodeId: string): Promise<Attempt[]>;
  getMoveHistory(nodeId: string, limit?: number): Promise<MoveHistory>;

  /** Appends to the line pass log. */
  recordLinePass(input: NewLinePassInput): Promise<void>;
  /** All passes of a collection, oldest first. */
  listLinePasses(collectionId: string): Promise<LinePassRecord[]>;

  /** FSRS cards of the moves of a collection, keyed by node id. */
  listCards(collectionId: string): Promise<CardMap>;
  /**
   * Daily totals between two local days (YYYY-MM-DD, inclusive), oldest first, only days with
   * attempts. All collections unless `collectionId`.
   */
  dailyStats(range: { from: string; to: string; collectionId?: string }): Promise<DayStat[]>;
  /** Recomputes cards and daily stats from the attempt log. */
  rebuildDerived(): Promise<void>;

  /**
   * Re-runs the opening classification on every standard-start collection, so moves stored
   * before classification existed or under older rules are brought up to date. Requires
   * `loadOpenings()`. Returns how many collections had at least one node change.
   */
  reclassifyOpenings(): Promise<number>;
  /** Attempt totals grouped by opening label, opening or variation, sorted by key. */
  openingStats(query: OpeningStatsQuery): Promise<OpeningStatsRow[]>;

  /** Replaces the `opening` reference table. */
  seedOpenings(rows: Opening[]): Promise<void>;
  getOpeningByEpd(epd: string): Promise<Opening | undefined>;

  /** Opening lab (ADR 011): appends one move of a recall, keyed by graph edge. */
  recordLabAttempt(input: NewLabAttemptInput): Promise<void>;
  /** Opening lab: appends a completed recall of a line. */
  recordLabRun(input: NewLabRunInput): Promise<void>;
  /** Per practised line (UCI moves joined by spaces): runs, clean streak, last run. */
  labRunSummaries(): Promise<Map<string, LabRunSummary>>;
  /** Runs of one line, oldest first (the last `limit`). */
  labRuns(line: readonly string[], limit?: number): Promise<LabRun[]>;
  /** Per graph edge (`${epd} ${uci}`): attempts, right at the first try, last results. */
  labEdgeStats(): Promise<Map<string, LabEdgeStats>>;

  close(): Promise<void>;
}

export interface NewLabAttemptInput extends RecallAttempt {
  runId: string;
  ts?: Date;
}

export interface NewLabRunInput extends RecallRun {
  id: string;
  line: readonly string[];
  eco: string | null;
  name: string | null;
  ts?: Date;
}

export interface LabRunSummary {
  runs: number;
  /** Consecutive clean runs, most recent first. */
  cleanStreak: number;
  lastAt: Date;
  lastClean: boolean;
}

export interface LabEdgeStats {
  total: number;
  firstTry: number;
  /** Last 5 results, oldest first. */
  recent: AttemptResult[];
  /** The mistake of the most recent wrong attempt, if any. */
  lastWrongUci: string | null;
}
