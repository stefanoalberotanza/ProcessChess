import { INITIAL_FEN, type SrsCard, lineSrsState, parseUci, playLine } from '@processchess/core';

/** Board of a row's thumbnail: the position after `ucis`, with its last move highlighted. */
export function tileBoard(n: { ucis: readonly string[] }): {
  fen: string;
  last: [string, string] | null;
} {
  const fen = playLine(INITIAL_FEN, n.ucis)?.fen ?? INITIAL_FEN;
  const u = n.ucis.at(-1);
  if (!u) return { fen, last: null };
  const { from, to } = parseUci(u);
  return { fen, last: [from, to] };
}

/** "1.e4 c5 2.Nf3" for UCI moves from the initial position. */
export function sanLine(line: readonly string[]): string {
  const moves = playLine(INITIAL_FEN, line)?.san ?? [];
  return moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
}

/** FSRS state of a practice line in the repertoire, `null` when it is not there (ADR 013). */
export function srsOfLine(
  line: string[],
  side: 'w' | 'b' | null,
  repertoire: Map<string, SrsCard[]>,
) {
  return side ? lineSrsState(line, side, repertoire) : null;
}
