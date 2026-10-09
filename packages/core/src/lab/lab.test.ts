import { beforeAll, describe, expect, it } from 'vitest';
import { toEpd } from '../fen';
import { loadOpenings, openingIndex } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { INITIAL_FEN, playLine } from '../position';
import { openingLine, popularOpenings, practiceByName } from './lab';

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

const NAJDORF = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'];

describe('graph.linesThrough', () => {
  it('counts the dataset lines that reach a position', () => {
    const e4 = graph.children(graph.root).find((e) => e.uci === 'e2e4')!;
    expect(graph.linesThrough(e4.child)).toBe(e4.lines);
    const total = graph.children(graph.root).reduce((n, e) => n + e.lines, 0);
    expect(graph.linesThrough(graph.root)).toBe(total);
  });
});

describe('popularOpenings', () => {
  it('ranks the named openings by dataset lines through them', () => {
    const top = popularOpenings(graph, { limit: 12 });
    expect(top).toHaveLength(12);
    const counts = top.map((o) => o.lines);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    for (const o of top) {
      const fen = playLine(INITIAL_FEN, o.ucis)!.fen;
      expect(toEpd(fen)).toBe(o.epd);
      expect(openingIndex()!.get(o.epd)).toEqual([o.eco, o.name]);
    }
    // the most used is the most played first move, named in the dataset
    const first = graph.children(graph.root)[0]!;
    expect(top[0]!.ucis).toEqual([first.uci]);
  });

  it('can be limited to the openings after a position', () => {
    const under = popularOpenings(graph, { under: ['e2e4', 'c7c5'], limit: 5 });
    expect(under.length).toBe(5);
    for (const o of under) {
      expect(o.ucis.slice(0, 2)).toEqual(['e2e4', 'c7c5']);
      expect(o.ucis.length).toBeGreaterThan(2);
    }
  });
});

describe('openingLine', () => {
  it('extends a prefix with the most played book moves up to 8 plies', () => {
    const line = openingLine(graph, []);
    expect(line).toHaveLength(8);
    let node = graph.root;
    for (const u of line) {
      expect(graph.children(node)[0]!.uci).toBe(u);
      node = graph.children(node)[0]!.child;
    }
  });

  it('keeps the whole defining line when the opening is longer', () => {
    expect(openingLine(graph, NAJDORF)).toEqual(NAJDORF);
  });

  it('starts with the chosen prefix', () => {
    const line = openingLine(graph, ['d2d4']);
    expect(line[0]).toBe('d2d4');
    expect(line).toHaveLength(8);
  });

  it('stops where the book ends', () => {
    expect(openingLine(graph, ['h2h4', 'h7h5', 'h1h3'])).toEqual(['h2h4', 'h7h5', 'h1h3']);
  });
});

describe('practiceByName', () => {
  it('gives distinct practice lines, named after the most used opening on each', () => {
    const items = practiceByName(graph, { limit: 10 });
    expect(items).toHaveLength(10);
    const keys = items.map((i) => i.line.join(' '));
    expect(new Set(keys).size).toBe(10);
    const popular = popularOpenings(graph, { limit: 1 })[0]!;
    expect(items[0]).toMatchObject({ eco: popular.eco, name: popular.name });
    expect(items[0]!.line).toEqual(openingLine(graph, popular.ucis));
    for (const i of items) expect(i.line.length).toBeGreaterThanOrEqual(8);
  });
});
