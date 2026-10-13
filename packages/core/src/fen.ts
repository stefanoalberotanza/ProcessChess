/**
 * EPD as used in this project: the first four FEN fields
 * (placement, side to move, castling, en passant).
 *
 * Always derive the FEN from chess.js: its `fen()` writes the en passant square
 * only when an en passant capture is actually legal, which matches the
 * lichess-org/chess-openings convention and keeps EPD lookups stable.
 */
export function toEpd(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) {
    throw new Error(`Invalid FEN, expected at least 4 fields: "${fen}"`);
  }
  return fields.slice(0, 4).join(' ');
}
