import { toEpd } from '../fen';
import { openingIndex } from '../openings/data';
import { OpeningsNotLoadedError } from '../openings/resolve';
import { INITIAL_FEN } from '../position';
import type { Tree } from '../tree/types';
import type { NameNode, NameTree } from './names';

const STANDARD_EPD = toEpd(INITIAL_FEN);

/** The name tree of a repertoire: the dataset levels its lines reach, and where. */
export interface RepertoireNameTree extends NameTree {
  /** Repertoire node ids where `key` or one of its descendant levels is reached. */
  nodesOf(key: string): readonly string[];
}

/**
 * The levels of `names` that the repertoire's positions reach (by EPD, so transpositions count),
 * with all their ancestors; children and roots keep only kept levels, in their order. Empty for a
 * custom start position. Needs `loadOpenings()`.
 */
export function repertoireNames(tree: Tree, names: NameTree): RepertoireNameTree {
  const index = openingIndex();
  if (!index) throw new OpeningsNotLoadedError();
  const nodesOf = new Map<string, string[]>();
  const root = tree.nodes.get(tree.rootId);
  if (root && root.epd === STANDARD_EPD) {
    for (const node of tree.nodes.values()) {
      const named = index.get(node.epd);
      if (!named) continue;
      // the level and every ancestor reach this node
      for (let n = names.nodeForName(named[1]); n; n = n.parent ? names.get(n.parent) : undefined) {
        const ids = nodesOf.get(n.key) ?? [];
        if (!ids.includes(node.id)) ids.push(node.id);
        nodesOf.set(n.key, ids);
      }
    }
  }
  const kept = new Map<string, NameNode>();
  for (const key of nodesOf.keys()) {
    const n = names.get(key)!;
    kept.set(key, { ...n, children: n.children.filter((c) => nodesOf.has(c)) });
  }
  return {
    roots: names.roots.filter((k) => kept.has(k)),
    get: (key) => kept.get(key),
    nodeForName: (name) => {
      const n = names.nodeForName(name);
      return n ? kept.get(n.key) : undefined;
    },
    all: () => kept.values(),
    nodesOf: (key) => nodesOf.get(key) ?? [],
  };
}

/** A line of a repertoire, by the name where it ends. */
export interface RepertoireLine {
  /** Dataset name of the line's deepest named position (a variation, or an opening). */
  name: string;
  /** The repertoire node of that named position. */
  nodeId: string;
}

/**
 * One entry per line of the repertoire: the deepest named position of each leaf's path, main line
 * first, each name once. Empty for a custom start position. Needs `loadOpenings()`.
 */
export function repertoireLines(tree: Tree, names: NameTree): RepertoireLine[] {
  const index = openingIndex();
  if (!index) throw new OpeningsNotLoadedError();
  const root = tree.nodes.get(tree.rootId);
  if (!root || root.epd !== STANDARD_EPD) return [];
  const out = new Map<string, RepertoireLine>();
  const visit = (id: string, named: RepertoireLine | null) => {
    const node = tree.nodes.get(id)!;
    const name = index.get(node.epd)?.[1];
    const level = name ? names.nodeForName(name) : undefined;
    const here = level ? { name: level.key, nodeId: id } : named;
    const kids = tree.children.get(id) ?? [];
    if (kids.length === 0) {
      if (here && !out.has(here.name)) out.set(here.name, here);
      return;
    }
    for (const k of kids) visit(k, here);
  };
  visit(tree.rootId, null);
  return [...out.values()];
}
