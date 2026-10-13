import type { Tree, TreeNode } from '../src/tree/types';

/** Deterministic id generator for tests: n1, n2, … */
export function counterIds(prefix = 'n'): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

/** Id-free nested view of a tree, ordered by `ord`, for structural comparisons. */
export interface Shape {
  san: string | null;
  comment: string | null;
  user: boolean;
  children: Shape[];
}

export function shape(tree: Tree, id: string = tree.rootId): Shape {
  const n = tree.nodes.get(id) as TreeNode;
  return {
    san: n.san,
    comment: n.comment,
    user: n.isUserMove,
    children: (tree.children.get(id) ?? []).map((c) => shape(tree, c)),
  };
}

/** Main-line SAN moves from the root, following ord 0. */
export function mainLine(tree: Tree): string[] {
  const out: string[] = [];
  let id = tree.rootId;
  for (;;) {
    const next = tree.children.get(id)?.[0];
    if (!next) return out;
    out.push(tree.nodes.get(next)!.san!);
    id = next;
  }
}
