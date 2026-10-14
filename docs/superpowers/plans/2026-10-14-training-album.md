# Training Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Training, a selected standard-start repertoire shows an Explore-like album of its own openings; ▶ on a variation drills the repertoire lines under that name.

**Architecture:** Core gets `repertoireNames` (a repertoire's name tree, filtered from the dataset name tree, with the repertoire nodes of each name) and a `throughNodeIds` drill option. The web app extracts Explore's "by name" album into `NameAlbum.svelte`, reused by Explore (lab) and by Training (drill) through a `children` slot of `DrillPanel`.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-14-training-album-design.md`

## Global Constraints

- Branch: `refactor/week-repertoire`.
- The album is Training's main screen while no drill runs; "Train all" and "Review" stay above it.
- Which openings: every name the repertoire's lines pass through, with the Explore levels (family › subfamily › variation) and ancestors.
- ▶ on a name: line drill limited to the repertoire lines through that name's nodes.
- Every repertoire, not only week ones. Custom start position: no album, today's screen.
- Out of scope: "From this position" and search in Training.
- `packages/core` pure, tests first. No new dependencies. No chess.js in `apps/web`.
- Every UI string through `t()`, keys in `en.ts` and `it.ts` together. English code/comments.
- Opening names in tests copied from `data/openings/*.tsv`.
- Known pre-existing failures to ignore (CRLF checkout): core `dataset.test.ts` "up to date", core `graph.test.ts` "counts the dataset lines", db `migrator.test.ts` "migrations.generated.ts is up to date". Use `pnpm -r --no-bail test` to see every package.

## Review Focus

- A repertoire line reaching a name by transposition must list that name and drill that line (test in Task 2).
- A name with no node of its own (subfamily/family) must drill the union of its descendants' lines (test in Task 2, `nodesOf`).
- The Explore album must behave exactly as before the extraction (all existing Explore e2e green in Task 3).
- Stopping a drill started from the album must return to the album, not to an empty screen (test in Task 4).
- A custom-start repertoire must still show the old Training screen with working buttons (test in Task 4).

---

### Task 1: Drill through several nodes

**Files:**

- Modify: `packages/core/src/drill/drill.ts:41-53` (options), `:176-181` (filter)
- Test: `packages/core/src/drill/drill.test.ts` (next to the `throughNodeId` test, ~line 234)

**Interfaces:**

- Produces: `LineDrillOptions.throughNodeIds?: readonly string[]`

- [ ] **Step 1: Write the failing test** (add after the existing `throughNodeId` test, same `describe`):

```ts
it('throughNodeIds drills the lines through any of the nodes', () => {
  const tree = white();
  const [mainLine, sicilian] = enumerateLines(tree);
  const e5 = mainLine!.nodeIds[1]!; // 1...e5
  const c5 = sicilian!.nodeIds[1]!; // 1...c5
  expect(startLineDrill({ tree }, { throughNodeIds: [c5] }).queue).toEqual([sicilian!.id]);
  expect(startLineDrill({ tree }, { throughNodeIds: [e5, c5] }).queue).toEqual([
    mainLine!.id,
    sicilian!.id,
  ]);
  expect(startLineDrill({ tree }, { throughNodeIds: [] }).queue).toEqual([]);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @processchess/core exec vitest run src/drill/drill.test.ts`
Expected: FAIL (typecheck error on unknown option, or queue not filtered).

- [ ] **Step 3: Implement**

In `LineDrillOptions`, after `throughNodeId`:

```ts
  /** Only drill the lines that go through at least one of these nodes (an opening's nodes). */
  throughNodeIds?: readonly string[];
```

Replace the filter at ~line 178:

```ts
const through = options.throughNodeId;
const throughAny = options.throughNodeIds;
const all = enumerateLines(tree).filter(
  (l) =>
    (!through || through === tree.rootId || l.nodeIds.includes(through)) &&
    (!throughAny || throughAny.some((id) => id === tree.rootId || l.nodeIds.includes(id))),
);
```

- [ ] **Step 4: Run it**

Run: `pnpm --filter @processchess/core exec vitest run src/drill`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/drill
git commit -m "feat(core): drill the lines through any of several nodes"
```

---

### Task 2: repertoireNames

**Files:**

- Create: `packages/core/src/lab/repertoire-names.ts`
- Modify: `packages/core/src/lab/index.ts` (add `export * from './repertoire-names';`)
- Test: `packages/core/src/lab/repertoire-names.test.ts`

**Interfaces:**

- Consumes: `NameTree`, `NameNode`, `buildNameTree` (`./names`), `openingIndex` (`../openings/data`), `Tree` (`../tree/types`), `treeFromPgn` (`../pgn`) in tests.
- Produces:
  ```ts
  interface RepertoireNameTree extends NameTree {
    nodesOf(key: string): readonly string[];
  }
  function repertoireNames(tree: Tree, names: NameTree): RepertoireNameTree;
  ```

Ruling carried from the spec: the spec says "classifies with `classifyTree`". `classifyTree` returns label/opening/variation parts, not the dataset name. The exact dataset name of a position is `openingIndex().get(node.epd)`, which also covers transpositions (EPD). Use that; `classifyTree` is not needed.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/lab/repertoire-names.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { counterIds } from '../../test/helpers';
import { loadOpenings } from '../openings/data';
import { loadOpeningGraph } from '../openings/graph';
import { treeFromPgn } from '../pgn';
import { type NameTree, buildNameTree } from './names';
import { repertoireNames } from './repertoire-names';

// names from data/openings/b.tsv (B90 Najdorf) and c.tsv (C44 Scotch Game)
const NAJDORF = 'Sicilian Defense: Najdorf Variation';
const SCOTCH = 'Scotch Game';

let names: NameTree;
beforeAll(async () => {
  const [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  names = buildNameTree(graph);
});

const rep = (pgn: string, color: 'w' | 'b' = 'b') =>
  treeFromPgn(pgn, { userColor: color, newId: counterIds() }).tree;

describe('repertoireNames', () => {
  it('keeps only the names the lines pass through, with their ancestors', () => {
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
    const r = repertoireNames(tree, names);
    const keys = [...r.all()].map((n) => n.key);
    expect(keys).toContain(NAJDORF);
    // every kept node's parent is kept, roots have no parent
    for (const n of r.all()) if (n.parent) expect(r.get(n.parent)).toBeDefined();
    for (const k of r.roots) expect(r.get(k)!.parent).toBeNull();
    // nothing from another family
    expect(keys.some((k) => k.startsWith('French Defense'))).toBe(false);
    expect(r.nodeForName('French Defense')).toBeUndefined();
    // children are filtered to kept keys
    for (const n of r.all()) for (const c of n.children) expect(r.get(c)).toBeDefined();
  });

  it('finds a name reached by transposition, with its node', () => {
    // 1.Nf3 Nc6 2.e4 e5 3.d4 is the Scotch Game position
    const tree = rep('1. Nf3 Nc6 2. e4 e5 3. d4 *', 'w');
    const r = repertoireNames(tree, names);
    const scotch = r.nodeForName(SCOTCH)!;
    expect(scotch).toBeDefined();
    const nodes = r.nodesOf(scotch.key);
    expect(nodes).toHaveLength(1);
    expect(tree.nodes.get(nodes[0]!)!.uci).toBe('d2d4');
  });

  it('gives an ancestor level the nodes of its descendants', () => {
    const tree = rep('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
    const r = repertoireNames(tree, names);
    const najdorf = r.nodeForName(NAJDORF)!;
    let up = najdorf;
    while (up.parent) {
      up = r.get(up.parent)!;
      for (const id of r.nodesOf(najdorf.key)) expect(r.nodesOf(up.key)).toContain(id);
    }
  });

  it('is empty for a custom start position', () => {
    const tree = rep(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
      'w',
    );
    const r = repertoireNames(tree, names);
    expect(r.roots).toEqual([]);
    expect([...r.all()]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @processchess/core exec vitest run src/lab/repertoire-names.test.ts`
Expected: FAIL, cannot resolve `./repertoire-names`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/lab/repertoire-names.ts
import { openingIndex } from '../openings/data';
import { OpeningsNotLoadedError } from '../openings/resolve';
import type { Tree } from '../tree/types';
import type { NameNode, NameTree } from './names';

const STANDARD_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

/** The name tree of a repertoire: the dataset levels its lines reach, and where. */
export interface RepertoireNameTree extends NameTree {
  /** Repertoire node ids where `key` or one of its descendant levels is reached. */
  nodesOf(key: string): readonly string[];
}

/**
 * The levels of `names` that the repertoire's positions reach (by EPD, so transpositions count),
 * with all their ancestors; children and roots keep only kept levels, in their order. Empty for a
 * custom start position. Needs `loadOpenings()`.
 */
export function repertoireNames(tree: Tree, names: NameTree): RepertoireNameTree {
  const index = openingIndex();
  if (!index) throw new OpeningsNotLoadedError();
  const nodesOf = new Map<string, string[]>();
  const root = tree.nodes.get(tree.rootId);
  if (root && root.epd === STANDARD_EPD) {
    for (const node of tree.nodes.values()) {
      const named = index.get(node.epd);
      if (!named) continue;
      // the level and every ancestor reach this node
      for (let n = names.nodeForName(named[1]); n; n = n.parent ? names.get(n.parent) : undefined) {
        const ids = nodesOf.get(n.key) ?? [];
        if (!ids.includes(node.id)) ids.push(node.id);
        nodesOf.set(n.key, ids);
      }
    }
  }
  const kept = new Map<string, NameNode>();
  for (const key of nodesOf.keys()) {
    const n = names.get(key)!;
    kept.set(key, { ...n, children: n.children.filter((c) => nodesOf.has(c)) });
  }
  return {
    roots: names.roots.filter((k) => kept.has(k)),
    get: (key) => kept.get(key),
    nodeForName: (name) => {
      const n = names.nodeForName(name);
      return n ? kept.get(n.key) : undefined;
    },
    all: () => kept.values(),
    nodesOf: (key) => nodesOf.get(key) ?? [],
  };
}
```

Check before running: `STANDARD_EPD` must equal `toEpd(INITIAL_FEN)`; if `../openings/tree.ts` already exports a `STANDARD_EPD`, import it instead of redefining. `openingIndex()` returns `Map<epd, [eco, name]>` (used this way in `continuations.ts`).

Add `export * from './repertoire-names';` to `packages/core/src/lab/index.ts`.

- [ ] **Step 4: Run it**

Run: `pnpm --filter @processchess/core exec vitest run src/lab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lab
git commit -m "feat(core): repertoireNames, the name tree of a repertoire"
```

---

### Task 3: Extract NameAlbum from ExplorePanel (no behaviour change)

**Files:**

- Create: `apps/web/src/lib/components/NameAlbum.svelte`
- Create: `apps/web/src/lib/album.ts` (helpers shared by both components)
- Modify: `apps/web/src/lib/components/ExplorePanel.svelte`
- Test: existing `apps/web/e2e/drill.spec.ts` (all Explore / album / "by name" tests)

**Interfaces:**

- Produces:
  ```ts
  // NameAlbum.svelte props
  interface Props {
    graph: OpeningGraph;
    names: NameTree; // full tree in Explore, RepertoireNameTree in Training
    ucis: string[]; // board path from the start
    sideFilter: 'all' | 'w' | 'b';
    summaries: Map<string, LabRunSummary>;
    repertoire: Map<string, SrsCard[]>;
    onpractice: (queue: LabItem[], index: number) => void;
    onjump: (ucis: string[]) => void;
    /** Explore only: the "+" add button and the "✓ in repertoire" mark. */
    onadd?: (item: LabItem) => void;
    inRepertoire?: (line: string[]) => boolean;
  }
  // album.ts
  function tileBoard(n: { ucis: string[] }): { fen: string; last: [string, string] | null };
  function sanLine(line: string[]): string;
  ```

This is a move, not a rewrite: cut code from `ExplorePanel.svelte` and paste it into `NameAlbum.svelte` unchanged except for prop names.

- [ ] **Step 1: Baseline**

Run: `pnpm build; pnpm test:e2e`
Expected: 29 passed. This is the safety net; it must stay at 29 after the move.

- [ ] **Step 2: Create `album.ts`**

Move `tileBoard` (ExplorePanel ~line 220) and `sanLine` (~line 302) into `apps/web/src/lib/album.ts` as exported functions, with the imports they need (`INITIAL_FEN`, `playLine`, `parseUci` from `@processchess/core`). Import them back in `ExplorePanel.svelte`.

- [ ] **Step 3: Create `NameAlbum.svelte` and move the album into it**

Move into `NameAlbum.svelte`, verbatim:

- Script state and helpers used only by the "by name" panel: `LEVEL_SIZE`, `showAll`, `manual`, `focus`, `crumbs`, `levelKeys`, `labelOf`, `nameOf`, `isVariation`, `practise`, `level`, `item`, `srsOf`, `streakOfLine`, `rollupOf`, `levelItems`, `focusItem`, `enter`, `isLeaf`, `tileState`, `album`, `deepest`, plus the `leaf` and `add` snippets. `san` and `pathKey` are recomputed from the `ucis` prop.
- Markup: the whole content of `<div role="tabpanel" id="panel-name" …>` (keep the wrapper `div` with its role/id/hidden in `ExplorePanel`, put `<NameAlbum … />` inside it).
- The CSS rules used only by that markup (album, tiles, crumbs, focus card, `.leaf`, `.add`, `.in-rep`). Run `pnpm --filter @processchess/web check` after: svelte-check flags unused selectors in either file; move or delete accordingly.
- In the `add` snippet, render nothing when `onadd`/`inRepertoire` are not given.

Things ExplorePanel still needs (search results and "From this position" use them): keep a copy of `isVariation`, `practise`, `labelOf` in ExplorePanel if still referenced there, or import from `album.ts` if you move them there (prefer moving pure helpers that take `names` as a parameter to `album.ts` over duplicating).

In ExplorePanel render:

```svelte
{#if graph && names}
  <NameAlbum
    {graph}
    {names}
    {ucis}
    {sideFilter}
    {summaries}
    {repertoire}
    {onpractice}
    {onjump}
    {onadd}
    {inRepertoire}
  />
{/if}
```

- [ ] **Step 4: Verify no behaviour change**

Run: `pnpm format; pnpm lint; pnpm typecheck; pnpm build; pnpm test:e2e`
Expected: lint and typecheck clean; e2e 29 passed (same as Step 1).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib
git commit -m "refactor(web): extract the by-name album into NameAlbum"
```

---

### Task 4: The album in Training

**Files:**

- Modify: `apps/web/src/lib/components/DrillPanel.svelte` (add a `children` snippet shown while no drill runs)
- Modify: `apps/web/src/routes/+page.svelte` (Training branch ~line 637; a derived name tree; a start function)
- Modify: `apps/web/src/lib/i18n/en.ts`, `it.ts` (`train.album`)
- Test: `apps/web/e2e/drill.spec.ts`

**Interfaces:**

- Consumes: `repertoireNames`, `buildNameTree` (`@processchess/core`), `NameAlbum` (Task 3), `LineDrillOptions.throughNodeIds` (Task 1).

- [ ] **Step 1: Write the failing e2e tests**

```ts
test('training shows the repertoire openings as an album and drills one', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Training' }).click();
  const album = page.getByRole('region', { name: 'Openings of this repertoire' });
  await expect(album).toBeVisible();
  // the week White repertoire has 3 openings: at least one family tile to open
  const firstTile = album.getByRole('button', { name: /^Open / }).first();
  await expect(firstTile).toBeVisible();
  // walk down to a variation and drill it
  for (let i = 0; i < 6; i++) {
    const practise = album.getByRole('button', { name: /^Practise / }).first();
    if (await practise.isVisible()) break;
    await album
      .getByRole('button', { name: /^Open / })
      .first()
      .click();
  }
  await album
    .getByRole('button', { name: /^Practise / })
    .first()
    .click();
  await expect(page.getByTestId('clean-counter')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(album).toBeVisible();
});

test('a custom-start repertoire keeps the plain training screen', async ({ page }) => {
  await ready(page);
  await importPgnText(
    page,
    'Custom start',
    '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
  );
  await page.getByRole('tab', { name: 'Training' }).click();
  await expect(page.getByRole('region', { name: 'Openings of this repertoire' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Train all/ })).toBeVisible();
});
```

Check the real button labels before running: the stop button text (`drill.stop` or similar in `en.ts`), `train.all` ("Train all ({n})"?), and `lab.practise` ("Practise {name}"). Adjust the regexes in the test to the English strings, not the app.

Run: `pnpm build; pnpm test:e2e -- -g "album and drills|plain training screen"`
Expected: the first FAILS (no album region); the second may already pass (it pins existing behaviour).

- [ ] **Step 2: i18n**

`en.ts`: `'train.album': 'Openings of this repertoire',` — `it.ts`: `'train.album': 'Aperture di questo repertorio',`

- [ ] **Step 3: `DrillPanel` slot**

Add to Props: `children?: Snippet;` (`import type { Snippet } from 'svelte';`), destructure it, and render it at the end of the `{#if !drill}` branch, after the `{#if totalLines === 0}…{/if}` block:

```svelte
{@render children?.()}
```

- [ ] **Step 4: Wire Training in `+page.svelte`**

Imports: `NameAlbum`, and `buildNameTree`, `repertoireNames` from `@processchess/core`.

Derived state near the other training code:

```ts
const nameTree = $derived(graph ? buildNameTree(graph) : null);
/** The selected repertoire's openings as a name tree (empty for a custom start). */
const repNames = $derived(nameTree && tree ? repertoireNames(tree, nameTree) : null);
async function drillName(name: string | null) {
  if (!tree || !selectedId || !repNames || !name) return;
  const level = repNames.nodeForName(name);
  if (!level) return;
  await ctl.start(selectedId, tree, { throughNodeIds: repNames.nodesOf(level.key) });
}
```

If `ExplorePanel` already builds a name tree, do not build a second one per render: `buildNameTree` is pure; a `$derived` here computes it once per graph.

Training branch (`<DrillPanel …>`): pass the album as children:

```svelte
<DrillPanel …existing props…>
  {#if graph && repNames && repNames.roots.length}
    <section class="album" aria-label={t('train.album')}>
      <NameAlbum
        {graph}
        names={repNames}
        {ucis}
        sideFilter="all"
        summaries={lab.summaries}
        repertoire={lab.repertoire}
        onpractice={(queue, i) => void drillName(queue[i]?.name ?? null)}
        onjump={(u) => goTo(u)}
      />
    </section>
  {/if}
</DrillPanel>
```

- [ ] **Step 5: Run the tests**

Run: `pnpm format; pnpm lint; pnpm typecheck; pnpm build; pnpm test:e2e`
Expected: all pass (31 = 29 + 2).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): training shows the repertoire's openings as an album; ▶ drills them"
```

- [ ] **Step 7: Full check**

Run: `pnpm lint && pnpm typecheck && pnpm -r --no-bail test; pnpm build && pnpm test:e2e`
Expected: only the three known pre-existing generated-file failures; e2e all green.
