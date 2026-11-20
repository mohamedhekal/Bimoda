/* Bimoda app-shell service worker. Same-origin GETs only; never touches Firebase/AI requests. */
const CACHE = 'bimoda-shell-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']
// ignoreVary: static hosts often send "Vary: Origin", which would make module-script requests miss their own cached copy
const lookup = (req) => caches.match(req, { ignoreVary: true })

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
// The page reports the hashed build assets it loaded so they are available offline from the next visit on.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'CACHE_URLS') e.waitUntil(caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => undefined)))))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => lookup('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    e.respondWith(lookup(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res })))
  }
})
