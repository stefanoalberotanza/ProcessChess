<script lang="ts">
  import {
    type MoveEntry,
    type NameBranch,
    type NameNode,
    type NameTree,
    type OpeningGraph,
    type SrsCard,
    movesFrom,
    nestNames,
    practiceLine,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import Mastery from '$lib/components/Mastery.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { sanLine, srsOfLine } from '$lib/album';
  import { type LabItem, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  /** The moves from the board position that lead into a named opening, by side. */
  interface Props {
    graph: OpeningGraph;
    names: NameTree;
    /** Moves from the initial position to the board position. */
    ucis: string[];
    summaries: Map<string, LabRunSummary>;
    /** Cards of the user's repertoire moves (FSRS state of repertoire lines, ADR 013). */
    repertoire: Map<string, SrsCard[]>;
    onpractice: (item: LabItem) => void;
    /** Moves the board. */
    onjump: (ucis: string[]) => void;
    onadd?: (item: LabItem) => void;
    inRepertoire?: (line: string[]) => boolean;
  }
  let {
    graph,
    names,
    ucis,
    summaries,
    repertoire,
    onpractice,
    onjump,
    onadd,
    inRepertoire,
  }: Props = $props();

  const here = $derived(movesFrom(graph, names, ucis));
  const groups = $derived(
    (
      [
        { side: 'w', title: 'moves.white', moves: here.w },
        { side: 'b', title: 'moves.black', moves: here.b },
      ] as const
    ).filter((g) => g.moves.length),
  );
  /** Everything starts collapsed: groups, moves and each level of names, by id. */
  let open = $state<Record<string, boolean>>({});
  $effect(() => {
    void ucis;
    open = {};
  });
  const toggle = (id: string) => (open = { ...open, [id]: !open[id] });

  const item = (n: NameNode): LabItem => ({
    line: practiceLine(graph, n.ucis),
    eco: n.eco,
    name: n.key,
    side: n.kind === 'opening' && n.owner !== 'both' ? (n.owner ?? n.side) : n.side,
  });
  /** "2.Nf3" for White's move, "2...c5" for Black's. */
  const label = (m: MoveEntry) => {
    const n = Math.floor(ucis.length / 2) + 1;
    return ucis.length % 2 === 0 ? `${n}.${m.san}` : `${n}...${m.san}`;
  };
</script>

{#snippet branch(b: NameBranch, id: string, depth: number)}
  {@const it = item(b.node)}
  {@const key = `${id}/${b.node.key}`}
  <li class="name">
    <div class="line" style:padding-left={`${depth * 0.9}rem`}>
      {#if b.children.length}
        <button
          type="button"
          class="fold"
          aria-expanded={!!open[key]}
          aria-label={b.node.key}
          onclick={() => toggle(key)}>{open[key] ? '▾' : '▸'}</button
        >
      {:else}
        <span class="fold" aria-hidden="true"></span>
      {/if}
      <span class="label" title={b.node.key}>{depth ? b.node.label : b.node.key}</span>
      <Mastery
        summary={summaries.get(lineKey(it.line))}
        srs={srsOfLine(it.line, it.side, repertoire)}
      />
      <button
        type="button"
        class="act"
        onclick={() => onpractice(it)}
        aria-label={t('lab.practise', { name: b.node.key })}
        title={t('lab.practise', { name: b.node.key })}>▶</button
      >
      {#if onadd && inRepertoire}
        {#if inRepertoire(it.line)}
          <span class="in-rep" title={t('explore.inRepertoire')}>✓</span>
        {:else}
          <button
            type="button"
            class="act"
            onclick={() => onadd(it)}
            aria-label={t('rep.addOpening', { name: b.node.key })}
            title={t('rep.addOpening', { name: b.node.key })}>+</button
          >
        {/if}
      {/if}
    </div>
    {#if b.children.length && open[key]}
      <ul class="names">
        {#each b.children as c (c.node.key)}
          {@render branch(c, key, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<section class="moves" aria-labelledby="moves-title">
  <h2 id="moves-title">{t('moves.title')}</h2>
  {#each groups as g (g.side)}
    {@const gid = `g:${g.side}`}
    <section class="group" aria-labelledby={`moves-${g.side}`}>
      <h3 id={`moves-${g.side}`}>
        <button type="button" class="fold" aria-expanded={!!open[gid]} onclick={() => toggle(gid)}>
          {open[gid] ? '▾' : '▸'}
        </button>
        <SideMark side={g.side} />
        {t(g.title)} · {g.moves.length}
      </h3>
      {#if open[gid]}
        <ul class="list">
          {#each g.moves as m (m.uci)}
            {@const id = `m:${g.side}:${m.uci}`}
            <li class="move">
              <div class="line">
                <button
                  type="button"
                  class="fold"
                  aria-expanded={!!open[id]}
                  aria-label={t('moves.toggle', { name: label(m) })}
                  onclick={() => toggle(id)}>{open[id] ? '▾' : '▸'}</button
                >
                <button
                  type="button"
                  class="head"
                  onclick={() => onjump([...ucis, m.uci])}
                  aria-label={t('lab.enter', { name: label(m) })}
                >
                  <b>{label(m)}</b>
                  <span class="muted">{t('moves.count', { o: m.openings, l: m.lines })}</span>
                </button>
              </div>
              {#if open[id]}
                <ul class="names">
                  {#each nestNames(names, m.names) as b (b.node.key)}
                    {@render branch(b, id, 0)}
                  {/each}
                </ul>
                <p class="muted example">{t('moves.example')}: {sanLine(m.example)}</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  {#if !groups.length}
    <p class="muted">{t('moves.none')}</p>
  {/if}
</section>

<style>
  .moves {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0.2rem 0;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .list,
  .names {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .move {
    border-bottom: 1px solid var(--border);
    padding: 0.3rem 0 0.4rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    border: none;
    background: none;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
    color: var(--accent);
    font-size: 1rem;
  }
  .head:hover,
  .act:hover {
    background: var(--hover);
  }
  .names {
    margin-left: 0.8rem;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
  }
  .fold {
    flex: none;
    width: 1.4rem;
    border: none;
    background: none;
    color: var(--muted);
    padding: 0.1rem 0;
    font-size: 0.8rem;
  }
  .move > .line {
    font-size: 1rem;
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .act {
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
  .muted {
    color: var(--muted);
  }
  .example {
    margin: 0.2rem 0 0 0.8rem;
    font-size: 0.8rem;
  }
</style>
