<!-- The Today tab: one short puzzle session a day with hearts, combo and streak. -->
<script lang="ts">
  import { HEARTS } from '@processchess/core';
  import Bishop from '$lib/components/Bishop.svelte';
  import EffectsSwitch from '$lib/components/EffectsSwitch.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import type { TodayController } from '$lib/today.svelte';

  let { today }: { today: TodayController } = $props();

  const run = $derived(today.run);
  const hearts = $derived(today.status === 'idle' ? HEARTS : run.hearts);
</script>

{#snippet heartRow()}
  <span
    class="hearts"
    role="img"
    data-testid="today-hearts"
    aria-label={t('today.hearts', { n: hearts })}
  >
    {#each Array.from({ length: HEARTS }, (_, i) => i) as i (i)}
      <span class:lost={i >= hearts} aria-hidden="true">♥</span>
    {/each}
  </span>
{/snippet}

{#snippet streakLine()}
  <p class="streak" data-testid="today-streak">{t('today.streak', { n: today.streak })}</p>
{/snippet}

<div class="today">
  <h2>{t('today.label')}</h2>

  {#if today.status === 'loading'}
    <p>{t('common.loading')}</p>
  {:else if today.status === 'idle'}
    {@render streakLine()}
    {@render heartRow()}
    <p>{t('today.intro', { n: today.puzzles.length })}</p>
    <button type="button" class="primary" onclick={() => today.start()}>{t('today.start')}</button>
  {:else if today.status === 'empty'}
    {@render streakLine()}
    <p data-testid="today-empty">{t('today.empty')}</p>
  {:else if today.status === 'done-for-today'}
    <Bishop expression="calm" size={72} />
    <p data-testid="today-done"><strong>{t('today.doneForToday')}</strong></p>
    {@render streakLine()}
    <p>{t('today.comeBack')}</p>
  {:else}
    <div class="header">
      {@render heartRow()}
      <span data-testid="today-combo">{t('today.combo', { n: run.combo })}</span>
      <span data-testid="today-streak">{t('today.streak', { n: today.streak })}</span>
      {#if today.status !== 'finished'}
        <span data-testid="today-progress"
          >{t('today.progress', {
            k: today.status === 'puzzle-done' ? run.puzzle : run.puzzle + 1,
            n: run.total,
          })}</span
        >
      {/if}
    </div>
    <div class="feedback">
      <Bishop expression={today.mood} size={72} />
      <p role="status" aria-live="polite" data-testid="today-announcement">
        {today.status === 'finished' ? '' : today.announcement}
      </p>
    </div>
    {#if today.revealed && today.status === 'playing'}
      <p class="reveal" data-testid="today-name">{today.revealed}</p>
    {/if}

    {#if today.status === 'playing' && today.awaitingMove}
      <button type="button" onclick={() => today.askHint()}>{t('drill.hint')}</button>
    {:else if today.status === 'puzzle-done' && today.result}
      <div class="card" data-testid="today-result">
        <p>
          <strong
            >{today.result.outcome === 'clean'
              ? t('today.clean')
              : today.result.outcome === 'hints'
                ? t('today.withHints')
                : t('today.withErrors')}</strong
          >
        </p>
        {#if today.result.name}<p>{today.result.name}</p>{/if}
        {#if today.result.automatic}<p class="automatic">{t('today.automatic')}</p>{/if}
        <button type="button" class="primary" onclick={() => today.next()}>{t('today.next')}</button
        >
      </div>
    {:else if today.status === 'finished'}
      <div class="card" data-testid="today-summary">
        <p>
          <strong>{run.status === 'stopped' ? t('today.stopped') : t('today.finished')}</strong>
        </p>
        <p>
          {t('today.summary', {
            clean: run.clean,
            hints: run.hinted,
            errors: run.errored,
            combo: run.bestCombo,
          })}
        </p>
        {#if today.review.length}
          <p>{t('today.review')}</p>
          <ul>
            {#each today.review as r (r)}<li>{r}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}

  <p class="effects"><EffectsSwitch /></p>
</div>

<style>
  .today {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    align-items: center;
  }
  .hearts {
    color: #d33;
    font-size: 1.2rem;
    letter-spacing: 0.1rem;
  }
  .hearts .lost {
    opacity: 0.2;
  }
  .feedback {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }
  .feedback p {
    margin: 0;
  }
  .reveal {
    font-weight: 600;
    margin: 0;
  }
  .card {
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 0.6rem 0.8rem;
  }
  .card p {
    margin: 0.2rem 0;
  }
  .automatic {
    font-weight: 600;
  }
  .streak {
    margin: 0;
  }
  .effects {
    margin-top: 0.6rem;
    font-size: 0.9rem;
  }
</style>
