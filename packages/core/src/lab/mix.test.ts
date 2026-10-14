import { describe, expect, it } from 'vitest';
import { type MixSummary, dailyMix, mixNext, seededRandom } from './mix';
import type { NameNode } from './names';

function node(
  key: string,
  parent: string | null,
  lines = 1,
  kind: NameNode['kind'] = 'variation',
): NameNode {
  return {
    kind,
    key,
    label: key,
    depth: parent ? 2 : 0,
    parent,
    children: [],
    own: true,
    eco: '',
    ucis: [],
    lines,
    side: 'w',
    style: null,
  };
}

// opening F › openings A, B, C; each has 10 variations A0..A9 (popularity = 10 - index)
const all: NameNode[] = [node('F', null, 1, 'opening')];
for (const s of ['A', 'B', 'C']) {
  all.push(node(s, 'F', 100, 'opening'));
  for (let i = 0; i < 10; i++) all.push(node(`${s}${i}`, s, 10 - i));
}
const tree = { all: () => all };
const DAY = 86_400_000;

// A0..A9 almost (streak 1), B0..B9 automatic (streak 3); C never practised
const history = new Map<string, MixSummary>();
for (let i = 0; i < 10; i++) {
  history.set(`A${i}`, { runs: 2, cleanStreak: 1, lastAt: 1000 * DAY - i * DAY, lastClean: false });
  history.set(`B${i}`, { runs: 5, cleanStreak: 3, lastAt: 900 * DAY - i * DAY, lastClean: true });
}
const base = { tree, day: '2026-10-12', shuffle: 0, masteredStreak: 3 };
const mix = (summaryOf: (n: NameNode) => MixSummary | undefined, extra: object = {}) =>
  dailyMix({ ...base, summaryOf, ...extra });
const keys = (e: { node: NameNode }[]) => e.map((x) => x.node.key);

describe('seededRandom', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRandom('y')()).not.toBe(seededRandom('x')());
  });
});

describe('dailyMix', () => {
  const withHistory = (n: NameNode) => history.get(n.key);

  it('is the same for the same day and shuffle', () => {
    expect(keys(mix(withHistory))).toEqual(keys(mix(withHistory)));
  });

  it('changes with the shuffle counter', () => {
    const first = keys(mix(withHistory)).join();
    const others = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
      keys(mix(withHistory, { shuffle: s })).join(),
    );
    expect(others.some((o) => o !== first)).toBe(true);
  });

  it('takes 2 almost, 2 review and 1 new, from the preferred pools', () => {
    // C1 practised long ago (outside the almost pool) so C's variations become "new" candidates
    const old: MixSummary = { runs: 1, cleanStreak: 0, lastAt: 0, lastClean: false };
    const out = mix((n) => (n.key === 'C1' ? old : history.get(n.key)));
    expect(out.map((e) => e.kind)).toEqual(['almost', 'almost', 'review', 'review', 'new']);
    // almost: the 6 most recent (A0..A5); review: the 6 oldest (B4..B9)
    for (const e of out.filter((x) => x.kind === 'almost')) expect(e.node.key).toMatch(/^A[0-5]$/);
    for (const e of out.filter((x) => x.kind === 'review')) expect(e.node.key).toMatch(/^B[4-9]$/);
  });

  it('new entries are unpractised siblings of a practised line', () => {
    // C1 practised → C's other variations are candidates; A and B variations are all practised
    const h = (n: NameNode) => (n.key === 'C1' ? history.get('A0') : history.get(n.key));
    for (let s = 0; s < 5; s++) {
      const fresh = mix(h, { shuffle: s }).filter((e) => e.kind === 'new');
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.node.key).toMatch(/^C[02-9]$/);
    }
  });

  it('keeps a new slot for any size of 3 or more', () => {
    const old: MixSummary = { runs: 1, cleanStreak: 0, lastAt: 0, lastClean: false };
    const h = (n: NameNode) => (n.key === 'C1' ? old : history.get(n.key));
    for (const size of [3, 4, 5, 6, 7]) {
      const out = mix(h, { size });
      expect(out).toHaveLength(size);
      expect(out.filter((e) => e.kind === 'new').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('offers variations only, never subfamilies', () => {
    for (const s of [0, 1, 2]) {
      expect(mix(withHistory, { shuffle: s }).every((e) => e.node.kind === 'variation')).toBe(true);
      expect(mix(() => undefined, { shuffle: s }).every((e) => e.node.kind === 'variation')).toBe(
        true,
      );
    }
  });

  it('gives unfilled slots to the other kinds', () => {
    const onlyAlmost = (n: NameNode) => (n.key.startsWith('A') ? history.get(n.key) : undefined);
    const out = mix(onlyAlmost);
    expect(out).toHaveLength(5);
    expect(out.filter((e) => e.kind === 'almost').length).toBeGreaterThanOrEqual(4);
    expect(new Set(keys(out)).size).toBe(5);
  });

  it('without history draws from the most popular variations', () => {
    const out = mix(() => undefined);
    expect(out).toHaveLength(5);
    expect(out.every((e) => e.kind === 'new' && e.node.kind !== 'opening')).toBe(true);
    // the 15 most popular variations are *0..*4 (subfamilies are never offered)
    for (const e of out) expect(e.node.lines).toBeGreaterThanOrEqual(6);
  });

  it('never repeats a node and is capped by the candidates', () => {
    const small = { all: () => all.slice(0, 3) }; // F, A, A0
    const out = dailyMix({ ...base, tree: small, summaryOf: () => undefined });
    expect(keys(out)).toEqual(['A0']);
  });
});

describe('dailyMix with shared practice lines', () => {
  it('never offers two entries with the same practice line', () => {
    // every variation of A shares one line; B's variations have their own
    const lineOf = (n: NameNode) => (n.key.startsWith('A') ? 'line-A' : n.key);
    for (let s = 0; s < 10; s++) {
      const out = dailyMix({ ...base, shuffle: s, summaryOf: () => undefined, lineOf });
      const lines = out.map((e) => lineOf(e.node));
      expect(new Set(lines).size).toBe(lines.length);
    }
    const practised = (n: NameNode) => (lineOf(n) === 'line-A' ? history.get('A0') : undefined);
    const out = dailyMix({ ...base, summaryOf: practised, lineOf });
    expect(out.filter((e) => lineOf(e.node) === 'line-A')).toHaveLength(1);
  });
});

describe('mixNext', () => {
  it('is the first entry not done', () => {
    expect(mixNext([false, false])).toBe(0);
    expect(mixNext([true, false, false])).toBe(1);
    expect(mixNext([true, true, false, true])).toBe(2);
  });
  it('is -1 when everything is done or the mix is empty', () => {
    expect(mixNext([true, true, true, true, true])).toBe(-1);
    expect(mixNext([])).toBe(-1);
  });
});
