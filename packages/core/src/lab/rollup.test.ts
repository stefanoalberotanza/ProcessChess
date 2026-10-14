import { describe, expect, it } from 'vitest';
import { type NameNode, rollupMastery } from './names';

function node(key: string, kind: NameNode['kind'], children: string[] = []): NameNode {
  return {
    kind,
    key,
    label: key,
    depth: 0,
    parent: null,
    children,
    own: true,
    eco: '',
    ucis: [],
    lines: 1,
    side: 'w',
    style: null,
    owner: null,
  };
}

// opening F › opening S › variations V1, V2; F also holds variation V3
const nodes = new Map<string, NameNode>([
  ['F', node('F', 'opening', ['S', 'V3'])],
  ['S', node('S', 'opening', ['V1', 'V2'])],
  ['V1', node('V1', 'variation')],
  ['V2', node('V2', 'variation')],
  ['V3', node('V3', 'variation')],
]);
const tree = { get: (k: string) => nodes.get(k) };

describe('rollupMastery', () => {
  it('counts every variation below the key (subfamilies are containers)', () => {
    expect(rollupMastery(tree, 'F', () => undefined, 3)).toEqual({
      total: 3,
      mastered: 0,
      started: 0,
    });
  });

  it('separates mastered from started, threshold inclusive', () => {
    const streaks: Record<string, number> = { S: 0, V1: 3, V2: 5, V3: 2 };
    expect(rollupMastery(tree, 'F', (n) => streaks[n.key], 3)).toEqual({
      total: 3,
      mastered: 2,
      started: 3,
    });
  });

  it('rolls up a subfamily on its own', () => {
    expect(rollupMastery(tree, 'S', (n) => (n.key === 'V1' ? 3 : undefined), 3)).toEqual({
      total: 2,
      mastered: 1,
      started: 1,
    });
  });

  it('is empty for an unknown key or a lone opening', () => {
    const lone = { get: (k: string) => (k === 'X' ? node('X', 'opening') : undefined) };
    expect(rollupMastery(lone, 'X', () => 9, 3)).toEqual({ total: 0, mastered: 0, started: 0 });
    expect(rollupMastery(tree, 'nope', () => 9, 3)).toEqual({ total: 0, mastered: 0, started: 0 });
  });
});
