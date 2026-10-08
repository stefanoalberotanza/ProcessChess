<!-- A small static board drawn in SVG from a FEN (no chessground: usable anywhere). -->
<script lang="ts">
  import { piecesOf } from '@processchess/core';

  interface Props {
    fen: string;
    /** Squares of the move that led here, highlighted. */
    lastMove?: [string, string] | null;
    orientation?: 'white' | 'black';
    size?: number;
  }
  let { fen, lastMove = null, orientation = 'white', size = 84 }: Props = $props();

  // solid glyphs for both sides, coloured by fill; U+FE0E keeps them out of emoji rendering
  const GLYPH: Record<string, string> = {
    k: '♚︎',
    q: '♛︎',
    r: '♜︎',
    b: '♝︎',
    n: '♞︎',
    p: '♟︎',
  };
  const FILES = 'abcdefgh';

  function xy(square: string): [number, number] {
    const f = FILES.indexOf(square[0]!);
    const r = Number(square[1]) - 1;
    return orientation === 'white' ? [f, 7 - r] : [7 - f, r];
  }

  const pieces = $derived(piecesOf(fen));
  const squares = Array.from({ length: 64 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8) }));
</script>

<svg viewBox="0 0 8 8" width={size} height={size} aria-hidden="true" class="mini">
  {#each squares as s (s.x * 8 + s.y)}
    <rect x={s.x} y={s.y} width="1" height="1" class={(s.x + s.y) % 2 ? 'dark' : 'light'} />
  {/each}
  {#if lastMove}
    {#each lastMove as sq (sq)}
      {@const [x, y] = xy(sq)}
      <rect {x} {y} width="1" height="1" class="last" />
    {/each}
  {/if}
  {#each pieces as p (p.square)}
    {@const [x, y] = xy(p.square)}
    <text x={x + 0.5} y={y + 0.82} class={p.color === 'w' ? 'white' : 'black'}>{GLYPH[p.type]}</text
    >
  {/each}
</svg>

<style>
  .mini {
    display: block;
    border-radius: 3px;
  }
  .light {
    fill: #f0d9b5;
  }
  .dark {
    fill: #b58863;
  }
  .last {
    fill: rgba(155, 199, 0, 0.45);
  }
  text {
    font-size: 0.9px;
    text-anchor: middle;
    font-family: 'DejaVu Sans', 'Segoe UI Symbol', 'Noto Sans Symbols 2', serif;
  }
  .white {
    fill: #fff;
    stroke: #222;
    stroke-width: 0.04px;
  }
  .black {
    fill: #111;
  }
</style>
