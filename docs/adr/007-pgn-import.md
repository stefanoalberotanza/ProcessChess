# ADR 007 — PGN import and export

- Status: accepted
- Date: 2026-10-08

## Context

Users bring repertoires as PGN files, often Lichess study exports, with nested variations and
comments. chess.js reads only the main line of a PGN, so it cannot build a repertoire tree.

## Decision

- A small **PGN parser in `@processchess/core`** (`parsePgn`), driven by tests, with no new
  dependency: multiple games, headers (escaped quotes), nested variations (RAV), `{}` and `;`
  comments, `%` escape lines, NAGs and `!?` suffixes ignored, all result tokens. Every move is
  then validated with chess.js while building the tree.
- Lichess/ChessBase **`[%cal]`, `[%csl]`, `[%clk]`, `[%eval]`** commands are stripped from comments;
  comments that become empty are dropped. Several comments after a move are joined.
- **Start position**: the `FEN` header when present (with or without `SetUp`), else the initial
  position. All games of an import must start from the collection's start position
  (`PgnStartPositionError`).
- **Merge**: `importPgn(tree, games)` reuses existing nodes (matched by UCI) and appends new
  siblings after the existing ones, in PGN order; in a new collection `ord` follows the PGN (main
  line = 0). A comment imported on an existing node is appended unless already present.
- **Errors**: `IllegalMoveError` carries the 0-based `gameIndex` and the `ply`;
  `PgnSyntaxError` carries the `gameIndex`.
- **Export** (`exportPgn`): one game, siblings in `ord` order as nested variations, comments,
  `SetUp`/`FEN` headers for non-standard starts. Import → export → import yields the same tree
  (tested on a hand-written repertoire and on a Lichess-study-style fixture).
- Moves are typed in the drill as SAN with English piece letters (standard PGN).

## Consequences

- The Lichess study fixture is hand-written in Lichess's export format (lichess.org is not
  reachable from the build environment); it should be replaced by a real export when possible.
- The user colour is chosen at import time; Lichess's `Orientation` header is parsed but not yet
  used as the default.
