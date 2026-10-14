# Lines view — design

- Date: 2026-10-15
- Branch: `refactor/week-repertoire`
- Status: approved in conversation, awaiting spec review

## Goal

Make consulting openings and one's repertoire simpler. No "discovery", no family layer: the
entry point is the **opening**. Explore shows a single view, **Lines**, from the board position;
the repertoire opens into its openings and variations; Training reuses the same view.

## 1. Name hierarchy (core, `lab/names.ts`)

- Two levels: **Opening › Variation** (sub-variations below as today). `NameKind` becomes
  `'opening' | 'variation'`; the `family` kind, `familyKey`, `FAMILY_UCIS` and the three style
  roots are removed. `NameTree.roots` are the openings, most played first.
- The style names **"King's Pawn Game"** and **"Queen's Pawn Game"** (`LABEL_OWN_FAMILY`) are
  **not openings**. Each of their variations becomes an opening of its own (key = full dataset
  name, label = the variation part), so no named line is lost.
- A dataset opening without at least two variations of its own stays an opening (today it was
  demoted to a variation of its family). "Bird Opening" is an opening.
- `nodeForName` keeps resolving every dataset name; the style names themselves resolve to
  `undefined`.

## 2. Whose opening (core, `lab/opening-side.ts`)

```ts
type OpeningSide = 'w' | 'b' | 'both';
const OPENING_SIDE_OVERRIDES: Readonly<Record<string, OpeningSide>>; // e.g. 'Ruy Lopez': 'both'
const OPENING_SIDE_WORDS: readonly (readonly [RegExp, 'w' | 'b'])[];
function openingSide(tree: NameTree, opening: NameNode): OpeningSide;
```

1. The override table wins (starts with Ruy Lopez and Italian Game → `both`).
2. Else the words of the name, first match wins (`OPENING_SIDE_WORDS`): Defense / Declined /
   Accepted / Countergambit → `b`; Opening / Game / Gambit / Attack / System → `w`.
3. Else the side of the opening's defining move (`NameNode.side`).

Amended during implementation: a 25% share-of-variations rule was measured on the dataset and
dropped — a defence's variations are mostly named after White's replies (French 69% White).

`NameNode` gains `owner: OpeningSide` for openings (variations keep `side`). The side filter
shows an opening under a colour when `owner` is that colour or `both`.

## 3. Lines from a position (core, `lab/lines.ts`)

```ts
interface LinesHere {
  /** The opening of the board position (deepest named), null at the start / off book. */
  opening: NameNode | null;
  /** Named openings reachable by moves from here other than `opening`, most played first. */
  openings: NameNode[];
  /** Variations of `opening` reachable by moves from here, most played first. */
  variations: NameNode[];
}
function linesFrom(graph: OpeningGraph, tree: NameTree, ucis: readonly string[]): LinesHere;
```

Built on `branchesFrom` (next names by moves, transpositions included): each branch name maps to
its `NameNode` via `nodeForName`; a branch whose opening (root ancestor) is `opening` is a
variation, otherwise its opening goes in `openings` (deduplicated). At the start position every
opening reachable is listed.

## 4. Explore tab: Lines only (`LinesView.svelte`)

- One view titled **"Lines"** (`lines.title`), replacing the "By name" / "From this position"
  tabs and `NameAlbum.svelte`.
- Above it, kept: one search box (name or FEN), the White / Black / All filter, breadcrumbs
  (opening › variation) to go back up, "Add book theory".
- Two collapsible compact groups, **Openings** and **Variations**: one row per item — side mark,
  name, progress dot (known / learning / new, FSRS or lab streak as today), ▶, + (Explore only).
  First 8 rows, then "Show all (n)". No mini-boards.
- Clicking a row moves the board to it (its own move order where known).
- Removed: "?" tiles, "x / y discovered", depth label, leaf icon, mini-board tiles.

## 5. Repertoire panel

- The card no longer shows "x/y lines clean"; due count and last trained stay.
- The selected repertoire **opens** under its card: its openings and, inside each, its variations,
  from `repertoireNames` (now family-free). Clicking an item moves the board to the repertoire's
  own node for it.

## 6. Training

- Training's album becomes `LinesView` filtered to the repertoire (`repertoireNames` as the tree,
  only names with repertoire nodes). ▶ on an opening or variation drills its lines
  (`throughNodeIds = nodesOf(key)`), as today.

## Kept unchanged

Week repertoires, lab, FSRS, Review, FEN search, drill, `throughNodeIds`, `repertoireNames` API
(roots are now openings).

## Testing

- Core: names (no families, style names not openings, their variations promoted, Bird is an
  opening, every dataset name except the two style names resolves), `openingSide` (override,
  share rule, defining-move fallback — names from `data/openings/*.tsv`), `linesFrom` (start
  position lists openings; inside the Sicilian the Najdorf is a variation and another opening
  reached by moves is an opening; transposed position gives the same result).
- E2E: Explore shows only Lines with the two groups; no "?" anywhere; repertoire card has no
  "lines clean"; a selected repertoire lists its openings/variations and clicking moves the board;
  Training lists the repertoire's lines and ▶ drills. Existing tests on discovery, families and
  "From this position" are rewritten against Lines.
