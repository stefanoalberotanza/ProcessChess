<script lang="ts">
  import {
    type NameTree,
    type OpeningGraph,
    type SrsCard,
    bookLinesFrom,
    buildNameTree,
    moverOfLast,
    practiceLine,
    searchOpenings,
    searchPosition,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import LinesView from '$lib/components/LinesView.svelte';
  import Mastery from '$lib/components/Mastery.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { srsOfLine } from '$lib/album';
  import { type LabItem, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    graph: OpeningGraph | null;
    fen: string;
    /** Moves from the collection's start to the board position. */
    ucis: string[];
    /** True when the collection starts from the initial position (`ucis` are graph paths). */
    standardStart: boolean;
    /** Colour of the selected repertoire, null when none is selected. */
    userColor: 'w' | 'b' | null;
    summaries: Map<string, LabRunSummary>;
    /** Cards of the user's repertoire moves (FSRS state of repertoire lines, ADR 013). */
    repertoire: Map<string, SrsCard[]>;
    /** Starts a lab session on `queue[index]`. */
    onpractice: (queue: LabItem[], index: number) => void;
    /** Moves the board (entering an opening or a move). */
    onjump: (ucis: string[]) => void;
    onaddbook: (lines: string[][]) => void;
    /** Adds a variation's practice line to the repertoire of its side. */
    onadd: (item: LabItem) => void;
    /** True when `line` (UCI from the start) is all in the selected repertoire. */
    inRepertoire: (line: string[]) => boolean;
  }
  let {
    graph,
    fen,
    ucis,
    standardStart,
    userColor,
    summaries,
    repertoire,
    onpractice,
    onjump,
    onaddbook,
    onadd,
    inRepertoire,
  }: Props = $props();

  const MAX_BOOK_LINES = 200;
  let query = $state('');
  /** Show the openings of one side only. */
  let sideFilter = $state<'all' | 'w' | 'b'>('all');
  const SIDES = ['all', 'w', 'b'] as const;

  const names = $derived<NameTree | null>(graph ? buildNameTree(graph) : null);

  /** A pasted FEN (eight ranks) searches by position, whatever move order reached it. */
  function search(g: OpeningGraph, q: string) {
    if (q.trim().split(/\s/)[0]!.split('/').length !== 8) return searchOpenings(g, q, 60);
    const found = searchPosition(g, q, 60);
    if (!found) return [];
    return [found.position, ...found.reachable].filter((r) => r.name);
  }
  const results = $derived(
    graph && query.trim().length >= 2
      ? search(graph, query)
          .filter((r) => sideFilter === 'all' || moverOfLast(r.uci) === sideFilter)
          .slice(0, 12)
      : [],
  );
  const searchItems = $derived<LabItem[]>(
    graph
      ? results.map((r) => ({
          line: practiceLine(graph!, r.uci),
          eco: r.eco,
          name: r.name,
          side: moverOfLast(r.uci),
        }))
      : [],
  );

  const bookLines = $derived(
    graph && userColor ? bookLinesFrom(graph, fen, userColor, { maxLines: MAX_BOOK_LINES }) : [],
  );
</script>

<div class="explore">
  <label class="search">
    <span class="sr-only">{t('explore.search')}</span>
    <input type="search" bind:value={query} placeholder={t('explore.searchPlaceholder')} />
  </label>
  {#if searchItems.length}
    <ul class="list" aria-label={t('explore.results')}>
      {#each searchItems as it, i (lineKey(it.line) + i)}
        <li class="row">
          <button
            type="button"
            class="enter"
            onclick={() => {
              // read the result before clearing the query (the results derive from it)
              const target = results[i]!.uci;
              query = '';
              onjump(target);
            }}
            aria-label={t('lab.enter', { name: it.name ?? '' })}
          >
            <SideMark side={it.side} />
            <span class="label" title={it.name}>{it.name}</span>
          </button>
          <Mastery
            summary={summaries.get(lineKey(it.line))}
            srs={srsOfLine(it.line, it.side, repertoire)}
          />
          <button
            type="button"
            class="play"
            onclick={() => onpractice([it], 0)}
            aria-label={t('lab.practise', { name: it.name ?? '' })}
            title={t('lab.practise', { name: it.name ?? '' })}>▶</button
          >
        </li>
      {/each}
    </ul>
  {:else if query.trim().length >= 2}
    <p class="muted">{t('explore.noResults')}</p>
  {/if}

  <div class="filter" role="radiogroup" aria-label={t('side.filter')}>
    {#each SIDES as v (v)}
      <button
        type="button"
        role="radio"
        aria-checked={sideFilter === v}
        onclick={() => (sideFilter = v)}
      >
        {#if v !== 'all'}<SideMark side={v} />{/if}
        {t(`side.${v}`)}
      </button>
    {/each}
  </div>

  {#if graph && names && standardStart}
    <LinesView
      {graph}
      {names}
      {ucis}
      {sideFilter}
      {summaries}
      {repertoire}
      onpractice={(it) => onpractice([it], 0)}
      {onjump}
      {onadd}
      {inRepertoire}
    />
  {:else if !graph}
    <p class="muted" aria-busy="true">{t('common.loading')}</p>
  {/if}

  {#if userColor && bookLines.length > 0}
    <button type="button" class="primary" onclick={() => onaddbook(bookLines)}>
      {bookLines.length >= MAX_BOOK_LINES
        ? t('explore.addBookMax', { n: bookLines.length })
        : t('explore.addBook', { n: bookLines.length })}
    </button>
    <p class="muted small">{t('explore.addBookHelp')}</p>
  {/if}
</div>

<style>
  .explore {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .search input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
  }
  .filter {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .filter button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: none;
    background: var(--panel);
    padding: 0.2rem 0.55rem;
    font-size: 0.8rem;
  }
  .filter button + button {
    border-left: 1px solid var(--border);
  }
  .filter button[aria-checked='true'] {
    background: var(--accent);
    color: var(--on-accent);
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border-bottom: 1px solid var(--border);
  }
  .enter {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    text-align: left;
    border: none;
    background: none;
    padding: 0.4rem 0.3rem;
    border-radius: 4px;
  }
  .enter:hover,
  .play:hover {
    background: var(--hover);
  }
  .label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex: 1;
  }
  .play {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.8rem;
    margin: 0;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
</style>
