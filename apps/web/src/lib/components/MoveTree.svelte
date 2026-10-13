<script lang="ts">
  import { type LayoutSegment, type Tree, layoutTree } from '@processchess/core';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    tree: Tree;
    selectedId: string;
    onselect: (id: string) => void;
  }
  let { tree, selectedId, onselect }: Props = $props();

  const layout = $derived(layoutTree(tree));
</script>

{#snippet segments(segs: LayoutSegment[])}
  {#each segs as seg, i (i)}
    {#if seg.kind === 'moves'}
      <span class="run">
        {#each seg.moves as m (m.id)}
          <button
            type="button"
            class="move"
            class:user={m.isUserMove}
            aria-current={m.id === selectedId ? 'true' : undefined}
            onclick={() => onselect(m.id)}>{m.label}</button
          >
          {#if m.comment}<span class="comment">{m.comment}</span>{/if}
        {/each}
      </span>
    {:else}
      <div class="variations">
        {#each seg.lines as line, j (j)}
          <div class="variation">{@render segments(line)}</div>
        {/each}
      </div>
    {/if}
  {/each}
{/snippet}

<nav class="tree" aria-label={t('tree.label')}>
  <button
    type="button"
    class="move root"
    aria-current={selectedId === tree.rootId ? 'true' : undefined}
    onclick={() => onselect(tree.rootId)}>{t('tree.start')}</button
  >
  {#if layout.length === 0}
    <p class="muted">{t('tree.empty')}</p>
  {:else}
    {@render segments(layout)}
  {/if}
</nav>

<style>
  .tree {
    line-height: 1.9;
    max-height: 60vh;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem;
  }
  .move {
    border: none;
    background: none;
    padding: 0.05rem 0.25rem;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
  }
  .move.user {
    font-weight: 600;
  }
  .move:hover {
    background: var(--hover);
  }
  .move[aria-current='true'] {
    background: var(--accent);
    color: var(--on-accent);
  }
  .comment {
    color: var(--muted);
    font-style: italic;
    margin: 0 0.25rem;
  }
  .variations {
    margin-left: 1rem;
    border-left: 2px solid var(--border);
    padding-left: 0.5rem;
    font-size: 0.95em;
  }
  .root {
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
</style>
