# "Continues into": openings reachable from the board position — design

Date: 2026-10-12

## Problem

The Explore "by name" list is built from the name hierarchy (ADR 011/012). At
"King's Knight Opening: Normal Variation" it says "No other variations", although Ruy Lopez,
Italian Game and Scotch Game are played from that exact position: they are other name
families, so they only appear in the "by move" list. Users read this as a contradiction.

## Decision

Keep the by-name list as it is and add, below it, a **"Continues into"** section built from the
opening graph (positions keyed by EPD, transpositions already merged). No new dataset copy and
no change to any generated file.

## Core — `packages/core/src/openings/continuations.ts` (tests first)

### `nodeNames(graph: OpeningGraph): ReadonlyMap<number, { eco: string; name: string }>`

Graph node → dataset name, built once per graph (cached in a `WeakMap`) from `openingIndex()`
via `graph.nodeOf(epd)`, as `searchOpenings` already does. Throws `OpeningsNotLoadedError` when
the openings are not loaded.

### `continuationsFrom(graph: OpeningGraph, ucis: readonly string[]): Continuation[]`

```ts
export interface Continuation {
  /** Full dataset name of the first position of the new family ("Ruy Lopez"). */
  name: string;
  /** Family part (splitOpeningName). */
  family: string;
  /** Moves from the initial position to that position (ucis + the walk). */
  ucis: string[];
  /** Moves from the current position (the walk only), for the row's move label. */
  via: string[];
}
```

Rules:

- The start node is the graph node reached by `ucis` from the root (following edges by UCI).
  Unknown position (off book) → `[]`.
- The **current family** is the family of the deepest named node along `ucis`, ignoring nodes at
  ply 1 (style names, ADR 012). None (start position, or 1.e4 only) → no current family.
- Breadth-first walk from the start node, each node visited once, at most **12 plies** from the
  start node.
- A node is a **stop** when it has a name, it is not at ply 1 from the initial position, and its
  family differs from the current family. A stop is recorded and the walk does not continue
  past it. Unnamed nodes, ply-1 style names and same-family nodes are walked through.
- Each family is recorded once, at its first (shallowest) stop; ties at the same depth go to the
  stop with more `linesThrough`.
- Result order: `linesThrough` of the recorded node, descending; then name.

## Web — `ExplorePanel.svelte`

- Below the by-name list (`lab.byName` section), a section headed `lab.continuesInto`
  ("Continues into" / "Prosegue in"), hidden when the list is empty or the collection has a
  custom start.
- Each row: moves label (`via` as SAN with move numbers, e.g. `3.Bb5`; SAN derived through the
  existing core helper `playLine`), opening name with ellipsis + `title`, `Mastery` for the
  line `openingLine(graph, c.ucis)`, ▶ practise (same `onpractice` path as other rows), and a
  click on the row that jumps the board to `c.ucis` (`onjump`).
- Computed with `$derived` from `graph` and `ucis` only.
- New i18n keys in `en.ts` and `it.ts`: `lab.continuesInto`.

## Docs

ADR 012 addendum: the by-name tree stays name-based; position-based continuations are shown
beside it, computed from the graph.

## Testing

- Vitest (`continuations.test.ts`), expected names copied from `data/openings/*.tsv`:
  - at King's Knight Opening: Normal Variation (1.e4 e5 2.Nf3 Nc6) the result includes Ruy
    Lopez (via `f1b5`), Italian Game (`f1c4`) and Scotch Game (`d2d4`);
  - no result has the current family;
  - every family appears once;
  - from the start position and after 1.e4 there are results and none is a ply-1 style name;
  - off-book moves → `[]`;
  - `nodeNames` throws when openings are not loaded.
- Playwright: at Normal Variation, "Continues into" lists Ruy Lopez; clicking it puts
  "Ruy Lopez" in the opening title.
- Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
  (core dataset and db migrator tests are known to fail on CRLF checkouts, unrelated).
