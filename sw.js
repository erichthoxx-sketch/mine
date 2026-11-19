// Ускоритель приложений (Доходы, Мастерская, Директ): файлы версии лежат в папке /vXXXXXXXX/ и никогда не меняются —
// их берём из кэша телефона сразу, без сотни запросов к серверу при каждом открытии. Шрифты — тоже из кэша.
// Страницы, version.txt, Firebase, Google, Директ и всё остальное — как обычно, из сети: новая версия приходит сама.
const FONTS = 'mine-fonts';
const verOf = (path) => (path.match(/\/(v[0-9a-f]{8})\//) || [])[1] || '';
const CUR = new URL(location.href).searchParams.get('v') || '';
self.addEventListener('install', () => self.skipWaiting());
// старые версии из кэша убираем (оставляем текущую)
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => /^mine-v[0-9a-f]{8}$/.test(k) && k !== 'mine-' + CUR).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const v = u.origin === location.origin ? verOf(u.pathname) : '';
  const font = u.hostname === 'fonts.gstatic.com';
  if (!v && !font) return;
  e.respondWith(caches.open(v ? 'mine-' + v : FONTS).then(async (c) => {
    const hit = await c.match(r, { ignoreSearch: false });
    if (hit) return hit;
    const res = await fetch(r);
    if (res.ok) c.put(r, res.clone()).catch(() => {});
    return res;
  }));
});
