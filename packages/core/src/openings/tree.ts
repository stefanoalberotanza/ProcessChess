import { toEpd } from '../fen';
import type { Tree } from '../tree/types';
import { openingIndex } from './data';
import { OpeningsNotLoadedError, type NamedPly, classifyNamedPath, labelOf } from './resolve';
import type { OpeningClassification } from './types';

const STANDARD_EPD = toEpd('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

/**
 * Classifies every node of a tree with `classifyOpening` semantics in one walk, using the
 * stored EPDs. Empty for trees that do not start from the standard initial position.
 *
 * @throws OpeningsNotLoadedError if `loadOpenings()` has not resolved yet.
 */
export function classifyTree(tree: Tree): Map<string, OpeningClassification> {
  const lookup = openingIndex();
  if (!lookup) throw new OpeningsNotLoadedError();
  const out = new Map<string, OpeningClassification>();
  const root = tree.nodes.get(tree.rootId);
  if (!root || root.epd !== STANDARD_EPD) return out;
  out.set(root.id, classifyNamedPath(null, []));

  const stack: { id: string; ply: number; named: readonly NamedPly[]; firstSan: string | null }[] =
    [{ id: root.id, ply: 0, named: [], firstSan: null }];
  while (stack.length > 0) {
    const { id, ply, named, firstSan } = stack.pop()!;
    for (const childId of tree.children.get(id) ?? []) {
      const child = tree.nodes.get(childId)!;
      const childPly = ply + 1;
      const entry = lookup.get(child.epd);
      const childNamed = entry
        ? [...named, { ply: childPly, eco: entry[0], name: entry[1] }]
        : named;
      const first = firstSan ?? child.san;
      out.set(childId, classifyNamedPath(first === null ? null : labelOf(first), childNamed));
      stack.push({ id: childId, ply: childPly, named: childNamed, firstSan: first });
    }
  }
  return out;
}
