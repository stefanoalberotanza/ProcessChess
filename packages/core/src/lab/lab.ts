import { openingIndex } from '../openings/data';
import type { GraphEdge, OpeningGraph } from '../openings/graph';
import { OpeningsNotLoadedError } from '../openings/resolve';
import { nodeNames } from '../openings/continuations';

/** Plies asked in a lab session: the first 4 moves of each side. */
export const LAB_PLIES = 8;

export interface PopularOpening {
  eco: string;
  name: string;
  epd: string;
  /** Moves from the initial position (shortest path in the graph). */
  ucis: string[];
  /** Dataset lines that reach the position. */
  lines: number;
}

/**
 * Named openings ranked by the dataset lines that reach them (most used first, then shorter).
 * With `under`, only the openings after that sequence of moves. Needs `loadOpenings()`.
 */
export function popularOpenings(
  graph: OpeningGraph,
  opts: { under?: readonly string[]; limit?: number } = {},
): PopularOpening[] {
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  const under = opts.under ?? [];
  const found: PopularOpening[] = [];
  for (const [epd, [eco, name]] of names) {
    const node = graph.nodeOf(epd);
    if (node === undefined) continue;
    const ucis = graph.pathTo(node);
    if (ucis.length <= under.length || under.some((u, i) => ucis[i] !== u)) continue;
    found.push({ eco, name, epd, ucis, lines: graph.linesThrough(node) });
  }
  found.sort(
    (a, b) => b.lines - a.lines || a.ucis.length - b.ucis.length || a.name.localeCompare(b.name),
  );
  return found.slice(0, opts.limit ?? 12);
}

/**
 * The line practised for an opening: `prefix` extended with the most played book moves up to
 * `plies` (default 8, the first 4 moves); a longer prefix is kept whole.
 */
export function openingLine(
  graph: OpeningGraph,
  prefix: readonly string[],
  plies: number = LAB_PLIES,
): string[] {
  const line = [...prefix];
  let node = graph.root;
  for (const u of prefix) {
    const edge = graph.children(node).find((e) => e.uci === u);
    if (!edge) return line;
    node = edge.child;
  }
  while (line.length < plies) {
    const next: GraphEdge | undefined = graph.children(node)[0];
    if (!next) break;
    line.push(next.uci);
    node = next.child;
  }
  return line;
}

export const PRACTICE_MAX_PLIES = 16;

/**
 * The line practised for a name: its moves, extended along the most played book moves while the
 * next position is unnamed or carries the same name, stopping before any other name (so two names
 * never share a line). At most `PRACTICE_MAX_PLIES`; a longer input is kept whole. Needs
 * `loadOpenings()`.
 */
export function practiceLine(graph: OpeningGraph, ucis: readonly string[]): string[] {
  const names = nodeNames(graph);
  const line = [...ucis];
  let node = graph.root;
  let own: string | undefined;
  for (const u of ucis) {
    const edge = graph.children(node).find((e) => e.uci === u);
    if (!edge) return line;
    node = edge.child;
    own = names.get(node)?.name ?? own;
  }
  while (line.length < PRACTICE_MAX_PLIES) {
    const next: GraphEdge | undefined = graph.children(node)[0];
    if (!next) break;
    const name = names.get(next.child)?.name;
    if (name !== undefined && name !== own) break;
    line.push(next.uci);
    node = next.child;
  }
  return line;
}

export interface PracticeItem {
  eco: string;
  name: string;
  /** The practised line (see `practiceLine`). */
  line: string[];
  lines: number;
}

/**
 * The most used named openings as practice items, one per distinct practice line (several names
 * can share the same first moves: the most used name is kept). Needs `loadOpenings()`.
 */
export function practiceByName(
  graph: OpeningGraph,
  opts: { under?: readonly string[]; limit?: number } = {},
): PracticeItem[] {
  const limit = opts.limit ?? 10;
  const seen = new Set<string>();
  const items: PracticeItem[] = [];
  for (const o of popularOpenings(graph, {
    ...(opts.under ? { under: opts.under } : {}),
    limit: Infinity,
  })) {
    const line = practiceLine(graph, o.ucis);
    const key = line.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ eco: o.eco, name: o.name, line, lines: o.lines });
    if (items.length >= limit) break;
  }
  return items;
}
