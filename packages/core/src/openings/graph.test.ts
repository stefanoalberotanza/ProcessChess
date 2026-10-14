import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { toEpd } from '../fen';
import { INITIAL_FEN, playLine } from '../position';
import { loadOpenings } from './data';
import {
  type OpeningGraph,
  bookLinesFrom,
  bookMoves,
  epdHash,
  isBookPosition,
  loadOpeningGraph,
  searchOpenings,
  searchPosition,
} from './graph';

// Expectations derive from data/openings/*.tsv, not from memory.
const dataDir = join(import.meta.dirname, '../../../../data/openings');
const rows = ['a', 'b', 'c', 'd', 'e'].flatMap((v) =>
  readFileSync(join(dataDir, `${v}.tsv`), 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean),
);
const pgnOf = (row: string) => row.split('\t')[2]!;

function fenAfter(sans: string[]): string {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
}

const ITALIAN = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

describe('epdHash', () => {
  it('is a stable 8-hex-digit FNV-1a hash', () => {
    expect(epdHash(toEpd(INITIAL_FEN))).toMatch(/^[0-9a-f]{8}$/);
    expect(epdHash('a')).toBe(epdHash('a'));
    expect(epdHash('a')).not.toBe(epdHash('b'));
  });
});

describe('opening graph', () => {
  it('starts at the initial position and counts the dataset lines through each move', () => {
    const root = graph.nodeOf(toEpd(INITIAL_FEN));
    expect(root).toBe(graph.root);
    const e4 = graph.children(graph.root).find((c) => c.uci === 'e2e4')!;
    expect(e4.lines).toBe(rows.filter((r) => /^1\. e4( |$)/.test(pgnOf(r))).length);
    const total = graph.children(graph.root).reduce((n, c) => n + c.lines, 0);
    expect(total).toBe(rows.length);
  });

  it('merges transpositions into one node', () => {
    const viaD4 = graph.nodeOf(toEpd(fenAfter(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'])));
    const viaC4 = graph.nodeOf(toEpd(fenAfter(['c4', 'e6', 'Nc3', 'Nf6', 'd4', 'Bb4'])));
    expect(viaD4).toBeDefined();
    expect(viaC4).toBe(viaD4);
  });

  it('includes intermediate positions of every line', () => {
    // every prefix of the Najdorf line is a node
    const sans = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    for (let i = 0; i <= sans.length; i++) {
      expect(graph.nodeOf(toEpd(fenAfter(sans.slice(0, i))))).toBeDefined();
    }
  });

  it('gives a path of moves from the start to any node', () => {
    const node = graph.nodeOf(toEpd(fenAfter(['c4', 'e6', 'Nc3', 'Nf6', 'd4', 'Bb4'])))!;
    const c = new Chess();
    for (const u of graph.pathTo(node))
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    expect(graph.nodeOf(toEpd(c.fen()))).toBe(node);
  });

  it('returns nothing for positions outside the dataset', () => {
    expect(graph.nodeOf(toEpd(fenAfter(['h4', 'h5', 'Rh3'])))).toBeUndefined();
  });
});

describe('bookMoves', () => {
  it('lists the theory moves from a position with SAN, line counts and names', () => {
    const moves = bookMoves(graph, ITALIAN);
    const sans = moves.map((m) => m.san);
    // continuations named in c.tsv after 3.Bc4
    for (const s of ['Bc5', 'Nf6', 'Be7', 'd6', 'Nd4', 'h6', 'f5']) expect(sans).toContain(s);
    const bc5 = moves.find((m) => m.san === 'Bc5')!;
    expect(bc5).toMatchObject({ uci: 'f8c5', eco: 'C50', name: 'Italian Game: Giuoco Piano' });
    // ordered by number of lines, descending
    const counts = moves.map((m) => m.lines);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('is empty outside the dataset', () => {
    expect(bookMoves(graph, fenAfter(['h4', 'h5', 'Rh3']))).toEqual([]);
  });
});

describe('bookLinesFrom', () => {
  it('keeps one move for the user and every opponent reply', () => {
    const lines = bookLinesFrom(graph, ITALIAN, 'w');
    expect(lines.length).toBeGreaterThan(5);
    const userChoice = new Map<string, string>();
    const blackFirst = new Set<string>();
    for (const line of lines) {
      blackFirst.add(line[0]!);
      const c = new Chess(ITALIAN);
      line.forEach((u, i) => {
        const key = toEpd(c.fen());
        if (i % 2 === 1) {
          // white (user) to move: always the same choice in the same position
          expect(userChoice.get(key) ?? u).toBe(u);
          userChoice.set(key, u);
        }
        c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      });
    }
    // all black replies named in the dataset are covered
    expect(blackFirst.size).toBe(bookMoves(graph, ITALIAN).length);
  });

  it('for the side to move follows the most played book move', () => {
    const lines = bookLinesFrom(graph, ITALIAN, 'b');
    const top = bookMoves(graph, ITALIAN)[0]!.uci;
    expect(new Set(lines.map((l) => l[0]))).toEqual(new Set([top]));
  });

  it('honours maxLines', () => {
    expect(bookLinesFrom(graph, INITIAL_FEN, 'b', { maxLines: 10 })).toHaveLength(10);
  });
});

describe('searchOpenings', () => {
  it('finds openings by name, shortest line first, with the moves to reach them', () => {
    const results = searchOpenings(graph, 'najdorf', 5);
    expect(results[0]).toMatchObject({ eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' });
    const c = new Chess();
    for (const u of results[0]!.uci)
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    expect(toEpd(c.fen())).toBe(results[0]!.epd);
    expect(results).toHaveLength(5);
  });

  it('finds openings by ECO code', () => {
    const results = searchOpenings(graph, 'c50', 50);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((r) => r.eco === 'C50')).toBe(true);
    expect(results[0]!.name).toBe('Italian Game');
  });

  it('matches every word, case-insensitively', () => {
    const results = searchOpenings(graph, 'sicilian dragon', 100);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => /sicilian/i.test(r.name) && /dragon/i.test(r.name))).toBe(true);
  });
});

describe('isBookPosition', () => {
  it('is true on every position of a book line, named or not (Indian Defense practice line)', async () => {
    const { buildNameTree, openingLine } = await import('../lab');
    const { resolveOpening } = await import('./resolve');
    const indian = buildNameTree(graph).get('Indian Defense')!;
    const line = openingLine(graph, indian.ucis);
    let unnamedInBook = 0;
    for (let ply = 1; ply <= line.length; ply++) {
      const played = playLine(INITIAL_FEN, line.slice(0, ply))!;
      expect(isBookPosition(graph, played.fen), `ply ${ply}`).toBe(true);
      // the old check: the last named position is behind the current one
      if (resolveOpening(played.san)!.ply < ply) unnamedInBook++;
    }
    expect(unnamedInBook).toBeGreaterThan(0);
  });

  it('is false outside the dataset', () => {
    expect(isBookPosition(graph, fenAfter(['h4', 'h5', 'Rh3']))).toBe(false);
    expect(isBookPosition(graph, INITIAL_FEN)).toBe(true);
  });
});

describe('searchPosition', () => {
  // the Scotch Game position (C44 in c.tsv), reached by a non-book move order
  const SCOTCH_TRANSPOSED = fenAfter(['Nf3', 'Nc6', 'e4', 'e5', 'd4']);

  it('finds a position reached by a different move order', () => {
    expect(toEpd(SCOTCH_TRANSPOSED)).toBe(toEpd(fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'd4'])));
    const r = searchPosition(graph, SCOTCH_TRANSPOSED)!;
    expect(r.position).toMatchObject({ eco: 'C44', name: 'Scotch Game' });
    expect(r.position.uci).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4']);
  });

  it('accepts a pasted FEN with any move counters', () => {
    const r = searchPosition(
      graph,
      'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3',
    );
    expect(r?.position.name).toBe('Scotch Game');
  });

  it('lists named openings reachable from the position, shortest first', () => {
    const r = searchPosition(graph, SCOTCH_TRANSPOSED, 500)!;
    const names = r.reachable.map((o) => o.name);
    expect(names).toContain('Scotch Game: Göring Gambit');
    expect(names).toContain('Scotch Game: Göring Gambit, Main Line');
    expect(names).not.toContain('Scotch Game: Benima Defense');
    const lengths = r.reachable.map((o) => o.uci.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    for (const o of r.reachable) expect(o.uci.slice(0, 5)).toEqual(r.position.uci);
  });

  it('names an unnamed book position after its nearest named ancestor', () => {
    const fen = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'c3', 'dxc3', 'Nxc3']);
    const r = searchPosition(graph, fen)!;
    expect(r.position.name).toMatch(/^Scotch Game/);
    expect(r.position.uci.length).toBeLessThanOrEqual(9);
  });

  it('returns null for invalid or out-of-book positions', () => {
    expect(searchPosition(graph, 'not a fen')).toBeNull();
    expect(searchPosition(graph, fenAfter(['a3', 'h6', 'a4', 'h5', 'Ra3', 'Rh6']))).toBeNull();
  });
});
