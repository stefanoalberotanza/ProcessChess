<!-- Progress of a whole name level: automatic lines out of all lines below it. -->
<script lang="ts">
  import type { MasteryRollup } from '@processchess/core';
  import { t } from '$lib/i18n/index.svelte';

  let { rollup }: { rollup: MasteryRollup } = $props();
  const text = $derived(t('lab.rollup', { ...rollup }));
</script>

{#if rollup.total > 0}
  <span class="rollup" title={text} aria-label={text} data-testid="mastery-rollup">
    <span class="count" aria-hidden="true"
      >{t('lab.rollupShort', { mastered: rollup.mastered, total: rollup.total })}</span
    >
  </span>
{/if}

<style>
  .rollup {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    color: var(--muted);
  }
</style>
