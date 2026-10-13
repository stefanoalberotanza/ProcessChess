import { beforeAll, describe, expect, it } from 'vitest';
import { INITIAL_FEN, playLine } from '../position';
import { loadOpenings } from './data';
import { type OpeningGraph, bookMoves, loadOpeningGraph } from './graph';
import { type GraphView, graphView } from './graph-view';

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

const ITALIAN = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];

function byKind(view: GraphView, kind: string) {
  return view.nodes.filter((n) => n.kind === kind);
}

describe('graphView', () => {
  it('shows the current position, its book moves and their main continuations', () => {
    const view = graphView(graph, [], { back: 2, forward: [8, 3] });
    const [current] = byKind(view, 'current');
    expect(current).toMatchObject({ ucis: [], san: null, fen: INITIAL_FEN, depth: 0 });
    expect(byKind(view, 'past')).toEqual([]);
    const level1 = view.nodes.filter((n) => n.depth === 1);
    const top8 = bookMoves(graph, INITIAL_FEN).slice(0, 8);
    expect(level1.map((n) => n.san)).toEqual(top8.map((m) => m.san));
    expect(level1.map((n) => n.lines)).toEqual(top8.map((m) => m.lines));
    for (const n of view.nodes.filter((n) => n.depth === 2)) {
      expect(n.ucis).toHaveLength(2);
    }
    expect(view.nodes.filter((n) => n.depth === 2).length).toBeLessThanOrEqual(24);
  });

  it('every node carries the board after its move, replayed with chess.js', () => {
    const view = graphView(graph, ITALIAN);
    for (const n of view.nodes) {
      expect(n.fen).toBe(playLine(INITIAL_FEN, n.ucis)!.fen);
      expect(n.uci).toBe(n.ucis.at(-1) ?? null);
    }
  });

  it('names the positions found in the dataset', () => {
    const view = graphView(graph, ITALIAN.slice(0, 4));
    const bc4 = view.nodes.find((n) => n.san === 'Bc4' && n.depth === 1)!;
    expect(bc4).toMatchObject({ eco: 'C50', name: 'Italian Game' });
  });

  it('shows the last moves played as a chain before the current position', () => {
    const view = graphView(graph, ITALIAN, { back: 2 });
    const past = byKind(view, 'past');
    expect(past.map((n) => n.san)).toEqual(['Nf3', 'Nc6']);
    expect(past.map((n) => n.depth)).toEqual([-2, -1]);
    const [current] = byKind(view, 'current');
    expect(current!.san).toBe('Bc4');
    // chain edges: Nf3 → Nc6 → Bc4
    const edge = (a: string, b: string) => view.edges.some((e) => e.from === a && e.to === b);
    expect(edge(past[0]!.key, past[1]!.key)).toBe(true);
    expect(edge(past[1]!.key, current!.key)).toBe(true);
  });

  it('has only the path when the position is out of book', () => {
    const view = graphView(graph, ['h2h4', 'h7h5', 'h1h3']);
    expect(view.nodes.filter((n) => n.depth > 0)).toEqual([]);
    expect(byKind(view, 'current')[0]!.san).toBe('Rh3');
  });

  it('lays the tree out in columns by depth without overlaps', () => {
    const view = graphView(graph, ITALIAN, { back: 2, forward: [8, 3] });
    for (const n of view.nodes) expect(n.x).toBe(n.depth + 2);
    const columns = new Map<number, number[]>();
    for (const n of view.nodes) columns.set(n.x, [...(columns.get(n.x) ?? []), n.y]);
    for (const ys of columns.values()) expect(new Set(ys).size).toBe(ys.length);
    // a parent sits between its first and last child
    for (const n of view.nodes) {
      const kids = view.edges
        .filter((e) => e.from === n.key)
        .map((e) => view.nodes.find((m) => m.key === e.to)!);
      if (kids.length < 2) continue;
      const ys = kids.map((k) => k.y);
      expect(n.y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(n.y).toBeLessThanOrEqual(Math.max(...ys));
    }
    expect(view.columns).toBe(5);
    expect(view.rows).toBeGreaterThan(0);
    for (const n of view.nodes) expect(n.y).toBeLessThan(view.rows);
  });

  it('weights edges by the dataset lines through the move', () => {
    const view = graphView(graph, []);
    const e4 = view.nodes.find((n) => n.san === 'e4')!;
    const edge = view.edges.find((e) => e.to === e4.key)!;
    expect(edge.lines).toBe(e4.lines);
  });
});
