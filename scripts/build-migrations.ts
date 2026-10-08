/**
 * Bundles the drizzle-kit SQL migrations into packages/db/src/migrations.generated.ts so they can
 * be applied where there is no filesystem (browser, Tauri). Run by `pnpm --filter
 * @processchess/db db:generate` after drizzle-kit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleMigrations } from '../packages/db/src/migrations-bundle.ts';

const dir = join(import.meta.dirname, '../packages/db/drizzle');
const out = join(import.meta.dirname, '../packages/db/src/migrations.generated.ts');
const source = bundleMigrations((file) => readFileSync(join(dir, file), 'utf8'));
writeFileSync(out, source);
console.log(`wrote ${out}`);
