import { Chess } from 'chess.js';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import type { Color, IdGenerator, Tree, TreeChanges, TreeEdit, TreeNode } from './types';

export class SubtreeHasAttemptsError extends Error {
  constructor(readonly nodeId: string) {
    super(`Cannot delete: the subtree of ${nodeId} has recorded attempts`);
    this.name = 'SubtreeHasAttemptsError';
  }
}

/** Builds a tree (and its children index) from a flat node list, e.g. loaded from storage. */
export function createTree(startFen: string, userColor: Color, nodes: Iterable<TreeNode>): Tree {
  const map = new Map<string, TreeNode>();
  let rootId: string | undefined;
  for (const n of nodes) {
    map.set(n.id, n);
    if (n.parentId === null) {
      if (rootId !== undefined) throw new Error('Tree has more than one root');
      rootId = n.id;
    }
  }
  if (rootId === undefined) throw new Error('Tree has no root node');
  return { startFen, userColor, rootId, nodes: map, children: indexChildren(map) };
}

/** A tree containing only the root (start position). */
export function emptyTree(startFen: string, userColor: Color, rootId: string): Tree {
  const fen = new Chess(startFen).fen(); // validates and normalises
  return createTree(fen, userColor, [
    {
      id: rootId,
      parentId: null,
      ord: 0,
      epd: toEpd(fen),
      san: null,
      uci: null,
      isUserMove: false,
      comment: null,
    },
  ]);
}

function indexChildren(nodes: ReadonlyMap<string, TreeNode>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const id of nodes.keys()) children.set(id, []);
  for (const n of nodes.values()) {
    if (n.parentId !== null) children.get(n.parentId)?.push(n.id);
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      const d = nodes.get(a)!.ord - nodes.get(b)!.ord;
      return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
    });
  }
  return children;
}

export function childrenOf(tree: Tree, id: string): TreeNode[] {
  return (tree.children.get(id) ?? []).map((c) => tree.nodes.get(c)!);
}

export function findChildByUci(tree: Tree, parentId: string, uci: string): TreeNode | undefined {
  return childrenOf(tree, parentId).find((c) => c.uci === uci);
}

/** Nodes from the root to `id`, inclusive. */
export function pathTo(tree: Tree, id: string): TreeNode[] {
  const path: TreeNode[] = [];
  let cur = tree.nodes.get(id);
  if (!cur) throw new Error(`Unknown node ${id}`);
  while (cur) {
    path.push(cur);
    cur = cur.parentId === null ? undefined : tree.nodes.get(cur.parentId);
  }
  return path.reverse();
}

/** Depth of a node = ply of its move (root is 0). */
export function plyOf(tree: Tree, id: string): number {
  return pathTo(tree, id).length - 1;
}

export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) throw new Error(`Invalid UCI "${uci}"`);
  return m[3] ? { from: m[1]!, to: m[2]!, promotion: m[3] } : { from: m[1]!, to: m[2]! };
}

/** chess.js position at node `id`. */
export function positionAt(tree: Tree, id: string): Chess {
  const chess = new Chess(tree.startFen);
  for (const n of pathTo(tree, id).slice(1)) chess.move(parseUci(n.uci!));
  return chess;
}

export function fenAt(tree: Tree, id: string): string {
  return positionAt(tree, id).fen();
}

/**
 * Mutable working copy used by the operations; `finish()` returns the new immutable tree and
 * the diff against the original.
 */
export class TreeDraft {
  private readonly nodes: Map<string, TreeNode>;
  private readonly kids: Map<string, string[]>;

  constructor(
    private readonly base: Tree,
    private readonly newId: IdGenerator = () => {
      throw new Error('No id generator');
    },
  ) {
    this.nodes = new Map(base.nodes);
    this.kids = new Map([...base.children].map(([k, v]) => [k, [...v]]));
  }

  get(id: string): TreeNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Unknown node ${id}`);
    return n;
  }

  children(id: string): TreeNode[] {
    return (this.kids.get(id) ?? []).map((c) => this.get(c));
  }

  /**
   * Returns the child of `parentId` reached by `move` (UCI or SAN) from `chess`, creating it if
   * needed. `chess` must be at the parent position and is advanced by the move.
   */
  ensureChild(
    parentId: string,
    chess: Chess,
    move: string,
    ply: number,
    gameIndex?: number,
  ): TreeNode {
    const mover = chess.turn();
    let played;
    try {
      played = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
        ? chess.move(parseUci(move))
        : chess.move(move);
    } catch {
      throw new IllegalMoveError(move, ply, gameIndex);
    }
    const existing = this.children(parentId).find((c) => c.uci === played.lan);
    if (existing) return existing;
    const siblings = this.kids.get(parentId)!;
    const node: TreeNode = {
      id: this.newId(),
      parentId,
      ord: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => this.get(s).ord)) + 1,
      epd: toEpd(chess.fen()),
      san: played.san,
      uci: played.lan,
      isUserMove: mover === this.base.userColor,
      comment: null,
    };
    this.nodes.set(node.id, node);
    this.kids.set(node.id, []);
    siblings.push(node.id);
    return node;
  }

  setOrd(id: string, ord: number): void {
    this.nodes.set(id, { ...this.get(id), ord });
  }

  setComment(id: string, comment: string | null): void {
    const clean = comment?.trim() ? comment.trim() : null;
    this.nodes.set(id, { ...this.get(id), comment: clean });
  }

  /** Re-numbers the children of `parentId` as 0..n-1 in the given order. */
  reorder(parentId: string, orderedIds: string[]): void {
    this.kids.set(parentId, orderedIds);
    orderedIds.forEach((id, i) => {
      if (this.get(id).ord !== i) this.setOrd(id, i);
    });
  }

  remove(id: string): string[] {
    const parentId = this.get(id).parentId;
    if (parentId !== null) {
      this.kids.set(
        parentId,
        this.kids.get(parentId)!.filter((k) => k !== id),
      );
    }
    const removed: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      removed.push(cur);
      stack.push(...(this.kids.get(cur) ?? []));
      this.kids.delete(cur);
      this.nodes.delete(cur);
    }
    return removed;
  }

  finish(): TreeEdit {
    const changes: TreeChanges = { inserted: [], updated: [], deleted: [] };
    for (const [id, n] of this.nodes) {
      const old = this.base.nodes.get(id);
      if (!old) changes.inserted.push(n);
      else if (old.ord !== n.ord || old.comment !== n.comment) {
        changes.updated.push({ id, ord: n.ord, comment: n.comment });
      }
    }
    for (const id of this.base.nodes.keys()) if (!this.nodes.has(id)) changes.deleted.push(id);
    if (!changes.inserted.length && !changes.updated.length && !changes.deleted.length) {
      return { tree: this.base, changes };
    }
    const tree: Tree = { ...this.base, nodes: this.nodes, children: indexChildren(this.nodes) };
    return { tree, changes };
  }
}
