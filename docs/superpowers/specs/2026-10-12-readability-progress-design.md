# Readability and progress roll-up — design

Date: 2026-10-12

## Goal

Make opening names easier to read across the app and show learning progress above the
single-line level. Out of scope: the reported label/board overlap (deferred until reproduced
with a screenshot) and FSRS-card-based progress (possible follow-up).

## 1. Remove ECO codes from the UI

- Remove every `.eco` span, its CSS, and ECO text inside labels, titles and aria-labels in
  `OpeningBar.svelte`, `ExplorePanel.svelte`, `GraphPanel.svelte`, `LabPanel.svelte`.
- `eco` stays in `@processchess/core` data and types; no dataset or generated-file change.
- Labels that read `"${eco} ${name}"` become `name`.

## 2. Readability

- The opening name is the primary text of a row: normal text colour (not `--muted`),
  one step larger than today's label size.
- Long names are truncated with an ellipsis (`text-overflow: ellipsis`, single line);
  the full name is in `title`.
- No new strings; existing `t()` keys are reused.

## 3. Progress roll-up

### Core (`packages/core/src/lab/`)

`rollupMastery(tree, key, streakOf, masteredStreak)` in `names.ts` — pure, tests first.

- Input: the name tree, a node key, `streakOf(node) => number | undefined` (clean streak of the
  node's line, `undefined` when never run), and the threshold (web passes `MASTERED_STREAK`).
- Counts the node and all descendants except `family` nodes (families have no line of their own).
- Output: `{ total, mastered, started }` where `mastered` counts lines with
  `cleanStreak >= masteredStreak` and `started` counts lines with any summary.
- Tests: empty input, all new, mixed, all mastered, threshold boundary.

### Web

- New `MasteryRollup.svelte`: renders `mastered/total` plus a thin bar
  (mastered = green, started-not-mastered = amber, rest = grey); aria-label via a new `t()` key
  `lab.rollup` ("{mastered} of {total} lines mastered") in `en.ts` and `it.ts`.
- Shown on family and subfamily rows of the name tree and on the focus header in `ExplorePanel`
  (the only place the name tree lives; `LabPanel` is a single running line and `RepertoirePanel`
  has no lab summaries, so neither gets a roll-up). Line rows keep the existing `Mastery` dots.
- Data comes from the summaries the panels already load; no new DB queries.

## Testing

- Vitest: `rollupMastery` unit tests in core.
- Playwright: update e2e assertions that expect ECO text; add one check that a family row
  shows a `MasteryRollup` with the correct counts after a completed lab run.
- Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
