import { openingIndex } from '../openings/data';
import type { OpeningGraph } from '../openings/graph';
import {
  LABEL_OWN_FAMILY,
  OpeningsNotLoadedError,
  isLeafFamily,
  labelOfUci,
} from '../openings/resolve';
import type { OpeningLabel } from '../openings/types';

/** "Family: Variation, Subvariation" → ["Family", "Variation", "Subvariation"]. */
export function nameSegments(name: string): string[] {
  const colon = name.indexOf(':');
  if (colon === -1) return [name.trim()];
  return [
    name.slice(0, colon).trim(),
    ...name
      .slice(colon + 1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ];
}

/** Inverse of `nameSegments`; also the key of a name-tree node. */
export function joinSegments(segments: readonly string[]): string {
  const [family, ...rest] = segments;
  return rest.length ? `${family}: ${rest.join(', ')}` : family!;
}

/**
 * Level of the hierarchy (ADR 012): the family is the style (1.e4, 1.d4, flank); a subfamily is a
 * dataset family with branches of its own (Italian Game); everything else is a variation.
 */
export type NameKind = 'family' | 'subfamily' | 'variation';

/** Key of a family node: `style:king`, `style:queen`, `style:flank`. */
export const familyKey = (style: OpeningLabel): string => `style:${style}`;

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

const FAMILY_UCIS: Record<OpeningLabel, string[]> = { king: ['e2e4'], queen: ['d2d4'], flank: [] };

/**
 * The opening names of the dataset as a hierarchy Family → Subfamily → Variation → Subvariation…,
 * where a family holds either subfamilies or variations directly (ADR 012). The three families
 * are the styles; the style's own dataset name ("King's Pawn Game") is the family itself, and a
 * dataset family without at least two variations of its own is a variation of its family. The
 * hierarchy below is by name, not by moves: a variation may be reached through moves named after another
 * family (transpositions) and vice versa. Needs `loadOpenings()`.
 */
export function buildNameTree(graph: OpeningGraph): NameTree {
  const names = openingIndex();
  if (!names) throw new OpeningsNotLoadedError();
  const nodes = new Map<string, NameNode>();

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
        kind: parent ? 'variation' : 'subfamily',
        children: [],
        own: false,
        eco: '',
        ucis: [],
        lines: 0,
        side: null,
        style: null,
      };
      nodes.set(key, n);
      parent?.children.push(key);
    }
    return n;
  };

  for (const [epd, [eco, name]] of names) {
    const graphNode = graph.nodeOf(epd);
    if (graphNode === undefined) continue;
    const n = ensure(nameSegments(name));
    const ucis = graph.pathTo(graphNode);
    // a one-move position is a style label, not an opening (ADR 012): prefer any deeper one
    const rank = (u: readonly string[]) => (u.length < 2 ? 1000 : 0) + u.length;
    if (!n.own || rank(ucis) < rank(n.ucis)) {
      n.own = true;
      n.eco = eco;
      n.ucis = ucis;
      n.lines = graph.linesThrough(graphNode);
      n.side = moverOfLast(ucis);
    }
  }

  // a level named only at one move, with variations below, is a group of them (a label)
  for (const n of nodes.values())
    if (n.own && n.ucis.length < 2 && n.children.length) n.own = false;

  // groups without a position of their own take their most used child; children sorted
  const finish = (n: NameNode): void => {
    const kids = n.children.map((k) => nodes.get(k)!);
    kids.forEach(finish);
    kids.sort(
      (a, b) =>
        b.lines - a.lines || a.ucis.length - b.ucis.length || a.label.localeCompare(b.label),
    );
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

  // Regroup under the three families (the style of the family's first move).
  const families = new Map<OpeningLabel, NameNode>();
  for (const style of ['king', 'queen', 'flank'] as const) {
    const key = familyKey(style);
    const family: NameNode = {
      key,
      label: style,
      kind: 'family',
      depth: 0,
      parent: null,
      children: [],
      own: false,
      eco: '',
      ucis: FAMILY_UCIS[style],
      lines: 0,
      side: null,
      style,
    };
    families.set(style, family);
    nodes.set(key, family);
  }
  const aliases = new Map<string, NameNode>();
  const reparent = (n: NameNode, parent: NameNode, kind: NameKind): void => {
    n.parent = parent.key;
    n.kind = kind;
    parent.children.push(n.key);
    const setDepth = (m: NameNode, depth: number): void => {
      m.depth = depth;
      for (const k of m.children) {
        const child = nodes.get(k)!;
        child.kind = 'variation';
        setDepth(child, depth + 1);
      }
    };
    setDepth(n, parent.depth + 1);
  };
  for (const root of datasetRoots) {
    const family = families.get(root.style ?? 'flank')!;
    if (LABEL_OWN_FAMILY[family.style!] === root.key) {
      // the style's own name: its variations belong to the family
      aliases.set(root.key, family);
      nodes.delete(root.key);
      for (const k of root.children) reparent(nodes.get(k)!, family, 'variation');
    } else {
      reparent(root, family, isLeafFamily(root.key) ? 'variation' : 'subfamily');
    }
  }
  const byLines = (a: NameNode, b: NameNode) =>
    b.lines - a.lines || a.ucis.length - b.ucis.length || a.label.localeCompare(b.label);
  const roots = [...families.values()];
  for (const f of roots) {
    const kids = f.children.map((k) => nodes.get(k)!).sort(byLines);
    f.children = kids.map((k) => k.key);
    f.lines = kids.reduce((sum, k) => sum + k.lines, 0);
  }
  roots.sort((a, b) => b.lines - a.lines || a.label.localeCompare(b.label));

  return {
    roots: roots.map((r) => r.key),
    get: (key) => nodes.get(key),
    nodeForName: (name) => {
      const key = joinSegments(nameSegments(name));
      return nodes.get(key) ?? aliases.get(key);
    },
    all: () => nodes.values(),
  };
}
