/* 缓存策略：页面与数据走网络优先，静态资源走缓存优先。
   每次发版请把 CACHE 改成新版本号 —— 名字一变，浏览器才会拉新文件。 */
const CACHE = 'pixel-todo-v1.1.02';
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
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 1. 跨域请求（ESPN 赛程、AI 资讯源）一律交给浏览器，不拦截、不缓存
  if (url.origin !== self.location.origin) return;

  // 2. 数据文件网络优先：拿到就刷新缓存，断网才回退旧数据
  //    比分和库里状态靠这条保持最新，不能被缓存卡住
  if (/\/assets\/.*\.json$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 3. 页面导航网络优先：保证每次打开拿到最新版本，断网才用缓存
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 4. 静态资源缓存优先
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
