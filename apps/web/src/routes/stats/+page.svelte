<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    type CardCounts,
    type DayStat,
    addDays,
    cardCounts,
    dayKey,
    endOfLocalDay,
    fillDays,
    streak,
  } from '@processchess/core';
  import type { Collection } from '@processchess/db';
  import { app, storage } from '$lib/app.svelte';
  import { formatPercent, i18n, t } from '$lib/i18n/index.svelte';

  const DAYS = 30;

  let loaded = $state(false);
  let days = $state.raw<DayStat[]>([]);
  let streakDays = $state(0);
  let rows = $state.raw<{ collection: Collection; counts: CardCounts }[]>([]);

  async function load() {
    const db = storage();
    const now = new Date();
    const today = dayKey(now);
    // a year of history for the streak, the last 30 days for the chart
    const history = await db.dailyStats({ from: addDays(today, -366), to: today });
    days = fillDays(history, today, DAYS);
    streakDays = streak(history, today);
    rows = await Promise.all(
      (await db.listCollections()).map(async (collection) => ({
        collection,
        counts: cardCounts(
          await db.loadTree(collection.id),
          await db.listCards(collection.id),
          now,
          endOfLocalDay(now),
        ),
      })),
    );
    loaded = true;
  }

  $effect(() => {
    if (app.ready) void load();
  });

  const today = $derived(days.at(-1));
  const max = $derived(Math.max(1, ...days.map((d) => d.attempts)));

  function rate(d: DayStat): string {
    return d.attempts ? formatPercent(d.correct / d.attempts) : '–';
  }

  function minutes(ms: number): string {
    return t('stats.minutes', { n: Math.round(ms / 60_000) });
  }

  function shortDay(day: string): string {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }).format(
      new Date(y, m - 1, d),
    );
  }

  // chart geometry (viewBox units)
  const W = 600;
  const H = 160;
  const AXIS = 18;
  const step = W / DAYS;
  const barW = step - 2; // 2px gap between bars
  const R = 4;

  /** Bar path with rounded top corners, anchored to the baseline. */
  function bar(i: number, value: number): string {
    const h = ((H - AXIS - 4) * value) / max;
    const x = i * step + 1;
    const y = H - AXIS - h;
    const r = Math.min(R, h, barW / 2);
    return `M${x},${H - AXIS}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${H - AXIS}Z`;
  }

  let hover = $state<number | null>(null);
  const hovered = $derived(hover === null ? undefined : days[hover]);
</script>

<h1>{t('stats.title')}</h1>

{#if !loaded}
  <p aria-busy="true">{t('common.loading')}</p>
{:else}
  <section aria-labelledby="today-title">
    <h2 id="today-title">{t('stats.today')}</h2>
    <dl class="tiles" data-testid="today">
      <div>
        <dt>{t('stats.played')}</dt>
        <dd data-testid="today-played">{today?.attempts ?? 0}</dd>
      </div>
      <div>
        <dt>{t('stats.firstTry')}</dt>
        <dd data-testid="today-first-try">{today ? rate(today) : '–'}</dd>
      </div>
      <div>
        <dt>{t('stats.newMoves')}</dt>
        <dd data-testid="today-new">{today?.newCards ?? 0}</dd>
      </div>
      <div>
        <dt>{t('stats.time')}</dt>
        <dd>{minutes(today?.timeMs ?? 0)}</dd>
      </div>
      <div>
        <dt>{t('stats.streak')}</dt>
        <dd data-testid="streak">{t('stats.streakDays', { n: streakDays })}</dd>
      </div>
    </dl>
  </section>

  <section aria-labelledby="days-title">
    <h2 id="days-title">{t('stats.last30')}</h2>
    {#if days.every((d) => d.attempts === 0)}
      <p class="muted">{t('stats.none')}</p>
    {:else}
      <figure class="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('stats.chartLabel')}>
          <line class="axis" x1="0" x2={W} y1={H - AXIS} y2={H - AXIS} />
          {#each days as d, i (d.day)}
            <g
              role="presentation"
              onpointerenter={() => (hover = i)}
              onpointerleave={() => (hover = null)}
            >
              <rect class="hit" x={i * step} y="0" width={step} height={H - AXIS} />
              {#if d.attempts}
                <path class="bar" class:active={hover === i} d={bar(i, d.attempts)} />
              {/if}
              <title
                >{t('stats.barTitle', { day: shortDay(d.day), n: d.attempts, pct: rate(d) })}</title
              >
            </g>
          {/each}
          {#each [0, DAYS - 1] as i (i)}
            <text class="label" x={i * step + step / 2} y={H - 4} text-anchor={i ? 'end' : 'start'}
              >{shortDay(days[i]!.day)}</text
            >
          {/each}
        </svg>
        {#if hovered}
          <p class="tooltip" role="status">
            {t('stats.barTitle', {
              day: shortDay(hovered.day),
              n: hovered.attempts,
              pct: rate(hovered),
            })}
          </p>
        {/if}
      </figure>
      <table class="sr-only">
        <caption>{t('stats.chartLabel')}</caption>
        <thead>
          <tr>
            <th>{t('stats.day')}</th>
            <th>{t('stats.played')}</th>
            <th>{t('stats.correct')}</th>
            <th>{t('stats.hint')}</th>
            <th>{t('stats.wrong')}</th>
          </tr>
        </thead>
        <tbody>
          {#each days.filter((d) => d.attempts) as d (d.day)}
            <tr>
              <td>{shortDay(d.day)}</td>
              <td>{d.attempts}</td>
              <td>{d.correct}</td>
              <td>{d.hint}</td>
              <td>{d.wrong}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  {#if rows.length}
    <section aria-labelledby="by-collection-title">
      <h2 id="by-collection-title">{t('stats.byCollection')}</h2>
      <table class="collections">
        <thead>
          <tr>
            <th>{t('home.name')}</th>
            <th>{t('stats.dueNow')}</th>
            <th>{t('stats.dueToday')}</th>
            <th>{t('stats.learning')}</th>
            <th>{t('stats.new')}</th>
            <th>{t('stats.total')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.collection.id)}
            <tr>
              <td>
                {#if r.counts.dueNow}
                  <a href={`${resolve('/')}?c=${r.collection.id}&tab=train&mode=review`}
                    >{r.collection.name}</a
                  >
                {:else}
                  <a href={`${resolve('/')}?c=${r.collection.id}&tab=repertoire`}
                    >{r.collection.name}</a
                  >
                {/if}
              </td>
              <td>{r.counts.dueNow}</td>
              <td>{r.counts.dueToday}</td>
              <td>{r.counts.learning}</td>
              <td>{r.counts.new}</td>
              <td>{r.counts.total}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
{/if}

<style>
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0;
  }
  .tiles div {
    min-width: 8rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .tiles dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .tiles dd {
    margin: 0.2rem 0 0;
    font-size: 1.4rem;
    font-weight: 600;
  }
  .chart {
    margin: 0;
    max-width: 640px;
  }
  svg {
    width: 100%;
    height: auto;
  }
  .axis {
    stroke: var(--border);
    stroke-width: 1;
  }
  .bar {
    fill: var(--accent);
  }
  .bar.active {
    opacity: 0.75;
  }
  .hit {
    fill: transparent;
  }
  .label {
    font-size: 11px;
    fill: var(--muted);
  }
  .tooltip {
    margin: 0.25rem 0 0;
    color: var(--muted);
    min-height: 1.2rem;
  }
  .collections {
    border-collapse: collapse;
    width: 100%;
  }
  .collections th,
  .collections td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
  }
</style>
