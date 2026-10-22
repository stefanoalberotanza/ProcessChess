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

  it('splits a name without a colon at its commas, as splitOpeningName does', () => {
    // data/openings: C12 "French Defense, Classical, 4. Bg5", A48 "London System, with Bd3"
    expect(nameSegments('French Defense, Classical, 4. Bg5')).toEqual([
      'French Defense',
      'Classical',
      '4. Bg5',
    ]);
    expect(nameSegments('London System, with Bd3')).toEqual(['London System', 'with Bd3']);
  });
});

describe('buildNameTree', () => {
  it('has the openings as roots, most used first', () => {
    expect(tree.roots.length).toBeGreaterThan(50);
    for (const k of tree.roots)
      expect(tree.get(k)).toMatchObject({ kind: 'opening', depth: 0, parent: null });
    const lines = tree.roots.map((k) => tree.get(k)!.lines);
    expect([...lines].sort((a, b) => b - a)).toEqual(lines);
  });

  it('has only openings and variations, no families', () => {
    for (const n of tree.all()) {
      expect(['opening', 'variation'], n.key).toContain(n.kind);
      expect(n.key.startsWith('style:'), n.key).toBe(false);
      expect(n.kind === 'opening', n.key).toBe(n.parent === null);
    }
  });

  it('every dataset opening name is an opening (Sicilian Defense, Bird Opening, Bongcloud Attack)', () => {
    const families = new Set(names.filter((n) => n.includes(':')).map((n) => n.split(':')[0]!));
    const datasetOpenings = new Set(names.map((n) => (families.has(n) ? n : nameSegments(n)[0]!)));
    for (const f of datasetOpenings) {
      if (f === "King's Pawn Game" || f === "Queen's Pawn Game") continue;
      expect(tree.get(f)?.kind, f).toBe('opening');
    }
    expect(tree.get('Bird Opening')!.kind).toBe('opening');
    expect(tree.get('Bongcloud Attack')!.kind).toBe('opening');
  });

  it('nests variations under their family and sub-variations under their variation', () => {
    const najdorf = tree.nodeForName('Sicilian Defense: Najdorf Variation')!;
    expect(najdorf).toMatchObject({
      label: 'Najdorf Variation',
      parent: 'Sicilian Defense',
      own: true,
      eco: 'B90',
      kind: 'variation',
      depth: 1,
    });
    expect(najdorf.children).toContain('Sicilian Defense: Najdorf Variation, English Attack');
    expect(tree.get('Sicilian Defense')!.children).toContain('Sicilian Defense: Najdorf Variation');
    expect(tree.get('Sicilian Defense')).toMatchObject({ kind: 'opening', parent: null });
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
    const groups = [...tree.all()].filter((n) => !n.own);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.children.length).toBeGreaterThan(0);
      const descendant = tree.get(g.children[0]!)!;
      expect(descendant.key.startsWith(g.key)).toBe(true);
      expect(playLine(INITIAL_FEN, g.ucis)).not.toBeNull();
    }
  });

  it('hangs a name without a colon below its opening', () => {
    // data/openings: C12 "French Defense, Classical, 4. Bg5", A07 "King's Indian Attack, with e6"
    const bg5 = tree.nodeForName('French Defense, Classical, 4. Bg5')!;
    expect(bg5).toMatchObject({ kind: 'variation', label: '4. Bg5', depth: 2, eco: 'C12' });
    expect(tree.get(bg5.parent!)!.parent).toBe('French Defense');
    expect(tree.nodeForName("King's Indian Attack, with e6")!.parent).toBe("King's Indian Attack");
    // a comma before any colon only survives in a dataset family name
    const families = new Set(names.filter((n) => n.includes(':')).map((n) => n.split(':')[0]!));
    for (const k of tree.roots)
      if (!k.includes(':') && k.includes(',')) expect(families.has(k), k).toBe(true);
  });

  it('gives every level with a position its dataset name, and groups none', () => {
    // data/openings: E60 "Queen's Pawn, Mengarini Attack"
    const mengarini = tree.nodeForName("Queen's Pawn, Mengarini Attack")!;
    expect(mengarini.key).toBe("Queen's Pawn: Mengarini Attack");
    expect(mengarini.name).toBe("Queen's Pawn, Mengarini Attack");
    const datasetNames = new Set(names);
    for (const n of tree.all()) {
      if (!n.own) {
        expect(n.name, n.key).toBeNull();
        continue;
      }
      expect(datasetNames.has(n.name!), n.key).toBe(true);
      expect(tree.nodeForName(n.name!), n.key).toBe(n);
    }
  });

  it('keeps a name without a colon whole when it is a family of the dataset', () => {
    // data/openings: C25 "Vienna Gambit, with Max Lange Defense" and
    // "Vienna Gambit, with Max Lange Defense: Steinitz Gambit"
    const family = 'Vienna Gambit, with Max Lange Defense';
    expect(tree.get(family)).toMatchObject({ kind: 'opening', own: true, eco: 'C25' });
    expect(tree.nodeForName(family)!.key).toBe(family);
    expect(tree.nodeForName(`${family}: Steinitz Gambit`)!.parent).toBe(family);
    expect(tree.get('Vienna Gambit')).toBeUndefined();
  });

  it("covers every name of the dataset but the style names (King's / Queen's Pawn Game)", () => {
    for (const n of new Set(names)) {
      if (n === "King's Pawn Game" || n === "Queen's Pawn Game") {
        expect(tree.nodeForName(n), n).toBeUndefined();
        continue;
      }
      expect(tree.nodeForName(n), n).toBeDefined();
    }
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
    for (const n of tree.all()) expect(n.side).toBe(moverOfLast(n.ucis));
  });
});

describe('the style names are not openings', () => {
  it("King's Pawn Game and Queen's Pawn Game are not in the tree", () => {
    expect(tree.get("King's Pawn Game")).toBeUndefined();
    expect(tree.get("Queen's Pawn Game")).toBeUndefined();
  });

  it('their variations are openings of their own', () => {
    // data/openings: C20 "King's Pawn Game: King's Head Opening" 1. e4 e5 2. f3
    const head = tree.nodeForName("King's Pawn Game: King's Head Opening")!;
    expect(head).toMatchObject({
      kind: 'opening',
      parent: null,
      depth: 0,
      label: "King's Head Opening",
      eco: 'C20',
      ucis: ['e2e4', 'e7e5', 'f2f3'],
    });
    expect(tree.roots).toContain(head.key);
  });
});

describe('style variations named like an opening of their own', () => {
  // data/openings: A48 "London System" 1. d4 Nf6 2. Nf3 g6 3. Bf4,
  // D02 "Queen's Pawn Game: London System" 1. d4 d5 2. Nf3 Nf6 3. Bf4
  it('are not openings: the opening keeps its own main line', () => {
    const london = tree.get('London System')!;
    expect(london).toMatchObject({
      kind: 'opening',
      own: true,
      name: 'London System',
      eco: 'A48',
      ucis: ['d2d4', 'g8f6', 'g1f3', 'g7g6', 'c1f4'],
    });
    expect(tree.get("Queen's Pawn Game: London System")).toBeUndefined();
    expect(tree.nodeForName("Queen's Pawn Game: London System")).toBe(london);
  });

  it('hand their variations to the opening', () => {
    // D02 "Queen's Pawn Game: London System, Pterodactyl Variation"
    const name = "Queen's Pawn Game: London System, Pterodactyl Variation";
    const ptero = tree.nodeForName(name)!;
    expect(ptero).toMatchObject({
      key: 'London System: Pterodactyl Variation',
      parent: 'London System',
      kind: 'variation',
      depth: 1,
      name,
    });
    expect(tree.get('London System')!.children).toContain(ptero.key);
  });

  it("apply to King's Pawn Game too", () => {
    // C40 "Gunderam Defense", "King's Pawn Game: Gunderam Defense, Gunderam Gambit"
    const gambit = tree.nodeForName("King's Pawn Game: Gunderam Defense, Gunderam Gambit")!;
    expect(gambit.parent).toBe('Gunderam Defense');
    expect(tree.get('Gunderam Defense')!.parent).toBeNull();
  });

  it('leave every opening label unique', () => {
    const labels = tree.roots.map((k) => tree.get(k)!.label);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });
});

describe('one-move names are labels, not openings (ADR 012)', () => {
  it('an opening named only at 1 ply is a group of its variations', () => {
    const english = tree.get('English Opening')!;
    expect(english.own).toBe(false);
    expect(english.ucis.length).toBeGreaterThan(1);
  });

  it('no opening level with sub-levels is practised as a single move', () => {
    for (const n of tree.all())
      if (n.children.length) expect(n.ucis.length, n.key).toBeGreaterThan(1);
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
