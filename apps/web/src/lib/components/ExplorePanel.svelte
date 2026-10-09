<script lang="ts">
  import {
    INITIAL_FEN,
    type NameNode,
    type NameTree,
    type OpeningGraph,
    bookLinesFrom,
    bookMoves,
    buildNameTree,
    joinSegments,
    nameSegments,
    openingLine,
    playLine,
    resolveOpening,
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
    /** Moves the board (entering an opening or a move). */
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
  const LEVEL_SIZE = 12;
  let query = $state('');
  let showAll = $state(false);

  const names = $derived<NameTree | null>(graph ? buildNameTree(graph) : null);
  const san = $derived(playLine(INITIAL_FEN, ucis)?.san ?? []);
  const pathKey = $derived(ucis.join(' '));

  // The level shown follows the board: the name of the position (deepest named one on the path),
  // unless the user just entered a level by its name (a group may share the position of a child).
  let manual = $state<{ key: string | null; at: string } | null>(null);
  const focus = $derived.by((): NameNode | null => {
    if (!names) return null;
    if (manual && manual.at === pathKey) return manual.key ? (names.get(manual.key) ?? null) : null;
    const named = graph && ucis.length ? resolveOpening(san) : null;
    return named ? (names.nodeForName(named.name) ?? null) : null;
  });
  const crumbs = $derived(
    focus
      ? nameSegments(focus.key).map((_, i, all) => names!.get(joinSegments(all.slice(0, i + 1)))!)
      : [],
  );
  const levelKeys = $derived(focus ? focus.children : (names?.roots ?? []));
  const level = $derived(
    (showAll ? levelKeys : levelKeys.slice(0, LEVEL_SIZE)).map((k) => names!.get(k)!),
  );

  const item = (n: NameNode): LabItem => ({
    line: openingLine(graph!, n.ucis),
    eco: n.eco,
    name: n.key,
  });
  const levelItems = $derived(graph ? level.map(item) : []);
  const focusItem = $derived(graph && focus ? item(focus) : null);

  function enter(n: NameNode | null) {
    const target = n ? n.ucis : [];
    manual = { key: n?.key ?? null, at: target.join(' ') };
    showAll = false;
    onjump(target);
  }

  const results = $derived(
    graph && query.trim().length >= 2 ? searchOpenings(graph, query, 12) : [],
  );
  const searchItems = $derived<LabItem[]>(
    graph
      ? results.map((r) => ({ line: openingLine(graph!, r.uci), eco: r.eco, name: r.name }))
      : [],
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
  const bookLines = $derived(
    graph && userColor ? bookLinesFrom(graph, fen, userColor, { maxLines: MAX_BOOK_LINES }) : [],
  );

  /** A name relative to the level shown ("English Attack" inside the Najdorf). */
  function relativeName(name: string): string {
    if (!focus) return name;
    if (name === focus.key) return '=';
    for (const sep of [': ', ', ']) {
      if (name.startsWith(focus.key + sep)) return name.slice(focus.key.length + sep.length);
    }
    return name; // another family: a transposition
  }

  function sanLine(line: string[]): string {
    const moves = playLine(INITIAL_FEN, line)?.san ?? [];
    return moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
  }
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
              const n = names?.nodeForName(it.name!);
              query = '';
              if (n) enter({ ...n, ucis: target });
              else onjump(target);
            }}
            aria-label={t('lab.enter', { name: it.name ?? '' })}
          >
            <span class="eco">{it.eco}</span>
            <span class="label">{it.name}</span>
          </button>
          <Mastery summary={summaries.get(lineKey(it.line))} />
          <button
            type="button"
            class="play"
            onclick={() => onpractice(searchItems, i)}
            aria-label={t('lab.practise', { name: `${it.eco} ${it.name}` })}
            title={t('lab.practise', { name: `${it.eco} ${it.name}` })}>▶</button
          >
        </li>
      {/each}
    </ul>
  {:else if query.trim().length >= 2}
    <p class="muted">{t('explore.noResults')}</p>
  {/if}

  <section aria-labelledby="by-name">
    <h3 id="by-name">{t('lab.byName')}</h3>
    <nav class="crumbs" aria-label={t('lab.levels')}>
      <button type="button" onclick={() => enter(null)} aria-current={!focus ? 'true' : undefined}
        >{t('lab.all')}</button
      >
      {#each crumbs as c (c.key)}
        <span aria-hidden="true">›</span>
        <button
          type="button"
          onclick={() => enter(c)}
          aria-current={c.key === focus?.key ? 'true' : undefined}>{c.label}</button
        >
      {/each}
    </nav>

    {#if focus && focusItem}
      <div class="focus" data-testid="lab-focus">
        <div class="focus-head">
          <span class="eco">{focus.eco}</span>
          <span class="focus-name">{focus.label}</span>
          <Mastery summary={summaries.get(lineKey(focusItem.line))} />
        </div>
        <p class="line">{sanLine(focusItem.line)}</p>
        <button
          type="button"
          class="primary"
          onclick={() => onpractice([focusItem], 0)}
          aria-label={t('lab.practise', { name: focus.key })}
        >
          ▶ {t('lab.practiseThis')}
        </button>
      </div>
    {/if}

    {#if !names}
      <p class="muted" aria-busy="true">{t('common.loading')}</p>
    {:else if level.length === 0}
      <p class="muted">{t('lab.noSublevels')}</p>
    {:else}
      <ul
        class="list"
        aria-label={focus ? t('lab.variationsOf', { name: focus.label }) : t('lab.families')}
      >
        {#each level as n, i (n.key)}
          <li class="row">
            <button
              type="button"
              class="enter"
              onclick={() => enter(n)}
              aria-label={t('lab.enter', { name: n.key })}
            >
              <span class="eco">{n.eco}</span>
              <span class="label">{n.label}</span>
              {#if n.children.length}<span
                  class="sub"
                  title={t('lab.sublevels', { n: n.children.length })}>{n.children.length} ›</span
                >{/if}
            </button>
            <Mastery summary={summaries.get(lineKey(levelItems[i]!.line))} />
            <button
              type="button"
              class="play"
              onclick={() => onpractice(levelItems, i)}
              aria-label={t('lab.practise', { name: n.key })}
              title={t('lab.practise', { name: n.key })}>▶</button
            >
          </li>
        {/each}
      </ul>
      {#if levelKeys.length > LEVEL_SIZE && !showAll}
        <button type="button" class="more" onclick={() => (showAll = true)}>
          {t('lab.showAll', { n: levelKeys.length })}
        </button>
      {/if}
    {/if}
  </section>

  <section aria-labelledby="by-move">
    <h3 id="by-move">{t('lab.byMove')}</h3>
    {#if graph && moves.length === 0}
      <p class="muted">{t('explore.outOfBook')}</p>
    {:else}
      <ul class="list" aria-label={t('lab.byMove')}>
        {#each moves as m, i (m.uci)}
          <li class="row">
            <button
              type="button"
              class="enter"
              onclick={() => onjump([...ucis, m.uci])}
              aria-label={t('lab.goTo', { san: m.san })}
            >
              <b class="san">{m.san}</b>
              {#if repertoireMoves.includes(m.uci)}<span
                  class="in-rep"
                  title={t('explore.inRepertoire')}>✓</span
                >{/if}
              <span class="label muted" title={m.name ? `${m.eco} ${m.name}` : undefined}
                >{m.name ? `${m.eco} ${relativeName(m.name)}` : ''}</span
              >
              <span class="bar" style:width={`${Math.max(4, (m.lines / maxLines) * 100)}%`}></span>
            </button>
            <Mastery summary={summaries.get(lineKey(byMove[i]!.line))} />
            <button
              type="button"
              class="play"
              onclick={() => onpractice(byMove, i)}
              aria-label={t('lab.practise', {
                name: `${m.san}${m.name ? ` (${m.eco} ${m.name})` : ''}`,
              })}
              title={sanLine(byMove[i]!.line)}>▶</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </section>

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
  h3 {
    margin: 0.4rem 0 0.3rem;
    font-size: 0.95rem;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.9rem;
    margin-bottom: 0.4rem;
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
  .focus {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.5rem;
    background: white;
  }
  .focus-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .focus-name {
    font-weight: 600;
    flex: 1;
  }
  .line {
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0.25rem 0 0.4rem;
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
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    text-align: left;
    border: none;
    background: none;
    padding: 0.4rem 0.3rem;
    border-radius: 4px;
  }
  .enter:hover {
    background: var(--hover);
  }
  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex: 1;
  }
  .eco {
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--muted);
    min-width: 2.2rem;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .san {
    min-width: 2.6rem;
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
    opacity: 0.4;
  }
  .play {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .play:hover {
    background: var(--hover);
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
