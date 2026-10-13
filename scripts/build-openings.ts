/**
 * Regenerates, from data/openings/{a..e}.tsv (lichess-org/chess-openings, CC0):
 * - packages/core/src/openings/openings.json      compact `epd → [eco, name]` map
 * - packages/core/src/openings/opening-graph.json every position of every line, with book moves
 * Run with `pnpm build:openings`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpeningData } from '../packages/core/src/openings/build.ts';

const root = join(import.meta.dirname, '..');
const tsv = ['a', 'b', 'c', 'd', 'e'].map((v) =>
  readFileSync(join(root, 'data/openings', `${v}.tsv`), 'utf8'),
);
const dir = join(root, 'packages/core/src/openings');

const { index, graph, rows } = buildOpeningData(tsv);
writeFileSync(join(dir, 'openings.json'), JSON.stringify(index) + '\n');
writeFileSync(join(dir, 'opening-graph.json'), JSON.stringify(graph) + '\n');
console.log(
  `${rows} rows -> ${Object.keys(index).length} named positions, ${graph.nodes.length} graph nodes`,
);
