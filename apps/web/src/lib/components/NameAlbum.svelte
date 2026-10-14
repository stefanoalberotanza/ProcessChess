<script lang="ts">
  import {
    type NameNode,
    type NameTree,
    type OpeningGraph,
    type SrsCard,
    INITIAL_FEN,
    isDictionaryLeaf,
    moveNumber,
    practiceLine,
    playLine,
    resolveOpening,
    rollupMastery,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import type { Snippet } from 'svelte';
  import Mastery from '$lib/components/Mastery.svelte';
  import MiniBoard from '$lib/components/MiniBoard.svelte';
  import MasteryRollup from '$lib/components/MasteryRollup.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { isVariationIn, sanLine, srsOfLine, tileBoard } from '$lib/album';
  import { type LabItem, MASTERED_STREAK, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  /** The opening names as an album: family › subfamily › variation, following the board. */
  interface Props {
    graph: OpeningGraph;
    /** The full name tree (Explore) or a repertoire's (Training). */
    names: NameTree;
    /** Moves from the initial position to the board position. */
    ucis: string[];
    sideFilter?: 'all' | 'w' | 'b';
    summaries: Map<string, LabRunSummary>;
    /** Cards of the user's repertoire moves (FSRS state of repertoire lines, ADR 013). */
    repertoire: Map<string, SrsCard[]>;
    /** Practises `queue[index]` (lab in Explore, drill in Training). */
    onpractice: (queue: LabItem[], index: number) => void;
    /** Moves the board (entering a level). */
    onjump: (ucis: string[]) => void;
    /** Explore only: adds a variation's line to the repertoire. */
    onadd?: (item: LabItem) => void;
    /** Explore only: true when `line` is all in the selected repertoire. */
    inRepertoire?: (line: string[]) => boolean;
    /** Controls shown next to the level navigation (Explore: the side filter). */
    header?: Snippet;
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
    header,
  }: Props = $props();

  const LEVEL_SIZE = 12;
  let showAll = $state(false);
  const san = $derived(playLine(INITIAL_FEN, ucis)?.san ?? []);
  const pathKey = $derived(ucis.join(' '));

  // The level shown follows the board: the name of the position (deepest named one on the path),
  // unless the user just entered a level by its name (a group may share the position of a child).
  let manual = $state<{ key: string | null; at: string } | null>(null);
  const focus = $derived.by((): NameNode | null => {
    if (manual && manual.at === pathKey) return manual.key ? (names.get(manual.key) ?? null) : null;
    const named = ucis.length ? resolveOpening(san) : null;
    return named ? (names.nodeForName(named.name) ?? null) : null;
  });
  // family › subfamily › variation › …, walking up the parents
  const crumbs = $derived.by(() => {
    const chain: NameNode[] = [];
    for (let n = focus; n; n = n.parent ? (names.get(n.parent) ?? null) : null) chain.unshift(n);
    return chain;
  });
  // families are not an opening of either side: the side filter applies below them
  const levelKeys = $derived(
    (focus ? focus.children : names.roots).filter(
      (k) =>
        sideFilter === 'all' ||
        names.get(k)!.kind === 'family' ||
        names.get(k)!.side === sideFilter,
    ),
  );
  /** Families are named by the UI ("King's Pawn Games"), the others by the dataset. */
  const labelOf = (n: NameNode) => (n.kind === 'family' ? t(`opening.label.${n.style!}`) : n.label);
  const nameOf = (n: NameNode) => (n.kind === 'family' ? labelOf(n) : n.key);
  /** Practise `queue[i]` with the variations of `queue` as the session queue. */
  function practise(queue: LabItem[], i: number) {
    const only = queue.filter((x) => isVariationIn(names, x.name));
    const at = only.indexOf(queue[i]!);
    if (at !== -1) onpractice(only, at);
  }
  const level = $derived(
    (showAll ? levelKeys : levelKeys.slice(0, LEVEL_SIZE)).map((k) => names.get(k)!),
  );
  const item = (n: NameNode): LabItem => ({
    line: practiceLine(graph, n.ucis),
    eco: n.eco,
    name: n.key,
    side: n.side,
  });
  const srsOf = (line: string[], side: 'w' | 'b' | null) => srsOfLine(line, side, repertoire);
  /** Progress of a line as a clean streak: FSRS for repertoire lines, the lab otherwise. */
  function streakOfLine(line: string[], side: 'w' | 'b' | null): number | undefined {
    const srs = srsOf(line, side);
    if (srs === 'known') return MASTERED_STREAK;
    if (srs === 'learning') return 1;
    if (srs === 'new') return 0;
    return summaries.get(lineKey(line))?.cleanStreak;
  }
  const rollupOf = (n: NameNode) =>
    rollupMastery(
      names,
      n.key,
      (m) => streakOfLine(practiceLine(graph, m.ucis), m.side),
      MASTERED_STREAK,
    );
  const levelItems = $derived(level.map(item));
  const focusItem = $derived(focus ? item(focus) : null);

  /** Shows the level `n` (null: the top) and moves the board to it. */
  export function enter(n: NameNode | null) {
    const target = n ? n.ucis : [];
    manual = { key: n?.key ?? null, at: target.join(' ') };
    showAll = false;
    onjump(target);
  }

  /** A variation after which the openings dictionary names nothing else. */
  const isLeaf = (n: NameNode) =>
    n.kind === 'variation' && n.children.length === 0 && isDictionaryLeaf(graph, n.ucis);
  /** Album tile of a level: a folder, a covered variation, a discovered one, or a known one. */
  function tileState(n: NameNode, i: number): 'folder' | 'hidden' | 'found' | 'known' {
    if (n.kind !== 'variation') return 'folder';
    const streak = streakOfLine(levelItems[i]!.line, n.side);
    if (streak === undefined) return 'hidden';
    return streak >= MASTERED_STREAK ? 'known' : 'found';
  }
  const album = $derived(focus ? rollupOf(focus) : null);
  /** Deepest move reached at this level: the last move of the deepest discovered variation. */
  const deepest = $derived.by(() => {
    if (!focus) return 0;
    let max = 0;
    const stack = [focus.key];
    while (stack.length) {
      const n = names.get(stack.pop()!);
      if (!n) continue;
      stack.push(...n.children);
      if (n.kind !== 'variation' || n.ucis.length <= 2 * max) continue;
      if (summaries.has(lineKey(practiceLine(graph, n.ucis)))) max = moveNumber(n.ucis.length);
    }
    return max;
  });
</script>

{#snippet leaf()}
  <span class="leaf" title={t('album.leaf')} aria-label={t('album.leaf')} role="img">🍃</span>
{/snippet}

{#snippet add(item: LabItem)}
  {#if inRepertoire && onadd}
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
  {/if}
{/snippet}

<section aria-labelledby="by-name">
  <div class="name-head">
    <h3 id="by-name" class="sr-only">{t('lab.byName')}</h3>
    {@render header?.()}
  </div>
  <nav class="crumbs" aria-label={t('lab.levels')}>
    <button type="button" onclick={() => enter(null)} aria-current={!focus ? 'true' : undefined}
      >{t('lab.all')}</button
    >
    {#each crumbs as c (c.key)}
      <span aria-hidden="true">›</span>
      <button
        type="button"
        onclick={() => enter(c)}
        aria-current={c.key === focus?.key ? 'true' : undefined}>{labelOf(c)}</button
      >
    {/each}
  </nav>

  {#if focus && focusItem}
    <div class="focus" data-testid="lab-focus">
      <div class="focus-head">
        <span class="tag" data-kind={focus.kind}>{t(`opening.level.${focus.kind}`)}</span>
        {#if focus.kind !== 'family'}<SideMark side={focus.side} />{/if}
        <span class="focus-name">{labelOf(focus)}</span>
        {#if isLeaf(focus)}{@render leaf()}{/if}
        {#if focus.kind === 'variation'}
          <Mastery
            summary={summaries.get(lineKey(focusItem.line))}
            srs={srsOf(focusItem.line, focusItem.side)}
          />
        {/if}
        {#if focus.children.length}<MasteryRollup rollup={rollupOf(focus)} />{/if}
      </div>
      <p class="line">{sanLine(focus.kind === 'variation' ? focusItem.line : focus.ucis)}</p>
      {#if focus.kind === 'variation'}
        <button
          type="button"
          class="primary"
          onclick={() => onpractice([focusItem], 0)}
          aria-label={t('lab.practise', { name: focus.key })}
        >
          ▶ {t('lab.practiseThis')}
        </button>
        {#if !inRepertoire || !onadd}{:else if inRepertoire(focusItem.line)}
          <span class="in-rep" title={t('explore.inRepertoire')}>✓</span>
        {:else}
          <button
            type="button"
            onclick={() => onadd(focusItem!)}
            aria-label={t('rep.addOpening', { name: focus.key })}
          >
            + {t('rep.addThis')}
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  {#if !names}
    <p class="muted" aria-busy="true">{t('common.loading')}</p>
  {:else if level.length === 0}
    <p class="muted">{t('lab.noSublevels')}</p>
  {:else}
    {#if album}
      <p class="album-progress" data-testid="album-progress">
        {t('album.found', { found: album.started, total: album.total })}
      </p>
      {#if deepest}
        <p class="album-depth" data-testid="album-depth">
          {t('album.depth', { n: deepest })}
        </p>
      {/if}
    {/if}
    <ul
      class="album"
      aria-label={focus ? t('lab.variationsOf', { name: labelOf(focus) }) : t('lab.families')}
    >
      {#each level as n, i (n.key)}
        {@const state = tileState(n, i)}
        {@const board = tileBoard(n)}
        <li class="tile" data-state={state}>
          <button
            type="button"
            class="enter"
            onclick={() => enter(n)}
            aria-label={t('lab.enter', { name: nameOf(n) })}
          >
            <MiniBoard
              fen={board.fen}
              lastMove={board.last}
              orientation={n.side === 'b' ? 'black' : 'white'}
              size={88}
            />
            <span class="tile-meta">
              <span class="tag" data-kind={n.kind}>{t(`opening.level.${n.kind}`)}</span>
              {#if n.kind !== 'family'}<SideMark side={n.side} />{/if}
              {#if isLeaf(n)}{@render leaf()}{/if}
            </span>
            <span class="label" title={state === 'hidden' ? undefined : nameOf(n)}
              >{state === 'hidden' ? '?' : labelOf(n)}</span
            >
            {#if n.kind !== 'family'}<span class="depth" data-testid="tile-depth"
                >{t('album.move', { n: moveNumber(n.ucis.length) })}</span
              >{/if}
            {#if n.children.length}<span
                class="sub"
                title={t('lab.sublevels', { n: n.children.length })}>{n.children.length} ›</span
              >{/if}
          </button>
          <div class="tile-foot">
            {#if n.children.length}<MasteryRollup rollup={rollupOf(n)} />{/if}
            {#if n.kind === 'variation'}
              {#if state !== 'hidden'}<Mastery
                  summary={summaries.get(lineKey(levelItems[i]!.line))}
                  srs={srsOf(levelItems[i]!.line, n.side)}
                />{/if}
              <button
                type="button"
                class="play"
                onclick={() => practise(levelItems, i)}
                aria-label={t('lab.practise', { name: n.key })}
                title={t('lab.practise', { name: n.key })}>▶</button
              >
              {@render add(levelItems[i]!)}
            {/if}
          </div>
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

<style>
  .album-progress {
    margin: 0.2rem 0;
    font-weight: 600;
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
  .tile[data-state='hidden'] :global(svg) {
    filter: grayscale(0.6);
    opacity: 0.75;
  }
  .tile[data-state='hidden'] .label {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--muted);
  }
  .tile[data-state='found'] {
    border-color: var(--chip-almost-fg);
    background: var(--chip-almost-bg);
  }
  .tile[data-state='known'] {
    border-color: var(--chip-review-fg);
    background: var(--chip-review-bg);
  }
  .tile[data-state='folder'] {
    background: var(--hover);
  }
  .leaf {
    font-size: 0.8rem;
    line-height: 1;
  }
  .depth {
    font-size: 0.68rem;
    color: var(--muted);
  }
  .album-depth {
    margin: -0.4rem 0 0.2rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .tile-meta {
    display: flex;
    align-items: center;
    gap: 0.25rem;
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
  h3 {
    margin: 0.4rem 0 0.3rem;
    font-size: 0.95rem;
  }
  .name-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .tag {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 0 0.3rem;
    color: var(--muted);
    white-space: nowrap;
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
    background: var(--panel);
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
  .sub {
    font-size: 0.75rem;
    color: var(--muted);
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
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
</style>
