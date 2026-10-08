<script lang="ts">
  import { resolve } from '$app/paths';
  import { enumerateLines } from '@processchess/core';
  import type { CollectionSummary } from '@processchess/db';
  import { storage } from '$lib/app.svelte';
  import ImportForm from '$lib/components/ImportForm.svelte';
  import { formatDate, t } from '$lib/i18n/index.svelte';

  interface Row extends CollectionSummary {
    lines: number;
  }

  let rows = $state<Row[]>([]);
  let showArchived = $state(false);
  let loaded = $state(false);

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
    void refresh();
  });

  async function toggleArchive(row: Row) {
    if (row.collection.archivedAt) await storage().unarchiveCollection(row.collection.id);
    else await storage().archiveCollection(row.collection.id);
    await refresh();
  }
</script>

<h1>{t('home.title')}</h1>

<section aria-labelledby="collections-title">
  <h2 id="collections-title" class="sr-only">{t('home.collections')}</h2>
  <label class="archived">
    <input type="checkbox" bind:checked={showArchived} />
    {t('home.showArchived')}
  </label>
  {#if loaded && rows.length === 0}
    <p>{t('home.empty')}</p>
  {:else if rows.length > 0}
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
            <td
              ><a href={`${resolve('/collection')}?id=${row.collection.id}`}
                >{row.collection.name}</a
              ></td
            >
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
</section>

<ImportForm
  collections={rows.filter((r) => !r.collection.archivedAt).map((r) => r.collection)}
  onimported={() => refresh()}
/>

<style>
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
  .archived {
    display: inline-flex;
    gap: 0.3rem;
  }
</style>
