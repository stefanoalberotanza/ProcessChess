<!--
  The ONLY file allowed to import chessground (GPL-3.0-or-later).
  Its props are library-agnostic (FEN + legal destinations as plain strings), so
  swapping chessground for cm-chessboard touches this file only. See docs/adr/005-licensing.md.
-->
<script lang="ts">
  import { Chessground } from 'chessground';
  import type { Api } from 'chessground/api';
  import type { Key } from 'chessground/types';
  import 'chessground/assets/chessground.base.css';
  import 'chessground/assets/chessground.brown.css';
  import 'chessground/assets/chessground.cburnett.css';
  import { onMount } from 'svelte';

  type Color = 'white' | 'black';

  interface Props {
    /** Position to display (full FEN or placement field). */
    fen: string;
    /** Side to move. */
    turnColor: Color;
    /** Legal moves: origin square → destination squares, e.g. "e2" → ["e3", "e4"]. */
    dests: Map<string, string[]>;
    orientation?: Color;
    lastMove?: [string, string] | undefined;
    check?: boolean;
    /** Called when the user drops a piece on a legal destination. */
    onmove: (from: string, to: string) => void;
  }

  let {
    fen,
    turnColor,
    dests,
    orientation = 'white',
    lastMove,
    check = false,
    onmove,
  }: Props = $props();

  let el: HTMLDivElement;
  let cg: Api | undefined = $state();

  onMount(() => {
    cg = Chessground(el, {
      movable: {
        free: false,
        showDests: true,
        events: { after: (orig, dest) => onmove(orig, dest) },
      },
      draggable: { showGhost: true },
      highlight: { lastMove: true, check: true },
    });
    return () => cg?.destroy();
  });

  $effect(() => {
    cg?.set({
      fen,
      turnColor,
      orientation,
      check: check ? turnColor : false,
      lastMove: lastMove as Key[] | undefined,
      movable: { color: turnColor, dests: dests as Map<Key, Key[]> },
    });
  });
</script>

<div class="board"><div bind:this={el} class="cg"></div></div>

<style>
  .board {
    width: min(90vw, 560px);
    aspect-ratio: 1;
  }
  .cg {
    width: 100%;
    height: 100%;
  }
</style>
