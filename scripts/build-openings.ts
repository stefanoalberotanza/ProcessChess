/**
 * Regenerates packages/core/src/openings/openings.json (compact `epd → [eco, name]` map) from
 * data/openings/{a..e}.tsv (lichess-org/chess-openings, CC0). Run with `pnpm build:openings`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpeningIndex } from '../packages/core/src/openings/build.ts';

const root = join(import.meta.dirname, '..');
const tsv = ['a', 'b', 'c', 'd', 'e'].map((v) =>
  readFileSync(join(root, 'data/openings', `${v}.tsv`), 'utf8'),
);
const out = join(root, 'packages/core/src/openings/openings.json');

const { index, rows } = buildOpeningIndex(tsv);
writeFileSync(out, JSON.stringify(index) + '\n');
console.log(`${rows} rows -> ${Object.keys(index).length} positions -> ${out}`);
