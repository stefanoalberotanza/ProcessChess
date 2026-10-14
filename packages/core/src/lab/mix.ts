import type { NameNode, NameTree } from './names';

export type MixKind = 'almost' | 'review' | 'new';

/** What the mix needs from a line's lab history (`lastAt` in Unix ms). */
export interface MixSummary {
  runs: number;
  cleanStreak: number;
  lastAt: number;
  lastClean: boolean;
}

export interface MixEntry {
  node: NameNode;
  kind: MixKind;
}

/** Deterministic PRNG (string hash + mulberry32): the same seed gives the same sequence. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` items drawn without repetition from `pool` (not modified). */
function draw<T>(pool: readonly T[], n: number, random: () => number): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < n && left.length)
    out.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
  return out;
}

const POOL = 3;
const FALLBACK_POOL = 15;

/**
 * The day's practice mix: lines almost automatic, automatic lines to review, and new variations
 * next to practised ones. Stable for a given `day` and `shuffle`; each kind is drawn from its
 * best `POOL × slots` candidates. Without history, popular variations.
 */
export function dailyMix(opts: {
  tree: Pick<NameTree, 'all'>;
  summaryOf: (node: NameNode) => MixSummary | undefined;
  day: string;
  shuffle: number;
  masteredStreak: number;
  size?: number;
  /** Identity of a node's practice line: nodes sharing one are offered once. Default: the name. */
  lineOf?: (node: NameNode) => string;
}): MixEntry[] {
  const size = opts.size ?? 5;
  const random = seededRandom(`${opts.day}:${opts.shuffle}`);
  const byPopularity = (a: NameNode, b: NameNode) =>
    b.lines - a.lines || a.key.localeCompare(b.key);
  // one node per practice line (the most popular name), so one run never ticks two entries
  const lineOf = opts.lineOf ?? ((n: NameNode) => n.key);
  const seenLines = new Set<string>();
  const nodes = [...opts.tree.all()]
    // a practised line: a variation, or an opening with no variations of its own
    .filter((n) => n.kind === 'variation' || (n.parent === null && n.children.length === 0))
    .sort(byPopularity)
    .filter((n) => {
      const line = lineOf(n);
      if (seenLines.has(line)) return false;
      seenLines.add(line);
      return true;
    });

  const practised = nodes.flatMap((node) => {
    const s = opts.summaryOf(node);
    return s ? [{ node, s }] : [];
  });
  if (practised.length === 0) {
    const pool = [...nodes].sort(byPopularity).slice(0, FALLBACK_POOL);
    return draw(pool, size, random).map((node) => ({ node, kind: 'new' }));
  }

  const parents = new Set(practised.map((p) => p.node.parent));
  const pools: Record<MixKind, NameNode[]> = {
    almost: practised
      .filter((p) => p.s.cleanStreak < opts.masteredStreak)
      .sort((a, b) => b.s.lastAt - a.s.lastAt)
      .map((p) => p.node),
    review: practised
      .filter((p) => p.s.cleanStreak >= opts.masteredStreak)
      .sort((a, b) => a.s.lastAt - b.s.lastAt)
      .map((p) => p.node),
    new: nodes
      .filter((n) => n.parent !== null && parents.has(n.parent) && !opts.summaryOf(n))
      .sort(byPopularity),
  };
  const order: MixKind[] = ['almost', 'review', 'new'];
  // one new line in five (at least one from size 3), the rest split almost / review: 2 + 2 + 1
  const fresh = size >= 3 ? Math.max(1, Math.round(size * 0.2)) : 0;
  const quota: Record<MixKind, number> = {
    almost: Math.ceil((size - fresh) / 2),
    review: Math.floor((size - fresh) / 2),
    new: fresh,
  };

  const picked: Record<MixKind, NameNode[]> = { almost: [], review: [], new: [] };
  for (const kind of order) {
    picked[kind] = draw(pools[kind].slice(0, POOL * quota[kind]), quota[kind], random);
  }
  // unfilled slots go to the other kinds, in order
  let missing = size - order.reduce((n, k) => n + picked[k].length, 0);
  for (const kind of order) {
    if (missing <= 0) break;
    const rest = pools[kind].filter((n) => !picked[kind].includes(n));
    const extra = draw(rest.slice(0, POOL * missing), missing, random);
    picked[kind].push(...extra);
    missing -= extra.length;
  }
  return order.flatMap((kind) => picked[kind].map((node) => ({ node, kind })));
}

/** The mix entry to practise next: the first not done today; -1 when all are done. */
export function mixNext(done: readonly boolean[]): number {
  return done.indexOf(false);
}
