// Minimal static server for the production output in build/ (what gets deployed), used by
// the Playwright tests. `/drill` → drill.html as on any static host.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '../build');
const port = Number(process.argv[2] ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [clean, `${clean}.html`, join(clean, 'index.html')];
  for (const c of candidates) {
    const file = join(root, c);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(new URL(req.url ?? '/', 'http://x').pathname);
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
