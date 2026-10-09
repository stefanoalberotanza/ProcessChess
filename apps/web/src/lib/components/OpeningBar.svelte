<script lang="ts">
  import {
    type OpeningGraph,
    classifyOpening,
    formatLine,
    isBookPosition,
  } from '@processchess/core';
  import { app } from '$lib/app.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    /** SAN moves from the initial position; null when the collection has a custom start. */
    movesSan: string[] | null;
    /** Board after `movesSan`. */
    fen: string;
    /** Opening graph, to tell book positions (named or not) from positions out of theory. */
    graph: OpeningGraph | null;
    /** SAN of a move just played that is not in the repertoire. */
    outOfRepertoire?: string | null;
    /** Lab: SAN of a move just played that is not the opening's move. */
    outOfLine?: string | null;
  }
  let { movesSan, fen, graph, outOfRepertoire = null, outOfLine = null }: Props = $props();

  // the openings dataset is loaded with the app (app.ready)
  // label › opening › variation (ADR 012): one-move names are style labels, not openings
  const c = $derived(app.ready && movesSan ? classifyOpening(movesSan) : null);
  // Out of theory = the position is not on any book line. Not "the position has no name": book
  // lines pass through unnamed positions (e.g. halfway through the Indian Defense line).
  const outOfTheory = $derived(
    movesSan !== null && movesSan.length > 0 && graph !== null && !isBookPosition(graph, fen),
  );
</script>

<div class="opening-bar" aria-live="polite" data-testid="opening-bar">
  {#if c?.label}
    <span class="level" data-level="family">
      <span class="tag">{t('opening.level.family')}</span>
      <span class="badge label" data-testid="opening-label">{t(`opening.label.${c.label}`)}</span>
      <span class="line">{formatLine(movesSan!.slice(0, 1))}</span>
    </span>
  {/if}
  {#if c?.opening}
    <span class="level" data-level="subfamily">
      <span class="tag">{t('opening.level.subfamily')}</span>
      <span class="eco">{c.opening.eco}</span>
      <span class="family">{c.opening.name}</span>
      <span class="line">{formatLine(movesSan!.slice(0, c.opening.ply))}</span>
    </span>
  {/if}
  {#if c?.variation}
    <span class="level" data-level="variation">
      <span class="tag">{t('opening.level.variation')}</span>
      <span class="eco">{c.variation.eco}</span>
      <span class="variation">{c.variation.name}</span>
      <span class="line">{formatLine(movesSan!.slice(0, c.variation.ply))}</span>
    </span>
  {/if}
  {#if !c?.label}
    {#if movesSan === null}
      <span class="muted">{t('opening.customStart')}</span>
    {:else}
      <span class="muted">{movesSan.length === 0 ? t('opening.start') : t('opening.unknown')}</span>
    {/if}
  {/if}
  {#if outOfTheory}
    <span class="badge theory" data-testid="out-of-theory" title={t('opening.outOfTheoryHelp')}
      >{t('opening.outOfTheory')}</span
    >
  {/if}
  {#if outOfLine}
    <span class="badge repertoire" data-testid="out-of-line"
      >{t('lab.outOfLine', { san: outOfLine })}</span
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
  .muted,
  .line {
    color: var(--muted);
  }
  .tag {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 0 0.3rem;
    margin-right: 0.15rem;
    color: var(--muted);
  }
  .badge {
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.85rem;
  }
  .label {
    background: #e3ecfa;
    color: #1d3f73;
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
