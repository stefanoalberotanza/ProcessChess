import { practiceLine } from '../lab/lab';
import { seededRandom } from '../lab/mix';
import type { NameNode, NameTree } from '../lab/names';
import type { OpeningGraph } from '../openings/graph';
import { INITIAL_FEN } from '../position';
import { addLine } from '../tree/ops';
import { emptyTree } from '../tree/tree';
import type { IdGenerator, TreeEdit } from '../tree/types';

/** Openings per colour in a week repertoire. */
export const WEEK_SIZE = 3;

/**
 * How a week's openings are chosen and what they share ("Most common", "e4 and Knight", …).
 * `label` is an i18n key. `pick` returns candidates in preference order; the caller keeps the
 * first `count` with distinct practice lines.
 */
export interface WeekGrouping {
  id: string;
  label: string;
  pick(candidates: readonly NameNode[], count: number, random: () => number): NameNode[];
}

/** Placeholder grouping: every candidate, in random order. */
export const randomGrouping: WeekGrouping = {
  id: 'random',
  label: 'week.grouping.random',
  pick(candidates, _count, random) {
    const left = [...candidates];
    const out: NameNode[] = [];
    while (left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
    return out;
  },
};

export interface WeekLine {
  /** Dataset name of the opening. */
  name: string;
  /** Its practice line from the initial position (UCI). */
  ucis: string[];
}

/**
 * The openings of `color` for `week`: named variations whose defining move is `color`'s,
 * ordered by `grouping`, the first `WEEK_SIZE` whose practice lines are distinct and not
 * prefixes of each other (so the tree has `WEEK_SIZE` leaves). Deterministic for
 * a week and colour. Needs `loadOpenings()`.
 */
export function weekRepertoire(
  graph: OpeningGraph,
  tree: Pick<NameTree, 'all'>,
  color: 'w' | 'b',
  week: string,
  grouping: WeekGrouping = randomGrouping,
): { grouping: { id: string; label: string }; lines: WeekLine[] } {
  const candidates = [...tree.all()]
    .filter((n) => n.kind === 'variation' && n.side === color)
    .sort((a, b) => a.key.localeCompare(b.key)); // stable input for the PRNG
  const ordered = grouping.pick(candidates, WEEK_SIZE, seededRandom(`${week}:${color}`));
  const lines: WeekLine[] = [];
  // a line equal to, or a prefix of, another would merge into it in the tree: one line less
  const overlaps = (a: readonly string[], b: readonly string[]) =>
    a.every((u, i) => i >= b.length || b[i] === u);
  for (const node of ordered) {
    if (lines.length >= WEEK_SIZE) break;
    const ucis = practiceLine(graph, node.ucis);
    if (lines.some((l) => overlaps(l.ucis, ucis))) continue;
    lines.push({ name: node.key, ucis });
  }
  return { grouping: { id: grouping.id, label: grouping.label }, lines };
}

/** A new repertoire tree from the standard start holding `lines`, every node reported inserted. */
export function weekTree(
  lines: readonly WeekLine[],
  color: 'w' | 'b',
  newId: IdGenerator,
): TreeEdit {
  let tree = emptyTree(INITIAL_FEN, color, newId());
  for (const line of lines) tree = addLine(tree, tree.rootId, line.ucis, { newId }).tree;
  return { tree, changes: { inserted: [...tree.nodes.values()], updated: [], deleted: [] } };
}
