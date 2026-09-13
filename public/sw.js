/*
 * ChefMind offline shell.
 *
 * Deliberately conservative. Reads are cached so a recipe you already opened
 * survives the kitchen WLAN dropping out; writes are never queued or replayed,
 * because a meal plan entry that silently lands twenty minutes later — or never
 * — is worse than an error you can see.
 */
const VERSION = 'chefmind-v1';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const MEDIA = `${VERSION}-media`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon.svg', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Anything that changes state, talks to a model, or speaks MCP goes straight
  // to the network and is never cached.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) return;
  // Server-action responses and RSC payloads must never be served from a cache.
  if (url.searchParams.has('_rsc')) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  // Uploaded photos are ULID-keyed and never rewritten, so they are safe forever.
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(request, MEDIA));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}
