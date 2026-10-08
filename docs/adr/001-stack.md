# ADR 001 — Technology stack

- Status: accepted
- Date: 2026-10-08

## Context

ProcessChess must run on the web (PWA), desktop and mobile with a single UI, work offline, and
stay easy to contribute to. Chess rules must be correct by construction.

## Decision

- **Monorepo with pnpm workspaces**: `packages/core`, `packages/db`, `apps/web`, later
  `apps/native`. Shared `tsconfig.base.json` (strict), ESLint flat config, Prettier, Vitest.
- **TypeScript everywhere.** Internal packages export their `.ts` sources; Vite/Vitest/tsx
  compile them, so there is no per-package build.
- **`@processchess/core`**: pure logic (rules, PGN/FEN, opening recognition; later drills and
  scheduling). Uses **chess.js** (BSD-2-Clause) as the single source of truth for move legality,
  SAN/UCI and FEN.
- **`@processchess/db`**: Drizzle ORM schema on SQLite and a `Storage` interface with
  swappable adapters (ADR 002).
- **`@processchess/web`**: SvelteKit (Svelte 5 runes) with `adapter-static`, `ssr = false`,
  `prerender = true`: a static client-side bundle that can be served as a PWA and embedded by
  Tauri unchanged.
- **Board**: chessground, isolated in `Board.svelte` behind a library-agnostic props API
  (FEN, side to move, legal destinations, `onmove`). Replacing it with cm-chessboard touches
  one file (ADR 005).
- **Native**: Tauri 2 in a later phase, reusing the web build.
- Tooling versions are pinned to the latest mature majors (TypeScript 5.9, ESLint 9,
  Vitest 3, Vite 7, SvelteKit 2) rather than freshly released majors.

## Consequences

- One codebase and one UI for every platform.
- Platform differences are confined to storage adapters (and later, Tauri plugins).
- chess.js performance (move generation on every `move()`) is adequate for interactive use;
  bulk work (dataset generation) should pass move objects, not SAN strings.
