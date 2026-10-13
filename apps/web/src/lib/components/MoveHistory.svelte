<script lang="ts">
  import { uciToSan } from '@processchess/core';
  import type { MoveHistory } from '@processchess/db';
  import { formatDate, formatPercent, t } from '$lib/i18n/index.svelte';

  interface Props {
    history: MoveHistory;
    /** Position before the move, to show the wrong move in SAN. */
    fenBefore: string;
  }
  let { history, fenBefore }: Props = $props();

  const ICON = { correct: '✓', hint: '?', wrong: '✗' } as const;
  const wrongSan = $derived(
    history.mostFrequentWrong
      ? (uciToSan(fenBefore, history.mostFrequentWrong.uci) ?? history.mostFrequentWrong.uci)
      : null,
  );
</script>

<div class="history" data-testid="move-history">
  {#if history.total === 0}
    <p class="muted">{t('history.none')}</p>
  {:else}
    <ol class="strip" aria-label={t('history.strip', { n: history.recent.length })}>
      {#each history.recent as a (a.id)}
        <li
          class={a.result}
          data-result={a.result}
          title={`${t(`result.${a.result}`)} · ${formatDate(a.ts)}`}
        >
          <span aria-hidden="true">{ICON[a.result]}</span>
          <span class="sr-only">{t(`result.${a.result}`)}</span>
        </li>
      {/each}
    </ol>
    <p class="stats">
      <span data-testid="first-try"
        >{t('history.firstTry', {
          pct: formatPercent(history.firstTryRate ?? 0),
          n: history.firstTry,
          total: history.total,
        })}</span
      >
      {#if wrongSan}
        · <span data-testid="most-wrong"
          >{t('history.mostWrong', { san: wrongSan, n: history.mostFrequentWrong!.count })}</span
        >
      {/if}
    </p>
  {/if}
</div>

<style>
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    list-style: none;
    padding: 0;
    margin: 0.25rem 0;
  }
  .strip li {
    width: 1.4rem;
    height: 1.4rem;
    display: grid;
    place-items: center;
    border-radius: 4px;
    color: white;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .correct {
    background: var(--good);
  }
  .hint {
    background: var(--warn);
  }
  .wrong {
    background: var(--bad);
  }
  .stats,
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0.25rem 0;
  }
</style>
