import { describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { treeFromPgn } from '../pgn';
import { type LayoutSegment, layoutTree } from './layout';

function render(segs: LayoutSegment[]): string {
  return segs
    .map((s) =>
      s.kind === 'moves'
        ? s.moves.map((m) => m.label + (m.comment ? ` {${m.comment}}` : '')).join(' ')
        : s.lines.map((l) => `(${render(l)})`).join(' '),
    )
    .join(' | ');
}

describe('layoutTree', () => {
  it('splits the main line around variation blocks with correct move numbers', () => {
    const { tree } = treeFromPgn(
      '1. e4 e5 (1... c5 2. Nf3 d6 (2... Nc6) 3. d4) 2. Nf3 { main } Nc6 3. Bc4 *',
      { userColor: 'w', newId: counterIds() },
    );
    expect(render(layoutTree(tree))).toBe(
      '1. e4 e5 | (1... c5 2. Nf3 d6 | (2... Nc6) | 3. d4) | 2. Nf3 {main} 2... Nc6 3. Bc4',
    );
  });

  it('gives each move its node id, ply and user flag', () => {
    const { tree } = treeFromPgn('1. e4 e5 *', { userColor: 'b', newId: counterIds() });
    const [seg] = layoutTree(tree);
    expect(seg).toMatchObject({
      kind: 'moves',
      moves: [
        { label: '1. e4', san: 'e4', ply: 1, isUserMove: false },
        { label: 'e5', san: 'e5', ply: 2, isUserMove: true },
      ],
    });
    if (seg?.kind === 'moves') expect(tree.nodes.has(seg.moves[0]!.id)).toBe(true);
  });

  it('is empty for a tree without moves', () => {
    const { tree } = treeFromPgn('*', { userColor: 'w', newId: counterIds() });
    expect(layoutTree(tree)).toEqual([]);
  });
});
