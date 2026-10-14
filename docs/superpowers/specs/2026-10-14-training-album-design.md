# Training album — design

- Date: 2026-10-14
- Branch: `refactor/week-repertoire` (builds on the week repertoires)
- Status: draft, awaiting review

## Goal

When a repertoire is selected in Training, the main screen becomes an Explore-like album
(family › subfamily › variation) reduced to the openings of that repertoire. ▶ on a name drills
the repertoire lines under that name.

## Decisions

| Topic                 | Decision                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| Place in Training     | The album is the main screen; "Train all" and "Review" stay as buttons on top |
| Which openings        | Every name the repertoire's lines pass through, with the Explore levels       |
| ▶ on a name           | Line drill limited to the repertoire lines through that name's nodes (FSRS)   |
| Repertoires           | Every repertoire, not only week ones                                          |
| Custom start position | No album: Training shows today's screen                                       |
| Out of scope          | "From this position" and search inside Training                               |

## Core

### `repertoireNames` (`packages/core/src/lab/repertoire-names.ts`)

```ts
interface RepertoireNameTree extends Pick<NameTree, 'roots' | 'get' | 'nodeForName' | 'all'> {
  /** Repertoire node ids where the name (or a descendant level) is reached. */
  nodesOf(key: string): readonly string[];
}

function repertoireNames(tree: Tree, names: NameTree): RepertoireNameTree;
```

- Names each repertoire node by the dataset name of its position (`openingIndex().get(node.epd)`,
  so transpositions count). Needs `loadOpenings()`.
- Keeps every `NameNode` of `names` reached by a repertoire node (by its classification name via
  `names.nodeForName`) and all its ancestors; `children` and `roots` are filtered to kept keys,
  order preserved.
- `nodesOf(key)`: the repertoire nodes whose name is `key` or a descendant of `key`. For an
  ancestor level with no node of its own this is the union of its children's nodes.
- Empty (no roots) when the tree's root is not the standard position.

### Drill through several nodes (`packages/core/src/drill/drill.ts`)

`LineDrillOptions` gains `throughNodeIds?: readonly string[]`: only the lines that go through at
least one of them. `throughNodeId` stays and is equivalent to `throughNodeIds: [id]`.

## App

### `NameAlbum.svelte` (extracted from `ExplorePanel.svelte`)

The "Practise by name" panel (navigation path, levels, tiles, focus card) becomes a component:

- Props: the name tree (`Pick<NameTree, 'roots' | 'get' | 'nodeForName' | 'all'>`), the tile
  progress function, and `onpractise(key: string)`, plus what the current markup already needs
  (graph, SAN rendering, add-to-repertoire hooks — optional, Explore only).
- Explore uses it with the full name tree and the lab, behaviour unchanged.

### Training

- With a standard-start repertoire selected and no drill running: `NameAlbum` on
  `repertoireNames(tree, names)`; buttons "Train all" (existing drill on every line) and "Review"
  (unchanged) above it.
- ▶ on a name: `ctl.start(collectionId, tree, { throughNodeIds: names.nodesOf(key) })`. Stopping
  or finishing the drill returns to the album.
- Tile progress: `lineSrsState` of the name's lines (known / learning / new), as in Explore.
- Custom start: today's Training screen.
- New i18n keys (`en` + `it`) for any new label, e.g. `train.all`.

## Testing

- Core: `repertoireNames` — keeps only present branches plus ancestors, transposed line reaches
  the same names, `nodesOf` unions for ancestors, empty for a custom start; names checked against
  `data/openings/*.tsv`. `throughNodeIds` — union of lines, single-id equivalence.
- E2E: Training with the week White repertoire shows its openings in the album; ▶ on one drills
  only its lines; Explore e2e stays green after the extraction.
- Full check: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
  (known pre-existing generated-file failures excepted).
