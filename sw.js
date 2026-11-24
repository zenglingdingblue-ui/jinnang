/* 锦囊 · Service Worker（外壳工程师 A）—— 离线缓存，见 SPEC 2.7
 *
 *   - importScripts('./precache-manifest.js') 拿到版本号和文件清单（tools/build.py 生成）
 *   - 安装时把清单里的文件全部缓存；装不全就不算装好，旧版本继续服务
 *   - 取用时：清单里的文件「缓存优先」；清单之外的同源文件「网络优先，断网退回缓存」
 *   - 页面跳转拿不到时回退到 index.html
 *   - 只处理同源、本应用路径下的 GET
 *   - 激活时清掉旧版本的缓存
 *   - 新版本装好后先等着；页面发来 skipWaiting 才立即接管（页面随后刷新一次）
 *   - 清单不存在（开发期）时照常工作：只缓存首页，其余全部「网络优先」
 */
'use strict';

try { importScripts('./precache-manifest.js'); } catch (e) { /* 开发期：清单还没生成 */ }

const VERSION = self.__JN_VERSION || 'dev';
const LIST = Array.isArray(self.__JN_PRECACHE) ? self.__JN_PRECACHE : [];
const SCOPE = new URL('./', self.location.href).href;                 // 站点挂在子路径下：一切以 sw.js 所在目录为准
const PREFIX = 'jinnang|' + new URL(SCOPE).pathname + '|';
const CACHE = PREFIX + VERSION;
const ROOT_URL = SCOPE;
const INDEX_URL = new URL('./index.html', SCOPE).href;
const abs = (u) => new URL(u, SCOPE).href;
const PRECACHE = Array.from(new Set(LIST.map(abs).concat([ROOT_URL, INDEX_URL])));
const PRECACHED = new Set(PRECACHE);

/** 被重定向过的响应不能直接拿来回应页面跳转：重新包一层 */
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function fetchInto(cache, url) {
  const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
  if (!res.ok) throw new Error(url + ' → ' + res.status);
  await cache.put(url, await clean(res));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let failed = [];
    await Promise.all(PRECACHE.map((u) => fetchInto(cache, u).catch(() => { failed.push(u); })));
    if (failed.length) {                                             // 失败的再试一次
      const again = failed;
      failed = [];
      await Promise.all(again.map((u) => fetchInto(cache, u).catch(() => { failed.push(u); })));
    }
    // 有清单时要求一个不落；没有清单（开发期）时能缓存多少算多少
    if (failed.length && LIST.length) {
      await caches.delete(CACHE);
      throw new Error('[锦囊] 离线缓存没装全：' + failed.join(', '));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf(PREFIX) === 0 && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : data && data.type;
  if (type === 'skipWaiting' || type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (type === 'info' && event.ports && event.ports[0]) {
    event.waitUntil((async () => {
      let count = 0;
      try { count = (await (await caches.open(CACHE)).keys()).length; } catch (e) { /* noop */ }
      event.ports[0].postMessage({ version: VERSION, count: count, listed: LIST.length });
    })());
  }
});

async function fromNetwork(cache, request, keep) {
  const res = await fetch(request);
  if (keep && res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    clean(copy).then((c) => cache.put(request, c)).catch(() => {});
  }
  return res;
}

async function respond(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  const key = url.origin + url.pathname;                             // 不看 ?查询 和 #片段
  const isNav = request.mode === 'navigate';
  const isHome = key === ROOT_URL || key === INDEX_URL;

  if (PRECACHED.has(key)) {                                          // 清单里的：缓存优先
    const hit = (await cache.match(key)) || (isHome ? (await cache.match(INDEX_URL)) || (await cache.match(ROOT_URL)) : null);
    if (hit) return hit;
  }
  try {
    return await fromNetwork(cache, request, true);                  // 其余：网络优先，顺手存一份
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (isNav) {                                                     // 页面跳转拿不到：回退到首页
      // 首页里全是相对路径：只有同一层目录下的地址才能原地给出 index.html，更深的地址改成跳回应用根
      const dir = url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
      if (dir !== SCOPE) return Response.redirect(ROOT_URL, 302);
      const home = (await cache.match(INDEX_URL)) || (await cache.match(ROOT_URL));
      if (home) return home;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                   // 只管同源
  if (url.href.indexOf(SCOPE) !== 0) return;                         // 只管本应用路径下的
  if (/\/(sw|precache-manifest)\.js$/.test(url.pathname)) return;    // 这两个永远走网络，更新检查才准
  event.respondWith(respond(request));
});
