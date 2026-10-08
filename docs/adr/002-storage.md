# ADR 002 — Storage

- Status: accepted
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
  `(sql, params, method) → rows` transport and a migration runner. The `Storage`
  implementation (`SqliteStorage`) is written once and shared.
- **`attempt` is an append-only log**: one row per move played in a drill (result
  `correct | hint | wrong`, played UCI, hints used, time). Rows are never updated or deleted.
  Cards and `daily_stat` are derived state and can be rebuilt from the log.
- **IDs are ULIDs** (`ulid` package): generated offline without coordination, sortable by
  creation time, safe for future sync/merge between devices.
- Timestamps are Unix milliseconds (`integer` columns, `timestamp_ms` mode).
- Positions are indexed by **EPD** (`node.epd`) to find transpositions across collections.

## Consequences

- The same SQL runs in tests and in production; adapter bugs are limited to transport.
- The web adapter needs `@sqlite.org/sqlite-wasm` (dependency approval pending, M1) and
  bundled migrations (no filesystem in the browser).
- `node:sqlite` is still flagged experimental in Node 22 and prints a warning in tests;
  Node ≥ 22.13 is required.
- Foreign keys from `attempt` to `node`/`session` are not cascading: deleting a collection that
  has attempts fails on purpose. A policy for archiving collections is open (M1).
