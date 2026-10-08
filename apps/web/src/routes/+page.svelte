<script lang="ts">
  import { resolve } from '$app/paths';
  import { enumerateLines } from '@processchess/core';
  import type { CollectionSummary } from '@processchess/db';
  import { app, storage } from '$lib/app.svelte';
  import ImportForm from '$lib/components/ImportForm.svelte';
  import { formatDate, t } from '$lib/i18n/index.svelte';

  interface Row extends CollectionSummary {
    lines: number;
  }

  let rows = $state<Row[]>([]);
  let showArchived = $state(false);
  let loaded = $state(false);
  let dialog: HTMLDialogElement;
  let importOpen = $state(false);
  let notice = $state<string | null>(null);

  async function refresh() {
    const db = storage();
    const summaries = await db.collectionSummaries({ includeArchived: showArchived });
    rows = await Promise.all(
      summaries.map(async (s) => ({
        ...s,
        lines: enumerateLines(await db.loadTree(s.collection.id)).length,
      })),
    );
    loaded = true;
  }

  $effect(() => {
    void showArchived;
    if (app.ready) void refresh();
  });

  async function toggleArchive(row: Row) {
    if (row.collection.archivedAt) await storage().unarchiveCollection(row.collection.id);
    else await storage().archiveCollection(row.collection.id);
    await refresh();
  }

  function openImport() {
    notice = null;
    importOpen = true;
    dialog.showModal();
  }

  function closeImport() {
    dialog.close();
  }

  async function imported(_id: string, message: string) {
    closeImport();
    notice = message;
    await refresh();
  }
</script>

<div class="toolbar">
  <h1>{t('home.title')}</h1>
  <button type="button" class="primary" onclick={openImport}>{t('import.open')}</button>
</div>

{#if notice}<p class="notice" role="status">{notice}</p>{/if}

<section aria-labelledby="collections-title">
  <h2 id="collections-title" class="sr-only">{t('home.collections')}</h2>
  {#if !loaded}
    <p aria-busy="true">{t('common.loading')}</p>
  {:else if rows.length === 0 && !showArchived}
    <div class="empty" data-testid="empty-state">
      <p class="empty-title">{t('home.emptyTitle')}</p>
      <p>{t('home.emptyHint')}</p>
    </div>
  {:else}
    <label class="archived-toggle">
      <input type="checkbox" bind:checked={showArchived} />
      {t('home.showArchived')}
    </label>
    {#if rows.length === 0}
      <p>{t('home.noArchived')}</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>{t('home.name')}</th>
            <th>{t('home.color')}</th>
            <th>{t('home.lines')}</th>
            <th>{t('home.lastTrained')}</th>
            <th><span class="sr-only">{t('home.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.collection.id)}
            <tr class:archived={row.collection.archivedAt}>
              <td>
                <a href={`${resolve('/collection')}?id=${row.collection.id}`}
                  >{row.collection.name}</a
                >
              </td>
              <td>{t(`color.${row.collection.userColor}`)}</td>
              <td>{row.lines}</td>
              <td>{row.lastTrainedAt ? formatDate(row.lastTrainedAt) : t('home.never')}</td>
              <td class="actions">
                {#if !row.collection.archivedAt}
                  <a class="button" href={`${resolve('/drill')}?id=${row.collection.id}`}
                    >{t('home.train')}</a
                  >
                {/if}
                <button type="button" onclick={() => toggleArchive(row)}>
                  {row.collection.archivedAt ? t('home.unarchive') : t('home.archive')}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<dialog
  bind:this={dialog}
  aria-labelledby="import-title"
  onclose={() => (importOpen = false)}
  class="import-dialog"
>
  {#if importOpen}
    <div class="dialog-head">
      <h2 id="import-title">{t('import.title')}</h2>
      <button type="button" onclick={closeImport}>{t('common.close')}</button>
    </div>
    <ImportForm
      collections={rows.filter((r) => !r.collection.archivedAt).map((r) => r.collection)}
      onimported={imported}
    />
  {/if}
</dialog>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .primary {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: white;
    font-weight: 600;
  }
  .notice {
    color: #2e7d32;
  }
  .empty {
    border: 2px dashed var(--border);
    border-radius: 8px;
    padding: 2rem 1rem;
    text-align: center;
    margin: 1rem 0;
  }
  .empty-title {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0 1.5rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  tr.archived {
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .button {
    padding: 0.15rem 0.6rem;
    border-radius: 4px;
    background: var(--accent);
    color: white;
    text-decoration: none;
  }
  .archived-toggle {
    display: inline-flex;
    gap: 0.3rem;
  }
  .import-dialog {
    width: min(92vw, 42rem);
    border: none;
    border-radius: 10px;
    padding: 1.25rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .import-dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dialog-head h2 {
    margin: 0;
  }
</style>
