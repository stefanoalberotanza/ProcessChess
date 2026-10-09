<script lang="ts">
  import {
    INITIAL_FEN,
    type OpeningGraph,
    bookLinesFrom,
    bookMoves,
    openingLine,
    playLine,
    practiceByName,
    searchOpenings,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import Mastery from '$lib/components/Mastery.svelte';
  import { type LabItem, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    graph: OpeningGraph | null;
    fen: string;
    /** Moves from the initial position to the board position. */
    ucis: string[];
    /** Moves of the selected repertoire from this position (UCI), to mark them. */
    repertoireMoves: string[];
    /** Colour of the selected repertoire, null when none is selected. */
    userColor: 'w' | 'b' | null;
    summaries: Map<string, LabRunSummary>;
    /** Starts a lab session on `queue[index]`. */
    onpractice: (queue: LabItem[], index: number) => void;
    /** Moves the board without practising. */
    onjump: (ucis: string[]) => void;
    onaddbook: (lines: string[][]) => void;
  }
  let {
    graph,
    fen,
    ucis,
    repertoireMoves,
    userColor,
    summaries,
    onpractice,
    onjump,
    onaddbook,
  }: Props = $props();

  const MAX_BOOK_LINES = 200;
  const BY_MOVE = 8;
  const BY_NAME = 10;
  let query = $state('');

  const results = $derived(
    graph && query.trim().length >= 2 ? searchOpenings(graph, query, 12) : [],
  );
  const moves = $derived(graph ? bookMoves(graph, fen).slice(0, BY_MOVE) : []);
  const maxLines = $derived(Math.max(1, ...moves.map((m) => m.lines)));
  const byMove = $derived<LabItem[]>(
    graph
      ? moves.map((m) => ({
          line: openingLine(graph!, [...ucis, m.uci]),
          eco: m.eco,
          name: m.name,
        }))
      : [],
  );
  const named = $derived(graph ? practiceByName(graph, { under: ucis, limit: BY_NAME }) : []);
  const byName = $derived<LabItem[]>(
    named.map((o) => ({ line: o.line, eco: o.eco, name: o.name })),
  );
  const searchItems = $derived<LabItem[]>(
    graph
      ? results.map((r) => ({ line: openingLine(graph!, r.uci), eco: r.eco, name: r.name }))
      : [],
  );
  const bookLines = $derived(
    graph && userColor ? bookLinesFrom(graph, fen, userColor, { maxLines: MAX_BOOK_LINES }) : [],
  );

  function sanLine(line: string[], from = 0): string {
    const san = playLine(INITIAL_FEN, line)?.san ?? [];
    return san
      .map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m))
      .slice(from)
      .join(' ');
  }
</script>

<div class="explore">
  <label class="search">
    <span class="sr-only">{t('explore.search')}</span>
    <input type="search" bind:value={query} placeholder={t('explore.searchPlaceholder')} />
  </label>
  {#if searchItems.length}
    <ul class="list" aria-label={t('explore.results')}>
      {#each searchItems as item, i (lineKey(item.line) + i)}
        <li class="with-go">
          <button
            type="button"
            class="item"
            onclick={() => onpractice(searchItems, i)}
            aria-label={t('lab.practise', { name: `${item.eco} ${item.name}` })}
          >
            <span class="title"><b>{item.eco}</b> {item.name}</span>
            <Mastery summary={summaries.get(lineKey(item.line))} />
            <span class="line">{sanLine(item.line)}</span>
          </button>
          <button
            type="button"
            class="go"
            title={t('lab.goToOpening', { name: item.name ?? '' })}
            aria-label={t('lab.goToOpening', { name: item.name ?? '' })}
            onclick={() => {
              onjump(results[i]!.uci);
              query = '';
            }}>→</button
          >
        </li>
      {/each}
    </ul>
  {:else if query.trim().length >= 2}
    <p class="muted">{t('explore.noResults')}</p>
  {/if}

  <h3>{t('lab.byMove')}</h3>
  {#if !graph}
    <p class="muted" aria-busy="true">{t('common.loading')}</p>
  {:else if moves.length === 0}
    <p class="muted">{t('explore.outOfBook')}</p>
  {:else}
    <ul class="list" aria-label={t('lab.byMove')}>
      {#each moves as m, i (m.uci)}
        <li class="with-go">
          <button
            type="button"
            class="item"
            onclick={() => onpractice(byMove, i)}
            aria-label={t('lab.practise', {
              name: `${m.san}${m.name ? ` (${m.eco} ${m.name})` : ''}`,
            })}
          >
            <span class="title">
              <b class="san">{m.san}</b>
              {#if repertoireMoves.includes(m.uci)}<span
                  class="in-rep"
                  title={t('explore.inRepertoire')}>✓</span
                >{/if}
              <span class="opening">{m.name ? `${m.eco} ${m.name}` : ''}</span>
            </span>
            <Mastery summary={summaries.get(lineKey(byMove[i]!.line))} />
            <span class="line">{sanLine(byMove[i]!.line, ucis.length)}</span>
            <span class="bar" style:width={`${Math.max(4, (m.lines / maxLines) * 100)}%`}></span>
          </button>
          <button
            type="button"
            class="go"
            title={t('lab.goTo', { san: m.san })}
            aria-label={t('lab.goTo', { san: m.san })}
            onclick={() => onjump([...ucis, m.uci])}>→</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <h3>{t('lab.byName')}</h3>
  {#if named.length === 0 && graph}
    <p class="muted">{t('lab.noNames')}</p>
  {:else}
    <ul class="list" aria-label={t('lab.byName')}>
      {#each named as o, i (o.line.join(' '))}
        <li>
          <button
            type="button"
            class="item"
            onclick={() => onpractice(byName, i)}
            aria-label={t('lab.practise', { name: `${o.eco} ${o.name}` })}
          >
            <span class="title"><b>{o.eco}</b> {o.name}</span>
            <Mastery summary={summaries.get(lineKey(byName[i]!.line))} />
            <span class="line">{sanLine(byName[i]!.line)}</span>
          </button>
        </li>
      {/each}
    </ul>
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
    gap: 0.5rem;
  }
  .search input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
  }
  h3 {
    margin: 0.6rem 0 0;
    font-size: 0.95rem;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .with-go {
    display: flex;
    gap: 2px;
  }
  .item {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 0.5rem;
    width: 100%;
    text-align: left;
    border: 1px solid transparent;
    background: none;
    padding: 0.3rem 0.45rem;
    border-radius: 5px;
  }
  .item:hover {
    background: var(--hover);
    border-color: var(--border);
  }
  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .line {
    grid-column: 1 / -1;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .san {
    margin-right: 0.3rem;
  }
  .opening {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .in-rep {
    color: #2e7d32;
    font-weight: 700;
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
    opacity: 0.45;
  }
  .go {
    border: none;
    background: none;
    color: var(--muted);
    padding: 0 0.5rem;
    border-radius: 5px;
  }
  .go:hover {
    background: var(--hover);
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
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
</style>
