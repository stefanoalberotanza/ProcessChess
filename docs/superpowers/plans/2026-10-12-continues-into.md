# "Continues into" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below Explore's by-name list, show the openings of other families reachable by moves
from the board position ("Continues into"), so "No other variations" no longer hides Ruy Lopez
at King's Knight Opening: Normal Variation.

**Architecture:** A pure `continuationsFrom()` in core walks the opening graph breadth-first using
a cached node → name map (`nodeNames`) and stops each path at the first node of another family.
`ExplorePanel` renders the result as rows like the existing ones.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-continues-into-design.md`

## Global Constraints

- No change to `openings.json`, `opening-graph.json` or any generated file; no new dependency.
- `packages/core` pure; no chess.js in `apps/web`; SAN only via core helpers (`playLine`).
- Expected opening names in tests are copied from `data/openings/*.tsv` (verified: C60 Ruy Lopez
  `… 3. Bb5`, C50 Italian Game `… 3. Bc4`, C44 Scotch Game `… 3. d4`,
  C44 King's Knight Opening: Normal Variation `1. e4 e5 2. Nf3 Nc6`).
- Walk depth limit: 12 plies. Ply-1 dataset names (style names) never count as a family.
- Every UI string via `t()`; `lab.continuesInto` in `en.ts` ("Continues into") and `it.ts`
  ("Prosegue in").
- Known unrelated failures on this CRLF checkout: core `dataset.test.ts`, `graph.test.ts` (one
  test each) and db `migrator.test.ts`. They are not to be "fixed" here.

## Review Focus

- From the start position the walk must not explode: results come back quickly (test asserts < 200 ms).
- A transposition reaching an already-seen node is not walked twice (visited set).
- Board at a position that is itself a stop's family (e.g. at Ruy Lopez) → Ruy Lopez not listed.
- Custom-start collection / off-book board → section hidden, no exception.
- Long opening names in the new rows → ellipsis, full name in `title`.

---

### Task 1: `nodeNames` and `continuationsFrom` in core

**Files:**

- Create: `packages/core/src/openings/continuations.ts`
- Create: `packages/core/src/openings/continuations.test.ts`
- Create: `packages/core/src/openings/continuations-unloaded.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './openings/continuations';` after the graph-view export)

**Interfaces:**

- Produces:

  ```ts
  export interface Continuation {
    name: string;
    family: string;
    ucis: string[];
    via: string[];
  }
  export function nodeNames(
    graph: OpeningGraph,
  ): ReadonlyMap<number, { eco: string; name: string }>;
  export function continuationsFrom(graph: OpeningGraph, ucis: readonly string[]): Continuation[];
  ```

- [ ] **Step 1: Write the failing tests** — `continuations.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from './data';
import { type OpeningGraph, loadOpeningGraph } from './graph';
import { continuationsFrom, nodeNames } from './continuations';

// expectations come from data/openings/c.tsv
const NORMAL = ['e2e4', 'e7e5', 'g1f3', 'b8c6']; // King's Knight Opening: Normal Variation

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

describe('nodeNames', () => {
  it('names the graph node of a dataset position', () => {
    const names = nodeNames(graph);
    let node = graph.root;
    for (const uci of NORMAL) node = graph.children(node).find((e) => e.uci === uci)!.child;
    expect(names.get(node)).toEqual({
      eco: 'C44',
      name: "King's Knight Opening: Normal Variation",
    });
    expect(nodeNames(graph)).toBe(names); // cached
  });
});

describe('continuationsFrom', () => {
  it('lists the next openings of other families from Normal Variation', () => {
    const out = continuationsFrom(graph, NORMAL);
    const by = new Map(out.map((c) => [c.name, c]));
    expect(by.get('Ruy Lopez')?.via).toEqual(['f1b5']);
    expect(by.get('Italian Game')?.via).toEqual(['f1c4']);
    expect(by.get('Scotch Game')?.via).toEqual(['d2d4']);
    expect(by.get('Ruy Lopez')?.ucis).toEqual([...NORMAL, 'f1b5']);
  });

  it('never lists the current family and lists each family once', () => {
    const out = continuationsFrom(graph, NORMAL);
    expect(out.some((c) => c.family === "King's Knight Opening")).toBe(false);
    expect(new Set(out.map((c) => c.family)).size).toBe(out.length);
  });

  it('does not list the board position family (at Ruy Lopez)', () => {
    const out = continuationsFrom(graph, [...NORMAL, 'f1b5']);
    expect(out.some((c) => c.family === 'Ruy Lopez')).toBe(false);
  });

  it('skips one-move style names and stays fast from the start', () => {
    const t0 = performance.now();
    const out = continuationsFrom(graph, []);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.via.length >= 2)).toBe(true);
    expect(out.some((c) => c.name === "King's Pawn Game")).toBe(false);
    expect(continuationsFrom(graph, ['e2e4']).every((c) => c.via.length >= 1)).toBe(true);
  });

  it('is empty off book', () => {
    expect(
      continuationsFrom(graph, ['e2e4', 'e7e5', 'e1e2', 'e8e7', 'e2e1', 'e7e8', 'a2a3']),
    ).toEqual([]);
  });

  it('orders by popularity', () => {
    const out = continuationsFrom(graph, NORMAL);
    const lines = out.map((c) => graph.linesThrough(nodeAt(c.ucis)));
    expect(lines).toEqual([...lines].sort((a, b) => b - a));
  });
});

function nodeAt(ucis: readonly string[]): number {
  let node = graph.root;
  for (const uci of ucis) node = graph.children(node).find((e) => e.uci === uci)!.child;
  return node;
}
```

`continuations-unloaded.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadOpeningGraph } from './graph';
import { OpeningsNotLoadedError } from './resolve';
import { nodeNames } from './continuations';

// Separate file: Vitest isolates module state per file, so the dataset is not loaded yet here.
describe('nodeNames without the dataset', () => {
  it('throws until loadOpenings() has resolved', async () => {
    const graph = await loadOpeningGraph();
    expect(() => nodeNames(graph)).toThrow(OpeningsNotLoadedError);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @processchess/core exec vitest run src/openings/continuations`
      Expected: cannot resolve `./continuations`.

- [ ] **Step 3: Implement** — `continuations.ts`

```ts
import { openingIndex } from './data';
import type { OpeningGraph } from './graph';
import { OpeningsNotLoadedError, splitOpeningName } from './resolve';

/** An opening of another family reached by moves from the board position. */
export interface Continuation {
  /** Full dataset name of the first position of that family ("Ruy Lopez"). */
  name: string;
  family: string;
  /** Moves from the initial position to that position. */
  ucis: string[];
  /** Moves from the board position only (the row's move label). */
  via: string[];
}

const MAX_PLIES = 12;
const cache = new WeakMap<OpeningGraph, Map<number, { eco: string; name: string }>>();

/** Graph node → dataset name, built once per graph. Needs `loadOpenings()`. */
export function nodeNames(graph: OpeningGraph): ReadonlyMap<number, { eco: string; name: string }> {
  const hit = cache.get(graph);
  if (hit) return hit;
  const index = openingIndex();
  if (!index) throw new OpeningsNotLoadedError();
  const out = new Map<number, { eco: string; name: string }>();
  for (const [epd, [eco, name]] of index) {
    const node = graph.nodeOf(epd);
    if (node !== undefined) out.set(node, { eco, name });
  }
  cache.set(graph, out);
  return out;
}

/**
 * Openings of other families reachable from the position after `ucis`: breadth-first over the
 * graph, each path stopping at its first named position of another family (ply-1 style names do
 * not count, ADR 012). Each family once, at its shallowest position; most played first.
 */
export function continuationsFrom(graph: OpeningGraph, ucis: readonly string[]): Continuation[] {
  const names = nodeNames(graph);
  const styles = new Set(graph.children(graph.root).map((e) => e.child));
  const familyOf = (node: number): string | null => {
    const named = names.get(node);
    return named && !styles.has(node) ? splitOpeningName(named.name).family : null;
  };

  let start = graph.root;
  let current: string | null = null;
  for (const uci of ucis) {
    const edge = graph.children(start).find((e) => e.uci === uci);
    if (!edge) return [];
    start = edge.child;
    current = familyOf(start) ?? current;
  }

  const found = new Map<string, { node: number; name: string; via: string[] }>();
  const seen = new Set([start]);
  let frontier: { node: number; via: string[] }[] = [{ node: start, via: [] }];
  for (let ply = 1; ply <= MAX_PLIES && frontier.length; ply++) {
    const next: typeof frontier = [];
    const stops: { node: number; family: string; via: string[] }[] = [];
    for (const { node, via } of frontier) {
      for (const e of graph.children(node)) {
        if (seen.has(e.child)) continue;
        seen.add(e.child);
        const path = [...via, e.uci];
        const family = familyOf(e.child);
        if (family !== null && family !== current) stops.push({ node: e.child, family, via: path });
        else next.push({ node: e.child, via: path });
      }
    }
    // shallowest stop per family; at equal depth the most played
    stops.sort((a, b) => graph.linesThrough(b.node) - graph.linesThrough(a.node));
    for (const s of stops) {
      if (!found.has(s.family))
        found.set(s.family, { node: s.node, name: names.get(s.node)!.name, via: s.via });
    }
    frontier = next;
  }

  return [...found.entries()]
    .sort(
      ([fa, a], [fb, b]) =>
        graph.linesThrough(b.node) - graph.linesThrough(a.node) || fa.localeCompare(fb),
    )
    .map(([family, f]) => ({ name: f.name, family, ucis: [...ucis, ...f.via], via: f.via }));
}
```

- [ ] **Step 4: Run, expect PASS** — same command, then `pnpm --filter @processchess/core typecheck`.
      If the "fast from the start" test fails on time, profile before changing the limit; record a
      ruling.
- [ ] **Step 5: Commit** — `git add packages/core/src && git commit -m "feat(core): continuationsFrom, openings reachable from a position"`

---

### Task 2: "Continues into" section in Explore

**Files:**

- Modify: `apps/web/src/lib/components/ExplorePanel.svelte` (script: imports + derived; markup: after the by-name `</section>`)
- Modify: `apps/web/src/lib/i18n/en.ts`, `apps/web/src/lib/i18n/it.ts` (next to `lab.byName`)
- Modify: `apps/web/e2e/drill.spec.ts` (new test after "opening lab: levels follow the board…")

**Interfaces:**

- Consumes: `continuationsFrom`, `Continuation` from `@processchess/core` (Task 1);
  existing `openingLine`, `playLine`, `INITIAL_FEN`, `moverOfLast`, `lineKey`, `Mastery`,
  `SideMark`, props `onjump(ucis)`, `onpractice(queue: LabItem[], i)`.

- [ ] **Step 1: Failing e2e** — append to `apps/web/e2e/drill.spec.ts`:

```ts
test('opening lab: continues into other openings from the board position', async ({ page }) => {
  await ready(page);
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) await playSan(page, san);
  await expect(page.getByTestId('opening-bar')).toContainText('Normal Variation');
  const next = page.getByRole('list', { name: 'Continues into' });
  const ruy = next.getByRole('button', { name: 'Open Ruy Lopez', exact: true });
  await expect(ruy).toContainText('3.Bb5');
  await expect(next.getByRole('button', { name: /^Open King's Knight Opening/ })).toHaveCount(0);
  await ruy.click();
  await expect(page.getByTestId('opening-bar')).toContainText('Ruy Lopez');
});
```

Run `pnpm build && pnpm test:e2e -g "continues into"` → FAIL (list not found).

- [ ] **Step 2: i18n** — `en.ts`: `'lab.continuesInto': 'Continues into',`; `it.ts`: `'lab.continuesInto': 'Prosegue in',`.

- [ ] **Step 3: Script** — add `continuationsFrom` to the `@processchess/core` import, then:

```ts
/** Openings of other families reached by moves from the board position. */
const continuations = $derived(graph ? continuationsFrom(graph, ucis) : []);
const nextItems = $derived<LabItem[]>(
  graph
    ? continuations.map((c) => ({
        line: openingLine(graph!, c.ucis),
        eco: null,
        name: c.name,
        side: moverOfLast(c.ucis),
      }))
    : [],
);
/** "3.Bb5" / "3…Nf6 4.d4" for moves played after `ucis`. */
function viaLabel(c: Continuation): string {
  const san = playLine(INITIAL_FEN, c.ucis)?.san ?? [];
  return san
    .slice(ucis.length)
    .map((m, i) => {
      const ply = ucis.length + i;
      return ply % 2 === 0 ? `${ply / 2 + 1}.${m}` : i === 0 ? `${(ply + 1) / 2}…${m}` : m;
    })
    .join(' ');
}
```

(`ucis` is always from the initial position — ExplorePanel prop doc — and `LabItem.eco` is
`string | null`, so no extra guard is needed.)

- [ ] **Step 4: Markup** — after the by-name `</section>`:

```svelte
  {#if nextItems.length}
    <section aria-labelledby="continues-into">
      <h3 id="continues-into">{t('lab.continuesInto')}</h3>
      <ul class="list" aria-label={t('lab.continuesInto')}>
        {#each continuations as c, i (c.family)}
          <li class="row">
            <button
              type="button"
              class="enter"
              onclick={() => onjump(c.ucis)}
              aria-label={t('lab.enter', { name: c.name })}
            >
              <SideMark side={nextItems[i]!.side} />
              <span class="line-hint">{viaLabel(c)}</span>
              <span class="label" title={c.name}>{c.name}</span>
            </button>
            <Mastery summary={summaries.get(lineKey(nextItems[i]!.line))} />
            <button
              type="button"
              class="play"
              onclick={() => onpractice(nextItems, i)}
              aria-label={t('lab.practise', { name: c.name })}
              title={t('lab.practise', { name: c.name })}>▶</button
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}
```

- [ ] **Step 5: Verify** — `pnpm --filter @processchess/web typecheck`; `pnpm build && pnpm test:e2e` → all pass (16).
- [ ] **Step 6: Commit** — `git add apps/web && git commit -m "feat(web): continues into, openings reachable from the board"`

---

### Task 3: ADR addendum and full gate

**Files:**

- Modify: `docs/adr/012-opening-classification.md` (append section)

- [ ] **Step 1: Append to ADR 012:**

```markdown
**Continues into (2026-10-12).** The by-name tree stays name-based, so a level can have no
sub-variations while other openings are played from its position (King's Knight Opening: Normal
Variation → Ruy Lopez, Italian Game, Scotch Game). Explore shows them below the by-name list as
"Continues into": `continuationsFrom(graph, ucis)` walks the opening graph breadth-first (EPD
nodes, transpositions merged; at most 12 plies) and stops each path at the first named position
of another family; ply-1 style names do not count. Names come from a node → name map built once
from the dataset; no generated file changes.
```

- [ ] **Step 2: Full gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
      Expected: only the three known CRLF failures in `pnpm test`; everything else green.
- [ ] **Step 3: Commit** — `git commit -am "docs(adr): 012 continues into"`
