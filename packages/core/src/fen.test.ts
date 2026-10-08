import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { toEpd } from './fen';

describe('toEpd', () => {
  it('keeps the first four FEN fields', () => {
    expect(toEpd(new Chess().fen())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('rejects malformed FEN', () => {
    expect(() => toEpd('not a fen')).toThrow();
  });
});
