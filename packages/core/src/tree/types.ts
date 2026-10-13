export type Color = 'w' | 'b';

/** A position in a collection's move tree. Mirrors the `node` table in @processchess/db. */
export interface TreeNode {
  id: string;
  parentId: string | null;
  /** Order among siblings; 0 is the main line. */
  ord: number;
  /** EPD of the position after this move (of the start position for the root). */
  epd: string;
  san: string | null;
  uci: string | null;
  /** True when the move is played by the user's side. */
  isUserMove: boolean;
  comment: string | null;
}

/** Immutable move tree with a children index sorted by `ord`. */
export interface Tree {
  startFen: string;
  userColor: Color;
  rootId: string;
  nodes: ReadonlyMap<string, TreeNode>;
  children: ReadonlyMap<string, readonly string[]>;
}

/** What a tree operation changed, to be persisted by a Storage. Inserts are parent-first. */
export interface TreeChanges {
  inserted: TreeNode[];
  updated: { id: string; ord: number; comment: string | null }[];
  deleted: string[];
}

export interface TreeEdit {
  tree: Tree;
  changes: TreeChanges;
}

export type IdGenerator = () => string;
