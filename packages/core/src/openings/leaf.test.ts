import { beforeAll, describe, expect, it } from 'vitest';
import { buildNameTree } from '../lab/names';
import { loadOpenings } from './data';
import { type OpeningGraph, loadOpeningGraph } from './graph';
import { isDictionaryLeaf } from './continuations';

// expectations come from data/openings/b.tsv and the opening graph built from it
let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});
const ucisOf = (name: string) => buildNameTree(graph).get(name)!.ucis;

describe('isDictionaryLeaf', () => {
  it('is false when other names follow, of the same family or not', () => {
    // the Open Sicilian goes on into other Sicilian names
    expect(isDictionaryLeaf(graph, ucisOf('Sicilian Defense: Open'))).toBe(false);
    // the Najdorf has named sub-variations
    expect(isDictionaryLeaf(graph, ucisOf('Sicilian Defense: Najdorf Variation'))).toBe(false);
  });

  it('ignores ancestor names met again further on', () => {
    // a leaf may still meet its ancestor's name ("Sicilian Defense") further on
    const tree = buildNameTree(graph);
    const leaves = tree
      .get('Sicilian Defense')!
      .children.filter((k) => isDictionaryLeaf(graph, tree.get(k)!.ucis));
    expect(leaves.length).toBeGreaterThan(0);
    // data/openings/b.tsv: "Sicilian Defense: Bowdler Attack" (1. e4 c5 2. Bc4) leads nowhere else
    expect(leaves).toContain('Sicilian Defense: Bowdler Attack');
  });

  it('is false off book and at the start', () => {
    expect(isDictionaryLeaf(graph, ['h2h4', 'h7h5', 'h1h3'])).toBe(false);
    expect(isDictionaryLeaf(graph, [])).toBe(false);
  });
});
