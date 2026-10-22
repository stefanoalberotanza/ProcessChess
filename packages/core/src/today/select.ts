import { enumerateLines } from '../drill/drill';
import { toEpd } from '../fen';
import { INITIAL_FEN } from '../position';
import type { CardMap } from '../srs/counts';
import type { SessionLine } from '../srs/session';
import type { Tree } from '../tree/types';

export type CandidateKind = 'due' | 'new' | 'fill';

/** A repertoire line that may become a Today puzzle. */
export interface PuzzleCandidate {
  /** Moves from the initial position to a leaf of the repertoire. */
  line: string[];
  /** The side the repertoire is for. */
  side: 'w' | 'b';
  kind: CandidateKind;
}

export const SESSION_SIZE = 4;
export const MIN_PUZZLES = 3;

const START = toEpd(INITIAL_FEN);

/** Lines the daily session brings back (due and learning) as `due` candidates. */
export function dueCandidates(session: readonly SessionLine[]): PuzzleCandidate[] {
  return session.map((l) => ({ line: l.ucis, side: l.side, kind: 'due' }));
}

/**
 * Lines never attempted: no user move on them has a card. Trees with a custom start are skipped
 * (as in `repertoireSession`).
 */
export function newCandidates(
  repertoires: readonly { tree: Tree; cards: CardMap }[],
): PuzzleCandidate[] {
  const out: PuzzleCandidate[] = [];
  for (const { tree, cards } of repertoires) {
    if (toEpd(tree.startFen) !== START) continue;
    for (const { nodeIds } of enumerateLines(tree)) {
      if (nodeIds.some((id) => tree.nodes.get(id)?.isUserMove && cards.has(id))) continue;
      out.push({
        line: nodeIds.map((id) => tree.nodes.get(id)!.uci!),
        side: tree.userColor,
        kind: 'new',
      });
    }
  }
  return out;
}

/**
 * Picks the session's puzzles: each slot is a coin flip between the due and the new pool (the
 * other one when a pool is empty). `fill` candidates are used only to reach `MIN_PUZZLES`. A line
 * offered under several kinds is kept once, with priority due > new > fill.
 */
export function selectPuzzles(
  candidates: readonly PuzzleCandidate[],
  opts: { size?: number; random: () => number },
): PuzzleCandidate[] {
  const size = opts.size ?? SESSION_SIZE;
  const { random } = opts;
  const pools: Record<CandidateKind, PuzzleCandidate[]> = { due: [], new: [], fill: [] };
  const seen = new Set<string>();
  for (const kind of ['due', 'new', 'fill'] as const) {
    for (const c of candidates) {
      if (c.kind !== kind) continue;
      const key = c.line.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      pools[kind].push(c);
    }
  }
  const take = (pool: PuzzleCandidate[]) => pool.splice(Math.floor(random() * pool.length), 1)[0]!;
  const out: PuzzleCandidate[] = [];
  while (out.length < size && (pools.due.length || pools.new.length)) {
    const bothPools = pools.due.length > 0 && pools.new.length > 0;
    const pool = bothPools
      ? random() < 0.5
        ? pools.due
        : pools.new
      : pools.due.length
        ? pools.due
        : pools.new;
    out.push(take(pool));
  }
  while (out.length < Math.min(MIN_PUZZLES, size) && pools.fill.length) out.push(take(pools.fill));
  return out;
}
