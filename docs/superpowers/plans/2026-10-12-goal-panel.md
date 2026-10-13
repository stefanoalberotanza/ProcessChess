# Goal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Openings panel as approved (direction B): a goal card with the next mix
entry and "Practise now", the other mix entries below, search without ECO, and "By name" /
"Continues into · N" as tabs with plain-text roll-ups.

**Architecture:** One pure helper `mixNext()` in core decides the next entry / all done.
`DailyMix.svelte` is restyled into the goal card; `ExplorePanel.svelte` wraps the two existing
sections in a tab list without renaming them (their regions keep their accessible names);
`MasteryRollup.svelte` renders text.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-goal-panel-design.md`

## Global Constraints

- No change to `dailyMix()`, storage, or generated files; no new dependency.
- The app has no dark mode: chip colours are new tokens in the existing `:global(:root)` block of
  `apps/web/src/routes/+layout.svelte` (`--chip-almost-bg #fff3cd`, `--chip-almost-fg #8a6100`,
  `--chip-review-bg #e3f2e5`, `--chip-review-fg #2e7d32`, `--chip-new-bg #e6efff`,
  `--chip-new-fg #2f6fb5`).
- i18n en / it (add together): `mix.goal` Today's goal / Obiettivo di oggi; `mix.start` Start
  here / Inizia da qui; `mix.progress` (changed) {done} of {total} variations done / {done} di
  {total} varianti fatte; `mix.firstDay` {total} popular openings to try / {total} aperture
  popolari da provare; `mix.next` Next / Prossima; `mix.practiseNow` Practise now / Allena ora;
  `mix.allDone` All done for today / Tutto fatto per oggi; `lab.rollupShort` {mastered} /
  {total} lines / {mastered} / {total} linee; `explore.searchPlaceholder` (changed) Search an
  opening (e.g. Najdorf) / Cerca un’apertura (es. Najdorf).
- Accessible names kept: list "Daily mix" (`mix.title`), regions "Practise by name" and
  "Continues into", list "Continues into".
- Format with `pnpm exec prettier --write --end-of-line auto <paths>` only (never `pnpm format`).
- Known CRLF failures: core `dataset.test.ts`, `graph.test.ts`; db `migrator.test.ts`.

## Review Focus

- First day (no history): card says "Start here" / "{total} popular openings to try".
- Next entry done → card advances; all done → "All done for today" and the button is Change.
- "Continues into" empty (custom start, off book) → tab disabled, By name shown even if the
  Continues tab was selected before.
- Long names in the card and rows → ellipsis, full name in `title`.
- Keyboard: tabs reachable and switchable with Enter/Space (buttons), `aria-selected` correct.

---

### Task 1: `mixNext` in core

**Files:** Modify `packages/core/src/lab/mix.ts`, `packages/core/src/lab/mix.test.ts`

**Interfaces — Produces:** `export function mixNext(done: readonly boolean[]): number` — index of
the first entry not done, `-1` when all are done or the mix is empty.

- [ ] **Step 1: Failing test** — append to `mix.test.ts` (add `mixNext` to the import):

```ts
describe('mixNext', () => {
  it('is the first entry not done', () => {
    expect(mixNext([false, false])).toBe(0);
    expect(mixNext([true, false, false])).toBe(1);
    expect(mixNext([true, true, false, true])).toBe(2);
  });
  it('is -1 when everything is done or the mix is empty', () => {
    expect(mixNext([true, true, true, true, true])).toBe(-1);
    expect(mixNext([])).toBe(-1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @processchess/core exec vitest run src/lab/mix.test.ts` (mixNext is not a function).
- [ ] **Step 3: Implement** — append to `mix.ts`:

```ts
/** The mix entry to practise next: the first not done today; -1 when all are done. */
export function mixNext(done: readonly boolean[]): number {
  return done.indexOf(false);
}
```

- [ ] **Step 4: Run, expect PASS**; core typecheck.
- [ ] **Step 5: Commit** — `feat(core): mixNext, the next entry of the daily mix`

---

### Task 2: Goal card (`DailyMix.svelte`)

**Files:** Modify `apps/web/src/lib/components/DailyMix.svelte`, `apps/web/src/routes/+layout.svelte`
(tokens), `en.ts`, `it.ts`, `apps/web/e2e/drill.spec.ts` (two daily-mix tests)

**Interfaces — Consumes:** `mixNext` (Task 1); existing `entries`, `items`, `doneToday`, `change`,
`onpractice`, `onjump` in DailyMix.

- [ ] **Step 1: Update e2e first** — in test "daily mix: five variations…":
  - replace the first block (count 5 / rows / reload / Change) with:

```ts
const card = page.getByTestId('mix-card');
const mixList = page.getByRole('list', { name: 'Daily mix' });
await expect(card).toContainText('Start here');
await expect(card).toContainText('5 popular openings to try');
await expect(mixList.getByRole('listitem')).toHaveCount(4);
const snapshot = async () =>
  [
    await card.getByTestId('mix-next-name').textContent(),
    ...(await mixList.getByRole('listitem').allTextContents()),
  ].join('|');
const first = await snapshot();
await page.reload();
await expect(mixList.getByRole('listitem')).toHaveCount(4);
expect(await snapshot()).toEqual(first);
await card.getByRole('button', { name: 'Change' }).click();
await expect.poll(snapshot).not.toEqual(first);
```

- at the end, replace the "almost there" row assertion with: the practised opening is either
  the card's next entry or a row, and carries the chip:

```ts
const where = page
  .getByTestId('mix-card')
  .or(mixList.getByRole('listitem').filter({ has: page.getByTitle(name, { exact: true }) }))
  .filter({ hasText: name });
await expect(where.first()).toContainText('almost there');
```

- in test 'daily mix: "Change" after midnight…' change the count line to
  `await expect(page.getByTestId('mix-card')).toBeVisible();` and click
  `page.getByTestId('mix-card').getByRole('button', { name: 'Change' })`.
- new test:

```ts
test('daily mix: practise now, then the card moves to the next entry', async ({ page }) => {
  await ready(page);
  const card = page.getByTestId('mix-card');
  const name = (await card.getByTestId('mix-next-name').textContent())!.trim();
  // read the practice line from the opening's focus card (mix names are dataset names)
  await page.getByRole('searchbox').fill(name);
  await page
    .getByRole('list', { name: 'Openings found' })
    .getByRole('button', { name: `Open ${name}`, exact: true })
    .first()
    .click();
  const sans = (await page.getByTestId('lab-focus').locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await card.getByRole('button', { name: 'Practise now' }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await expect(card).toContainText('1 of 5 variations done');
  await expect(card.getByTestId('mix-next-name')).not.toHaveText(name);
});
```

(The first clean run is the first history ever, so the mix is recomputed once — see the daily
mix design; the count and the "next" change are what this test pins.)
Run `pnpm build && pnpm test:e2e -g "daily mix"` → FAIL (no `mix-card`).

- [ ] **Step 2: Tokens and i18n** — add the six `--chip-*` tokens to `:global(:root)` in
      `+layout.svelte`; add/change the i18n keys of Global Constraints (all except
      `lab.rollupShort` and `explore.searchPlaceholder`, done in Task 3).

- [ ] **Step 3: Script** — in DailyMix add `mixNext` to the core import and:

```ts
const doneFlags = $derived(items.map(doneToday));
const next = $derived(mixNext(doneFlags));
const firstDay = $derived(entries.every((e) => e.kind === 'new') && !hasHistory);
const others = $derived(entries.map((e, i) => ({ e, i })).filter(({ i }) => i !== next));
```

(`done` becomes `doneFlags.filter(Boolean).length`.)

- [ ] **Step 4: Markup** — replace the whole `{#if entries.length} … {/if}` block with:

```svelte
{#if entries.length}
  <section class="goal" data-testid="mix-card" aria-labelledby="mix-goal">
    <div class="top">
      <h3 id="mix-goal">{firstDay ? t('mix.start') : t('mix.goal')}</h3>
      <button type="button" class="change" onclick={change}>🎲 {t('mix.shuffle')}</button>
    </div>
    <p class="big">
      {next === -1
        ? t('mix.allDone')
        : firstDay
          ? t('mix.firstDay', { total: entries.length })
          : t('mix.progress', { done, total: entries.length })}
    </p>
    <div class="steps" aria-hidden="true">
      {#each doneFlags as d, i (i)}<i class:done={d}></i>{/each}
    </div>
    {#if next !== -1}
      {@const e = entries[next]!}
      <p class="next">
        {t('mix.next')} · <span class="chip" data-kind={e.kind}>{t(`mix.kind.${e.kind}`)}</span>
      </p>
      <button
        type="button"
        class="next-name"
        data-testid="mix-next-name"
        title={e.node.key}
        onclick={() => onjump(e.node.ucis)}>{e.node.key}</button
      >
      <button type="button" class="go" onclick={() => onpractice(items, next)}>
        ▶ {t('mix.practiseNow')}
      </button>
    {/if}
  </section>
  <ul class="list" aria-label={t('mix.title')}>
    {#each others as { e, i } (e.node.key)}
      <li class="row">
        {#if doneFlags[i]}<span class="done" aria-hidden="true">✓</span>{:else}<span class="pad"></span>{/if}
        <button
          type="button"
          class="enter"
          onclick={() => onjump(e.node.ucis)}
          aria-label={t('lab.enter', { name: e.node.key })}
        >
          <span class="label" title={e.node.key}>{e.node.key}</span>
        </button>
        <span class="chip" data-kind={e.kind}>{t(`mix.kind.${e.kind}`)}</span>
        {#if !doneFlags[i]}
          <button
            type="button"
            class="play"
            onclick={() => onpractice(items, i)}
            aria-label={t('lab.practise', { name: e.node.key })}
            title={t('lab.practise', { name: e.node.key })}>▶</button
          >
        {/if}
      </li>
    {/each}
  </ul>
{/if}
```

Remove the `Mastery` and `SideMark` imports if unused.

- [ ] **Step 5: Styles** — replace the `<style>` block:

```css
.goal {
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), #5b8def);
  color: #fff;
  padding: 0.9rem;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h3 {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  opacity: 0.9;
}
.change {
  border: none;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
}
.big {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0.2rem 0 0;
}
.steps {
  display: flex;
  gap: 4px;
  margin: 0.6rem 0;
}
.steps i {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.3);
}
.steps i.done {
  background: #fff;
}
.next {
  margin: 0;
  font-size: 0.8rem;
}
.goal .chip {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
.next-name {
  display: block;
  max-width: 100%;
  border: none;
  background: none;
  color: #fff;
  padding: 0;
  margin-top: 0.15rem;
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}
.go {
  margin-top: 0.6rem;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: var(--accent);
  font-weight: 700;
  padding: 0.45rem 0.9rem;
}
.list {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border);
}
.done {
  color: var(--chip-review-fg);
  font-weight: 700;
  width: 1rem;
}
.pad {
  width: 1rem;
}
.enter {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  text-align: left;
  padding: 0.45rem 0.2rem;
}
.label {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.95rem;
}
.chip {
  font-size: 0.65rem;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
  white-space: nowrap;
}
.chip[data-kind='almost'] {
  background: var(--chip-almost-bg);
  color: var(--chip-almost-fg);
}
.chip[data-kind='review'] {
  background: var(--chip-review-bg);
  color: var(--chip-review-fg);
}
.chip[data-kind='new'] {
  background: var(--chip-new-bg);
  color: var(--chip-new-fg);
}
.play {
  border: none;
  background: none;
  color: var(--accent);
}
```

- [ ] **Step 6: Verify** — eslint web, web typecheck, `pnpm build && pnpm test:e2e` → all pass.
- [ ] **Step 7: Commit** — `feat(web): daily mix as a goal card with practise now`

---

### Task 3: Tabs, search placeholder, plain roll-up

**Files:** Modify `ExplorePanel.svelte`, `MasteryRollup.svelte`, `en.ts`, `it.ts`,
`apps/web/e2e/drill.spec.ts`

- [ ] **Step 1: Update e2e first**
  - In "opening lab: continues into other openings…" and "continues into is hidden…": before
    the first use of the "Continues into" list, add
    `await page.getByRole('tab', { name: /^Continues into/ }).click();` (the hidden test instead
    asserts `await expect(page.getByRole('tab', { name: /^Continues into/ })).toBeDisabled();`
    in addition to the list count 0).
  - Line ~339 roll-up assertion becomes:
    `await expect(page.getByTestId('lab-focus').getByTestId('mastery-rollup')).toHaveText(/^[1-9]\d* \/ \d+ lines$/);`
    and keep an accessible-name check: `toHaveAccessibleName(/^[1-9]\d* of \d+ lines automatic/)`.
  - New assertion in "daily mix: five variations…" after `ready`:
    `await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search an opening (e.g. Najdorf)');`
    Run → FAIL.

- [ ] **Step 2: i18n** — `lab.rollupShort`, changed `explore.searchPlaceholder` (Global Constraints).

- [ ] **Step 3: MasteryRollup** — replace the bar and count with
      `<span class="count" aria-hidden="true">{t('lab.rollupShort', { mastered: rollup.mastered, total: rollup.total })}</span>`
      inside the existing labelled span; delete `.bar`, `.mastered`, `.started` styles and `pct`.

- [ ] **Step 4: Tabs in ExplorePanel** — script:

```ts
let tab = $state<'name' | 'next'>('name');
const shownTab = $derived(tab === 'next' && nextItems.length ? 'next' : 'name');
```

Markup: right after the search results block (before `<section aria-labelledby="by-name">`):

```svelte
<div class="tabs" role="tablist">
  <button
    type="button"
    role="tab"
    id="tab-name"
    aria-controls="panel-name"
    aria-selected={shownTab === 'name'}
    onclick={() => (tab = 'name')}>{t('lab.byName')}</button
  >
  <button
    type="button"
    role="tab"
    id="tab-next"
    aria-controls="panel-next"
    aria-selected={shownTab === 'next'}
    disabled={!nextItems.length}
    onclick={() => (tab = 'next')}>{t('lab.continuesInto')} · {continuations.length}</button
  >
</div>
```

Wrap the by-name `<section>` in `<div role="tabpanel" id="panel-name" aria-labelledby="tab-name" hidden={shownTab !== 'name'}>…</div>`
and the continues-into block (`{#if nextItems.length}<section …>…</section>{/if}`) in
`<div role="tabpanel" id="panel-next" aria-labelledby="tab-next" hidden={shownTab !== 'next'}>…</div>`.
Give both inner `<h3>` the class `sr-only` (the tab shows the title; regions keep their names).
Styles:

```css
.tabs {
  display: flex;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
}
.tabs [role='tab'] {
  border: none;
  background: none;
  padding: 0.35rem 0;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}
.tabs [role='tab'][aria-selected='true'] {
  color: var(--fg);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
.tabs [role='tab']:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 5: Verify** — eslint, typecheck, `pnpm build && pnpm test:e2e` → all pass. Fix
      strict-mode clashes with ledgered scoping as before.
- [ ] **Step 6: Commit** — `feat(web): openings panel tabs, plain roll-up, search without ECO`

---

### Task 4: Full gate and screenshot

- [ ] `pnpm exec eslint . && pnpm exec prettier --check --end-of-line auto apps packages docs && pnpm typecheck`;
      core and db tests (only the known CRLF failures); `pnpm build && pnpm test:e2e`.
- [ ] Take an `it-IT` screenshot of the panel (fresh and after one run) with a throwaway
      Playwright script outside the repo tree, and show it to the user in the companion.
