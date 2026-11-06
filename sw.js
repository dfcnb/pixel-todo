/* 缓存策略：页面、数据、静态资源全部网络优先，断网才回退缓存。
   这么做的原因：缓存优先会让 app.js 永远停在第一次装的那个版本 ——
   页面版本号变了、功能还是旧的。改版后必须让新代码立刻生效。 */
const CACHE = 'pixel-todo-v1.5.00';
const DATA_CACHE = 'pixel-todo-data';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './hero.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 逐个加：某个文件缺失不该让整个安装失败
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function netFirst(req, cacheName) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 跨域（ESPN 赛程、AI 资讯源）一律交给浏览器，不拦截、不缓存
  if (url.origin !== self.location.origin) return;

  // 数据文件：网络优先，断网回退旧数据
  if (/\/assets\/.*\.json$/.test(url.pathname)) {
    e.respondWith(netFirst(e.request, DATA_CACHE));
    return;
  }

  // 页面与静态资源：全部网络优先，保证发版即生效
  e.respondWith(netFirst(e.request, CACHE));
});
