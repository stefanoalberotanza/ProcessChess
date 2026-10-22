import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { type NameTree, buildNameTree } from './names';
import { formatOpeningList } from './opening-list';

// expectations come from data/openings/*.tsv
let graph: OpeningGraph;
let tree: NameTree;
let list: string;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  tree = buildNameTree(graph);
  list = formatOpeningList(tree);
});

describe('formatOpeningList', () => {
  it('gives each opening a heading with its ECO, owner and moves', () => {
    // b.tsv: B20 "Sicilian Defense" 1. e4 c5
    expect(list).toContain('\n## Sicilian Defense\n\nB20 · ● Black · 1.e4 c5\n');
  });

  it('lists variations as nested bullets with ECO, side and moves', () => {
    // b.tsv: B90 "Sicilian Defense: Najdorf Variation" and "…, English Attack" (shortest lines)
    expect(list).toContain(
      '\n- **Najdorf Variation** · B90 · ● · 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6\n',
    );
    expect(list).toContain(
      '\n  - **English Attack** · B90 · ○ · 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3\n',
    );
  });

  it('marks groups and dataset names that differ from the key', () => {
    // a.tsv: A10 "English Opening" 1. c4 is a one-move name: the opening is a group
    expect(list).toMatch(/\n## English Opening\n\n\S+ · ○ White · [^\n]+ · group\n/);
    // d.tsv: D02 "Queen's Pawn Game: London System, Pterodactyl Variation", now under London System
    expect(list).toContain(
      "\n- **Pterodactyl Variation** · D02 · ● · 1.d4 g6 2.Nf3 Bg7 3.Bf4 c5 4.c3 cxd4 5.cxd4 Qa5+ · dataset: `Queen's Pawn Game: London System, Pterodactyl Variation`\n",
    );
  });

  it('has one heading per opening and one bullet per variation', () => {
    const all = [...tree.all()];
    expect(list.match(/^## /gm)).toHaveLength(tree.roots.length);
    expect(list.match(/^ *- \*\*/gm)).toHaveLength(all.length - tree.roots.length);
  });

  it('docs/openings.md is up to date (run pnpm build:openings)', () => {
    const file = join(import.meta.dirname, '../../../../docs/openings.md');
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(list);
  });
});
