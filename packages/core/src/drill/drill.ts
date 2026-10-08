import { childrenOf, parseUci, positionAt } from '../tree/tree';
import type { Tree, TreeNode } from '../tree/types';

/** A line: the path from the root (excluded) to a leaf. Identified by its leaf node id. */
export interface Line {
  id: string;
  nodeIds: string[];
}

export type MoveOutcome = 'correct' | 'alternative' | 'wrong';
export type AttemptResult = 'correct' | 'hint' | 'wrong';

/** One completed pass through a line. Stored append-only (`line_pass` table). */
export interface LinePassRecord {
  lineId: string;
  /** No wrong move and no hint in the whole pass. */
  clean: boolean;
  /** The user played an alternative and left the planned line. */
  diverged: boolean;
}

/** To be appended to the `attempt` log: one per user node per pass. */
export interface AttemptRecord {
  nodeId: string;
  result: AttemptResult;
  /** The first wrong move if any, otherwise the move played. */
  playedUci: string;
  hints: number;
  /** From the moment the position was shown to the accepted move. */
  timeMs: number;
}

export interface Hint {
  level: 1 | 2 | 3;
  /** chess.js piece type: p n b r q k */
  piece: string;
  from?: string;
  uci?: string;
}

export interface LineDrillOptions {
  /** Consecutive clean passes that make a line clean. Default 3. */
  cleanThreshold?: number;
  /** Shuffle lines within the "not clean" and "clean" groups using `rng`. */
  shuffle?: boolean;
  rng?: () => number;
  /** Milliseconds clock, injectable for tests. Default `Date.now`. */
  clock?: () => number;
  /** Start with this line (leaf id). */
  lineId?: string;
}

export interface DrillCollection {
  tree: Tree;
  /** Past passes, oldest first. */
  passes?: readonly LinePassRecord[];
}

export type DrillPhase = 'user' | 'retry' | 'line-complete' | 'done';

export interface DrillState {
  readonly tree: Tree;
  readonly cleanThreshold: number;
  readonly clock: () => number;
  readonly lines: ReadonlyMap<string, Line>;
  /** Line ids in drill order. */
  readonly queue: readonly string[];
  readonly queueIndex: number;
  readonly line: Line;
  readonly phase: DrillPhase;
  /** Node of the position on the board. */
  readonly currentId: string;
  /** Nodes played in this pass (root excluded). */
  readonly pathIds: readonly string[];
  readonly diverged: boolean;
  /** Main user move expected now (phase user/retry). */
  readonly expectedId: string | null;
  /** UCI of the right move, shown after a wrong move. */
  readonly reveal: string | null;
  readonly hintLevel: 0 | 1 | 2 | 3;
  readonly firstWrongUci: string | null;
  readonly shownAt: number;
  readonly passHadError: boolean;
  readonly lastOpponentMove: { nodeId: string; uci: string; san: string } | null;
  /** Past passes plus the ones completed in this session, oldest first. */
  readonly passes: readonly LinePassRecord[];
}

export interface SubmitResult {
  state: DrillState;
  outcome: MoveOutcome;
  attempt?: AttemptRecord;
  pass?: LinePassRecord;
  opponentMove?: { nodeId: string; uci: string; san: string };
}

/**
 * All lines of the tree: every opponent branch is followed, among user moves only the main one
 * (ord 0). Depth-first in `ord` order.
 */
export function enumerateLines(tree: Tree): Line[] {
  const lines: Line[] = [];
  const visit = (id: string, path: string[]) => {
    const kids = childrenOf(tree, id);
    if (kids.length === 0) {
      if (path.length) lines.push({ id, nodeIds: path });
      return;
    }
    const follow = kids[0]!.isUserMove ? [kids[0]!] : kids;
    for (const k of follow) visit(k.id, [...path, k.id]);
  };
  visit(tree.rootId, []);
  return lines;
}

/**
 * Clean streak of a line from its passes (oldest first): a pass with errors resets it, a clean
 * pass on the planned line increments it, a clean pass that diverged leaves it unchanged.
 */
export function lineStatus(
  passes: readonly LinePassRecord[],
  lineId: string,
  threshold = 3,
): { cleanStreak: number; clean: boolean } {
  let streak = 0;
  for (const p of passes) {
    if (p.lineId !== lineId) continue;
    if (!p.clean) streak = 0;
    else if (!p.diverged) streak++;
  }
  return { cleanStreak: streak, clean: streak >= threshold };
}

export function drillProgress(state: DrillState): { clean: number; total: number } {
  let clean = 0;
  for (const id of state.lines.keys()) {
    if (lineStatus(state.passes, id, state.cleanThreshold).clean) clean++;
  }
  return { clean, total: state.lines.size };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function startLineDrill(
  collection: DrillCollection,
  options: LineDrillOptions = {},
): DrillState {
  const tree = collection.tree;
  const passes = [...(collection.passes ?? [])];
  const threshold = options.cleanThreshold ?? 3;
  const all = enumerateLines(tree);
  const lines = new Map(all.map((l) => [l.id, l]));
  const isClean = (l: Line) => lineStatus(passes, l.id, threshold).clean;
  let todo = all.filter((l) => !isClean(l));
  let done = all.filter(isClean);
  if (options.shuffle) {
    const rng = options.rng ?? Math.random;
    todo = shuffled(todo, rng);
    done = shuffled(done, rng);
  }
  let queue = [...todo, ...done].map((l) => l.id);
  if (options.lineId && lines.has(options.lineId)) {
    queue = [options.lineId, ...queue.filter((id) => id !== options.lineId)];
  }
  const base = {
    tree,
    cleanThreshold: threshold,
    clock: options.clock ?? Date.now,
    lines,
    queue,
    passes,
  };
  if (queue.length === 0) {
    return {
      ...base,
      queueIndex: 0,
      line: { id: tree.rootId, nodeIds: [] },
      phase: 'done',
      currentId: tree.rootId,
      pathIds: [],
      diverged: false,
      expectedId: null,
      reveal: null,
      hintLevel: 0,
      firstWrongUci: null,
      shownAt: base.clock(),
      passHadError: false,
      lastOpponentMove: null,
    };
  }
  return beginLine({ ...base, queueIndex: 0 } as unknown as DrillState, 0);
}

/** Restarts the line at `queueIndex` from the root and plays opponent moves up to the user's turn. */
function beginLine(state: DrillState, queueIndex: number): DrillState {
  if (queueIndex >= state.queue.length) {
    return { ...state, queueIndex, phase: 'done', expectedId: null, reveal: null };
  }
  const line = state.lines.get(state.queue[queueIndex]!)!;
  const s: DrillState = {
    ...state,
    queueIndex,
    line,
    phase: 'user',
    currentId: state.tree.rootId,
    pathIds: [],
    diverged: false,
    expectedId: null,
    reveal: null,
    hintLevel: 0,
    firstWrongUci: null,
    shownAt: state.clock(),
    passHadError: false,
    lastOpponentMove: null,
  };
  return advance(s).state;
}

/** Next node along the plan (or the main continuation once diverged). */
function plannedChild(s: DrillState, kids: TreeNode[]): TreeNode {
  if (!s.diverged) {
    const planned = s.line.nodeIds[s.pathIds.length];
    const k = kids.find((c) => c.id === planned);
    if (k) return k;
  }
  return kids[0]!;
}

/**
 * Plays opponent moves automatically, then either waits for the user or completes the line.
 */
type OpponentMove = NonNullable<DrillState['lastOpponentMove']>;

function advance(s: DrillState): {
  state: DrillState;
  pass?: LinePassRecord;
  opponentMove?: OpponentMove;
} {
  let state = s;
  let opponentMove: OpponentMove | null = null;
  for (;;) {
    const kids = childrenOf(state.tree, state.currentId);
    if (kids.length === 0) {
      const pass: LinePassRecord = {
        lineId: state.line.id,
        clean: !state.passHadError,
        diverged: state.diverged,
      };
      return {
        state: {
          ...state,
          phase: 'line-complete',
          expectedId: null,
          reveal: null,
          lastOpponentMove: opponentMove ?? state.lastOpponentMove,
          passes: [...state.passes, pass],
        },
        pass,
        ...(opponentMove ? { opponentMove } : {}),
      };
    }
    if (kids[0]!.isUserMove) {
      return {
        state: {
          ...state,
          phase: 'user',
          expectedId: plannedChild(state, kids).id,
          reveal: null,
          hintLevel: 0,
          firstWrongUci: null,
          shownAt: state.clock(),
          lastOpponentMove: opponentMove ?? state.lastOpponentMove,
        },
        ...(opponentMove ? { opponentMove } : {}),
      };
    }
    const reply = plannedChild(state, kids);
    opponentMove = { nodeId: reply.id, uci: reply.uci!, san: reply.san! };
    state = { ...state, currentId: reply.id, pathIds: [...state.pathIds, reply.id] };
  }
}

export function submitMove(state: DrillState, uci: string): SubmitResult {
  if (state.phase !== 'user' && state.phase !== 'retry') {
    throw new Error(`No move expected in phase ${state.phase}`);
  }
  const move = uci.toLowerCase();
  const kids = childrenOf(state.tree, state.currentId);
  const match = kids.find((k) => k.uci === move);
  const expected = state.tree.nodes.get(state.expectedId!)!;

  if (!match) {
    return {
      outcome: 'wrong',
      state: {
        ...state,
        phase: 'retry',
        reveal: expected.uci,
        firstWrongUci: state.firstWrongUci ?? move,
        passHadError: true,
      },
    };
  }

  const outcome: MoveOutcome = match.id === expected.id ? 'correct' : 'alternative';
  const attempt: AttemptRecord = {
    nodeId: match.id,
    result: state.firstWrongUci ? 'wrong' : state.hintLevel > 0 ? 'hint' : 'correct',
    playedUci: state.firstWrongUci ?? move,
    hints: state.hintLevel,
    timeMs: state.clock() - state.shownAt,
  };
  const moved: DrillState = {
    ...state,
    currentId: match.id,
    pathIds: [...state.pathIds, match.id],
    diverged: state.diverged || outcome === 'alternative',
    passHadError: state.passHadError || state.hintLevel > 0,
  };
  const next = advance(moved);
  return { outcome, attempt, ...next };
}

/** Next hint level for the expected move: piece, then origin square, then the full move. */
export function requestHint(state: DrillState): { state: DrillState; hint: Hint } {
  if (state.phase !== 'user' && state.phase !== 'retry') {
    throw new Error(`No move expected in phase ${state.phase}`);
  }
  const expected = state.tree.nodes.get(state.expectedId!)!;
  const { from } = parseUci(expected.uci!);
  const piece = positionAt(state.tree, state.currentId).get(from as never)!.type;
  const level = Math.min(3, state.hintLevel + 1) as 1 | 2 | 3;
  const hint: Hint =
    level === 1
      ? { level, piece }
      : level === 2
        ? { level, piece, from }
        : { level, piece, from, uci: expected.uci! };
  return { state: { ...state, hintLevel: level }, hint };
}

/** Restarts the current line (an unfinished pass is discarded; its attempts stay logged). */
export function repeatLine(state: DrillState): DrillState {
  if (state.phase === 'done') return state;
  return beginLine(state, state.queueIndex);
}

/** Moves on to the next line in the queue, or to `done`. */
export function nextLine(state: DrillState): DrillState {
  return beginLine(state, state.queueIndex + 1);
}
