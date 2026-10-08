/**
 * Builds packages/core/src/openings/openings.json from data/openings/{a..e}.tsv
 * (lichess-org/chess-openings, CC0). Run with `pnpm build:openings`.
 *
 * For each row the PGN is replayed with chess.js to obtain UCI moves and the EPD
 * of the final position. When several rows reach the same EPD (transpositions),
 * the one with the shortest line wins; ties keep file order (a.tsv first).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { toEpd } from '../packages/core/src/fen.ts';
import type { OpeningEntry } from '../packages/core/src/openings/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['a', 'b', 'c', 'd', 'e'].map((v) => join(root, 'data/openings', `${v}.tsv`));
const out = join(root, 'packages/core/src/openings/openings.json');

const rows: OpeningEntry[] = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const header = lines.shift();
  if (header !== 'eco\tname\tpgn') throw new Error(`${file}: unexpected header "${header}"`);
  for (const [i, line] of lines.entries()) {
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) throw new Error(`${file}:${i + 2}: malformed row`);
    const chess = new Chess();
    chess.loadPgn(pgn); // throws on illegal moves
    const uci = chess.history({ verbose: true }).map((m) => m.lan);
    rows.push({ eco, name, uci: uci.join(' '), epd: toEpd(chess.fen()), ply: uci.length });
  }
}

const byEpd = new Map<string, OpeningEntry>();
let conflicts = 0;
for (const row of rows) {
  const prev = byEpd.get(row.epd);
  if (!prev) {
    byEpd.set(row.epd, row);
    continue;
  }
  if (prev.name !== row.name || prev.eco !== row.eco) {
    conflicts++;
    console.warn(
      `same EPD, different label: "${prev.eco} ${prev.name}" vs "${row.eco} ${row.name}"`,
    );
  }
  if (row.ply < prev.ply) byEpd.set(row.epd, row);
}

const entries = [...byEpd.values()].sort(
  (a, b) => a.eco.localeCompare(b.eco) || a.ply - b.ply || a.uci.localeCompare(b.uci),
);
writeFileSync(out, JSON.stringify(entries) + '\n');
console.log(
  `${rows.length} rows -> ${entries.length} unique positions (${conflicts} label conflicts) -> ${out}`,
);
