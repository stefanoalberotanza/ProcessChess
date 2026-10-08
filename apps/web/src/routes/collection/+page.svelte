<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    INITIAL_FEN,
    SubtreeHasAttemptsError,
    type Tree,
    type TreeChanges,
    addLine,
    childrenOf,
    deleteSubtree,
    exportPgn,
    fenAt,
    parseUci,
    pathTo,
    setComment,
    setMainLine,
    toEpd,
  } from '@processchess/core';
  import { type Collection, type MoveHistory as History, newId } from '@processchess/db';
  import { onMount } from 'svelte';
  import Board from '$lib/Board.svelte';
  import { queryParam, storage } from '$lib/app.svelte';
  import MoveHistory from '$lib/components/MoveHistory.svelte';
  import MoveTree from '$lib/components/MoveTree.svelte';
  import OpeningBar from '$lib/components/OpeningBar.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let collection = $state<Collection | null>(null);
  let tree = $state.raw<Tree | null>(null);
  let selectedId = $state('');
  let editMode = $state(false);
  let commentDraft = $state('');
  let message = $state<string | null>(null);
  let history = $state.raw<History | null>(null);
  let notFound = $state(false);

  onMount(async () => {
    const id = queryParam('id');
    collection = id ? ((await storage().getCollection(id)) ?? null) : null;
    if (!collection) {
      notFound = true;
      return;
    }
    tree = await storage().loadTree(collection.id);
    select(tree.rootId);
  });

  const node = $derived(tree && selectedId ? tree.nodes.get(selectedId) : undefined);
  const path = $derived(tree && node ? pathTo(tree, node.id) : []);
  const fen = $derived(tree && node ? fenAt(tree, node.id) : INITIAL_FEN);
  const standardStart = $derived(
    tree ? tree.nodes.get(tree.rootId)!.epd === toEpd(INITIAL_FEN) : true,
  );
  const lastMove = $derived.by((): [string, string] | undefined => {
    if (!node?.uci) return undefined;
    const { from, to } = parseUci(node.uci);
    return [from, to];
  });

  function select(id: string) {
    selectedId = id;
    commentDraft = tree?.nodes.get(id)?.comment ?? '';
    message = null;
    void loadHistory(id);
  }

  async function loadHistory(id: string) {
    const n = tree?.nodes.get(id);
    history = n?.isUserMove ? await storage().getMoveHistory(id) : null;
  }

  async function persist(next: Tree, changes: TreeChanges) {
    tree = next;
    try {
      await storage().applyTreeChanges(collection!.id, changes);
    } catch (e) {
      message = t('error.generic', { message: (e as Error).message });
      tree = await storage().loadTree(collection!.id);
    }
  }

  function onmove(uci: string): boolean {
    if (!tree || !editMode) return false;
    const r = addLine(tree, selectedId, [uci], { newId });
    void persist(r.tree, r.changes).then(() => select(r.leafId));
    return true;
  }

  async function makeMain() {
    if (!tree || !node?.parentId) return;
    const r = setMainLine(tree, node.id);
    await persist(r.tree, r.changes);
  }

  async function saveComment() {
    if (!tree || !node) return;
    const r = setComment(tree, node.id, commentDraft);
    await persist(r.tree, r.changes);
    message = t('collection.commentSaved');
  }

  async function remove() {
    if (!tree || !node?.parentId) return;
    try {
      const r = deleteSubtree(tree, node.id, await storage().nodeIdsWithAttempts(collection!.id));
      const parent = node.parentId;
      await persist(r.tree, r.changes);
      select(parent);
    } catch (e) {
      if (e instanceof SubtreeHasAttemptsError) message = t('collection.deleteRefused');
      else throw e;
    }
  }

  function download() {
    if (!tree || !collection) return;
    const blob = new Blob([exportPgn(tree, { event: collection.name })], {
      type: 'application/x-chess-pgn',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${collection.name.replace(/[^\w.-]+/g, '_')}.pgn`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onkeydown(e: KeyboardEvent) {
    if (!tree || !node || (e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft' && node.parentId) select(node.parentId);
    else if (e.key === 'ArrowRight') {
      const next = childrenOf(tree, node.id)[0];
      if (next) select(next.id);
    } else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

{#if notFound}
  <p>{t('collection.notFound')} <a href={resolve('/')}>{t('common.back')}</a></p>
{:else if collection && tree}
  <div class="head">
    <h1>{collection.name}</h1>
    <span class="muted">{t(`color.${collection.userColor}`)}</span>
    <a class="button" href={`${resolve('/drill')}?id=${collection.id}`}>{t('home.train')}</a>
    <button type="button" onclick={download}>{t('collection.export')}</button>
    <label class="edit">
      <input type="checkbox" bind:checked={editMode} />
      {t('collection.editMode')}
    </label>
  </div>

  <div class="layout">
    <div class="left">
      <OpeningBar movesSan={standardStart ? path.slice(1).map((n) => n.san!) : null} />
      <Board
        {fen}
        orientation={collection.userColor === 'w' ? 'white' : 'black'}
        interactive={editMode}
        {lastMove}
        {onmove}
      />
      {#if editMode}<p class="muted">{t('collection.editHelp')}</p>{/if}
    </div>

    <div class="right">
      <MoveTree {tree} {selectedId} onselect={select} />

      {#if node}
        <section class="panel" aria-label={t('collection.nodePanel')}>
          {#if node.san}
            <h2>{path.length - 1}. {node.san}</h2>
            <div class="actions">
              <button type="button" onclick={makeMain} disabled={node.ord === 0}>
                {t('collection.makeMain')}
              </button>
              <button type="button" onclick={remove}>{t('collection.delete')}</button>
            </div>
          {/if}
          <label class="comment">
            {t('collection.comment')}
            <textarea bind:value={commentDraft} rows="2"></textarea>
          </label>
          <button type="button" onclick={saveComment}>{t('collection.saveComment')}</button>
          {#if history && node.parentId}
            <h3>{t('history.title')}</h3>
            <MoveHistory {history} fenBefore={fenAt(tree, node.parentId)} />
          {/if}
          {#if message}<p role="status">{message}</p>{/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .head h1 {
    margin: 0.3rem 0;
  }
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 1rem;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .right {
    flex: 1;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .comment {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.3rem;
  }
  .muted {
    color: var(--muted);
  }
  .button {
    padding: 0.15rem 0.6rem;
    border-radius: 4px;
    background: var(--accent);
    color: white;
    text-decoration: none;
  }
</style>
