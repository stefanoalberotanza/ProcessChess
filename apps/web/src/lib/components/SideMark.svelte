<!-- Whose opening: ○ White, ● Black (the side that plays the defining move). -->
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';

  let { side }: { side: 'w' | 'b' | null } = $props();
  const label = $derived(side === 'w' ? t('side.white') : side === 'b' ? t('side.black') : '');
</script>

{#if side}
  <span class="side {side}" role="img" aria-label={label} title={label} data-side={side}></span>
{/if}

<style>
  .side {
    display: inline-block;
    flex: none;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 1.5px solid #cdb98f;
    box-sizing: border-box;
    vertical-align: middle;
  }
  .w {
    background: #f4ead2;
  }
  .b {
    background: #120c08;
  }
</style>
