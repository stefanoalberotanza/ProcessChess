# Week Repertoire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Today" view with automatic weekly repertoires (White and Black, 3 openings each) shown in Training; the Openings tab keeps only Explore.

**Architecture:** Pure logic in a new `packages/core/src/week/` module (week ids, what to archive/create, which openings, the tree to save). The web app runs it once at startup through a thin `ensureWeek` and stores week repertoires as ordinary collections tagged `source = 'week:YYYY-Www'` (no schema change). The Today view and `DailyMix.svelte` are deleted; `dailyMix`/`repertoireSession` stay in core unused.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-14-week-repertoire-design.md`

## Global Constraints

- Branch: `refactor/week-repertoire`.
- 3 openings per colour; one White and one Black repertoire per ISO week (Monday–Sunday, local time), id `YYYY-Www`.
- Week repertoires: `kind: 'opening'`, `evalMode: 'exact'`, standard start, `source: 'week:YYYY-Www'`. No schema change, no migration.
- Content of an opening: its main line only, `practiceLine(graph, node.ucis)`.
- Past week repertoires are archived, never deleted. Training → Review stays as it is.
- `packages/core` stays pure (no DOM, storage, network); tests first in core (AGENTS.md rule 1).
- No new dependencies. No chess.js in `apps/web`.
- Every UI string through `t()`; keys added to `en.ts` and `it.ts` together. Code, comments, docs in English.
- Opening names in tests are checked against `data/openings/*.tsv`, never from memory.
- Before push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
- Known pre-existing failures to ignore: `dataset.test.ts` "openings.json and opening-graph.json are up to date" and `graph.test.ts` "starts at the initial position and counts the dataset lines through each move" (CRLF checkout of the TSVs). Do not regenerate the JSON.

## Review Focus

- Year boundary: 2026-12-31 and 2027-01-01 are both `2026-W53`; 2027-01-04 is `2027-W01` (test in Task 1).
- Week repertoire archived by hand mid-week must not be recreated that week (test in Task 2).
- Restarting the app twice in the same week must not create duplicates (test in Task 2, `planWeek` with the current week present).
- Two picked openings sharing one practice line would make a repertoire with fewer than 3 distinct lines (test in Task 3).
- `ensureWeek` failing (e.g. storage error) must not block the app (Task 4: wrapped in try/catch, logged).

---

### Task 1: Week ids

**Files:**

- Create: `packages/core/src/week/week.ts`
- Create: `packages/core/src/week/index.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './week';`)
- Test: `packages/core/src/week/week.test.ts`

**Interfaces:**

- Produces: `weekId(date: Date): string`, `weekSource(week: string): string`, `weekOf(source: string | null): string | null`, `weekNumber(week: string): number`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/week/week.test.ts
import { describe, expect, it } from 'vitest';
import { weekId, weekNumber, weekOf, weekSource } from './week';

describe('weekId', () => {
  it('is the ISO week of a local date', () => {
    expect(weekId(new Date(2026, 9, 14))).toBe('2026-W42'); // Wednesday
    expect(weekId(new Date(2026, 9, 12))).toBe('2026-W42'); // Monday
    expect(weekId(new Date(2026, 9, 18, 23, 59))).toBe('2026-W42'); // Sunday night
    expect(weekId(new Date(2026, 9, 19))).toBe('2026-W43');
  });

  it('crosses the year boundary like ISO 8601', () => {
    expect(weekId(new Date(2026, 11, 31))).toBe('2026-W53');
    expect(weekId(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(weekId(new Date(2027, 0, 4))).toBe('2027-W01');
    expect(weekId(new Date(2025, 11, 29))).toBe('2026-W01');
  });
});

describe('week sources', () => {
  it('round-trips and rejects other sources', () => {
    expect(weekSource('2026-W42')).toBe('week:2026-W42');
    expect(weekOf('week:2026-W42')).toBe('2026-W42');
    expect(weekOf('pgn')).toBeNull();
    expect(weekOf(null)).toBeNull();
    expect(weekNumber('2026-W07')).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @processchess/core exec vitest run src/week/week.test.ts`
Expected: FAIL, cannot resolve `./week`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/week/week.ts
const DAY = 86_400_000;

/** ISO 8601 week of a local date, e.g. '2026-W42' (weeks start on Monday). */
export function weekId(date: Date): string {
  // the Thursday of the date's week decides the year
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const firstThursday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const PREFIX = 'week:';

/** `collection.source` of a week repertoire. */
export function weekSource(week: string): string {
  return `${PREFIX}${week}`;
}

/** The week of a week repertoire's source; null for any other collection. */
export function weekOf(source: string | null): string | null {
  return source?.startsWith(PREFIX) ? source.slice(PREFIX.length) : null;
}

/** 42 for '2026-W42'. */
export function weekNumber(week: string): number {
  return parseInt(week.slice(week.indexOf('W') + 1), 10);
}
```

```ts
// packages/core/src/week/index.ts
export * from './week';
```

Add `export * from './week';` to `packages/core/src/index.ts` after `export * from './tree';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @processchess/core exec vitest run src/week/week.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/week packages/core/src/index.ts
git commit -m "feat(core): ISO week ids for week repertoires"
```

---

### Task 2: planWeek

**Files:**

- Create: `packages/core/src/week/plan.ts`
- Modify: `packages/core/src/week/index.ts`
- Test: `packages/core/src/week/plan.test.ts`

**Interfaces:**

- Consumes: `weekOf`, `weekSource` (Task 1)
- Produces:

  ```ts
  interface WeekCollection {
    id: string;
    source: string | null;
    userColor: 'w' | 'b';
    archivedAt: Date | null;
  }
  function planWeek(
    collections: readonly WeekCollection[],
    current: string,
  ): { archive: string[]; create: ('w' | 'b')[] };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/week/plan.test.ts
import { describe, expect, it } from 'vitest';
import { type WeekCollection, planWeek } from './plan';

const col = (
  id: string,
  source: string | null,
  userColor: 'w' | 'b',
  archived = false,
): WeekCollection => ({
  id,
  source,
  userColor,
  archivedAt: archived ? new Date(0) : null,
});

describe('planWeek', () => {
  it('creates both colours on a fresh profile', () => {
    expect(planWeek([], '2026-W42')).toEqual({ archive: [], create: ['w', 'b'] });
  });

  it('archives past week repertoires and leaves other collections alone', () => {
    const plan = planWeek(
      [
        col('a', 'week:2026-W41', 'w'),
        col('b', 'week:2026-W41', 'b'),
        col('c', 'pgn', 'w'),
        col('d', null, 'b'),
      ],
      '2026-W42',
    );
    expect(plan).toEqual({ archive: ['a', 'b'], create: ['w', 'b'] });
  });

  it('does nothing when the current week already exists (restart)', () => {
    const plan = planWeek(
      [col('a', 'week:2026-W42', 'w'), col('b', 'week:2026-W42', 'b')],
      '2026-W42',
    );
    expect(plan).toEqual({ archive: [], create: [] });
  });

  it('does not recreate a colour archived by hand this week', () => {
    const plan = planWeek([col('a', 'week:2026-W42', 'w', true)], '2026-W42');
    expect(plan).toEqual({ archive: [], create: ['b'] });
  });

  it('does not archive again what is already archived', () => {
    expect(planWeek([col('a', 'week:2026-W40', 'w', true)], '2026-W42').archive).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @processchess/core exec vitest run src/week/plan.test.ts`
Expected: FAIL, cannot resolve `./plan`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/week/plan.ts
import { weekOf, weekSource } from './week';

/** What `planWeek` needs from a collection. */
export interface WeekCollection {
  id: string;
  source: string | null;
  userColor: 'w' | 'b';
  archivedAt: Date | null;
}

/**
 * What to do for the week `current`: archive the non-archived week repertoires of other weeks,
 * create the colours that have no repertoire for `current` (archived ones count, so a week
 * repertoire archived by hand is not recreated that week).
 */
export function planWeek(
  collections: readonly WeekCollection[],
  current: string,
): { archive: string[]; create: ('w' | 'b')[] } {
  const archive = collections
    .filter((c) => !c.archivedAt && weekOf(c.source) !== null && weekOf(c.source) !== current)
    .map((c) => c.id);
  const source = weekSource(current);
  const create = (['w', 'b'] as const).filter(
    (color) => !collections.some((c) => c.source === source && c.userColor === color),
  );
  return { archive, create };
}
```

Add `export * from './plan';` to `packages/core/src/week/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @processchess/core exec vitest run src/week`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/week
git commit -m "feat(core): planWeek decides which week repertoires to archive and create"
```

---

### Task 3: Choosing the openings and building the tree

**Files:**

- Create: `packages/core/src/week/repertoire.ts`
- Modify: `packages/core/src/week/index.ts`
- Test: `packages/core/src/week/repertoire.test.ts`

**Interfaces:**

- Consumes: `practiceLine` (`../lab/lab`), `seededRandom` (`../lab/mix`), `NameNode`, `NameTree`, `buildNameTree` (`../lab/names`), `emptyTree` (`../tree/tree`), `addLine` (`../tree/ops`), `INITIAL_FEN` (`../position`)
- Produces:

  ```ts
  const WEEK_SIZE = 3;
  interface WeekGrouping {
    id: string;
    label: string;
    pick(candidates: readonly NameNode[], count: number, random: () => number): NameNode[];
  }
  const randomGrouping: WeekGrouping; // id 'random', label 'week.grouping.random'
  interface WeekLine {
    name: string;
    ucis: string[];
  }
  function weekRepertoire(
    graph: OpeningGraph,
    tree: Pick<NameTree, 'all'>,
    color: 'w' | 'b',
    week: string,
    grouping?: WeekGrouping,
  ): { grouping: { id: string; label: string }; lines: WeekLine[] };
  function weekTree(lines: readonly WeekLine[], color: 'w' | 'b', newId: IdGenerator): TreeEdit;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/week/repertoire.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { counterIds, mainLine } from '../../test/helpers';
import { practiceLine } from '../lab/lab';
import { type NameTree, buildNameTree } from '../lab/names';
import { loadOpenings } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { WEEK_SIZE, randomGrouping, weekRepertoire, weekTree } from './repertoire';

// opening names come from data/openings/*.tsv
const dataDir = join(import.meta.dirname, '../../../../data/openings');
const datasetNames = new Set(
  ['a', 'b', 'c', 'd', 'e'].flatMap((v) =>
    readFileSync(join(dataDir, `${v}.tsv`), 'utf8')
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((r) => r.split('\t')[1]!),
  ),
);

let graph: OpeningGraph;
let names: NameTree;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  names = buildNameTree(graph);
});

describe('weekRepertoire', () => {
  it.each(['w', 'b'] as const)('picks %s openings: 3 named variations of that side', (color) => {
    const { grouping, lines } = weekRepertoire(graph, names, color, '2026-W42');
    expect(grouping).toEqual({ id: 'random', label: 'week.grouping.random' });
    expect(lines).toHaveLength(WEEK_SIZE);
    for (const l of lines) {
      expect(datasetNames.has(l.name)).toBe(true);
      const node = [...names.all()].find((n) => n.key === l.name)!;
      expect(node.side).toBe(color);
      expect(l.ucis).toEqual(practiceLine(graph, node.ucis));
    }
  });

  it('has distinct practice lines', () => {
    for (const week of ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44']) {
      const { lines } = weekRepertoire(graph, names, 'w', week);
      expect(new Set(lines.map((l) => l.ucis.join(' '))).size).toBe(lines.length);
    }
  });

  it('is stable within a week and changes across weeks', () => {
    const a = weekRepertoire(graph, names, 'w', '2026-W42').lines.map((l) => l.name);
    expect(weekRepertoire(graph, names, 'w', '2026-W42').lines.map((l) => l.name)).toEqual(a);
    expect(weekRepertoire(graph, names, 'w', '2026-W43').lines.map((l) => l.name)).not.toEqual(a);
  });

  it('uses the grouping it is given', () => {
    const first = {
      id: 'first',
      label: 'week.grouping.first',
      pick: randomGrouping.pick,
    };
    expect(weekRepertoire(graph, names, 'b', '2026-W42', first).grouping.id).toBe('first');
  });
});

describe('weekTree', () => {
  it('holds every line from the standard start for the given colour', () => {
    const { lines } = weekRepertoire(graph, names, 'b', '2026-W42');
    const edit = weekTree(lines, 'b', counterIds());
    expect(edit.tree.userColor).toBe('b');
    expect(mainLine(edit.tree)).toEqual(lines[0]!.ucis);
    // every node, root included, is reported as inserted (parent first)
    expect(edit.changes.inserted).toHaveLength(edit.tree.nodes.size);
    expect(edit.changes.inserted[0]!.id).toBe(edit.tree.rootId);
  });
});
```

Before writing it, check `test/helpers.ts`: `mainLine(tree)` must return UCI moves of the ord-0 path. If it returns SAN, compare against SAN instead: build expected with `playLine(INITIAL_FEN, lines[0]!.ucis)!.san` from `../position`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @processchess/core exec vitest run src/week/repertoire.test.ts`
Expected: FAIL, cannot resolve `./repertoire`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/week/repertoire.ts
import { practiceLine } from '../lab/lab';
import { seededRandom } from '../lab/mix';
import type { NameNode, NameTree } from '../lab/names';
import type { OpeningGraph } from '../openings/graph';
import { INITIAL_FEN } from '../position';
import { addLine } from '../tree/ops';
import { emptyTree } from '../tree/tree';
import type { IdGenerator, TreeEdit } from '../tree/types';

/** Openings per colour in a week repertoire. */
export const WEEK_SIZE = 3;

/**
 * How a week's openings are chosen and what they share ("Most common", "e4 and Knight", …).
 * `label` is an i18n key. `pick` returns candidates in preference order; the caller keeps the
 * first `count` with distinct practice lines.
 */
export interface WeekGrouping {
  id: string;
  label: string;
  pick(candidates: readonly NameNode[], count: number, random: () => number): NameNode[];
}

/** Placeholder grouping: every candidate, in random order. */
export const randomGrouping: WeekGrouping = {
  id: 'random',
  label: 'week.grouping.random',
  pick(candidates, _count, random) {
    const left = [...candidates];
    const out: NameNode[] = [];
    while (left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
    return out;
  },
};

export interface WeekLine {
  /** Dataset name of the opening. */
  name: string;
  /** Its practice line from the initial position (UCI). */
  ucis: string[];
}

/**
 * The openings of `color` for `week`: named variations whose defining move is `color`'s,
 * ordered by `grouping`, the first `WEEK_SIZE` with distinct practice lines. Deterministic for
 * a week and colour. Needs `loadOpenings()`.
 */
export function weekRepertoire(
  graph: OpeningGraph,
  tree: Pick<NameTree, 'all'>,
  color: 'w' | 'b',
  week: string,
  grouping: WeekGrouping = randomGrouping,
): { grouping: { id: string; label: string }; lines: WeekLine[] } {
  const candidates = [...tree.all()]
    .filter((n) => n.kind === 'variation' && n.side === color)
    .sort((a, b) => a.key.localeCompare(b.key)); // stable input for the PRNG
  const ordered = grouping.pick(candidates, WEEK_SIZE, seededRandom(`${week}:${color}`));
  const lines: WeekLine[] = [];
  const seen = new Set<string>();
  for (const node of ordered) {
    if (lines.length >= WEEK_SIZE) break;
    const ucis = practiceLine(graph, node.ucis);
    const key = ucis.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ name: node.key, ucis });
  }
  return { grouping: { id: grouping.id, label: grouping.label }, lines };
}

/** A new repertoire tree from the standard start holding `lines`, every node reported inserted. */
export function weekTree(
  lines: readonly WeekLine[],
  color: 'w' | 'b',
  newId: IdGenerator,
): TreeEdit {
  let tree = emptyTree(INITIAL_FEN, color, newId());
  for (const line of lines) tree = addLine(tree, tree.rootId, line.ucis, { newId }).tree;
  return { tree, changes: { inserted: [...tree.nodes.values()], updated: [], deleted: [] } };
}
```

Note: `inserted` must be parent-first (`TreeChanges` contract). `tree.nodes` is a `Map` filled root-first then in `addLine` order, which is parent-first; the test checks the root is first. If `addLine` rejects UCI (check `ensureChild` in `src/tree/draft.ts` or wherever `TreeDraft` lives: it must accept UCI or SAN), convert with `playLine(INITIAL_FEN, line.ucis)!.san` from `../position` and pass SAN.

Add `export * from './repertoire';` to `packages/core/src/week/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @processchess/core exec vitest run src/week`
Expected: PASS.

- [ ] **Step 5: Run the whole core suite and typecheck**

Run: `pnpm --filter @processchess/core test; pnpm --filter @processchess/core typecheck`
Expected: only the two known pre-existing failures; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/week
git commit -m "feat(core): weekRepertoire picks the week's openings through a pluggable grouping"
```

---

### Task 4: Create week repertoires in the app and show them in Training

**Files:**

- Create: `apps/web/src/lib/week.ts`
- Modify: `apps/web/src/routes/+page.svelte` (startup effect ~line 101; new auto-select effect)
- Modify: `apps/web/src/lib/components/RepertoireList.svelte` (~line 70, badge)
- Modify: `apps/web/src/lib/i18n/en.ts`, `apps/web/src/lib/i18n/it.ts`
- Test: `apps/web/e2e/drill.spec.ts`

**Interfaces:**

- Consumes: `weekId`, `weekNumber`, `weekSource`, `weekOf`, `planWeek`, `weekRepertoire`, `weekTree`, `buildNameTree`, `OpeningGraph` from `@processchess/core`; `Storage`, `newId` from `@processchess/db`; `t` from `$lib/i18n`
- Produces: `ensureWeek(db: Storage, graph: OpeningGraph, now?: Date): Promise<void>`

- [ ] **Step 1: Write the failing e2e test**

Add to `apps/web/e2e/drill.spec.ts` (uses the existing `ready` helper):

```ts
test('week repertoires: one per colour, three lines each, selected in Training', async ({
  page,
}) => {
  await ready(page);
  const list = page.getByRole('region', { name: 'Repertoires' });
  const white = list.getByRole('button', { name: /^Week \d+ · White · Random/ });
  const black = list.getByRole('button', { name: /^Week \d+ · Black · Random/ });
  await expect(white).toBeVisible();
  await expect(black).toBeVisible();
  await expect(white).toContainText('0/3');
  await expect(black).toContainText('0/3');
  await expect(white.getByTestId('week-badge')).toHaveText('Week');
  // a reload in the same week creates nothing new
  await page.reload();
  await expect(list.getByRole('button', { name: /^Week \d+ · White/ })).toHaveCount(1);
  // Training selects this week's White repertoire
  await page.getByRole('tab', { name: 'Training' }).click();
  await expect(list.getByRole('button', { name: /^Week \d+ · White/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
```

Check before running: the tab label (`tabs.train` in `en.ts`) and the `rep.linesClean` format (`{clean}/{total}` or similar). Adjust the two strings in the test to the real English text; do not change the app strings.

The `ready` helper waits for `empty-state` ("No collections yet"). With week repertoires the list is never empty on a fresh profile. Change `ready` (line ~18) to wait for the week repertoire instead:

```ts
async function ready(page: Page) {
  // ...keep the existing goto/setup lines...
  await expect(
    page
      .getByRole('region', { name: 'Repertoires' })
      .getByRole('button', { name: /^Week \d+ · White/ }),
  ).toBeVisible(); // storage ready, week created
}
```

The test `the home page always shows the Import PGN button, with an empty-state invite` asserts `No collections yet`: rewrite it to assert only the Import PGN button and its dialog (drop the empty-state assertions).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm build; pnpm test:e2e -- -g "week repertoires"`
Expected: FAIL, no `Week … · White` button.

- [ ] **Step 3: Add the i18n keys**

`en.ts` (next to the other `rep.*` keys):

```ts
  'week.name': 'Week {n} · {color} · {grouping}',
  'week.grouping.random': 'Random',
  'rep.weekBadge': 'Week',
```

`it.ts`:

```ts
  'week.name': 'Settimana {n} · {color} · {grouping}',
  'week.grouping.random': 'Casuale',
  'rep.weekBadge': 'Settimana',
```

`{color}` uses the existing `color.w` / `color.b` keys (check they read "White" / "Black").

- [ ] **Step 4: Write `ensureWeek`**

```ts
// apps/web/src/lib/week.ts
import {
  type OpeningGraph,
  buildNameTree,
  planWeek,
  weekId,
  weekNumber,
  weekRepertoire,
  weekSource,
  weekTree,
} from '@processchess/core';
import { type Storage, newId } from '@processchess/db';
import { type MessageKey, t } from '$lib/i18n';

/**
 * Archives past week repertoires and creates this week's (White and Black), once per week.
 * Errors are logged: the app works without them.
 */
export async function ensureWeek(db: Storage, graph: OpeningGraph, now = new Date()) {
  try {
    const week = weekId(now);
    const all = await db.listCollections({ includeArchived: true });
    const plan = planWeek(all, week);
    for (const id of plan.archive) await db.archiveCollection(id);
    if (plan.create.length === 0) return;
    const names = buildNameTree(graph);
    for (const color of plan.create) {
      const { grouping, lines } = weekRepertoire(graph, names, color, week);
      await db.createCollectionFromTree(
        {
          name: t('week.name', {
            n: weekNumber(week),
            color: t(`color.${color}`),
            grouping: t(grouping.label as MessageKey),
          }),
          kind: 'opening',
          evalMode: 'exact',
          source: weekSource(week),
        },
        weekTree(lines, color, newId),
      );
    }
  } catch (e) {
    console.error('Week repertoires not created:', e);
  }
}
```

Check: `$lib/i18n` exports `t` and the key type (`MessageKey` per `index.svelte.ts:41`); `Collection.archivedAt` is a `Date | null` and `userColor` `'w' | 'b'` so `all` fits `WeekCollection` (if `source` is `string | null | undefined`, map it: `all.map((c) => ({ ...c, source: c.source ?? null }))`).

- [ ] **Step 5: Call it at startup and auto-select in Training**

In `apps/web/src/routes/+page.svelte`, replace the body of the startup effect (currently `void loadOpeningGraph().then((g) => (graph = g)); void lab.refresh(); void refresh().then(...)`) with:

```ts
void (async () => {
  const g = await loadOpeningGraph();
  graph = g;
  await ensureWeek(storage(), g);
  void lab.refresh();
  await refresh();
  const c = initialParams.get('c');
  if (c && rows.some((r) => r.collection.id === c)) {
    await select(c);
    if (tab === 'train' && initialParams.get('mode') === 'review') void startReview();
  }
})();
```

Add the import `import { ensureWeek } from '$lib/week';` and add `weekId, weekSource` to the existing `@processchess/core` import.

Add after the `select` function:

```ts
// Training opens on this week's White repertoire when nothing is selected
$effect(() => {
  if (tab !== 'train' || selectedId || !loaded) return;
  const source = weekSource(weekId(new Date()));
  const week = rows.find((r) => r.collection.source === source && r.collection.userColor === 'w');
  if (week && !week.collection.archivedAt) void select(week.collection.id);
});
```

- [ ] **Step 6: Badge in the repertoire list**

In `RepertoireList.svelte`, import `weekOf` from `@processchess/core` and change the name line:

```svelte
<span class="name">{row.collection.name}</span>
{#if weekOf(row.collection.source)}
  <span class="badge" data-testid="week-badge">{t('rep.weekBadge')}</span>
{/if}
```

Add to its `<style>`:

```css
.badge {
  font-size: 0.75rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
}
```

- [ ] **Step 7: Run the e2e test and fix the others**

Run: `pnpm build; pnpm test:e2e`
Expected: the new test passes. Other tests may now fail because a fresh profile has two collections (e.g. tests that expect a single repertoire, "New repertoire" counts, or that Explore's "save line" creates the _first_ Black repertoire). Fix each by making the test target its own collection by name; do not change app behaviour. List every test touched in the commit message.

- [ ] **Step 8: Lint, typecheck, commit**

Run: `pnpm format; pnpm lint; pnpm typecheck`
Expected: clean.

```bash
git add apps/web
git commit -m "feat(web): week repertoires created at startup and selected in Training"
```

---

### Task 5: Remove the Today view

**Files:**

- Modify: `apps/web/src/lib/components/ExplorePanel.svelte` (lines 1-5, 33, 53-54, 75, 219-222, 340-385, 716-737)
- Delete: `apps/web/src/lib/components/DailyMix.svelte`
- Modify: `apps/web/src/routes/+page.svelte` (~line 575, `repertoires={lab.repertoires}`)
- Modify: `apps/web/src/lib/i18n/en.ts`, `apps/web/src/lib/i18n/it.ts` (`panel.today`, `mix.*`)
- Modify: `apps/web/e2e/drill.spec.ts` (Today / daily mix tests)
- Modify: `AGENTS.md` (components list), `docs/adr/013-repertoire-backbone.md` (status note)

**Interfaces:**

- Consumes: nothing new.
- Produces: `ExplorePanel` without the `repertoires` prop.

- [ ] **Step 1: Update the e2e tests first**

In `apps/web/e2e/drill.spec.ts`:

- Delete the tests `daily mix: five variations, stable, changes on demand, follows practice`, `daily mix: "Change" after midnight counts for the new day`, `daily mix: practise now, then the card moves to the next entry`, `the Today card brings back a repertoire line when its cards are due`.
- In `today and explore are separate; the album uncovers a variation once practised`: rename to `the album uncovers a variation once practised`, delete the lines that click the `Today` tab or assert `mix-card`, keep the album assertions.
- In the explore placeholder test touched earlier (the one asserting `'Search an opening or paste a FEN'`), keep only the placeholder assertion and what follows that does not involve Today.
- Add:

```ts
test('the openings tab has no Today view', async ({ page }) => {
  await ready(page);
  await explore(page);
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toBeVisible();
});
```

Run: `pnpm build; pnpm test:e2e -- -g "no Today view"`
Expected: FAIL (the Today tab exists).

- [ ] **Step 2: Strip Today from ExplorePanel**

- Module script: delete `let lastView: 'today' | 'explore' = 'today';` and its comment if it only covered `lastView` (keep `lastTab`).
- Delete `import DailyMix from '$lib/components/DailyMix.svelte';`.
- Delete the `repertoires` prop (type lines 53-54 and the destructured `repertoires,`). Remove `Tree`/`CardMap` imports if now unused (typecheck will tell).
- Delete `let view = $state…` and its `$effect`.
- Replace the markup from `<div class="views" role="tablist">` through the closing tag of `panel-today` with nothing, and change the explore panel opening tag to a plain container:

```svelte
  <div class="explore-view">
```

(drop `role="tabpanel"`, `id`, `aria-labelledby`, `hidden`).

- In `<style>` delete `.views`, `.views [role='tab']`, `.views [role='tab'][aria-selected='true']`, `.today`; change `.explore-view:not([hidden])` to `.explore-view`.

In `+page.svelte` delete the `repertoires={lab.repertoires}` line. Leave `lab.repertoires` in `lab.svelte.ts` (still used by lab FSRS refresh).

- [ ] **Step 3: Delete DailyMix and its strings**

```bash
git rm apps/web/src/lib/components/DailyMix.svelte
```

Remove `panel.today` and every `mix.*` key from `en.ts` and `it.ts`. Run `pnpm typecheck`: any remaining `t('mix.…')` is a compile error; there should be none outside the deleted file. Keep `panel.explore` only if still referenced (grep); otherwise remove it from both files.

- [ ] **Step 4: Docs**

- `AGENTS.md` layout, `src/lib/components/` line: no `DailyMix` is listed today; add `week.ts` under `apps/web/src/lib/` (`week.ts  ensureWeek: weekly repertoires at startup`) and `src/week/  week ids, planWeek, weekRepertoire (weekly repertoires)` under `packages/core`.
- `docs/adr/013-repertoire-backbone.md`: append a line under Status: `- Amended 2026-10-14: the Today card is removed (week repertoires, see docs/superpowers/specs/2026-10-14-week-repertoire-design.md); repertoireSession and dailyMix stay in core unused.`

- [ ] **Step 5: Full verification**

Run: `pnpm format; pnpm lint && pnpm typecheck && pnpm test; pnpm build && pnpm test:e2e`
Expected: lint/typecheck clean; core shows only the two known pre-existing failures; build OK; all e2e pass.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web AGENTS.md docs/adr/013-repertoire-backbone.md
git commit -m "refactor(web): remove the Today view; the openings tab is Explore only"
```
