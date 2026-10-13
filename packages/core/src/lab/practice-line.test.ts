import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { nodeNames } from '../openings/continuations';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { PRACTICE_MAX_PLIES, practiceLine } from './lab';

// expectations come from data/openings/b.tsv
const ADVANCE = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5']; // Caro-Kann Defense: Advance Variation

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

function nameAt(ucis: readonly string[]): string | undefined {
  let node = graph.root;
  for (const u of ucis) {
    const e = graph.children(node).find((x) => x.uci === u);
    if (!e) return undefined;
    node = e.child;
  }
  return nodeNames(graph).get(node)?.name;
}

describe('practiceLine', () => {
  it('starts with the name and never enters another name', () => {
    const line = practiceLine(graph, ADVANCE);
    expect(line.slice(0, ADVANCE.length)).toEqual(ADVANCE);
    for (let i = ADVANCE.length + 1; i <= line.length; i++) {
      const name = nameAt(line.slice(0, i));
      expect(name === undefined || name === 'Caro-Kann Defense: Advance Variation').toBe(true);
    }
  });

  it('walks through positions repeating the same name', () => {
    // 1.e4 c6 is "Caro-Kann Defense"; 2.d4 and 2...d5 carry the same name
    const line = practiceLine(graph, ['e2e4', 'c7c6']);
    expect(line.length).toBeGreaterThan(2);
    for (let i = 3; i <= line.length; i++) {
      const name = nameAt(line.slice(0, i));
      expect(name === undefined || name === 'Caro-Kann Defense').toBe(true);
    }
  });

  it('gives different names different lines across the whole dataset', () => {
    const byLine = new Map<string, string>();
    for (const [node, { name }] of nodeNames(graph)) {
      const line = practiceLine(graph, graph.pathTo(node)).join(' ');
      const other = byLine.get(line);
      if (other !== undefined) expect(other, line).toBe(name);
      else byLine.set(line, name);
    }
  });

  it('is just the name when the next position already has another name', () => {
    // e.g. a name whose most played continuation is named differently: no extension at all
    const short = [...nodeNames(graph)].find(([node, { name }]) => {
      const next = graph.children(node)[0];
      return next !== undefined && (nodeNames(graph).get(next.child)?.name ?? name) !== name;
    });
    expect(short).toBeDefined();
    const path = graph.pathTo(short![0]);
    expect(practiceLine(graph, path)).toEqual(path);
  });

  it('keeps off-book input and respects the cap', () => {
    const off = ['h2h4', 'h7h5', 'h1h3'];
    expect(practiceLine(graph, off)).toEqual(off);
    for (const [node] of nodeNames(graph)) {
      const path = graph.pathTo(node);
      expect(practiceLine(graph, path).length).toBeLessThanOrEqual(
        Math.max(path.length, PRACTICE_MAX_PLIES),
      );
    }
  });
});
