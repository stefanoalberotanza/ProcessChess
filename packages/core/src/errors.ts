/** A move that is illegal in its position or is not valid SAN/UCI. */
export class IllegalMoveError extends Error {
  constructor(
    readonly move: string,
    /** 1-based half-move number of the offending move within its line. */
    readonly ply: number,
    /** 0-based index of the game in a multi-game PGN, when applicable. */
    readonly gameIndex?: number,
  ) {
    super(
      `Illegal or unparsable move "${move}" at ply ${ply}` +
        (gameIndex === undefined ? '' : ` in game ${gameIndex + 1}`),
    );
    this.name = 'IllegalMoveError';
  }
}
