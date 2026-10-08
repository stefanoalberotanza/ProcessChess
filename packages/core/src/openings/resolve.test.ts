import { describe, expect, it } from 'vitest';
import { IllegalMoveError, resolveOpening } from './resolve';

// Expected names are copied from data/openings/*.tsv (lichess-org/chess-openings), not from memory.

describe('resolveOpening', () => {
  it('returns null for the empty sequence (start position is not a named opening)', () => {
    expect(resolveOpening([])).toBeNull();
  });

  it('recognises the Italian Game', () => {
    expect(resolveOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'])).toEqual({
      eco: 'C50',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      ply: 5,
    });
  });

  it('recognises the Najdorf up to 5...a6', () => {
    const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    expect(resolveOpening(najdorf)).toEqual({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
      family: 'Sicilian Defense',
      variation: 'Najdorf Variation',
      ply: 10,
    });
  });

  it('keeps sub-variations in the variation field', () => {
    const english = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3'];
    expect(resolveOpening(english)).toMatchObject({
      eco: 'B90',
      family: 'Sicilian Defense',
      variation: 'Najdorf Variation, English Attack',
      ply: 11,
    });
  });

  it('handles transpositions (Nimzo-Indian via 1.d4 and via 1.c4)', () => {
    const viaD4 = resolveOpening(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']);
    const viaC4 = resolveOpening(['c4', 'e6', 'Nc3', 'Nf6', 'd4', 'Bb4']);
    expect(viaD4).toEqual({
      eco: 'E20',
      name: 'Nimzo-Indian Defense',
      family: 'Nimzo-Indian Defense',
      variation: null,
      ply: 6,
    });
    expect(viaC4).toEqual(viaD4);
  });

  it('returns the last known opening and its ply when the line leaves theory', () => {
    // 3...Qe7 4.Kf1 is not in the dataset; walking back finds 3.Bc4 (Italian Game, ply 5).
    expect(resolveOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qe7', 'Kf1'])).toEqual({
      eco: 'C50',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      ply: 5,
    });
  });

  it('throws an explicit error on an illegal move', () => {
    expect(() => resolveOpening(['e4', 'e5', 'Ke3'])).toThrow(IllegalMoveError);
    expect(() => resolveOpening(['e4', 'e5', 'Ke3'])).toThrow(/Ke3.*ply 3/);
  });

  it('throws on unparsable input', () => {
    expect(() => resolveOpening(['e4', 'xyz'])).toThrow(IllegalMoveError);
  });
});
