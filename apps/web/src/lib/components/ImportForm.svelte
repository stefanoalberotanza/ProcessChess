<script lang="ts">
  import {
    IllegalMoveError,
    PgnStartPositionError,
    PgnSyntaxError,
    importPgn,
    parsePgn,
    treeFromPgn,
  } from '@processchess/core';
  import { type Collection, newId } from '@processchess/db';
  import { app, storage } from '$lib/app.svelte';
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    collections: Collection[];
    onimported: (collectionId: string, message: string) => void;
  }
  let { collections, onimported }: Props = $props();

  let target = $state('new');
  let name = $state('');
  let color = $state<'w' | 'b'>('w');
  let text = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let done = $state<string | null>(null);

  async function readFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    text = await file.text();
    if (!name) name = file.name.replace(/\.pgn$/i, '');
  }

  function describe(e: unknown): string {
    if (e instanceof IllegalMoveError) {
      return t('import.illegalMove', { move: e.move, ply: e.ply, game: (e.gameIndex ?? 0) + 1 });
    }
    if (e instanceof PgnSyntaxError) return t('import.syntax', { game: e.gameIndex + 1 });
    if (e instanceof PgnStartPositionError)
      return t('import.startPosition', { game: e.gameIndex + 1 });
    return t('error.generic', { message: e instanceof Error ? e.message : String(e) });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = done = null;
    busy = true;
    try {
      const games = parsePgn(text);
      if (games.length === 0) throw new Error(t('import.empty'));
      const db = storage();
      let id: string;
      let added: number;
      if (target === 'new') {
        const edit = treeFromPgn(games, { userColor: color, newId });
        const title = name.trim() || games[0]!.headers.Event?.trim() || t('import.untitled');
        const collection = await db.createCollectionFromTree(
          { name: title, kind: 'opening', evalMode: 'exact', source: 'pgn' },
          edit,
        );
        id = collection.id;
        added = edit.tree.nodes.size - 1;
      } else {
        const tree = await db.loadTree(target);
        const edit = importPgn(tree, games, { newId });
        await db.applyTreeChanges(target, edit.changes);
        id = target;
        added = edit.changes.inserted.length;
      }
      done = t('import.done', { games: games.length, moves: added });
      text = '';
      name = '';
      onimported(id, done);
    } catch (e) {
      error = describe(e);
    } finally {
      busy = false;
    }
  }
</script>

<form class="import" onsubmit={submit} aria-labelledby="import-title">
  <label>
    {t('import.target')}
    <select bind:value={target}>
      <option value="new">{t('import.newCollection')}</option>
      {#each collections as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
  </label>

  {#if target === 'new'}
    <label>
      {t('import.name')}
      <input type="text" bind:value={name} placeholder={t('import.namePlaceholder')} />
    </label>
    <fieldset>
      <legend>{t('import.color')}</legend>
      <label><input type="radio" bind:group={color} value="w" /> {t('color.w')}</label>
      <label><input type="radio" bind:group={color} value="b" /> {t('color.b')}</label>
    </fieldset>
  {/if}

  <label>
    {t('import.file')}
    <input type="file" accept=".pgn,application/x-chess-pgn,text/plain" onchange={readFile} />
  </label>
  <label>
    {t('import.paste')}
    <textarea bind:value={text} rows="6" spellcheck="false"></textarea>
  </label>

  <button type="submit" disabled={busy || !app.ready || !text.trim()}>{t('import.submit')}</button>
  {#if !app.ready && !app.error}<p class="muted" aria-busy="true">{t('common.loading')}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if done}<p class="ok" role="status">{done}</p>{/if}
</form>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 40rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  fieldset label {
    flex-direction: row;
    display: inline-flex;
    margin-right: 1rem;
  }
  textarea {
    font-family: ui-monospace, monospace;
  }
  .error {
    color: var(--bad-text);
  }
  .ok {
    color: var(--good);
  }
  .muted {
    color: var(--muted);
  }
</style>
