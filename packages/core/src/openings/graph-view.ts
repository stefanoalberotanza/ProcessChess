import { toEpd } from '../fen';
import { INITIAL_FEN, playMove } from '../position';
import { openingIndex } from './data';
import type { OpeningGraph } from './graph';

export interface GraphViewNode {
  /** Unique within the view: the moves from the start, space-separated ('' for the start). */
  key: string;
  /** Moves (UCI) from the initial position to this node. */
  ucis: string[];
  /** The move that leads to this node (null for the initial position). */
  uci: string | null;
  san: string | null;
  /** Board after the move. */
  fen: string;
  /** Plies from the current position: negative = already played, 0 = current, >0 = book. */
  depth: number;
  kind: 'past' | 'current' | 'book';
  /** Dataset lines through the move (book moves only). */
  lines: number | null;
  eco: string | null;
  name: string | null;
  /** Layout: column (0 = leftmost) and row (may be fractional, centred on children). */
  x: number;
  y: number;
}

export interface GraphViewEdge {
  from: string;
  to: string;
  uci: string;
  lines: number | null;
}

export interface GraphView {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  columns: number;
  rows: number;
}

export interface GraphViewOptions {
  /** Moves already played to show before the current position. Default 2. */
  back?: number;
  /** Book moves kept per level after the current position, most played first. Default [8, 3]. */
  forward?: number[];
}

/**
 * The neighbourhood of a position in the opening graph, laid out left to right: the last moves
 * played, the current position, then the book moves (and their main continuations). Every node
 * carries the board after its move. `ucis` are the moves from the initial position.
 */
export function graphView(
  graph: OpeningGraph,
  ucis: readonly string[],
  opts: GraphViewOptions = {},
): GraphView {
  const back = Math.min(opts.back ?? 2, ucis.length);
  const forward = opts.forward ?? [8, 3];
  const names = openingIndex();

  // boards along the path
  const fens = [INITIAL_FEN];
  const sans: string[] = [];
  for (const uci of ucis) {
    const r = playMove(fens.at(-1)!, uci);
    if (!r) throw new Error(`Illegal move ${uci} at ply ${sans.length + 1}`);
    fens.push(r.fen);
    sans.push(r.san);
  }

  const named = (fen: string) => names?.get(toEpd(fen)) ?? null;
  const nodes: GraphViewNode[] = [];
  const edges: GraphViewEdge[] = [];
  const make = (
    path: string[],
    fen: string,
    san: string | null,
    depth: number,
    kind: GraphViewNode['kind'],
    lines: number | null,
  ): GraphViewNode => {
    const n = named(fen);
    const node: GraphViewNode = {
      key: path.join(' '),
      ucis: path,
      uci: path.at(-1) ?? null,
      san,
      fen,
      depth,
      kind,
      lines,
      eco: n?.[0] ?? null,
      name: n?.[1] ?? null,
      x: depth + back,
      y: 0,
    };
    nodes.push(node);
    return node;
  };

  // past chain and current position
  let prev: GraphViewNode | null = null;
  for (let d = 0 - back; d <= 0; d++) {
    const ply = ucis.length + d;
    const path = ucis.slice(0, ply);
    const node = make(
      path,
      fens[ply]!,
      ply === 0 ? null : sans[ply - 1]!,
      d,
      d === 0 ? 'current' : 'past',
      null,
    );
    if (prev) edges.push({ from: prev.key, to: node.key, uci: node.uci!, lines: null });
    prev = node;
  }
  const current = prev!;

  // book tree after the current position
  const children = new Map<string, GraphViewNode[]>();
  const expand = (parent: GraphViewNode, level: number) => {
    const limit = forward[level];
    if (limit === undefined) return;
    const node = graph.nodeOf(toEpd(parent.fen));
    if (node === undefined) return;
    const kids: GraphViewNode[] = [];
    for (const e of graph.children(node).slice(0, limit)) {
      const r = playMove(parent.fen, e.uci)!;
      const child = make([...parent.ucis, e.uci], r.fen, r.san, level + 1, 'book', e.lines);
      edges.push({ from: parent.key, to: child.key, uci: e.uci, lines: e.lines });
      kids.push(child);
      expand(child, level + 1);
    }
    children.set(parent.key, kids);
  };
  expand(current, 0);

  // tidy tree: leaves on consecutive rows, parents centred on their children
  let row = 0;
  const place = (n: GraphViewNode): number => {
    const kids = children.get(n.key) ?? [];
    if (kids.length === 0) {
      n.y = row++;
    } else {
      const ys = kids.map(place);
      n.y = (ys[0]! + ys.at(-1)!) / 2;
    }
    return n.y;
  };
  place(current);
  for (const n of nodes) if (n.kind === 'past') n.y = current.y;

  const columns = Math.max(...nodes.map((n) => n.x)) + 1;
  return { nodes, edges, columns, rows: Math.max(row, 1) };
}
