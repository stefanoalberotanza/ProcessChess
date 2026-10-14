# Lines View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening › Variation hierarchy without families, an `owner` side per opening, a Lines view from the board position (Explore and Training), and a repertoire panel that opens into its openings and variations.

**Architecture:** Core: rewrite the regrouping step of `buildNameTree` (no family roots), add `opening-side.ts` and `lines.ts`. Web: `LinesView.svelte` replaces `NameAlbum.svelte` and the two Explore tabs; `RepertoireList` drops the clean counter and shows the selected repertoire's tree from `repertoireNames`.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-15-lines-view-design.md`

## Global Constraints

- Branch `refactor/week-repertoire`. Core pure, tests first. No new deps. No chess.js in apps/web.
- Every UI string via `t()`, `en.ts` + `it.ts` together. English code/comments.
- Opening names in tests copied from `data/openings/*.tsv`.
- "King's Pawn Game" and "Queen's Pawn Game" are never openings; their variations are openings.
- Known pre-existing failures (CRLF): core `dataset.test.ts` "up to date", core `graph.test.ts` "counts the dataset lines", db `migrator.test.ts`. Run `pnpm -r --no-bail test`.

## Review Focus

- Every dataset name except the two style names must still resolve with `nodeForName` (Task 1 test).
- An opening with no own position (group of variations) must still get `ucis`/`side`/`owner` (Task 1–2 tests).
- `linesFrom` at a transposed position equals the book-order result (Task 3 test).
- Week repertoire candidates (kind `variation`, side) must still yield 3 lines after the hierarchy change (Task 1: run `src/week` tests).
- Explore search (name and FEN) still enters the right opening/variation (Task 4 e2e).

---

### Task 1: Opening › Variation hierarchy (core)

**Files:** Modify `packages/core/src/lab/names.ts`; Test `packages/core/src/lab/names.test.ts`, `rollup.test.ts`, `mix.test.ts` (fixtures using `'family'`/`'subfamily'` kinds).

**Interfaces:** Produces `NameKind = 'opening' | 'variation'`; `NameTree.roots` = opening keys; removes `familyKey`. `NameNode.style` stays (first-move style, used by labels).

- [ ] Step 1: Rewrite the `family > subfamily > variation` describe block and the family assertions in `names.test.ts` (lines ~40–185) to:
  - roots are openings (`kind: 'opening'`, `parent: null`, `depth: 0`), sorted by `lines` desc;
  - `tree.get('Sicilian Defense')` → `{ kind: 'opening', parent: null }`; `'Sicilian Defense: Najdorf Variation'` → `{ kind: 'variation', parent: 'Sicilian Defense' }`;
  - `tree.get('Bird Opening')!.kind === 'opening'`; `tree.get('Bongcloud Attack')!.kind === 'opening'` (leaf openings stay openings);
  - `tree.nodeForName("King's Pawn Game")` and `("Queen's Pawn Game")` are `undefined`; `tree.get("King's Pawn Game: Busch-Gass Gambit")` → `{ kind: 'opening', parent: null, label: 'Busch-Gass Gambit' }` (name from c.tsv — verify the exact string with `grep "King's Pawn Game:" data/openings/*.tsv` and use one that exists);
  - every dataset name except the two style names resolves via `nodeForName`;
  - no node has `kind` other than `'opening' | 'variation'`; no key starts with `style:`.
    In `rollup.test.ts`/`mix.test.ts` replace fixture kinds `'family'`→`'opening'`, `'subfamily'`→`'opening'` keeping the shapes.
- [ ] Step 2: `pnpm --filter @processchess/core exec vitest run src/lab` → FAIL on the new expectations.
- [ ] Step 3: In `buildNameTree`: `ensure()` creates root nodes with `kind: 'opening'`. Replace the "Regroup under the three families" block: for each dataset root, if `LABEL_OWN_FAMILY` contains its key → delete it, and for each child: `parent = null`, `kind = 'opening'`, `label` = its own last segment, depth 0 (children depths shift by −1, kinds stay `variation`), register `aliases` none. Otherwise keep the root as is (`kind: 'opening'`, depth 0). Roots = all parent-null nodes sorted by `byLines`. Remove `families`, `FAMILY_UCIS`, `familyKey`, `isLeafFamily` use. Update the doc comment.
- [ ] Step 4: `pnpm --filter @processchess/core exec vitest run src/lab src/week` → PASS; `pnpm --filter @processchess/core typecheck`.
- [ ] Step 5: Commit `refactor(core): openings are the roots of the name tree, no families`.

### Task 2: Opening owner (core)

**Files:** Create `packages/core/src/lab/opening-side.ts`; Modify `names.ts` (set `owner`), `lab/index.ts`; Test `packages/core/src/lab/opening-side.test.ts`.

**Interfaces:** `type OpeningSide = 'w' | 'b' | 'both'`; `OPENING_SIDE_OVERRIDES`; `BOTH_SHARE = 0.25`; `openingSide(tree: Pick<NameTree,'get'>, opening: NameNode): OpeningSide`; `NameNode.owner: OpeningSide | null` (null for variations).

- [ ] Step 1: Test: `Ruy Lopez` → `both` (override); `Sicilian Defense` → `b` (defining move 1...c5); `Bird Opening` → `w` (1.f4); and a synthetic tree (hand-built `NameNode`s) for the share rule: opening W with variations of sides w (lines 70) and b (lines 30) → `both`; with b lines 20 → `w`.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: Implement: overrides first; else sum `lines` of all descendant variations by `side`; if both sums > 0 and each ≥ `BOTH_SHARE` × total → `both`; else `opening.side ?? 'w'`. In `buildNameTree`, after roots are final, set `owner = openingSide(tree, n)` for openings, `null` for variations.
- [ ] Step 4: run `src/lab` → PASS. Step 5: commit `feat(core): openingSide, who an opening belongs to`.

### Task 3: linesFrom (core)

**Files:** Create `packages/core/src/lab/lines.ts`; Modify `lab/index.ts`; Test `lines.test.ts`.

**Interfaces:** `interface LinesHere { opening: NameNode | null; openings: NameNode[]; variations: NameNode[] }`; `linesFrom(graph, tree: NameTree, ucis: readonly string[]): LinesHere`; helper `openingOf(tree, n): NameNode` (root ancestor).

- [ ] Step 1: Tests: at `[]` → `opening` null, `openings` contains `Sicilian Defense` and `Ruy Lopez`, `variations` empty, no style names; at `1.e4 c5` → `opening.key === 'Sicilian Defense'`, `variations` contains a Sicilian variation reached by moves (assert one from `branchesFrom(graph, ['e2e4','c7c5'])` whose name starts with `Sicilian Defense:`), no entry of `openings` is the Sicilian; transposed `1.Nf3 Nc6 2.e4 e5 3.d4` equals book order `1.e4 e5 2.Nf3 Nc6 3.d4` (compare keys).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: Implement with `branchesFrom(graph, ucis)` and `deepestName(graph, ucis)` (both handle transpositions): `opening = openingOf(nodeForName(deepestName))`; for each branch `n = nodeForName(b.name)` (skip undefined), `o = openingOf(n)`; if `o === opening` → push `n` to `variations` (dedupe by key) else push `o` to `openings` (dedupe). Keep `branchesFrom` order (most played first).
- [ ] Step 4: PASS. Step 5: commit `feat(core): linesFrom, the openings and variations reachable from a position`.

### Task 4: LinesView in Explore and Training (web)

**Files:** Create `apps/web/src/lib/components/LinesView.svelte`; Delete `NameAlbum.svelte`; Modify `ExplorePanel.svelte` (drop the tabs, "From this position", NameAlbum; keep search, side filter, add-book), `routes/+page.svelte` (Training uses LinesView), `album.ts` (keep only used helpers), i18n `en.ts`/`it.ts` (`lines.title`, `lines.openings`, `lines.variations`, `lines.showAll`; remove `album.*`, `explore.fromHere*`, `lab.byName` if unused); Test `apps/web/e2e/drill.spec.ts`.

**Interfaces:** `LinesView` props: `graph`, `names: NameTree` (full or `RepertoireNameTree`), `ucis`, `sideFilter`, `summaries`, `repertoire`, `onpractice(item: LabItem)`, `onjump(ucis)`, `onadd?`, `inRepertoire?`, `pathOf?(n)`, `filter?(n): boolean` (Training: only names with nodes). Breadcrumbs: opening › variation chain of `linesFrom(...).opening` and the board's deepest name; clicking a crumb jumps there.

- [ ] Step 1: e2e first: rewrite tests that use "Practise by name", "From this position", album tiles, "discovered", `tile-depth`, `album-progress`, `enterFamily`, `King's Pawn Games` so they go through Lines: (a) Explore shows heading "Lines" with lists "Openings" and "Variations", no "?" anywhere, no tab "From this position"; (b) clicking opening "Sicilian Defense" in Openings moves the board (opening bar shows Sicilian) and Variations lists Sicilian variations; (c) ▶ on a variation starts the lab; (d) side filter "Black" keeps "Ruy Lopez" (`both`) and hides "Bird Opening" (`w`); (e) Training: Lines of the repertoire, ▶ drills (keep the 5 Training album tests, adapted). Keep FEN search test. Run → FAIL.
- [ ] Step 2: Build `LinesView.svelte`: compute `here = linesFrom(graph, names, ucis)` (filter openings by side: `owner === side || owner === 'both'`, variations by `side`; Training applies `filter`). Two `<section aria-label>` groups, each a `<ul>` of rows: SideMark, name button (`onjump(pathOf?.(n) ?? n.ucis)`), Mastery dot (`srsOfLine`/summary on `practiceLine`), ▶ (`onpractice(item(n))`), add (Explore). First 8 rows + "Show all (n)". Breadcrumbs nav.
- [ ] Step 3: Wire Explore (search above, Lines below, add-book under) and Training (`names={repNames}`, `filter={(n) => repNames.nodesOf(n.key).length > 0}`, `pathOf`, ▶ → `drillName`). Delete NameAlbum and dead CSS/i18n. `pnpm format; pnpm lint; pnpm typecheck; pnpm build; pnpm test:e2e` → all pass.
- [ ] Step 4: Commit `feat(web): Lines view replaces the album and the explore tabs`.

### Task 5: Repertoire panel opens into its lines (web)

**Files:** Modify `RepertoireList.svelte`, `+page.svelte` (pass the selected repertoire's `repNames` and a jump callback), i18n; Test e2e.

- [ ] Step 1: e2e: card shows no "lines clean"; selecting the week White repertoire shows under it a list "Openings of this repertoire" with its openings, each with nested variations; clicking a variation moves the board (opening bar shows it). Run → FAIL.
- [ ] Step 2: Remove the `rep.linesClean` meta line (and the `lines`/`clean` row fields if unused elsewhere). Add props `tree?: RepertoireNameTree | null`, `onjumpnode?: (nodeId: string) => void`; under the selected card render openings (`tree.roots`) and their variation children with `nodesOf(key)[0]` → `onjumpnode`. In `+page`, `onjumpnode = (id) => goTo(pathTo(tree, id).slice(1).map((n) => n.uci!))`.
- [ ] Step 3: Full check: `pnpm lint && pnpm typecheck && pnpm -r --no-bail test; pnpm build && pnpm test:e2e` → only the 3 known failures; e2e green. Update AGENTS.md layout (LinesView, lines.ts, opening-side.ts; NameAlbum removed) and ADR 012 status note ("amended 2026-10-15: no families; openings are roots").
- [ ] Step 4: Commit `feat(web): the selected repertoire opens into its openings and variations`.
