# Repertoire Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab practice of repertoire moves updates their FSRS cards (A), progress dots of
repertoire variations follow FSRS (C), and the Today card is built from the repertoire's due and
learning lines (B).

**Architecture:** Db gains two read queries over user nodes of non-archived collections
(`repertoireMovesAt`, `repertoireCards`); the lab controller records an FSRS attempt for each
match through the existing `startSession` / `recordAttempt`. Core gains pure helpers
(`lineSrsState`, `repertoireSession`, `deepestName`); the web wires them into `Mastery`,
`ExplorePanel` and `DailyMix`.

**Tech Stack:** TypeScript strict, Drizzle + SQLite, Vitest, SvelteKit (Svelte 5), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-repertoire-backbone-design.md`

## Global Constraints

- No schema change, no migration, no new dependency. `attempt` stays append-only; `card` and
  `daily_stat` stay derived in the same transaction (existing `recordAttempt`).
- Match by position: a lab move matches a repertoire node when `node.epd` (position after the
  move) and `node.uci` are equal and `node.is_user_move = 1`, in a non-archived collection whose
  `user_color` is the side that played the move.
- Only standard-start collections take part (lab lines start from the initial position).
- `apps/web` imports chess logic only from `@processchess/core` (`playMove`, `toEpd`, …).
- Every UI string via `t()` in `en.ts` and `it.ts` together.
- Format with `pnpm exec prettier --write --end-of-line auto <paths>`; never `pnpm format`.
- Known CRLF failures on this checkout: core `dataset.test.ts`, `graph.test.ts`; db
  `migrator.test.ts`.
- **Progress unit (aligning the spec):** the Today card counts **entries** done today, as it does
  now; an entry from the repertoire is done when every user move of its line was reviewed today
  (card `lastReview` on the local day). The spec's per-move wording is updated in Task 7.

## Review Focus

- A lab run with the automatic opponent off: the user plays both sides; only moves of the
  repertoire's colour may match (colour = side that played the move).
- The same move in two repertoires of the same colour → one attempt per collection (each has its
  own card).
- Wrong move in the lab: the attempt is for the **expected** move (`attempt.uci`), result `wrong`,
  `playedUci` = the move played — same as the drill.
- Stored Today picks from the previous version (`pc.mix` without `v: 2`) → rebuilt.
- Archived collections and custom-start collections never feed FSRS from the lab nor the Today
  card.

---

### Task 1: `repertoireMovesAt` (db)

**Files:** Modify `packages/db/src/storage.ts` (interface), `packages/db/src/sqlite-storage.ts`;
create `packages/db/src/storage-backbone.test.ts`.

**Interfaces — Produces:**

```ts
export interface RepertoireMove { collectionId: string; nodeId: string; rootNodeId: string }
repertoireMovesAt(epdAfter: string, uci: string, color: 'w' | 'b'): Promise<RepertoireMove[]>;
```

- [ ] **Step 1: Failing test** — `storage-backbone.test.ts`

```ts
import { findChildByUci, playLine, INITIAL_FEN, toEpd, treeFromPgn } from '@processchess/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from './adapters/memory';
import { newId } from './sqlite-storage';
import type { SqliteStorage } from './sqlite-storage';

let storage: SqliteStorage;
beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.migrate();
});
afterEach(() => storage.close());

const epdAfter = (ucis: string[]) => toEpd(playLine(INITIAL_FEN, ucis)!.fen);

async function repertoire(pgn: string, color: 'w' | 'b', name = 'R') {
  const edit = treeFromPgn(pgn, { userColor: color, newId });
  const c = await storage.createCollectionFromTree(
    { name, kind: 'opening', evalMode: 'exact' },
    edit,
  );
  return { collection: c, tree: edit.tree };
}

describe('repertoireMovesAt', () => {
  it('finds a user move by the position it reaches and the move, also by another move order', async () => {
    // 1.d4 Nf6 2.c4 e6 3.Nc3 and 1.c4 e6 2.d4 Nf6 3.Nc3 reach the same position with 3.Nc3
    const { collection, tree } = await repertoire('1. d4 Nf6 2. c4 e6 3. Nc3 *', 'w');
    let id = tree.rootId;
    for (const u of ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3']) id = findChildByUci(tree, id, u)!.id;
    const nc3 = { collectionId: collection.id, nodeId: id, rootNodeId: tree.rootId };
    expect(
      await storage.repertoireMovesAt(
        epdAfter(['c2c4', 'e7e6', 'd2d4', 'g8f6', 'b1c3']),
        'b1c3',
        'w',
      ),
    ).toEqual([nc3]);
    // same position reached by another move: no match (the card is about this move)
    expect(
      await storage.repertoireMovesAt(
        epdAfter(['c2c4', 'e7e6', 'd2d4', 'g8f6', 'b1c3']),
        'd2d4',
        'w',
      ),
    ).toEqual([]);
  });

  it('ignores opponent moves, the other colour and archived collections', async () => {
    const white = await repertoire('1. e4 e5 2. Nf3 *', 'w', 'W');
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4', 'e7e5']), 'e7e5', 'b')).toEqual([]);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'b')).toEqual([]);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toHaveLength(1);
    await storage.archiveCollection(white.collection.id);
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toEqual([]);
  });

  it('returns one match per collection of that colour', async () => {
    await repertoire('1. e4 e5 *', 'w', 'A');
    await repertoire('1. e4 c5 *', 'w', 'B');
    expect(await storage.repertoireMovesAt(epdAfter(['e2e4']), 'e2e4', 'w')).toHaveLength(2);
  });
});
```

(Moves verified with chess.js in the test itself through `playLine`; the expected node is
found by walking the tree.)

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @processchess/db exec vitest run src/storage-backbone.test.ts` (not a function).
- [ ] **Step 3: Implement** — interface in `storage.ts` (next to `listCards`) with the doc comment
      "User moves of non-archived collections of `color` that reach `epdAfter` with `uci`.";
      in `sqlite-storage.ts`:

```ts
  async repertoireMovesAt(epdAfter: string, uci: string, color: 'w' | 'b') {
    const rows = await this.db
      .select({ nodeId: schema.node.id, collectionId: schema.node.collectionId, root: schema.collection.rootNodeId })
      .from(schema.node)
      .innerJoin(schema.collection, eq(schema.collection.id, schema.node.collectionId))
      .where(
        and(
          eq(schema.node.epd, epdAfter),
          eq(schema.node.uci, uci),
          eq(schema.node.isUserMove, true),
          eq(schema.collection.userColor, color),
          isNull(schema.collection.archivedAt),
        ),
      );
    return rows.map((r) => ({ collectionId: r.collectionId, nodeId: r.nodeId, rootNodeId: r.root }));
  }
```

Check the actual column names of `collection` in `schema.ts` (`rootNodeId`, `userColor`,
`archivedAt`) and import `isNull` from drizzle-orm if not imported; if `collection` has no root
column, select the root as the node of that collection with `parent_id is null` in a second
query and ledger it.

- [ ] **Step 4: Run, expect PASS**; `pnpm --filter @processchess/db typecheck`.
- [ ] **Step 5: Commit** — `feat(db): repertoireMovesAt, user moves of a position in the repertoires`

---

### Task 2: Lab moves feed FSRS (web)

**Files:** Modify `apps/web/src/lib/lab.svelte.ts`; `apps/web/e2e/drill.spec.ts`.

**Interfaces — Consumes:** `repertoireMovesAt` (Task 1), `startSession`, `recordAttempt`;
core `playMove`, `toEpd`.

- [ ] **Step 1: Failing e2e** — append:

```ts
test('practising a repertoire variation in the lab reviews its FSRS cards', async ({ page }) => {
  await ready(page);
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  await row.getByRole('button', { name: `Add ${name} to the repertoire` }).click();
  await expectSelected(page, 'Black repertoire');
  await row.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  const focusCard = page.getByTestId('lab-focus');
  const sans = (await focusCard.locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard.getByRole('button', { name: `Practise ${name}` }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  // every Black move of the line got its first FSRS review
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page.getByTestId('today-new')).toHaveText(String(Math.floor(sans.length / 2)));
});
```

(Check the statistics link's accessible name in `+layout.svelte`; adapt the locator if it
differs and ledger it.) Run `pnpm build && pnpm test:e2e -g "reviews its FSRS"` → FAIL
(`today-new` is 0).

- [ ] **Step 2: Implement** — in `LabController`:
  - add `private sessions: Record<string, string> = {};` cleared in `begin()` and `repeat()`
    (a new session per run and collection);
  - in `handle`, after `recordLabAttempt`:

```ts
const color = attempt.ply % 2 === 1 ? 'w' : 'b';
const after = playMove(fenBefore, attempt.uci);
if (after) {
  const epdAfter = toEpd(after.fen);
  this.save(async () => {
    const db = storage();
    for (const m of await db.repertoireMovesAt(epdAfter, attempt.uci, color)) {
      this.sessions[m.collectionId] ??= (await db.startSession(m.collectionId, m.rootNodeId)).id;
      await db.recordAttempt({
        sessionId: this.sessions[m.collectionId]!,
        nodeId: m.nodeId,
        result: attempt.result,
        playedUci: attempt.playedUci,
        hints: attempt.hints,
        timeMs: attempt.timeMs,
      });
    }
  });
}
```

`fenBefore` is the position before the user's move (already a parameter of `handle`); for a
`wrong` outcome it is the same position, and `attempt.uci` is the expected move.

- [ ] **Step 3: Verify** — eslint web, web typecheck, `pnpm build && pnpm test:e2e` (all pass).
- [ ] **Step 4: Commit** — `feat(web): lab practice of repertoire moves updates their FSRS cards`

---

### Task 3: `repertoireCards` (db) and `lineSrsState` (core)

**Files:** `packages/db/src/storage.ts`, `sqlite-storage.ts`, `storage-backbone.test.ts`;
`packages/core/src/srs/line-state.ts` (new) + `line-state.test.ts`; export from
`packages/core/src/srs/index.ts`.

**Interfaces — Produces:**

```ts
// db
repertoireCards(): Promise<Map<string, SrsCard[]>>; // key `${epdAfter} ${uci}`, user nodes of
// non-archived collections, only nodes that have a card
// core
export type LineSrs = 'new' | 'learning' | 'known';
export function edgeKeyAfter(epdAfter: string, uci: string): string; // `${epdAfter} ${uci}`
export function lineSrsState(
  line: readonly string[], side: 'w' | 'b',
  cards: ReadonlyMap<string, readonly Pick<SrsCard, 'state'>[]>,
): LineSrs | null;
```

Rule: replay `line` from the initial position; for each move of `side` take
`cards.get(edgeKeyAfter(toEpd(fenAfter), uci))`. No user move with cards → `null` (the line is
not in a repertoire or never reviewed: callers fall back to the lab state). Every user move has
a card in state Review (2) → `'known'`; some cards but not all user moves reviewed, or any card
in Learning/Relearning (1, 3) → `'learning'`; all present cards in state New (0) → `'new'`.

- [ ] **Step 1: Failing tests**
  - db (append to `storage-backbone.test.ts`): after recording an attempt on a user node with
    `recordAttempt`, `repertoireCards()` has the key `` `${node.epd} ${node.uci}` `` with that
    card; an archived collection's cards are absent; opponent nodes never appear.
  - core `line-state.test.ts` (synthetic cards; `CardState` from ts-fsrs via core):

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, playLine } from '../position';
import { toEpd } from '../fen';
import { edgeKeyAfter, lineSrsState } from './line-state';

const LINE = ['e2e4', 'c7c5', 'g1f3', 'd7d6']; // Black plays c5 and d6
const keyAt = (i: number) =>
  edgeKeyAfter(toEpd(playLine(INITIAL_FEN, LINE.slice(0, i + 1))!.fen), LINE[i]!);

describe('lineSrsState', () => {
  it('is null when no user move has a card', () => {
    expect(lineSrsState(LINE, 'b', new Map())).toBeNull();
  });
  it('is known when every user move is in review', () => {
    const cards = new Map([
      [keyAt(1), [{ state: 2 }]],
      [keyAt(3), [{ state: 2 }]],
    ]);
    expect(lineSrsState(LINE, 'b', cards)).toBe('known');
  });
  it('is learning when a user move is missing or in learning', () => {
    expect(lineSrsState(LINE, 'b', new Map([[keyAt(1), [{ state: 2 }]]]))).toBe('learning');
    const cards = new Map([
      [keyAt(1), [{ state: 2 }]],
      [keyAt(3), [{ state: 1 }]],
    ]);
    expect(lineSrsState(LINE, 'b', cards)).toBe('learning');
  });
  it('ignores the other side', () => {
    expect(lineSrsState(LINE, 'w', new Map([[keyAt(1), [{ state: 2 }]]]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (both files).
- [ ] **Step 3: Implement** both; db query = `listCards` joined with `collection`
      (non-archived) and `node.isUserMove`, keyed `` `${node.epd} ${node.uci}` ``, values
      `toSrsCard(card)`.
- [ ] **Step 4: Run, expect PASS**; typecheck core and db.
- [ ] **Step 5: Commit** — `feat(core,db): repertoire cards by move and the FSRS state of a line`

---

### Task 4: Progress dots follow FSRS for repertoire lines (web)

**Files:** `apps/web/src/lib/lab.svelte.ts` (load `repertoire` cards), `Mastery.svelte`,
`ExplorePanel.svelte`, `+page.svelte`, i18n, e2e.

- [ ] **Step 1: Failing e2e** — extend the Task 2 test: after the run, back in Explore › By name
      › Sicilian Defense, the Najdorf tile's `mastery` has accessible name
      `In your repertoire: learning` (one clean review leaves the cards in Learning).
- [ ] **Step 2: Implement**
  - `LabController`: `repertoire = $state.raw<Map<string, SrsCard[]>>(new Map())`, loaded in
    `load()` together with the summaries (`db.repertoireCards()`).
  - `+page.svelte`: pass `repertoire={lab.repertoire}` to `ExplorePanel`; after a drill attempt
    the page already refreshes the lab (`lab.refresh()`); if it does not, call it after drill
    sessions end and ledger it.
  - `Mastery.svelte`: new optional prop `srs?: LineSrs | null`. When set it wins: `'known'` →
    the mastered look and `t('lab.repKnown')`; `'learning'` → one filled dot and
    `t('lab.repLearning')`; `'new'` → `t('lab.repNew')`. `data-testid="mastery"` unchanged.
  - i18n: `lab.repKnown` "In your repertoire: known" / "Nel repertorio: saputa";
    `lab.repLearning` "In your repertoire: learning" / "Nel repertorio: in apprendimento";
    `lab.repNew` "In your repertoire: new" / "Nel repertorio: nuova".
  - `ExplorePanel`: prop `repertoire: Map<string, SrsCard[]>`; helper
    `srsOf(item: LabItem) = item.side ? lineSrsState(item.line, item.side, repertoire) : null`;
    every `<Mastery summary={…}>` for a variation also gets `srs={srsOf(item)}`; `tileState`
    uses `srs` first (`known` → 'known', `learning`/`new` → 'found'); `rollupOf`'s `streakOf`
    maps `known` → `MASTERED_STREAK`, `learning` → 1, `new` → 0, `null` → the lab streak.
- [ ] **Step 3: Verify** — eslint, typecheck, `pnpm build && pnpm test:e2e`.
- [ ] **Step 4: Commit** — `feat(web): progress of repertoire variations follows FSRS`

---

### Task 5: `repertoireSession` and `deepestName` (core)

**Files:** `packages/core/src/srs/session.ts` (new) + `session.test.ts`;
`packages/core/src/openings/continuations.ts` (`deepestName`) + test in `branches.test.ts`.

**Interfaces — Produces:**

```ts
export interface SessionLine {
  ucis: string[];
  kind: 'due' | 'learning';
  overdueMs: number;
}
export function repertoireSession(
  repertoires: readonly { tree: Tree; cards: CardMap }[],
  now: Date,
): SessionLine[];
export function deepestName(graph: OpeningGraph, ucis: readonly string[]): string | null;
```

Rules: trees whose `startFen` is not the initial position are skipped. Lines are
`enumerateLines(tree)` (root → leaf). A user node is due when its card `due <= now`; learning
when its card state is 1 or 3 and it is not due. For each due node pick the shortest line that
contains it; same for learning nodes. Lines are unique by their UCI path; due lines first,
ordered by their largest `now - due` descending; then learning lines, in tree order.
`deepestName` = the dataset name of the deepest named position along `ucis` (via
`nodeNames`), `null` when none.

- [ ] **Step 1: Failing tests** — `session.test.ts` builds trees with `treeFromPgn` and cards
      with `reviewCard` (as `storage-m2.test.ts` does): (a) no cards → `[]`; (b) a due card on the
      second user move of a two-line tree → one `due` line, the shorter one containing it; (c) two
      due lines → the more overdue first; (d) a learning card not yet due → a `learning` line after
      the due ones; (e) a custom-start tree is ignored. `deepestName(graph, ['e2e4','c7c5','g1f3',
'd7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6'])` → `'Sicilian Defense: Najdorf Variation'`
      (data/openings/b.tsv B90); off book → `null`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: PASS**, typecheck.
- [ ] **Step 5: Commit** — `feat(core): repertoireSession, due and learning lines of the repertoires`

---

### Task 6: The Today card from the repertoire (web)

**Files:** `apps/web/src/lib/components/DailyMix.svelte`, `ExplorePanel.svelte`,
`+page.svelte`, `apps/web/src/lib/lab.svelte.ts`, i18n, e2e.

- [ ] **Step 1: Failing e2e** — new test:

```ts
test('the Today card brings back a repertoire line when its cards are due', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
  // add and practise the Najdorf as in the Task 2 test (copy the steps), then:
  await page.clock.fastForward('72:00:00');
  await page.reload();
  const card = page.getByTestId('mix-card');
  await expect(card).toContainText('Today’s goal'.replace('’', "'"));
  await expect(card.getByTestId('mix-next-name')).toHaveText('Sicilian Defense: Najdorf Variation');
  await expect(card).toContainText('review');
});
```

Run → FAIL (the card still shows the lab mix).

- [ ] **Step 2: Implement**
  - `LabController.load()` also loads, for each non-archived standard-start collection,
    `{ tree: loadTree(id), cards: listCards(id) }` into `repertoires = $state.raw([])`.
  - `DailyMix` entries become `{ key: string; name: string; ucis: string[]; line: string[];
side: 'w' | 'b' | null; kind: MixKind }` (key = line joined). Source:
    1. `repertoireSession(lab.repertoires, now)` → up to `size` entries, kind `review` for `due`,
       `almost` for `learning`, name = `deepestName(graph, ucis) ?? t('lab.unnamed')`, line =
       the session line (practised as is), side = the collection's colour;
    2. free slots (at least one when any slot is free) from `dailyMix(...)` as today, filtered to
       variations not already in a repertoire (`lineSrsState(...) === null`), kind as returned.
  - Done today for a repertoire entry: every user move of its line has a card whose `lastReview`
    is on the local day (core helper `lineReviewedOn(line, side, cards, dayStart)` with a unit
    test, in `line-state.ts`); for other entries the current lab rule.
  - Stored picks: write `{ v: 2, day, shuffle, picks: [{ key, kind, name, ucis, line, side }] }`;
    ignore stored values without `v: 2`.
  - `firstDay` = no repertoire line and no lab history (unchanged wording).
- [ ] **Step 3: Verify** — eslint, typecheck, `pnpm build && pnpm test:e2e` twice.
- [ ] **Step 4: Commit** — `feat(web): the Today card is built from the repertoire's due and learning lines`

---

### Task 7: ADR 013, spec wording, full gate

- [ ] Create `docs/adr/013-repertoire-backbone.md` (Status accepted, Date 2026-10-13): context
      (the table of the spec), decision (principle, A/B/C, match by position and move, progress unit
      = entries), consequences (lab practice of repertoire lines writes `attempt`; no schema change;
      later: re-derive non-repertoire progress from `lab_attempt`). Add a one-line pointer at the end
      of ADR 003 and ADR 011.
- [ ] In the spec, replace the per-move progress definition with the entry-based one of Global
      Constraints.
- [ ] Full gate: eslint, prettier check, typecheck, core/db tests (known CRLF failures only),
      `pnpm build && pnpm test:e2e`.
- [ ] Commit — `docs(adr): 013 repertoire backbone`
