import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Registered manually in +layout.svelte, production only: in dev a service worker could
    // serve pages cached by an earlier build (docs/adr/008-i18n-pwa.md).
    serviceWorker: { register: false },
  },
};
