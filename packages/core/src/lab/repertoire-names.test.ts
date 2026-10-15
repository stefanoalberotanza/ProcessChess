import { beforeAll, describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { loadOpenings } from '../openings/data';
import { loadOpeningGraph } from '../openings/graph';
import { treeFromPgn } from '../pgn';
import { type NameTree, buildNameTree } from './names';
import { repertoireLines, repertoireNames } from './repertoire-names';

// names from data/openings/b.tsv (B90 Najdorf) and c.tsv (C44 Scotch Game)
const NAJDORF = 'Sicilian Defense: Najdorf Variation';
const SCOTCH = 'Scotch Game';

let names: NameTree;
beforeAll(async () => {
  const [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  names = buildNameTree(graph);
});

const rep = (pgn: string, color: 'w' | 'b' = 'b') =>
  treeFromPgn(pgn, { userColor: color, newId: counterIds() }).tree;

describe('repertoireNames', () => {
  it('keeps only the names the lines pass through, with their ancestors', () => {
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
    const r = repertoireNames(tree, names);
    const keys = [...r.all()].map((n) => n.key);
    expect(keys).toContain(NAJDORF);
    for (const n of r.all()) if (n.parent) expect(r.get(n.parent)).toBeDefined();
    for (const k of r.roots) expect(r.get(k)!.parent).toBeNull();
    expect(keys.some((k) => k.startsWith('French Defense'))).toBe(false);
    expect(r.nodeForName('French Defense')).toBeUndefined();
    for (const n of r.all()) for (const c of n.children) expect(r.get(c)).toBeDefined();
  });

  it('finds a name reached by transposition, with its node', () => {
    // 1.Nf3 Nc6 2.e4 e5 3.d4 is the Scotch Game position
    const tree = rep('1. Nf3 Nc6 2. e4 e5 3. d4 *', 'w');
    const r = repertoireNames(tree, names);
    const scotch = r.nodeForName(SCOTCH)!;
    expect(scotch).toBeDefined();
    const nodes = r.nodesOf(scotch.key);
    expect(nodes).toHaveLength(1);
    expect(tree.nodes.get(nodes[0]!)!.uci).toBe('d2d4');
  });

  it('gives an ancestor level the nodes of its descendants', () => {
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
    const r = repertoireNames(tree, names);
    const najdorf = r.nodeForName(NAJDORF)!;
    let up = najdorf;
    while (up.parent) {
      up = r.get(up.parent)!;
      for (const id of r.nodesOf(najdorf.key)) expect(r.nodesOf(up.key)).toContain(id);
    }
  });

  it("lists an opening's own node first", () => {
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
    const r = repertoireNames(tree, names);
    const first = tree.nodes.get(r.nodesOf('Sicilian Defense')[0]!)!;
    expect(first.uci).toBe('c7c5'); // B20 Sicilian Defense: 1. e4 c5
  });

  it('is empty for a custom start position', () => {
    const tree = rep(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
      'w',
    );
    const r = repertoireNames(tree, names);
    expect(r.roots).toEqual([]);
    expect([...r.all()]).toEqual([]);
  });
});

describe('repertoireLines', () => {
  it('is one entry per line: the name where the line ends', () => {
    // b.tsv B90 Najdorf; the line goes on past the named position
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Kd2 *');
    const lines = repertoireLines(tree, names);
    expect(lines.map((l) => l.name)).toEqual(['Sicilian Defense: Najdorf Variation']);
    expect(tree.nodes.get(lines[0]!.nodeId)!.uci).toBe('a7a6');
  });

  it('lists each line once, an opening main line by its opening name', () => {
    // c.tsv C44 Scotch Game (1. e4 e5 2. Nf3 Nc6 3. d4) and b.tsv B90 Najdorf, as Black/White mix
    const tree = rep(
      '1. e4 c5 (1... e5 2. Nf3 Nc6 3. d4) 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *',
      'w',
    );
    expect(repertoireLines(tree, names).map((l) => l.name)).toEqual([
      'Sicilian Defense: Najdorf Variation',
      'Scotch Game',
    ]);
  });

  it('is empty for a custom start position', () => {
    const tree = rep(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
      'w',
    );
    expect(repertoireLines(tree, names)).toEqual([]);
  });
});
