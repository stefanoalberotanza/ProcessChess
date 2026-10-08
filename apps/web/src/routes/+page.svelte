<script lang="ts">
  import { resolveOpening } from '@processchess/core';
  import { Chess } from 'chess.js';
  import Board from '$lib/Board.svelte';

  // Free play from the initial position; the opening bar follows every move.
  let moves = $state<string[]>([]);

  const game = $derived.by(() => {
    const chess = new Chess();
    for (const san of moves) chess.move(san);
    return chess;
  });

  const dests = $derived.by(() => {
    const bySquare: Record<string, string[]> = {};
    for (const m of game.moves({ verbose: true })) (bySquare[m.from] ??= []).push(m.to);
    return new Map(Object.entries(bySquare));
  });

  const last = $derived(game.history({ verbose: true }).at(-1));
  const opening = $derived(resolveOpening(moves));
  const outOfTheory = $derived(moves.length > 0 && (opening?.ply ?? 0) < moves.length);

  function onmove(from: string, to: string) {
    const chess = new Chess(game.fen());
    try {
      // M0: promotions are always to a queen.
      const move = chess.move({ from, to, promotion: 'q' });
      moves = [...moves, move.san];
    } catch {
      moves = [...moves]; // illegal drop: re-sync the board with the current position
    }
  }

  function undo() {
    moves = moves.slice(0, -1);
  }

  /** "3...Bb4" for ply 6 of the current line. */
  function moveLabel(ply: number): string {
    return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}${moves[ply - 1] ?? ''}`;
  }

  const moveText = $derived(
    moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' '),
  );
</script>

<main>
  <h1>ProcessChess</h1>

  <div class="opening-bar" aria-live="polite">
    {#if opening}
      <span class="eco">{opening.eco}</span>
      <span class="family">{opening.family}</span>
      {#if opening.variation}<span class="variation">{opening.variation}</span>{/if}
    {:else}
      <span class="muted">{moves.length === 0 ? 'Starting position' : 'Unknown opening'}</span>
    {/if}
    {#if outOfTheory}
      <span class="out" title="The line has left the openings dataset">
        Out of theory{opening ? ` (last known: ${moveLabel(opening.ply)})` : ''}
      </span>
    {/if}
    <button type="button" onclick={undo} disabled={moves.length === 0}>Undo</button>
  </div>

  <Board
    fen={game.fen()}
    turnColor={game.turn() === 'w' ? 'white' : 'black'}
    {dests}
    lastMove={last ? [last.from, last.to] : undefined}
    check={game.inCheck()}
    {onmove}
  />

  <p class="moves">{moveText || '—'}</p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    font-family: system-ui, sans-serif;
    padding: 1rem;
  }
  .opening-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    width: min(90vw, 560px);
  }
  .eco {
    font-weight: 700;
  }
  .variation,
  .muted {
    color: #555;
  }
  .out {
    color: #a33;
  }
  button {
    margin-left: auto;
  }
  .moves {
    width: min(90vw, 560px);
  }
</style>
