import { loadOpenings } from '@processchess/core';
import type { Storage } from '@processchess/db';

interface AppState {
  ready: boolean;
  storage: Storage | null;
  /** False when OPFS is unavailable and data lives in memory only. */
  persistent: boolean;
  error: string | null;
}

export const app = $state<AppState>({ ready: false, storage: null, persistent: true, error: null });

let started: Promise<void> | undefined;

/** Opens the database (OPFS worker), applies migrations and loads the openings dataset. */
export function initApp(): Promise<void> {
  started ??= (async () => {
    try {
      const { createOpfsStorage } = await import('@processchess/db/opfs');
      const [storage] = await Promise.all([createOpfsStorage(), loadOpenings()]);
      await storage.migrate();
      if (!storage.persistent) console.warn('OPFS unavailable:', storage.fallbackReason);
      app.storage = storage;
      app.persistent = storage.persistent;
      app.ready = true;
    } catch (e) {
      app.error = e instanceof Error ? e.message : String(e);
    }
  })();
  return started;
}

export function storage(): Storage {
  if (!app.storage) throw new Error('Storage not ready');
  return app.storage;
}

/** Query parameter of the current page URL (static app: ids travel in the query string). */
export function queryParam(name: string): string | null {
  // read once on mount: not reactive on purpose
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  return new URLSearchParams(window.location.search).get(name);
}
