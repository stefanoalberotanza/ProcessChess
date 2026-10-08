# ADR 004 — Content kinds and evaluation modes

- Status: accepted
- Date: 2026-10-08

## Context

Beyond openings the app will train famous games, famous mates, tactical patterns and endgames.
They differ in where they start and in what counts as a right answer.

## Decision

- A `collection` has a **kind**: `opening | game | mate | pattern | endgame`.
- Every collection starts from **`start_fen`** (the standard position for openings and games,
  any legal FEN otherwise) and has a root `node` for that position. `user_color` says which side
  the user plays.
- Moves form a tree of `node`s (`parent_id`, UCI + SAN, EPD of the resulting position).
- Two **evaluation modes** (`eval_mode`):
  - **`exact`**: the user must play the repertoire move. Sibling user-move nodes under the same
    parent are **accepted alternatives**; `ord = 0` is the main line, played by default.
    Playing an alternative is accepted and the drill continues in its subtree (ADR 006).
    Used by openings, games, mates and patterns.
  - **`result`**: any move that preserves the theoretical result (win/draw) is accepted,
    checked with an endgame **tablebase**. Used by endgames. **Not implemented yet.**
- Opening classification (`opening_eco`, `opening_name`) is optional metadata on nodes,
  computed with `resolveOpening` (only meaningful from the standard start position). In M1 the
  UI computes it on the fly and the columns stay empty.
- M1 imports every PGN as an `opening` collection with `eval_mode = 'exact'`; a FEN header is
  honoured as `start_fen`, but drills from arbitrary positions are M3.

## Consequences

- One drill engine for every kind; only the move judge differs by `eval_mode`.
- `result` mode will need a tablebase source (online Lichess API or local Syzygy files) and a
  decision on offline behaviour; deferred.
