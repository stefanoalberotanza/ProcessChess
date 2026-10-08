# AGENTS.md — ProcessChess

Context for humans and coding agents working in this repository.

## Vision

ProcessChess trains chess **sequences** by playing them repeatedly. Every user move is a
spaced-repetition card (FSRS) and every attempt is logged. Openings come first; famous games,
famous mates, patterns and endgames follow. One shared frontend runs as a web PWA and, through
Tauri 2, as a desktop and mobile app. **Local-first**: everything works offline, data lives in a
local SQLite database.

## Stack

| Area          | Choice                                                                |
| ------------- | --------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces, TypeScript strict, Vitest, ESLint + Prettier         |
| Chess logic   | chess.js (BSD-2) — the only source of truth for rules, SAN/UCI, FEN   |
| Storage       | SQLite everywhere + Drizzle ORM (`sqlite-proxy` driver), ULID keys    |
| Spaced rep.   | ts-fsrs (from M1)                                                     |
| UI            | SvelteKit (Svelte 5) with `adapter-static`, client-side only          |
| Board         | chessground (GPL) wrapped **only** in `apps/web/src/lib/Board.svelte` |
| Native        | Tauri 2 (`apps/native`, later phase)                                  |
| Opening names | lichess-org/chess-openings (CC0) in `data/openings/`                  |

Design decisions are recorded in [`docs/adr/`](docs/adr).

## Layout

```
apps/web/                 SvelteKit app (@processchess/web)
  src/lib/Board.svelte    the only chessground import
  src/routes/+page.svelte M0 test page: free play + opening bar
packages/core/            @processchess/core — pure logic, no UI, no I/O
  src/fen.ts              toEpd()
  src/openings/           resolveOpening(), generated openings.json
packages/db/              @processchess/db — Drizzle schema, migrations, Storage
  src/schema.ts           tables
  drizzle/                generated migrations (drizzle-kit)
  src/sqlite-storage.ts   Storage implementation shared by all adapters
  src/adapters/           memory (tests, node:sqlite), opfs + tauri (TODO)
data/openings/            upstream TSV files (CC0)
scripts/build-openings.ts TSV → packages/core/src/openings/openings.json
docs/adr/                 architecture decision records
```

## Commands

```sh
pnpm install
pnpm lint            # eslint + prettier --check
pnpm format          # prettier --write
pnpm typecheck       # tsc / svelte-check in every package
pnpm test            # vitest in every package
pnpm build           # builds apps/web (static site in apps/web/build)
pnpm build:openings  # regenerate openings.json from data/openings/*.tsv
pnpm --filter @processchess/db db:generate --name <change>  # new migration after schema edits
pnpm --filter @processchess/web dev
```

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit/push; CI runs
the same.

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess` on). ESM everywhere. `import type` for types.
- Small, descriptive commits (`feat(core): …`, `test(db): …`, `docs: …`).
- Packages export TypeScript sources directly (`exports: ./src/index.ts`); no build step for
  internal packages.
- Positions are identified by **EPD** = first four FEN fields, always produced by `toEpd()`
  from a chess.js FEN (en passant square only when a capture is legal).
- Moves are stored as UCI; SAN is derived with chess.js.
- IDs are ULIDs; timestamps are Unix milliseconds.
- `attempt` is append-only: never update or delete rows.
- Code, comments, docs and UI strings in English.

## Rules

1. **Tests first in `packages/core`**: write or extend the failing test, then the code.
2. **No new dependencies without asking.** Allowed today: chess.js, chessground (Board.svelte
   only), drizzle-orm, drizzle-kit, ts-fsrs, ulid, vitest, SvelteKit and its tooling
   (svelte, vite, svelte-check, adapters), ESLint/Prettier and their plugins, tsx.
3. **No GPL dependency outside `Board.svelte`.** ESLint enforces this for chessground
   (`no-restricted-imports`). Keep `packages/*` free of GPL code so they can be relicensed
   (see ADR 005).
4. **Chess correctness is verified only with chess.js and the dataset**, never by eye or from
   memory. Test expectations for opening names are copied from `data/openings/*.tsv`.
5. `packages/core` stays pure: no DOM, no storage, no network.
6. Do not hand-edit generated files (`openings.json`, `packages/db/drizzle/*`); regenerate them.
