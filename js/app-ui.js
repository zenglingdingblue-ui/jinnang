/* 锦囊 · app-ui（外壳工程师 A）
 * 外壳的公共界面零件，挂在 JN.ui 上：
 *   icon / graphic   图标与品牌图形（雪碧图里没有时给得体的退路）
 *   words            把一段中文切成词，每个词包进不换行的 span（标题折行时不把一个词拆到两行）
 *   toast / banner   轻提示（覆盖 core 里的 JN.toast，放进应用这一栏里）
 *   layers           浮层栈：每开一层 pushState 一次，返回键逐层关闭
 *   sheet            底部抽屉
 *   copy / share     复制与分享
 *   row / toggle / empty / section   列表零件
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN || !JN.S) return;
  const U = JN.util;
  const S = JN.S;
  const ui = (JN.ui = {});
  const $ = (id) => document.getElementById(id);
  ui.$ = $;
  ui.host = () => $('layers') || document.body;

  /* ---------------- 图标与图形 ---------------- */
  const GLYPH = {
    close: '✕', back: '‹', heart: '♡', 'heart-fill': '♥', check: '✓', 'check-fill': '✓', share: '↗', dice: '↻',
    'chevron-right': '›', 'chevron-down': '▾', 'chevron-up': '▴', plus: '+', minus: '−', refresh: '↻', link: '↗'
  };
  /** 雪碧图里有这个图标就用它；没有就退到一个字符；连字符也没有就返回 null（按钮上还有文字和 aria-label） */
  ui.icon = (name, cls) => {
    if (U.hasSymbol('i-' + name)) return U.icon(name, cls);
    if (!GLYPH[name]) return null;
    const s = U.el('span.ic-fb', { text: GLYPH[name], attrs: { 'aria-hidden': 'true' } });
    if (cls) s.classList.add(cls);
    return s;
  };
  /** 品牌图形（#g-logo、#g-onboard-1 …）。设计师还没交付时返回 null，由调用方给退路 */
  ui.graphic = (id, w, h, cls) => {
    if (!U.hasSymbol(id)) return null;
    const s = U.svg('svg', { class: 'jn-graphic' + (cls ? ' ' + cls : ''), viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true' });
    s.appendChild(U.svg('use', { href: '#' + id }));
    return s;
  };
  ui.typeIcon = (typeId, cls) => (U.hasSymbol('i-t-' + typeId) ? U.icon('t-' + typeId, cls) : null);
  ui.sceneIcon = (scene, cls) => {
    const sc = JN.SCENES.filter((s) => s.id === scene)[0];
    return sc && U.hasSymbol(sc.icon) ? U.icon(sc.icon, cls) : null;
  };

  /* ---------------- 按词换行 ----------------
   * 标题折行时不把一个词拆到两行：用 Intl.Segmenter 切词，每个词包进 <span class="word">（white-space: nowrap）。
   *   - 标点跟着前一个词，不会落到行首；左括号、左引号跟着后一个词，不会落到行尾
   *   - 数字和它后面的量词粘在一起（「3 秒」「24 小时」）；句末的「吗？」「了，」跟着前一个词
   *   - 太长的一截（比如一串数字）不包，照常可以折
   * 浏览器没有 Intl.Segmenter 时原样返回文字，和以前一样由浏览器自己折行。 */
  let segmenter = null;
  try { if (window.Intl && Intl.Segmenter) segmenter = new Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) { segmenter = null; }
  const OPENERS = '（〔［｛「『“‘《〈【([{';
  const DIGIT_END = /[0-9０-９]$/;
  const DIGIT_START = /^[0-9０-９]/;
  const TAIL = /^[吗呢吧啊呀嘛么的了][，。？！、；：…—,.?!;:]*$/;
  const MAX_WORD = 6;                 // 一个不换行的词最多占几个汉字宽
  /** 一段文字大约占几个汉字宽（汉字 1，字母数字 0.56，空格 0.3） */
  ui.textWidth = (str) => {
    let n = 0;
    for (const ch of String(str)) n += /\s/.test(ch) ? 0.3 : ch.charCodeAt(0) > 0x2e7f ? 1 : 0.56;
    return n;
  };
  ui.wordTokens = (text) => {
    const out = [];
    for (const seg of segmenter.segment(text)) {
      const t = seg.segment;
      const last = out[out.length - 1];
      const prev = last && !last.space ? last : null;
      if (/^\s+$/.test(t)) {
        if (prev && DIGIT_END.test(prev.t)) { prev.t += t; prev.glue = true; }        // 数字后面的空格：把后面的量词粘过来
        else out.push({ space: true, t: t });
      } else if (seg.isWordLike) {
        if (prev && (prev.glue || (DIGIT_END.test(prev.t) && !DIGIT_START.test(t)))) { prev.t += t; prev.glue = false; }
        else out.push({ t: t });
      } else if (OPENERS.indexOf(t) >= 0) {
        out.push({ t: t, glue: true });                                               // 左括号、左引号：跟着后一个词
      } else if (prev) {
        prev.t += t;                                                                  // 其余标点：跟着前一个词
        prev.glue = false;
      } else out.push({ t: t });
    }
    for (let i = out.length - 1; i > 0; i--) {                                        // 句末的语气词连同标点并到前一个词上
      const cur = out[i], before = out[i - 1];
      if (cur.space || before.space || !TAIL.test(cur.t)) continue;
      if ((cur.t.length > 1 || i === out.length - 1) && ui.textWidth(before.t + cur.t) <= MAX_WORD) { before.t += cur.t; out.splice(i, 1); }
    }
    return out;
  };
  /** words('冬天地球离太阳更远吗？') -> 可以直接当 U.el 子节点用的数组 */
  ui.words = (text) => {
    const str = String(text == null ? '' : text);
    if (!segmenter || !str) return [str];
    let tokens;
    try { tokens = ui.wordTokens(str); } catch (e) { return [str]; }
    return tokens.map((k) => (k.space || ui.textWidth(k.t) > MAX_WORD ? k.t : U.el('span.word', { text: k.t })));
  };

  /* ---------------- toast 与横幅 ---------------- */
  function toastHost() {
    let host = $('toasts');
    if (!host) { host = U.el('div#toasts'); (document.getElementById('app') || document.body).appendChild(host); }
    return host;
  }
  ui.toast = (msg, ms) => {
    if (!msg) return;
    const host = toastHost();
    while (host.children.length >= 2) host.removeChild(host.firstChild);
    const t = U.el('div.jn-toast', { text: String(msg), attrs: { role: 'status' } });
    host.appendChild(t);
    const life = ms || Math.min(4200, 1500 + String(msg).length * 70);
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, life + 350);
  };
  JN.toast = ui.toast;
  /** 一条常驻、可点的横幅（「有新内容，点这里更新」） */
  ui.banner = (text, onClick) => {
    const old = $('banner');
    if (old) old.remove();
    const b = U.el('button#banner.banner', { attrs: { type: 'button' }, on: { click: () => { b.remove(); onClick(); } } }, [ui.icon('refresh'), U.el('span', { text: text })]);
    (document.getElementById('app') || document.body).appendChild(b);
    return b;
  };

  /* ---------------- 浮层栈与返回键 ----------------
   * 每开一层 pushState({jn: 层数})。用户按返回键 → popstate → 把多出来的层关掉。
   * 界面上点关闭 → 先把界面关掉，再 history.go(-n) 把那几条历史消掉；
   * 在这次回退落地之前新开的层先排队，免得和回退抢跑。 */
  const stack = [];
  const queue = [];
  let pending = 0;
  let pendTimer = 0;
  function changed() { JN.bus.emit('layers', stack.length); }
  function closeDown(depth, reason) {
    let n = 0;
    while (stack.length > depth) {
      const l = stack.pop();
      n++;
      try { if (l.close) l.close(reason); } catch (e) { console.error(e); }
      try { if (l.prevFocus && l.prevFocus.isConnected && reason !== 'route') l.prevFocus.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    if (n) changed();
  }
  function settle() {
    pending = 0;
    clearTimeout(pendTimer);
    queue.splice(0, queue.length).forEach((q) => ui.layers.open(q));
  }
  function back(n) {
    if (n <= 0) return;
    pending++;
    clearTimeout(pendTimer);
    pendTimer = setTimeout(settle, 500);
    try { window.history.go(-n); } catch (e) { settle(); }
  }
  window.addEventListener('popstate', (e) => {
    const depth = (e.state && e.state.jn) | 0;
    if (pending > 0) pending--;
    if (stack.length > depth) closeDown(depth, 'back');
    else if (depth > stack.length && !pending) { back(depth - stack.length); return; }   // 前进到了已经关掉的层：退回来
    if (!pending) settle();
  });
  ui.layers = {
    /** layer: { name, close(reason) }。close 只负责把界面收起来 */
    open(layer) {
      if (pending > 0) { queue.push(layer); return layer; }
      layer.prevFocus = document.activeElement;
      stack.push(layer);
      try { window.history.pushState({ jn: stack.length }, ''); } catch (e) { /* 没有 history 也照常用 */ }
      changed();
      return layer;
    },
    /** 关掉这一层以及它上面的所有层；不传就关最上面一层 */
    close(layer) {
      const i = layer ? stack.indexOf(layer) : stack.length - 1;
      if (i < 0) {
        const q = layer ? queue.indexOf(layer) : -1;
        if (q >= 0) { queue.splice(q, 1); try { layer.close('ui'); } catch (e) { console.error(e); } }
        return;
      }
      const n = stack.length - i;
      closeDown(i, 'ui');
      back(n);
    },
    closeAll() { if (stack.length) ui.layers.close(stack[0]); },
    /** 路由重置：把所有层的界面关掉，不动 history */
    reset() { queue.splice(0, queue.length); closeDown(0, 'route'); },
    depth: () => stack.length,
    top: () => stack[stack.length - 1] || null,
    find: (name) => stack.filter((l) => l.name === name)[0] || null
  };
  try { window.history.replaceState({ jn: 0 }, ''); } catch (e) { /* noop */ }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); ui.layers.close(); }
  });

  /* ---------------- 抽屉 ---------------- */
  function dragDown(handle, panel, done) {
    let pid = null, y0 = 0, dy = 0, t0 = 0;
    handle.addEventListener('pointerdown', (e) => {
      if (pid != null || (e.target.closest && e.target.closest('button'))) return;
      pid = e.pointerId; y0 = e.clientY; dy = 0; t0 = performance.now();
      try { handle.setPointerCapture(pid); } catch (err) { /* noop */ }
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.transition = 'none';
      panel.style.transform = 'translate3d(0,' + dy + 'px,0)';
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const v = dy / Math.max(1, performance.now() - t0);
      panel.style.transition = '';
      if (dy > 90 || (dy > 24 && v > 0.5)) done();
      else panel.style.transform = '';
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  /** sheet({ title, body, foot, cls, name, onClose }) -> { el, body, close() } */
  ui.sheet = (opt) => {
    opt = opt || {};
    let closed = false;
    const api = { close: () => ui.layers.close(layer) };
    const body = U.el('div.sheet__body');
    U.append(body, opt.body);
    const head = U.el('div.sheet__head', [
      U.el('span.sheet__grab', { attrs: { 'aria-hidden': 'true' } }),
      U.el('h3.sheet__title', { text: opt.title || '' }),
      U.el('button.sheet__close', { attrs: { type: 'button', 'aria-label': '关闭' }, on: { click: () => api.close() } }, [ui.icon('close')])
    ]);
    const panel = U.el('div.sheet__panel', { attrs: { tabindex: '-1' } }, [head, body, opt.foot ? U.el('div.sheet__foot', opt.foot) : null]);
    const el = U.el('div.sheet', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opt.title || '抽屉' } }, [
      U.el('div.sheet__scrim', { on: { click: () => api.close() } }),
      panel
    ]);
    if (opt.cls) el.classList.add(opt.cls);
    const layer = {
      name: opt.name || 'sheet',
      close() {
        if (closed) return;
        closed = true;
        el.classList.add('is-closing');
        setTimeout(() => el.remove(), JN.reduced ? 0 : 230);
        if (opt.onClose) opt.onClose();
      }
    };
    ui.host().appendChild(el);
    ui.layers.open(layer);
    dragDown(head, panel, api.close);
    try { panel.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    api.el = el;
    api.body = body;
    api.panel = panel;
    return api;
  };

  /* ---------------- 复制与分享 ----------------
   * 三级退路：系统分享（Web Share）→ 写剪贴板 → 把文字摆出来让人自己拷。
   * 剪贴板在 iOS 上只认「用户刚刚亲手点的那一下」：等过一次 await 再去写多半被拒绝。
   * 所以最后一级的抽屉里有一个「复制」按钮——那是一次新的点击，在它的回调里同步去写，主屏幕全屏窗口里也成立；
   * 连这个也不行，文字是摆在那里可以长按选中的，不依赖任何接口。 */
  /** 老办法：把文字放进一个文本框，选中，execCommand('copy')。必须在点击的回调里同步调用。 */
  function legacyCopy(text, field) {
    let ta = field;
    try {
      if (!ta) {
        ta = U.el('textarea', { attrs: { readonly: '', 'aria-hidden': 'true', tabindex: '-1' } });
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-999px;top:0;width:10px;height:10px;opacity:0;font-size:16px';
        document.body.appendChild(ta);
      }
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);       // iOS 上 select() 不够，要再明确设一次选区
      return !!document.execCommand('copy');
    } catch (e) { return false; }
    finally { if (ta && ta !== field) ta.remove(); }
  }
  ui.copy = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 继续试老办法 */ }
    return legacyCopy(text);
  };
  /** 复制也失败时的最后退路：把文字摆出来、选中，再给一个亲手点的「复制」按钮 */
  ui.selectSheet = (text) => {
    const ta = U.el('textarea.sharebox', { attrs: { readonly: '', rows: '7', 'aria-label': '要分享的文字' } });
    ta.value = text;
    const pick = () => { try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, text.length); } catch (e) { /* noop */ } };
    ta.addEventListener('focus', pick);
    ta.addEventListener('click', pick);
    const done = () => { ui.toast('已复制，去粘贴给想分享的人'); sh.close(); };
    const btn = U.el('button.jn-btn.jn-btn--block.sharebox__copy', { attrs: { type: 'button' }, on: { click: () => {
      // 这一下是亲手点的：先同步试老办法，再试剪贴板接口；都不行就把文字选中，让人长按拷贝
      if (legacyCopy(text, ta)) { done(); return; }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, pick); return; }
      } catch (e) { /* noop */ }
      pick();
      ui.toast('文字已经选中，长按它，选「拷贝」');
    } } }, [ui.icon('link'), U.el('span', { text: '复制' })]);
    const sh = ui.sheet({
      title: '复制这段文字', name: 'share',
      body: [U.el('p.jn-muted', { text: '没能自动复制。点下面的「复制」；还不行的话，长按这段文字，选「拷贝」。' }), ta],
      foot: btn
    });
    setTimeout(pick, 60);
    return sh;
  };
  ui.share = async (card) => {
    const text = S.shareText(card);
    if (navigator.share) {
      try { await navigator.share({ text: text }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    if (await ui.copy(text)) { ui.toast('已复制，去粘贴给想分享的人'); return 'copied'; }
    ui.selectSheet(text);
    return 'select';
  };

  /* ---------------- 列表零件 ---------------- */
  ui.section = (title, children, cls) => {
    const sec = U.el('section.sec', [title ? U.el('h2.sec__title', { text: title }) : null]);
    if (cls) sec.classList.add(cls);
    U.append(sec, children);
    return sec;
  };
  ui.empty = (title, text, action) =>
    U.el('div.empty', [
      U.el('div.empty__mark', { attrs: { 'aria-hidden': 'true' } }, [ui.graphic('g-logo', 120, 120) || U.el('span.empty__dot')]),
      U.el('p.empty__title', { text: title }),
      text ? U.el('p.empty__text', { text: text }) : null,
      action || null
    ]);
  ui.cardSub = (c) => {
    const t = JN.typeOf(c.type);
    return [t ? t.name : '', c.sub || '', S.minsLabel(c.mins)].filter(Boolean).join(' · ');
  };
  /** 一行卡片：点主体跳到那张卡片；可带一个右侧的小按钮 */
  ui.cardRow = (c, opt) => {
    opt = opt || {};
    const row = U.el('div.crow', { attrs: { 'data-type': c.type, 'data-id': c.id } }, [
      U.el('button.crow__main', { attrs: { type: 'button' }, on: { click: () => opt.onClick && opt.onClick(c) } }, [
        U.el('span.crow__dot', { attrs: { 'aria-hidden': 'true' } }, [ui.typeIcon(c.type)]),
        U.el('span.crow__txt', [
          U.el('span.crow__title', { text: c.title }),
          U.el('span.crow__sub', { text: opt.sub || ui.cardSub(c) })
        ]),
        opt.act ? null : ui.icon('chevron-right', 'crow__go')
      ])
    ]);
    if (opt.act) row.appendChild(opt.act);
    return row;
  };
  /** 开关行：toggle('音效', '操作时的小声音', true, fn) */
  ui.toggle = (title, desc, on, onChange) => {
    const btn = U.el('button.row.row--switch', { attrs: { type: 'button', role: 'switch', 'aria-checked': String(!!on) } }, [
      U.el('span.row__txt', [U.el('span.row__title', { text: title }), desc ? U.el('span.row__desc', { text: desc }) : null]),
      U.el('span.switch', { attrs: { 'aria-hidden': 'true' } }, [U.el('i')])
    ]);
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(v));
      onChange(v);
    });
    return btn;
  };
  /** 一组可选的小标签。multi=false 时单选。返回 { el, get(), set(v) } */
  ui.chips = (items, value, multi, onChange) => {
    let val = multi ? (value || []).slice() : value;
    const el = U.el('div.chips', { attrs: { role: 'group' } });
    const paint = () => {
      Array.prototype.forEach.call(el.children, (b) => {
        const v = b._v;
        const on = multi ? val.indexOf(v) >= 0 : val === v;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    items.forEach((it) => {
      const b = U.el('button.jn-chip', { attrs: { type: 'button' } }, [it.icon || null, U.el('span', { text: it.label })]);
      b._v = it.value;
      b.addEventListener('click', () => {
        if (multi) { const i = val.indexOf(it.value); if (i >= 0) val.splice(i, 1); else val.push(it.value); }
        else val = it.value;
        paint();
        JN.sfx('tick');
        if (onChange) onChange(multi ? val.slice() : val);
      });
      el.appendChild(b);
    });
    paint();
    return { el: el, get: () => (multi ? val.slice() : val), set: (v) => { val = multi ? (v || []).slice() : v; paint(); } };
  };
})();
