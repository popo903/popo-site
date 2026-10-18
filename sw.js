/**
 * sw.js —— Service Worker
 * 职责：缓存静态资源 + 离线可用 + 接受 app.js postMessage 触发通知
 */

const CACHE_VERSION = 'popo-v33';
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './fonts/huiwen-mincho.woff2',
  './js/storage.js',
  './js/utils.js',
  './js/cloud.js',
  './js/memo.js',
  './js/knowledge.js',
  './js/plan.js',
  './js/home.js',
  './js/app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ========== 首次安装：预缓存 ==========
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ========== 激活：清理旧缓存 ==========
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ========== fetch：缓存优先 + 网络回退 ==========
self.addEventListener('fetch', function (event) {
  // 只处理 GET，且只在同源范围内
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      // 有缓存直接返回，同时后台用网络更新
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return cached; // 网络失败回退缓存
      });
      return cached || networkFetch;
    })
  );
});

// ========== 消息：app.js 可以 postMessage 触发通知 ==========
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'notify') {
    self.registration.showNotification(data.title || 'popo 专属工作台', {
      body: data.body || '',
      icon: data.icon,
      badge: data.badge,
      tag: data.tag
    });
  }
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ ok: true });
  }
});

// ========== push（预留）==========
self.addEventListener('push', function (event) {
  if (!event.data) return;
  try {
    var payload = event.data.json();
    self.registration.showNotification(payload.title || 'popo', {
      body: payload.body || '',
      icon: payload.icon
    });
  } catch(e) { /* ignore */ }
});

// ========== notification click ==========
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(self.location.origin) === 0) {
          return clients[i].focus();
        }
      }
      return self.clients.openWindow('./index.html');
    })
  );
});
