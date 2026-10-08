import { describe, expect, it } from 'vitest';
import {
  INITIAL_FEN,
  describePosition,
  piecesOf,
  playLine,
  playMove,
  sanToUci,
  uciToSan,
} from './position';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('position helpers', () => {
  it('describes side to move, check and legal destinations', () => {
    const p = describePosition(INITIAL_FEN);
    expect(p.turn).toBe('w');
    expect(p.check).toBe(false);
    expect(p.dests.get('e2')).toEqual(['e3', 'e4']);
    expect(p.dests.get('g1')).toEqual(['f3', 'h3']);
    expect([...p.dests.values()].flat()).toHaveLength(20);
    expect(describePosition('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1').promotions).toEqual([]);
    expect(describePosition('7k/P7/8/8/8/8/8/K7 w - - 0 1').promotions).toEqual(['a7a8']);
  });

  it('plays UCI moves and returns SAN and the new FEN', () => {
    expect(playMove(INITIAL_FEN, 'e2e4')).toEqual({ uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    expect(playMove(INITIAL_FEN, 'e2e5')).toBeNull();
    expect(playMove('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8n')!.san).toBe('a8=N');
  });

  it('converts between SAN and UCI', () => {
    expect(uciToSan(INITIAL_FEN, 'g1f3')).toBe('Nf3');
    expect(uciToSan(INITIAL_FEN, 'g1g3')).toBeNull();
    expect(sanToUci(INITIAL_FEN, 'Nf3')).toBe('g1f3');
    expect(sanToUci(INITIAL_FEN, 'nf3')).toBeNull();
    expect(sanToUci(INITIAL_FEN, 'Nf3!?')).toBe('g1f3');
    expect(sanToUci(INITIAL_FEN, 'Ke2')).toBeNull();
    expect(sanToUci('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a8=Q+')).toBe('a7a8q');
  });
});

describe('playLine', () => {
  it('replays UCI moves returning SAN and the final FEN', () => {
    expect(playLine(INITIAL_FEN, ['e2e4', 'e7e5'])).toEqual({
      san: ['e4', 'e5'],
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    });
    expect(playLine(INITIAL_FEN, [])).toEqual({ san: [], fen: INITIAL_FEN });
  });

  it('returns null at the first illegal move', () => {
    expect(playLine(INITIAL_FEN, ['e2e4', 'e2e4'])).toBeNull();
  });
});

describe('piecesOf', () => {
  it('lists the pieces of a position with square, colour and type', () => {
    const pieces = piecesOf(INITIAL_FEN);
    expect(pieces).toHaveLength(32);
    expect(pieces).toContainEqual({ square: 'e1', color: 'w', type: 'k' });
    expect(pieces).toContainEqual({ square: 'd8', color: 'b', type: 'q' });
    expect(piecesOf('7k/8/8/8/8/8/8/K7 w - - 0 1')).toEqual([
      { square: 'h8', color: 'b', type: 'k' },
      { square: 'a1', color: 'w', type: 'k' },
    ]);
  });
});
