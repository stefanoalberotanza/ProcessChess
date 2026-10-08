# ADR 010 — Opening graph and single workspace

- Status: accepted
- Date: 2026-10-08

## Context

Importing a PGN should not be the way in: the ECO dataset already contains 3,865 named lines.
The UI was also split into separate pages (collections, collection, drill) that each showed one
thing at a time.

## Decision

### Opening graph (`@processchess/core`)

- `pnpm build:openings` also generates `opening-graph.json`: every position of every dataset
  line (7,983 positions, 8,192 moves), transpositions merged. Each node holds its book moves and
  the number of dataset lines through each move (a popularity proxy; the dataset has no game
  statistics). Nodes are keyed by a 32-bit FNV-1a hash of the EPD (the build fails on a
  collision); node 0 is the initial position. ~210 kB, its own lazy chunk (`loadOpeningGraph`).
- API: `bookMoves(graph, fen)` (SAN, line count, name of the resulting position),
  `bookLinesFrom(graph, fen, userColor)` (repertoire lines: the user's side plays the most
  common book move, every opponent reply is kept), `searchOpenings(graph, query)` (all words of
  "ECO name", shortest line first, with the moves to reach it), `graph.pathTo(node)`.
- The drill can be limited to the lines through a node (`throughNodeId`).

### Workspace (`apps/web`, single route `/`)

- Three columns sharing one board position (a list of UCI moves):
  - left: repertoires (colour, clean lines, last training), "New repertoire", "Import PGN";
  - centre: opening bar, board, navigation, SAN input, clickable move list, and "add this line
    to the repertoire" (with one-click White/Black default repertoires when none is selected);
  - right, tabs: **Openings** (search, book moves from the graph, "add the theory from here"),
    **Repertoire** (move tree, comments, main line, delete, move history), **Training** (review
    of the moves due now — FSRS, ADR 009 — and line drill of the selected repertoire, all lines
    or only those through the board position).
- The drill takes over the board while it runs (`DrillController` in `$lib/drill.svelte.ts`);
  leaving the tab ends the session.
- Moves due for review are counted on each repertoire and in a summary above the list.
- Deep links: `/?c=<collection>&tab=<explore|repertoire|train>[&mode=review]`; `/stats` links
  back into the workspace. The old `/collection` and
  `/drill` pages are removed.
- PGN import stays as a secondary action (dialog).

## Consequences

- A user can build and train a repertoire from the dataset without any file.
- "Add the theory from here" near the start position produces hundreds of lines; it is capped
  at 200 lines per click.
- Popularity is the count of named dataset lines, not real-game frequency.
