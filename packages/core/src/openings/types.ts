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
