<script lang="ts">
  import {
    INITIAL_FEN,
    type OpeningGraph,
    bookLinesFrom,
    bookMoves,
    playLine,
    searchOpenings,
  } from '@processchess/core';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    graph: OpeningGraph | null;
    fen: string;
    /** Moves of the selected repertoire from this position (UCI), to mark them. */
    repertoireMoves: string[];
    /** Colour of the selected repertoire, null when none is selected. */
    userColor: 'w' | 'b' | null;
    onplay: (uci: string) => void;
    onjump: (ucis: string[]) => void;
    onaddbook: (lines: string[][]) => void;
  }
  let { graph, fen, repertoireMoves, userColor, onplay, onjump, onaddbook }: Props = $props();

  const MAX_BOOK_LINES = 200;
  let query = $state('');

  const results = $derived(
    graph && query.trim().length >= 2 ? searchOpenings(graph, query, 12) : [],
  );
  const moves = $derived(graph ? bookMoves(graph, fen) : []);
  const maxLines = $derived(Math.max(1, ...moves.map((m) => m.lines)));
  const bookLines = $derived(
    graph && userColor ? bookLinesFrom(graph, fen, userColor, { maxLines: MAX_BOOK_LINES }) : [],
  );

  function sanLine(ucis: string[]): string {
    const san = playLine(INITIAL_FEN, ucis)?.san ?? [];
    return san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
  }
</script>

<div class="explore">
  <label class="search">
    <span class="sr-only">{t('explore.search')}</span>
    <input type="search" bind:value={query} placeholder={t('explore.searchPlaceholder')} />
  </label>
  {#if results.length}
    <ul class="results" aria-label={t('explore.results')}>
      {#each results as r (r.epd)}
        <li>
          <button
            type="button"
            onclick={() => {
              onjump(r.uci);
              query = '';
            }}
          >
            <span class="eco">{r.eco}</span>
            <span class="name">{r.name}</span>
            <span class="line">{sanLine(r.uci)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if query.trim().length >= 2}
    <p class="muted">{t('explore.noResults')}</p>
  {/if}

  <h3>{t('explore.bookMoves')}</h3>
  {#if !graph}
    <p class="muted" aria-busy="true">{t('common.loading')}</p>
  {:else if moves.length === 0}
    <p class="muted">{t('explore.outOfBook')}</p>
  {:else}
    <ul class="book" aria-label={t('explore.bookMoves')}>
      {#each moves as m (m.uci)}
        <li>
          <button type="button" onclick={() => onplay(m.uci)}>
            <span class="san">{m.san}</span>
            <span
              class="in-rep"
              title={repertoireMoves.includes(m.uci) ? t('explore.inRepertoire') : undefined}
              >{repertoireMoves.includes(m.uci) ? '✓' : ''}</span
            >
            <span class="opening">{m.name ? `${m.eco} ${m.name}` : ''}</span>
            <span class="bar" style:width={`${Math.max(4, (m.lines / maxLines) * 100)}%`}></span>
            <span class="count">{m.lines}</span>
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
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .results button,
  .book button {
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
  }
  .results button:hover,
  .book button:hover {
    background: var(--hover);
  }
  .results button {
    display: grid;
    grid-template-columns: 3rem 1fr;
  }
  .results .line {
    grid-column: 2;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .book button {
    display: grid;
    grid-template-columns: 4rem 1.2rem 1fr 3rem;
    align-items: center;
    gap: 0.3rem;
    position: relative;
  }
  .san {
    font-weight: 700;
  }
  .in-rep {
    color: #2e7d32;
    font-weight: 700;
  }
  .opening {
    font-size: 0.85rem;
    color: var(--muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
    opacity: 0.5;
  }
  .count {
    text-align: right;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .eco {
    font-weight: 700;
  }
  h3 {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
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
