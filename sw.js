const CACHE = 'prompt-playground-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './lib.js',
  './app.js',
  './manifest.json',
  './utils/storage.js',
  './utils/variables.js',
  './utils/messages.js',
  './providers/index.js',
  './providers/openai.js',
  './providers/anthropic.js',
  './components/ApiKeyModal.js',
  './components/FileLoader.js',
  './components/ParameterPanel.js',
  './components/MessageEditor.js',
  './components/VariablePanel.js',
  './components/ResponseDisplay.js',
  './components/DiffViewer.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Pass through external requests (CDN, API calls)
  if (url.origin !== location.origin) return;
  // Cache-first for same-origin GET requests
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      });
    })
  );
});
