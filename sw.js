// Service Worker: 네트워크 우선(Network-first)으로 최신 자원을 우선 로드하고,
// 오프라인/일시 장애 시 캐시로 폴백합니다.

const CACHE_NAME = 'maze-cache-v20251227_4';

self.addEventListener('install', (event) => {
  // 즉시 대기열을 건너뛰고 활성화 시도(업데이트 반영 빠르게)
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 핵심 파일만 프리캐시(네트워크가 되면 최신이므로, 실패해도 괜찮음)
    await cache.addAll([
      './',
      './index.html',
      './style.css',
    ]).catch(() => {});
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 오래된 캐시 정리
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

function isHtmlRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.mp3'))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 같은 오리진만 처리(외부 CDN은 브라우저 기본 정책에 맡김)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML/정적 자원은 네트워크 우선 + 캐시 폴백
  if (isHtmlRequest(req) || isStaticAsset(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(req, { cache: 'no-store' });
        // 성공 시 캐시 갱신
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        // 네트워크 실패 시 캐시 폴백
        const cached = await cache.match(req);
        if (cached) return cached;
        // HTML은 index로라도 폴백
        if (isHtmlRequest(req)) {
          const idx = await cache.match('./index.html');
          if (idx) return idx;
        }
        throw e;
      }
    })());
  }
});



