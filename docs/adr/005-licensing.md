# ADR 005 — Licensing

- Status: accepted (to revisit — see "Open decision")
- Date: 2026-10-08

## Context

We would like a permissive license (MIT) to maximise reuse, but the best board UI available,
**chessground**, is GPL-3.0-or-later. Linking it into the app makes the distributed app GPL.
Other dependencies are permissive: chess.js (BSD-2-Clause), Drizzle (Apache-2.0), SvelteKit
(MIT), ts-fsrs (MIT), ulid (MIT), `@sqlite.org/sqlite-wasm` (Apache-2.0; SQLite itself is
public domain), `@playwright/test` (Apache-2.0, dev only). Opening data is CC0.

## Decision

- **Today the project is GPL-3.0-or-later**, solely because of chessground.
- Keep the door to MIT open:
  1. chessground is imported **only** in `apps/web/src/lib/Board.svelte` (enforced by ESLint
     `no-restricted-imports`).
  2. `Board.svelte` exposes library-agnostic props; cm-chessboard (MIT) is the planned
     replacement and must fit the same props.
  3. No other GPL/AGPL/LGPL dependency anywhere; `packages/*` must stay free of copyleft code.
  4. Third-party data keeps its own license (`data/openings/` is CC0).

## Open decision

**Before accepting the first external contribution**, decide between:

- staying GPL-3.0-or-later; or
- switching to MIT (replace chessground with cm-chessboard, relicense).

Relicensing later requires the consent of every contributor, or a CLA/DCO-plus-relicensing
clause in place before contributions arrive. Until the decision is taken, external PRs should
not be merged.
