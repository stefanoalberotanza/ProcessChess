# Practice lines stop at the next name; subfamilies are containers — design

Date: 2026-10-12

## Problem

`openingLine(graph, prefix)` extends every name to at least `LAB_PLIES` (8) plies along the most
played moves. A short name therefore practises the line of one of its descendants: "Caro-Kann
Defense" (`1. e4 c6`) becomes the line of its most popular variation, and finishing it ticks
both, since lab history is keyed by the line. The same happens one level down
("Caro-Kann Defense: Advance Variation", `… 3. e5`, runs into its sub-variations).

## Decisions

1. **Subfamilies are containers**, like families. "Family" and "subfamily" stay as labels in the
   name tree (ADR 012), but only `variation` nodes are practised. A subfamily has no practice
   button, no `Mastery` dots, is never in the daily mix, and its progress is the roll-up of its
   variations.
2. **A practice line stops at the next name.** It starts with the moves of the name and extends
   along the most played book move while the next position is unnamed or carries the **same**
   dataset name; it stops before the first position with a different name. Safety cap: 16 plies.
   Consequence: two different names never share a practice line.

## Core

### `practiceLine(graph: OpeningGraph, ucis: readonly string[]): string[]` — `packages/core/src/lab/lab.ts`

- `own` = the dataset name of the deepest named node along `ucis` (via `nodeNames(graph)`,
  `packages/core/src/openings/continuations.ts`); `undefined` when none.
- From the node at `ucis`, repeatedly take the first (most played) child edge; stop when there
  is none, when the child is named and its name ≠ `own`, or at 16 plies total. Unnamed children
  and children named `own` are appended.
- `ucis` off book → returned unchanged.
- Needs `loadOpenings()` (through `nodeNames`).
- `openingLine` stays exported for its other callers outside the lab, if any; every lab and
  Explore use switches to `practiceLine` (Explore items, `DailyMix` `lineOf`, `rollupOf`,
  continuations items, search items, `popularOpenings`/`practiceByName` if they build lab
  queues).

### Name tree consumers

- `rollupMastery` counts `variation` nodes only (today: every non-family node).
- `dailyMix` candidates are `variation` nodes only (today: every non-family node); the
  no-history fallback draws from the most popular variations.

## Web

- `ExplorePanel`: rows and the focus card of `subfamily` nodes behave like families — no ▶,
  no `Mastery`, no "Practise this opening"; they show `MasteryRollup`. Variation rows unchanged.
- Search results, "Continues into" rows: an entry whose name is a subfamily (decided with
  `names.nodeForName(name)?.kind`) gets no ▶ and no `Mastery`; a click still moves the board.
- `DailyMix`: stored picks whose node is not a `variation` are ignored (the mix is rebuilt).

## History

Lab runs are append-only and keyed by line. Lines that change (names previously extended into
another name) no longer match their old runs; the runs stay in the database and simply stop
counting. Lines that do not change keep their history. No migration.

## Docs

ADR 011 (opening lab) addendum: practice lines stop at the next name; subfamilies are
containers.

## Testing

- Vitest (`lab.test.ts` / new `practice-line.test.ts`, names copied from `data/openings/b.tsv`):
  - `practiceLine` for "Caro-Kann Defense: Advance Variation" (`e2e4 c7c6 d2d4 d7d5 e4e5`) never
    reaches a position named "Caro-Kann Defense: Advance Variation, …";
  - for every named node of the dataset reachable in the graph, practice lines of different
    names differ (uniqueness over the whole dataset);
  - a name whose next position is named differently returns exactly its moves;
  - off-book input returned unchanged; 16-ply cap.
- Vitest: `rollupMastery` and `dailyMix` ignore `subfamily` nodes.
- Playwright:
  - the Caro-Kann Defense focus card has no "Practise this opening" button and shows the
    roll-up;
  - practising a Caro-Kann variation to the end does not mark another Caro-Kann name done in
    the by-name list.
- Full gate as usual (three known CRLF failures on this checkout).
