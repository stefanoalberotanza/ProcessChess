import type {
  Attempt,
  Collection,
  CollectionKind,
  Color,
  EvalMode,
  Node,
  Opening,
  Session,
  AttemptResult,
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

/**
 * Persistence boundary of the app. Implemented over SQLite by every adapter
 * (in-memory for tests, OPFS on the web, tauri-plugin-sql on native).
 */
export interface Storage {
  /** Applies pending migrations. Idempotent. */
  migrate(): Promise<void>;

  /** Creates the collection together with its root node (the start position). */
  createCollection(input: NewCollectionInput): Promise<{ collection: Collection; root: Node }>;
  getCollection(id: string): Promise<Collection | undefined>;
  listCollections(): Promise<Collection[]>;

  /** Adds a move below `parentId`. Throws if the move is illegal in the parent position. */
  addNode(input: NewNodeInput): Promise<Node>;
  getNode(id: string): Promise<Node | undefined>;
  getChildren(parentId: string): Promise<Node[]>;
  findNodesByEpd(epd: string): Promise<Node[]>;

  startSession(collectionId: string, rootNodeId: string): Promise<Session>;
  endSession(sessionId: string): Promise<void>;

  /** Appends to the attempt log. Attempts are never updated or deleted. */
  recordAttempt(input: NewAttemptInput): Promise<Attempt>;
  listAttempts(nodeId: string): Promise<Attempt[]>;

  /** Replaces the `opening` reference table. */
  seedOpenings(rows: Opening[]): Promise<void>;
  getOpeningByEpd(epd: string): Promise<Opening | undefined>;

  close(): Promise<void>;
}
