<script lang="ts">
  import { type GraphViewNode, type OpeningGraph, graphView, parseUci } from '@processchess/core';
  import MiniBoard from '$lib/components/MiniBoard.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    graph: OpeningGraph | null;
    /** Moves from the initial position (the shared board). */
    ucis: string[];
    orientation: 'white' | 'black';
    /** True when this path is in the selected repertoire. */
    inRepertoire: (ucis: string[]) => boolean;
    onjump: (ucis: string[]) => void;
    /** Lab history of a move: 'good' when automatic lately, 'bad' after a recent mistake. */
    edgeState?: (fenBefore: string, uci: string) => 'good' | 'bad' | null;
  }
  let { graph, ucis, orientation, inRepertoire, onjump, edgeState = () => null }: Props = $props();

  const BOARD = 84;
  const COL = 150;
  const ROW = 126;
  const PAD = 8;

  const view = $derived(graph ? graphView(graph, ucis, { back: 2, forward: [8, 3] }) : null);
  let scroller: HTMLDivElement | undefined = $state();
  const byKey = $derived(new Map(view?.nodes.map((n) => [n.key, n]) ?? []));
  const maxLines = $derived(Math.max(2, ...(view?.edges.map((e) => e.lines ?? 0) ?? [])));

  const left = (n: GraphViewNode) => PAD + n.x * COL;
  const top = (n: GraphViewNode) => PAD + n.y * ROW;

  // keep the current position in sight whenever the view changes (scroll only the graph box)
  $effect(() => {
    if (!view || !scroller) return;
    const current = view.nodes.find((n) => n.kind === 'current');
    if (!current) return;
    scroller.scrollLeft = Math.max(0, left(current) + BOARD / 2 - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, top(current) + BOARD / 2 - scroller.clientHeight / 2);
  });

  function edgePath(from: GraphViewNode, to: GraphViewNode): string {
    const x1 = left(from) + BOARD;
    const y1 = top(from) + BOARD / 2;
    const x2 = left(to);
    const y2 = top(to) + BOARD / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }

  function strokeWidth(lines: number | null): number {
    if (lines === null) return 2;
    return 1 + (4 * Math.log(lines + 1)) / Math.log(maxLines + 1);
  }

  function lastMoveOf(n: GraphViewNode): [string, string] | null {
    if (!n.uci) return null;
    const { from, to } = parseUci(n.uci);
    return [from, to];
  }

  function label(n: GraphViewNode): string {
    const parts = [n.san ?? t('tree.start')];
    if (n.name) parts.push(`${n.eco} ${n.name}`);
    if (n.lines !== null) parts.push(t('graph.lines', { n: n.lines }));
    if (inRepertoire(n.ucis)) parts.push(t('explore.inRepertoire'));
    return parts.join(' — ');
  }

  function moveNumber(n: GraphViewNode): string {
    if (!n.san) return '';
    const ply = n.ucis.length;
    return ply % 2 === 1 ? `${(ply + 1) / 2}.` : `${ply / 2}…`;
  }
</script>

{#if !graph || !view}
  <p class="muted" aria-busy="true">{t('common.loading')}</p>
{:else}
  <p class="muted help">{t('graph.help')}</p>
  <div class="scroll" bind:this={scroller}>
    <div
      class="canvas"
      style:width={`${PAD * 2 + (view.columns - 1) * COL + BOARD}px`}
      style:height={`${PAD * 2 + (view.rows - 1) * ROW + BOARD + 34}px`}
    >
      <svg class="edges" aria-hidden="true">
        {#each view.edges as e (e.to)}
          {@const from = byKey.get(e.from)!}
          {@const to = byKey.get(e.to)!}
          <path
            d={edgePath(from, to)}
            class:rep={inRepertoire(to.ucis)}
            class:good={edgeState(from.fen, e.uci) === 'good'}
            class:bad={edgeState(from.fen, e.uci) === 'bad'}
            class:past={to.kind !== 'book'}
            stroke-width={strokeWidth(e.lines)}
          />
        {/each}
      </svg>
      <ul class="nodes" aria-label={t('graph.label')}>
        {#each view.nodes as n (n.key)}
          <li style:left={`${left(n)}px`} style:top={`${top(n)}px`}>
            <button
              type="button"
              class="node {n.kind}"
              class:rep={inRepertoire(n.ucis)}
              aria-current={n.kind === 'current' ? 'true' : undefined}
              aria-label={label(n)}
              title={label(n)}
              onclick={() => onjump(n.ucis)}
            >
              <MiniBoard fen={n.fen} lastMove={lastMoveOf(n)} {orientation} size={BOARD} />
              <span class="san">{moveNumber(n)}{n.san ?? t('tree.start')}</span>
              {#if n.eco}<span class="eco">{n.eco}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .help {
    font-size: 0.85rem;
    margin: 0 0 0.4rem;
  }
  .muted {
    color: var(--muted);
  }
  .scroll {
    overflow: auto;
    max-height: 75vh;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel);
  }
  .canvas {
    position: relative;
  }
  .edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .edges path {
    fill: none;
    stroke: var(--muted);
  }
  .edges path.past {
    stroke: var(--accent);
    stroke-dasharray: 4 3;
  }
  .edges path.rep {
    stroke: var(--good);
  }
  .edges path.good {
    stroke: var(--good);
    stroke-dasharray: none;
  }
  .edges path.bad {
    stroke: var(--bad);
    stroke-dasharray: none;
  }
  .nodes {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .nodes li {
    position: absolute;
  }
  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 2px solid transparent;
    border-radius: 6px;
    background: var(--panel);
  }
  .node:hover {
    border-color: var(--hover);
  }
  .node.past {
    opacity: 0.75;
  }
  .node.rep {
    border-color: var(--good);
  }
  .node[aria-current='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .san {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .eco {
    font-size: 0.7rem;
    color: var(--muted);
    margin-top: -2px;
  }
</style>
