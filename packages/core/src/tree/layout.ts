import type { Tree, TreeNode } from './types';

export interface LayoutMove {
  id: string;
  san: string;
  /** SAN with a move number when needed: "1. e4", "1... c5", "e5". */
  label: string;
  ply: number;
  isUserMove: boolean;
  comment: string | null;
}

/** A run of moves, or a block of variations (alternatives to the move just before it). */
export type LayoutSegment =
  { kind: 'moves'; moves: LayoutMove[] } | { kind: 'variations'; lines: LayoutSegment[][] };

/**
 * Lays out a move tree like the Lichess move list: the main line is split after each move that
 * has alternatives, which follow as an indented block of variations (recursively).
 */
export function layoutTree(tree: Tree): LayoutSegment[] {
  const fields = tree.startFen.split(' ');
  const startWhite = fields[1] === 'w';
  const startMove = Number(fields[5] ?? '1') || 1;
  const moveNumber = (ply: number) => startMove + Math.floor((ply - 1 + (startWhite ? 0 : 1)) / 2);
  const isWhite = (ply: number) => (ply % 2 === 1) === startWhite;
  const kids = (id: string): TreeNode[] =>
    (tree.children.get(id) ?? []).map((c) => tree.nodes.get(c)!);

  const move = (n: TreeNode, ply: number, forceNumber: boolean): LayoutMove => ({
    id: n.id,
    san: n.san!,
    label: isWhite(ply)
      ? `${moveNumber(ply)}. ${n.san}`
      : forceNumber
        ? `${moveNumber(ply)}... ${n.san}`
        : n.san!,
    ply,
    isUserMove: n.isUserMove,
    comment: n.comment,
  });

  const line = (first: TreeNode | undefined, ply: number, alts: TreeNode[]): LayoutSegment[] => {
    const segs: LayoutSegment[] = [];
    let run: LayoutMove[] = [];
    let force = true;
    let node = first;
    let p = ply;
    let others = alts;
    while (node) {
      run.push(move(node, p, force));
      force = !!node.comment;
      if (others.length) {
        segs.push({ kind: 'moves', moves: run });
        segs.push({
          kind: 'variations',
          lines: others.map((alt) => line(alt, p, [])),
        });
        run = [];
        force = true;
      }
      const [next, ...rest] = kids(node.id);
      node = next;
      others = rest;
      p++;
    }
    if (run.length) segs.push({ kind: 'moves', moves: run });
    return segs;
  };

  const [first, ...alts] = kids(tree.rootId);
  return line(first, 1, alts);
}
