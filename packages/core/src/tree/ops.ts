import { SubtreeHasAttemptsError, TreeDraft, plyOf, positionAt } from './tree';
import type { IdGenerator, Tree, TreeEdit } from './types';

/**
 * Plays `moves` (UCI or SAN) from node `fromId`, reusing existing nodes and creating the missing
 * ones (appended after existing siblings). Returns the ids of the nodes along the line.
 */
export function addLine(
  tree: Tree,
  fromId: string,
  moves: readonly string[],
  opts: { newId: IdGenerator },
): TreeEdit & { nodeIds: string[]; leafId: string } {
  const draft = new TreeDraft(tree, opts.newId);
  const chess = positionAt(tree, fromId);
  const ply0 = plyOf(tree, fromId);
  const nodeIds: string[] = [];
  let cur = fromId;
  moves.forEach((m, i) => {
    cur = draft.ensureChild(cur, chess, m, ply0 + i + 1).id;
    nodeIds.push(cur);
  });
  return { ...draft.finish(), nodeIds, leafId: cur };
}

/** Makes `nodeId` and all its ancestors the first child (ord 0) of their parents. */
export function setMainLine(tree: Tree, nodeId: string): TreeEdit {
  const draft = new TreeDraft(tree);
  let cur = draft.get(nodeId);
  while (cur.parentId !== null) {
    const siblings = draft.children(cur.parentId).map((s) => s.id);
    draft.reorder(cur.parentId, [cur.id, ...siblings.filter((s) => s !== cur.id)]);
    cur = draft.get(cur.parentId);
  }
  return draft.finish();
}

/** Sets the comment shown after the move; blank clears it. */
export function setComment(tree: Tree, nodeId: string, comment: string | null): TreeEdit {
  const draft = new TreeDraft(tree);
  draft.setComment(nodeId, comment);
  return draft.finish();
}

/**
 * Deletes `nodeId` and its descendants. Refuses if any of them has recorded attempts
 * (the attempt log is append-only) or if `nodeId` is the root.
 */
export function deleteSubtree(
  tree: Tree,
  nodeId: string,
  nodesWithAttempts: ReadonlySet<string>,
): TreeEdit {
  const node = tree.nodes.get(nodeId);
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  if (node.parentId === null) throw new Error('Cannot delete the root node');
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (nodesWithAttempts.has(cur)) throw new SubtreeHasAttemptsError(nodeId);
    stack.push(...(tree.children.get(cur) ?? []));
  }
  const draft = new TreeDraft(tree);
  draft.remove(nodeId);
  const parentId = node.parentId;
  draft.reorder(
    parentId,
    draft.children(parentId).map((c) => c.id),
  );
  return draft.finish();
}

/**
 * Collections are archived, never deleted (ADR 002). Returns the archived copy; archiving twice
 * keeps the first date.
 */
export function archiveCollection<T extends { archivedAt: Date | null }>(
  collection: T,
  now: Date = new Date(),
): T {
  return collection.archivedAt ? collection : { ...collection, archivedAt: now };
}
