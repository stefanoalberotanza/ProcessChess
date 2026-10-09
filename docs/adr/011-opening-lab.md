# ADR 011 — Opening lab

- Status: accepted
- Date: 2026-10-09

## Context

The Openings tab worked like a notebook: browse the theory, save lines. The project is a lab: the
user should rebuild openings again and again until the moves are automatic, and every attempt
should be kept.

## Decision

- **Navigation by level** (revised): a click on an opening _enters_ it — the board moves to its
  position and the list shows the next level; ▶ practises it. The **by name** list is a
  hierarchy built from the dataset names (`buildNameTree`: Family → Variation → Subvariation;
  150 families, 3,280 levels, 103 of them groups without a position of their own), with a
  breadcrumb to go back up. The level shown follows the board: it is the name of the position
  (deepest named one on the path), so moves played on the board, the graph or the move list move
  the level too. Because names and moves do not nest the same way (a variation can be reached
  through moves named after another family, and a family can be a piece of another one's line),
  the hierarchy is by name while the position decides where you are; book moves that lead into
  another family show its full name.
- The Openings tab lists openings to practise in two categories, each with its progress:
  - **by move**: the 8 most played book moves from the board position (with "→" to go there
    without practising);
  - **by name**: the variations of the current level (families at the start), most used first,
    ranked by the dataset lines that reach them; 12 shown, "show all" for the rest.
    Search results can be practised as well.
- **White and Black openings**: an opening belongs to the side that plays its defining move —
  the last move of the shortest dataset line with its name (`NameNode.side`, `moverOfLast`):
  1.e4 c5 Sicilian Defense is Black's, 3.Bc4 Italian Game is White's. Lists mark it with ○ / ●,
  the by-name list and search can be filtered by side, and a practice session shows the board
  from that side (both sides are still played).
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
