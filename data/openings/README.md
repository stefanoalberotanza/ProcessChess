# Opening names dataset

`a.tsv` … `e.tsv` are copied unmodified from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
at commit `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`.

Columns: `eco`, `name` (`Family: Variation, Subvariation`), `pgn`.

## License

Upstream: "As a collection of facts, this data set is in the public domain. […] Insofar as
that qualifies for copyright, the work is released under the
[CC0 Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/)."

The files are therefore not covered by this repository's GPL license.

## Regenerating

`pnpm build:openings` replays every line with chess.js and writes
`packages/core/src/openings/openings.json` (EPD + UCI per entry). Commit both the TSV and the
JSON when updating.
