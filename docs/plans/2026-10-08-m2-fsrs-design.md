# M2 — FSRS scheduling, due review and daily statistics (design)

- Date: 2026-10-08
- Status: implemented (see ADR 003 and ADR 009)
- Decisions were taken without a live Q&A; each one names the alternative it rejected.
- Builds on: ADR 002 (storage), ADR 003 (spaced repetition), ADR 006 (line drill)

## Goal

Every user move becomes an FSRS card (ts-fsrs). Every attempt — in the M1 line drill or in the
new review — updates its card. A **review** mode asks only the moves that are due, inside
their lines. **Daily statistics** show what was done today and over the last days.

## Decisions

### 1. Cards are derived from the attempt log

- A card is the fold of the attempts of its node, in log order: `reviewCard(card | null,
attempt)` in `@processchess/core` (pure, deterministic: fuzz off, `now` = attempt `ts`).
- A node with no `card` row is **new**. The row is created by the first attempt, not at import
  time, so tree edits never have to keep cards in sync.
- `Storage.recordAttempt` appends the attempt and upserts the card and the daily stats **in one
  transaction**, and returns `{ attempt, card }`.
- `card` and `daily_stat` are derived: `Storage.rebuildDerived()` deletes them and replays the
  whole log. `migrate()` calls it when some attempted node has no card (M1 data, or a crash
  between versions). `attempt` stays append-only.
- Rejected: creating cards at import (needs sync on every tree edit, and fills the table with
  cards that are never trained).

### 2. Which nodes are cards that can be due

- **Scheduled moves** of a tree = user nodes that lie on a line of `enumerateLines` (main user
  move at each decision point, every opponent branch). Only those count as new/due/learned and
  are asked in review.
- An alternative user move played in a drill records its attempt on the alternative node, so it
  gets a card too, but that card is ignored for due counts (it is not asked). If the user later
  promotes it with "Make main line", its card history is already there.

### 3. Rating

| attempt                        | rating |
| ------------------------------ | ------ |
| `correct`, `time_ms` ≤ 2000 ms | Easy   |
| `correct`                      | Good   |
| `hint` with hint level 1–2     | Hard   |
| `hint` with level 3 (move)     | Again  |
| `wrong`                        | Again  |

The fast threshold (`easyMs`) is a `ScheduleOptions` field with default 2000. FSRS parameters
are the ts-fsrs defaults (retention 0.9, short-term steps 1m/10m, fuzz off).

Rejected: rating `hint` level 3 as Hard — being shown the move is not recalling it.

### 4. Review drill

- `startReviewDrill({ tree }, dueIds, options)` reuses the line drill engine with an **ask
  set**. Lines are taken in tree order; a line enters the queue if it contains a due node not
  covered by an earlier line, and in that line only those nodes are asked. All the other user
  moves of the line are **played automatically** (like opponent moves), so the user always
  sees the sequence that leads to the move being reviewed.
- Each due card is asked **once per review**. A wrong answer (Again) is replayed immediately as
  in M1 and rescheduled by FSRS into a learning step (minutes); at the end of the queue the page
  offers "Review again" when something is due again, and otherwise shows the next due time.
- A review pass records attempts (→ cards) but **no `line_pass`**: the clean streak of ADR 006
  is about playing whole lines, and a review asks only part of one.
- Review covers due cards only. New moves are introduced by the existing line drill ("Train"),
  whose attempts create the cards. Rejected for M2: a "new cards per day" quota inside review.
- Review is per collection (`/drill?id=…&mode=review`). Rejected for M2: one review across all
  collections (needs a multi-tree queue; the home page lists the due count of each collection
  instead).

### 5. Daily statistics

- `daily_stat` is updated in the attempt transaction for two scopes: `collection` (key =
  collection id) and `kind` (key = collection kind). Day = local calendar day of the attempt
  (`dayKey(date)` in core, `YYYY-MM-DD`). Columns: attempts, correct, hint, wrong, new cards
  (first attempt of a node), time.
- Global totals = sum of the `kind` rows of a day.
- Core helpers: `dayKey`, `fillDays` (last N days with zeros), `streak` (consecutive days with
  attempts ending today or yesterday), `cardCounts(tree, cards, now, endOfDay)` →
  `{ total, new, learning, review, dueNow, dueToday, nextDue }`.
- `/stats` page: today (moves reviewed, first-try rate, new moves, time), streak, a 30-day bar
  chart (inline SVG with a table fallback for screen readers), and a per-collection table (due
  now, due today, new, total).
- Home: a "Due" column, a "Review (n)" link when n > 0, and a "Statistics" link in the header.

## Testing

- Core (TDD): rating mapping, `reviewCard` sequences (new → learning → review, lapses),
  replay = incremental, `cardCounts`, review drill (ask set, auto-played user moves, coverage,
  no pass), stats helpers.
- DB: `recordAttempt` writes card + both daily_stat scopes atomically; `rebuildDerived`
  reproduces exactly the incremental state; `migrate` backfills M1 attempts.
- E2E: train a line, move the browser clock forward (`page.clock.setFixedTime`), the home page
  shows due moves, review them, statistics page shows today's numbers.

## Out of scope

FSRS parameter optimisation, per-user retention setting, cross-collection review, sharing cards
by EPD across collections, sync.
