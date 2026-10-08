<!--
  The ONLY file allowed to import chessground (GPL-3.0-or-later).
  Its props are library-agnostic (FEN, UCI moves, squares as strings), so swapping chessground
  for cm-chessboard touches this file only. See docs/adr/005-licensing.md.
-->
<script lang="ts" module>
  export interface BoardShape {
    /** Square; with `to` an arrow, alone a circle. */
    from: string;
    to?: string;
    color?: 'green' | 'red' | 'blue' | 'yellow';
  }
</script>

<script lang="ts">
  import { describePosition } from '@processchess/core';
  import { Chessground } from 'chessground';
  import type { Api } from 'chessground/api';
  import type { DrawShape } from 'chessground/draw';
  import type { Key } from 'chessground/types';
  import 'chessground/assets/chessground.base.css';
  import 'chessground/assets/chessground.brown.css';
  import 'chessground/assets/chessground.cburnett.css';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';

  type Color = 'white' | 'black';

  interface Props {
    fen: string;
    orientation?: Color;
    /** Let the user move the side to move. */
    interactive?: boolean;
    lastMove?: [string, string] | undefined;
    shapes?: BoardShape[];
    /** Called with a UCI move (promotion piece included). Return false to undo it on the board. */
    onmove?: (uci: string) => boolean | void;
    /** Maximum width in px (default 520). */
    maxSize?: number;
  }

  let {
    fen,
    orientation = 'white',
    interactive = false,
    lastMove,
    shapes = [],
    onmove,
    maxSize = 520,
  }: Props = $props();

  let el: HTMLDivElement;
  let cg: Api | undefined = $state();
  let promotion = $state<{ from: string; to: string } | null>(null);
  const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;

  const position = $derived(describePosition(fen));

  function sync() {
    if (!cg) return;
    const turn: Color = position.turn === 'w' ? 'white' : 'black';
    cg.set({
      fen,
      orientation,
      turnColor: turn,
      check: position.check ? turn : false,
      lastMove: lastMove as Key[] | undefined,
      movable: {
        color: interactive ? turn : undefined,
        dests: (interactive ? position.dests : new Map()) as Map<Key, Key[]>,
      },
    });
    cg.setAutoShapes(
      shapes.map((s): DrawShape => ({
        orig: s.from as Key,
        ...(s.to ? { dest: s.to as Key } : {}),
        brush: s.color ?? 'green',
      })),
    );
  }

  function finish(uci: string) {
    promotion = null;
    if (onmove?.(uci) === false) sync();
  }

  onMount(() => {
    cg = Chessground(el, {
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = cg?.state.pieces.get(dest);
            if (piece?.role === 'pawn' && (dest[1] === '1' || dest[1] === '8')) {
              promotion = { from: orig, to: dest };
            } else {
              finish(orig + dest);
            }
          },
        },
      },
      draggable: { showGhost: true },
      highlight: { lastMove: true, check: true },
      animation: { duration: 150 },
    });
    return () => cg?.destroy();
  });

  $effect(() => {
    // re-sync whenever any prop used by sync() changes
    void [fen, orientation, interactive, lastMove, shapes, position];
    sync();
  });
</script>

<div
  class="board"
  role="group"
  aria-label={t('board.label')}
  style:width={`min(92vw, ${maxSize}px)`}
>
  <div bind:this={el} class="cg"></div>
  {#if promotion}
    <div class="promotion" role="dialog" aria-label={t('board.promotion')}>
      {#each PROMOTION_PIECES as p (p)}
        <button
          type="button"
          onclick={() => finish(promotion!.from + promotion!.to + p)}
          aria-label={t(`piece.${p}`)}>{t(`piece.${p}`)}</button
        >
      {/each}
      <button
        type="button"
        onclick={() => {
          promotion = null;
          sync();
        }}>{t('common.cancel')}</button
      >
    </div>
  {/if}
</div>

<style>
  .board {
    position: relative;
    aspect-ratio: 1;
  }
  .cg {
    width: 100%;
    height: 100%;
  }
  .promotion {
    position: absolute;
    inset: 30% 15%;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }
  .promotion button {
    font-size: 1rem;
  }
</style>
