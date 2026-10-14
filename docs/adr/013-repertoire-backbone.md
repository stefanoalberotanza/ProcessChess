# ADR 013 — Repertoire backbone: one memory, one daily session

- Status: accepted
- Date: 2026-10-13

## Context

Three ways to practise did not talk to each other:

| Surface      | Unit                             | Progress                              |
| ------------ | -------------------------------- | ------------------------------------- |
| Drill/review | repertoire node (`attempt`)      | FSRS `card` per user move, due dates  |
| Opening lab  | graph edge (`lab_attempt`) + run | clean streak per **line** (`lab_run`) |
| Today card   | name-tree variation (daily mix)  | lab runs only                         |

Adding a variation to the repertoire did not affect the Today card, practising it in the lab did
not move its FSRS schedule, and "done today" meant different things in different places.

## Decision

**The repertoire is the centre; FSRS is the only clock.**

- **Lab moves feed FSRS.** When the user plays a move in the lab, `Storage.repertoireMovesAt`
  finds the user nodes with the same resulting position (`node.epd`) and move (`node.uci`) in
  non-archived collections of the colour that played it. For each, the lab records an FSRS
  attempt with the existing `recordAttempt` (expected move, result, played move, hints, time) in
  a session per run and collection. Matching by position and move means transpositions count:
  the card is about knowing the move in that position. Opponent moves never touch FSRS.
  `lab_attempt` and `lab_run` are written as before.
- **Progress of repertoire lines is their FSRS state.** `lineSrsState` (core) reads the cards of
  a line's user moves (`Storage.repertoireCards`, keyed by `edgeKeyAfter`): every move in Review
  → known, all new → new, otherwise learning; `null` when no move has a card, and then the lab
  streak is shown as before. The album, roll-ups and dots use this rule.
- **The Today card is built from the repertoire.** `repertoireSession` (core) lists, for every
  due user move, the shortest repertoire line containing it, most overdue first, then lines with
  moves still being learnt; free slots take dictionary variations not in a repertoire
  (`dailyMix`). Lines branch on the opponent's moves only: sibling user moves are accepted
  alternatives of one line, as in the drill. A repertoire entry is done when every user move of
  its line was reviewed today (`lineReviewedOn`); the card counts entries. Practising an entry
  opens the lab on that line, which feeds FSRS.

## Consequences

- No schema change and no migration. From now on, lab practice of repertoire lines appends rows
  to `attempt` and updates `card` (derived, rebuildable from `attempt`).
- A fast first answer is rated Easy by FSRS (ADR 003) and goes straight to Review, so a line
  practised once quickly shows as known and comes back days later.
- Later: re-derive progress of non-repertoire lines from `lab_attempt` edges (it would also
  restore history lost when practice lines changed, ADR 011); merge the drill into the lab UI.
