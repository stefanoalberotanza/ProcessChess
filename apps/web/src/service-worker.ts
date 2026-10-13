/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Offline support: precache the app shell, every build chunk (including the lazy openings
// chunk, the SQLite worker and sqlite3.wasm), static files and prerendered pages.
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `processchess-${version}`;
const ASSETS = [...build, ...files, ...prerendered];
const PRECACHED = new Set(ASSETS);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(ASSETS);
        // worker bundles and sqlite3.wasm, listed after the build (scripts/precache-extra.js)
        const res = await fetch('/precache-extra.json', { cache: 'no-store' });
        if (res.ok) {
          const extra = (await res.json()) as string[];
          await cache.addAll(extra);
          extra.forEach((p) => PRECACHED.add(p));
        }
      })
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // pages: network first, so an online user always gets the latest deploy; cache offline
      const isPage = request.mode === 'navigate';
      if (!isPage && (PRECACHED.has(url.pathname) || url.pathname.startsWith('/_app/immutable/'))) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
      }
      try {
        const res = await fetch(request);
        // immutable build files are content-hashed: keep any we missed at install
        if (res.ok && url.pathname.startsWith('/_app/immutable/')) {
          await cache.put(url.pathname, res.clone());
        }
        return res;
      } catch (err) {
        // offline: pages are cached by path (ids travel in the query string)
        const fallback =
          (await cache.match(url.pathname)) ??
          (request.mode === 'navigate' ? await cache.match('/') : undefined);
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
