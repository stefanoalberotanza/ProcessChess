<script lang="ts">
  import type { DrillController } from '$lib/drill.svelte';
  import MoveHistory from '$lib/components/MoveHistory.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    ctl: DrillController;
    /** Lines of the whole repertoire and of the subtree of the board position. */
    totalLines: number;
    linesHere: number;
    canStartHere: boolean;
    onstart: (here: boolean) => Promise<void> | void;
    onstop: () => void;
  }
  let { ctl, totalLines, linesHere, canStartHere, onstart, onstop }: Props = $props();

  const drill = $derived(ctl.drill);
  let starting = $state(false);
  async function start(here: boolean) {
    starting = true;
    try {
      await onstart(here);
    } finally {
      starting = false;
    }
  }
  const progress = $derived(ctl.progress);
</script>

<div class="drill-panel" data-saving={ctl.saving > 0 ? 'true' : 'false'}>
  {#if !drill}
    <p>{t('train.intro')}</p>
    <div class="buttons">
      <button
        type="button"
        class="primary"
        onclick={() => start(false)}
        disabled={starting || totalLines === 0}
      >
        {t('train.all', { n: totalLines })}
      </button>
      {#if canStartHere}
        <button type="button" onclick={() => start(true)} disabled={starting || linesHere === 0}>
          {t('train.here', { n: linesHere })}
        </button>
      {/if}
    </div>
    {#if totalLines === 0}<p class="muted">{t('train.empty')}</p>{/if}
  {:else}
    <p class="status">
      <span data-testid="clean-counter" class="counter"
        >{t('drill.cleanCounter', { clean: progress.clean, total: progress.total })}</span
      >
      {#if drill.phase !== 'done'}
        <span class="muted"
          >{t('drill.lineOf', {
            n: Math.min(drill.queueIndex + 1, drill.queue.length),
            total: drill.queue.length,
          })}</span
        >
      {/if}
    </p>

    <p class="live" aria-live="polite" data-testid="announcement">{ctl.announcement}</p>
    {#if drill.phase === 'retry'}
      <p class="feedback wrong" role="alert">{t('drill.replay')}</p>
    {/if}
    {#if ctl.hint && drill.phase === 'user'}
      <p class="feedback hint">{ctl.hintText(ctl.hint)}</p>
    {/if}

    <div class="buttons">
      <button type="button" onclick={() => ctl.askHint()} disabled={!ctl.awaitingMove}
        >{t('drill.hint')} <kbd>H</kbd></button
      >
      <button type="button" onclick={() => ctl.repeat()} disabled={drill.phase === 'done'}
        >{t('drill.repeat')} <kbd>R</kbd></button
      >
      <button type="button" onclick={() => ctl.next()} disabled={drill.phase !== 'line-complete'}
        >{t('drill.next')} <kbd>{t('drill.space')}</kbd></button
      >
      <button type="button" onclick={onstop}>{t('train.stop')}</button>
    </div>

    {#if drill.phase === 'line-complete'}
      <section class="complete" aria-label={t('drill.lineComplete')}>
        <h3>{drill.passes.at(-1)?.clean ? t('drill.lineClean') : t('drill.lineWithErrors')}</h3>
        {#each ctl.lineHistories as h (h.id)}
          <div class="node-history">
            <strong>{h.san}</strong>
            <MoveHistory history={h.history} fenBefore={h.fenBefore} />
          </div>
        {/each}
      </section>
    {:else if drill.phase === 'done'}
      <section class="complete">
        <h3>{t('drill.allDone')}</h3>
        <button type="button" onclick={() => ctl.restart()}>{t('drill.restart')}</button>
      </section>
    {/if}
  {/if}
</div>

<style>
  .drill-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .status {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin: 0;
  }
  .counter {
    font-weight: 600;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .primary {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
  kbd {
    font-size: 0.75em;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 0.25rem;
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
  .live {
    min-height: 1.5rem;
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  h3 {
    font-size: 1rem;
    margin: 0.4rem 0;
  }
</style>
