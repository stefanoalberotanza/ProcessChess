<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount, type Snippet } from 'svelte';
  import { app, initApp } from '$lib/app.svelte';
  import { LOCALES, i18n, initLocale, setLocale, t, type Locale } from '$lib/i18n/index.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    initLocale();
    void initApp();
  });
</script>

<svelte:head>
  <title>ProcessChess</title>
</svelte:head>

<header>
  <a class="brand" href={resolve('/')}>ProcessChess</a>
  <label class="lang">
    <span class="sr-only">{t('lang.label')}</span>
    <select
      value={i18n.locale}
      onchange={(e) => setLocale((e.currentTarget as HTMLSelectElement).value as Locale)}
    >
      {#each LOCALES as l (l)}
        <option value={l}>{t(`lang.${l}`)}</option>
      {/each}
    </select>
  </label>
</header>

{#if app.ready && !app.persistent}
  <div class="banner" role="alert" data-testid="not-persistent">{t('storage.notPersistent')}</div>
{/if}

<main>
  {#if app.error}
    <p class="error" role="alert">{t('error.generic', { message: app.error })}</p>
  {:else if !app.ready}
    <p aria-busy="true">{t('common.loading')}</p>
  {:else}
    {@render children()}
  {/if}
</main>

<style>
  :global(:root) {
    --fg: #1d1d1f;
    --bg: #fafafa;
    --muted: #5f6368;
    --border: #d9d9de;
    --accent: #2f6fb5;
    --hover: #e8eef7;
    color: var(--fg);
    background: var(--bg);
    font-family: system-ui, sans-serif;
  }
  :global(body) {
    margin: 0;
  }
  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  :global(button) {
    font: inherit;
    cursor: pointer;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    font-weight: 700;
    font-size: 1.2rem;
    color: inherit;
    text-decoration: none;
  }
  .banner {
    background: #fff3cd;
    color: #6b5000;
    padding: 0.5rem 1rem;
    text-align: center;
  }
  main {
    padding: 1rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  .error {
    color: #b00020;
  }
</style>
