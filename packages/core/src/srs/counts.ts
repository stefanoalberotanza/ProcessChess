import { enumerateLines } from '../drill/drill';
import type { Tree } from '../tree/types';
import { CardState, type SrsCard } from './schedule';

/** Cards keyed by node id. */
export type CardMap = ReadonlyMap<string, SrsCard>;

/**
 * User moves that are scheduled and asked in review: those on the lines of `enumerateLines`
 * (the main user move at each decision point). Line order, without duplicates.
 */
export function scheduledNodeIds(tree: Tree): string[] {
  const ids = new Set<string>();
  for (const line of enumerateLines(tree)) {
    for (const id of line.nodeIds) if (tree.nodes.get(id)!.isUserMove) ids.add(id);
  }
  return [...ids];
}

/** Scheduled moves whose card is due at `now`, in line order. */
export function dueNodeIds(tree: Tree, cards: CardMap, now: Date): string[] {
  return scheduledNodeIds(tree).filter((id) => {
    const c = cards.get(id);
    return c !== undefined && c.due.getTime() <= now.getTime();
  });
}

export interface CardCounts {
  /** Scheduled moves. */
  total: number;
  /** Never tried. */
  new: number;
  /** Learning or relearning. */
  learning: number;
  review: number;
  dueNow: number;
  /** Due by `endOfDay`, including the ones due now. */
  dueToday: number;
  /** Earliest due date after `now`, null when none. */
  nextDue: Date | null;
}

/** Counts over the scheduled moves of a tree; cards of other nodes are ignored. */
export function cardCounts(tree: Tree, cards: CardMap, now: Date, endOfDay: Date): CardCounts {
  const counts: CardCounts = {
    total: 0,
    new: 0,
    learning: 0,
    review: 0,
    dueNow: 0,
    dueToday: 0,
    nextDue: null,
  };
  for (const id of scheduledNodeIds(tree)) {
    counts.total++;
    const c = cards.get(id);
    if (!c || c.state === CardState.New) {
      counts.new++;
      continue;
    }
    if (c.state === CardState.Review) counts.review++;
    else counts.learning++;
    const due = c.due.getTime();
    if (due <= now.getTime()) counts.dueNow++;
    else if (!counts.nextDue || due < counts.nextDue.getTime()) counts.nextDue = c.due;
    if (due <= endOfDay.getTime()) counts.dueToday++;
  }
  return counts;
}
