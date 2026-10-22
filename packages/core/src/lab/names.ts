import { openingIndex } from '../openings/data';
import type { OpeningGraph } from '../openings/graph';
import { LABEL_OWN_FAMILY, OpeningsNotLoadedError, labelOfUci } from '../openings/resolve';
import type { OpeningLabel } from '../openings/types';
import { type OpeningSide, openingSide } from './opening-side';

/**
 * "Family: Variation, Subvariation" → ["Family", "Variation", "Subvariation"]. A name without a
 * colon ("French Defense, Classical, 4. Bg5") is cut at its commas, as `splitOpeningName` does.
 */
export function nameSegments(name: string): string[] {
  const colon = name.indexOf(':');
  const parts =
    colon === -1 ? name.split(',') : [name.slice(0, colon), ...name.slice(colon + 1).split(',')];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Inverse of `nameSegments`; also the key of a name-tree node. */
export function joinSegments(segments: readonly string[]): string {
  const [family, ...rest] = segments;
  return rest.length ? `${family}: ${rest.join(', ')}` : family!;
}

/** Level of the hierarchy: an opening (a root, e.g. Sicilian Defense) or a variation below it. */
export type NameKind = 'opening' | 'variation';

export interface NameNode {
  kind: NameKind;
  /** Full name of this level, e.g. "Sicilian Defense: Najdorf Variation". */
  key: string;
  /** Last segment, e.g. "Najdorf Variation". */
  label: string;
  /** 0 = family, 1 = subfamily or variation of the family, 2+ = sub-variations. */
  depth: number;
  parent: string | null;
  /** Child levels, most used first. */
  children: string[];
  /** True when the dataset names a position with exactly this name. */
  own: boolean;
  /**
   * Dataset name of that position, e.g. "London System, with Bd3" (the key may differ: "London
   * System: with Bd3"); null for a group without a position of its own.
   */
  name: string | null;
  eco: string;
  /**
   * Moves to the position of this name (the shortest when several positions share it). For a
   * group without a position of its own, the moves of its most used child.
   */
  ucis: string[];
  /** Dataset lines that reach the position (popularity). */
  lines: number;
  /** Whose opening it is: the side that plays its defining (last) move. */
  side: 'w' | 'b' | null;
  /** Openings only: whose opening it is (null for variations). */
  owner: OpeningSide | null;
  /** Style of its first move: 1.e4 king, 1.d4 queen, anything else flank (ADR 012). */
  style: OpeningLabel | null;
}

/** Side that played the last of `ucis` from the initial position (null when empty). */
export function moverOfLast(ucis: readonly string[]): 'w' | 'b' | null {
  if (ucis.length === 0) return null;
  return ucis.length % 2 === 1 ? 'w' : 'b';
}

export interface NameTree {
  roots: string[];
  get(key: string): NameNode | undefined;
  /**
   * The node of a full opening name from the dataset. The style's own name ("King's Pawn Game")
   * is the family node.
   */
  nodeForName(name: string): NameNode | undefined;
  all(): Iterable<NameNode>;
}

/**
 * The opening names of the dataset as a hierarchy Opening → Variation → Subvariation…. The roots
 * are the openings, most played first. The style names ("King's Pawn Game", "Queen's Pawn Game")
 * are not openings: each of their variations is an opening of its own. The hierarchy is by name,
 * not by moves: a variation may be reached through moves named after another opening
 * (transpositions) and vice versa. Needs `loadOpenings()`.
 */
export function buildNameTree(graph: OpeningGraph): NameTree {
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  const nodes = new Map<string, NameNode>();
  // a name without a colon that is a family of other names stays whole
  // ("Vienna Gambit, with Max Lange Defense" and "…: Steinitz Gambit")
  const families = new Set<string>();
  for (const [, name] of names.values()) if (name.includes(':')) families.add(name.split(':')[0]!);
  const segmentsOf = (name: string) => (families.has(name) ? [name] : nameSegments(name));

  const ensure = (segments: string[]): NameNode => {
    const key = joinSegments(segments);
    let n = nodes.get(key);
    if (!n) {
      const parent = segments.length > 1 ? ensure(segments.slice(0, -1)) : null;
      n = {
        key,
        label: segments.at(-1)!,
        depth: segments.length - 1,
        parent: parent?.key ?? null,
        kind: parent ? 'variation' : 'opening',
        children: [],
        own: false,
        name: null,
        eco: '',
        ucis: [],
        lines: 0,
        side: null,
        style: null,
        owner: null,
      };
      nodes.set(key, n);
      parent?.children.push(key);
    }
    return n;
  };

  for (const [epd, [eco, name]] of names) {
    const graphNode = graph.nodeOf(epd);
    if (graphNode === undefined) continue;
    const n = ensure(segmentsOf(name));
    const ucis = graph.pathTo(graphNode);
    // a one-move position is a style label, not an opening (ADR 012): prefer any deeper one
    const rank = (u: readonly string[]) => (u.length < 2 ? 1000 : 0) + u.length;
    if (!n.own || rank(ucis) < rank(n.ucis)) {
      n.own = true;
      n.name = name;
      n.eco = eco;
      n.ucis = ucis;
      n.lines = graph.linesThrough(graphNode);
      n.side = moverOfLast(ucis);
    }
  }

  // a level named only at one move, with variations below, is a group of them (a label)
  for (const n of nodes.values())
    if (n.own && n.ucis.length < 2 && n.children.length) {
      n.own = false;
      n.name = null;
    }

  // groups without a position of their own take their most used child; children sorted
  const byPopularity = (a: NameNode, b: NameNode) =>
    b.lines - a.lines || a.ucis.length - b.ucis.length || a.label.localeCompare(b.label);
  const finish = (n: NameNode): void => {
    const kids = n.children.map((k) => nodes.get(k)!);
    kids.forEach(finish);
    kids.sort(byPopularity);
    n.children = kids.map((k) => k.key);
    if (!n.own && kids[0]) {
      n.eco = kids[0].eco;
      n.ucis = kids[0].ucis;
      n.lines = kids[0].lines;
      n.side = kids[0].side;
    }
    n.style = n.ucis[0] ? labelOfUci(n.ucis[0]) : null;
  };
  const datasetRoots = [...nodes.values()].filter((n) => n.parent === null);
  datasetRoots.forEach(finish);

  // The style names are not openings: their variations become openings of their own, unless
  // the dataset already has an opening with that name ("Queen's Pawn Game: London System" and
  // "London System"): then that opening absorbs it, keeping its own main line.
  const styleNames = new Set(Object.values(LABEL_OWN_FAMILY).filter((f) => f !== null));
  const shift = (n: NameNode, depth: number): void => {
    n.depth = depth;
    for (const k of n.children) shift(nodes.get(k)!, depth + 1);
  };
  /** Old key → key of the level that now holds that name (see `nodeForName`). */
  const aliases = new Map<string, string>();
  const childKey = (parent: NameNode, label: string) =>
    `${parent.key}${parent.parent === null ? ':' : ','} ${label}`;
  const rekey = (n: NameNode, parent: NameNode): void => {
    const kids = n.children.map((k) => nodes.get(k)!);
    nodes.delete(n.key);
    aliases.set(n.key, childKey(parent, n.label));
    n.key = childKey(parent, n.label);
    n.parent = parent.key;
    n.children = [];
    nodes.set(n.key, n);
    for (const kid of kids) {
      rekey(kid, n);
      n.children.push(kid.key);
    }
  };
  const absorb = (from: NameNode, into: NameNode): void => {
    nodes.delete(from.key);
    aliases.set(from.key, into.key);
    for (const kid of from.children.map((k) => nodes.get(k)!)) {
      const same = nodes.get(childKey(into, kid.label));
      if (same) {
        absorb(kid, same);
        continue;
      }
      rekey(kid, into);
      shift(kid, into.depth + 1);
      into.children.push(kid.key);
    }
    into.children.sort((a, b) => byPopularity(nodes.get(a)!, nodes.get(b)!));
  };
  for (const root of datasetRoots) {
    if (!styleNames.has(root.key)) continue;
    nodes.delete(root.key);
    for (const k of root.children) {
      const child = nodes.get(k)!;
      const opening = nodes.get(child.label);
      if (opening && opening.parent === null && opening !== child) {
        absorb(child, opening);
        continue;
      }
      child.parent = null;
      child.kind = 'opening';
      shift(child, 0);
    }
  }
  const roots = [...nodes.values()].filter((n) => n.parent === null).sort(byPopularity);
  const lookup = { get: (key: string) => nodes.get(key) };
  for (const r of roots) r.owner = openingSide(lookup, r);

  return {
    roots: roots.map((r) => r.key),
    get: (key) => nodes.get(key),
    nodeForName: (name) => {
      const key = joinSegments(segmentsOf(name));
      return nodes.get(aliases.get(key) ?? key);
    },
    all: () => nodes.values(),
  };
}

/** Lines below (and including) a name-tree node: how many were run, how many are automatic. */
export interface MasteryRollup {
  total: number;
  mastered: number;
  started: number;
}

/**
 * Progress of a name-tree level. Every variation is one practice line (families and subfamilies
 * are containers); `streakOf` gives its clean streak (undefined when never run) and
 * `masteredStreak` the streak that counts as automatic.
 */
export function rollupMastery(
  tree: Pick<NameTree, 'get'>,
  key: string,
  streakOf: (node: NameNode) => number | undefined,
  masteredStreak: number,
): MasteryRollup {
  const out: MasteryRollup = { total: 0, mastered: 0, started: 0 };
  const stack = [key];
  const seen = new Set<string>();
  while (stack.length) {
    const n = tree.get(stack.pop()!);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    stack.push(...n.children);
    if (n.kind !== 'variation') continue;
    out.total++;
    const streak = streakOf(n);
    if (streak === undefined) continue;
    out.started++;
    if (streak >= masteredStreak) out.mastered++;
  }
  return out;
}
