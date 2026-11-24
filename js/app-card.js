/* 锦囊 · app-card（外壳工程师 A）
 * 一张卡片的 DOM（SPEC 2.4 的约定）和六种形态的玩法（SPEC 2.5），挂在 JN.card 上。
 *   JN.card.render(card, { index, total, isToday }) -> <article class="card">，el._jn 上有：
 *       sync()            收藏 / 做过 状态变了，刷新右侧按钮
 *       refit()           重新量一遍，保证一屏放得下
 *       mountPreview() / unmountPreview()   组件预览（只有当前这张才挂）
 *       destroy()
 *   JN.card.fit(el)       逐级收紧（data-fit="0…7"），放不下的长文字截断并露出「展开全文」
 *   JN.card.openFull / openSteps / openRefs   卡片用到的三个抽屉
 * 卡片里的字全部来自 JSON：一律 textContent 或 JN.md()。
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN || !JN.ui) return;
  const U = JN.util;
  const S = JN.S;
  const ui = JN.ui;
  const C = (JN.card = {});
  const MAX_FIT = 7;
  const KEYS = 'ABCD';

  function button(spec, label, icon, onClick, attrs) {
    return U.el('button.' + spec, { attrs: Object.assign({ type: 'button' }, attrs || {}), on: { click: onClick } }, [
      icon ? ui.icon(icon) : null,
      U.el('span', { text: label })
    ]);
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (e) { return {}; } }

  /** 标题越短字越大。按「占几个汉字宽」分六档：1–3 档一行放下（≤5、≤6、≤7 字），4–6 档两行（≤10、≤14、更长） */
  function titleLevel(s) {
    const n = ui.textWidth(s);
    return n <= 5 ? 1 : n <= 6 ? 2 : n <= 7 ? 3 : n <= 10 ? 4 : n <= 14 ? 5 : 6;
  }
  /** 每一档标题预想占几行。标题按词折行以后偶尔会多折一行，那就换小一档（见 C.fit） */
  const TL_LINES = [0, 1, 1, 1, 2, 2, 3];
  function titleLines(title) {
    const cs = getComputedStyle(title);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.15 || 1;
    return Math.round(title.offsetHeight / lh);
  }

  /** 第一次记「做过」时说一句它去了哪儿 */
  C.doneHint = () => {
    if (S.state.doneHinted) return;
    S.state.doneHinted = true;
    S.save();
    ui.toast('记下了。做过的都收在「收藏」页的「做过」里');
  };

  /* ---------------- 一屏放下 ---------------- */
  function markClamps(el) {
    const boxes = el.querySelectorAll('.card__clamp');
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      let cut = false;
      for (let k = 0; k < box.children.length; k++) {
        const t = box.children[k];
        if (t.classList.contains('card__text') && t.scrollHeight > t.clientHeight + 1) cut = true;
      }
      const more = box.querySelector(':scope > .card__expand');
      if (more) more.hidden = !cut;
    }
  }
  /** 贴纸让路（DESIGN.md 第 7 节）：文字蹭到贴纸了，先把贴纸缩小（最多缩到六成）；还躲不开，才让它退成水印。
   *  贴纸钉在右上角，缩小时上边和右边不动。判定时贴纸四周各让出 8%。 */
  function fitArt(el, jn) {
    el.style.removeProperty('--jn-art-size');
    el.classList.remove('is-crowded');
    const a = jn.art.getBoundingClientRect();
    if (a.width < 8) return;
    const rects = [];
    const range = document.createRange();
    range.selectNodeContents(jn.title);
    rects.push(range.getBoundingClientRect());
    for (let n = jn.title.nextElementSibling; n; n = n.nextElementSibling) {
      if (n !== jn.rail && n !== jn.foot) rects.push(n.getBoundingClientRect());
    }
    const hits = (k) => {
      const w = a.width * k, h = a.height * k;
      const left = a.right - w + w * 0.08, right = a.right - w * 0.08, top = a.top + h * 0.08, bottom = a.top + h - h * 0.08;
      return rects.some((r) => r.width > 0 && r.top < bottom && r.bottom > top && r.right > left && r.left < right);
    };
    if (!hits(1)) return;
    const natural = parseFloat(getComputedStyle(jn.art).width) || 0;
    for (let k = 0.9; natural && k >= 0.595; k -= 0.1) {
      if (!hits(k)) { el.style.setProperty('--jn-art-size', Math.round(natural * k) + 'px'); return; }
    }
    el.classList.add('is-crowded');
  }
  /** 收紧到某一级放得下以后，往往还剩一点地方：把被截断的文字一行一行放回来，放到刚好不溢出为止 */
  const LC_VARS = ['--lc-ans', '--lc-ex', '--lc-body'];
  const LC_SEL = { '--lc-ans': '.reveal__text', '--lc-ex': '.reveal__explain, .quiz__explain', '--lc-body': '.card__body > .card__text' };
  function relax(el, fitsNow) {
    const cs = getComputedStyle(el);
    LC_VARS.forEach((name) => {
      const base = parseInt(cs.getPropertyValue(name), 10);
      if (!(base > 0)) return;
      const nodes = el.querySelectorAll(LC_SEL[name]);
      const cut = () => Array.prototype.some.call(nodes, (t) => t.scrollHeight > t.clientHeight + 1);
      if (!cut()) return;
      let n = base;
      while (n < 16 && cut()) {
        el.style.setProperty(name, String(n + 1));
        if (!fitsNow()) { if (n === base) el.style.removeProperty(name); else el.style.setProperty(name, String(n)); break; }
        n++;
      }
    });
    markClamps(el);
  }
  C.fit = (el) => {
    const jn = el && el._jn;
    if (!jn || !el.isConnected) return 0;
    const h = el.clientHeight;
    if (h < 40) return 0;
    const limit = h - (parseFloat(getComputedStyle(el).paddingBottom) || 0) + 1;
    const tryUpTo = (max) => {
      for (let lv = 0; lv <= max; lv++) {
        el.setAttribute('data-fit', String(lv));
        markClamps(el);
        if (jn.foot.offsetTop + jn.foot.offsetHeight <= limit) return lv;
      }
      return -1;
    };
    const fitsNow = () => jn.foot.offsetTop + jn.foot.offsetHeight <= limit;
    el.classList.remove('no-preview');
    LC_VARS.forEach((name) => el.style.removeProperty(name));
    // 先定标题的档位：从按字数算出的那一档开始，折出来的行数比这一档预想的多，就换下一档
    el.setAttribute('data-fit', '0');
    let tl = jn.tl;
    el.setAttribute('data-tl', String(tl));
    while (tl < 6 && titleLines(jn.title) > TL_LINES[tl]) { tl++; el.setAttribute('data-tl', String(tl)); }
    let lv = -1;
    if (jn.hasPreview) {
      // 有组件预览的卡片：先带着预览收紧到 4 级；还放不下，就宁可不要预览，也不把字挤小
      lv = tryUpTo(4);
      if (lv < 0) el.classList.add('no-preview');
    }
    if (lv < 0) lv = tryUpTo(MAX_FIT);
    if (lv >= 3) relax(el, fitsNow);
    fitArt(el, jn);
    return lv < 0 ? MAX_FIT : lv;
  };

  /* ---------------- 三个抽屉 ---------------- */
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return '打开链接'; } }
  /** 来源列表。opt.count 为真时显示每条被几张卡片引用 */
  C.refList = (refs, opt) => {
    opt = opt || {};
    return U.el('ul.refs', (refs || []).filter((r) => r && r.t).map((r) => {
      const url = S.safeUrl(r.u);
      return U.el('li.ref', [
        U.el('div.ref__top', [
          r.lv ? U.el('span.ref__lv', { text: r.lv, attrs: { title: S.LV_NOTE[r.lv] || '' } }) : null,
          opt.count && r.cards ? U.el('span.ref__n', { text: r.cards.length + ' 张卡片' }) : null
        ]),
        U.el('div.ref__t', { text: r.t }),
        url ? U.el('a.ref__link', { attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } }, [U.el('span', { text: hostOf(url) }), ui.icon('link')]) : null
      ]);
    }));
  };
  C.lvLegend = (refs) => {
    const seen = S.LV_ORDER.filter((lv) => (refs || []).some((r) => r && r.lv === lv));
    return U.el('p.refs__note', { text: seen.map((lv) => lv + '：' + S.LV_NOTE[lv]).join('；') + (seen.length ? '。' : '') + '证据是什么强度，就标什么强度。' });
  };
  C.openRefs = (card) => (S.refsVisible(card) ? ui.sheet({ title: '来源', name: 'refs', body: [C.refList(card.refs), C.lvLegend(card.refs)] }) : null);

  C.openFull = (card, withAnswer) => {
    const parts = [U.el('div.prose', { html: JN.md(card.body) })];
    if (withAnswer && card.format === 'reveal' && card.reveal) {
      parts.push(U.el('div.prose.prose--answer', [
        U.el('h4', { text: '答案' }),
        U.el('div', { html: JN.md(card.reveal.text) }),
        card.reveal.explain ? U.el('div.prose__explain', { html: JN.md(card.reveal.explain) }) : null
      ]));
    }
    if (withAnswer && card.format === 'quiz' && Array.isArray(card.options)) {
      parts.push(U.el('div.prose.prose--answer', [
        U.el('h4', { text: '答案' }),
        U.el('p', { text: String(card.options[card.answer | 0] || '') }),
        card.explain ? U.el('div.prose__explain', { html: JN.md(card.explain) }) : null
      ]));
    }
    if (card.more) parts.push(U.el('div.prose.prose--more', { html: JN.md(card.more) }));
    return ui.sheet({ title: card.title, name: 'more', body: parts });
  };

  C.openSteps = (card) => {
    const need = Array.isArray(card.need) ? card.need : [];
    const steps = Array.isArray(card.steps) ? card.steps : [];
    const body = [];
    if (need.length) {
      body.push(U.el('div.steps__need', [
        U.el('h4', { text: '要准备' }),
        U.el('div.chips', need.map((n) => U.el('span.jn-chip', { text: n })))
      ]));
    }
    body.push(U.el('ol.steps__list', steps.map((s, i) =>
      U.el('li', [U.el('span.steps__n.jn-num', { text: String(i + 1), attrs: { 'aria-hidden': 'true' } }), U.el('span.steps__t', { text: s })])
    )));
    const sh = ui.sheet({
      title: card.title, name: 'steps', body: body,
      foot: button('jn-btn.jn-btn--block', S.isDone(card.id) ? '做过了' : '做完了，记一笔', 'check', () => {
        if (S.setDone(card.id, true)) { JN.sfx('good'); JN.haptic(14); C.doneHint(); }
        sh.close();
      })
    });
    return sh;
  };

  /* ---------------- 各种形态的操作区 ---------------- */
  function expandBtn(card, el) {
    return button('card__expand', '展开全文', null, () =>
      C.openFull(card, el.classList.contains('is-revealed') || el.classList.contains('is-answered')), { hidden: '' });
  }

  function buildReveal(card, el, action, refit, autoDone) {
    const r = card.reveal || {};
    const label = r.label || '看答案';
    const back = U.el('div.reveal__back.card__clamp', { attrs: { hidden: '' } }, [
      U.el('div.reveal__label', { text: '答案' }),
      U.el('div.reveal__text.card__text', { html: JN.md(r.text) }),
      r.explain ? U.el('div.reveal__explain.card__text', { html: JN.md(r.explain) }) : null,
      expandBtn(card, el)
    ]);
    const txt = U.el('span', { text: label });
    const btn = U.el('button.jn-btn.jn-btn--light.jn-btn--lg.card__cta.reveal__btn', { attrs: { type: 'button', 'aria-expanded': 'false' } }, [txt]);
    btn.addEventListener('click', () => {
      const open = back.hidden;
      back.hidden = !open;
      el.classList.toggle('is-revealed', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('jn-btn--light', !open);
      btn.classList.toggle('jn-btn--ghost', open);
      txt.textContent = open ? '收起答案' : label;
      if (open) {
        back.classList.remove('is-flip');
        void back.offsetWidth;                // 让翻开的动效每次都从头播
        back.classList.add('is-flip');
        JN.sfx('pop');
        JN.haptic(12);
        autoDone();                           // 翻开过答案，就算做过
      }
      refit();
    });
    action.appendChild(U.el('div.reveal', [back, btn]));
  }

  function buildQuiz(card, el, action, refit, autoDone) {
    const opts = Array.isArray(card.options) ? card.options.slice(0, 4) : [];
    const answer = card.answer | 0;
    const verdict = U.el('div.quiz__verdict', { attrs: { role: 'status' } });
    const result = U.el('div.quiz__result.card__clamp', { attrs: { hidden: '' } }, [
      verdict,
      card.explain ? U.el('div.quiz__explain.card__text', { html: JN.md(card.explain) }) : null,
      expandBtn(card, el)
    ]);
    const box = U.el('div.quiz');
    const btns = opts.map((text, i) => {
      const b = U.el('button.jn-btn.jn-btn--line.quiz__opt', { attrs: { type: 'button' } }, [
        U.el('span.quiz__key', { text: KEYS.charAt(i), attrs: { 'aria-hidden': 'true' } }),
        U.el('span.quiz__txt', { text: text }),
        U.el('span.quiz__mark', { attrs: { 'aria-hidden': 'true' } })
      ]);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
      return b;
    });
    box.appendChild(result);
    function choose(i) {
      if (el.classList.contains('is-answered')) return;
      const ok = i === answer;
      el.classList.add('is-answered');
      el.classList.add(ok ? 'is-correct' : 'is-incorrect');
      btns.forEach((b, k) => {
        b.setAttribute('aria-disabled', 'true');
        b.classList.toggle('is-right', k === answer);
        b.classList.toggle('is-wrong', k === i && !ok);
        b.classList.toggle('is-picked', k === i);
        U.clear(b.lastChild);
        if (k === answer || k === i) U.append(b.lastChild, ui.icon(k === answer ? 'check-fill' : 'close'));
      });
      verdict.textContent = ok ? '答对了！' : '差一点。答案是：' + (opts[answer] || '');
      result.hidden = false;
      if (ok) { JN.sfx('good'); JN.haptic(18); JN.confetti({ count: 40 }); }
      else { JN.sfx('bad'); JN.haptic([20, 40, 20]); btns[i].classList.add('jn-shake'); }
      autoDone();                             // 选了答案，就算做过
      refit();
    }
    action.appendChild(box);
  }

  function buildEither(card, el, action, refit, autoDone) {
    const e = card.either || {};
    let state = 'idle';       // idle → picked →（递给对方）pass → done
    let first = null;
    let second = null;
    const tag = { a: U.el('span.either__who'), b: U.el('span.either__who') };
    const opt = {};
    ['a', 'b'].forEach((k) => {
      opt[k] = U.el('button.jn-btn.jn-btn--lg.either__opt', { attrs: { type: 'button', 'data-k': k, 'aria-pressed': 'false' } }, [U.el('span.either__txt', ui.words(e[k] || '')), tag[k]]);
      opt[k].addEventListener('click', () => pick(k));
    });
    const note = U.el('p.either__note', { attrs: { hidden: '', role: 'status' } });
    const ask = U.el('p.either__ask', { text: e.ask || '', attrs: { hidden: '' } });
    const passBtn = button('jn-btn.jn-btn--ghost.jn-btn--sm.either__pass', '递给对方也选一次', 'people2', () => go('pass'));
    const againBtn = button('jn-btn.jn-btn--ghost.jn-btn--sm.either__again', '重来', 'replay', () => { first = second = null; go('idle'); });
    const tools = U.el('div.either__tools', { attrs: { hidden: '' } }, [passBtn, againBtn]);
    const box = U.el('div.either', { attrs: { 'data-state': state } }, [opt.a, opt.b, note, ask, tools]);

    function paint() {
      box.setAttribute('data-state', state);
      el.classList.toggle('is-chosen', state === 'picked' || state === 'done');
      const same = state === 'done' && first === second;
      ['a', 'b'].forEach((k) => {
        // 「递给对方」之后，第一个人的选择只留在内存里，界面上一点痕迹都不留
        const on = (state === 'picked' && first === k) || (state === 'done' && (first === k || second === k));
        opt[k].classList.toggle('is-on', on);
        opt[k].classList.toggle('is-off', (state === 'picked' || state === 'done') && !on);
        opt[k].setAttribute('aria-pressed', String(on));
        tag[k].textContent = state !== 'done' ? '' : same ? (first === k ? '两个人都选了它' : '') : first === k ? '先选的人' : '后选的人';
      });
      note.hidden = !(state === 'pass' || state === 'done');
      note.textContent = state === 'pass' ? '换人。上一位选的已经藏好了，凭你自己的想法选。'
        : state === 'done' ? (same ? '一样！想到一块儿去了。' : '不一样。各说各的理由——') : '';
      note.classList.toggle('is-same', same);
      ask.hidden = !(e.ask && (state === 'picked' || state === 'done'));
      tools.hidden = state === 'idle';
      passBtn.hidden = state !== 'picked';
      againBtn.hidden = state === 'picked';
      refit();
    }
    function go(next) { state = next; paint(); if (next !== 'idle') JN.sfx('tap'); }
    function pick(k) {
      if (state === 'done') return;
      JN.haptic(12);
      if (state === 'pass') {
        second = k;
        state = 'done';
        paint();
        if (first === second) { JN.sfx('win'); JN.haptic([20, 50, 60]); JN.confetti({ count: 40 }); }
        else JN.sfx('pop');
        return;
      }
      first = k;
      state = 'picked';
      paint();
      JN.sfx('pop');
      autoDone();                             // 做了选择，就算做过
    }
    action.appendChild(box);
  }

  /* ---------------- 整张卡片 ---------------- */
  function artNode(card) {
    const hasArt = !!card.art && U.hasSymbol('art-' + card.art);
    if (!hasArt && U.hasSymbol('i-t-' + card.type)) {
      const ic = U.icon('t-' + card.type, 'card__art jn-art card__art--icon');     // 没有贴纸：用类型图标
      return ic;
    }
    const art = U.art(card.art || 'none', 'card__art');
    if (!hasArt) art.classList.add('is-missing');
    return art;
  }
  function metaNode(card, isToday) {
    const t = JN.typeOf(card.type);
    const mins = S.minsLabel(card.mins);
    const who = S.forLabel(card);
    return U.el('header.card__meta', [
      U.el('span.jn-badge.card__type', [ui.typeIcon(card.type), U.el('span', { text: t ? t.name : card.type })]),
      isToday ? U.el('span.jn-badge.card__today', { text: '今日锦囊' }) : null,
      card.sub ? U.el('span.jn-badge.card__sub', { text: card.sub }) : null,
      mins ? U.el('span.jn-badge.card__mins', [ui.icon('clock'), U.el('span', { text: mins })]) : null,
      who ? U.el('span.jn-badge.card__for', [ui.icon(card.for === 'three' ? 'people3' : S.isDadOnly(card) ? 'lock' : 'people2'), U.el('span', { text: who })]) : null
    ]);
  }
  function railBtn(cls, label, icons, onClick) {
    const lbl = U.el('span.rail__lbl', { text: label });
    const b = U.el('button.rail__btn.' + cls, { attrs: { type: 'button', 'aria-label': label } }, [
      U.el('span.rail__ic', { attrs: { 'aria-hidden': 'true' } }, icons.map((n, i) => {
        const ic = ui.icon(n);
        if (ic && icons.length > 1) ic.classList.add(i ? 'rail__on' : 'rail__off');
        return ic;
      })),
      lbl
    ]);
    b.addEventListener('click', () => onClick(b));
    b._lbl = lbl;
    return b;
  }
  function bump(b) {
    const ic = b.firstChild;
    ic.classList.remove('jn-pop');
    void ic.offsetWidth;
    ic.classList.add('jn-pop');
  }

  C.render = (card, ctx) => {
    ctx = ctx || {};
    const el = U.el('article.card', {
      attrs: { 'data-type': card.type, 'data-format': card.format, 'data-id': card.id, 'data-tl': titleLevel(card.title), 'data-fit': '0', 'aria-label': card.title }
    });
    const refit = () => C.fit(el);
    const action = U.el('div.card__action');
    const stage = U.el('div.card__preview-stage');
    const preview = U.el('div.card__preview', { attrs: { hidden: '', 'aria-hidden': 'true' } }, [stage]);
    let wdef = null;

    // 翻开答案、选了答案、做了二选一：自动记为做过。这张卡片在屏幕上的这一回只记一次，不弹提示；
    // 记完以后用户手动取消了，就不再替他记回去。plain 和 steps 只能手动。
    let autoMarked = false;
    const autoDone = () => {
      if (autoMarked) return;
      autoMarked = true;
      S.setDone(card.id, true);
    };
    if (card.format === 'reveal' && card.reveal) buildReveal(card, el, action, refit, autoDone);
    else if (card.format === 'quiz' && Array.isArray(card.options)) buildQuiz(card, el, action, refit, autoDone);
    else if (card.format === 'either' && card.either) buildEither(card, el, action, refit, autoDone);
    else if (card.format === 'steps') {
      const n = Array.isArray(card.steps) ? card.steps.length : 0;
      action.appendChild(button('jn-btn.jn-btn--light.jn-btn--lg.card__cta', '看步骤' + (n ? ' · ' + n + ' 步' : ''), 'chevron-up', () => { JN.sfx('tap'); C.openSteps(card); }));
    } else if (card.format === 'widget') {
      wdef = (JN.widgets && JN.widgets[card.widget]) || null;
      const go = button('jn-btn.jn-btn--light.jn-btn--lg.card__cta', wdef ? card.cta || '开始' : '还在路上', wdef ? 'play' : null, () => {
        if (wdef && JN.app && JN.app.openStage) JN.app.openStage(card.id);
        else ui.toast('这个小游戏还没装好，先换一张');
      });
      if (!wdef) { go.classList.add('is-off'); go.setAttribute('aria-disabled', 'true'); }
      action.appendChild(go);
      if (wdef && wdef.preview) {
        preview.hidden = false;
        preview.insertBefore(U.el('span.card__preview-name', { text: wdef.name || '' }), stage);
      }
    } else if (card.more) {
      action.appendChild(button('jn-btn.jn-btn--ghost.jn-btn--lg.card__cta', '展开', 'chevron-up', () => { JN.sfx('tap'); C.openFull(card, false); }));
    }

    // 页脚左边：有来源就放「来源」入口（点开抽屉看全部），没有就写适合的场景；右边是序号
    const refs = Array.isArray(card.refs) && S.refsVisible(card) ? card.refs.filter((r) => r && r.t) : [];
    const scenes = Array.isArray(card.scenes) ? card.scenes : [];
    const foot = U.el('footer.card__foot', [
      refs.length
        ? button('card__refs', '来源：' + refs[0].t + (refs.length > 1 ? ' 等 ' + refs.length + ' 条' : ''), 'book', () => { JN.sfx('tap'); C.openRefs(card); },
          { 'aria-label': '来源，共 ' + refs.length + ' 条' })
        : scenes.length ? U.el('span.card__scenes', { text: scenes.join(' · ') }) : null,
      U.el('span.card__pos.jn-num', { text: '第 ' + ((ctx.index | 0) + 1) + ' / ' + (ctx.total || 1) })
    ]);

    let hint = null;
    if (card.hint && !S.together()) {         // 一起看：爸爸提示完全不进 DOM
      const text = U.el('span.card__hint-text', { text: card.hint, attrs: { hidden: '' } });
      hint = U.el('button.card__hint', { attrs: { type: 'button', 'aria-expanded': 'false' } }, [
        U.el('span.card__hint-head', [ui.icon('bulb'), U.el('span', { text: '爸爸提示' }), ui.icon('chevron-down', 'card__hint-arrow')]),
        text
      ]);
      const setOpen = (open) => {
        text.hidden = !open;
        hint.classList.toggle('is-open', open);
        hint.setAttribute('aria-expanded', String(open));
        refit();
      };
      hint.addEventListener('click', () => {
        const open = text.hidden;
        if (open) JN.sfx('tap');
        setOpen(open);
        // 屏幕太挤、提示在卡片上显示不全时：收回去，改在抽屉里完整地给
        if (open && text.scrollHeight > text.clientHeight + 1) {
          setOpen(false);
          ui.sheet({ title: '爸爸提示', name: 'hint', body: [U.el('p.prose.prose--hint', { text: card.hint })] });
        }
      });
    }

    const favBtn = railBtn('rail__fav', '收藏', ['heart', 'heart-fill'], (b) => {
      const on = S.toggleFav(card.id);
      JN.sfx(on ? 'pop' : 'tap');
      JN.haptic(on ? 16 : 8);
      if (on) bump(b);
    });
    const doneBtn = railBtn('rail__done', '做过', ['check', 'check-fill'], (b) => {
      const on = S.toggleDone(card.id);
      JN.sfx(on ? 'good' : 'tap');
      JN.haptic(on ? 16 : 8);
      if (on) { bump(b); C.doneHint(); }
    });
    const rail = U.el('div.card__rail', [
      favBtn, doneBtn,
      railBtn('rail__share', '分享', ['share'], () => { JN.sfx('tap'); ui.share(card); }),
      railBtn('rail__dice', '换一张', ['dice'], () => { JN.haptic(10); if (JN.feed) JN.feed.shuffle(); })
    ]);
    function sync() {
      const f = S.isFav(card.id);
      const d = S.isDone(card.id);
      favBtn.classList.toggle('is-on', f);
      favBtn.setAttribute('aria-pressed', String(f));
      favBtn._lbl.textContent = f ? '已收藏' : '收藏';
      doneBtn.classList.toggle('is-on', d);
      doneBtn.setAttribute('aria-pressed', String(d));
      doneBtn._lbl.textContent = d ? '做过了' : '做过';
    }
    sync();

    const art = artNode(card);
    const title = U.el('h2.card__title', ui.words(card.title));        // 每个词一个不换行的 span，折行不拆词
    U.append(el, [
      U.el('div.card__bg'),
      art,
      metaNode(card, !!ctx.isToday),
      title,
      U.el('div.card__body.card__clamp', [U.el('div.card__text', { html: JN.md(card.body) }), expandBtn(card, el)]),
      action,
      preview,
      hint,
      foot,
      rail
    ]);

    let pv = null;
    el._jn = {
      card: card,
      tl: titleLevel(card.title),
      foot: foot,
      art: art,
      title: title,
      rail: rail,
      sync: sync,
      refit: refit,
      hasPreview: !!(wdef && wdef.preview),
      mountPreview() {
        if (pv || !wdef || !wdef.preview || preview.hidden || stage.clientHeight < 48) return;
        pv = JN.mountWidget(card.widget, stage, clone(card.params), { preview: true });
        preview.classList.add('is-live');
      },
      unmountPreview() {
        if (!pv) return;
        pv.destroy();
        pv = null;
        preview.classList.remove('is-live');
      },
      destroy() { el._jn.unmountPreview(); }
    };
    return el;
  };
})();
