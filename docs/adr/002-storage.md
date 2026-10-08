# ADR 002 — Storage

- Status: accepted (updated for M1)
- Date: 2026-10-08

## Context

The app is local-first: progress and history must be stored on the device and work offline,
on the web and in Tauri. We want one schema, one query layer and real SQL everywhere.

## Decision

- **SQLite on every platform**:
  - web: official SQLite WASM in a Web Worker with the **OPFS** VFS;
  - native: **tauri-plugin-sql** (SQLite file in the app data directory);
  - tests: in-memory SQLite via Node's built-in `node:sqlite` (no native addon to install).
- **Drizzle ORM** defines the schema (`packages/db/src/schema.ts`); **drizzle-kit** generates
  SQL migrations into `packages/db/drizzle/`.
- All adapters use Drizzle's **`sqlite-proxy`** driver: an adapter only supplies an async
  `SqlExecutor` — `(sql, params, method) → rows`. The `Storage` implementation
  (`SqliteStorage`) is written once and shared.
- **Web adapter (M1)**: `@sqlite.org/sqlite-wasm` (Apache-2.0, pinned to `3.53.4-build1`) in a
  dedicated Web Worker with the **`opfs-sahpool`** VFS, which works without COOP/COEP headers.
  The page talks to it with a small `postMessage` protocol (`open`, `exec`).
- **Fallback**: if the pool cannot be installed (no OPFS, private mode, or another tab already
  holds the pool — the VFS is exclusive), the worker opens an in-memory database and the app
  shows a visible banner: "data will not be saved".
- **Migrations are bundled**: `scripts/build-migrations.ts` turns the drizzle-kit output into
  `packages/db/src/migrations.generated.ts` (run by `db:generate`); `runMigrations(exec)` applies
  pending ones through the executor, each in a transaction, and records them in a
  `__migrations(tag, applied_at)` table. Tests on `node:sqlite` use the same migrator, and a test
  fails if the generated module is out of date.
- **Archiving instead of deleting (M1)**: `collection.archived_at`; archived collections are
  hidden by default and can be restored. Collections are never deleted. Tree edits may delete
  nodes only when none of them has attempts (`deleteSubtree` refuses otherwise).
- **`line_pass` (M1)** is a second append-only log: one row per completed pass through a line
  (`line_id` = leaf node id, `clean`, `diverged`), from which line cleanliness is derived
  (ADR 006). `line_id` is not a foreign key because lines are derived from the tree.
- **`attempt` is an append-only log**: one row per move played in a drill (result
  `correct | hint | wrong`, played UCI, hints used, time). Rows are never updated or deleted.
  Cards and `daily_stat` are derived state and can be rebuilt from the log.
- **IDs are ULIDs** (`ulid` package): generated offline without coordination, sortable by
  creation time, safe for future sync/merge between devices.
- Timestamps are Unix milliseconds (`integer` columns, `timestamp_ms` mode).
- Positions are indexed by **EPD** (`node.epd`) to find transpositions across collections.

## Consequences

- The same SQL runs in tests and in production; adapter bugs are limited to transport.
- SQLite on the web costs ~870 kB of wasm (400 kB gzipped), precached by the service worker.
- Only one tab can use the persistent database at a time; other tabs fall back to memory
  (with the banner). A cross-tab lock/hand-over is future work.
- Vite also emits two sqlite-wasm helper workers we do not use (~245 kB); harmless, precached.
- `node:sqlite` is still flagged experimental in Node 22 and prints a warning in tests;
  Node ≥ 22.13 is required.
- Foreign keys from `attempt` to `node`/`session` are not cascading: the history can never be
  deleted by accident.
