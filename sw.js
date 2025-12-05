
const CACHE_NAME = 'carpa-inventory-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.tsx',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://placehold.co/192x192/2563eb/ffffff?text=CARPA',
  'https://placehold.co/512x512/2563eb/ffffff?text=CARPA'
];

// Instalação do Service Worker e cache dos recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // Ignora requisições para o Supabase ou APIs externas na lógica de cache estático
  if (event.request.url.includes('supabase.co') || event.request.url.includes('google')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
