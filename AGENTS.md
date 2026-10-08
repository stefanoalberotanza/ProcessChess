# AGENTS.md — ProcessChess

Context for humans and coding agents working in this repository.

## Vision

ProcessChess trains chess **sequences** by playing them repeatedly. Every user move is a
spaced-repetition card (FSRS) and every attempt is logged. Openings come first; famous games,
famous mates, patterns and endgames follow. One shared frontend runs as a web PWA and, through
Tauri 2, as a desktop and mobile app. **Local-first**: everything works offline, data lives in a
local SQLite database.

## Stack

| Area          | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces, TypeScript strict, Vitest, ESLint + Prettier          |
| Chess logic   | chess.js (BSD-2) — the only source of truth for rules, SAN/UCI, FEN    |
| Storage       | SQLite + Drizzle (`sqlite-proxy`); web: sqlite-wasm + OPFS in a worker |
| Spaced rep.   | ts-fsrs (from M2)                                                      |
| UI            | SvelteKit (Svelte 5) with `adapter-static`, client-side only           |
| Board         | chessground (GPL) wrapped **only** in `apps/web/src/lib/Board.svelte`  |
| Native        | Tauri 2 (`apps/native`, later phase)                                   |
| Opening names | lichess-org/chess-openings (CC0) in `data/openings/`                   |
| i18n / PWA    | typed `it`/`en` dictionaries, SvelteKit service worker                 |
| E2E           | Playwright (Chromium) against the static build                         |

Design decisions are recorded in [`docs/adr/`](docs/adr).

## Layout

```
apps/web/                     SvelteKit app (@processchess/web)
  src/lib/Board.svelte        the only chessground import (promotion picker, arrows)
  src/lib/app.svelte.ts       bootstrap: OPFS storage, migrations, openings dataset
  src/lib/i18n/               en.ts (keys), it.ts, t()
  src/lib/components/         OpeningBar, MoveTree, MoveHistory, ImportForm
  src/routes/                 / (collections + import), /collection?id=, /drill?id=
  src/service-worker.ts       offline precache
  e2e/                        Playwright tests; scripts/serve-build.js serves build/
packages/core/                @processchess/core — pure logic, no UI, no I/O
  src/openings/               resolveOpening(), loadOpenings(), generated openings.json
  src/tree/                   move tree: addLine, setMainLine, setComment, deleteSubtree, layout
  src/pgn/                    parsePgn, importPgn/treeFromPgn, exportPgn
  src/drill/                  line drill engine
  src/position.ts             legal moves, SAN↔UCI for the UI
  test/fixtures/              PGN fixtures
packages/db/                  @processchess/db — Drizzle schema, migrations, Storage
  src/schema.ts               tables
  drizzle/                    generated migrations (drizzle-kit)
  src/migrations.generated.ts generated bundle of drizzle/ (do not edit)
  src/migrator.ts             runMigrations(exec) with __migrations
  src/sqlite-storage.ts       Storage implementation shared by all adapters
  src/adapters/               memory (node:sqlite), opfs (+ worker), tauri (TODO)
data/openings/                upstream TSV files (CC0)
scripts/                      build-openings.ts, build-migrations.ts
docs/adr/                     architecture decision records
```

## Commands

```sh
pnpm install
pnpm lint            # eslint + prettier --check
pnpm format          # prettier --write
pnpm typecheck       # tsc / svelte-check in every package
pnpm test            # vitest in every package
pnpm build           # builds apps/web (static site in apps/web/build)
pnpm test:e2e        # Playwright against apps/web/build (run pnpm build first)
pnpm build:openings  # regenerate openings.json from data/openings/*.tsv
pnpm --filter @processchess/db db:generate --name <change>  # migration + migrations.generated.ts
pnpm --filter @processchess/web dev
```

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` before every
push; CI runs the same. Locally Playwright uses the Chromium in `PLAYWRIGHT_BROWSERS_PATH` or
`pnpm --filter @processchess/web exec playwright install chromium`.

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess` on). ESM everywhere. `import type` for types.
- Small, descriptive commits (`feat(core): …`, `test(db): …`, `docs: …`).
- Packages export TypeScript sources directly (`exports: ./src/index.ts`); no build step for
  internal packages.
- Positions are identified by **EPD** = first four FEN fields, always produced by `toEpd()`
  from a chess.js FEN (en passant square only when a capture is legal).
- Moves are stored as UCI; SAN is derived with chess.js.
- IDs are ULIDs; timestamps are Unix milliseconds.
- `attempt` and `line_pass` are append-only: never update or delete rows.
- Collections are archived, never deleted.
- Every UI string goes through `t()`; add keys to `en.ts` and `it.ts` together.
- Code, comments, docs and UI strings in English.

## Rules

1. **Tests first in `packages/core`**: write or extend the failing test, then the code.
2. **No new dependencies without asking.** Allowed today: chess.js, chessground (Board.svelte
   only), drizzle-orm, drizzle-kit, ts-fsrs, ulid, @sqlite.org/sqlite-wasm, vitest,
   @playwright/test, SvelteKit and its tooling (svelte, vite, svelte-check, adapters),
   ESLint/Prettier and their plugins, tsx.
3. **No GPL dependency outside `Board.svelte`.** ESLint enforces this for chessground
   (`no-restricted-imports`). Keep `packages/*` free of GPL code so they can be relicensed
   (see ADR 005).
4. **Chess correctness is verified only with chess.js and the dataset**, never by eye or from
   memory. Test expectations for opening names are copied from `data/openings/*.tsv`.
5. `packages/core` stays pure: no DOM, no storage, no network.
6. The UI calls only `@processchess/core` and `@processchess/db` (no chess.js in apps/web);
   logic goes in core with unit tests.
7. Do not hand-edit generated files (`openings.json`, `packages/db/drizzle/*`,
   `migrations.generated.ts`); regenerate them.
