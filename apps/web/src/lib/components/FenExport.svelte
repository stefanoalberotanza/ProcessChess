<!-- FEN of the position on the board, selectable, with a copy button. -->
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';

  let { fen }: { fen: string } = $props();

  let input: HTMLInputElement;
  let status = $state<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fen);
      status = t('fen.copied');
    } catch {
      // no clipboard permission (or insecure context): leave the text selected to copy by hand
      input.select();
      status = t('fen.selectToCopy');
    }
  }

  $effect(() => {
    void fen;
    status = null;
  });
</script>

<div class="fen">
  <label for="fen-output">{t('fen.label')}</label>
  <input
    id="fen-output"
    bind:this={input}
    type="text"
    readonly
    value={fen}
    spellcheck="false"
    onfocus={(e) => e.currentTarget.select()}
  />
  <button type="button" onclick={copy}>{t('fen.copy')}</button>
  <span class="status" aria-live="polite">{status ?? ''}</span>
</div>

<style>
  .fen {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    max-width: min(92vw, 520px);
    font-size: 0.85rem;
  }
  label {
    color: var(--muted);
  }
  input {
    flex: 1;
    min-width: 12rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
  }
  .status {
    color: #2e7d32;
    min-width: 4rem;
  }
</style>
