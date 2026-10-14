import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { openingIndex } from './data';
import { epdHash } from './hash';
import { OpeningsNotLoadedError } from './resolve';
import type { OpeningGraphJson } from './types';

export { epdHash } from './hash';

export interface GraphEdge {
  uci: string;
  child: number;
  /** Dataset lines that go through this move. */
  lines: number;
}

/** Positions of the openings dataset and their book moves (transpositions merged). */
export interface OpeningGraph {
  readonly root: number;
  readonly size: number;
  nodeOf(epd: string): number | undefined;
  /** Book moves from `node`, most played first. */
  children(node: number): readonly GraphEdge[];
  /** Moves (UCI) of a shortest path from the initial position to `node`. */
  pathTo(node: number): string[];
  /** Dataset lines that reach `node` (all of them for the initial position). */
  linesThrough(node: number): number;
}

function decode(json: OpeningGraphJson): OpeningGraph {
  const byHash = new Map<string, number>();
  const kids: GraphEdge[][] = json.nodes.map(([hash, edges], id) => {
    byHash.set(hash, id);
    if (!edges) return [];
    return edges.split(' ').map((e) => {
      const [uci, child, lines] = e.split(',');
      return { uci: uci!, child: parseInt(child!, 36), lines: parseInt(lines!, 36) };
    });
  });
  const inLines = new Array<number>(kids.length).fill(0);
  for (const edges of kids) for (const e of edges) inLines[e.child]! += e.lines;
  inLines[0] = kids[0]!.reduce((n, e) => n + e.lines, 0);
  // breadth-first parents → shortest paths
  const parent = new Int32Array(kids.length).fill(-1);
  const via: string[] = new Array(kids.length);
  parent[0] = 0;
  const queue = [0];
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q]!;
    for (const e of kids[n]!) {
      if (parent[e.child] !== -1) continue;
      parent[e.child] = n;
      via[e.child] = e.uci;
      queue.push(e.child);
    }
  }
  return {
    root: 0,
    size: kids.length,
    nodeOf: (epd) => byHash.get(epdHash(epd)),
    children: (node) => kids[node] ?? [],
    linesThrough: (node) => inLines[node] ?? 0,
    pathTo: (node) => {
      const path: string[] = [];
      for (let n = node; n !== 0; n = parent[n]!) {
        if (parent[n] === -1) throw new Error(`Node ${node} unreachable`);
        path.push(via[n]!);
      }
      return path.reverse();
    },
  };
}

let pending: Promise<OpeningGraph> | undefined;

/** Loads the opening graph (its own lazy chunk). Memoised. */
export function loadOpeningGraph(): Promise<OpeningGraph> {
  pending ??= import('./opening-graph.json').then((m) =>
    decode(m.default as unknown as OpeningGraphJson),
  );
  return pending;
}

function play(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

export interface BookMove {
  uci: string;
  san: string;
  lines: number;
  /** ECO and name of the resulting position when it is a named opening. */
  eco: string | null;
  name: string | null;
}

/**
 * Book moves from the position `fen` (empty when it is not in the dataset). Needs
 * `loadOpenings()` for the names.
 */
export function bookMoves(graph: OpeningGraph, fen: string): BookMove[] {
  const node = graph.nodeOf(toEpd(fen));
  if (node === undefined) return [];
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  return graph.children(node).map((e) => {
    const chess = new Chess(fen);
    const move = play(chess, e.uci);
    const named = names.get(toEpd(chess.fen()));
    return {
      uci: e.uci,
      san: move.san,
      lines: e.lines,
      eco: named?.[0] ?? null,
      name: named?.[1] ?? null,
    };
  });
}

/**
 * Repertoire lines from `fen` following the dataset: for `userColor` only the most played book
 * move, for the opponent every book reply, until the book ends. Lines are UCI moves from `fen`.
 */
export function bookLinesFrom(
  graph: OpeningGraph,
  fen: string,
  userColor: 'w' | 'b',
  opts: { maxLines?: number } = {},
): string[][] {
  const start = graph.nodeOf(toEpd(fen));
  if (start === undefined) return [];
  const max = opts.maxLines ?? Infinity;
  const lines: string[][] = [];
  const startWhite = fen.split(' ')[1] === 'w';
  const visit = (node: number, path: string[], onPath: Set<number>) => {
    if (lines.length >= max) return;
    const whiteToMove = (path.length % 2 === 0) === startWhite;
    const userToMove = whiteToMove === (userColor === 'w');
    // avoid cycles through transpositions back to a position already on the path
    const kids = graph.children(node).filter((e) => !onPath.has(e.child));
    if (kids.length === 0) {
      if (path.length) lines.push(path);
      return;
    }
    for (const e of userToMove ? kids.slice(0, 1) : kids) {
      onPath.add(e.child);
      visit(e.child, [...path, e.uci], onPath);
      onPath.delete(e.child);
    }
  };
  visit(start, [], new Set([start]));
  return lines;
}

export interface OpeningSearchResult {
  eco: string;
  name: string;
  epd: string;
  /** Moves from the initial position (UCI). */
  uci: string[];
}

/**
 * Named openings whose "ECO name" contains every word of `query` (case-insensitive), shortest
 * line first. Needs `loadOpenings()`.
 */
export function searchOpenings(
  graph: OpeningGraph,
  query: string,
  limit = 20,
): OpeningSearchResult[] {
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const found: OpeningSearchResult[] = [];
  for (const [epd, [eco, name]] of names) {
    const text = `${eco} ${name}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) continue;
    const node = graph.nodeOf(epd);
    if (node === undefined) continue;
    found.push({ eco, name, epd, uci: graph.pathTo(node) });
  }
  found.sort((a, b) => a.uci.length - b.uci.length || a.name.localeCompare(b.name));
  return found.slice(0, limit);
}

export interface PositionSearchResult {
  /** The position's opening: its own name, or the nearest named position on its book path. */
  position: OpeningSearchResult;
  /** Named openings reachable from the position, shortest line first. */
  reachable: OpeningSearchResult[];
}

/**
 * Looks up a position by FEN, whatever move order reached it (the graph merges
 * transpositions by EPD). Null for an invalid FEN or a position outside the dataset.
 * Needs `loadOpenings()`.
 */
export function searchPosition(
  graph: OpeningGraph,
  fen: string,
  limit = 20,
): PositionSearchResult | null {
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  let epd: string;
  try {
    epd = toEpd(new Chess(fen.trim()).fen());
  } catch {
    return null;
  }
  const start = graph.nodeOf(epd);
  if (start === undefined) return null;
  const uci = graph.pathTo(start);
  // nearest named position on the shortest book path, the position itself first
  const chess = new Chess();
  const epds = [toEpd(chess.fen())];
  for (const u of uci) {
    play(chess, u);
    epds.push(toEpd(chess.fen()));
  }
  let at = epds.length - 1;
  while (at > 0 && !names.has(epds[at]!)) at--;
  const named = names.get(epds[at]!);
  const position: OpeningSearchResult = {
    eco: named?.[0] ?? '',
    name: named?.[1] ?? '',
    epd: epds[at]!,
    uci: uci.slice(0, at),
  };
  // breadth-first over the descendants: paths come out shortest first
  const reachable: OpeningSearchResult[] = [];
  const seen = new Set([start]);
  const queue: { node: number; fen: string; uci: string[] }[] = [
    { node: start, fen: new Chess(fen.trim()).fen(), uci },
  ];
  for (let q = 0; q < queue.length && reachable.length < limit; q++) {
    const cur = queue[q]!;
    for (const e of graph.children(cur.node)) {
      if (seen.has(e.child)) continue;
      seen.add(e.child);
      const c = new Chess(cur.fen);
      play(c, e.uci);
      const next = { node: e.child, fen: c.fen(), uci: [...cur.uci, e.uci] };
      const hit = names.get(toEpd(next.fen));
      if (hit && reachable.length < limit) {
        reachable.push({ eco: hit[0], name: hit[1], epd: toEpd(next.fen), uci: next.uci });
      }
      queue.push(next);
    }
  }
  return { position, reachable };
}

/**
 * True when `fen` is a position of the openings dataset: on a book line, whether or not the
 * dataset gives that position a name. "Out of theory" means this is false.
 */
export function isBookPosition(graph: OpeningGraph, fen: string): boolean {
  return graph.nodeOf(toEpd(fen)) !== undefined;
}
