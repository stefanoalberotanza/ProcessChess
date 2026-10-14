import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { linesFrom } from './lines';
import { type NameTree, buildNameTree } from './names';

// names from data/openings/*.tsv
let graph: OpeningGraph;
let tree: NameTree;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  tree = buildNameTree(graph);
});
const keys = (ns: { key: string }[]) => ns.map((n) => n.key);

describe('linesFrom', () => {
  it('lists every opening at the start, most played first, and no variation', () => {
    const here = linesFrom(graph, tree, []);
    expect(here.opening).toBeNull();
    expect(keys(here.openings)).toContain('Sicilian Defense');
    expect(keys(here.openings)).toContain('Ruy Lopez');
    expect(keys(here.openings)).not.toContain("King's Pawn Game");
    expect(here.variations).toEqual([]);
    const lines = here.openings.map((n) => n.lines);
    expect([...lines].sort((a, b) => b - a)).toEqual(lines);
    expect(new Set(keys(here.openings)).size).toBe(here.openings.length);
  });

  it('inside an opening, its variations are variations and the others are openings', () => {
    const here = linesFrom(graph, tree, ['e2e4', 'c7c5']); // B20 Sicilian Defense
    expect(here.opening?.key).toBe('Sicilian Defense');
    expect(keys(here.variations)).toContain('Sicilian Defense: Najdorf Variation');
    for (const v of here.variations)
      expect(v.key.startsWith('Sicilian Defense:'), v.key).toBe(true);
    expect(keys(here.openings)).not.toContain('Sicilian Defense');
    expect(keys(here.openings)).not.toContain('French Defense');
  });

  it('is the same for a transposed move order (Scotch Game by 1.Nf3)', () => {
    const book = linesFrom(graph, tree, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4']);
    const transposed = linesFrom(graph, tree, ['g1f3', 'b8c6', 'e2e4', 'e7e5', 'd2d4']);
    expect(book.opening?.key).toBe('Scotch Game');
    expect(transposed.opening?.key).toBe('Scotch Game');
    expect(keys(transposed.variations)).toEqual(keys(book.variations));
    expect(keys(transposed.openings)).toEqual(keys(book.openings));
  });

  it('is empty off book', () => {
    const here = linesFrom(graph, tree, ['h2h4', 'h7h5', 'h1h3']);
    expect(here).toEqual({ opening: null, openings: [], variations: [] });
  });
});
