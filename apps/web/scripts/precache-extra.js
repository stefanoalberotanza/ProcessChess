// SvelteKit's `$service-worker` `build` list does not include Vite worker bundles and their
// assets (the SQLite worker and sqlite3.wasm). List them in build/precache-extra.json, which the
// service worker precaches at install time.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const buildDir = join(import.meta.dirname, '../build');
const workersDir = join(buildDir, '_app/immutable/workers');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(workersDir).map((p) => '/' + relative(buildDir, p).split('\\').join('/'));
writeFileSync(join(buildDir, 'precache-extra.json'), JSON.stringify(files, null, 2) + '\n');
console.log(`precache-extra.json: ${files.length} worker files`);
