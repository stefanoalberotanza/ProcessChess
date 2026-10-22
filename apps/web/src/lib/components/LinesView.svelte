<script lang="ts">
  import {
    type NameNode,
    type NameTree,
    type OpeningGraph,
    type SrsCard,
    deepestName,
    linesFrom,
    openingOf,
    practiceLine,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import MiniBoard from '$lib/components/MiniBoard.svelte';
  import Mastery from '$lib/components/Mastery.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { sanLine, srsOfLine, tileBoard } from '$lib/album';
  import { type LabItem, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  /** The openings and variations reachable from the board position, by name. */
  interface Props {
    graph: OpeningGraph;
    /** The full name tree (Explore) or a repertoire's (Training). */
    names: NameTree;
    /** Moves from the initial position to the board position. */
    ucis: string[];
    /** Openings of one side only (`both` openings show under either). */
    sideFilter?: 'all' | 'w' | 'b';
    summaries: Map<string, LabRunSummary>;
    /** Cards of the user's repertoire moves (FSRS state of repertoire lines, ADR 013). */
    repertoire: Map<string, SrsCard[]>;
    /** Practises a line (lab in Explore, drill in Training). */
    onpractice: (item: LabItem) => void;
    /** Moves the board. */
    onjump: (ucis: string[]) => void;
    /** Explore only: adds a variation's line to the repertoire. */
    onadd?: (item: LabItem) => void;
    /** Explore only: true when `line` is all in the selected repertoire. */
    inRepertoire?: (line: string[]) => boolean;
    /** The board path of a level (Training: the repertoire's own move order). */
    pathOf?: (n: NameNode) => string[];
  }
  let {
    graph,
    names,
    ucis,
    sideFilter = 'all',
    summaries,
    repertoire,
    onpractice,
    onjump,
    onadd,
    inRepertoire,
    pathOf,
  }: Props = $props();

  const ROWS = 8;
  const here = $derived(linesFrom(graph, names, ucis));
  const openings = $derived(
    here.openings.filter(
      (o) => sideFilter === 'all' || o.owner === sideFilter || o.owner === 'both',
    ),
  );
  /** opening › variation › …: the levels of the board position's deepest name. */
  const crumbs = $derived.by(() => {
    const own = deepestName(graph, ucis);
    const chain: NameNode[] = [];
    for (let n = own ? names.nodeForName(own) : undefined; n;) {
      chain.unshift(n);
      n = n.parent ? names.get(n.parent) : undefined;
    }
    return chain;
  });
  let showAll = $state({ openings: false, variations: false });
  $effect(() => {
    void ucis;
    showAll = { openings: false, variations: false };
  });

  const item = (n: NameNode): LabItem => ({
    line: practiceLine(graph, n.ucis),
    eco: n.eco,
    name: n.key,
    side: n.kind === 'opening' && n.owner !== 'both' ? (n.owner ?? n.side) : n.side,
  });
  const go = (n: NameNode | null) => onjump(n ? (pathOf?.(n) ?? n.ucis) : []);
  /** A variation reads as its own segments below the opening ("Najdorf Variation"). */
  const labelOf = (n: NameNode) =>
    n.kind === 'opening' ? n.key : n.key.slice(openingOf(names, n).key.length + 2) || n.label;
</script>

{#snippet row(n: NameNode)}
  {@const it = item(n)}
  {@const moves = sanLine(it.line)}
  {@const board = tileBoard(n)}
  <li class="card" data-line={moves}>
    <button
      type="button"
      class="enter"
      onclick={() => go(n)}
      aria-label={t('lab.enter', { name: n.key })}
      title={`${n.key}
${moves}`}
    >
      <MiniBoard
        fen={board.fen}
        lastMove={board.last}
        orientation={it.side === 'b' ? 'black' : 'white'}
        size={96}
      />
      <span class="label">{labelOf(n)}</span>
    </button>
    <div class="foot">
      <span class="sides">
        {#if n.kind === 'opening' && n.owner === 'both'}
          <SideMark side="w" /><SideMark side="b" />
        {:else}
          <SideMark side={it.side} />
        {/if}
      </span>
      <Mastery
        summary={summaries.get(lineKey(it.line))}
        srs={srsOfLine(it.line, it.side, repertoire)}
      />
      <button
        type="button"
        class="play"
        onclick={() => onpractice(it)}
        aria-label={t('lab.practise', { name: n.key })}
        title={t('lab.practise', { name: n.key })}>▶</button
      >
      {#if onadd && inRepertoire}
        {#if inRepertoire(it.line)}
          <span class="in-rep" title={t('explore.inRepertoire')}>✓</span>
        {:else}
          <button
            type="button"
            class="add"
            onclick={() => onadd(it)}
            aria-label={t('rep.addOpening', { name: n.key })}
            title={t('rep.addOpening', { name: n.key })}>+</button
          >
        {/if}
      {/if}
    </div>
  </li>
{/snippet}

{#snippet group(kind: 'openings' | 'variations', items: NameNode[])}
  {#if items.length}
    <section class="group" aria-labelledby={`lines-${kind}`}>
      <h3 id={`lines-${kind}`}>{t(`lines.${kind}`)} · {items.length}</h3>
      <ul class="list" aria-label={t(`lines.${kind}`)}>
        {#each showAll[kind] ? items : items.slice(0, ROWS) as n (n.key)}
          {@render row(n)}
        {/each}
      </ul>
      {#if items.length > ROWS && !showAll[kind]}
        <button type="button" class="more" onclick={() => (showAll = { ...showAll, [kind]: true })}>
          {t('lab.showAll', { n: items.length })}
        </button>
      {/if}
    </section>
  {/if}
{/snippet}

<section class="lines" aria-labelledby="lines-title">
  <h2 id="lines-title">{t('lines.title')}</h2>
  <nav class="crumbs" aria-label={t('lab.levels')}>
    <button
      type="button"
      onclick={() => go(null)}
      aria-current={!crumbs.length ? 'true' : undefined}>{t('lab.all')}</button
    >
    {#each crumbs as c, i (c.key)}
      <span aria-hidden="true">›</span>
      <button
        type="button"
        onclick={() => go(c)}
        aria-current={i === crumbs.length - 1 ? 'true' : undefined}>{c.label}</button
      >
    {/each}
  </nav>
  {@render group('variations', here.variations)}
  {@render group('openings', openings)}
  {#if !here.variations.length && !openings.length}
    <p class="muted">{t('lines.none')}</p>
  {/if}
</section>

<style>
  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  h3 {
    margin: 0.2rem 0;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.9rem;
  }
  .crumbs button {
    border: none;
    background: none;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    color: var(--accent);
  }
  .crumbs button[aria-current='true'] {
    color: var(--fg);
    font-weight: 600;
  }
  .crumbs span {
    color: var(--muted);
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.6rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
    overflow: hidden;
    transition: transform 0.1s;
  }
  .card:hover {
    transform: translateY(-2px);
  }
  .enter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    padding: 0.5rem 0.4rem 0.3rem;
    text-align: center;
  }
  .label {
    max-width: 100%;
    font-size: 0.8rem;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    min-height: 1.6rem;
    padding: 0 0.2rem 0.3rem;
  }
  .sides {
    display: inline-flex;
    gap: 0.1rem;
  }
  .enter:hover,
  .play:hover {
    background: var(--hover);
  }
  .play,
  .add {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-weight: 700;
  }
  .in-rep {
    color: var(--chip-review-fg);
    font-weight: 700;
    padding: 0 0.4rem;
  }
  .more {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0.3rem 0;
    text-align: left;
  }
  .muted {
    color: var(--muted);
  }
</style>
