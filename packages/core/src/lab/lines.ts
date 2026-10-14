import { deepestName, nodeNames, positionNode } from '../openings/continuations';
import type { OpeningGraph } from '../openings/graph';
import type { NameNode, NameTree } from './names';

/** What the board position leads to, by name. */
export interface LinesHere {
  /** The opening of the board position (of its deepest name); null at the start or off book. */
  opening: NameNode | null;
  /** The other openings reachable by moves from here, most played first. */
  openings: NameNode[];
  /** The variations of `opening` reachable by moves from here, most played first. */
  variations: NameNode[];
}

/** The opening a level belongs to: its root ancestor. */
export function openingOf(tree: Pick<NameTree, 'get'>, n: NameNode): NameNode {
  let at = n;
  while (at.parent) at = tree.get(at.parent) ?? at;
  return at;
}

const byLines = (a: NameNode, b: NameNode) => b.lines - a.lines || a.key.localeCompare(b.key);

/**
 * The openings and variations reachable by moves from the position after `ucis` (transpositions
 * included: every book position below it is visited). Needs `loadOpenings()`.
 */
export function linesFrom(graph: OpeningGraph, tree: NameTree, ucis: readonly string[]): LinesHere {
  const start = positionNode(graph, ucis);
  if (start === undefined) return { opening: null, openings: [], variations: [] };
  const own = deepestName(graph, ucis);
  const ownNode = own ? tree.nodeForName(own) : undefined;
  const opening = ownNode ? openingOf(tree, ownNode) : null;
  const names = nodeNames(graph);
  const openings = new Map<string, NameNode>();
  const variations = new Map<string, NameNode>();
  const seen = new Set([start]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    for (const e of graph.children(queue[q]!)) {
      if (seen.has(e.child)) continue;
      seen.add(e.child);
      queue.push(e.child);
      const name = names.get(e.child)?.name;
      const n = name ? tree.nodeForName(name) : undefined;
      if (!n) continue;
      const o = openingOf(tree, n);
      if (opening && o.key === opening.key) {
        if (n.key !== opening.key) variations.set(n.key, n);
      } else openings.set(o.key, o);
    }
  }
  return {
    opening,
    openings: [...openings.values()].sort(byLines),
    variations: [...variations.values()].sort(byLines),
  };
}
