


const CACHE_NAME = 'xinblog-shell-v4';
const SHELL_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // 逐个预缓存：任一失败都不能让 install reject。
      // 否则 activate（负责删掉旧版本的毒缓存）不会执行，自愈会静默失效。
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => keys.filter((key) => key !== CACHE_NAME))
      .then((oldKeys) => Promise.all(oldKeys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 缺失的 /assets/* 会被 CF Pages 兜底成 200 + text/html，而不是 404。
// 若只判断 status === 200 就写缓存，会把 SPA 兜底 HTML 当成 JS/CSS 永久缓存，
// 之后动态 import 会持续报 "Failed to fetch dynamically imported module"。
// 因此判据必须同时看两件事：
//  1) 请求路径的扩展名是静态资源（才值得缓存）
//  2) 响应类型不是兜底类型（text/html / application/json）
// 注：实测 CF Pages 对 woff/woff2/ttf 返回的是 application/octet-stream，
// 所以不能用 content-type 白名单，否则全部字体会失去缓存。
const CACHEABLE_EXTENSIONS = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)$/i;

function isCacheableAssetResponse(response, pathname) {
  if (!response || response.status !== 200) return false;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType) return false;
  if (contentType.includes('text/html') || contentType.includes('application/json')) return false;
  return CACHEABLE_EXTENSIONS.test(pathname || '');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|ico|json)$/.test(url.pathname)
  ) {
    event.respondWith(
      // 收口到自己的缓存，避免全 origin 搜索把其它缓存的条目（含旧毒条目）读回来
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(request))
        .then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (isCacheableAssetResponse(response, url.pathname)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        })
    );
    return;
  }

  
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/index.html')) ?? (await caches.match('/')))
    );
    return;
  }
});
