/** Shape of the generated `openings.json`: EPD → [ECO code, full name]. */
export type OpeningIndexJson = Record<string, [eco: string, name: string]>;

/** In-memory index used by `resolveOpening`. */
export type OpeningIndex = ReadonlyMap<string, readonly [eco: string, name: string]>;

export interface ResolvedOpening {
  eco: string;
  /** Full name, e.g. "Sicilian Defense: Najdorf Variation, English Attack". */
  name: string;
  /** Text before the colon, e.g. "Sicilian Defense". */
  family: string;
  /** Everything after the colon, e.g. "Najdorf Variation, English Attack"; null if absent. */
  variation: string | null;
  /** Ply (half-move count) of the deepest named position reached by the line. */
  ply: number;
}

/**
 * Shape of the generated `opening-graph.json`: one entry per position, `[epdHash, edges]`,
 * edges as space-separated `uci,childIndex,lines` (indexes and counts in base 36), sorted by
 * lines descending. Node 0 is the initial position.
 */
export interface OpeningGraphJson {
  nodes: [hash: string, edges: string][];
}

/** Style of a line, from White's first move: 1.e4, 1.d4, anything else. */
export type OpeningLabel = 'king' | 'queen' | 'flank';

export interface NamedOpeningPart {
  eco: string;
  name: string;
  /** Ply at which this part starts (opening) or is reached (variation). */
  ply: number;
}

/** A line classified as label › opening › variation (see `classifyOpening`). */
export interface OpeningClassification {
  /** Null for the empty line. */
  label: OpeningLabel | null;
  /** Opening family, e.g. "Ruy Lopez"; null while only a one-move name has been reached. */
  opening: NamedOpeningPart | null;
  /** Variation part of the deepest name, e.g. "Closed"; null if the name has none. */
  variation: NamedOpeningPart | null;
  /** Ply of the deepest named position (0 if none); beyond it the line is out of theory. */
  ply: number;
}
