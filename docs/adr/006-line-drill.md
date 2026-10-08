# ADR 006 — Line drill

- Status: accepted
- Date: 2026-10-08

## Context

M1 trains a repertoire line by line, before any scheduling (FSRS is M2). The engine must be
UI-independent and fully tested in `@processchess/core`.

## Decision

- **Line** = path from the root to a leaf, identified by the **leaf node id**. Lines follow every
  opponent branch and only the main user move (`ord = 0`). Order: depth-first in `ord` order.
- **API**: `startLineDrill({ tree, passes }, options)` → state; `submitMove(state, uci)` →
  `{ state, outcome, attempt?, pass?, opponentMove? }`; plus `requestHint`, `repeatLine`,
  `nextLine`, `drillProgress`, `lineStatus`. States are immutable values.
- **Outcomes**: `correct` (the planned move), `alternative` (a sibling user move: accepted, the
  drill continues in its subtree; the opponent then plays its main reply), `wrong` (anything
  else). Opponent replies are applied automatically.
- **After a wrong move** the right move is revealed (`state.reveal`) and must be replayed.
- **Hints** are graduated: 1 piece type, 2 origin square, 3 full move.
- **Recording**: one `session` row per drill page visit; one `attempt` per user node per pass:
  `correct` = first try without hints, `hint` = hints used and no wrong move, `wrong` = at least
  one wrong move. `played_uci` = the first wrong move, or the move played when there was none.
  `time_ms` = from the moment the position is shown to the accepted move (clock injectable).
  One `line_pass` per completed pass.
- **Clean lines**: a line is clean after N consecutive clean passes (N = 3, configurable).
  A pass with any wrong move or hint resets the streak; a clean pass that **diverged** through an
  alternative leaves it unchanged (the planned line was not fully played). Lines not yet clean
  come first, then the clean ones, in tree order; optional shuffle within each group through an
  injected `rng`.
- An unfinished pass (repeat/leave mid-line) records no `line_pass`; its attempts stay logged.

## Consequences

- Line identity is tied to the leaf: extending a line creates a new leaf, so its streak starts
  again. Acceptable until FSRS (per-move cards) replaces streaks for scheduling.
- Cleanliness is derived from the append-only `line_pass` log, never stored as mutable state.
