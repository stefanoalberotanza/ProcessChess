import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { loadOpeningGraph } from '../openings/graph';
import { type NameTree, buildNameTree } from './names';
import { openingSide } from './opening-side';

let tree: NameTree;
beforeAll(async () => {
  const [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  tree = buildNameTree(graph);
});

describe('openingSide', () => {
  it('follows the override table (Ruy Lopez is both sides)', () => {
    expect(openingSide(tree, tree.get('Ruy Lopez')!)).toBe('both');
  });

  it('reads the name: defences and declined/accepted gambits are Black, openings and games White', () => {
    // names from data/openings/*.tsv
    expect(openingSide(tree, tree.get('Sicilian Defense')!)).toBe('b');
    expect(openingSide(tree, tree.get("King's Indian Defense")!)).toBe('b');
    expect(openingSide(tree, tree.get("Queen's Gambit Accepted")!)).toBe('b');
    expect(openingSide(tree, tree.get("Queen's Gambit Declined")!)).toBe('b');
    expect(openingSide(tree, tree.get('English Opening')!)).toBe('w');
    expect(openingSide(tree, tree.get('Bird Opening')!)).toBe('w');
    expect(openingSide(tree, tree.get('Scotch Game')!)).toBe('w');
    expect(openingSide(tree, tree.get("King's Gambit")!)).toBe('w');
    expect(openingSide(tree, tree.get("Queen's Gambit")!)).toBe('w');
  });

  it('reads only the own name of a promoted style variation (not the "Game" of its prefix)', () => {
    // data/openings/d.tsv: "Queen's Pawn Game: Symmetrical Variation" 1. d4 d5 2. Nf3 Nf6 (Black's move)
    const symmetrical = tree.nodeForName("Queen's Pawn Game: Symmetrical Variation")!;
    expect(symmetrical.kind).toBe('opening');
    expect(symmetrical.side).toBe('b');
    expect(openingSide(tree, symmetrical)).toBe('b');
  });

  it('falls back to the side of the defining move', () => {
    // a name with no keyword: the defining move decides
    const plain = {
      ...tree.get('Sicilian Defense')!,
      key: 'Plain',
      label: 'Plain',
      side: 'w' as const,
    };
    expect(openingSide(tree, plain)).toBe('w');
  });

  it('is stored on every opening of the tree, null on variations', () => {
    for (const n of tree.all()) {
      if (n.kind === 'opening') expect(['w', 'b', 'both'], n.key).toContain(n.owner);
      else expect(n.owner).toBeNull();
    }
    expect(tree.get('Ruy Lopez')!.owner).toBe('both');
  });
});
