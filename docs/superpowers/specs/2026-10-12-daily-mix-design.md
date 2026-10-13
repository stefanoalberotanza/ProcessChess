# Daily mix and shorter "Continues into" — design

Date: 2026-10-12

## Goal

Make the Openings panel push the user to learn: a small "daily mix" of variations to practise,
built from what they already practised, stable for the day. "Continues into" becomes shorter.
Out of scope (separate sub-project): adding openings to a repertoire from the lists.

## 1. Shorter "Continues into"

- Show the first **3** continuations (already ordered by popularity); a "Show all (N)" button
  (`lab.showAllContinuations`) reveals the rest. The section moves below the by-name list
  (it already is) and keeps hiding when empty or on a custom start.

## 2. Daily mix

### Composition (5 entries)

Candidates are the non-family nodes of the name tree (`NameTree`), each with its practice line
(`openingLine(graph, node.ucis)`) and its lab summary (`runs`, `cleanStreak`, `lastAt`,
`lastClean`) when practised.

| Kind     | Slots | Candidates                                                 | Preference                   |
| -------- | ----- | ---------------------------------------------------------- | ---------------------------- |
| `almost` | 2     | practised, `cleanStreak < masteredStreak`                  | most recent `lastAt` first   |
| `review` | 2     | `cleanStreak >= masteredStreak`                            | oldest `lastAt` first        |
| `new`    | 1     | never practised, sibling (same parent) of a practised node | most popular (`lines`) first |

- Within each kind the preferred candidates form a pool of up to `3 × slots`; slots are drawn
  from the pool with the seeded random generator, so the mix varies without losing focus.
- Unfilled slots go to the other kinds in the order almost → review → new.
- No practised line at all → 5 entries drawn from the 15 most popular variations
  (`kind: 'new'`).
- A node never appears twice; total < 5 when there are not enough candidates.

### Stable randomness

- Seed = hash of `${day}:${shuffle}` where `day` is the local date `YYYY-MM-DD` and `shuffle` a
  counter. Generator: a small deterministic PRNG (mulberry32) in core — no dependency.
- The web app stores `{ day, shuffle }` in `localStorage` (key `pc.mix`), wrapped in try/catch;
  a different day resets `shuffle` to 0; unavailable storage → `shuffle = 0`.
- "🎲 Change" increments `shuffle`.

### Core API — `packages/core/src/lab/mix.ts` (tests first)

```ts
export type MixKind = 'almost' | 'review' | 'new';
export interface MixSummary {
  runs: number;
  cleanStreak: number;
  lastAt: number;
  lastClean: boolean;
}
export interface MixEntry {
  node: NameNode;
  kind: MixKind;
}
export function dailyMix(opts: {
  tree: NameTree;
  summaryOf: (node: NameNode) => MixSummary | undefined;
  day: string; // YYYY-MM-DD
  shuffle: number;
  masteredStreak: number;
  size?: number; // default 5
}): MixEntry[];
export function seededRandom(seed: string): () => number;
```

`lastAt` is Unix ms (the web passes `summary.lastAt.getTime()`).

### Web — `ExplorePanel.svelte` (or a new `DailyMix.svelte` used by it)

- Top of the panel, above search: heading `mix.title` ("Daily mix" / "Mix del giorno"), progress
  `mix.progress` ("{done}/{total} done today" / "{done}/{total} fatte oggi"), button
  `mix.shuffle` ("Change" / "Cambia").
- Rows: kind tag (`mix.kind.almost` "almost there"/"quasi fatta", `mix.kind.review`
  "review"/"ripasso", `mix.kind.new` "new"/"nuova"), `SideMark`, name (ellipsis + title),
  `Mastery`, ▶. Click on the name → `onjump(node.ucis)`. ▶ → `onpractice(mixItems, i)` so the
  whole mix is the practice queue.
- **Done today**: `lastClean` and `lastAt` on the local current day → row shows ✓ and counts in
  `mix.progress`.
- **Stable goal**: the entries are computed once per `(day, shuffle)` and kept in component
  state, so practising a line does not swap it out of the mix; later summary changes only
  update the ✓, the dots and the progress count.
- Hidden while the graph or the dataset is not loaded.

### Edge cases

- Custom-start collection: the mix does not depend on the board, so it stays visible.
- Fewer than 5 candidates: show what exists.
- Day change while the app is open: picked up at the next mount of the panel (no timer).

## Testing

- Vitest `mix.test.ts` with a synthetic `NameTree` (as in `rollup.test.ts`):
  - same `(day, shuffle)` → same entries; different `shuffle` → a different selection;
  - 2 almost + 2 review + 1 new when candidates exist; kinds match their definitions;
  - unfilled slots move to other kinds; total capped by candidates;
  - no history → popular variations, kind `new`;
  - `new` entries are never practised and are siblings of a practised node;
  - no duplicates.
- Vitest `seededRandom`: deterministic, values in [0, 1).
- Playwright:
  - fresh page → "Daily mix" with 5 rows;
  - after one run with a mistake, that variation shows as "almost there";
  - "Change" alters at least one row;
  - "Continues into" shows at most 3 rows at Normal Variation, "Show all" reveals more.
- Full gate as usual (three known CRLF failures on this checkout).
