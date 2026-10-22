import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { openingOf } from './lines';
import { movesFrom, nestNames } from './moves';
import { type NameTree, buildNameTree } from './names';

// names from data/openings/*.tsv
let graph: OpeningGraph;
let tree: NameTree;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  tree = buildNameTree(graph);
});
const sans = (ms: { san: string }[]) => ms.map((m) => m.san);

describe('movesFrom', () => {
  it('after 1.e4 c5 lists Nf3 and c3, with the Alapin under White', () => {
    const here = movesFrom(graph, tree, ['e2e4', 'c7c5']);
    expect(sans(here.w)).toContain('Nf3');
    expect(sans(here.w)).toContain('c3');
    const c3 = here.w.find((m) => m.san === 'c3')!;
    expect(c3.names.map((n) => n.key)).toContain('Sicilian Defense: Alapin Variation');
    const nf3 = [...here.w, ...here.b].filter((m) => m.san === 'Nf3');
    const keys = nf3.flatMap((m) => m.names.map((n) => n.key));
    expect(keys).toContain('Sicilian Defense: Najdorf Variation');
    const najdorfSide = here.b.some((m) =>
      m.names.some((n) => n.key === 'Sicilian Defense: Najdorf Variation'),
    );
    expect(najdorfSide).toBe(true);
  });

  it('orders moves by opening count, then line count, then SAN', () => {
    const here = movesFrom(graph, tree, ['e2e4', 'c7c5']);
    for (const side of [here.w, here.b]) {
      for (let i = 1; i < side.length; i++) {
        const a = side[i - 1]!;
        const b = side[i]!;
        expect(
          a.openings > b.openings ||
            (a.openings === b.openings &&
              (a.lines > b.lines || (a.lines === b.lines && a.san.localeCompare(b.san) <= 0))),
          `${a.san} before ${b.san}`,
        ).toBe(true);
      }
    }
  });

  it('orders names by lines then key and puts the played move first in the example', () => {
    const ucis = ['e2e4', 'c7c5'];
    const here = movesFrom(graph, tree, ucis);
    const m = here.w[0]!;
    for (let i = 1; i < m.names.length; i++) {
      const a = m.names[i - 1]!;
      const b = m.names[i]!;
      expect(a.lines > b.lines || (a.lines === b.lines && a.key.localeCompare(b.key) <= 0)).toBe(
        true,
      );
    }
    expect(m.example.slice(0, ucis.length)).toEqual(ucis);
    expect(m.example[ucis.length]).toBe(m.uci);
  });

  it('counts a node once per move', () => {
    const here = movesFrom(graph, tree, ['e2e4', 'c7c5']);
    for (const m of [...here.w, ...here.b]) {
      const keys = m.names.map((n) => n.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(m.openings).toBe(new Set(m.names.map((n) => openingOf(tree, n).key)).size);
      expect(m.lines).toBe(m.names.reduce((s, n) => s + n.lines, 0));
    }
  });

  it('is the same for a transposed move order', () => {
    const book = movesFrom(graph, tree, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const transposed = movesFrom(graph, tree, ['g1f3', 'b8c6', 'e2e4', 'e7e5']);
    const shape = (h: typeof book) =>
      [h.w, h.b].map((s) => s.map((m) => [m.san, m.openings, m.lines]));
    expect(shape(transposed)).toEqual(shape(book));
  });

  it('puts each opening on its owner side and each variation on its own side', () => {
    const here = movesFrom(graph, tree, []);
    for (const [side, entries] of [
      ['w', here.w],
      ['b', here.b],
    ] as const) {
      for (const m of entries)
        for (const n of m.names) {
          if (n.kind === 'opening') expect([side, 'both']).toContain(n.owner ?? n.side);
          else expect(n.side).toBe(side);
        }
    }
  });

  it('is empty off book', () => {
    expect(movesFrom(graph, tree, ['h2h4', 'h7h5', 'h1h3'])).toEqual({ w: [], b: [] });
  });
});

describe('nestNames', () => {
  const flat = (bs: ReturnType<typeof nestNames>): string[] =>
    bs.flatMap((b) => [b.node.key, ...flat(b.children)]);

  it('keeps every name once and nests a name under its nearest ancestor in the list', () => {
    const here = movesFrom(graph, tree, ['e2e4', 'c7c5']);
    for (const m of [...here.w, ...here.b]) {
      const nested = nestNames(tree, m.names);
      expect(flat(nested).sort()).toEqual(m.names.map((n) => n.key).sort());
      const check = (bs: typeof nested, ancestors: string[]) => {
        for (const b of bs) {
          for (let p = b.node.parent; p; p = tree.get(p)?.parent ?? null) {
            // an ancestor in the list is an ancestor in the nesting
            const inList = m.names.some((n) => n.key === p);
            expect(!inList || ancestors.includes(p), `${b.node.key} under ${p}`).toBe(true);
          }
          check(b.children, [...ancestors, b.node.key]);
        }
      };
      check(nested, []);
    }
  });

  it('nests the Najdorf below the Sicilian when both are listed', () => {
    const najdorf = tree.get('Sicilian Defense: Najdorf Variation')!;
    const sicilian = tree.get('Sicilian Defense')!;
    const nested = nestNames(tree, [najdorf, sicilian]);
    expect(nested.map((b) => b.node.key)).toEqual(['Sicilian Defense']);
    expect(flat(nested)).toEqual(['Sicilian Defense', 'Sicilian Defense: Najdorf Variation']);
  });
});
