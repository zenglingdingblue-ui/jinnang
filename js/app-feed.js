/* 锦囊 · app-feed（外壳工程师 A）
 * 卡片流（SPEC 2.3），挂在 JN.feed 上。
 *   - DOM 里只留三张：上一张 / 当前 / 下一张（.is-prev / .is-cur / .is-next），翻页时轮换，不重建当前这张
 *   - 指针事件自己做拖动：明显是纵向手势才接管；松手按距离或速度吸附翻页，不够就回弹；首尾循环
 *   - 键盘 ↑ ↓ 空格 PageUp PageDown、鼠标滚轮（带防抖）
 *   - 当前卡片换了以后才挂它的组件预览，离开就销毁
 * 总线事件：'feed' { card, index, total }（当前卡片变了）
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN || !JN.card) return;
  const U = JN.util;
  const S = JN.S;
  const C = JN.card;
  const F = (JN.feed = {});

  const SLOP = 9;              // 手指移动超过这么多像素才判断方向
  const EASE = 'cubic-bezier(0.22, 0.72, 0.28, 1)';
  let root = null, track = null, emptyBox = null;
  let deck = [];
  let idx = 0;
  let slots = { prev: null, cur: null, next: null };
  let H = 0;
  let y = 0;                   // 轨道当前的纵向偏移
  let active = true;           // 卡片流是否露在最上面（没被别的页面或浮层盖住）
  let anim = null;             // 正在吸附的动画 { finish, timer }
  let g = null;                // 正在进行的手势
  let suppressClick = false;
  let pvTimer = 0;
  let todayId = null;
  let builtDay = '';

  const mod = (i, n) => ((i % n) + n) % n;
  const each = (fn) => { [slots.prev, slots.cur, slots.next].forEach((el) => { if (el) fn(el); }); };

  function setY(v) {
    y = v;
    track.style.transform = 'translate3d(0,' + v + 'px,0)';
  }
  function place(el, cls) {
    if (!el) return;
    el.classList.remove('is-prev', 'is-cur', 'is-next', 'is-fresh');
    el.classList.add(cls);
    const cur = cls === 'is-cur';
    el.inert = !cur;
    if (cur) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
  }
  function make(i, cls) {
    const n = deck.length;
    const k = mod(i, n);
    const el = C.render(deck[k], { index: k, total: n, isToday: deck[k].id === todayId });
    place(el, cls);
    track.appendChild(el);
    C.fit(el);
    return el;
  }
  function drop(el) {
    if (!el) return;
    if (el._jn) el._jn.destroy();
    el.remove();
  }

  /** 当前卡片定下来以后：预览只给当前这张，通知外面 */
  function settle() {
    clearTimeout(pvTimer);
    if (slots.prev) slots.prev._jn.unmountPreview();
    if (slots.next) slots.next._jn.unmountPreview();
    if (slots.cur && active) {
      pvTimer = setTimeout(() => { if (slots.cur && active && !(g && g.drag)) slots.cur._jn.mountPreview(); }, 260);
    }
    JN.bus.emit('feed', { card: F.current(), index: idx, total: deck.length });
  }

  function renderEmpty() {
    U.clear(emptyBox);
    const noData = !S.all.length;
    const btn = noData ? null : U.el('button.jn-btn.jn-btn--light', { text: '清掉筛选', attrs: { type: 'button' }, on: { click: () => { JN.sfx('tap'); S.resetFilter(); } } });
    emptyBox.appendChild(JN.ui.empty(
      noData ? '卡片还没装进来' : '这样筛，一张都没有',
      noData ? '内容文件没有加载到。连上网刷新一次试试。' : '放宽一点条件，或者干脆全都看。',
      btn
    ));
  }

  function build(fade) {
    stopAnim();
    each(drop);
    slots = { prev: null, cur: null, next: null };
    setY(0);
    const n = deck.length;
    emptyBox.hidden = n > 0;
    track.hidden = n === 0;
    if (!n) { idx = 0; renderEmpty(); settle(); return; }
    idx = mod(idx, n);
    slots.cur = make(idx, 'is-cur');
    if (n > 1) {
      slots.prev = make(idx - 1, 'is-prev');
      slots.next = make(idx + 1, 'is-next');
    }
    if (fade) slots.cur.classList.add('is-fresh');
    settle();
  }

  /* ---------------- 吸附动画 ---------------- */
  /** 画面上轨道此刻真正的位置（过渡进行到一半时，它和 y 不一样） */
  function visualY() {
    try { return new DOMMatrixReadOnly(getComputedStyle(track).transform).m42 || 0; } catch (e) { return y; }
  }
  /** 把正在进行的吸附立刻落定。返回落定前画面上还差多少没走完：新的一下从这里接着走，卡片就不会跳一下 */
  function stopAnim() {
    if (!anim) return 0;
    const left = anim.catchable ? visualY() - anim.target : 0;
    clearTimeout(anim.timer);
    const finish = anim.finish;
    anim = null;
    finish();
    void track.offsetHeight;          // 把「归零」这一步落实，下一段过渡才不会从半路接着跑
    return Math.abs(left) < 1 ? 0 : U.clamp(left, -H, H);
  }
  /** 接住：把轨道放回落定前的位置（此时 DOM 已经轮换过，画面看上去没有变化） */
  function resume(left) {
    if (!left || deck.length < 2) return 0;
    track.style.transition = 'none';
    setY(left);
    void track.offsetHeight;
    return left;
  }
  /** dir：+1 去下一张（轨道上移）、-1 去上一张、0 回弹。v 是松手时的速度（px/ms）。 */
  function animate(dir, v, commitFn) {
    const target = -dir * H;
    const dist = Math.abs(target - y);
    const done = () => {
      anim = null;
      track.style.transition = 'none';
      if (commitFn) commitFn(); else commit(dir);
    };
    if (JN.reduced || dist < 0.5 || !H) { done(); return; }
    const ms = Math.round(U.clamp((dist / Math.max(Math.abs(v || 0), 2)) * 1.2, 200, 360));
    anim = { finish: done, target: target, catchable: !commitFn, timer: setTimeout(() => { if (anim) { const f = anim.finish; f(); } }, ms + 90) };
    track.style.transition = 'transform ' + ms + 'ms ' + EASE;
    setY(target);
  }
  function commit(dir) {
    setY(0);
    const n = deck.length;
    if (!dir || n < 2) return;
    if (dir > 0) {
      drop(slots.prev);
      slots.prev = slots.cur;
      slots.cur = slots.next;
      idx = mod(idx + 1, n);
      place(slots.prev, 'is-prev');
      place(slots.cur, 'is-cur');
      slots.next = make(idx + 1, 'is-next');
    } else {
      drop(slots.next);
      slots.next = slots.cur;
      slots.cur = slots.prev;
      idx = mod(idx - 1, n);
      place(slots.next, 'is-next');
      place(slots.cur, 'is-cur');
      slots.prev = make(idx - 1, 'is-prev');
    }
    settle();
  }
  /** 跳到牌序里的第 target 张。带动画时把它临时放进「下一张」的位置滑上来。 */
  function jump(target, withAnim) {
    const n = deck.length;
    if (!n) return;
    target = mod(target, n);
    stopAnim();
    if (target === idx && slots.cur) return;
    if (!withAnim || JN.reduced || n < 2 || !active || !H || !slots.cur) { idx = target; build(true); return; }
    drop(slots.next);
    slots.next = make(target, 'is-next');
    animate(1, 0, () => {
      setY(0);
      drop(slots.prev);
      drop(slots.cur);
      idx = target;
      slots.cur = slots.next;
      place(slots.cur, 'is-cur');
      slots.prev = make(idx - 1, 'is-prev');
      slots.next = make(idx + 1, 'is-next');
      settle();
    });
  }

  /* ---------------- 手势 ---------------- */
  function onDown(e) {
    if (g || !active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const base = resume(stopAnim());                 // 上一张还没滑到位就又按下来：接住它
    suppressClick = Math.abs(base) > 10;             // 接住滑动中的卡片，这一下不算点击
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, dead: false, off: 0, base: base, pts: [{ t: e.timeStamp, y: e.clientY }] };
  }
  function onMove(e) {
    if (!g || e.pointerId !== g.id || g.dead) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.drag) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ay > SLOP && ay > ax * 1.25) {              // 明显是纵向：接管
        g.drag = true;
        g.off = dy > 0 ? SLOP : -SLOP;
        suppressClick = true;
        root.classList.add('is-dragging');
        track.style.transition = 'none';
        try { root.setPointerCapture(g.id); } catch (err) { /* noop */ }
      } else if (ax > SLOP * 1.6 && ax >= ay) { g.dead = true; return; }   // 横向手势不处理
      else return;
    }
    let d = dy - g.off + g.base;
    d = deck.length < 2 ? d * 0.28 : U.clamp(d, -H, H);     // 只有一张：拉得动，拉不走
    setY(d);
    g.pts.push({ t: e.timeStamp, y: e.clientY });
    if (g.pts.length > 8) g.pts.shift();
  }
  function onUp(e) {
    if (!g || e.pointerId !== g.id) return;
    const was = g;
    g = null;
    if (!was.drag) {
      if (y !== 0) animate(0, 0);                    // 只是按了一下接住的卡片：让它走完
      return;
    }
    root.classList.remove('is-dragging');
    try { root.releasePointerCapture(was.id); } catch (err) { /* noop */ }
    setTimeout(() => { suppressClick = false; }, 80);
    const cancelled = e.type === 'pointercancel';
    // 松手速度：最后 110 毫秒里的位移；手指停住再抬起就算 0
    const pts = was.pts;
    const last = pts[pts.length - 1];
    let first = last;
    for (let i = pts.length - 1; i >= 0 && last.t - pts[i].t <= 110; i--) first = pts[i];
    let v = 0;
    if (!cancelled && e.timeStamp - last.t < 90 && last.t > first.t) v = (last.y - first.y) / (last.t - first.t);
    // 去哪一张：先看这一下甩得快不快，再看拖了多远
    const own = y - was.base;                        // 这一下手指自己带来的位移（不含接住时还差的那段）
    let dir = 0;
    if (deck.length > 1 && !cancelled) {
      if (v < -0.45) dir = own > 16 ? 0 : 1;         // 往上甩：下一张（先往下拖再甩回来，算反悔）
      else if (v > 0.45) dir = own < -16 ? 0 : -1;   // 往下甩：上一张
      else if (Math.abs(own) < 16) dir = 0;          // 几乎没动：留在这一张
      else if (y < -H * 0.22) dir = 1;               // 慢慢拖：过了 22% 就翻过去
      else if (y > H * 0.22) dir = -1;
    }
    animate(dir, v);
  }

  let wheelLock = 0, wheelLast = 0, wheelAbs = 0;
  function onWheel(e) {
    e.preventDefault();
    if (!active || e.ctrlKey) return;
    const now = e.timeStamp;
    const abs = Math.abs(e.deltaY) * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1);
    // 触控板松手后的惯性：事件一个接一个、越来越小。只有隔了一会儿，或者明显又加了力，才算新的一下
    const fresh = now - wheelLast > 70 || abs > wheelAbs * 1.4 + 3 || abs >= 90;
    wheelLast = now;
    wheelAbs = abs;
    if (abs < 6 || Math.abs(e.deltaX) > Math.abs(e.deltaY) || now < wheelLock || !fresh) return;
    wheelLock = now + 520;
    F.go(e.deltaY > 0 ? 1 : -1);
  }
  function onKey(e) {
    if (!active || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
    else if (e.key === ' ' || e.code === 'Space') {
      if (tag === 'BUTTON' || tag === 'A') return;      // 焦点在按钮上：空格是「按下它」
      dir = e.shiftKey ? -1 : 1;
    }
    if (!dir) return;
    e.preventDefault();
    if (e.repeat && anim) return;                        // 按住不放：一张一张来
    F.go(dir);
  }

  function measure() { H = root.clientHeight || window.innerHeight || 0; }
  function refitAll() {
    each((el) => C.fit(el));
    if (slots.cur && active && !anim && !g) slots.cur._jn.mountPreview();
  }

  /* ---------------- 对外 ---------------- */
  F.init = (rootEl) => {
    root = rootEl;
    track = root.querySelector('.feed__track') || root.appendChild(U.el('div.feed__track'));
    emptyBox = root.querySelector('.feed__empty') || root.appendChild(U.el('div.feed__empty', { attrs: { hidden: '' } }));
    measure();
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('click', (e) => {              // 拖动过，就不算点击
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('dragstart', (e) => e.preventDefault());
    track.addEventListener('transitionend', (e) => {
      if (e.target !== track || e.propertyName !== 'transform' || !anim) return;
      clearTimeout(anim.timer);
      const finish = anim.finish;
      finish();
    });
    document.addEventListener('keydown', onKey);
    const onResize = U.debounce(() => { measure(); refitAll(); }, 120);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    JN.bus.on('records', () => each((el) => el._jn.sync()));
  };

  /** 按 store 里当前的模式和筛选重排。尽量留在原来那张；它不在了，就顺着旧牌序往后找第一张还在的。 */
  F.reload = (opt) => {
    opt = opt || {};
    const old = deck;
    const oldIdx = idx;
    const next = S.deck();
    let target = -1;
    if (opt.toId) target = next.indexOf(S.byId(opt.toId));
    if (target < 0 && !opt.top) {
      for (let k = 0; k < old.length && target < 0; k++) target = next.indexOf(old[mod(oldIdx + k, old.length)]);
    }
    deck = next;
    idx = target < 0 ? 0 : target;
    const t = S.today();
    todayId = t ? t.id : null;
    builtDay = S.dayKey();
    if (root) { measure(); build(opt.fade !== false); }
  };
  /** 过了零点再回来：换成新一天的牌序，从今日锦囊开始（筛选也清掉，和重新打开应用一样） */
  F.checkDay = () => {
    if (!builtDay || builtDay === S.dayKey()) return false;
    if (S.filterActive()) S.resetFilter();
    F.reload({ top: true });
    return true;
  };
  F.current = () => (deck.length ? deck[idx] : null);
  F.index = () => idx;
  F.total = () => deck.length;
  F.has = (id) => deck.indexOf(S.byId(id)) >= 0;
  F.go = (dir) => {
    if (!root || deck.length < 2) return;
    resume(stopAnim());
    animate(dir > 0 ? 1 : -1, 0);
  };
  F.jumpToId = (id, withAnim) => {
    const i = deck.indexOf(S.byId(id));
    if (i < 0) return false;
    jump(i, !!withAnim);
    return true;
  };
  /** 换一张：随机跳到另一张 */
  F.shuffle = () => {
    const n = deck.length;
    if (n < 2) { JN.toast(n ? '符合条件的只有这一张' : '没有可换的卡片'); return; }
    let t = idx;
    while (t === idx) t = U.randInt(0, n - 1);
    JN.sfx('whoosh');
    jump(t, true);
  };
  /** 卡片流被别的页面或浮层盖住时停掉预览和手势，露出来再恢复 */
  F.setActive = (on) => {
    on = !!on;
    if (on === active) return;
    active = on;
    clearTimeout(pvTimer);
    if (!on) {
      root.classList.remove('is-dragging');
      g = null;
      stopAnim();
      track.style.transition = 'none';
      setY(0);
      each((el) => el._jn.unmountPreview());
    } else {
      measure();
      refitAll();
    }
  };
  F.refit = () => { if (root) { measure(); refitAll(); } };
  /** 给自测用：现在 DOM 里三张卡片的 id */
  F.peek = () => ({
    prev: slots.prev ? slots.prev._jn.card.id : null,
    cur: slots.cur ? slots.cur._jn.card.id : null,
    next: slots.next ? slots.next._jn.card.id : null,
    count: track ? track.children.length : 0,
    y: y,
    busy: !!anim
  });
  F.finish = () => stopAnim();
})();
