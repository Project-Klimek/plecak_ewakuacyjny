const CACHE_NAME = 'plecak-ewakuacyjny-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Pliki do cache'owania
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-512.png',
];

// Instalacja Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  self.skipWaiting();
});

// Aktywacja Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  
  self.clients.claim();
});

// Strategia cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API requests - network first, cache as fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clonedResponse = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(request);
        })
    );
    return;
  }
  
  // Static assets - cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request).then((response) => {
        if (!response.ok) {
          return response;
        }
        
        const clonedResponse = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, clonedResponse);
        });
        
        return response;
      });
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Synchronizacja danych
async function syncData() {
  try {
    // Pobierz dane z IndexedDB do synchronizacji
    const pendingChanges = await getPendingChangesFromIndexedDB();
    
    if (pendingChanges.length > 0) {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: pendingChanges }),
      });
      
      if (response.ok) {
        await clearPendingChangesFromIndexedDB();
        console.log('[SW] Sync completed');
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Pomocnicze funkcje IndexedDB (symulacja - faktyczna implementacja w lib/offline.ts)
async function getPendingChangesFromIndexedDB() {
  return [];
}

async function clearPendingChangesFromIndexedDB() {
  return;
}

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  const options = {
    body: event.data?.text() || 'Nowe powiadomienie',
    icon: '/icons/icon-512.png',
    badge: '/icons/icon-512.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'explore', title: 'Zobacz' },
      { action: 'close', title: 'Zamknij' },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification('Plecak Ewakuacyjny', options)
  );
});

// Obsługa kliknięcia w powiadomienie
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

// Periodic Background Sync (jeśli wspierane)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-expiry') {
    event.waitUntil(checkExpiryDates());
  }
});

async function checkExpiryDates() {
  // Wywołaj endpoint sprawdzający daty ważności
  try {
    await fetch('/api/notifications/check-expiry', { method: 'POST' });
  } catch (error) {
    console.error('[SW] Failed to check expiry dates:', error);
  }
}
