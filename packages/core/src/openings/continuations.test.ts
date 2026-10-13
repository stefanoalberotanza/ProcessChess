import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from './data';
import { type OpeningGraph, loadOpeningGraph } from './graph';
import { continuationsFrom, nodeNames } from './continuations';

// expectations come from data/openings/c.tsv
const NORMAL = ['e2e4', 'e7e5', 'g1f3', 'b8c6']; // King's Knight Opening: Normal Variation

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

describe('nodeNames', () => {
  it('names the graph node of a dataset position', () => {
    const names = nodeNames(graph);
    let node = graph.root;
    for (const uci of NORMAL) node = graph.children(node).find((e) => e.uci === uci)!.child;
    expect(names.get(node)).toEqual({
      eco: 'C44',
      name: "King's Knight Opening: Normal Variation",
    });
    expect(nodeNames(graph)).toBe(names); // cached
  });
});

describe('continuationsFrom', () => {
  it('lists the next openings of other families from Normal Variation', () => {
    const out = continuationsFrom(graph, NORMAL);
    const by = new Map(out.map((c) => [c.name, c]));
    expect(by.get('Ruy Lopez')?.via).toEqual(['f1b5']);
    expect(by.get('Italian Game')?.via).toEqual(['f1c4']);
    expect(by.get('Scotch Game')?.via).toEqual(['d2d4']);
    expect(by.get('Ruy Lopez')?.ucis).toEqual([...NORMAL, 'f1b5']);
  });

  it('never lists the current family and lists each family once', () => {
    const out = continuationsFrom(graph, NORMAL);
    expect(out.some((c) => c.family === "King's Knight Opening")).toBe(false);
    expect(new Set(out.map((c) => c.family)).size).toBe(out.length);
  });

  it('does not list the board position family (at Ruy Lopez)', () => {
    const out = continuationsFrom(graph, [...NORMAL, 'f1b5']);
    expect(out.some((c) => c.family === 'Ruy Lopez')).toBe(false);
  });

  it("skips the style's own name and stays fast from the start", () => {
    const t0 = performance.now();
    const out = continuationsFrom(graph, []);
    // generous bound: catches a runaway walk without flaking on slow CI runners
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(out.length).toBeGreaterThan(0);
    const families = out.map((c) => c.family);
    expect(families).not.toContain("King's Pawn Game");
    expect(families).not.toContain("Queen's Pawn Game");
    // flank one-move names are subfamilies (ADR 012), reached in one move
    expect(out.find((c) => c.family === 'English Opening')?.via).toEqual(['c2c4']);
    expect(continuationsFrom(graph, ['e2e4']).every((c) => c.via.length >= 1)).toBe(true);
  });

  it('is empty off book', () => {
    expect(
      continuationsFrom(graph, ['e2e4', 'e7e5', 'e1e2', 'e8e7', 'e2e1', 'e7e8', 'a2a3']),
    ).toEqual([]);
  });

  it('orders by popularity', () => {
    const out = continuationsFrom(graph, NORMAL);
    const lines = out.map((c) => graph.linesThrough(nodeAt(c.ucis)));
    expect(lines).toEqual([...lines].sort((a, b) => b - a));
  });
});

function nodeAt(ucis: readonly string[]): number {
  let node = graph.root;
  for (const uci of ucis) node = graph.children(node).find((e) => e.uci === uci)!.child;
  return node;
}
