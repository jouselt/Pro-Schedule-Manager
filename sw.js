// sw.js

// A name for our cache
const CACHE_NAME = 'pro-schedule-manager-v1';

// A list of all the files we want to cache
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './images/icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',
    'https://esm.run/@material/web/all.js'
];

/**
 * The install event is fired when the service worker is first installed.
 * We use this event to download all the essential files (the "app shell")
 * and store them in the cache.
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

/**
 * The fetch event is fired every time the app requests a resource (like a page, script, or image).
 * We intercept these requests and check if we have a copy in our cache.
 * If we do, we serve the cached version. If not, we fetch it from the network.
 * This is called a "cache-first" strategy.
 */
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // If the file is in the cache, return it.
                if (response) {
                    return response;
                }
                // Otherwise, fetch the file from the network.
                return fetch(event.request);
            })
    );
});
