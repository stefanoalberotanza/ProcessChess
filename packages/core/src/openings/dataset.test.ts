import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOpeningIndex } from './build';
import committed from './openings.json';
import { splitOpeningName } from './resolve';

const dataDir = join(import.meta.dirname, '../../../../data/openings');
const tsv = ['a', 'b', 'c', 'd', 'e'].map((v) => readFileSync(join(dataDir, `${v}.tsv`), 'utf8'));

describe('openings dataset', () => {
  it('openings.json is up to date with data/openings/*.tsv (run pnpm build:openings)', () => {
    const { index, rows } = buildOpeningIndex(tsv);
    expect(rows).toBe(3865);
    expect(index).toEqual(committed);
  }, 60_000);

  it('keeps the shortest line when two rows reach the same EPD', () => {
    const header = 'eco\tname\tpgn';
    const { index } = buildOpeningIndex([
      `${header}\nB01\tLong Name\t1. e4 d5 2. Nf3 Nf6 3. Ng1 Ng8\nA00\tShort Name\t1. e4 d5\n`,
    ]);
    expect(Object.values(index)).toEqual([['A00', 'Short Name']]);
  });

  it('rejects illegal PGN in the source', () => {
    expect(() => buildOpeningIndex(['eco\tname\tpgn\nA00\tBad\t1. e5\n'])).toThrow();
  });
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
