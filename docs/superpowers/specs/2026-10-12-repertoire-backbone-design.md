# Repertoire backbone: one memory, one daily session — design

Date: 2026-10-12

## Problem

Three ways to practise do not talk to each other:

| Surface      | Unit                             | Progress                              |
| ------------ | -------------------------------- | ------------------------------------- |
| Drill/review | repertoire node (`attempt`)      | FSRS `card` per user move, due dates  |
| Opening lab  | graph edge (`lab_attempt`) + run | clean streak per **line** (`lab_run`) |
| Today card   | name-tree variation (daily mix)  | lab runs only                         |

Adding a variation to the repertoire ("+") does not affect the mix; practising it in the lab does
not move its FSRS schedule; "done today" and "to review" mean different things in different
places; line-keyed lab progress was reset when practice lines changed.

## Principle

**The repertoire is the centre; FSRS is the only clock.** What the user wants to learn lives in a
repertoire. Every time the user plays one of _their_ repertoire moves — in the drill or in the
lab — the same FSRS card is updated. The daily session is built from FSRS. The lab without a
repertoire stays as "explore and try" and does not pretend to schedule anything.

## Key observation

A repertoire node is a user move; `node` already stores the EPD of the position it reaches
(`node.epd`, indexed) and its UCI. A lab move is a position plus a move, so its resulting EPD and
UCI identify the same node — matching by position, so transpositions count. The lab can find "the
card for this move" without new tables.

## Scope (this spec)

### A. Lab moves feed FSRS

- When a lab recall checks a move **of the user's side** with expected `uci`, the app looks for
  repertoire nodes for that move in **non-archived collections of the user's colour** (the side
  being practised), via `repertoireMovesAt` below.
- For each match, an FSRS attempt is recorded with the existing `recordAttempt` (same result:
  correct / hint / wrong, `playedUci`, hints, time), in a lab session of that collection
  (`startSession(collectionId, rootNodeId)` once per lab run and collection). `card` and
  `daily_stat` stay derived in the same transaction (existing behaviour).
- `lab_attempt` / `lab_run` keep being written as today (append-only, unchanged).
- Opponent moves never touch FSRS (same as the drill).
- **Decided (review):** a move matches only when the repertoire node is reached by the same
  position, not the same move order — transpositions count, because the card is about knowing the
  move in that position.

Db: `Storage.repertoireMovesAt(epdAfter: string, uci: string, color: 'w' | 'b')` returns
`{ collectionId, nodeId, rootNodeId }[]` — nodes with `epd = epdAfter`, `uci`, `is_user_move = 1`
in non-archived collections whose `user_color = color`. It uses the existing `node_epd_idx`
index; `node.epd` is the position after the move, so the lab computes `epdAfter` from the
position before and the move (core `position` helpers + `toEpd`). No schema change.

### B. The daily session feeds the Today card

Built in core by `dailySession(...)` (pure, tested) from:

1. **Due** — repertoire lines containing at least one user move whose card is due now
   (`dueNodeIds`), most overdue first. A "line" is the path from the root to a leaf of the
   repertoire tree; each due node picks its shortest leaf line.
2. **Learning** — lines whose user moves include cards in state Learning/Relearning (not due).
3. **New** — one variation **not** in any repertoire, sibling in the name tree of a variation that
   is (the "+" suggestion); shown with a "+" instead of ▶ — practising it is exploration until
   added.

- Same Today goal card and list as today (`DailyMix.svelte`: next entry, Practise now, Change,
  "N of M done today", picks stored per `(day, shuffle)` in `localStorage` `pc.mix`); only the
  source of the entries changes, from lab runs (`dailyMix`) to the repertoire (`dailySession`).
- Size 5; slots: as many due lines as exist (up to 5), then learning, then 1 new when a slot is
  free.
- Without any repertoire: the card says "Start here", lists 5 popular variations each with "+",
  and explains in one line that adding one starts the daily session (`mix.empty`).
- **Progress** "N of M done today" counts entries, as the card already does: a repertoire entry
  is done when every user move of its line was reviewed today; a dictionary entry by the lab rule.
  One definition, used everywhere the card appears.
- Practising a session line opens the **lab** on that line (same experience as today, now
  feeding FSRS through A).

### C. Lab progress dots follow FSRS for repertoire lines

- For a variation whose practice line is in a repertoire, `Mastery` shows FSRS state of its user
  moves (all Review = automatic; any Learning/Relearning = in progress; none reviewed = new).
- For a variation not in a repertoire, `Mastery` keeps the lab clean-streak as today.
- Roll-ups count with the same rule.

## Out of scope (later specs)

- Re-deriving progress for non-repertoire lines from `lab_attempt` edges (would also restore
  history lost to line changes).
- Merging the drill UI into the lab UI.
- Streaks, reminders, statistics redesign.

## Migration and data

- No schema change. Existing `attempt`/`card` rows unchanged; existing lab history unchanged.
- From the release on, lab practice of repertoire lines adds rows to `attempt` (append-only) and
  updates `card` (derived, rebuildable — rebuilding from `attempt` reproduces it).
- ADR: new `013-repertoire-backbone.md` recording the principle and decisions above; ADR 003
  (SRS) and 011 (lab) get a pointer to it.

## Testing

- Core (Vitest, tests first):
  - `dailySession`: due lines first, most overdue first; learning next; one new sibling
    variation not in a repertoire; empty repertoire → popular variations; stable per
    `(day, shuffle)`; progress numerator/denominator.
- Db (Vitest, memory adapter):
  - `repertoireMovesAt` finds a user node by resulting EPD + UCI, also when the repertoire reaches
    that position by another move order; ignores opponent nodes, archived collections and
    collections of the other colour;
  - a lab move on a repertoire move writes one `attempt` and updates the `card` in the same
    transaction; a non-repertoire move writes nothing to `attempt`.
- E2e:
  - add the Najdorf with "+", practise it in the lab cleanly → its user moves have cards with
    `reps ≥ 1` (visible: the Repertoire tab shows them not new / the stats page counts today's
    reviews);
  - the daily session card lists the Najdorf line when its card is due (use Playwright clock to
    move past `due`);
  - empty state shows "Start here" with "+" buttons.
- Full gate as usual (three known CRLF failures on this checkout).

## Delivery

Branch `feat/repertoire-backbone` from `release/v1` (`c7649d6`); implement A → C → B (B depends on
A to have data, C is small and makes A visible). The Explore views and the "+" buttons are
unchanged.
