# ADR 011 — Opening lab

- Status: accepted
- Date: 2026-10-09

## Context

The Openings tab worked like a notebook: browse the theory, save lines. The project is a lab: the
user should rebuild openings again and again until the moves are automatic, and every attempt
should be kept.

## Decision

- The Openings tab lists openings to practise in two categories, each with its progress:
  - **by move**: the 8 most played book moves from the board position (with "→" to go there
    without practising);
  - **by name**: the 10 most used named openings after the board position, ranked by the
    dataset lines that reach them (`popularOpenings`), one per distinct practice line
    (`practiceByName`: several names share the same first moves, the most used name is kept).
    Search results can be practised as well.
- **Practice line** (`openingLine`): the chosen moves extended with the most played book moves
  to 8 plies — the first 4 moves of each side. An opening defined by more moves (e.g. the
  Najdorf, 10 plies) keeps its whole defining line.
- **Recall session** (`startRecall`/`submitRecall`/`recallHint` in core): the user plays every
  move of the line, **both sides**, from the initial position. A wrong move reveals the right one
  with an arrow and must be replayed; hints are graded (piece, square, move) as in the drill.
  R repeats, Space moves to the next opening of the same list.
- **History** (append-only, `@processchess/db`, migration 0002):
  - `lab_attempt`: one row per move of a recall, keyed by the **opening-graph edge** it
    exercises (EPD of the position before + UCI). Openings that share moves share their history,
    which is the history of the nodes and edges walked in the graph.
  - `lab_run`: one row per completed recall of a line (errors, hints, clean, time).
- **Automatic**: 3 clean runs in a row (no mistake, no hint). Lists show the progress as dots;
  the session shows the runs of the opening and, per move, the first-try rate and last results.
  The Graph tab colours edges green when the last 3 attempts were right and red after a recent
  mistake.
- The lab is separate from repertoires and FSRS: it needs no collection.

## Consequences

- The lab history is independent from `attempt`/`card`; daily statistics and FSRS do not count
  lab runs yet. Scheduling lab openings with FSRS (per edge) is a natural next step.
- Popularity is the count of named dataset lines, not game frequency.
