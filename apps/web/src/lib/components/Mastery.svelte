<!-- Progress towards an automatic opening: clean runs in a row out of MASTERED_STREAK. -->
<script lang="ts">
  import type { LabRunSummary } from '@processchess/db';
  import { MASTERED_STREAK } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let { summary }: { summary: LabRunSummary | undefined } = $props();
  const streak = $derived(Math.min(summary?.cleanStreak ?? 0, MASTERED_STREAK));
  const mastered = $derived(streak >= MASTERED_STREAK);
  const text = $derived(
    !summary
      ? t('lab.new')
      : mastered
        ? t('lab.mastered')
        : t('lab.streak', { n: streak, of: MASTERED_STREAK, runs: summary.runs }),
  );
</script>

<span
  class="mastery"
  class:mastered
  class:new={!summary}
  title={text}
  aria-label={text}
  data-testid="mastery"
>
  {#if !summary}
    {t('lab.newShort')}
  {:else}
    {#each Array.from({ length: MASTERED_STREAK }, (_, i) => i) as i (i)}
      <span class="dot" class:on={i < streak}></span>
    {/each}
  {/if}
</span>

<style>
  .mastery {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--border);
  }
  .dot.on {
    background: var(--brass);
  }
  .mastered .dot.on {
    background: var(--good);
  }
</style>
