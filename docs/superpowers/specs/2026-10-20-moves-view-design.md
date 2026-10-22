# Moves view in Explore — design

Date: 2026-10-20. Status: draft for approval.

## Intent

Exploring openings by moving pieces on the board, the user wants to know "from here, which move
do I play to enter an opening that exists?" Today the Explore tab shows reachable openings and
variations as a grid of cards with a miniature of the final position (`LinesView`). That answers
"which openings are ahead", not "which single move comes next". After `1.e4 c5` the user wants to
see the next moves first, and the lines behind each move second.

## Goals

- A second view in the Explore tab, "Moves", next to the current one, "Lines".
- Lists the moves playable from the board position that still lead into an opening of the
  dataset, one heading per move (`2.Nf3`, `2.Nc3`, `2.c3`…).
- Two separate groups, by who owns the opening: "White's openings" and "Black's openings"
  (the opening side the app already derives, `openingSide`). The same move can appear in both
  groups, each time with its own openings and counts.
- Under each move: how many openings and lines are behind it, the most important opening and
  variation names, and one example line, all as text. No miniature boards.
- Touching a move plays it on the board. The play (▶) and add (+) actions work as in `LinesView`.

## Non-goals

- No change to the Graph tab, the repertoire logic, the drill or the lab.
- No new data: names, ECO, sides and moves come only from the dataset (AGENTS.md rule 4).
- No new dependency.

## Anti-goals

- It must not become a second archive of cards. If it reads like the grid again, it failed.
- It must not show moves that lead nowhere in the dataset.

## Decisions made with the user

- Form: moves as headings, lines under them as text only (option A of the mockup).
- Grouping: two separate groups, White's and Black's openings (not a filter).
- Position: a "Lines | Moves" switch in the Explore tab above the list. "Moves" replaces the card
  grid; the search box and the "add book" button stay.
- Order: moves with more openings behind them first.
- Under each move: the main opening and variation names plus one example line; a "show all"
  opens the rest.

## Constraints

- Logic in `packages/core` (pure, with tests written first, AGENTS.md rules 1 and 5). The UI
  calls only core and db. Every string goes through `t()` with `en` and `it` keys.
- Works only from the standard start (`standardStart`), as `LinesView` does.
- Needs the loaded opening graph; shows the existing loading state without it.

## Builder's calls (not discussed with the user, easy to change)

- Core function `movesFrom(graph, tree, ucis)` next to `linesFrom` in `packages/core/src/lab/`.
  For each child move of the board position it walks the graph below it (transpositions
  included, like `linesFrom`) and collects the openings and variations reached, then buckets
  them by opening side. Returns, per side, the moves with SAN, UCI, opening count, line count
  and the nodes, sorted by opening count then line count then SAN.
- Openings with side `both` appear in both groups.
- Remembering the chosen view (Lines or Moves) per browser in localStorage is optional; default
  is "Lines" so existing behaviour and e2e tests do not change.
- Example line: the practice line of the most played opening behind the move, shown as SAN.
- Mobile: single column, groups stacked.

## Builder's calls, from the check (also not discussed with the user)

- **Counting:** "lines" is `NameNode.lines`, as `linesFrom` sorts by it; "openings" is the number
  of distinct root openings (`openingOf`) behind the move. Each node is counted once per move,
  however many paths reach it (the walk keeps a seen set, like `linesFrom`).
- **What qualifies:** a move appears only if a named node (a dataset entry) sits on the position
  after it or anywhere below it. A move that only prefixes unnamed positions is left out.
- **Side:** globally, not relative to the board position. A node of kind `opening` is bucketed by
  its `owner` (`both` shows in both groups); a node of kind `variation` by its own `side` (the
  side that plays its defining move). This is why `Sicilian Defense: Alapin Variation` (after
  `2.c3`) lands under White's openings although the Sicilian itself is Black's. (Corrected after
  the builder check: an earlier draft bucketed variations by their root opening, which would put
  the Alapin under Black and contradict the example.)
- **"Most important" names:** ranked by `NameNode.lines` descending, then key; the default shows
  the top 3 names per move, "show all" the rest. No popularity data is used.
- **Example line:** the practice line (`practiceLine`) of the top-ranked node, shown as SAN from
  the start, with the played move first in the continuation. Core returns UCI; the UI formats
  with the existing `sanLine`.
- **Actions:** touching the move heading plays it. ▶ and + sit on each opening or variation name
  under the move and act on that node exactly as in `LinesView` (`onpractice`, `onadd`,
  `inRepertoire`), not on the move.
- **Search box:** unchanged. It keeps listing search results above the view; it does not filter
  the moves.
- **Not available:** when the graph is not loaded, or the collection is not from the standard
  start, the switch is hidden and the Lines behaviour is unchanged. At a position with no move
  into any opening, the view shows a short "no openings ahead" message.
- **View memory:** out of scope.

## Left to the builder

Component split (a new `MovesView.svelte` next to `LinesView.svelte` is the expected shape),
exact copy of the labels, styling, and the e2e coverage (at least: after `1.e4 c5` the Moves
view lists `Nf3` and `c3`, with `c3` under White's openings; names asserted from
`data/openings/*.tsv`).
