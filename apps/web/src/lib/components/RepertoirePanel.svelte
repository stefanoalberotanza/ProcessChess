<script lang="ts">
  import { type Tree, fenAt, pathTo } from '@processchess/core';
  import type { MoveHistory as History } from '@processchess/db';
  import MoveHistory from '$lib/components/MoveHistory.svelte';
  import MoveTree from '$lib/components/MoveTree.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    tree: Tree;
    /** Node of the board position, or the deepest repertoire node on the path. */
    nodeId: string;
    /** True when the board position is exactly `nodeId`. */
    exact: boolean;
    history: History | null;
    message: string | null;
    onselect: (nodeId: string) => void;
    onmain: () => void;
    ondelete: () => void;
    oncomment: (text: string) => void;
    onexport: () => void;
  }
  let {
    tree,
    nodeId,
    exact,
    history,
    message,
    onselect,
    onmain,
    ondelete,
    oncomment,
    onexport,
  }: Props = $props();

  const node = $derived(tree.nodes.get(nodeId));
  // "3... Bc5": move number from the ply and the side to move at the start
  const moveLabel = $derived.by(() => {
    if (!node?.san) return '';
    const ply = pathTo(tree, node.id).length - 1;
    const [, side, , , , full] = tree.startFen.split(' ');
    const offset = side === 'w' ? 0 : 1;
    const number = Number(full ?? 1) + Math.floor((ply - 1 + offset) / 2);
    const white = (ply - 1 + offset) % 2 === 0;
    return `${number}${white ? '.' : '...'} ${node.san}`;
  });
  // follows the selected node, editable in the textarea
  let draft = $derived(node?.comment ?? '');
</script>

<div class="rep-panel">
  <div class="tools">
    <button type="button" onclick={onexport}>{t('collection.export')}</button>
  </div>
  <MoveTree {tree} selectedId={exact ? nodeId : ''} {onselect} />

  {#if node && exact}
    <section class="panel" aria-label={t('collection.nodePanel')}>
      {#if node.san}
        <h3>{moveLabel}</h3>
        <div class="actions">
          <button type="button" onclick={onmain} disabled={node.ord === 0}>
            {t('collection.makeMain')}
          </button>
          <button type="button" onclick={ondelete}>{t('collection.delete')}</button>
        </div>
      {/if}
      <label class="comment">
        {t('collection.comment')}
        <textarea bind:value={draft} rows="2"></textarea>
      </label>
      <button type="button" onclick={() => oncomment(draft)}>{t('collection.saveComment')}</button>
      {#if history && node.parentId}
        <h4>{t('history.title')}</h4>
        <MoveHistory {history} fenBefore={fenAt(tree, node.parentId)} />
      {/if}
    </section>
  {/if}
  {#if message}<p role="status" class="msg">{message}</p>{/if}
</div>

<style>
  .rep-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .tools {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
  }
  h4 {
    margin: 0.6rem 0 0.2rem;
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .comment {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.3rem;
  }
  .msg {
    color: var(--muted);
  }
</style>
