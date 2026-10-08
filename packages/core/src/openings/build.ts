import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import type { OpeningIndexJson } from './types';

/**
 * Builds the compact `epd → [eco, name]` index from the lichess-org/chess-openings TSV files.
 * Every line is replayed with chess.js (illegal PGN throws). When several rows reach the same
 * EPD, the shortest line wins; ties keep input order.
 */
export function buildOpeningIndex(tsvFiles: readonly string[]): {
  index: OpeningIndexJson;
  rows: number;
} {
  const best = new Map<string, { eco: string; name: string; ply: number }>();
  let rows = 0;
  for (const [f, content] of tsvFiles.entries()) {
    const lines = content.split('\n').filter(Boolean);
    const header = lines.shift();
    if (header !== 'eco\tname\tpgn') throw new Error(`file ${f}: unexpected header "${header}"`);
    for (const [i, line] of lines.entries()) {
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) throw new Error(`file ${f}, row ${i + 2}: malformed`);
      const chess = new Chess();
      chess.loadPgn(pgn);
      const epd = toEpd(chess.fen());
      const ply = chess.history().length;
      rows++;
      const prev = best.get(epd);
      if (!prev || ply < prev.ply) best.set(epd, { eco, name, ply });
    }
  }
  const sorted = [...best.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const index: OpeningIndexJson = {};
  for (const [epd, { eco, name }] of sorted) index[epd] = [eco, name];
  return { index, rows };
}
