import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { epdHash } from './hash';
import type { OpeningGraphJson, OpeningIndexJson } from './types';

/**
 * Builds the generated opening data from the lichess-org/chess-openings TSV files, replaying
 * every line with chess.js (illegal PGN throws):
 * - `index`: compact `epd → [eco, name]`; when several rows reach the same EPD the shortest
 *   line wins, ties keep input order;
 * - `graph`: every position on every line (transpositions merged) with its book moves and the
 *   number of dataset lines through each move. Nodes are keyed by `epdHash`; node 0 is the
 *   initial position.
 */
export function buildOpeningData(tsvFiles: readonly string[]): {
  index: OpeningIndexJson;
  graph: OpeningGraphJson;
  rows: number;
} {
  const best = new Map<string, { eco: string; name: string; ply: number }>();
  const nodeIds = new Map<string, number>(); // epd → node
  const hashes: string[] = [];
  const edges: Map<string, { child: number; lines: number }>[] = [];
  const node = (epd: string): number => {
    let id = nodeIds.get(epd);
    if (id === undefined) {
      id = hashes.length;
      nodeIds.set(epd, id);
      hashes.push(epdHash(epd));
      edges.push(new Map());
    }
    return id;
  };
  node(toEpd(new Chess().fen()));

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
      const history = chess.history({ verbose: true });
      for (const m of history) {
        const from = node(toEpd(m.before));
        const to = node(toEpd(m.after));
        const e = edges[from]!.get(m.lan);
        if (e) e.lines++;
        else edges[from]!.set(m.lan, { child: to, lines: 1 });
      }
      const epd = toEpd(chess.fen());
      rows++;
      const prev = best.get(epd);
      if (!prev || history.length < prev.ply) best.set(epd, { eco, name, ply: history.length });
    }
  }

  if (new Set(hashes).size !== hashes.length) throw new Error('epdHash collision: widen the hash');

  const sorted = [...best.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const index: OpeningIndexJson = {};
  for (const [epd, { eco, name }] of sorted) index[epd] = [eco, name];

  const graph: OpeningGraphJson = {
    nodes: hashes.map((h, id) => [
      h,
      [...edges[id]!.entries()]
        .sort(([ua, a], [ub, b]) => b.lines - a.lines || (ua < ub ? -1 : 1))
        .map(([uci, e]) => `${uci},${e.child.toString(36)},${e.lines.toString(36)}`)
        .join(' '),
    ]),
  };
  return { index, graph, rows };
}

/** Only the `epd → [eco, name]` index (see `buildOpeningData`). */
export function buildOpeningIndex(tsvFiles: readonly string[]): {
  index: OpeningIndexJson;
  rows: number;
} {
  const { index, rows } = buildOpeningData(tsvFiles);
  return { index, rows };
}
