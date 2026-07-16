const CACHE='dot-almasiah-v28-stable';
const ASSETS=['./','./index.html','./dashboard.html','./cloud-bridge.js','./firebase-config.js','./historical-data.json','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;if(u.origin===location.origin&&(u.pathname.endsWith('.js')||u.pathname.endsWith('.html')||u.pathname.endsWith('.json'))){e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request)));return;}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
