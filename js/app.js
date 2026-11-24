/* 锦囊 · app（外壳工程师 A）—— 启动、页面切换、深链接、离线缓存的页面端。
 * 加载顺序：store.js → app-ui.js → app-card.js → app-feed.js → app-views.js → app-overlays.js → app.js
 *
 * 深链接（可以用 & 组合，也用于测试）：
 *   #c=<卡片id>   定位到那张卡片        #view=discover|saved|me|feed   打开某个页面
 *   #rescue       打开救场（#rescue=车上 直接选好场景）
 *   #stage=<卡片id>   直接进那张卡片的舞台（也接受组件 id）
 *   #mode=together|me   切换看法        #onboard=1   强制显示引导
 * 分享出去的链接是 #c=<卡片id>&mode=together（只给爸爸的卡片不带 mode）：收到的人打开就是「一起看」。
 * 用 #c= 打开一张当前看法下看不到的卡片：只给一句提示，不切看法，也不露内容。
 */
(function () {
  'use strict';
  const JN = window.JN;
  const root = document.getElementById('app');
  if (!JN || !JN.feed || !JN.views || !root) {
    if (root) root.setAttribute('data-broken', '1');
    return;
  }
  const U = JN.util;
  const S = JN.S;
  const ui = JN.ui;
  const F = JN.feed;
  const V = JN.views;
  const app = (JN.app = JN.app || {});
  const VIEWS = ['feed', 'discover', 'saved', 'me'];
  const TITLES = { feed: '', discover: '发现', saved: '收藏', me: '我的' };
  const dirty = { discover: true, saved: true, me: true };
  let view = 'feed';
  let viewLayer = null;
  let browseTop = false;

  const page = (v) => ui.$('page-' + v);

  /* ---------------- 页面切换 ---------------- */
  function syncActive() {
    F.setActive(view === 'feed' && ui.layers.depth() === 0 && document.visibilityState !== 'hidden');
  }
  function renderPage(v) {
    const box = page(v);
    if (!box || !V[v]) return;
    const top = box.scrollTop;
    V[v].render(box);
    box.scrollTop = top;
    dirty[v] = false;
  }
  function setView(v) {
    view = v;
    root.setAttribute('data-view', v);
    VIEWS.forEach((name) => {
      const box = page(name);
      if (box) box.hidden = name !== v;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tabbar [data-tab]'), (b) => {
      if (b.getAttribute('data-tab') === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const title = ui.$('viewTitle');
    if (title) title.textContent = TITLES[v] || '';
    if (v !== 'feed') {
      if (dirty[v]) renderPage(v);
      const box = page(v);
      if (box) box.scrollTop = 0;
    }
    syncActive();
  }
  /** 去某个页面。离开卡片流算开了一层：返回键先回到卡片流，再退出应用 */
  function show(v) {
    if (VIEWS.indexOf(v) < 0) v = 'feed';
    if (v === view) {
      if (v === 'feed') { if (F.index() !== 0) F.jumpToId((S.deck()[0] || {}).id, true); }
      else { const box = page(v); if (box) box.scrollTop = 0; }
      return;
    }
    if (v === 'feed') {
      if (viewLayer) ui.layers.close(viewLayer); else setView('feed');
      return;
    }
    setView(v);
    if (!viewLayer) viewLayer = ui.layers.open({ name: 'view', close() { viewLayer = null; setView('feed'); } });
  }
  app.show = show;
  app.view = () => view;

  /** 回到卡片流并定位到某张卡片（救场「就这个」、列表项、深链接都走这里） */
  app.gotoCard = (id) => {
    const card = S.byId(id);
    if (!card) { ui.toast('没有找到这张卡片'); return false; }
    if (!S.visible(card)) { ui.toast('这张卡片在「一起看」里不显示'); return false; }
    ui.layers.closeAll();
    if (view !== 'feed') setView('feed');
    if (!F.has(id)) {
      S.resetFilter();                       // 它被筛掉了：清掉筛选再找
      ui.toast('已经清掉筛选，回到全部卡片');
    }
    return F.jumpToId(id, false);
  };
  /** 按类型或场景去刷：设好筛选，回到卡片流，从头看 */
  app.browse = (patch) => {
    ui.layers.closeAll();
    if (view !== 'feed') setView('feed');
    browseTop = true;
    S.setFilter(patch);
    browseTop = false;
  };

  /* ---------------- 状态变化 → 界面 ---------------- */
  JN.bus.on('mode', () => {
    root.setAttribute('data-mode', S.state.mode);
    // 换了看法：所有页面里的旧内容立刻清掉（一起看时 DOM 里不能留只给爸爸的东西）
    ['discover', 'saved', 'me'].forEach((v) => { dirty[v] = true; const box = page(v); if (box && v !== view) U.clear(box); });
    app.syncTopbar();
    F.reload();
    if (view !== 'feed') renderPage(view);
  });
  JN.bus.on('filter', () => {
    app.syncTopbar();
    F.reload({ top: browseTop });
  });
  JN.bus.on('records', () => {
    dirty.saved = dirty.me = true;
    if (view === 'saved' || view === 'me') renderPage(view);
  });
  JN.bus.on('layers', syncActive);
  JN.bus.on('sw', () => {
    dirty.me = true;
    if (view === 'me') renderPage('me');
  });

  /* ---------------- 深链接 ---------------- */
  function parseHash(h) {
    const out = {};
    String(h || '').replace(/^#/, '').split('&').forEach((kv) => {
      if (!kv) return;
      const i = kv.indexOf('=');
      try { out[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 写坏了的参数：忽略 */ }
    });
    return out;
  }
  function applyRoute(r) {
    let any = false;
    if (r.mode === 'together' || r.mode === 'me') { S.setMode(r.mode); any = true; }
    if (r.c) { app.gotoCard(r.c); any = true; }
    if (r.view && VIEWS.indexOf(r.view) >= 0) { show(r.view); any = true; }
    if ('rescue' in r) { app.openRescue(r.rescue); any = true; }
    if (r.stage) {
      if (S.byId(r.stage)) app.openStage(r.stage); else app.openStage(null, r.stage);
      any = true;
    }
    if (r.onboard === '1') { app.openOnboarding(); any = true; }
    return any;
  }
  /** 读完就把 # 后面的参数从地址栏拿掉：刷新时回到今日锦囊，同一个链接再点一次也还能生效 */
  function takeHash() {
    const r = parseHash(window.location.hash);
    if (window.location.hash) {
      try { window.history.replaceState({ jn: 0 }, '', window.location.pathname + window.location.search); } catch (e) { /* noop */ }
    }
    return r;
  }
  window.addEventListener('hashchange', () => {
    if (!window.location.hash) return;
    ui.layers.reset();
    applyRoute(takeHash());
  });

  /* ---------------- 安装 ---------------- */
  let installEvt = null;
  app.env = () => {
    const ua = navigator.userAgent || '';
    return {
      ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
      android: /android/i.test(ua),
      wechat: /micromessenger/i.test(ua),
      standalone: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
      canPrompt: !!installEvt
    };
  };
  function refreshMe() { dirty.me = true; if (view === 'me') renderPage('me'); }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; refreshMe(); });
  window.addEventListener('appinstalled', () => { installEvt = null; ui.toast('装好了，去主屏幕找「锦囊」'); refreshMe(); });
  app.promptInstall = () => {
    const e = installEvt;
    if (!e) return;
    installEvt = null;
    try { e.prompt(); Promise.resolve(e.userChoice).then(refreshMe, refreshMe); } catch (err) { refreshMe(); }
  };

  /* ---------------- 离线缓存（页面端，SPEC 2.7） ---------------- */
  const sw = { state: 'unsupported', version: '', count: 0, reg: null };
  app.sw = () => sw;
  function swSet(patch) { Object.assign(sw, patch); JN.bus.emit('sw', sw); }
  function swInfo() {
    const ctl = navigator.serviceWorker.controller || (sw.reg && sw.reg.active);
    if (!ctl) return;
    let done = false;
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => {
        done = true;
        const d = e.data || {};
        swSet({ state: sw.state === 'update' ? 'update' : 'ready', version: d.version || '', count: d.count || 0 });
      };
      ctl.postMessage({ type: 'info' }, [ch.port2]);
    } catch (e) { /* noop */ }
    setTimeout(() => { if (!done && sw.state === 'pending') swSet({ state: 'ready' }); }, 1500);
  }
  function offerUpdate() {
    swSet({ state: 'update' });
    ui.banner('有新内容，点这里更新', app.applyUpdate);
  }
  app.applyUpdate = () => {
    const w = sw.reg && sw.reg.waiting;
    if (!w) { window.location.reload(); return; }
    ui.toast('正在更新……');
    try { w.postMessage({ type: 'skipWaiting' }); } catch (e) { /* noop */ }
    setTimeout(() => window.location.reload(), 4000);      // 新版本接管后会自己刷新；万一没等到，这里兜底
  };
  app.checkUpdate = () => {
    if (!sw.reg) { ui.toast(sw.state === 'file' ? '直接打开文件时没有离线缓存' : '离线缓存还没准备好'); return; }
    if (navigator.onLine === false) { ui.toast('现在没有网络，连上以后再试'); return; }
    ui.toast('正在检查……');
    sw.reg.update().then(() => {
      setTimeout(() => {
        if (sw.reg.waiting && navigator.serviceWorker.controller) offerUpdate();
        else ui.toast(sw.reg.installing ? '发现新内容，正在准备' : '已经是最新的了');
      }, 700);
    }).catch(() => ui.toast('没连上，过一会儿再试'));
  };
  function initSW() {
    if (window.location.protocol === 'file:') { sw.state = 'file'; return; }       // 直接打开文件：不注册，也不报错
    if (!('serviceWorker' in navigator) || window.isSecureContext === false) { sw.state = 'unsupported'; return; }
    sw.state = 'pending';
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; swInfo(); return; }      // 第一次装好：不需要刷新
      if (reloading) return;
      reloading = true;
      window.location.reload();                                            // 新版本接管：刷新一次
    });
    const start = () => {
      // updateViaCache:'none'：检查更新时 sw.js 和它 importScripts 的清单都不走 HTTP 缓存，
      // 否则托管方给的 max-age（GitHub Pages 是 10 分钟）会让新版本迟迟发现不了
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
        sw.reg = reg;
        const watch = (w) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
            else if (w.state === 'activated') swInfo();
            else if (w.state === 'redundant' && !reg.active) swSet({ state: 'error' });     // 没装全（多半是网络断了），下次打开会再试
          });
        };
        // 一打开就发现上次已经下载好的新版本：直接启用（会自动刷新一次），不用横幅打扰。
        // 用到一半才下载好的新版本，仍然用横幅问一声（见上面的 watch）。
        if (reg.waiting && navigator.serviceWorker.controller) {
          try { reg.waiting.postMessage({ type: 'skipWaiting' }); } catch (e) { offerUpdate(); }
        }
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        navigator.serviceWorker.ready.then(swInfo).catch(() => {});
      }).catch(() => swSet({ state: 'error' }));
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const route = takeHash();
    let routed = false;
    if (route.mode === 'together' || route.mode === 'me') {      // 先定好看法，再排牌：这样第一张就是这个看法下的今日锦囊
      S.setMode(route.mode);
      delete route.mode;
      routed = true;
    }
    root.setAttribute('data-mode', S.state.mode);
    if (!U.hasSymbol('i-heart')) root.classList.add('no-icons');
    app.initTopbar();
    F.init(ui.$('feed'));
    setView('feed');
    F.reload({ fade: false });

    Array.prototype.forEach.call(document.querySelectorAll('#tabbar [data-tab]'), (b) => {
      b.addEventListener('click', () => { JN.haptic(8); show(b.getAttribute('data-tab')); });
    });
    const rescueBtn = ui.$('rescueBtn');
    if (rescueBtn) rescueBtn.addEventListener('click', () => app.openRescue());
    app.prepareRescue();

    let lastUpdateCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        F.checkDay();
        // 装在主屏幕上的应用可以很多天不重开：回到前台时顺手看一眼有没有新版本（一小时最多一次，失败不提示）
        if (sw.reg && navigator.onLine !== false && Date.now() - lastUpdateCheck > 3600e3) {
          lastUpdateCheck = Date.now();
          sw.reg.update().catch(() => {});
        }
      }
      syncActive();
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { F.checkDay(); syncActive(); } });
    window.addEventListener('online', refreshMe);
    window.addEventListener('offline', refreshMe);
    document.addEventListener('touchstart', () => {}, { passive: true });       // 让 iOS 上的 :active 生效
    document.addEventListener('gesturestart', (e) => e.preventDefault());       // iOS：不要双指缩放整页

    initSW();
    routed = applyRoute(route) || routed;
    if (!routed && !S.state.onboarded) app.openOnboarding();
    root.setAttribute('data-ready', '1');
    root.removeAttribute('data-broken');
  }

  try { boot(); } catch (err) {
    console.error('[锦囊] 启动失败', err);
    root.setAttribute('data-broken', '1');
  }
})();
