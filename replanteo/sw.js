const CACHE='replanteo-v1.0.2';const FILES=['./','./index.html','./manifest.json','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).then(resp=>{if(resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));}return resp;}).catch(()=>caches.match('./index.html')));return;}
e.respondWith(caches.match(r,{ignoreSearch:true}).then(x=>x||fetch(r).then(resp=>{if(resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return resp;})));});
