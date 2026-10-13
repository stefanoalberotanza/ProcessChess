import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { counterIds, mainLine, shape } from '../../test/helpers';
import { IllegalMoveError } from '../errors';
import { toEpd } from '../fen';
import {
  SubtreeHasAttemptsError,
  addLine,
  archiveCollection,
  createTree,
  deleteSubtree,
  emptyTree,
  fenAt,
  findChildByUci,
  nodeAtPath,
  pathTo,
  setComment,
  setMainLine,
} from './index';

const START = new Chess().fen();

function italianTree(userColor: 'w' | 'b' = 'w') {
  const newId = counterIds();
  const t0 = emptyTree(START, userColor, newId());
  return { newId, ...addLine(t0, t0.rootId, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], { newId }) };
}

describe('emptyTree / createTree', () => {
  it('creates a root node at the start position', () => {
    const t = emptyTree(START, 'w', 'root');
    expect(t.rootId).toBe('root');
    expect(t.nodes.get('root')).toMatchObject({
      parentId: null,
      uci: null,
      san: null,
      epd: toEpd(START),
    });
    expect(t.children.get('root')).toEqual([]);
  });

  it('rebuilds the children index ordered by ord from stored nodes', () => {
    const { tree } = italianTree();
    const rebuilt = createTree(tree.startFen, 'w', [...tree.nodes.values()].reverse());
    expect(shape(rebuilt)).toEqual(shape(tree));
  });

  it('rejects a node list without exactly one root', () => {
    expect(() => createTree(START, 'w', [])).toThrow(/root/);
  });
});

describe('addLine', () => {
  it('adds moves with SAN, EPD and isUserMove derived via chess.js', () => {
    const { tree, nodeIds, changes } = italianTree('w');
    expect(mainLine(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(nodeIds.map((id) => tree.nodes.get(id)!.isUserMove)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(changes.inserted).toHaveLength(5);
    const chess = new Chess();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']) chess.move(m);
    expect(tree.nodes.get(nodeIds[4]!)!.epd).toBe(toEpd(chess.fen()));
    expect(fenAt(tree, nodeIds[4]!)).toBe(chess.fen());
  });

  it('marks black moves as user moves when the user plays black', () => {
    const { tree, nodeIds } = italianTree('b');
    expect(nodeIds.map((id) => tree.nodes.get(id)!.isUserMove)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('merges with existing moves and appends new siblings after them', () => {
    const { tree, newId } = italianTree();
    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    const r = addLine(tree, tree.rootId, ['e2e4', 'c7c5', 'g1f3'], { newId });
    expect(r.changes.inserted.map((n) => n.san)).toEqual(['c5', 'Nf3']);
    expect(r.nodeIds[0]).toBe(e4.id);
    const children = r.tree.children.get(e4.id)!.map((id) => r.tree.nodes.get(id)!);
    expect(children.map((n) => [n.san, n.ord])).toEqual([
      ['e5', 0],
      ['c5', 1],
    ]);
  });

  it('is a no-op when the line already exists', () => {
    const { tree, newId } = italianTree();
    const r = addLine(tree, tree.rootId, ['e2e4', 'e7e5'], { newId });
    expect(r.changes).toEqual({ inserted: [], updated: [], deleted: [] });
    expect(r.tree).toBe(tree);
  });

  it('throws IllegalMoveError with the absolute ply', () => {
    const { tree, newId } = italianTree();
    const e5 = pathTo(tree, mainLineIds(tree)[1]!).at(-1)!;
    expect(() => addLine(tree, e5.id, ['g1f3', 'e8e6'], { newId })).toThrow(IllegalMoveError);
    try {
      addLine(tree, e5.id, ['g1f3', 'e8e6'], { newId });
    } catch (e) {
      expect((e as IllegalMoveError).ply).toBe(4);
    }
  });

  it('accepts promotions in UCI', () => {
    const newId = counterIds();
    const t = emptyTree('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'w', newId());
    const r = addLine(t, t.rootId, ['a7a8q'], { newId });
    expect(r.tree.nodes.get(r.nodeIds[0]!)!.san).toBe('a8=Q+');
  });
});

function mainLineIds(tree: ReturnType<typeof emptyTree>): string[] {
  const out: string[] = [];
  let id = tree.rootId;
  for (;;) {
    const next = tree.children.get(id)?.[0];
    if (!next) return out;
    out.push(next);
    id = next;
  }
}

describe('setMainLine', () => {
  it('promotes the whole path to ord 0 keeping the relative order of the others', () => {
    const { tree, newId } = italianTree();
    let t = addLine(tree, tree.rootId, ['e2e4', 'c7c5'], { newId }).tree;
    t = addLine(t, t.rootId, ['e2e4', 'e7e6'], { newId }).tree;
    const r = addLine(t, t.rootId, ['d2d4', 'd7d5', 'c2c4'], { newId });
    const c4 = r.nodeIds[2]!;
    const promoted = setMainLine(r.tree, c4);
    expect(mainLine(promoted.tree)).toEqual(['d4', 'd5', 'c4']);
    const rootKids = promoted.tree.children
      .get(promoted.tree.rootId)!
      .map((id) => promoted.tree.nodes.get(id)!);
    expect(rootKids.map((n) => [n.san, n.ord])).toEqual([
      ['d4', 0],
      ['e4', 1],
    ]);
    expect(promoted.changes.updated).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: r.nodeIds[0], ord: 0 })]),
    );
    // promoting a sibling in the middle
    const e4 = findChildByUci(promoted.tree, promoted.tree.rootId, 'e2e4')!;
    const e6 = findChildByUci(promoted.tree, e4.id, 'e7e6')!;
    const again = setMainLine(promoted.tree, e6.id);
    expect(again.tree.children.get(e4.id)!.map((id) => again.tree.nodes.get(id)!.san)).toEqual([
      'e6',
      'e5',
      'c5',
    ]);
  });

  it('produces no changes when already on the main line', () => {
    const { tree, nodeIds } = italianTree();
    expect(setMainLine(tree, nodeIds[4]!).changes.updated).toEqual([]);
  });
});

describe('setComment', () => {
  it('sets, trims and clears comments', () => {
    const { tree, nodeIds } = italianTree();
    const r = setComment(tree, nodeIds[4]!, '  The Italian.  ');
    expect(r.tree.nodes.get(nodeIds[4]!)!.comment).toBe('The Italian.');
    expect(r.changes.updated).toEqual([{ id: nodeIds[4], ord: 0, comment: 'The Italian.' }]);
    expect(setComment(r.tree, nodeIds[4]!, '   ').tree.nodes.get(nodeIds[4]!)!.comment).toBeNull();
  });
});

describe('deleteSubtree', () => {
  it('deletes a node and its descendants and compacts sibling ord', () => {
    const { tree, newId } = italianTree();
    let r = addLine(tree, tree.rootId, ['e2e4', 'c7c5', 'g1f3'], { newId });
    r = addLine(r.tree, r.tree.rootId, ['e2e4', 'e7e6'], { newId });
    const e4 = findChildByUci(r.tree, r.tree.rootId, 'e2e4')!;
    const c5 = findChildByUci(r.tree, e4.id, 'c7c5')!;
    const d = deleteSubtree(r.tree, c5.id, new Set());
    expect(d.changes.deleted).toHaveLength(2);
    expect(d.tree.nodes.has(c5.id)).toBe(false);
    const kids = d.tree.children.get(e4.id)!.map((id) => d.tree.nodes.get(id)!);
    expect(kids.map((n) => [n.san, n.ord])).toEqual([
      ['e5', 0],
      ['e6', 1],
    ]);
  });

  it('refuses when a node in the subtree has attempts', () => {
    const { tree, nodeIds } = italianTree();
    expect(() => deleteSubtree(tree, nodeIds[2]!, new Set([nodeIds[4]!]))).toThrow(
      SubtreeHasAttemptsError,
    );
  });

  it('refuses to delete the root', () => {
    const { tree } = italianTree();
    expect(() => deleteSubtree(tree, tree.rootId, new Set())).toThrow(/root/);
  });
});

describe('archiveCollection', () => {
  it('sets archivedAt once and keeps the first date', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const c = archiveCollection({ id: 'c1', archivedAt: null }, now);
    expect(c).toEqual({ id: 'c1', archivedAt: now });
    expect(archiveCollection(c, new Date('2027-01-01')).archivedAt).toBe(now);
  });
});

describe('nodeAtPath', () => {
  it('follows UCI moves from the root and reports how far the tree goes', () => {
    const { tree, nodeIds } = italianTree();
    expect(nodeAtPath(tree, [])).toEqual({ nodeId: tree.rootId, depth: 0 });
    expect(nodeAtPath(tree, ['e2e4', 'e7e5'])).toEqual({ nodeId: nodeIds[1], depth: 2 });
    // leaves the tree after 1.e4: the deepest node on the path is returned
    expect(nodeAtPath(tree, ['e2e4', 'c7c5', 'g1f3'])).toEqual({ nodeId: nodeIds[0], depth: 1 });
  });
});
