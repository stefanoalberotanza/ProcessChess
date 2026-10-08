/** One row of the generated openings dataset (`openings.json`). */
export interface OpeningEntry {
  eco: string;
  name: string;
  /** Moves from the initial position, space-separated UCI. */
  uci: string;
  /** EPD of the final position (see `toEpd`). */
  epd: string;
  /** Number of half-moves in `uci`. */
  ply: number;
}

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
