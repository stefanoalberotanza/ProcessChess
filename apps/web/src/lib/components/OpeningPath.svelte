<!-- Family › subfamily › variation of the board position, shown under the board. -->
<script lang="ts">
  import { classifyOpening } from '@processchess/core';
  import { app } from '$lib/app.svelte';
  import { t } from '$lib/i18n/index.svelte';

  /** SAN moves from the initial position; null when the collection has a custom start. */
  let { movesSan }: { movesSan: string[] | null } = $props();

  const c = $derived(app.ready && movesSan ? classifyOpening(movesSan) : null);
  const parts = $derived(
    c?.label
      ? [
          t(`opening.label.${c.label}`),
          ...(c.opening ? [c.opening.name] : []),
          ...(c.variation ? [c.variation.name] : []),
        ]
      : [],
  );
</script>

{#if parts.length > 1}
  <nav class="path" aria-label={t('opening.path')} data-testid="opening-path">
    {#each parts as p, i (i)}
      {#if i > 0}<span aria-hidden="true">›</span>{/if}
      <span>{p}</span>
    {/each}
  </nav>
{/if}

<style>
  .path {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: var(--muted);
    overflow-wrap: anywhere;
    /* never widen the board column */
    contain: inline-size;
  }
</style>
