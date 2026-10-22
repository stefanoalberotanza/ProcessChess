# Moves View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Moves" view in the Explore tab that lists, from the board position, the next moves that still lead into a named opening, in two groups (White's / Black's openings), with the lines behind each move as text.

**Architecture:** A pure function `movesFrom` in `packages/core/src/lab/moves.ts` walks the opening graph below each child move (like `linesFrom`) and buckets the named nodes reached by side. A new `MovesView.svelte` renders it; `ExplorePanel.svelte` gets a "Lines | Moves" switch.

**Tech Stack:** TypeScript strict, Vitest, Svelte 5, Playwright, the existing opening graph and name tree.

**Spec:** `docs/superpowers/specs/2026-10-20-moves-view-design.md`

## Global Constraints

- Tests first in `packages/core` (AGENTS.md rule 1); `packages/core` stays pure (rule 5).
- Test expectations for opening names come from `data/openings/*.tsv`, never from memory (rule 4). Look them up with grep in `docs/openings.md` / the TSVs before writing an assertion.
- No new dependencies. No chess.js in `apps/web` (rule 6).
- Every UI string goes through `t()`; add keys to `en.ts` and `it.ts` together.
- Code, comments, docs and UI strings in English.
- The working tree already holds unrelated uncommitted changes (Today work, Docker files): stage only the files named in each task, never `git add -A`.
- Do not touch the Graph tab, the repertoire logic, the drill or the lab.

## Review Focus

- Position off book, or one with no named node ahead: `movesFrom` returns empty groups and the view shows `moves.none`.
- A transposed move order to the same position gives the same result as the book order.
- A node reachable by two paths below one move is counted once (opening and line counts).
- A `both` opening shows under both groups; a variation is placed by its own `side`.
- A collection that does not start from the initial position, or an unloaded graph: no switch, Lines unchanged.

---

### Task 1: `movesFrom` in core

**Files:**

- Create: `packages/core/src/lab/moves.ts`, `packages/core/src/lab/moves.test.ts`
- Modify: `packages/core/src/lab/index.ts` (add `export * from './moves';`)

**Interfaces:**

- Consumes: `positionNode`, `nodeNames` (`../openings/continuations`), `OpeningGraph`, `NameTree`, `NameNode`, `openingOf` (`./lines`), `practiceLine` (`./lab`), `uciToSan` / `INITIAL_FEN` (`../position`).
- Produces:

  ```ts
  export interface MoveEntry {
    uci: string;
    /** SAN of the move from the board position. */
    san: string;
    /** Distinct root openings among `names`. */
    openings: number;
    /** Sum of `NameNode.lines` over `names`. */
    lines: number;
    /** Named nodes reached through this move on this side, most `lines` first, then key. */
    names: NameNode[];
    /** Practice line (UCI from the start) of `names[0]`, the move first in the continuation. */
    example: string[];
  }
  export interface MovesHere {
    w: MoveEntry[];
    b: MoveEntry[];
  }
  export function movesFrom(
    graph: OpeningGraph,
    tree: NameTree,
    ucis: readonly string[],
  ): MovesHere;
  ```

- [ ] **Step 1: Write the failing tests** in `moves.test.ts`, same `beforeAll` setup as `lines.test.ts`. Tests:
  - `'after 1.e4 c5 lists Nf3 and c3, with the Alapin under White'`: `movesFrom(graph, tree, ['e2e4','c7c5'])`; `w.map(m => m.san)` contains `Nf3` and `c3`; the `c3` entry's `names` keys contain `Sicilian Defense: Alapin Variation` (check the exact spelling in `docs/openings.md`); `b` entries contain `Sicilian Defense: Najdorf Variation` (names reached through `Nf3`).
  - `'orders moves by opening count, then line count, then SAN'`: assert on each side that `[openings, lines]` pairs are non-increasing.
  - `'orders names by lines then key and puts the played move first in the example'`: for the first entry, `names` sorted; `example[ucis.length] === entry.uci`; `example.slice(0, ucis.length)` equals `ucis`.
  - `'counts a node once per move'`: for every entry `names` keys are unique and `openings` equals the number of distinct `openingOf(tree, n).key`.
  - `'is the same for a transposed move order'`: `['e2e4','e7e5','g1f3','b8c6']` vs `['g1f3','b8c6','e2e4','e7e5']` give equal `w`/`b` SAN lists and counts.
  - `'lists a both-owner opening on both sides'`: pick an opening with `owner === 'both'` from `tree.all()`, call `movesFrom` at the position before its first move, and assert it is in `names` of an entry on `w` and on `b`. If the dataset has none, assert instead that no node of kind `opening` appears on a side other than its owner.
  - `'is empty off book'`: `['h2h4','h7h5','h1h3']` gives `{ w: [], b: [] }`.

- [ ] **Step 2: Run** `pnpm --filter @processchess/core test -- moves` — expected: FAIL (module missing).

- [ ] **Step 3: Implement `movesFrom` in `moves.ts`.** For each `graph.children(start)` edge, BFS the subtree (including the child itself) with a per-move seen set, as `linesFrom` does; resolve each node's name via `nodeNames(graph)` and `tree.nodeForName`. Drop moves with no named node. Bucket per node: kind `opening` by `owner` (`both` into both sides, `null` owner falls back to `side`), kind `variation` by `side` (skip if null). Compute `openings`, `lines`, sort names and entries as specified, build `example` with `practiceLine(graph, [...ucis, uci, ...])` from the top node's `ucis` re-rooted so the played move comes first (if the top node's path does not start with `[...ucis, uci]`, use `practiceLine(graph, [...ucis, uci])`). SAN via `uciToSan` on the FEN reached with `playLine`.

- [ ] **Step 4: Run** the same command — expected: PASS. Then `pnpm --filter @processchess/core typecheck`.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/core/src/lab/moves.ts packages/core/src/lab/moves.test.ts packages/core/src/lab/index.ts
  git commit -m "feat(core): movesFrom, next moves into named openings by side"
  ```

### Task 2: `MovesView` and the switch

**Files:**

- Create: `apps/web/src/lib/components/MovesView.svelte`
- Modify: `apps/web/src/lib/components/ExplorePanel.svelte`, `apps/web/src/lib/i18n/en.ts`, `apps/web/src/lib/i18n/it.ts`

**Interfaces:**

- Consumes: `movesFrom`, `MoveEntry`, `practiceLine` from `@processchess/core`; `sanLine`, `srsOfLine` from `$lib/album`; `LabItem`, `lineKey` from `$lib/lab.svelte`; `Mastery`, `SideMark`.
- Produces: `MovesView` with the same props as `LinesView` (`graph`, `names`, `ucis`, `summaries`, `repertoire`, `onpractice`, `onjump`, `onadd`, `inRepertoire`), no `sideFilter`.

- [ ] **Step 1: Add i18n keys** to `en.ts` and `it.ts` together: `moves.title` ("Moves" / "Mosse"), `moves.white` ("White's openings" / "Aperture del Bianco"), `moves.black` ("Black's openings" / "Aperture del Nero"), `moves.none` ("No opening ahead from this position." / "Nessuna apertura davanti a questa posizione."), `moves.count` (`{o} openings · {l} lines` / `{o} aperture · {l} linee`), `moves.example` ("Example" / "Esempio"), `explore.viewLines` ("Lines" / "Linee"), `explore.viewMoves` ("Moves" / "Mosse"), `explore.view` (aria label "View" / "Vista"). Reuse `lab.showAll`, `lab.enter`, `lab.practise`, `rep.addOpening`.

- [ ] **Step 2: Write `MovesView.svelte`**, a region labelled by `moves.title` containing two sections (`moves.white`, `moves.black`, each with the count of moves, omitted when empty). Each move is a `<li>` with a heading button (`1.`-style move number from `ucis.length`, SAN, count text) calling `onjump([...ucis, m.uci])`; under it the top 3 `names` (all after `lab.showAll` per move) each as a row with the name, `Mastery`, ▶ (`onpractice`) and +/✓ (`onadd`/`inRepertoire`) built from `{ line: practiceLine(graph, n.ucis), eco: n.eco, name: n.key, side: n.side }` exactly as `LinesView.item` does; and one muted line with `moves.example` and `sanLine(m.example)`. No `MiniBoard`. When both groups are empty show `moves.none`. Follow `LinesView` styling (CSS variables, no new colours).

- [ ] **Step 3: Add the switch to `ExplorePanel.svelte`.** `let view = $state<'lines' | 'moves'>('lines')`; a radiogroup (same markup and styles as the side filter) rendered only when `graph && names && standardStart`; below it render `MovesView` when `view === 'moves'`, else the existing `LinesView` with the side filter (the side filter is shown only in Lines view). Search results and the "add book" button stay as they are.

- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck` — expected: clean (fix with `pnpm format` for Prettier issues only in the files above).

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/lib/components/MovesView.svelte apps/web/src/lib/components/ExplorePanel.svelte apps/web/src/lib/i18n/en.ts apps/web/src/lib/i18n/it.ts
  git commit -m "feat(web): Moves view in Explore, next moves into openings by side"
  ```
  `en.ts`/`it.ts` already carry unrelated uncommitted changes: use `git add -p` for those two files and stage only the new keys.

### Task 3: e2e and docs

**Files:**

- Create: `apps/web/e2e/moves.spec.ts`
- Modify: `AGENTS.md` (layout list: add `MovesView` to `src/lib/components/`)

**Interfaces:**

- Consumes: the Explore tab as in `apps/web/e2e/drill.spec.ts` (`explore(page)` helper pattern; copy its navigation, do not import from it).

- [ ] **Step 1: Write the e2e test** `'Moves view after 1.e4 c5'`: open the app, play `e4` and `c5` on the board the way `drill.spec.ts` does, switch to the "Moves" radio, expect a "White's openings" section containing a button for `c3` and a "Black's openings" section; click the `c3` heading and expect the board/opening bar to move (assert via the same indicator `drill.spec.ts` uses for the current opening or move list). Names asserted from `data/openings/*.tsv`.

- [ ] **Step 2: Run** `pnpm build && pnpm test:e2e -- moves` — expected: PASS.

- [ ] **Step 3: Update `AGENTS.md`** layout line and run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` — expected: all green; report the real output.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/web/e2e/moves.spec.ts AGENTS.md
  git commit -m "test(web): e2e for the Moves view; docs: AGENTS layout"
  ```

---

Self-review: spec coverage — two groups, text-only lines, switch, play/add actions, ordering, top 3 + show all, search/book unchanged, hidden switch off standard start, empty message: Tasks 1–2; e2e: Task 3. Names `MoveEntry`, `MovesHere`, `movesFrom` are used consistently.
