<script module lang="ts">
  /** The panel's view survives remounts (a practice session replaces the panel meanwhile). */
  let lastView: 'today' | 'explore' = 'today';
  let lastTab: 'here' | 'name' = 'here';
</script>

<script lang="ts">
  import {
    type Continuation,
    INITIAL_FEN,
    type NameNode,
    type NameTree,
    type OpeningGraph,
    bookLinesFrom,
    buildNameTree,
    branchesFrom,
    sidesFrom,
    commonPrefix,
    isDictionaryLeaf,
    moveNumber,
    moverOfLast,
    parseUci,
    practiceLine,
    playLine,
    resolveOpening,
    lineSrsState,
    rollupMastery,
    searchOpenings,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import type { CardMap, SrsCard, Tree } from '@processchess/core';
  import DailyMix from '$lib/components/DailyMix.svelte';
  import Mastery from '$lib/components/Mastery.svelte';
  import MiniBoard from '$lib/components/MiniBoard.svelte';
  import MasteryRollup from '$lib/components/MasteryRollup.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { type LabItem, MASTERED_STREAK, lineKey } from '$lib/lab.svelte';
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
    /** The user's standard-start repertoires with their cards (the Today card, ADR 013). */
    repertoires: { tree: Tree; cards: CardMap }[];
    /** True once the lab history has loaded. */
    historyReady: boolean;
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
    repertoires,
    historyReady,
    onpractice,
    onjump,
    onaddbook,
    onadd,
    inRepertoire,
  }: Props = $props();

  const MAX_BOOK_LINES = 200;
  const LEVEL_SIZE = 12;
  let query = $state('');
  let showAll = $state(false);
  /** Show the openings of one side only. */
  let sideFilter = $state<'all' | 'w' | 'b'>('all');
  const SIDES = ['all', 'w', 'b'] as const;

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
  // family › subfamily › variation › …, walking up the parents
  const crumbs = $derived.by(() => {
    const chain: NameNode[] = [];
    for (let n = focus; n; n = n.parent ? (names!.get(n.parent) ?? null) : null) chain.unshift(n);
    return chain;
  });
  // families are not an opening of either side: the side filter applies below them
  const levelKeys = $derived(
    (focus ? focus.children : (names?.roots ?? [])).filter(
      (k) =>
        sideFilter === 'all' ||
        names!.get(k)!.kind === 'family' ||
        names!.get(k)!.side === sideFilter,
    ),
  );
  /** Families are named by the UI ("King's Pawn Games"), the others by the dataset. */
  const labelOf = (n: NameNode) => (n.kind === 'family' ? t(`opening.label.${n.style!}`) : n.label);
  const nameOf = (n: NameNode) => (n.kind === 'family' ? labelOf(n) : n.key);
  /** Only variations are practised; families and subfamilies are containers. */
  const isVariation = (name: string | null) =>
    !!name && names?.nodeForName(name)?.kind === 'variation';
  /** Practise `queue[i]` with the variations of `queue` as the session queue. */
  function practise(queue: LabItem[], i: number) {
    const only = queue.filter((x) => isVariation(x.name));
    const at = only.indexOf(queue[i]!);
    if (at !== -1) onpractice(only, at);
  }
  const level = $derived(
    (showAll ? levelKeys : levelKeys.slice(0, LEVEL_SIZE)).map((k) => names!.get(k)!),
  );

  const item = (n: NameNode): LabItem => ({
    line: practiceLine(graph!, n.ucis),
    eco: n.eco,
    name: n.key,
    side: n.side,
  });
  /** Automatic lines out of all the lines of a level and its sublevels. */
  /** FSRS state of a practice line in the repertoire, `null` when it is not there (ADR 013). */
  const srsOf = (line: string[], side: 'w' | 'b' | null) =>
    side ? lineSrsState(line, side, repertoire) : null;
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
      names!,
      n.key,
      (m) => streakOfLine(practiceLine(graph!, m.ucis), m.side),
      MASTERED_STREAK,
    );
  const levelItems = $derived(graph ? level.map(item) : []);
  const focusItem = $derived(graph && focus ? item(focus) : null);

  function enter(n: NameNode | null) {
    const target = n ? n.ucis : [];
    manual = { key: n?.key ?? null, at: target.join(' ') };
    showAll = false;
    onjump(target);
  }

  const results = $derived(
    graph && query.trim().length >= 2
      ? searchOpenings(graph, query, 60)
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
  let view = $state<'today' | 'explore'>(lastView);
  $effect(() => {
    lastView = view;
  });
  /** A variation after which the openings dictionary names nothing else. */
  const isLeaf = (n: NameNode) =>
    n.kind === 'variation' && n.children.length === 0 && !!graph && isDictionaryLeaf(graph, n.ucis);
  /** Album tile of a level: a folder, a covered variation, a discovered one, or a known one. */
  function tileState(n: NameNode, i: number): 'folder' | 'hidden' | 'found' | 'known' {
    if (n.kind !== 'variation') return 'folder';
    const streak = streakOfLine(levelItems[i]!.line, n.side);
    if (streak === undefined) return 'hidden';
    return streak >= MASTERED_STREAK ? 'known' : 'found';
  }
  function tileBoard(n: { ucis: string[] }): { fen: string; last: [string, string] | null } {
    const fen = playLine(INITIAL_FEN, n.ucis)?.fen ?? INITIAL_FEN;
    const u = n.ucis.at(-1);
    if (!u) return { fen, last: null };
    const { from, to } = parseUci(u);
    return { fen, last: [from, to] };
  }
  const album = $derived(focus ? rollupOf(focus) : null);
  /** Deepest move reached at this level: the last move of the deepest discovered variation. */
  const deepest = $derived.by(() => {
    if (!focus || !names || !graph) return 0;
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

  function sanLine(line: string[]): string {
    const moves = playLine(INITIAL_FEN, line)?.san ?? [];
    return moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
  }
</script>

{#snippet leaf()}
  <span class="leaf" title={t('album.leaf')} aria-label={t('album.leaf')} role="img">🍃</span>
{/snippet}

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
  <div class="views" role="tablist">
    <button
      type="button"
      role="tab"
      id="view-today"
      aria-controls="panel-today"
      aria-selected={view === 'today'}
      onclick={() => (view = 'today')}>{t('panel.today')}</button
    >
    <button
      type="button"
      role="tab"
      id="view-explore"
      aria-controls="panel-explore"
      aria-selected={view === 'explore'}
      onclick={() => (view = 'explore')}>{t('panel.explore')}</button
    >
  </div>
  <div
    role="tabpanel"
    id="panel-today"
    aria-labelledby="view-today"
    class="today"
    hidden={view !== 'today'}
  >
    {#if graph && names}
      <DailyMix
        {graph}
        {names}
        {summaries}
        {repertoires}
        {repertoire}
        {historyReady}
        {onjump}
        {onpractice}
      />
    {/if}
  </div>
  <div
    role="tabpanel"
    id="panel-explore"
    aria-labelledby="view-explore"
    class="explore-view"
    hidden={view !== 'explore'}
  >
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
      <section aria-labelledby="by-name">
        <div class="name-head">
          <h3 id="by-name" class="sr-only">{t('lab.byName')}</h3>
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
        </div>
        <nav class="crumbs" aria-label={t('lab.levels')}>
          <button
            type="button"
            onclick={() => enter(null)}
            aria-current={!focus ? 'true' : undefined}>{t('lab.all')}</button
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
              {#if inRepertoire(focusItem.line)}
                <span class="in-rep" title={t('explore.inRepertoire')}>✓</span>
              {:else}
                <button
                  type="button"
                  onclick={() => onadd(focusItem)}
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
                      title={t('lab.sublevels', { n: n.children.length })}
                      >{n.children.length} ›</span
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
  .views {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .views [role='tab'] {
    flex: 1;
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 999px;
    padding: 0.4rem 0;
    font-weight: 600;
    color: var(--muted);
  }
  .views [role='tab'][aria-selected='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .today {
    padding: 0.4rem 0;
  }
  .explore-view:not([hidden]) {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
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
  .main-line {
    font-size: 0.72rem;
    font-weight: 600;
  }
  .sides {
    display: inline-flex;
    gap: 0.2rem;
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
  .name-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
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
