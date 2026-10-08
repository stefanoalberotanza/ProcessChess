<script lang="ts">
  import type { Collection } from '@processchess/db';
  import { formatDate, t } from '$lib/i18n/index.svelte';

  export interface RepertoireRow {
    collection: Collection;
    lines: number;
    clean: number;
    /** Moves due for review now. */
    due: number;
    lastTrainedAt: Date | null;
  }

  interface Props {
    rows: RepertoireRow[];
    loaded: boolean;
    selectedId: string | null;
    showArchived: boolean;
    onselect: (id: string | null) => void;
    oncreate: (name: string, color: 'w' | 'b') => void;
    onimport: () => void;
    ontogglearchive: (row: RepertoireRow) => void;
  }
  let {
    rows,
    loaded,
    selectedId,
    showArchived = $bindable(),
    onselect,
    oncreate,
    onimport,
    ontogglearchive,
  }: Props = $props();

  let creating = $state(false);
  let name = $state('');
  let color = $state<'w' | 'b'>('w');

  function create(e: SubmitEvent) {
    e.preventDefault();
    oncreate(name.trim() || t(color === 'w' ? 'rep.defaultWhite' : 'rep.defaultBlack'), color);
    name = '';
    creating = false;
  }
</script>

<section class="reps" aria-labelledby="reps-title">
  <h2 id="reps-title">{t('rep.title')}</h2>

  {#if !loaded}
    <p aria-busy="true" class="muted">{t('common.loading')}</p>
  {:else if rows.length === 0 && !showArchived}
    <div class="empty" data-testid="empty-state">
      <p class="empty-title">{t('home.emptyTitle')}</p>
      <p>{t('home.emptyHint')}</p>
    </div>
  {:else}
    <ul>
      {#each rows as row (row.collection.id)}
        <li
          class:selected={row.collection.id === selectedId}
          class:archived={row.collection.archivedAt}
        >
          <button
            type="button"
            class="rep"
            aria-pressed={row.collection.id === selectedId}
            onclick={() => onselect(row.collection.id === selectedId ? null : row.collection.id)}
          >
            <span class="name">{row.collection.name}</span>
            <span class="meta">
              {t(`color.${row.collection.userColor}`)} ·
              {t('rep.linesClean', { clean: row.clean, total: row.lines })}
            </span>
            {#if row.due > 0}
              <span class="due" data-testid="due-count">{t('rep.due', { n: row.due })}</span>
            {/if}
            <span class="meta">
              {row.lastTrainedAt
                ? t('rep.lastTrained', { date: formatDate(row.lastTrainedAt) })
                : t('home.never')}
            </span>
          </button>
          {#if row.collection.id === selectedId || row.collection.archivedAt}
            <button type="button" class="small" onclick={() => ontogglearchive(row)}>
              {row.collection.archivedAt ? t('home.unarchive') : t('home.archive')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    {#if creating}
      <form onsubmit={create} class="create">
        <label>
          {t('import.name')}
          <input type="text" bind:value={name} placeholder={t('rep.namePlaceholder')} />
        </label>
        <fieldset>
          <legend>{t('import.color')}</legend>
          <label><input type="radio" bind:group={color} value="w" /> {t('color.w')}</label>
          <label><input type="radio" bind:group={color} value="b" /> {t('color.b')}</label>
        </fieldset>
        <div class="row">
          <button type="submit" class="primary">{t('rep.create')}</button>
          <button type="button" onclick={() => (creating = false)}>{t('common.cancel')}</button>
        </div>
      </form>
    {:else}
      <button type="button" class="primary" onclick={() => (creating = true)}>{t('rep.new')}</button
      >
    {/if}
    <button type="button" onclick={onimport}>{t('import.open')}</button>
    <label class="archived-toggle">
      <input type="checkbox" bind:checked={showArchived} />
      {t('home.showArchived')}
    </label>
  </div>
</section>

<style>
  h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .rep {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: white;
  }
  .rep[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  li.archived .rep {
    opacity: 0.6;
  }
  .name {
    font-weight: 600;
  }
  .meta,
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .due {
    color: #2e7d32;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .small {
    align-self: flex-end;
    font-size: 0.8rem;
  }
  .empty {
    border: 2px dashed var(--border);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    margin-bottom: 0.75rem;
  }
  .empty-title {
    font-weight: 600;
    margin: 0 0 0.3rem;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .primary {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
  .create {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .create label {
    display: flex;
    flex-direction: column;
  }
  fieldset label {
    display: inline-flex;
    flex-direction: row;
    margin-right: 0.75rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
  }
  .archived-toggle {
    display: inline-flex;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
