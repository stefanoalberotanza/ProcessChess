import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // sqlite-wasm locates sqlite3.wasm via import.meta.url: keep it out of the dep pre-bundle.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // dev: the OPFS worker lives in packages/db, outside this app's folder
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
});
