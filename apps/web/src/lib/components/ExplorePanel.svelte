<script module lang="ts">
  /** The panel's tab survives remounts (a practice session replaces the panel meanwhile). */
  let lastTab: 'here' | 'name' = 'here';
</script>

<script lang="ts">
  import {
    type Continuation,
    INITIAL_FEN,
    type NameTree,
    type OpeningGraph,
    bookLinesFrom,
    buildNameTree,
    branchesFrom,
    sidesFrom,
    commonPrefix,
    moveNumber,
    moverOfLast,
    practiceLine,
    playLine,
    searchOpenings,
    searchPosition,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import type { SrsCard } from '@processchess/core';
  import Mastery from '$lib/components/Mastery.svelte';
  import MiniBoard from '$lib/components/MiniBoard.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import NameAlbum from '$lib/components/NameAlbum.svelte';
  import { isVariationIn, srsOfLine, tileBoard } from '$lib/album';
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

  let nameAlbum = $state<NameAlbum>();
  const isVariation = (name: string | null) => isVariationIn(names, name);
  /** Practise `queue[i]` with the variations of `queue` as the session queue. */
  function practise(queue: LabItem[], i: number) {
    const only = queue.filter((x) => isVariation(x.name));
    const at = only.indexOf(queue[i]!);
    if (at !== -1) onpractice(only, at);
  }
  const srsOf = (line: string[], side: 'w' | 'b' | null) => srsOfLine(line, side, repertoire);

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

  /** Every dictionary branch from the board position (next names by moves). */
  const branches = $derived(graph && standardStart ? branchesFrom(graph, ucis) : []);
  /** Branches grouped by family / subfamily, most played first. */
  const groups = $derived.by(() => {
    const out: { family: string; entries: Continuation[] }[] = [];
    for (const b of branches) {
      const group = out.find((g) => g.family === b.family);
      if (group) group.entries.push(b);
      else out.push({ family: b.family, entries: [b] });
    }
    // whose openings each group leads to, over every name reachable through its branches
    return out.map((g) => {
      const sides = { w: false, b: false };
      if (graph) {
        for (const e of g.entries) {
          const s = sidesFrom(graph, e.ucis);
          sides.w ||= s.w;
          sides.b ||= s.b;
        }
      }
      return { ...g, sides };
    });
  });
  let tab = $state<'here' | 'name'>(lastTab);
  $effect(() => {
    lastTab = tab;
  });
  let showVariations = $state(false);
  /** The family whose variations are shown alone (a group clicked where its branches diverge). */
  let openGroup = $state<string | null>(null);
  // a new position starts with its variations folded again
  $effect(() => {
    void ucis;
    showVariations = false;
    openGroup = null;
  });
  /**
   * A group leads to where its branches still are one line; when they diverge right here, its
   * variations open instead (a single branch is that branch).
   */
  function openFamily(g: { family: string; entries: Continuation[] }) {
    const prefix =
      g.entries.length === 1 ? g.entries[0]!.ucis : commonPrefix(g.entries.map((e) => e.ucis));
    if (prefix.length > ucis.length) {
      onjump(prefix);
      return;
    }
    openGroup = g.family;
    showVariations = true;
  }
  /** Index in `branches` of a group's main line: its most played variation. */
  const mainLineOf = (g: { entries: Continuation[] }) => {
    const main = g.entries.find((e) => isVariation(e.name));
    return main ? branches.indexOf(main) : -1;
  };
  const branchItems = $derived<LabItem[]>(
    graph
      ? branches.map((c) => ({
          line: practiceLine(graph!, c.ucis),
          eco: null,
          name: c.name,
          side: moverOfLast(c.ucis),
        }))
      : [],
  );
  const shownTab = $derived(tab === 'here' && branches.length ? 'here' : 'name');
  const boardOf = (path: readonly string[]) => tileBoard({ ucis: [...path] });
  /** "3.Bb5" / "3…Nf6 4.d4" for moves played after `ucis`. */
  function viaLabel(c: Continuation): string {
    const san = playLine(INITIAL_FEN, c.ucis)?.san ?? [];
    return san
      .slice(ucis.length)
      .map((m, i) => {
        const ply = ucis.length + i;
        return ply % 2 === 0 ? `${ply / 2 + 1}.${m}` : i === 0 ? `${(ply + 1) / 2}…${m}` : m;
      })
      .join(' ');
  }

  const bookLines = $derived(
    graph && userColor ? bookLinesFrom(graph, fen, userColor, { maxLines: MAX_BOOK_LINES }) : [],
  );
</script>

{#snippet add(item: LabItem)}
  {#if inRepertoire(item.line)}
    <span class="in-rep" title={t('explore.inRepertoire')}>✓</span>
  {:else}
    <button
      type="button"
      class="add"
      onclick={() => onadd(item)}
      aria-label={t('rep.addOpening', { name: item.name ?? '' })}
      title={t('rep.addOpening', { name: item.name ?? '' })}>+</button
    >
  {/if}
{/snippet}

<div class="explore">
  <div class="explore-view">
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
                if (n && nameAlbum) nameAlbum.enter({ ...n, ucis: target });
                else onjump(target);
              }}
              aria-label={t('lab.enter', { name: it.name ?? '' })}
            >
              <SideMark side={it.side} />
              <span class="label" title={it.name}>{it.name}</span>
            </button>
            {#if isVariation(it.name)}
              <Mastery summary={summaries.get(lineKey(it.line))} srs={srsOf(it.line, it.side)} />
              <button
                type="button"
                class="play"
                onclick={() => practise(searchItems, i)}
                aria-label={t('lab.practise', { name: it.name ?? '' })}
                title={t('lab.practise', { name: it.name ?? '' })}>▶</button
              >
              {@render add(it)}
            {/if}
          </li>
        {/each}
      </ul>
    {:else if query.trim().length >= 2}
      <p class="muted">{t('explore.noResults')}</p>
    {/if}

    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        id="tab-here"
        aria-controls="panel-here"
        aria-selected={shownTab === 'here'}
        disabled={!branches.length}
        onclick={() => (tab = 'here')}>{t('explore.fromHere')} · {groups.length}</button
      >
      <button
        type="button"
        role="tab"
        id="tab-name"
        aria-controls="panel-name"
        aria-selected={shownTab === 'name'}
        onclick={() => (tab = 'name')}>{t('lab.byName')}</button
      >
    </div>

    <div role="tabpanel" id="panel-name" aria-labelledby="tab-name" hidden={shownTab !== 'name'}>
      {#snippet sideFilterControl()}
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
      {/snippet}
      {#if graph && names}
        <NameAlbum
          bind:this={nameAlbum}
          {graph}
          {names}
          {ucis}
          {sideFilter}
          {summaries}
          {repertoire}
          {onpractice}
          {onjump}
          {onadd}
          {inRepertoire}
          header={sideFilterControl}
        />
      {:else}
        <p class="muted" aria-busy="true">{t('common.loading')}</p>
      {/if}
    </div>
    <div role="tabpanel" id="panel-here" aria-labelledby="tab-here" hidden={shownTab !== 'here'}>
      {#if branches.length}
        <section aria-labelledby="from-here">
          <h3 id="from-here" class="sr-only">{t('explore.fromHere')}</h3>
          <ul class="album" aria-label={t('explore.fromHere')}>
            {#each groups as g (g.family)}
              {@const first = g.entries[0]!}
              {@const board = boardOf(first.ucis)}
              <li class="tile" data-state="folder">
                <button
                  type="button"
                  class="enter"
                  onclick={() => openFamily(g)}
                  aria-label={t('lab.enter', { name: g.family })}
                >
                  <MiniBoard
                    fen={board.fen}
                    lastMove={board.last}
                    orientation={moverOfLast(first.ucis) === 'b' ? 'black' : 'white'}
                    size={88}
                  />
                  <span class="line-hint">{viaLabel(first)}</span>
                  <span class="label" title={g.family}>{g.family}</span>
                  <span class="sides" aria-label={t('explore.sidesLabel')}>
                    {#if g.sides.w}<SideMark side="w" />{/if}
                    {#if g.sides.b}<SideMark side="b" />{/if}
                  </span>
                </button>
                {#if mainLineOf(g) !== -1}
                  <div class="tile-foot">
                    <button
                      type="button"
                      class="play main-line"
                      onclick={() => practise(branchItems, mainLineOf(g))}
                      aria-label={t('explore.mainLine', { name: g.family })}
                      title={t('explore.mainLine', { name: g.family })}
                      >▶ {t('explore.mainLineShort')}</button
                    >
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          <button
            type="button"
            class="more"
            aria-expanded={showVariations}
            onclick={() => {
              showVariations = !showVariations;
              openGroup = null;
            }}
          >
            {showVariations && !openGroup
              ? t('explore.hideVariations')
              : t('explore.showVariations', { n: branches.length })}
          </button>
          {#if showVariations}
            <ul class="album" aria-label={t('explore.variationsHere')}>
              {#each branches as c, i (c.name)}
                {#if !openGroup || c.family === openGroup}
                  {@const board = boardOf(c.ucis)}
                  <li class="tile" data-state={isVariation(c.name) ? 'found' : 'folder'}>
                    <button
                      type="button"
                      class="enter"
                      onclick={() => onjump(c.ucis)}
                      aria-label={t('lab.enter', { name: c.name })}
                    >
                      <MiniBoard
                        fen={board.fen}
                        lastMove={board.last}
                        orientation={branchItems[i]!.side === 'b' ? 'black' : 'white'}
                        size={88}
                      />
                      <span class="line-hint">{viaLabel(c)}</span>
                      <span class="label" title={c.name}>{c.name}</span>
                      <span class="depth">{t('album.move', { n: moveNumber(c.ucis.length) })}</span>
                    </button>
                    <div class="tile-foot">
                      {#if isVariation(c.name)}
                        <Mastery
                          summary={summaries.get(lineKey(branchItems[i]!.line))}
                          srs={srsOf(branchItems[i]!.line, branchItems[i]!.side)}
                        />
                        <button
                          type="button"
                          class="play"
                          onclick={() => practise(branchItems, i)}
                          aria-label={t('lab.practise', { name: c.name })}
                          title={t('lab.practise', { name: c.name })}>▶</button
                        >
                        {@render add(branchItems[i]!)}
                      {/if}
                    </div>
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </div>

    {#if userColor && bookLines.length > 0}
      <button type="button" class="primary" onclick={() => onaddbook(bookLines)}>
        {bookLines.length >= MAX_BOOK_LINES
          ? t('explore.addBookMax', { n: bookLines.length })
          : t('explore.addBook', { n: bookLines.length })}
      </button>
      <p class="muted small">{t('explore.addBookHelp')}</p>
    {/if}
  </div>
</div>

<style>
  .explore-view {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .album {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 0.6rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
    overflow: hidden;
    transition: transform 0.1s;
  }
  .tile:hover {
    transform: translateY(-2px);
  }
  .tile .enter {
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.4rem 0.3rem;
    text-align: center;
  }
  .tile .label {
    max-width: 100%;
    font-size: 0.8rem;
    line-height: 1.2;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tile[data-state='found'] {
    border-color: var(--chip-almost-fg);
    background: var(--chip-almost-bg);
  }
  .tile[data-state='folder'] {
    background: var(--hover);
  }
  .depth {
    font-size: 0.68rem;
    color: var(--muted);
  }
  .main-line {
    font-size: 0.72rem;
    font-weight: 600;
  }
  .sides {
    display: inline-flex;
    gap: 0.2rem;
  }
  .tile-foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    min-height: 1.6rem;
    padding: 0 0.2rem 0.3rem;
  }
  .add {
    border: none;
    background: none;
    color: var(--accent);
    font-weight: 700;
    padding: 0.2rem 0.4rem;
  }
  .in-rep {
    color: var(--chip-review-fg);
    font-weight: 700;
    padding: 0 0.4rem;
  }
  .tabs {
    display: flex;
    gap: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .tabs [role='tab'] {
    border: none;
    background: none;
    padding: 0.35rem 0;
    color: var(--muted);
    border-bottom: 2px solid transparent;
  }
  .tabs [role='tab'][aria-selected='true'] {
    color: var(--fg);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }
  .tabs [role='tab']:disabled {
    opacity: 0.5;
  }
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
  .filter {
    display: inline-flex;
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
  .line-hint {
    color: var(--muted);
    font-size: 0.85rem;
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
    position: relative;
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
  .enter:hover {
    background: var(--hover);
  }
  .label {
    font-size: 0.95rem;
    color: var(--text, inherit);
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
    color: var(--on-accent);
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
</style>
