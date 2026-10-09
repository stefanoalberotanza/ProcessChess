import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from './data';
import { classifyOpening, classifyOpeningUci, labelOfUci } from './resolve';

// Expected names and ECO codes are copied from data/openings/*.tsv, not from memory.

const san = (pgn: string) => pgn.split(' ').filter((t) => !/^\d+\.$/.test(t));

describe('classifyOpening', () => {
  beforeAll(() => loadOpenings());

  it('is empty for the empty line', () => {
    expect(classifyOpening([])).toEqual({ label: null, opening: null, variation: null, ply: 0 });
  });

  it('treats one-move names as labels, not openings', () => {
    expect(classifyOpening(['e4'])).toEqual({
      label: 'king',
      opening: null,
      variation: null,
      ply: 1,
    });
    expect(classifyOpening(['d4']).label).toBe('queen');
    expect(classifyOpening(['c4']).label).toBe('flank');
    expect(classifyOpening(['Nf3']).label).toBe('flank');
  });

  it("names the Ruy Lopez, not the King's Pawn Game, from 3.Bb5", () => {
    // C60 Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5
    expect(classifyOpening(san('1. e4 e5 2. Nf3 Nc6 3. Bb5'))).toEqual({
      label: 'king',
      opening: { eco: 'C60', name: 'Ruy Lopez', ply: 5 },
      variation: null,
      ply: 5,
    });
    // C84 Ruy Lopez: Closed: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
    expect(classifyOpening(san('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7'))).toEqual({
      label: 'king',
      opening: { eco: 'C60', name: 'Ruy Lopez', ply: 5 },
      variation: { eco: 'C84', name: 'Closed', ply: 10 },
      ply: 10,
    });
  });

  it('keeps the Najdorf as a variation of the Sicilian Defense', () => {
    // B20 Sicilian Defense: 1. e4 c5; B90 Sicilian Defense: Najdorf Variation
    const najdorf = san('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
    expect(classifyOpening(najdorf)).toEqual({
      label: 'king',
      opening: { eco: 'B20', name: 'Sicilian Defense', ply: 2 },
      variation: { eco: 'B90', name: 'Najdorf Variation', ply: 10 },
      ply: 10,
    });
  });

  it("starts a new opening when the family name changes (QGD after Queen's Gambit)", () => {
    // D30 Queen's Gambit Declined: 1. d4 d5 2. c4 e6; D50 ...: Modern Variation (4. Bg5)
    expect(classifyOpening(san('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5'))).toEqual({
      label: 'queen',
      opening: { eco: 'D30', name: "Queen's Gambit Declined", ply: 4 },
      variation: { eco: 'D50', name: 'Modern Variation', ply: 7 },
      ply: 7,
    });
  });

  it('recognises transpositions; the label follows the first move', () => {
    // E20 Nimzo-Indian Defense: 1. d4 Nf6 2. c4 e6 3. Nc3 Bb4
    const viaD4 = classifyOpening(san('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'));
    const viaC4 = classifyOpening(san('1. c4 e6 2. Nc3 Nf6 3. d4 Bb4'));
    expect(viaD4.opening).toEqual({ eco: 'E20', name: 'Nimzo-Indian Defense', ply: 6 });
    expect(viaC4.opening).toEqual(viaD4.opening);
    expect([viaD4.label, viaC4.label]).toEqual(['queen', 'flank']);
  });

  it('keeps a one-move family as the opening when no other name follows (English)', () => {
    // A22 English Opening: Carls-Bremen System: 1. c4 e5 2. Nc3 Nf6 3. g3
    expect(classifyOpening(san('1. c4 e5 2. Nc3 Nf6 3. g3'))).toMatchObject({
      label: 'flank',
      opening: { name: 'English Opening', ply: 2 },
      variation: { eco: 'A22', name: 'Carls-Bremen System', ply: 5 },
    });
  });

  it('uses the last run of the final family when names flicker (Zukertort > KIA > Zukertort)', () => {
    // A05 King's Indian Attack: Symmetrical Defense: 1. Nf3 Nf6 2. g3 g6
    // A05 Zukertort Opening: Double Fianchetto Attack: ... 6. O-O
    const line = san('1. Nf3 Nf6 2. g3 g6 3. b3 Bg7 4. Bb2 O-O 5. Bg2 d6 6. O-O');
    const c = classifyOpening(line);
    expect(c.opening?.name).toBe('Zukertort Opening');
    expect(c.opening?.ply).toBeGreaterThan(4);
    expect(c.variation).toEqual({ eco: 'A05', name: 'Double Fianchetto Attack', ply: 11 });
  });

  it('splits comma-only names into family and variation', () => {
    // A07 King's Indian Attack, with Bf5: 1. Nf3 Nf6 2. g3 d5 3. Bg2 c6 4. O-O Bf5
    expect(classifyOpening(san('1. Nf3 Nf6 2. g3 d5 3. Bg2 c6 4. O-O Bf5'))).toMatchObject({
      opening: { name: "King's Indian Attack" },
      variation: { eco: 'A07', name: 'with Bf5', ply: 8 },
    });
  });

  it('keeps the last opening when the line leaves theory', () => {
    const c = classifyOpening(san('1. e4 e5 2. Nf3 Nc6 3. Bb5 Qe7 4. Kf1'));
    expect(c.opening?.name).toBe('Ruy Lopez');
    expect(c.ply).toBeLessThan(8);
  });
});

describe('classifyOpeningUci', () => {
  beforeAll(() => loadOpenings());

  it('classifies a line given in UCI like the same line in SAN', () => {
    const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
    expect(classifyOpeningUci(ucis)).toEqual(classifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']));
  });

  it('returns null for an illegal line', () => {
    expect(classifyOpeningUci(['e2e5'])).toBeNull();
  });

  it('labels the first move', () => {
    expect([labelOfUci('e2e4'), labelOfUci('d2d4'), labelOfUci('c2c4')]).toEqual([
      'king',
      'queen',
      'flank',
    ]);
  });
});
