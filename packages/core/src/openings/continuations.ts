import { openingIndex } from './data';
import type { OpeningGraph } from './graph';
import { LABEL_OWN_FAMILY, OpeningsNotLoadedError, splitOpeningName } from './resolve';

/** An opening of another family reached by moves from the board position. */
export interface Continuation {
  /** Full dataset name of the first position of that family ("Ruy Lopez"). */
  name: string;
  family: string;
  /** Moves from the initial position to that position. */
  ucis: string[];
  /** Moves from the board position only (the row's move label). */
  via: string[];
}

const MAX_PLIES = 12;
const cache = new WeakMap<OpeningGraph, Map<number, { eco: string; name: string }>>();

/** Graph node → dataset name, built once per graph. Needs `loadOpenings()`. */
export function nodeNames(graph: OpeningGraph): ReadonlyMap<number, { eco: string; name: string }> {
  const hit = cache.get(graph);
  if (hit) return hit;
  const index = openingIndex();
  if (!index) throw new OpeningsNotLoadedError();
  const out = new Map<number, { eco: string; name: string }>();
  for (const [epd, [eco, name]] of index) {
    const node = graph.nodeOf(epd);
    if (node !== undefined) out.set(node, { eco, name });
  }
  cache.set(graph, out);
  return out;
}

/**
 * Openings of other families reachable from the position after `ucis`: breadth-first over the
 * graph, each path stopping at its first named position of another family (the style's own
 * name does not count, ADR 012). Each family once, at its shallowest position; most played first.
 */
export function continuationsFrom(graph: OpeningGraph, ucis: readonly string[]): Continuation[] {
  const names = nodeNames(graph);
  // the style's own name (King's / Queen's Pawn Game) is never an opening (ADR 012)
  const styles = new Set(Object.values(LABEL_OWN_FAMILY).filter((f) => f !== null));
  const familyOf = (node: number): string | null => {
    const named = names.get(node);
    if (!named) return null;
    const { family } = splitOpeningName(named.name);
    return styles.has(family) ? null : family;
  };

  let start = graph.root;
  let current: string | null = null;
  for (const uci of ucis) {
    const edge = graph.children(start).find((e) => e.uci === uci);
    if (!edge) return [];
    start = edge.child;
    current = familyOf(start) ?? current;
  }

  const found = new Map<string, { node: number; name: string; via: string[] }>();
  const seen = new Set([start]);
  let frontier: { node: number; via: string[] }[] = [{ node: start, via: [] }];
  for (let ply = 1; ply <= MAX_PLIES && frontier.length; ply++) {
    const next: typeof frontier = [];
    const stops: { node: number; family: string; via: string[] }[] = [];
    for (const { node, via } of frontier) {
      for (const e of graph.children(node)) {
        if (seen.has(e.child)) continue;
        seen.add(e.child);
        const path = [...via, e.uci];
        const family = familyOf(e.child);
        if (family !== null && family !== current) stops.push({ node: e.child, family, via: path });
        else next.push({ node: e.child, via: path });
      }
    }
    // shallowest stop per family; at equal depth the most played
    stops.sort((a, b) => graph.linesThrough(b.node) - graph.linesThrough(a.node));
    for (const s of stops) {
      if (!found.has(s.family))
        found.set(s.family, { node: s.node, name: names.get(s.node)!.name, via: s.via });
    }
    frontier = next;
  }

  return [...found.entries()]
    .sort(
      ([fa, a], [fb, b]) =>
        graph.linesThrough(b.node) - graph.linesThrough(a.node) || fa.localeCompare(fb),
    )
    .map(([family, f]) => ({ name: f.name, family, ucis: [...ucis, ...f.via], via: f.via }));
}

/**
 * True when nothing else in the openings dataset follows the position after `ucis`: no position
 * reachable from it carries a name other than its own or one of its ancestors ("Sicilian
 * Defense" for "Sicilian Defense: Open"). False off book and for an unnamed position.
 */
export function isDictionaryLeaf(graph: OpeningGraph, ucis: readonly string[]): boolean {
  const names = nodeNames(graph);
  let node = graph.root;
  let own: string | undefined;
  for (const uci of ucis) {
    const edge = graph.children(node).find((e) => e.uci === uci);
    if (!edge) return false;
    node = edge.child;
    own = names.get(node)?.name ?? own;
  }
  if (own === undefined) return false;
  const isAncestor = (name: string) =>
    name === own || own!.startsWith(`${name}:`) || own!.startsWith(`${name},`);
  const seen = new Set([node]);
  const queue = [node];
  for (let q = 0; q < queue.length; q++) {
    for (const e of graph.children(queue[q]!)) {
      if (seen.has(e.child)) continue;
      seen.add(e.child);
      const name = names.get(e.child)?.name;
      if (name !== undefined && !isAncestor(name)) return false;
      queue.push(e.child);
    }
  }
  return true;
}

/**
 * Every branch of the openings dictionary from the position after `ucis`: breadth-first over the
 * graph, each path stopping at its first position named neither like the current one nor like
 * one of its ancestors (nor a style's own name, ADR 012). Each name once, at its shallowest
 * position; most played first. Unlike `continuationsFrom`, names of the same family count.
 */
export function branchesFrom(graph: OpeningGraph, ucis: readonly string[]): Continuation[] {
  const names = nodeNames(graph);
  const styles = new Set(Object.values(LABEL_OWN_FAMILY).filter((f) => f !== null));
  let start = graph.root;
  let own: string | undefined;
  for (const uci of ucis) {
    const edge = graph.children(start).find((e) => e.uci === uci);
    if (!edge) return [];
    start = edge.child;
    own = names.get(start)?.name ?? own;
  }
  const passThrough = (name: string) =>
    styles.has(name) ||
    (own !== undefined &&
      (name === own || own.startsWith(`${name}:`) || own.startsWith(`${name},`)));

  const found = new Map<string, { node: number; via: string[] }>();
  const seen = new Set([start]);
  let frontier: { node: number; via: string[] }[] = [{ node: start, via: [] }];
  for (let ply = 1; ply <= MAX_PLIES && frontier.length; ply++) {
    const next: typeof frontier = [];
    const stops: { node: number; name: string; via: string[] }[] = [];
    for (const { node, via } of frontier) {
      for (const e of graph.children(node)) {
        if (seen.has(e.child)) continue;
        seen.add(e.child);
        const path = [...via, e.uci];
        const name = names.get(e.child)?.name;
        if (name !== undefined && !passThrough(name))
          stops.push({ node: e.child, name, via: path });
        else next.push({ node: e.child, via: path });
      }
    }
    stops.sort((a, b) => graph.linesThrough(b.node) - graph.linesThrough(a.node));
    for (const s of stops) if (!found.has(s.name)) found.set(s.name, { node: s.node, via: s.via });
    frontier = next;
  }

  return [...found.entries()]
    .sort(
      ([na, a], [nb, b]) =>
        graph.linesThrough(b.node) - graph.linesThrough(a.node) || na.localeCompare(nb),
    )
    .map(([name, f]) => ({
      name,
      family: splitOpeningName(name).family,
      ucis: [...ucis, ...f.via],
      via: f.via,
    }));
}

/** The moves all `lines` share from the start (where a group of branches still is one line). */
export function commonPrefix(lines: readonly (readonly string[])[]): string[] {
  const [first, ...rest] = lines;
  if (!first) return [];
  let n = first.length;
  for (const line of rest) {
    let i = 0;
    while (i < n && i < line.length && line[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n);
}

/**
 * Whose openings lie at or after the position after `ucis`: for every named position reachable
 * from it (the position itself included), the side that played its defining move. A style's own
 * name (King's / Queen's Pawn Game) is not an opening (ADR 012).
 */
export function sidesFrom(
  graph: OpeningGraph,
  ucis: readonly string[],
): { w: boolean; b: boolean } {
  const names = nodeNames(graph);
  const styles = new Set(Object.values(LABEL_OWN_FAMILY).filter((f) => f !== null));
  const sides = { w: false, b: false };
  let start = graph.root;
  for (const uci of ucis) {
    const edge = graph.children(start).find((e) => e.uci === uci);
    if (!edge) return sides;
    start = edge.child;
  }
  // positions are merged by EPD, so the side to move (and the depth parity) is the same on
  // every path to a node
  const seen = new Set([start]);
  const queue: [number, number][] = [[start, ucis.length]];
  for (let q = 0; q < queue.length && !(sides.w && sides.b); q++) {
    const [node, plies] = queue[q]!;
    const name = names.get(node)?.name;
    if (plies > 0 && name !== undefined && !styles.has(name))
      sides[plies % 2 === 1 ? 'w' : 'b'] = true;
    for (const e of graph.children(node)) {
      if (seen.has(e.child)) continue;
      seen.add(e.child);
      queue.push([e.child, plies + 1]);
    }
  }
  return sides;
}
