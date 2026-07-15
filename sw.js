const CACHE='dot-almasiah-v24-0-1';
const STATIC=['./manifest.webmanifest','./icon-192.svg','./icon-512.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;
  const isCode=url.pathname.endsWith('.js')||url.pathname.endsWith('.html')||url.pathname==='/'||url.pathname.endsWith('/');
  if(isCode){event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;})));
});
