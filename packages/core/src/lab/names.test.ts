import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { toEpd } from '../fen';
import { loadOpenings, openingIndex } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { INITIAL_FEN, playLine } from '../position';
import { type NameTree, buildNameTree, moverOfLast, nameSegments } from './names';

// expectations come from data/openings/*.tsv
const dataDir = join(import.meta.dirname, '../../../../data/openings');
const names = ['a', 'b', 'c', 'd', 'e'].flatMap((v) =>
  readFileSync(join(dataDir, `${v}.tsv`), 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((r) => r.split('\t')[1]!),
);

let graph: OpeningGraph;
let tree: NameTree;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  tree = buildNameTree(graph);
});

describe('nameSegments', () => {
  it('splits "Family: Variation, Subvariation"', () => {
    expect(nameSegments('Sicilian Defense: Najdorf Variation, English Attack')).toEqual([
      'Sicilian Defense',
      'Najdorf Variation',
      'English Attack',
    ]);
    expect(nameSegments('Italian Game')).toEqual(['Italian Game']);
  });
});

describe('buildNameTree', () => {
  it('has the three families as roots, most used first', () => {
    expect(tree.roots.map((k) => tree.get(k)!.style).sort()).toEqual(['flank', 'king', 'queen']);
    for (const k of tree.roots) expect(tree.get(k)).toMatchObject({ kind: 'family', depth: 0 });
    const lines = tree.roots.map((k) => tree.get(k)!.lines);
    expect([...lines].sort((a, b) => b - a)).toEqual(lines);
  });

  it('puts every dataset family under a family, as a subfamily or a variation', () => {
    const datasetFamilies = new Set(names.map((n) => nameSegments(n)[0]!));
    for (const f of datasetFamilies) {
      const n = tree.nodeForName(f)!;
      if (n.kind === 'family') continue; // the style's own name is the family itself
      expect(['subfamily', 'variation'], f).toContain(n.kind);
      expect(tree.get(n.parent!)!.kind, f).toBe('family');
      expect(n.depth).toBe(1);
    }
  });

  it('nests variations under their family and sub-variations under their variation', () => {
    const najdorf = tree.nodeForName('Sicilian Defense: Najdorf Variation')!;
    expect(najdorf).toMatchObject({
      label: 'Najdorf Variation',
      parent: 'Sicilian Defense',
      own: true,
      eco: 'B90',
      kind: 'variation',
      depth: 2,
    });
    expect(najdorf.children).toContain('Sicilian Defense: Najdorf Variation, English Attack');
    expect(tree.get('Sicilian Defense')!.children).toContain('Sicilian Defense: Najdorf Variation');
    expect(tree.get('Sicilian Defense')).toMatchObject({ kind: 'subfamily', parent: 'style:king' });
    // the moves reach the named position
    const epd = toEpd(playLine(INITIAL_FEN, najdorf.ucis)!.fen);
    expect(openingIndex()!.get(epd)).toEqual(['B90', 'Sicilian Defense: Najdorf Variation']);
    expect(najdorf.ucis).toHaveLength(10);
  });

  it('orders children by the dataset lines through them', () => {
    for (const key of ['Sicilian Defense', 'Italian Game', "Queen's Gambit Declined"]) {
      const kids = tree.get(key)!.children.map((k) => tree.get(k)!.lines);
      expect([...kids].sort((a, b) => b - a)).toEqual(kids);
    }
  });

  it('keeps groups that have no position of their own, reachable through a descendant', () => {
    const groups = [...tree.all()].filter((n) => !n.own && n.kind !== 'family');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.children.length).toBeGreaterThan(0);
      const descendant = tree.get(g.children[0]!)!;
      expect(descendant.key.startsWith(g.key)).toBe(true);
      expect(playLine(INITIAL_FEN, g.ucis)).not.toBeNull();
    }
  });

  it('covers every name of the dataset', () => {
    for (const n of new Set(names)) expect(tree.nodeForName(n), n).toBeDefined();
  });
});

describe('opening side', () => {
  it('is the side that plays the defining move (shortest line of the name in the dataset)', () => {
    // data/openings: B20 "1. e4 c5", C00 "1. e4 e6", C50 "… 3. Bc4", C60 "… 3. Bb5", C30 "2. f4"
    expect(tree.get('Sicilian Defense')!.side).toBe('b');
    expect(tree.get('French Defense')!.side).toBe('b');
    expect(tree.get('Italian Game')!.side).toBe('w');
    expect(tree.get('Ruy Lopez')!.side).toBe('w');
    expect(tree.get("King's Gambit")!.side).toBe('w');
    expect(tree.nodeForName('Sicilian Defense: Najdorf Variation')!.side).toBe('b');
  });

  it('follows the parity of the moves', () => {
    expect(moverOfLast([])).toBeNull();
    expect(moverOfLast(['e2e4'])).toBe('w');
    expect(moverOfLast(['e2e4', 'c7c5'])).toBe('b');
    for (const n of tree.all()) if (n.kind !== 'family') expect(n.side).toBe(moverOfLast(n.ucis));
  });
});

describe('family > subfamily > variation', () => {
  const king = () => tree.get('style:king')!;

  it("the style's own name is the family, not an opening (King's Pawn Game)", () => {
    // data/openings: B00 "King's Pawn Game" 1. e4; C20 "King's Pawn Game" 1. e4 e5
    expect(tree.nodeForName("King's Pawn Game")).toBe(king());
    expect(tree.get("King's Pawn Game")).toBeUndefined();
    expect(king().ucis).toEqual(['e2e4']);
    expect(tree.nodeForName("Queen's Pawn Game")).toBe(tree.get('style:queen'));
  });

  it('its variations are variations of the family, with no subfamily in between', () => {
    // data/openings: C20 "King's Pawn Game: King's Head Opening" 1. e4 e5 2. f3
    const head = tree.nodeForName("King's Pawn Game: King's Head Opening")!;
    expect(head).toMatchObject({
      kind: 'variation',
      parent: 'style:king',
      depth: 1,
      label: "King's Head Opening",
      eco: 'C20',
      ucis: ['e2e4', 'e7e5', 'f2f3'],
    });
    expect(king().children).toContain(head.key);
  });

  it('a dataset family without branches of its own is a variation of the family', () => {
    // data/openings: C20 "Bongcloud Attack" 1. e4 e5 2. Ke2 (a single row)
    expect(tree.get('Bongcloud Attack')).toMatchObject({ kind: 'variation', parent: 'style:king' });
  });

  it('a family with branches is a subfamily (Italian Game, Sicilian Defense)', () => {
    expect(tree.get('Italian Game')).toMatchObject({ kind: 'subfamily', parent: 'style:king' });
    expect(tree.get('Sicilian Defense')!.kind).toBe('subfamily');
    expect(tree.get("Queen's Gambit Declined")).toMatchObject({
      kind: 'subfamily',
      parent: 'style:queen',
    });
  });

  it('flank openings have no own name: English Opening is a subfamily of the flank family', () => {
    // data/openings: A10 "English Opening" only at 1. c4
    expect(tree.get('English Opening')).toMatchObject({ kind: 'subfamily', parent: 'style:flank' });
  });
});

describe('one-move names are labels, not openings (ADR 012)', () => {
  it('a family named only at 1 ply is a group of its variations', () => {
    const english = tree.get('English Opening')!;
    expect(english.own).toBe(false);
    expect(english.ucis.length).toBeGreaterThan(1);
  });

  it('no opening level with sub-levels is practised as a single move', () => {
    for (const n of tree.all())
      if (n.kind !== 'family' && n.children.length) expect(n.ucis.length, n.key).toBeGreaterThan(1);
  });

  it('every level has the style of its first move', () => {
    expect(tree.get('Ruy Lopez')!.style).toBe('king');
    expect(tree.get('Sicilian Defense')!.style).toBe('king');
    expect(tree.get("Queen's Gambit Declined")!.style).toBe('queen');
    expect(tree.get('English Opening')!.style).toBe('flank');
    for (const n of tree.all()) {
      const first = n.ucis[0];
      expect(n.style).toBe(first === 'e2e4' ? 'king' : first === 'd2d4' ? 'queen' : 'flank');
    }
  });
});
