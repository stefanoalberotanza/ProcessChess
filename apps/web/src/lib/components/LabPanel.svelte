<script lang="ts">
  import { type LabController, MASTERED_STREAK, edgeKey } from '$lib/lab.svelte';
  import Mastery from '$lib/components/Mastery.svelte';
  import SideMark from '$lib/components/SideMark.svelte';
  import { formatPercent, t } from '$lib/i18n/index.svelte';
  import { lineKey } from '$lib/lab.svelte';

  let { lab, onstop }: { lab: LabController; onstop: () => void } = $props();

  const recall = $derived(lab.recall);
  const item = $derived(lab.item);
  // the line as move numbers; moves not played yet are hidden until the end
  const moves = $derived(
    recall
      ? recall.sans.map((san, i) => ({
          i,
          num: i % 2 === 0 ? `${i / 2 + 1}.` : '',
          san,
          shown: i < recall.ply || recall.phase === 'done',
          stats: lab.edgeStats.get(edgeKey(recall.fens[i]!, recall.ucis[i]!)),
        }))
      : [],
  );
</script>

{#if recall && item}
  <div class="lab" data-saving={lab.saving > 0 ? 'true' : 'false'}>
    <div class="head">
      <SideMark side={item.side} />
      <h3>{item.eco ? `${item.eco} ` : ''}{item.name ?? t('lab.unnamed')}</h3>
      <Mastery summary={lab.summaries.get(lineKey(item.line))} />
    </div>
    <p class="progress" data-testid="lab-progress">
      {recall.phase === 'done'
        ? t('lab.complete')
        : t('lab.moveOf', { n: recall.ply + 1, total: recall.ucis.length })}
    </p>

    <ol class="line" aria-label={t('lab.line')}>
      {#each moves as m (m.i)}
        <li class:current={m.i === recall.ply && recall.phase !== 'done'}>
          <span class="num">{m.num}</span>{m.shown ? m.san : '?'}
        </li>
      {/each}
    </ol>

    <label class="toggle">
      <input
        type="checkbox"
        checked={lab.autoOpponent}
        onchange={(e) => lab.setAutoOpponent(e.currentTarget.checked)}
      />
      {t('lab.autoOpponent')}
    </label>

    <p class="live" aria-live="polite" data-testid="announcement">{lab.announcement}</p>
    {#if recall.phase === 'retry'}
      <p class="feedback wrong" role="alert">{t('lab.replay')}</p>
    {/if}
    {#if lab.hint && recall.phase === 'play'}
      <p class="feedback hint">{lab.hintText(lab.hint)}</p>
    {/if}

    <div class="buttons">
      <button type="button" onclick={() => lab.askHint()} disabled={!lab.awaitingMove}
        >{t('drill.hint')} <kbd>H</kbd></button
      >
      <button type="button" onclick={() => lab.repeat()}>{t('lab.repeat')} <kbd>R</kbd></button>
      <button
        type="button"
        onclick={() => void lab.next()}
        disabled={recall.phase !== 'done' || !lab.hasNext}
        >{t('lab.next')} <kbd>{t('drill.space')}</kbd></button
      >
      <button type="button" onclick={onstop}>{t('lab.stop')}</button>
    </div>

    <section class="history" aria-label={t('lab.history')}>
      <h4>{t('lab.history')}</h4>
      {#if lab.runs.length === 0}
        <p class="muted">{t('lab.noRuns')}</p>
      {:else}
        <ol class="runs" data-testid="lab-runs">
          {#each lab.runs as r (r.id)}
            <li
              class:clean={r.clean}
              data-clean={r.clean}
              title={r.clean
                ? t('lab.runClean')
                : t('lab.runErrors', { errors: r.errors, hints: r.hints })}
            >
              {r.clean ? '✓' : '✗'}
            </li>
          {/each}
        </ol>
        <p class="muted small">
          {t('lab.runsSummary', { runs: lab.runs.length, goal: MASTERED_STREAK })}
        </p>
      {/if}
      {#if recall.phase === 'done'}
        <table class="moves">
          <thead>
            <tr><th>{t('lab.move')}</th><th>{t('lab.firstTry')}</th><th>{t('lab.recent')}</th></tr>
          </thead>
          <tbody>
            {#each moves as m (m.i)}
              <tr>
                <td>{m.num}{m.san}</td>
                <td>{m.stats ? formatPercent(m.stats.firstTry / m.stats.total) : '—'}</td>
                <td class="recent">
                  {#each m.stats?.recent ?? [] as r, j (j)}<span class={r}></span>{/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  </div>
{/if}

<style>
  .lab {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  h4 {
    margin: 0.4rem 0 0.2rem;
    font-size: 0.9rem;
  }
  .progress {
    margin: 0;
    font-weight: 600;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 1.05rem;
  }
  .line li {
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
  }
  .line li.current {
    background: var(--accent);
    color: white;
  }
  .num {
    color: var(--muted);
    margin-right: 0.15rem;
  }
  .current .num {
    color: inherit;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .live {
    min-height: 1.4rem;
    margin: 0;
  }
  .feedback {
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    margin: 0;
  }
  .wrong {
    background: #f8d7da;
    color: #7a1020;
  }
  .hint {
    background: #e3f0fb;
    color: #0b3a66;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  kbd {
    font-size: 0.75em;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 0.25rem;
  }
  .runs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .runs li {
    width: 1.3rem;
    height: 1.3rem;
    display: grid;
    place-items: center;
    border-radius: 4px;
    color: white;
    font-size: 0.8rem;
    background: #c62828;
  }
  .runs li.clean {
    background: #2e7d32;
  }
  .moves {
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-top: 0.4rem;
  }
  .moves th,
  .moves td {
    text-align: left;
    padding: 0.15rem 0.6rem 0.15rem 0;
  }
  .recent {
    display: flex;
    gap: 2px;
  }
  .recent span {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 2px;
  }
  .recent .correct {
    background: #2e7d32;
  }
  .recent .hint {
    background: #b26a00;
    padding: 0;
  }
  .recent .wrong {
    background: #c62828;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.8rem;
    margin: 0;
  }
</style>
