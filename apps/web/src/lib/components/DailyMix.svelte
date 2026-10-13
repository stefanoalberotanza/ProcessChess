<!-- The day's practice mix: almost-automatic lines, reviews and a new neighbour (core dailyMix). -->
<script lang="ts">
  import {
    type MixEntry,
    type MixKind,
    type NameTree,
    type OpeningGraph,
    dailyMix,
    mixNext,
    moverOfLast,
    practiceLine,
  } from '@processchess/core';
  import type { LabRunSummary } from '@processchess/db';
  import { type LabItem, MASTERED_STREAK, lineKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { now } from '$lib/time';
  import { untrack } from 'svelte';

  interface Props {
    graph: OpeningGraph;
    names: NameTree;
    summaries: Map<string, LabRunSummary>;
    /** True once the lab history has loaded: the mix is built from it, never before. */
    historyReady: boolean;
    onjump: (ucis: string[]) => void;
    onpractice: (queue: LabItem[], index: number) => void;
  }
  let { graph, names, summaries, historyReady, onjump, onpractice }: Props = $props();

  const KEY = 'pc.mix';
  const localDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let today = $state(localDay(now()));

  /** The day's counter and, once built, its picks: the goal survives remounts and reloads. */
  interface Stored {
    day: string;
    shuffle: number;
    picks?: { key: string; kind: MixKind }[];
    firstDay?: boolean;
  }
  function readStored(): Partial<Stored> | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    } catch {
      return null;
    }
  }
  function writeStored(v: Stored) {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* private mode: the mix lives in memory only */
    }
  }
  function readShuffle(): number {
    const v = readStored();
    return v?.day === today && typeof v.shuffle === 'number' ? v.shuffle : 0;
  }
  let shuffle = $state(readShuffle());
  /** After midnight the panel moves to the new day's mix (and its stored counter). */
  function refreshDay() {
    const day = localDay(now());
    if (day === today) return;
    today = day;
    shuffle = readShuffle();
  }
  $effect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDay();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshDay);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshDay);
    };
  });
  function change() {
    refreshDay();
    shuffle++;
    writeStored({ day: today, shuffle });
  }

  const lineOf = (node: { ucis: string[] }) => practiceLine(graph, node.ucis);
  // frozen per (day, shuffle); recomputed once when the history first arrives
  // built once the history has loaded, then fixed per (day, shuffle): practising updates the ✓
  // and the count, never the entries
  const mix = $derived.by<{ entries: MixEntry[]; firstDay: boolean; stored: boolean }>(() => {
    if (!historyReady) return { entries: [], firstDay: false, stored: true };
    const s = shuffle;
    const day = today;
    return untrack(() => {
      const kept = readStored();
      if (kept?.day === day && kept.shuffle === s && kept.picks?.length) {
        const entries = kept.picks.flatMap((p) => {
          const node = names.get(p.key);
          // picks stored before subfamilies became containers are rebuilt
          return node?.kind === 'variation' ? [{ node, kind: p.kind }] : [];
        });
        if (entries.length === kept.picks.length) {
          return { entries, firstDay: kept.firstDay ?? false, stored: true };
        }
      }
      return build(day, s);
    });
  });
  function build(day: string, s: number) {
    return {
      stored: false,
      firstDay: summaries.size === 0,
      entries: dailyMix({
        tree: names,
        day,
        shuffle: s,
        masteredStreak: MASTERED_STREAK,
        lineOf: (n) => lineKey(lineOf(n)),
        summaryOf: (n) => {
          const sum = summaries.get(lineKey(lineOf(n)));
          return sum && { ...sum, lastAt: sum.lastAt.getTime() };
        },
      }),
    };
  }
  // remember a freshly built mix for the rest of the day
  $effect(() => {
    if (mix.stored || !mix.entries.length) return;
    writeStored({
      day: today,
      shuffle,
      picks: mix.entries.map((e) => ({ key: e.node.key, kind: e.kind })),
      firstDay: mix.firstDay,
    });
  });
  const entries = $derived(mix.entries);
  const items = $derived<LabItem[]>(
    entries.map((e) => ({
      line: lineOf(e.node),
      eco: null,
      name: e.node.key,
      side: moverOfLast(e.node.ucis),
    })),
  );
  const doneToday = (it: LabItem) => {
    const s = summaries.get(lineKey(it.line));
    return !!s && s.lastClean && localDay(s.lastAt) === today;
  };
  const doneFlags = $derived(items.map(doneToday));
  const done = $derived(doneFlags.filter(Boolean).length);
  // the first-day wording only until something is done
  const firstDay = $derived(mix.firstDay && done === 0);
  const next = $derived(mixNext(doneFlags));
  const others = $derived(entries.map((e, i) => ({ e, i })).filter(({ i }) => i !== next));
</script>

{#if entries.length}
  <section class="goal" data-testid="mix-card" aria-labelledby="mix-goal">
    <div class="top">
      <h3 id="mix-goal">{firstDay ? t('mix.start') : t('mix.goal')}</h3>
      <button type="button" class="change" onclick={change}>🎲 {t('mix.shuffle')}</button>
    </div>
    <p class="big">
      {next === -1
        ? t('mix.allDone')
        : firstDay
          ? t('mix.firstDay', { total: entries.length })
          : t('mix.progress', { done, total: entries.length })}
    </p>
    <div class="steps" aria-hidden="true">
      {#each doneFlags as d, i (i)}<i class:done={d}></i>{/each}
    </div>
    {#if next !== -1}
      {@const e = entries[next]!}
      <p class="next">
        {t('mix.next')} · <span class="chip" data-kind={e.kind}>{t(`mix.kind.${e.kind}`)}</span>
      </p>
      <button
        type="button"
        class="next-name"
        data-testid="mix-next-name"
        title={e.node.key}
        onclick={() => onjump(e.node.ucis)}>{e.node.key}</button
      >
      <button type="button" class="go" onclick={() => onpractice(items, next)}>
        ▶ {t('mix.practiseNow')}
      </button>
    {/if}
  </section>
  <ul class="list" aria-label={t('mix.title')}>
    {#each others as { e, i } (e.node.key)}
      <li class="row">
        {#if doneFlags[i]}<span class="done" aria-hidden="true">✓</span>{:else}<span class="pad"
          ></span>{/if}
        <button
          type="button"
          class="enter"
          onclick={() => onjump(e.node.ucis)}
          aria-label={t('lab.enter', { name: e.node.key })}
        >
          <span class="label" title={e.node.key}>{e.node.key}</span>
        </button>
        <span class="chip" data-kind={e.kind}>{t(`mix.kind.${e.kind}`)}</span>
        {#if !doneFlags[i]}
          <button
            type="button"
            class="play"
            onclick={() => onpractice(items, i)}
            aria-label={t('lab.practise', { name: e.node.key })}
            title={t('lab.practise', { name: e.node.key })}>▶</button
          >
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .goal {
    border-radius: 10px;
    background: linear-gradient(135deg, var(--accent), var(--brass-hi));
    color: var(--on-accent);
    padding: 0.9rem;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h3 {
    color: inherit;
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    opacity: 0.9;
  }
  .change {
    border: none;
    background: rgba(27, 18, 12, 0.18);
    color: var(--on-accent);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
  }
  .big {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0.2rem 0 0;
  }
  .steps {
    display: flex;
    gap: 4px;
    margin: 0.6rem 0;
  }
  .steps i {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(27, 18, 12, 0.25);
  }
  .steps i.done {
    background: var(--on-accent);
  }
  .next {
    margin: 0;
    font-size: 0.8rem;
  }
  .goal .chip {
    background: rgba(27, 18, 12, 0.18);
    color: var(--on-accent);
  }
  .next-name {
    display: block;
    max-width: 100%;
    border: none;
    background: none;
    color: var(--on-accent);
    padding: 0;
    margin-top: 0.15rem;
    font-size: 1rem;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .go {
    margin-top: 0.6rem;
    border: none;
    border-radius: 6px;
    background: var(--on-accent);
    color: var(--accent);
    font-weight: 700;
    padding: 0.45rem 0.9rem;
  }
  .list {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-bottom: 1px solid var(--border);
  }
  .done {
    color: var(--chip-review-fg);
    font-weight: 700;
    width: 1rem;
  }
  .pad {
    width: 1rem;
  }
  .enter {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    text-align: left;
    padding: 0.45rem 0.2rem;
  }
  .label {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.95rem;
  }
  .chip {
    font-size: 0.65rem;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
    white-space: nowrap;
  }
  .chip[data-kind='almost'] {
    background: var(--chip-almost-bg);
    color: var(--chip-almost-fg);
  }
  .chip[data-kind='review'] {
    background: var(--chip-review-bg);
    color: var(--chip-review-fg);
  }
  .chip[data-kind='new'] {
    background: var(--chip-new-bg);
    color: var(--chip-new-fg);
  }
  .play {
    border: none;
    background: none;
    color: var(--accent);
  }
</style>
