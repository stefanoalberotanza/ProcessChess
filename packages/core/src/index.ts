export { IllegalMoveError } from './errors';
export { toEpd } from './fen';
export { isOpeningsLoaded, loadOpenings } from './openings/data';
export { OpeningsNotLoadedError, resolveOpening, splitOpeningName } from './openings/resolve';
export type { OpeningIndex, ResolvedOpening } from './openings/types';
