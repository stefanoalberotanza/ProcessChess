# Week repertoire — design

- Date: 2026-10-14
- Branch: `refactor/week-repertoire`
- Status: draft, awaiting review

## Goal

Replace the "Today" view of the Openings tab with a **Week**: a provisional repertoire per
colour, three openings each, created automatically every calendar week and shown in Training.
The Openings tab keeps only Explore.

The grouping that picks the three openings ("Less common", "Most common", "e4 and Knight", …)
will be designed separately; this work ships a pluggable interface and a random placeholder.

## Decisions

| Topic                           | Decision                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| Colours                         | Two repertoires per week, one White, one Black (`collection.userColor`)    |
| Size                            | 3 openings per colour                                                      |
| Content of an opening           | Its main line only: `practiceLine(graph, node.ucis)`                       |
| Week                            | ISO week, Monday–Sunday, local time, id `YYYY-Www` (e.g. `2026-W42`)       |
| Choice                          | Deterministic: seed = week id + colour                                     |
| End of the week                 | Week repertoires are archived (never deleted)                              |
| FSRS                            | Unchanged: attempts update cards, dots keep using them                     |
| Due moves surfaced              | Daily cross-repertoire list removed with Today; Training → Review **kept** |
| `dailyMix`, `repertoireSession` | Stay in core, unused by the UI, tests kept                                 |

## Data

Week repertoires are ordinary `collection` rows (kind `opening`, standard start, eval `exact`):

- `name`: `Week 42 · White · Random` (week number, colour, grouping label; localised at creation)
- `userColor`: `w` or `b`
- `source`: `week:2026-W42` — identifies week repertoires. **No schema change, no migration.**

## Core — `packages/core/src/week/`

Pure, tests first.

```ts
/** ISO week id of a local date: '2026-W42'. */
function weekId(date: Date): string;

/** weekSource('2026-W42') = 'week:2026-W42'; weekOf('week:2026-W42') = '2026-W42', null for any other source. */
function weekSource(id: string): string;
function weekOf(source: string | null): string | null;

/** What the app must do for `current`: archive past week repertoires, create missing colours. */
function planWeek(
  collections: readonly {
    id: string;
    source: string | null;
    userColor: 'w' | 'b';
    archivedAt: Date | null;
  }[],
  current: string,
): { archive: string[]; create: ('w' | 'b')[] };

interface WeekGrouping {
  id: string;
  /** i18n key of the label. */
  label: string;
  pick(candidates: readonly NameNode[], count: number, random: () => number): NameNode[];
}
const randomGrouping: WeekGrouping;

function weekRepertoire(
  graph: OpeningGraph,
  tree: Pick<NameTree, 'all'>,
  color: 'w' | 'b',
  week: string,
  grouping?: WeekGrouping, // default randomGrouping
): { grouping: { id: string; label: string }; lines: { name: string; ucis: string[] }[] };
```

Rules:

- `planWeek` archives every **non-archived** collection whose `weekOf(source)` is not `current`;
  creates a colour when **no** collection (archived or not) has `source = weekSource(current)`
  and that colour. A week repertoire archived by hand is therefore not recreated that week.
- Candidates: name-tree nodes with `kind === 'variation'` and `side === color`.
- `randomGrouping.pick` draws without repetition with the given PRNG; `weekRepertoire` seeds it
  with `seededRandom(week + color)` (existing, `lab/mix.ts`) and skips candidates whose practice
  line equals one already picked, until 3 lines (fewer only if the pool is exhausted).

## App

- `apps/web/src/lib/week.svelte.ts`: `ensureWeek(storage, graph, tree, now)` runs `planWeek`,
  archives, and for each colour to create builds a tree with core `addLine` from the lines and
  saves it with `Storage.createCollectionFromTree`. Called once from the bootstrap in
  `app.svelte.ts` after migrations, openings and the graph are loaded. Errors are logged and do
  not block the app.
- Openings tab (`ExplorePanel.svelte`): remove the Today/Explore switch and the Today panel;
  Explore is shown directly. Delete `DailyMix.svelte` and the `panel.today` / `mix.*` keys from
  `en.ts` and `it.ts`.
- Training: when no collection is selected on entering the Train tab, select the current week's
  White repertoire. `RepertoireList` shows a "Week" badge (`rep.weekBadge`) on week repertoires.
- New i18n keys in `en` and `it`: week name parts, grouping label `week.grouping.random`,
  `rep.weekBadge`.

## Testing

- Core unit tests: `weekId` (year boundaries, e.g. 2026-12-31 and 2027-01-01), `weekOf`/`weekSource`,
  `planWeek` (archive past, keep current, create missing, no recreation after manual archive),
  `weekRepertoire` (deterministic for a week, differs across weeks, 3 lines, correct side,
  distinct practice lines, names present in `data/openings/*.tsv`).
- E2E: fresh profile → the repertoire list has `Week NN · White · …` and `… · Black · …` with
  3 lines each; Training selects the White one; the Openings tab has no "Today". Existing
  Today/daily-mix e2e tests are removed or rewritten against Explore.
- Full check before push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

## Out of scope

- Real groupings (rare / popular / shared moves) — separate design.
- Bringing due moves back after a week ends — to be designed.
- Opponent replies / book theory in week repertoires (option B/C, later).
