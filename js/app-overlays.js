/* 锦囊 · app-overlays（外壳工程师 A）
 * 顶栏上的三样（我看 / 一起看 开关、类型条、筛选抽屉）和三个全屏浮层（救场、舞台、首次引导）。
 * 对外都挂在 JN.app 上：
 *   initTopbar()  syncTopbar()  openFilter()
 *   openRescue(scene?)  openStage(cardId, widgetId?)  openOnboarding()
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN || !JN.card) return;
  const U = JN.util;
  const S = JN.S;
  const ui = JN.ui;
  const C = JN.card;
  const app = (JN.app = JN.app || {});
  const HOLD_MS = 800;

  function btn(spec, label, icon, onClick, attrs) {
    return U.el('button.' + spec, { attrs: Object.assign({ type: 'button' }, attrs || {}), on: { click: onClick } }, [
      icon ? ui.icon(icon) : null,
      U.el('span', { text: label })
    ]);
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (e) { return {}; } }
  function closeBtn(onClick) {
    return U.el('button.overlay__close', { attrs: { type: 'button', 'aria-label': '关闭' }, on: { click: onClick } }, [ui.icon('close')]);
  }

  /* ================= 我看 / 一起看 ================= */
  let meBtn = null, toBtn = null;
  function setMode(mode) {
    if (!S.setMode(mode)) return;
    JN.sfx('tap');
    JN.haptic(mode === 'me' ? [10, 40, 20] : 14);
    ui.toast(mode === 'together' ? '一起看 · 可以把手机递过去了' : '我看 · 提示和锦囊都回来了');
  }
  app.setMode = setMode;
  function paintMode() {
    if (!meBtn) return;
    const tg = S.together();
    meBtn.setAttribute('aria-pressed', String(!tg));
    toBtn.setAttribute('aria-pressed', String(tg));
    meBtn.classList.toggle('is-on', !tg);
    toBtn.classList.toggle('is-on', tg);
    meBtn.setAttribute('aria-label', tg ? '我看（按住 0.8 秒切回）' : '我看');
  }
  function initMode(box) {
    U.clear(box);
    const ring = U.svg('svg', { class: 'mode__ring', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
      U.svg('circle', { class: 'mode__ring-bg', cx: 12, cy: 12, r: 10 }),
      U.svg('circle', { class: 'mode__ring-fg', cx: 12, cy: 12, r: 10, pathLength: 100, transform: 'rotate(-90 12 12)' })
    ]);
    // 「我看」前面的小锁和进度环只在一起看模式下出现（CSS 控制）
    meBtn = U.el('button.mode__opt.mode__me', { attrs: { type: 'button', 'data-mode': 'me' } }, [
      U.el('span.mode__ic', { attrs: { 'aria-hidden': 'true' } }, [ui.icon('lock', 'mode__lock'), ring]),
      U.el('span', { text: '我看' })
    ]);
    toBtn = U.el('button.mode__opt.mode__together', { attrs: { type: 'button', 'data-mode': 'together' } }, [
      U.el('span', { text: '一起看' })
    ]);
    box.appendChild(meBtn);
    box.appendChild(toBtn);

    // 从「一起看」切回「我看」要按住 0.8 秒（防止孩子顺手切回去看到提示）
    let hold = 0;
    function start() {
      if (!S.together() || hold) return;
      meBtn.classList.add('is-holding');
      hold = setTimeout(() => {
        hold = 0;
        meBtn.classList.remove('is-holding');
        setMode('me');
      }, HOLD_MS);
    }
    function cancel(tip) {
      if (!hold) return;
      clearTimeout(hold);
      hold = 0;
      meBtn.classList.remove('is-holding');
      if (tip) ui.toast('按住「我看」0.8 秒才能切回去');
    }
    meBtn.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button === 0) start(); });
    meBtn.addEventListener('pointerup', () => cancel(true));
    meBtn.addEventListener('pointerleave', () => cancel(false));
    meBtn.addEventListener('pointercancel', () => cancel(false));
    meBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    meBtn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); });
    meBtn.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') cancel(true); });
    meBtn.addEventListener('blur', () => cancel(false));
    toBtn.addEventListener('click', () => { if (!S.together()) setMode('together'); });
    paintMode();
  }

  /* ================= 类型条与筛选 ================= */
  let typebar = null, filterBtn = null, filterN = null;
  function paintTypebar() {
    if (!typebar) return;
    U.clear(typebar);
    const cur = S.state.filter.type;
    let on = null;
    [{ id: 'all', name: '全部' }].concat(S.types()).forEach((t) => {
      const b = U.el('button.jn-chip.typebar__chip', { attrs: { type: 'button', 'data-type': t.id, 'aria-pressed': String(cur === t.id) } }, [
        t.id === 'all' ? null : ui.typeIcon(t.id),
        U.el('span', { text: t.name })
      ]);
      if (cur === t.id) { b.classList.add('is-on'); on = b; }
      b.addEventListener('click', () => {
        JN.sfx('tick');
        S.setFilter({ type: S.state.filter.type === t.id ? 'all' : t.id });     // 再点一次选中的：回到全部
      });
      typebar.appendChild(b);
    });
    if (on) typebar.scrollLeft = Math.max(0, on.offsetLeft - (typebar.clientWidth - on.offsetWidth) / 2);
  }
  function paintFilterBtn() {
    if (!filterBtn) return;
    const n = S.filterExtra();
    filterBtn.classList.toggle('is-on', n > 0);
    filterBtn.setAttribute('aria-label', n ? '筛选，已选 ' + n + ' 项' : '筛选');
    if (filterN) { filterN.textContent = n ? String(n) : ''; filterN.hidden = !n; }
  }
  app.openFilter = () => {
    if (ui.layers.find('filter')) return;
    let type = S.state.filter.type;
    let scenes = S.state.filter.scenes.slice();
    let mins = S.state.filter.mins;
    const goTxt = U.el('span');
    const go = U.el('button.jn-btn.filter__go', { attrs: { type: 'button' }, on: { click: () => sh.close() } }, [goTxt]);
    const upd = () => {
      const n = S.deck().length;
      goTxt.textContent = n ? '看看这 ' + n + ' 张' : '一张都没有，放宽一点';
      go.classList.toggle('is-off', !n);
    };
    // 每点一下立刻生效：抽屉后面的卡片流跟着变，底下的按钮报出还剩几张
    const apply = () => { S.setFilter({ type: type, scenes: scenes, mins: mins }); upd(); };
    const typeChips = ui.chips([{ value: 'all', label: '全部' }].concat(S.types().map((t) => ({ value: t.id, label: t.name, icon: ui.typeIcon(t.id) }))), type, false, (v) => { type = v; apply(); });
    const sceneChips = ui.chips(JN.SCENES.map((s) => ({ value: s.id, label: s.id, icon: ui.sceneIcon(s.id) })), scenes, true, (v) => { scenes = v; apply(); });
    const minChips = ui.chips([{ value: 0, label: '不限' }, { value: 2, label: '2 分钟内' }, { value: 10, label: '10 分钟内' }], mins, false, (v) => { mins = v; apply(); });
    const reset = btn('jn-btn.jn-btn--ghost.filter__reset', '重置', 'undo', () => {
      type = 'all';
      scenes = [];
      mins = 0;
      typeChips.set('all');
      sceneChips.set([]);
      minChips.set(0);
      apply();
    });
    const sh = ui.sheet({
      title: '筛选', name: 'filter', cls: 'sheet--filter',
      body: [
        U.el('h4.filter__h', { text: '类型' }), typeChips.el,
        U.el('h4.filter__h', { text: '场景（可以多选）' }), sceneChips.el,
        U.el('h4.filter__h', { text: '大概要多久' }), minChips.el
      ],
      foot: [reset, go]
    });
    upd();
    return sh;
  };
  app.initTopbar = () => {
    const modeBox = ui.$('mode');
    if (modeBox) initMode(modeBox);
    typebar = ui.$('typebar');
    filterBtn = ui.$('filterBtn');
    if (filterBtn) {
      filterN = filterBtn.querySelector('.topbar__n');
      filterBtn.addEventListener('click', () => { JN.sfx('tap'); app.openFilter(); });
    }
    app.syncTopbar();
  };
  app.syncTopbar = () => { paintMode(); paintTypebar(); paintFilterBtn(); };

  /* ================= 救场（SPEC 2.6） ================= */
  const R = { el: null, layer: null, scene: '', queue: [], card: null, total: 0 };
  function rescueRefill() {
    const list = S.rescueList(R.scene || null);
    R.total = list.length;
    R.queue = U.shuffle(list);
    if (R.card && R.queue.length > 1 && R.queue[0] === R.card) R.queue.push(R.queue.shift());   // 别紧接着又抽到同一张
  }
  function rescuePaint() {
    U.clear(R.stage);
    const c = R.card;
    R.go.hidden = !c;
    R.next.hidden = R.total < 2;
    if (!c) {
      R.stage.appendChild(ui.empty(R.scene ? '「' + R.scene + '」里暂时没有救场卡片' : '还没有救场卡片', R.scene ? '换个场景，或者选「不限」。' : '内容装进来以后这里就有了。'));
      return;
    }
    const t = JN.typeOf(c.type);
    const mins = S.minsLabel(c.mins);
    R.stage.appendChild(U.el('article.rcard.jn-pop', { attrs: { 'data-type': c.type, 'data-id': c.id }, on: { click: rescuePick } }, [
      U.el('div.rcard__bg'),
      c.art && U.hasSymbol('art-' + c.art) ? U.art(c.art, 'rcard__art') : null,
      U.el('div.rcard__meta', [
        U.el('span.jn-badge', [ui.typeIcon(c.type), U.el('span', { text: t ? t.name : c.type })]),
        c.sub ? U.el('span', { text: c.sub }) : null,
        mins ? U.el('span', { text: mins }) : null
      ]),
      U.el('h3.rcard__title', ui.words(c.title)),
      U.el('div.rcard__body', { html: JN.md(c.body) })
    ]));
  }
  function rescueNext(quiet) {
    if (!R.queue.length) rescueRefill();
    R.card = R.queue.shift() || null;
    rescuePaint();
    if (!quiet) { JN.sfx('whoosh'); JN.haptic(10); }
  }
  function rescuePick() {
    if (!R.card) return;
    const id = R.card.id;
    JN.sfx('good');
    JN.haptic(16);
    app.gotoCard(id);            // 关掉浮层、回到卡片流、跳到这一张
  }
  function rescueBuild() {
    const items = [{ value: '', label: '不限' }].concat(JN.SCENES.filter((s) => s.id !== '救场').map((s) => ({ value: s.id, label: s.id, icon: ui.sceneIcon(s.id) })));
    R.chips = ui.chips(items, '', false, (v) => { R.scene = v; R.card = null; rescueRefill(); rescueNext(true); });
    R.chips.el.classList.add('rescue__scenes');
    R.stage = U.el('div.rescue__stage');
    R.go = btn('jn-btn.jn-btn--lg.rescue__go', '就这个', 'check', rescuePick);
    R.next = btn('jn-btn.jn-btn--ghost.jn-btn--lg.rescue__next', '换一个', 'dice', () => rescueNext(false));
    R.el = U.el('section.overlay.rescue', { attrs: { hidden: '', role: 'dialog', 'aria-modal': 'true', 'aria-label': '救场', tabindex: '-1' } }, [
      U.el('header.overlay__head', [
        U.el('h2.overlay__title', [ui.icon('rescue'), U.el('span', { text: '救场' })]),
        U.el('span.overlay__sub', { text: '冷场了？先来这张' }),
        closeBtn(() => ui.layers.close(R.layer))
      ]),
      R.chips.el,
      R.stage,
      U.el('div.rescue__btns', [R.next, R.go])
    ]);
    ui.host().appendChild(R.el);
  }
  /** 打开救场：全部同步完成，点下去就有一张 */
  app.openRescue = (scene) => {
    if (!R.el) rescueBuild();
    if (R.layer) return;
    R.scene = scene && JN.SCENES.some((s) => s.id === scene && s.id !== '救场') ? scene : '';
    R.chips.set(R.scene);
    R.card = null;
    rescueRefill();
    rescueNext(true);
    R.el.hidden = false;
    R.layer = ui.layers.open({ name: 'rescue', close() { R.el.hidden = true; R.layer = null; R.card = null; U.clear(R.stage); } });
    JN.sfx('whoosh');
    JN.haptic(14);
  };
  app.prepareRescue = () => { if (!R.el) rescueBuild(); };

  /* ================= 舞台 ================= */
  const ST = { el: null, layer: null, inst: null, card: null, def: null, wake: null };
  function wakeOn() {
    // 屏幕常亮：能要到就要，要不到就算了
    try {
      if (!navigator.wakeLock || document.visibilityState !== 'visible' || ST.wake) return;
      navigator.wakeLock.request('screen').then((lock) => {
        if (!ST.layer) { lock.release().catch(() => {}); return; }
        ST.wake = lock;
        lock.addEventListener('release', () => { if (ST.wake === lock) ST.wake = null; });
      }).catch(() => {});
    } catch (e) { /* noop */ }
  }
  function wakeOff() {
    try { if (ST.wake) ST.wake.release().catch(() => {}); } catch (e) { /* noop */ }
    ST.wake = null;
  }
  document.addEventListener('visibilitychange', () => { if (ST.layer && document.visibilityState === 'visible') wakeOn(); });
  function stageBuild() {
    ST.name = U.el('h2.stage__name');
    ST.rules = btn('jn-btn.jn-btn--ghost.jn-btn--sm.stage__rules', '规则', 'info', () => {
      if (!ST.def || !ST.def.rules) return;
      JN.sfx('tap');
      ui.sheet({ title: (ST.def.name || '') + ' · 规则', name: 'rules', body: [U.el('p.prose.prose--rules', { text: ST.def.rules })] });
    });
    ST.root = U.el('div.stage__root');
    ST.el = U.el('section.overlay.stage', { attrs: { hidden: '', role: 'dialog', 'aria-modal': 'true', 'aria-label': '舞台', tabindex: '-1' } }, [
      U.el('header.stage__bar', [
        U.el('button.stage__close', { attrs: { type: 'button', 'aria-label': '关闭' }, on: { click: () => ui.layers.close(ST.layer) } }, [ui.icon('close'), U.el('span.stage__close-txt', { text: '关闭' })]),
        ST.name,
        ST.rules
      ]),
      ST.root
    ]);
    ui.host().appendChild(ST.el);
  }
  function stageTeardown() {
    if (ST.inst) { ST.inst.destroy(); ST.inst = null; }
    ST.el.hidden = true;
    ST.el.removeAttribute('data-widget');
    ST.layer = null;
    ST.card = null;
    ST.def = null;
    wakeOff();
  }
  /** 进舞台。cardId 那张卡片的参数传给组件；只给 widgetId（工具箱）时用空参数 */
  app.openStage = (cardId, widgetId) => {
    let card = cardId ? S.byId(cardId) : null;
    if (card && (!S.visible(card) || card.format !== 'widget')) card = null;
    const wid = (card && card.widget) || widgetId;
    const def = wid && JN.widgets ? JN.widgets[wid] : null;
    if (!def) { ui.toast(cardId && !card && !widgetId ? '这张卡片现在打不开' : '这个小游戏还没装好，先换一张'); return false; }
    if (!ST.el) stageBuild();
    if (ST.layer) ui.layers.close(ST.layer);
    ST.card = card;
    ST.def = def;
    ST.name.textContent = def.name || (card ? card.title : '');
    ST.rules.hidden = !def.rules;
    ST.el.setAttribute('data-widget', wid);
    ST.el.setAttribute('aria-label', def.name || '舞台');
    ST.el.hidden = false;
    ST.layer = ui.layers.open({ name: 'stage', close: stageTeardown });
    ST.inst = JN.mountWidget(wid, ST.root, clone(card ? card.params : {}), {
      onDone(result, first) {
        // 玩完一局：这张卡片记为做过（只在第一次时轻轻说一句）
        if (!first || !ST.card) return;
        if (S.setDone(ST.card.id, true)) C.doneHint();
      }
    });
    wakeOn();
    JN.sfx('pop');
    return true;
  };
  app.stageInfo = () => (ST.layer ? { widget: ST.def && ST.def.id, card: ST.card && ST.card.id } : null);

  /* ================= 首次引导 ================= */
  function onboardFig(i) {
    const g = ui.graphic('g-onboard-' + (i + 1), 240, 180, 'onboard__g');
    if (g) return g;
    // 设计师的插图还没到：用几块色块搭一个示意
    if (i === 0) return U.el('div.ofig.ofig--cards', { attrs: { 'aria-hidden': 'true' } }, [U.el('i'), U.el('i'), U.el('i', [ui.graphic('g-logo', 120, 120)])]);
    if (i === 1) return U.el('div.ofig.ofig--mode', { attrs: { 'aria-hidden': 'true' } }, [U.el('i', { text: '我看' }), U.el('i.is-on', { text: '一起看' })]);
    return U.el('div.ofig.ofig--home', { attrs: { 'aria-hidden': 'true' } }, [U.el('i'), U.el('i'), U.el('i'), U.el('i'), U.el('i.is-on', { text: '锦囊' }), U.el('i')]);
  }
  let OB = null;
  app.openOnboarding = () => {
    if (OB) return;
    const pages = [
      { title: '冷场的时候，翻一张', text: '365 个小主意：一句说得出口的话，一道一起解的题，一个两个人就能玩的小游戏。像刷短视频那样上下滑。' },
      { title: '「我看」和「一起看」', text: '自己翻的时候用「我看」，卡片上会多一条只给你的提示。把手机递给孩子、或者放在三个人中间时，切到「一起看」，提示就藏起来了；切回来要长按。' },
      (app.env && app.env().standalone)
        ? { title: '断网也能用', text: '已经装在主屏幕上了。车上、飞机上、山里都打得开。所有记录只存在这台手机里，不上传任何东西。' }
        : { title: '装到主屏幕，断网也能用', text: '「我的」里有添加到主屏幕的步骤。装好以后，车上、飞机上、山里都打得开。所有记录只存在这台手机里。' }
    ];
    let i = 0;
    const pageEls = pages.map((p, k) => U.el('div.onboard__page', { attrs: { 'aria-hidden': String(k !== 0) } }, [
      U.el('div.onboard__fig', [onboardFig(k)]),
      U.el('h2.onboard__title', { text: p.title }),
      U.el('p.onboard__text', { text: p.text })
    ]));
    const dots = U.el('div.onboard__dots', { attrs: { 'aria-hidden': 'true' } }, pages.map(() => U.el('i')));
    const nextTxt = U.el('span');
    const next = U.el('button.jn-btn.jn-btn--lg.jn-btn--block.onboard__next', { attrs: { type: 'button' } }, [nextTxt]);
    const skip = U.el('button.onboard__skip', { text: '跳过', attrs: { type: 'button' } });
    const el = U.el('section.overlay.onboard', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': '认识一下锦囊', tabindex: '-1' } }, [
      skip, U.el('div.onboard__pages', pageEls), dots, next
    ]);
    function paint() {
      pageEls.forEach((p, k) => { p.classList.toggle('is-on', k === i); p.setAttribute('aria-hidden', String(k !== i)); });
      Array.prototype.forEach.call(dots.children, (d, k) => d.classList.toggle('is-on', k === i));
      nextTxt.textContent = i === pages.length - 1 ? '开始用' : '下一步';
      skip.hidden = i === pages.length - 1;
      el.setAttribute('data-page', String(i + 1));
    }
    function step(d) {
      const k = U.clamp(i + d, 0, pages.length - 1);
      if (k === i) return;
      i = k;
      JN.sfx('tick');
      paint();
    }
    const layer = { name: 'onboard', close() { OB = null; S.state.onboarded = true; S.save(); el.remove(); } };
    next.addEventListener('click', () => { if (i === pages.length - 1) { JN.sfx('pop'); ui.layers.close(layer); } else step(1); });
    skip.addEventListener('click', () => ui.layers.close(layer));
    // 左右滑也能翻
    let sx = null;
    el.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    el.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 44) step(dx < 0 ? 1 : -1); });
    el.addEventListener('pointercancel', () => { sx = null; });
    paint();
    ui.host().appendChild(el);
    OB = ui.layers.open(layer);
    return el;
  };
})();
