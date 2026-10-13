# Practice Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Practice lines stop before the next differently named position, and only `variation`
nodes are practised (families and subfamilies are containers).

**Architecture:** New `practiceLine()` in `packages/core/src/lab/lab.ts` (uses `nodeNames` from
`openings/continuations.ts`) replaces `openingLine` in every lab use; `rollupMastery` and
`dailyMix` filter `kind === 'variation'`; `ExplorePanel` treats subfamilies like families.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-practice-lines-design.md`

## Global Constraints

- Expected names/moves copied from `data/openings/b.tsv` (verified: `Caro-Kann Defense` at
  `1. e4 c6`, `… 2. Nc3`, `… 2. Nc3 d5`, `… 2. d4`, `… 2. d4 d5`; `Caro-Kann Defense: Advance
Variation` at `1. e4 c6 2. d4 d5 3. e5`; `…, Bayonet Attack` at `… 3. e5 Bf5 4. g4`;
  `…, Botvinnik-Carls Defense` at `… 3. e5 c5`).
- Cap `PRACTICE_MAX_PLIES = 16`.
- No DB/schema/generated-file change; lab runs are append-only (no migration).
- `openingLine` stays exported (`graph.test.ts` uses it for a book-position check); no lab or
  web code calls it any more.
- Format with `pnpm exec prettier --write --end-of-line auto <paths>`; never `pnpm format`.
- Known CRLF failures: core `dataset.test.ts`, `graph.test.ts`; db `migrator.test.ts`.

## Review Focus

- A name whose dataset rows repeat on several positions (Caro-Kann Defense ×5) walks through
  them and stops only at a different name.
- A stored daily mix (localStorage `pc.mix`) holding subfamily picks from before → rebuilt.
- Search results / "Continues into" entries that are subfamilies → no ▶, no dots, click still
  moves the board.
- e2e tests that practised a subfamily (e.g. "Sicilian Defense", the first entry of a family)
  must now practise a variation.
- The lab session itself (`LabController.start(queue)`) receives only variation items.

---

### Task 1: `practiceLine` in core

**Files:** Modify `packages/core/src/lab/lab.ts`; create `packages/core/src/lab/practice-line.test.ts`

**Interfaces — Produces:** `export const PRACTICE_MAX_PLIES = 16;`
`export function practiceLine(graph: OpeningGraph, ucis: readonly string[]): string[]`

- [ ] **Step 1: Failing tests** — `practice-line.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenings } from '../openings/data';
import { nodeNames } from '../openings/continuations';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { PRACTICE_MAX_PLIES, practiceLine } from './lab';

// expectations come from data/openings/b.tsv
const ADVANCE = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5']; // Caro-Kann Defense: Advance Variation

let graph: OpeningGraph;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
});

function nameAt(ucis: readonly string[]): string | undefined {
  let node = graph.root;
  for (const u of ucis) {
    const e = graph.children(node).find((x) => x.uci === u);
    if (!e) return undefined;
    node = e.child;
  }
  return nodeNames(graph).get(node)?.name;
}

describe('practiceLine', () => {
  it('starts with the name and never enters another name', () => {
    const line = practiceLine(graph, ADVANCE);
    expect(line.slice(0, ADVANCE.length)).toEqual(ADVANCE);
    for (let i = ADVANCE.length + 1; i <= line.length; i++) {
      const name = nameAt(line.slice(0, i));
      expect(name === undefined || name === 'Caro-Kann Defense: Advance Variation').toBe(true);
    }
  });

  it('walks through positions repeating the same name', () => {
    // 1.e4 c6 is "Caro-Kann Defense"; 2.d4 and 2...d5 carry the same name
    const line = practiceLine(graph, ['e2e4', 'c7c6']);
    expect(line.length).toBeGreaterThan(2);
    for (let i = 3; i <= line.length; i++) {
      const name = nameAt(line.slice(0, i));
      expect(name === undefined || name === 'Caro-Kann Defense').toBe(true);
    }
  });

  it('gives different names different lines across the whole dataset', () => {
    const byLine = new Map<string, string>();
    for (const [node, { name }] of nodeNames(graph)) {
      const line = practiceLine(graph, graph.pathTo(node)).join(' ');
      const other = byLine.get(line);
      if (other !== undefined) expect(other, line).toBe(name);
      else byLine.set(line, name);
    }
  });

  it('keeps off-book input and respects the cap', () => {
    const off = ['h2h4', 'h7h5', 'h1h3'];
    expect(practiceLine(graph, off)).toEqual(off);
    for (const [node] of nodeNames(graph)) {
      const path = graph.pathTo(node);
      expect(practiceLine(graph, path).length).toBeLessThanOrEqual(
        Math.max(path.length, PRACTICE_MAX_PLIES),
      );
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @processchess/core exec vitest run src/lab/practice-line.test.ts` (no export `practiceLine`).
- [ ] **Step 3: Implement** — in `lab.ts`, import `nodeNames` from `'../openings/continuations'` and add after `openingLine`:

```ts
export const PRACTICE_MAX_PLIES = 16;

/**
 * The line practised for a name: its moves, extended along the most played book moves while the
 * next position is unnamed or carries the same name, stopping before any other name (so two names
 * never share a line). At most `PRACTICE_MAX_PLIES`; a longer input is kept whole. Needs
 * `loadOpenings()`.
 */
export function practiceLine(graph: OpeningGraph, ucis: readonly string[]): string[] {
  const names = nodeNames(graph);
  const line = [...ucis];
  let node = graph.root;
  let own: string | undefined;
  for (const u of ucis) {
    const edge = graph.children(node).find((e) => e.uci === u);
    if (!edge) return line;
    node = edge.child;
    own = names.get(node)?.name ?? own;
  }
  while (line.length < PRACTICE_MAX_PLIES) {
    const next: GraphEdge | undefined = graph.children(node)[0];
    if (!next) break;
    const name = names.get(next.child)?.name;
    if (name !== undefined && name !== own) break;
    line.push(next.uci);
    node = next.child;
  }
  return line;
}
```

If importing `continuations` from `lab` creates an import cycle error, move `nodeNames` into
`packages/core/src/openings/names-index.ts` and re-export it from `continuations.ts`; ledger it.

- [ ] **Step 4: Run, expect PASS**; if the uniqueness test fails, print the colliding pair and
      debug (systematic-debugging) — do not weaken the test. Core typecheck.
- [ ] **Step 5: `practiceByName` uses `practiceLine`** (replace the `openingLine(graph, o.ucis)`
      call; update its doc comment and `PracticeItem.line` doc to "see `practiceLine`"). Update the
      `lab.test.ts` expectation that compares with `openingLine(graph, popular.ucis)` to
      `practiceLine`. Run `pnpm --filter @processchess/core exec vitest run src/lab` → pass.
- [ ] **Step 6: Commit** — `feat(core): practiceLine stops before the next name`

---

### Task 2: Only variations are practised (core)

**Files:** Modify `packages/core/src/lab/names.ts` (`rollupMastery`), `packages/core/src/lab/mix.ts`
(`dailyMix`), `rollup.test.ts`, `mix.test.ts`

- [ ] **Step 1: Failing tests**
  - `rollup.test.ts`: change the first expectation — the subfamily `S` is a container now:
    `rollupMastery(tree, 'F', () => undefined, 3)` → `{ total: 3, mastered: 0, started: 0 }`;
    in "separates mastered from started" → `{ total: 3, mastered: 2, started: 3 }` (S excluded);
    in "rolls up a subfamily on its own" → `{ total: 2, mastered: 1, started: 1 }`.
  - `mix.test.ts`: add

```ts
it('offers variations only, never subfamilies', () => {
  for (const s of [0, 1, 2]) {
    expect(mix(withHistory, { shuffle: s }).every((e) => e.node.kind === 'variation')).toBe(true);
    expect(mix(() => undefined, { shuffle: s }).every((e) => e.node.kind === 'variation')).toBe(
      true,
    );
  }
});
```

    and in "without history draws from the most popular variations" change the bound to
    `toBeGreaterThanOrEqual(6)` (the subfamilies A, B, C with 100 lines leave the top 15:
    *0..*4 → 10..6). In "never repeats a node and is capped by the candidates" the small tree is
    `F, A(subfamily), A0` → expected `['A0']`.

Run → FAIL.

- [ ] **Step 2: Implement** — `names.ts` `rollupMastery`: replace `if (n.kind === 'family') continue;`
      with `if (n.kind !== 'variation') continue;` and its doc ("Every variation is one practice line").
      `mix.ts`: `.filter((n) => n.kind !== 'family')` → `.filter((n) => n.kind === 'variation')`.
- [ ] **Step 3: Run** `pnpm --filter @processchess/core exec vitest run src/lab` → pass; typecheck.
- [ ] **Step 4: Commit** — `feat(core): only variations are practised; subfamilies are containers`

---

### Task 3: Web — practice lines and subfamilies as containers

**Files:** Modify `ExplorePanel.svelte`, `DailyMix.svelte`, `apps/web/e2e/drill.spec.ts`

- [ ] **Step 1: e2e first**
  - New test:

```ts
test('subfamilies are containers; a variation run does not tick its neighbours', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('searchbox').fill('Caro-Kann Defense');
  await page
    .getByRole('list', { name: 'Openings found' })
    .getByRole('button', { name: 'Open Caro-Kann Defense', exact: true })
    .first()
    .click();
  const focusCard = page.getByTestId('lab-focus');
  await expect(focusCard).toContainText('Caro-Kann Defense');
  await expect(focusCard.getByRole('button', { name: /^Practise/ })).toHaveCount(0);
  await expect(focusCard.getByTestId('mastery-rollup')).toBeVisible();

  // practise the Advance Variation to the end
  const variations = page.getByRole('list', { name: 'Variations of Caro-Kann Defense' });
  await variations
    .getByRole('button', { name: 'Open Caro-Kann Defense: Advance Variation', exact: true })
    .click();
  const sans = (await focusCard.locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard
    .getByRole('button', { name: 'Practise Caro-Kann Defense: Advance Variation' })
    .click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  await page.getByRole('button', { name: 'Back to the list' }).click();
  // its own sub-variations are untouched (the list title uses the level's short label)
  const subs = page.getByRole('list', { name: 'Variations of Advance Variation' });
  for (const m of await subs.getByTestId('mastery').all())
    await expect(m).toHaveAccessibleName('Not practised yet');
});
```

- Existing tests that practise or expect a ▶ on a subfamily: "practise by name, rebuild the
  moves…" (first entry of King's Pawn Games), "White and Black openings are marked…"
  (`Practise Sicilian Defense`), "out of theory… (Indian Defense)", "levels follow the board"
  if it practises. For each, switch to a variation of the same opening (e.g. enter the
  subfamily and take its first variation row, or search a dataset variation name such as
  "Sicilian Defense: Najdorf Variation") and keep the test's intent; ledger each change.
  Run `pnpm build && pnpm test:e2e` → the new test fails (subfamily still practisable).
- [ ] **Step 2: ExplorePanel**
  - import `practiceLine` instead of `openingLine`; replace the four `openingLine(` calls with
    `practiceLine(`.
  - add `const isVariation = (name: string | null) => !!name && names?.nodeForName(name)?.kind === 'variation';`
  - focus card and level rows: every `focus.kind !== 'family'` / `n.kind !== 'family'` that guards
    `Mastery`, ▶, "Practise this opening" becomes `=== 'variation'`; guards for `SideMark` stay
    `!== 'family'`; `sanLine(focus.kind === 'family' ? …)` → `focus.kind === 'variation' ? focusItem.line : focus.ucis`
    reversed accordingly (containers show their own moves). Containers with children show
    `MasteryRollup` (already, via `children.length`).
  - search results and "Continues into" rows: wrap `Mastery` + ▶ in `{#if isVariation(it.name)}`
    / `{#if isVariation(c.name)}`.
  - practice queues passed to `onpractice` contain variations only: build `searchItems`,
    `nextItems` as today but call `onpractice(queue.filter((x) => isVariation(x.name)), j)` with
    the index `j` of the clicked item inside the filtered queue.
- [ ] **Step 3: DailyMix** — `openingLine` → `practiceLine`; when reading stored picks, drop
      them (rebuild) if any `names.get(p.key)?.kind !== 'variation'`.
- [ ] **Step 4: Verify** — eslint, typecheck, `pnpm build && pnpm test:e2e` (all pass, run twice).
- [ ] **Step 5: Commit** — `feat(web): practise variations only; lines stop before the next name`

---

### Task 4: ADR and full gate

- [ ] Append to `docs/adr/011-opening-lab.md`:

```markdown
**Practice lines and containers (2026-10-12).** A practice line no longer pads every name to 8
plies along the most played moves, which made a short name practise one of its descendants
(Caro-Kann Defense ran into a Caro-Kann variation, and one run ticked both). `practiceLine`
extends a name only while the next position is unnamed or has the same name, and stops before
any other name, so two names never share a line. Families and subfamilies are containers: only
variations are practised, and container progress is the roll-up of their variations. Old lab
runs on changed lines stay in the log and no longer count.
```

- [ ] Full gate: eslint, prettier check (`--end-of-line auto` on apps packages docs), typecheck,
      core/db tests (only known CRLF failures), `pnpm build && pnpm test:e2e`.
- [ ] Commit — `docs(adr): 011 practice lines and containers`
