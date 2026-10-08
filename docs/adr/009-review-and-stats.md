# ADR 009 — Review of due moves and daily statistics

- Status: accepted
- Date: 2026-10-08
- Design notes: [docs/plans/2026-10-08-m2-fsrs-design.md](../plans/2026-10-08-m2-fsrs-design.md)

## Context

M2 schedules every user move with FSRS (ADR 003). The user needs a way to train only what is
due, without losing the sequence that leads to each move, and to see what was done each day.

## Decision

### Review drill

- `startReviewDrill({ tree }, dueIds)` in `@processchess/core` reuses the line drill engine
  (ADR 006) with an **ask set** per line. Lines are taken in tree order; a line is queued when
  it contains a due move not asked by an earlier line, and only those moves are asked in it.
  Every other move — opponent replies and user moves that are not due — is **played
  automatically** and announced ("Played for you: …"), so the move under review is always
  reached through its sequence.
- Each due move is asked once per review. Wrong moves and hints work as in the line drill;
  the attempt updates the card, so a forgotten move comes back after a learning step (minutes).
  At the end the page offers "Review again" when moves are due again, otherwise the next due
  date.
- A review records attempts (and therefore cards and stats) but **no `line_pass`**: the clean
  streak is about whole lines.
- Playing an accepted alternative instead of a due move records the attempt on the alternative;
  the due move stays due.
- Review is per collection: `/drill?id=…&mode=review`. The home page shows the moves due now
  per collection, with a "Review (n)" link.
- New moves are not introduced by the review: the line drill ("Train") creates their cards.

### Daily statistics

- `daily_stat` is written in the attempt transaction for scope `collection` (key = collection
  id) and scope `kind` (key = collection kind); global totals sum the `kind` rows. The day is
  the **local** calendar day of the attempt (`dayKey`). Counters: attempts, correct, hint, wrong,
  new cards (first attempt of a move), time.
- `/stats`: today (moves played, first-try rate, new moves, time, streak), a 30-day bar chart
  (SVG with a table for screen readers and a hover tooltip) and, per collection, moves due now,
  due today, learning, new and total.
- The streak counts consecutive days with attempts ending today, or yesterday when nothing was
  done today yet.

## Consequences

- One engine for learning and review; the UI differs only in the counter and the end screen.
- Stats are keyed by the local day at recording time: changing time zone does not move past
  attempts to other days. A rebuild (`rebuildDerived`) uses the current time zone.
- Cross-collection review, a daily quota of new moves and FSRS parameter optimisation are left
  for later.
