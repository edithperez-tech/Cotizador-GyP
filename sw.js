'use strict';

/* Cache del "cascarón" de la app para que abra sin internet.
Los datos (catálogo, cotizaciones) NO se cachean aquí, viven en
localStorage y se manejan en app.js.

Estrategia: red primero, IGNORANDO la caché HTTP del navegador (cache:
'no-store'). Esto es clave: sin "no-store", el navegador puede devolver
una copia vieja desde su propia caché aunque este Service Worker pida
red primero, y los cambios nunca se ven. Así, en cuanto hay internet,
cualquier cambio publicado (código nuevo, correcciones) se ve de
inmediato la próxima vez que se abre la app — y si además cambió este
archivo (sw.js), la app se recarga sola (ver app.js:
registrarServiceWorkerConAutoActualizacion).
Si no hay internet, se usa la última copia guardada. */

const CACHE_NAME = 'cotizador-gyp-v4';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((path) =>
        fetch(path, { cache: 'no-store' }).then((resp) => cache.put(path, resp)).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Permite que la app (botón "Buscar actualización" o al abrir) le diga a esta
// versión nueva que tome control de una vez, sin esperar a que se cierren
// todas las pestañas/instancias abiertas.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Nunca interceptar llamadas al backend (Apps Script): esas siempre deben ir a la red.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')) {
    return; // deja pasar directo a la red
  }
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then((networkResp) => {
      if (networkResp && networkResp.status === 200) {
        const clone = networkResp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return networkResp;
    }).catch(() => caches.match(event.request))
  );
});
