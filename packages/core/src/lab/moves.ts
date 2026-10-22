import { nodeNames, positionNode } from '../openings/continuations';
import type { OpeningGraph } from '../openings/graph';
import { INITIAL_FEN, playLine, uciToSan } from '../position';
import { practiceLine } from './lab';
import { openingOf } from './lines';
import type { NameNode, NameTree } from './names';

/** A move from the board position into one or more named openings. */
export interface MoveEntry {
  uci: string;
  /** SAN of the move from the board position. */
  san: string;
  /** Distinct root openings among `names`. */
  openings: number;
  /** Sum of `NameNode.lines` over `names`. */
  lines: number;
  /** Named nodes reached through this move on this side, most `lines` first, then key. */
  names: NameNode[];
  /** Practice line (UCI from the start) of `names[0]`, the move first in the continuation. */
  example: string[];
}

/** The moves into named openings from a position, by the side the opening belongs to. */
export interface MovesHere {
  w: MoveEntry[];
  b: MoveEntry[];
}

const byLines = (a: NameNode, b: NameNode) => b.lines - a.lines || a.key.localeCompare(b.key);

/** The sides whose group a named node belongs to: an opening to its owner, a variation to its side. */
function sidesOf(n: NameNode): ('w' | 'b')[] {
  if (n.kind === 'variation') return n.side ? [n.side] : [];
  const owner = n.owner ?? n.side;
  if (owner === 'both') return ['w', 'b'];
  return owner ? [owner] : [];
}

/**
 * The moves playable from the position after `ucis` that still lead into a named opening
 * (transpositions included: every book position below the move is visited), split by the side
 * the reached openings belong to. Needs `loadOpenings()`.
 */
export function movesFrom(graph: OpeningGraph, tree: NameTree, ucis: readonly string[]): MovesHere {
  const out: MovesHere = { w: [], b: [] };
  const start = positionNode(graph, ucis);
  if (start === undefined) return out;
  const played = playLine(INITIAL_FEN, ucis);
  if (!played) return out;
  const names = nodeNames(graph);

  for (const edge of graph.children(start)) {
    const san = uciToSan(played.fen, edge.uci);
    if (!san) continue;
    const found = new Map<string, NameNode>();
    const seen = new Set([edge.child]);
    const queue = [edge.child];
    for (let q = 0; q < queue.length; q++) {
      const name = names.get(queue[q]!)?.name;
      const n = name ? tree.nodeForName(name) : undefined;
      if (n) found.set(n.key, n);
      for (const e of graph.children(queue[q]!)) {
        if (seen.has(e.child)) continue;
        seen.add(e.child);
        queue.push(e.child);
      }
    }
    for (const side of ['w', 'b'] as const) {
      const here = [...found.values()].filter((n) => sidesOf(n).includes(side)).sort(byLines);
      const top = here[0];
      if (!top) continue;
      const prefix = [...ucis, edge.uci];
      const along = prefix.every((u, i) => top.ucis[i] === u);
      out[side].push({
        uci: edge.uci,
        san,
        openings: new Set(here.map((n) => openingOf(tree, n).key)).size,
        lines: here.reduce((s, n) => s + n.lines, 0),
        names: here,
        example: practiceLine(graph, along ? top.ucis : prefix),
      });
    }
  }
  for (const side of [out.w, out.b])
    side.sort((a, b) => b.openings - a.openings || b.lines - a.lines || a.san.localeCompare(b.san));
  return out;
}

/** A named level with the listed levels below it (variation inside opening, and so on). */
export interface NameBranch {
  node: NameNode;
  children: NameBranch[];
}

/**
 * Nests `names` by the name tree: each name goes under its nearest ancestor that is also in the
 * list, the others are roots. The order of `names` is kept at every level.
 */
export function nestNames(tree: Pick<NameTree, 'get'>, names: readonly NameNode[]): NameBranch[] {
  const branches = new Map(names.map((n) => [n.key, { node: n, children: [] } as NameBranch]));
  const roots: NameBranch[] = [];
  for (const n of names) {
    let parent = n.parent;
    while (parent && !branches.has(parent)) parent = tree.get(parent)?.parent ?? null;
    (parent ? branches.get(parent)!.children : roots).push(branches.get(n.key)!);
  }
  return roots;
}
