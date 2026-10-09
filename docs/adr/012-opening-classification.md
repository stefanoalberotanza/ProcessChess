# ADR 012 — Opening classification: label › opening › variation

- Status: accepted
- Date: 2026-10-09

## Context

`resolveOpening` names the deepest dataset position reached by a line. Along a Ruy Lopez the
dataset gives "King's Pawn Game" (1.e4), "King's Knight Opening" (2.Nf3), then "Ruy Lopez"
(3.Bb5): studying the Ruy Lopez is not studying the King's Pawn Game, even though one starts
from the other. One-move names (King's Pawn Game, Queen's Pawn Game, English Opening,
Zukertort Opening, … — 20 rows) are styles, not openings. Tracking needs the same split: which
style the user plays, which openings and which variations they know best.

## Decision

`classifyOpening(movesSan)` (core) returns:

- **label** — style from White's first move: `king` (1.e4), `queen` (1.d4), `flank` (anything
  else). One-move dataset names are never openings.
- **opening** — the _family_ (text before ":", or before the first "," when there is no
  colon) of the deepest named position after ply 1. **A change of family name is a new
  opening**: Queen's Gambit Declined is its own opening after Queen's Gambit; the Najdorf stays
  a variation of the Sicilian Defense. The opening starts (ply, ECO) at the first named
  position of the _last contiguous run_ of that family, so A › B › A flickers (e.g. Zukertort
  › King's Indian Attack › Zukertort, 150 dataset rows) resolve to the final family.
  No depth cap: a late transposition into another family changes the opening.
- **variation** — the rest of the deepest name ("Closed", "Najdorf Variation"), with its ECO.
- **ply** — deepest named ply. (The "out of theory" badge uses the opening graph instead,
  `isBookPosition`, since book lines pass through unnamed positions.)

Only meaningful from the standard start position. `resolveOpening` is unchanged.

Persistence: `node.opening_label`, `opening_name` (family), `opening_variation`, `opening_eco`
(variation ECO, else opening ECO) are written by the Storage on import, tree changes and
`addNode` via `classifyTree`; `reclassifyOpenings()` backfills at startup. `openingStats()`
groups attempts by label, opening or variation (archived collections excluded).

## Consequences

- The opening bar reads "King's game · C84 Ruy Lopez › Closed"; after 1.e4 alone it shows only
  the label.
- Opening lab (ADR 011): in the name tree a level named at one move takes a deeper position of
  the same name (King's Pawn Game → 1.e4 e5, C20); a level named only at one move becomes a
  group of its variations (English Opening). Every level has a `style`, and the by-name list
  and search can be filtered by style.
- `openingStats()` also counts opening-lab moves: each is classified by its run's line up to
  that move (`classifyOpeningUci`); moves of unfinished runs have no stored line and are left
  out. The statistics page has a "By opening" section (style / opening / variation, White /
  Black).
- A dataset update can change classifications; re-running the backfill only fills null rows,
  so a full reclassification would need an explicit pass.
- A curated family grouping (e.g. QGD under Queen's Gambit) can be layered on later without
  schema changes.
