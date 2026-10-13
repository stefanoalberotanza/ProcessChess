# Readability and Progress Roll-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ECO codes from the UI, make opening names the readable primary text, and show
mastered/total progress on family and subfamily rows of the Explore name tree.

**Architecture:** A pure `rollupMastery()` in `packages/core/src/lab/names.ts` counts lines under
a name-tree node; a new `MasteryRollup.svelte` draws it in `ExplorePanel`. ECO removal and
readability are CSS/markup edits in four components plus two e2e assertions.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5 runes), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-readability-progress-design.md`

## Global Constraints

- `eco` stays in core data/types; only the UI stops showing it. No generated file is edited.
- Every UI string through `t()`; new keys added to `en.ts` and `it.ts` together.
- `packages/core` stays pure; the web app does not import chess.js.
- No new dependencies.
- Gate before done: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

## Review Focus

- A family whose descendants were never run → `0/N`, all-grey bar, not `NaN` or an empty bar.
- A node with no countable lines (total 0) → roll-up hidden, no division by zero.
- A streak above the threshold still counts as mastered (`>=`, not `===`).
- Long names in narrow rows → ellipsis, row height unchanged, full name in `title`.
- Practise/enter buttons' accessible names no longer contain an ECO prefix (tested in Task 3).

---

### Task 1: `rollupMastery` in core

**Files:**

- Modify: `packages/core/src/lab/names.ts` (append after `buildNameTree`)
- Test: `packages/core/src/lab/rollup.test.ts` (new)

**Interfaces:**

- Produces:

  ```ts
  export interface MasteryRollup {
    total: number;
    mastered: number;
    started: number;
  }
  export function rollupMastery(
    tree: Pick<NameTree, 'get'>,
    key: string,
    streakOf: (node: NameNode) => number | undefined,
    masteredStreak: number,
  ): MasteryRollup;
  ```

  Exported through `packages/core/src/lab/index.ts` (already `export * from './names'`).

- [ ] **Step 1: Write the failing test** — `packages/core/src/lab/rollup.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { type NameNode, rollupMastery } from './names';

function node(key: string, kind: NameNode['kind'], children: string[] = []): NameNode {
  return {
    kind,
    key,
    label: key,
    depth: 0,
    parent: null,
    children,
    own: true,
    eco: '',
    ucis: [],
    lines: 1,
    side: 'w',
    style: null,
  };
}

// family F › subfamily S › variations V1, V2; family F also holds variation V3
const nodes = new Map<string, NameNode>([
  ['F', node('F', 'family', ['S', 'V3'])],
  ['S', node('S', 'subfamily', ['V1', 'V2'])],
  ['V1', node('V1', 'variation')],
  ['V2', node('V2', 'variation')],
  ['V3', node('V3', 'variation')],
]);
const tree = { get: (k: string) => nodes.get(k) };

describe('rollupMastery', () => {
  it('counts every non-family node below and including the key', () => {
    expect(rollupMastery(tree, 'F', () => undefined, 3)).toEqual({
      total: 4,
      mastered: 0,
      started: 0,
    });
  });

  it('separates mastered from started, threshold inclusive', () => {
    const streaks: Record<string, number> = { S: 0, V1: 3, V2: 5, V3: 2 };
    expect(rollupMastery(tree, 'F', (n) => streaks[n.key], 3)).toEqual({
      total: 4,
      mastered: 2,
      started: 4,
    });
  });

  it('rolls up a subfamily on its own', () => {
    expect(rollupMastery(tree, 'S', (n) => (n.key === 'V1' ? 3 : undefined), 3)).toEqual({
      total: 3,
      mastered: 1,
      started: 1,
    });
  });

  it('is empty for an unknown key or a lone family', () => {
    const lone = { get: (k: string) => (k === 'X' ? node('X', 'family') : undefined) };
    expect(rollupMastery(lone, 'X', () => 9, 3)).toEqual({ total: 0, mastered: 0, started: 0 });
    expect(rollupMastery(tree, 'nope', () => 9, 3)).toEqual({ total: 0, mastered: 0, started: 0 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @processchess/core exec vitest run src/lab/rollup.test.ts`
      Expected: `rollupMastery is not a function` / export missing.

- [ ] **Step 3: Implement** — append to `packages/core/src/lab/names.ts`:

```ts
/** Lines below (and including) a name-tree node: how many were run, how many are automatic. */
export interface MasteryRollup {
  total: number;
  mastered: number;
  started: number;
}

/**
 * Progress of a name-tree level. Every non-family node is one practice line; `streakOf` gives its
 * clean streak (undefined when never run) and `masteredStreak` the streak that counts as automatic.
 */
export function rollupMastery(
  tree: Pick<NameTree, 'get'>,
  key: string,
  streakOf: (node: NameNode) => number | undefined,
  masteredStreak: number,
): MasteryRollup {
  const out: MasteryRollup = { total: 0, mastered: 0, started: 0 };
  const stack = [key];
  const seen = new Set<string>();
  while (stack.length) {
    const n = tree.get(stack.pop()!);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    stack.push(...n.children);
    if (n.kind === 'family') continue;
    out.total++;
    const streak = streakOf(n);
    if (streak === undefined) continue;
    out.started++;
    if (streak >= masteredStreak) out.mastered++;
  }
  return out;
}
```

- [ ] **Step 4: Run, expect PASS** — same command; then `pnpm --filter @processchess/core typecheck`.
- [ ] **Step 5: Commit** — `git add packages/core/src/lab && git commit -m "feat(core): rollupMastery for name-tree levels"`

---

### Task 2: `MasteryRollup.svelte` and roll-up in Explore

**Files:**

- Create: `apps/web/src/lib/components/MasteryRollup.svelte`
- Modify: `apps/web/src/lib/components/ExplorePanel.svelte` (focus head ~line 233, level rows ~line 266)
- Modify: `apps/web/src/lib/i18n/en.ts`, `apps/web/src/lib/i18n/it.ts` (next to `lab.streak`)

**Interfaces:**

- Consumes: `rollupMastery`, `MasteryRollup`, `NameNode` from `@processchess/core`;
  `MASTERED_STREAK`, `lineKey` from `$lib/lab.svelte`; `openingLine` (already used in ExplorePanel).
- Produces: `<MasteryRollup rollup={MasteryRollup} />` with `data-testid="mastery-rollup"`.

- [ ] **Step 1: i18n keys**
  - `en.ts`: `'lab.rollup': '{mastered} of {total} lines automatic ({started} practised)',`
  - `it.ts`: `'lab.rollup': '{mastered} di {total} linee automatiche ({started} provate)',`

- [ ] **Step 2: Component** — `MasteryRollup.svelte`

```svelte
<!-- Progress of a whole name level: automatic lines out of all lines below it. -->
<script lang="ts">
  import type { MasteryRollup } from '@processchess/core';
  import { t } from '$lib/i18n/index.svelte';

  let { rollup }: { rollup: MasteryRollup } = $props();
  const pct = (n: number) => `${(100 * n) / rollup.total}%`;
  const text = $derived(t('lab.rollup', { ...rollup }));
</script>

{#if rollup.total > 0}
  <span class="rollup" title={text} aria-label={text} data-testid="mastery-rollup">
    <span class="bar" aria-hidden="true">
      <span class="mastered" style:width={pct(rollup.mastered)}></span>
      <span class="started" style:width={pct(rollup.started - rollup.mastered)}></span>
    </span>
    <span class="count" aria-hidden="true">{rollup.mastered}/{rollup.total}</span>
  </span>
{/if}

<style>
  .rollup {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .bar {
    display: flex;
    width: 3rem;
    height: 0.35rem;
    border-radius: 2px;
    background: #d6d9de;
    overflow: hidden;
  }
  .mastered {
    background: #2e7d32;
  }
  .started {
    background: #e0a800;
  }
</style>
```

- [ ] **Step 3: Wire into ExplorePanel** — in `<script>` add imports and a helper:

```ts
import { rollupMastery } from '@processchess/core'; // add to the existing core import
import MasteryRollup from '$lib/components/MasteryRollup.svelte';
import { MASTERED_STREAK } from '$lib/lab.svelte'; // add to the existing lab import

const rollupOf = (n: NameNode) =>
  rollupMastery(
    names!,
    n.key,
    (m) => summaries.get(lineKey(openingLine(graph!, m.ucis)))?.cleanStreak,
    MASTERED_STREAK,
  );
```

In the level row, right after the enter `</button>`, replace the line
`{#if n.kind !== 'family'}` (the one wrapping `<Mastery …/>` and the ▶ button) with:

```svelte
{#if n.children.length}<MasteryRollup rollup={rollupOf(n)} />{/if}
{#if n.kind !== 'family'}
```

In the focus head, after the existing `{#if focus.kind !== 'family'}<Mastery …/>{/if}` add
`{#if focus.children.length}<MasteryRollup rollup={rollupOf(focus)} />{/if}`.

- [ ] **Step 4: Verify** — `pnpm --filter @processchess/web typecheck` (0 errors) and
      `pnpm --filter @processchess/web dev`, open Explore: family rows show `0/N` with a grey bar.
- [ ] **Step 5: Commit** — `git commit -am "feat(web): mastery roll-up on name-tree levels"` (plus `git add` of the new component).

---

### Task 3: Remove ECO codes and improve name readability

**Files:**

- Modify: `apps/web/src/lib/components/ExplorePanel.svelte` (lines ~183, 191-192, 237, 276, 325-336, `.eco` style ~489, `.label` style)
- Modify: `apps/web/src/lib/components/GraphPanel.svelte` (lines 63, 114, `.eco` style 202-206)
- Modify: `apps/web/src/lib/components/OpeningBar.svelte` (lines 46, 54, `.eco` style ~91)
- Modify: `apps/web/src/lib/components/LabPanel.svelte` (line 30)
- Modify: `apps/web/e2e/drill.spec.ts` (lines 104, 257, 260)

- [ ] **Step 1: Update e2e expectations first**
  - line 104: `await expect(bar).toContainText('B90');` → `await expect(bar).not.toContainText('B90');`
  - line 257: `/^e4 — B00 King's Pawn Game/` → `/^e4 — King's Pawn Game/`
  - line 260 stays (already asserts no `B00`).
  - Add after line 102 (the search click):
    ```ts
    await expect(page.getByRole('button', { name: /^Practise B\d\d/ })).toHaveCount(0);
    ```

- [ ] **Step 2: Remove ECO markup**
  - ExplorePanel: delete the three `<span class="eco">…</span>` lines; change
    `` `${it.eco} ${it.name}` `` to `it.name ?? ''` (both aria-label and title);
    line 325-326 to `title={m.name || undefined}>{m.name ? relativeName(m.name) : ''}`;
    line 336 to `` name: `${m.san}${m.name ? ` (${m.name})` : ''}` ``; delete the `.eco { … }` rule.
  - GraphPanel: line 63 → `if (n.name) parts.push(n.name);`; delete line 114 and the `.eco` rule.
  - OpeningBar: delete both `<span class="eco">` lines and the `.eco` rule.
  - LabPanel: line 30 → `<h3>{item.name ?? t('lab.unnamed')}</h3>`.
  - Leave the `eco` fields in `LabItem` objects untouched (core type).

- [ ] **Step 3: Readability CSS** — in ExplorePanel's `.label` rule (and OpeningBar's name span rule) set:

```css
.label {
  color: var(--text, inherit);
  font-size: 0.95rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Add `title={…the full name…}` to every `.label` span that lacks one (search result, level row:
`title={nameOf(n)}`). Ensure the parent `.enter` button has `min-width: 0` so ellipsis works.

- [ ] **Step 4: Verify** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`; all pass.
      Grep check: `grep -rn "\.eco\|class=\"eco\"" apps/web/src` returns nothing.
- [ ] **Step 5: Commit** — `git commit -am "feat(web): drop ECO codes, readable opening names"`

---

### Task 4: E2E for the roll-up

**Files:**

- Modify: `apps/web/e2e/drill.spec.ts` (or the lab spec where a lab run is completed; search `lab-progress`)

- [ ] **Step 1: Add assertion** — in the existing test that completes a lab run, after completion, open
      Explore at the top level and assert:

```ts
const rollup = page.getByTestId('mastery-rollup').first();
await expect(rollup).toBeVisible();
await expect(rollup).toHaveAccessibleName(/^\d+ of \d+ lines automatic \([1-9]\d* practised\)$/);
```

- [ ] **Step 2: Run** — `pnpm build && pnpm test:e2e`; PASS.
- [ ] **Step 3: Commit** — `git commit -am "test(web): e2e for mastery roll-up"`
