import { enumerateLines } from '../drill/drill';
import { toEpd } from '../fen';
import { INITIAL_FEN } from '../position';
import type { Tree } from '../tree/types';
import type { CardMap } from './counts';

/** A repertoire line brought back by the daily session (ADR 013). */
export interface SessionLine {
  /** Moves from the initial position to a leaf of the repertoire. */
  ucis: string[];
  kind: 'due' | 'learning';
  /** How long its most overdue move has been due (0 for learning lines). */
  overdueMs: number;
  /** The side the repertoire is for (who plays the line's user moves). */
  side: 'w' | 'b';
}

const LEARNING = 1;
const RELEARNING = 3;
const START = toEpd(INITIAL_FEN);

/**
 * The repertoire lines to practise now: for every user move whose card is due, the shortest line
 * that contains it, most overdue first; then, for moves still being learnt (not due), the shortest
 * line through them. Lines are listed once. Collections with a custom start are skipped (lab
 * lines start from the initial position).
 */
export function repertoireSession(
  repertoires: readonly { tree: Tree; cards: CardMap }[],
  now: Date,
): SessionLine[] {
  const due: SessionLine[] = [];
  const learning: SessionLine[] = [];
  const seen = new Set<string>();
  for (const { tree, cards } of repertoires) {
    if (toEpd(tree.startFen) !== START) continue;
    const lines = enumerateLines(tree)
      .map((l) => l.nodeIds)
      .sort((a, b) => a.length - b.length);
    const shortestWith = (id: string) => lines.find((l) => l.includes(id));
    const ucisOf = (ids: string[]) => ids.map((id) => tree.nodes.get(id)!.uci!);
    const add = (out: SessionLine[], id: string, kind: SessionLine['kind'], overdueMs: number) => {
      const line = shortestWith(id);
      if (!line) return;
      const ucis = ucisOf(line);
      const key = ucis.join(' ');
      const existing = out.find((l) => l.ucis.join(' ') === key);
      if (existing) existing.overdueMs = Math.max(existing.overdueMs, overdueMs);
      else if (!seen.has(key)) {
        seen.add(key);
        out.push({ ucis, kind, overdueMs, side: tree.userColor });
      }
    };
    for (const [id, card] of cards) {
      if (!tree.nodes.get(id)?.isUserMove) continue;
      const late = now.getTime() - card.due.getTime();
      if (late >= 0) add(due, id, 'due', late);
    }
    for (const [id, card] of cards) {
      if (!tree.nodes.get(id)?.isUserMove) continue;
      const late = now.getTime() - card.due.getTime();
      if (late < 0 && (card.state === LEARNING || card.state === RELEARNING)) {
        add(learning, id, 'learning', 0);
      }
    }
  }
  due.sort((a, b) => b.overdueMs - a.overdueMs);
  return [...due, ...learning];
}
