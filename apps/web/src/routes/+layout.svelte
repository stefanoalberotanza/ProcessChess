<script lang="ts">
  import { dev } from '$app/environment';
  import { resolve } from '$app/paths';
  import { onMount, type Snippet } from 'svelte';
  import { app, initApp } from '$lib/app.svelte';
  import { LOCALES, i18n, initLocale, setLocale, t, type Locale } from '$lib/i18n/index.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    initLocale();
    void initApp();
    void setupServiceWorker();
  });

  /** Production: register the offline service worker. Dev: remove any left by a build. */
  async function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!dev) {
      await navigator.serviceWorker.register('/service-worker.js');
      return;
    }
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('processchess-')).map((k) => caches.delete(k)),
    );
  }
</script>

<svelte:head>
  <title>ProcessChess</title>
</svelte:head>

<header>
  <a class="brand" href={resolve('/')}>ProcessChess</a>
  <nav>
    <a href={resolve('/stats')}>{t('nav.stats')}</a>
  </nav>
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
  {/if}
  {@render children()}
</main>

<style>
  /* Old hotel hall: dark walnut panelling, brass, green leather, lamp-light ivory. */
  :global(:root) {
    color-scheme: dark;
    --fg: #efe3cb;
    --bg: #1b120c;
    --panel: #2a1a10;
    --panel-2: #33200f;
    --muted: #a99273;
    --border: #5a3d24;
    --accent: #c9a24d;
    --brass: #c9a24d;
    --brass-hi: #e6c97a;
    --on-accent: #1b120c;
    --hover: #3d2816;
    --leather: #1f3b2d;
    --good: #4f9a62;
    --warn: #c98a2b;
    --bad: #b8433b;
    --bad-text: #ef8f86;
    --bad-bg: #4a1d1b;
    --bad-fg: #f1b5ae;
    --warn-bg: #4a3512;
    --warn-fg: #ecc57a;
    --info-bg: #1f3a33;
    --info-fg: #a9d4c3;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
    color: var(--fg);
    background: var(--bg);
    font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
  }
  :global(body) {
    margin: 0;
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 50% -10%, rgba(201, 162, 77, 0.16), transparent 55%),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 7px),
      linear-gradient(#22150d, #150d08);
    background-attachment: fixed;
  }
  :global(h1, h2, h3, h4) {
    font-family: var(--serif);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--brass-hi);
  }
  :global(a) {
    color: var(--brass-hi);
  }
  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
    color: var(--fg);
  }
  :global(button) {
    cursor: pointer;
    background: linear-gradient(var(--panel-2), var(--panel));
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.7rem;
    box-shadow: inset 0 1px 0 rgba(255, 230, 170, 0.08);
  }
  :global(button:hover:not(:disabled)) {
    border-color: var(--brass);
    background: var(--hover);
  }
  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible),
  :global(a:focus-visible) {
    outline: 2px solid var(--brass-hi);
    outline-offset: 2px;
  }
  :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  :global(input),
  :global(select),
  :global(textarea) {
    background: #140c07;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  :global(input::placeholder),
  :global(textarea::placeholder) {
    color: var(--muted);
  }
  :global(dialog) {
    background: var(--panel);
    color: var(--fg);
    border: 2px solid var(--brass);
    border-radius: 6px;
  }
  :global(::selection) {
    background: var(--brass);
    color: var(--on-accent);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1.25rem;
    background: linear-gradient(#3a2414, #24150b);
    border-bottom: 3px double var(--brass);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  }
  .brand {
    font-family: var(--serif);
    font-variant: small-caps;
    font-weight: 700;
    font-size: 1.5rem;
    letter-spacing: 0.12em;
    color: var(--brass-hi);
    text-decoration: none;
    text-shadow: 0 1px 0 #000;
  }
  nav {
    margin-left: auto;
    margin-right: 1rem;
  }
  nav a {
    color: var(--fg);
    text-decoration: none;
    border-bottom: 1px solid var(--brass);
  }
  .banner {
    background: var(--warn-bg);
    color: var(--warn-fg);
    padding: 0.5rem 1rem;
    text-align: center;
  }
  main {
    padding: 1.25rem;
    max-width: 1440px;
    margin: 0 auto;
  }
  .error {
    color: var(--bad-text);
  }
</style>
