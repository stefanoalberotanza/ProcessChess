import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { toEpd } from '../fen';
import { openings } from './data';
import { splitOpeningName } from './resolve';

describe('openings dataset', () => {
  it('has one entry per EPD', () => {
    expect(new Set(openings.map((o) => o.epd)).size).toBe(openings.length);
  });

  it('every entry replays with chess.js to its EPD', () => {
    const mismatches: string[] = [];
    for (const o of openings) {
      const chess = new Chess();
      const moves = o.uci.split(' ');
      for (const m of moves) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      if (toEpd(chess.fen()) !== o.epd || moves.length !== o.ply) {
        mismatches.push(`${o.eco} ${o.name}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 30_000);
});

describe('splitOpeningName', () => {
  it('splits family and variation', () => {
    expect(splitOpeningName('Sicilian Defense: Najdorf Variation, English Attack')).toEqual({
      family: 'Sicilian Defense',
      variation: 'Najdorf Variation, English Attack',
    });
    expect(splitOpeningName('Italian Game')).toEqual({ family: 'Italian Game', variation: null });
  });
});
