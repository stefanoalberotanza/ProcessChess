<!--
  Placeholder bishop mascot. All the art lives in this file so it can be replaced;
  keep the props (`expression`, `size`) stable.
  The bishop is white with a dark outline, so it reads on light and dark themes alike.
-->
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';

  type Expression = 'happy' | 'proud' | 'sorry' | 'calm';

  let { expression, size = 96 }: { expression: Expression; size?: number } = $props();
</script>

<svg
  class="bishop"
  width={size}
  height={(size * 135) / 100}
  viewBox="0 0 100 135"
  role="img"
  aria-label={t(`bishop.${expression}`)}
  data-expression={expression}
>
  <ellipse class="shade" cx="50" cy="124" rx="30" ry="6" />
  <path class="body" d="M30 120 L38 92 L62 92 L70 120 Z" />
  <rect class="body" x="30" y="82" width="40" height="10" rx="4" />
  <path class="body" d="M50 18 C74 34 78 58 68 82 L32 82 C22 58 26 34 50 18 Z" />
  <circle class="body" cx="50" cy="13" r="7" />
  <path class="line" d="M57 28 L45 42" />

  {#if expression === 'happy'}
    <path class="line" d="M36 58 q5 -7 10 0" />
    <path class="line" d="M54 58 q5 -7 10 0" />
    <path class="mouth" d="M40 66 q10 12 20 0 Z" />
    <circle class="cheek" cx="35" cy="68" r="4" />
    <circle class="cheek" cx="65" cy="68" r="4" />
  {:else if expression === 'proud'}
    <circle class="dot" cx="41" cy="57" r="3.5" />
    <circle class="dot" cx="59" cy="57" r="3.5" />
    <path class="line" d="M42 68 q8 7 16 0" />
    <path class="star" d="M82 20 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1 z" />
  {:else if expression === 'sorry'}
    <path class="line" d="M36 54 l10 4" />
    <path class="line" d="M64 54 l-10 4" />
    <circle class="dot" cx="41" cy="61" r="3" />
    <circle class="dot" cx="59" cy="61" r="3" />
    <path class="line" d="M42 73 q8 -7 16 0" />
    <path class="drop" d="M72 40 q4 7 0 10 q-4 -3 0 -10 z" />
  {:else}
    <circle class="dot" cx="41" cy="57" r="3.5" />
    <circle class="dot" cx="59" cy="57" r="3.5" />
    <path class="line" d="M44 68 h12" />
  {/if}
</svg>

<style>
  .bishop {
    --ink: #3b3a36;
    --paper: #fbfaf6;
    flex: none;
    display: inline-block;
    vertical-align: middle;
  }
  .body,
  .shade,
  .mouth,
  .star,
  .drop {
    stroke: var(--ink);
    stroke-linejoin: round;
  }
  .body {
    fill: var(--paper);
    stroke-width: 3;
  }
  .shade {
    fill: #d9d4c7;
    stroke-width: 3;
  }
  .line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .dot {
    fill: var(--ink);
  }
  .mouth {
    fill: #fff;
    stroke-width: 3;
  }
  .cheek {
    fill: #f4a6a0;
    opacity: 0.7;
  }
  .star {
    fill: #f2b705;
    stroke-width: 1.5;
  }
  .drop {
    fill: #7ec4ef;
    stroke-width: 1.5;
  }
</style>
