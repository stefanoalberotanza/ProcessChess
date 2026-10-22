<!-- Switch for the sound and the board animations. -->
<script lang="ts">
  import { effects } from '$lib/effects.svelte';
  import { t } from '$lib/i18n/index.svelte';
</script>

<label class="effects">
  <input type="checkbox" checked={effects.on} onchange={() => effects.toggle()} />
  {t('effects.label')}: {effects.on ? t('effects.on') : t('effects.off')}
</label>

<style>
  .effects {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }
</style>
