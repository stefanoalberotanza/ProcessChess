import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from './data';
import { type OpeningGraph, loadOpeningGraph } from './graph';
import { branchesFrom, commonPrefix, deepestName, sidesFrom } from './continuations';

// expectations come from data/openings/c.tsv
const KNIGHT = ['e2e4', 'e7e5', 'g1f3']; // King's Knight Opening

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

describe('branchesFrom', () => {
  it('lists every next name by moves, of the same family or not', () => {
    const by = new Map(branchesFrom(graph, KNIGHT).map((b) => [b.name, b]));
    expect(by.get("King's Knight Opening: Normal Variation")?.via).toEqual(['b8c6']);
    expect(by.get("Petrov's Defense")?.via).toEqual(['g8f6']);
    expect(by.get('Philidor Defense')?.via).toEqual(['d7d6']);
    expect(by.get("King's Knight Opening: Normal Variation")?.family).toBe("King's Knight Opening");
  });

  it('stops at the first next name on each path, and lists each name once', () => {
    const out = branchesFrom(graph, KNIGHT);
    // the Ruy Lopez comes after Normal Variation (2...Nc6 3.Bb5): not a branch of 2.Nf3 itself
    expect(out.some((b) => b.name === 'Ruy Lopez')).toBe(false);
    expect(new Set(out.map((b) => b.name)).size).toBe(out.length);
    expect(out.some((b) => b.name === "King's Knight Opening")).toBe(false);
  });

  it('is empty off book', () => {
    expect(branchesFrom(graph, ['h2h4', 'h7h5', 'h1h3'])).toEqual([]);
  });
});

describe('commonPrefix', () => {
  it('is the moves every line shares from the start', () => {
    expect(
      commonPrefix([
        ['e2e4', 'e7e5', 'g1f3'],
        ['e2e4', 'e7e5', 'f1c4'],
      ]),
    ).toEqual(['e2e4', 'e7e5']);
    expect(commonPrefix([['d2d4', 'd7d5']])).toEqual(['d2d4', 'd7d5']);
    expect(commonPrefix([['e2e4'], ['d2d4']])).toEqual([]);
    expect(commonPrefix([])).toEqual([]);
  });

  it('is the position itself when a group diverges at once (King’s Pawn Game after 2.Nf3)', () => {
    // 2...f6, 2...Bc5, 2...Qf6, 2...c6 (data/openings/c.tsv)
    const group = branchesFrom(graph, KNIGHT).filter((b) => b.family === "King's Pawn Game");
    expect(group.length).toBeGreaterThan(1);
    expect(commonPrefix(group.map((b) => b.ucis))).toEqual(KNIGHT);
  });
});

describe('sidesFrom', () => {
  it('sees openings of both sides after 2.Nf3 (Ruy Lopez for White, Petrov for Black)', () => {
    expect(sidesFrom(graph, KNIGHT)).toEqual({ w: true, b: true });
  });

  it('sees only White after a White leaf (Sicilian Defense: Bowdler Attack, 1.e4 c5 2.Bc4)', () => {
    expect(sidesFrom(graph, ['e2e4', 'c7c5', 'f1c4'])).toEqual({ w: true, b: false });
  });

  it('sees nothing off book', () => {
    expect(sidesFrom(graph, ['h2h4', 'h7h5', 'h1h3'])).toEqual({ w: false, b: false });
  });
});

describe('deepestName', () => {
  it('is the deepest dataset name along the moves (data/openings/b.tsv B90)', () => {
    const najdorf = [
      'e2e4',
      'c7c5',
      'g1f3',
      'd7d6',
      'd2d4',
      'c5d4',
      'f3d4',
      'g8f6',
      'b1c3',
      'a7a6',
    ];
    expect(deepestName(graph, najdorf)).toBe('Sicilian Defense: Najdorf Variation');
    expect(deepestName(graph, [...najdorf, 'h2h4', 'h7h5', 'h1h3'])).toBe(
      'Sicilian Defense: Najdorf Variation',
    );
    expect(deepestName(graph, [])).toBe(null); // the initial position has no name
  });
});
