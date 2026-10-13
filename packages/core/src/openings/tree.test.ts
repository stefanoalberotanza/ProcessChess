import { beforeAll, describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { treeFromPgn } from '../pgn';
import { pathTo } from '../tree';
import { loadOpenings } from './data';
import { classifyOpening } from './resolve';
import { classifyTree } from './tree';

describe('classifyTree', () => {
  beforeAll(() => loadOpenings());

  it('matches classifyOpening on every node, variations included', () => {
    const { tree } = treeFromPgn(
      '1. e4 e5 (1... c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6) 2. Nf3 Nc6 3. Bb5 a6 *',
      { userColor: 'w', newId: counterIds() },
    );
    const classes = classifyTree(tree);
    expect(classes.size).toBe(tree.nodes.size);
    for (const id of tree.nodes.keys()) {
      const sans = pathTo(tree, id)
        .slice(1)
        .map((n) => n.san!);
      expect(classes.get(id), sans.join(' ')).toEqual(classifyOpening(sans));
    }
  });

  it('is empty for a custom start position', () => {
    const { tree } = treeFromPgn('[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *', {
      userColor: 'w',
      newId: counterIds(),
    });
    expect(classifyTree(tree).size).toBe(0);
  });
});
