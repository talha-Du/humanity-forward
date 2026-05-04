const CACHE_NAME = 'hf-mapper-v1';
const TILE_CACHE_NAME = 'hf-mapper-tiles-v1';
const SYNC_TAG = 'resource-sync';

// Static assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './mapper.html',
  './style.css',
  './dashboard.css',
  './app.js',
  './dashboard.js',
  './api-client.js',
  './manifest.json',
  './sw-register.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Icon files to cache
const ICON_FILES = [
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

const ALL_ASSETS = [...STATIC_ASSETS, ...ICON_FILES];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(ALL_ASSETS);
    }).catch((err) => {
      console.warn('[SW] Some assets failed to cache:', err);
    })
  );
  self.skipWaiting();
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== TILE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ==================== FETCH (Offline-First) ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching (pass through)
  if (request.method !== 'GET') {
    return;
  }

  // OpenStreetMap tile handling
  if (url.hostname.includes('tile.openstreetmap.org') ||
      url.hostname.includes('.tile.openstreetmap.org')) {
    event.respondWith(handleTileRequest(request));
    return;
  }

  // API requests (resources data) - network first, fallback to cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/resources')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  // Static assets - cache first, fallback to network
  event.respondWith(handleStaticRequest(request));
});

// Handle map tile requests with dedicated tile cache
async function handleTileRequest(request) {
  const tileCache = await caches.open(TILE_CACHE_NAME);
  const cached = await tileCache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      tileCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Tile fetch failed:', error);
    // Return a transparent placeholder or failed response
    return new Response(null, { status: 504, statusText: 'Offline - Tile not cached' });
  }
}

// Handle API requests - network first, cache fallback
async function handleAPIRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] API fetch failed, trying cache:', error);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: 'Offline - Data not available' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Handle static assets - cache first, network fallback with cache update
async function handleStaticRequest(request) {
  const cached = await caches.match(request);

  if (cached) {
    // Return cached version immediately, then update in background
    fetch(request).then((networkResponse) => {
      if (networkResponse.ok) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, networkResponse);
        });
      }
    }).catch(() => {
      // Network failed, cached version is already returned
    });

    return cached;
  }

  // Not in cache - fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Static fetch failed:', error);
    return new Response('Offline - Resource not available', { status: 503 });
  }
}

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  if (event.tag === SYNC_TAG || event.tag === 'resource-updates') {
    event.waitUntil(syncResources());
  }
});

async function syncResources() {
  try {
    // Get pending updates from IndexedDB or localStorage via clients
    const clients = await self.clients.matchAll({ type: 'window' });
    if (clients.length > 0) {
      // Notify clients to sync their pending changes
      clients.forEach((client) => {
        client.postMessage({
          type: 'SYNC_RESOURCES',
          message: 'Background sync triggered'
        });
      });
    }
    console.log('[SW] Background sync completed');
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  let data = {
    title: 'Humanity Forward',
    body: 'New community resource update available!',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    tag: 'resource-update',
    requireInteraction: false
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      requireInteraction: data.requireInteraction,
      data: data.data,
      actions: data.actions || [
        { action: 'open', title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.openWindow('./').catch(() => {
      clients.openWindow('./mapper.html');
    })
  );
});

// ==================== MESSAGE HANDLING (from clients) ====================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'REGISTER_SYNC') {
    event.waitUntil(
      self.registration.sync.register(SYNC_TAG).then(() => {
        console.log('[SW] Background sync registered');
      }).catch((err) => {
        console.warn('[SW] Background sync registration failed:', err);
      })
    );
  }

  if (event.data && event.data.type === 'CLEAR_TILE_CACHE') {
    event.waitUntil(
      caches.delete(TILE_CACHE_NAME).then(() => {
        console.log('[SW] Tile cache cleared');
      })
    );
  }
});

// ==================== PERIODIC SYNC (if supported) ====================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'resource-sync') {
    event.waitUntil(syncResources());
  }
});
