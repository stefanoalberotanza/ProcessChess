import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { counterIds, mainLine } from '../../test/helpers';
import { practiceLine } from '../lab/lab';
import { type NameTree, buildNameTree } from '../lab/names';
import { loadOpenings } from '../openings/data';
import { type OpeningGraph, loadOpeningGraph } from '../openings/graph';
import { INITIAL_FEN, playLine } from '../position';
import { WEEK_SIZE, randomGrouping, weekRepertoire, weekTree } from './repertoire';

// opening names come from data/openings/*.tsv
const dataDir = join(import.meta.dirname, '../../../../data/openings');
const datasetNames = new Set(
  ['a', 'b', 'c', 'd', 'e'].flatMap((v) =>
    readFileSync(join(dataDir, `${v}.tsv`), 'utf8')
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((r) => r.split('\t')[1]!),
  ),
);

let graph: OpeningGraph;
let names: NameTree;
beforeAll(async () => {
  [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
  names = buildNameTree(graph);
});

describe('weekRepertoire', () => {
  it.each(['w', 'b'] as const)('picks %s openings: 3 named variations of that side', (color) => {
    const { grouping, lines } = weekRepertoire(graph, names, color, '2026-W42');
    expect(grouping).toEqual({ id: 'random', label: 'week.grouping.random' });
    expect(lines).toHaveLength(WEEK_SIZE);
    for (const l of lines) {
      expect(datasetNames.has(l.name)).toBe(true);
      const node = [...names.all()].find((n) => n.key === l.name)!;
      expect(node.side).toBe(color);
      expect(l.ucis).toEqual(practiceLine(graph, node.ucis));
    }
  });

  it('has distinct practice lines', () => {
    for (const week of ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44']) {
      const { lines } = weekRepertoire(graph, names, 'w', week);
      expect(new Set(lines.map((l) => l.ucis.join(' '))).size).toBe(lines.length);
    }
  });

  it('is stable within a week and changes across weeks', () => {
    const a = weekRepertoire(graph, names, 'w', '2026-W42').lines.map((l) => l.name);
    expect(weekRepertoire(graph, names, 'w', '2026-W42').lines.map((l) => l.name)).toEqual(a);
    expect(weekRepertoire(graph, names, 'w', '2026-W43').lines.map((l) => l.name)).not.toEqual(a);
  });

  it('skips an opening whose line is a prefix of a picked one (or the reverse)', () => {
    // data/openings/b.tsv: the Dragon's practice line is a prefix of the Yugoslav Attack's
    const all = [...names.all()];
    const parent = all.find((n) => n.key === 'Sicilian Defense: Dragon Variation')!;
    const child = all.find((n) => n.key === 'Sicilian Defense: Dragon Variation, Yugoslav Attack')!;
    const prefixed = {
      id: 'prefixed',
      label: 'week.grouping.random',
      pick: (c: readonly (typeof parent)[], n: number, r: () => number) => [
        parent,
        child,
        ...randomGrouping.pick(c, n, r),
      ],
    };
    const { lines } = weekRepertoire(graph, names, 'b', '2026-W42', prefixed);
    expect(lines).toHaveLength(WEEK_SIZE);
    const keys = lines.map((l) => l.ucis.join(' '));
    for (const a of keys)
      for (const b of keys) if (a !== b) expect(b.startsWith(`${a} `)).toBe(false);
    expect(lines[0]!.name).toBe('Sicilian Defense: Dragon Variation');
  });

  it('keeps openings without variations as candidates (Bongcloud Attack)', () => {
    const bong = [...names.all()].find((n) => n.key === 'Bongcloud Attack')!;
    const first = {
      id: 'first',
      label: 'week.grouping.random',
      pick: (c: readonly (typeof bong)[]) => c.filter((n) => n.key === 'Bongcloud Attack'),
    };
    expect(
      weekRepertoire(graph, names, bong.side!, '2026-W42', first).lines.map((l) => l.name),
    ).toEqual(['Bongcloud Attack']);
  });

  it('uses the grouping it is given', () => {
    const first = { id: 'first', label: 'week.grouping.first', pick: randomGrouping.pick };
    expect(weekRepertoire(graph, names, 'b', '2026-W42', first).grouping.id).toBe('first');
  });
});

describe('weekTree', () => {
  it('holds every line from the standard start for the given colour', () => {
    const { lines } = weekRepertoire(graph, names, 'b', '2026-W42');
    const edit = weekTree(lines, 'b', counterIds());
    expect(edit.tree.userColor).toBe('b');
    expect(mainLine(edit.tree)).toEqual(playLine(INITIAL_FEN, lines[0]!.ucis)!.san);
    // every node, root included, is reported as inserted (parent first)
    expect(edit.changes.inserted).toHaveLength(edit.tree.nodes.size);
    expect(edit.changes.inserted[0]!.id).toBe(edit.tree.rootId);
  });
});
