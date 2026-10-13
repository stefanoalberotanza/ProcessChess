// TODO(native phase): Tauri 2 adapter. Use tauri-plugin-sql (`@tauri-apps/plugin-sql`)
// with a SQLite file in the app data dir; map `select` to 'all'/'get'/'values' and
// `execute` to 'run' inside a `drizzle-orm/sqlite-proxy` callback, then reuse
// `SqliteStorage`; `runMigrations` applies the bundled migrations through the same executor.
export {};
