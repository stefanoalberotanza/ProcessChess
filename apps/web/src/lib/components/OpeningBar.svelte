<script lang="ts">
  import { resolveOpening } from '@processchess/core';
  import { app } from '$lib/app.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    /** SAN moves from the initial position; null when the collection has a custom start. */
    movesSan: string[] | null;
    /** SAN of a move just played that is not in the repertoire. */
    outOfRepertoire?: string | null;
  }
  let { movesSan, outOfRepertoire = null }: Props = $props();

  // the openings dataset is loaded with the app (app.ready)
  const opening = $derived(app.ready && movesSan ? resolveOpening(movesSan) : null);
  const outOfTheory = $derived(
    movesSan !== null && movesSan.length > 0 && (opening?.ply ?? 0) < movesSan.length,
  );
</script>

<div class="opening-bar" aria-live="polite" data-testid="opening-bar">
  {#if opening}
    <span class="eco">{opening.eco}</span>
    <span class="family">{opening.family}</span>
    {#if opening.variation}<span class="variation">{opening.variation}</span>{/if}
  {:else if movesSan === null}
    <span class="muted">{t('opening.customStart')}</span>
  {:else}
    <span class="muted">{movesSan.length === 0 ? t('opening.start') : t('opening.unknown')}</span>
  {/if}
  {#if outOfTheory}
    <span class="badge theory" title={t('opening.outOfTheoryHelp')}>{t('opening.outOfTheory')}</span
    >
  {/if}
  {#if outOfRepertoire}
    <span class="badge repertoire" data-testid="out-of-repertoire"
      >{t('opening.outOfRepertoire', { san: outOfRepertoire })}</span
    >
  {/if}
</div>

<style>
  .opening-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }
  .eco {
    font-weight: 700;
  }
  .variation,
  .muted {
    color: var(--muted);
  }
  .badge {
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.85rem;
  }
  .theory {
    background: #fff3cd;
    color: #6b5000;
  }
  .repertoire {
    background: #f8d7da;
    color: #7a1020;
  }
</style>
