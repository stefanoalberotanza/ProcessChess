# ADR 012 — Opening classification: label › opening › variation

- Status: accepted
- Amended 2026-10-15: the name tree used by the UI has no families: openings are the roots
  (King's / Queen's Pawn Game are not openings; their variations are). See
  docs/superpowers/specs/2026-10-15-lines-view-design.md and "Name tree (2026-10-15)" below.
  Classification labels are unchanged.
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

**Family, subfamily, variation (2026-10-09).** The three levels are shown as Family (the label:
King's / Queen's Pawn Games, Flank openings), Subfamily (`opening`) and Variation, each with its
moves. A family holds either subfamilies or variations directly, never an opening that only has
variations:

- the style's own dataset name ("King's Pawn Game", "Queen's Pawn Game") is not an opening: its
  variations (King's Head Opening, 1.e4 e5 2.f3) are variations of the family;
- a dataset family with fewer than two distinct variations (Bongcloud Attack) is not an opening
  either; its full name is a variation of the family;
- everything else keeps being a subfamily (Italian Game, Sicilian Defense).

The test is on the dataset as a whole (variation counts per family are computed once when first
needed), not on the line, so it is stable across transpositions. Flank openings have no own
name, so English Opening and Zukertort Opening stay subfamilies of the flank family.
`reclassifyOpenings()` now revisits every standard-start collection (unchanged rows are not
written) so that nodes stored under older rules follow the current ones.

The opening lab's by-name tree (`buildNameTree`, ADR 011) followed the same model until
2026-10-15, with the three families as roots. It no longer does: see "Name tree (2026-10-15)"
below. The family / subfamily / variation levels above now describe only the classification
stored on repertoire nodes and used by the opening bar and the statistics.

Opening traps are not catalogued in the dataset, which is why some branches (1.e4 e5 2.f3) stop
early. That is a dataset gap, not a labelling rule; a layer for traps and custom lines can be
added later.

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

**Continues into (2026-10-12).** The by-name tree stays name-based, so a level can have no
sub-variations while other openings are played from its position (King's Knight Opening: Normal
Variation → Ruy Lopez, Italian Game, Scotch Game). Explore shows them below the by-name list as
"Continues into": `continuationsFrom(graph, ucis)` walks the opening graph breadth-first (EPD
nodes, transpositions merged; at most 12 plies) and stops each path at the first named position
of another family. The style's own name (King's / Queen's Pawn Game, `LABEL_OWN_FAMILY`) is
never a stop; flank one-move names (English, Zukertort) are. Names come from a node → name map
built once from the dataset; no generated file changes.

**From this position (2026-10-13).** "Continues into" is replaced by the Explore tab "From this
position": `branchesFrom(graph, ucis)` lists every next name reachable by moves (same family
included; ancestors and the style's own name are walked through), grouped by family/subfamily
with the single variations on demand. A group leads to the `commonPrefix` of its branches —
where its subfamily turns into variations; when they diverge right at the board position, the
group's variations open instead. A group's "main line" is its most played variation, practised
as that variation (subfamilies stay containers, ADR 011).

**Name tree (2026-10-15).** `buildNameTree` (core, `lab/names.ts`) is the hierarchy shown by the
Lines view, the repertoire panel and Training. It has two kinds of level, `opening` and
`variation`, and no families:

- **Roots are openings**, most played first: every dataset family (text before the colon) is an
  opening, including one with fewer than two variations (Bird Opening, Bongcloud Attack).
- **The style names are not openings.** "King's Pawn Game" and "Queen's Pawn Game" are not in the
  tree; each of their variations is an opening of its own (key: the full dataset name, label: the
  variation part, e.g. "King's Head Opening").
- **No duplicate openings (2026-10-16).** When a style variation has the name of a dataset
  opening ("Queen's Pawn Game: London System" and "London System", also Torre Attack, Colle
  System, Modern Defense, Gunderam Defense, Dresden Opening), it is not an opening: the dataset
  opening absorbs it and keeps its own main line, ECO and position. The style variation's own
  variations move below that opening ("London System: Pterodactyl Variation"), merging with a
  variation of the same name, and `nodeForName` resolves the old names to their new level. Every
  opening label is unique.
- **Splitting a name** (`nameSegments`): "Family: Variation, Subvariation" gives one level per
  segment. A name without a colon is cut at its commas, as `splitOpeningName` does, so
  "French Defense, Classical, 4. Bg5" hangs below French Defense (11 dataset names have no
  colon). Exception: a name that is itself a dataset family stays whole ("Vienna Gambit, with Max
  Lange Defense", whose variations are "Vienna Gambit, with Max Lange Defense: …").
- **Key and name.** The key of a level is its segments joined back (`joinSegments`), so it can
  differ from the dataset name ("London System: with Bd3" for "London System, with Bd3").
  `NameNode.name` holds the dataset name of the level's own position; `nodeForName` accepts
  either form.
- **Groups.** A level that the dataset never names exactly, or names only at one move with
  variations below (English Opening), has no position of its own: `own` is false, `name` is null
  and it borrows the moves of its most played child. Groups are containers: they are never
  practised and never picked for a week repertoire.

With the dataset at the commit in `data/openings/README.md` the tree has 180 openings and 3,274
levels, 120 of them groups. When the absorbing opening is itself a group (Torre Attack, Colle
System, Dresden Opening), its main line is still that of its most played variation. One dataset
quirk remains visible: "Queen's Pawn, Mengarini Attack" makes "Queen's Pawn" an opening.
