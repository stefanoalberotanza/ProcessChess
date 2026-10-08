// TODO(M1): web adapter. Run the official SQLite WASM build in a Web Worker with the
// OPFS VFS (opfs-sahpool), expose an async exec(sql, params, method) over postMessage and
// plug it into `drizzle-orm/sqlite-proxy` + `SqliteStorage`, exactly like ./memory.ts.
// Migrations must be bundled (import the .sql files with ?raw) since there is no fs.
// Adding @sqlite.org/sqlite-wasm requires approval (AGENTS.md: no new dependencies).
export {};
