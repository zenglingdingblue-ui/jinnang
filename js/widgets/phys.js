/* 锦囊 · widgets/phys —— 物理与视觉（组件工程师 G5）
 * 七个组件：pendulum 双摆 · wavependulum 摆的波浪 · curves 万花尺 · fractal 分形 ·
 *           hoopshot 投篮物理 · illusion 视觉错觉 · scale 如果地球是一个篮球
 * 约定：
 *   - 所有物理常数、公式、单位写在各组件开头的注释里；界面上的数字都由这些常数现算。
 *   - 纯逻辑函数挂在 JN._phys 下，dev/test-phys.js 在 Node 里直接验证它们（不需要浏览器）。
 *   - 画布按 devicePixelRatio（上限 2）处理清晰度；颜色从 CSS 变量读；动画只用 requestAnimationFrame，
 *     页面不可见时暂停；物理用固定步长推进，单帧步数有上限。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;
  var P = (JN._phys = {});
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* ------------------------------------------------------------------ *
   * 共用小工具
   * ------------------------------------------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  P.gcd = function (a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; };

  /** 颜色全部来自 base.css / theme.css 的变量；变量缺失时退回当前文字颜色，不写死色值。 */
  function palette(root) {
    var cs = window.getComputedStyle(root);
    var fb = cs.color;
    function v(name) { var s = cs.getPropertyValue(name); return (s && s.trim()) || fb; }
    /** 类型色画在深色画布上当线条、点、轨迹、文字时，用亮色版 --c-*-hi（主题给的）；读不到再退回 --c-*-a。
     *  （--c-*-a 在 theme.css 里被加深成了“压白字的底色”，直接拿来画细线会偏暗。） */
    function hi(type) { var s = cs.getPropertyValue('--c-' + type + '-hi'); return (s && s.trim()) || v('--c-' + type + '-a'); }
    return {
      ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), bg: v('--bg'),
      surface: v('--surface'), surface2: v('--surface-2'), surface3: v('--surface-3'),
      accent: v('--accent'), ok: v('--ok'), warn: v('--warn'), danger: v('--danger'),
      p1: v('--p1'), p2: v('--p2'), p3: v('--p3'),
      show: hi('show'), trio: hi('trio'),
      font: cs.fontFamily, num: v('--font-num'),
      xs: parseFloat(cs.getPropertyValue('--fs-xs')) || parseFloat(cs.fontSize) * 0.75,     // 画布里的小字、正文字号也跟令牌走
      sm: parseFloat(cs.getPropertyValue('--fs-sm')) || parseFloat(cs.fontSize) * 0.875
    };
  }

  /** 铺满 host 的画布。fit() 按 host 的大小和 devicePixelRatio（上限 2）重设像素尺寸，尺寸变了返回 true。inert 为真时不接收触摸。 */
  function makeCanvas(host, cls, inert) {
    var el = U.el('canvas.' + cls);
    if (inert) el.style.pointerEvents = 'none';        // 卡片预览：手指直接穿过去，不挡卡片的滑动
    host.appendChild(el);
    var c = { el: el, g: el.getContext('2d'), w: 0, h: 0, dpr: 0 };
    c.fit = function () {
      var w = host.clientWidth, h = host.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === c.w && h === c.h && dpr === c.dpr) return false;
      c.w = w; c.h = h; c.dpr = dpr;
      el.width = Math.max(1, Math.round(w * dpr));
      el.height = Math.max(1, Math.round(h * dpr));
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      c.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };
    var ro = null;
    /** 画布区自己的大小变了（比如下面的文字换了行）也重排；外壳的 ctx.onResize 只管整个舞台。 */
    c.watch = function (fn) {
      if (!window.ResizeObserver) return;
      ro = new window.ResizeObserver(function () { if (c.fit()) fn(true); });
      ro.observe(host);
    };
    c.dispose = function () { if (ro) ro.disconnect(); ro = null; };
    c.fit();
    return c;
  }
  /** 版面变化时重排：redraw(changed) 里 changed 表示画布像素尺寸变了。
   *  注意 redraw 里只能重画画布，不要改 DOM 文字——文字一换行，画布区的高度又变，会在同一帧里反复触发。 */
  function autoFit(cv, ctx, redraw) {
    ctx.onResize(function () { redraw(cv.fit()); });
    cv.watch(redraw);
  }

  /** requestAnimationFrame 循环：tick(dt 秒, now 毫秒)。页面切到后台自动停，回来接着跑；destroy 后不再有任何回调。 */
  function makeLoop(tick) {
    var raf = 0, last = 0, want = false, alive = true;
    function frame(now) {
      raf = 0;
      if (!alive || !want) return;
      var dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;                       // 卡顿或刚切回来：不补帧
      tick(dt, now);
      if (alive && want && !raf) raf = window.requestAnimationFrame(frame);
    }
    function kick() {
      if (!alive || !want || raf || document.hidden) return;
      last = window.performance.now();
      raf = window.requestAnimationFrame(frame);
    }
    function onVis() {
      if (document.hidden) { if (raf) window.cancelAnimationFrame(raf); raf = 0; } else kick();
    }
    document.addEventListener('visibilitychange', onVis);
    return {
      start: function () { want = true; kick(); },
      stop: function () { want = false; if (raf) window.cancelAnimationFrame(raf); raf = 0; },
      on: function () { return want; },
      destroy: function () {
        alive = false; want = false;
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }

  /** 固定步长推进器：把一帧的时间切成若干个 h；单帧最多 maxSteps 步，欠下的时间直接丢掉（宁可变慢，不要卡死）。 */
  function makeStepper(h, maxSteps) {
    var acc = 0;
    return function (dt, step) {
      acc += dt;
      var n = 0;
      while (acc >= h && n < maxSteps) { step(h); acc -= h; n++; }
      if (acc >= h) acc = 0;
      return n;
    };
  }

  /** 统一管理 setTimeout，destroy 时一次清光。 */
  function makeTimers() {
    var ids = [];
    return {
      later: function (fn, ms) {
        var id = window.setTimeout(function () { ids.splice(ids.indexOf(id), 1); fn(); }, ms);
        ids.push(id);
        return id;
      },
      clear: function () { ids.forEach(function (id) { window.clearTimeout(id); }); ids = []; }
    };
  }

  /** 舞台骨架：上面一块画布区（自动占满剩余空间），下面一块控件区。类名按组件 id 加前缀。 */
  function scaffold(root, id) {
    var stage = U.el('div.w-' + id + '-stage');
    var panel = U.el('div.w-' + id + '-panel');
    root.appendChild(stage);
    root.appendChild(panel);
    return { stage: stage, panel: panel };
  }

  /** 可以折叠的「为什么」：一个小按钮 + 盖在组件底部的说明抽屉（不挤占版面，内容多了自己滚）。text 用 JN.md 的极简格式。 */
  function makeWhy(root, id, text, label) {
    var body = U.el('div.w-' + id + '-why-body');
    var sheet = U.el('div.w-' + id + '-why', { attrs: { hidden: '' } }, [
      U.el('div.w-' + id + '-why-head', [
        U.el('b', { text: label || '为什么？' }),
        U.el('button.jn-btn.jn-btn--ghost.jn-btn--sm', { text: '收起', attrs: { type: 'button' }, on: { click: function () { toggle(false); } } })
      ]),
      body
    ]);
    var btn = U.el('button.jn-chip.w-' + id + '-whybtn', { text: label || '为什么？', attrs: { type: 'button' }, on: { click: function () { toggle(sheet.hasAttribute('hidden')); } } });
    function toggle(open) {
      if (open) sheet.removeAttribute('hidden'); else sheet.setAttribute('hidden', '');
      btn.classList.toggle('is-on', !!open);
    }
    function set(t) { body.innerHTML = JN.md(t); }
    set(text);
    root.appendChild(sheet);
    return { btn: btn, set: set, toggle: toggle };
  }

  /** 一行滑块：名字 + range + 当前值。fmt(value) 返回显示的文字。给了 nudge 就在两边各加一个微调按钮（每点一下 ±nudge）。 */
  function makeSlider(id, name, min, max, step, value, fmt, onInput, nudge) {
    var input = U.el('input.jn-range', { attrs: { type: 'range', min: min, max: max, step: step, 'aria-label': name } });
    input.value = value;
    var val = U.el('span.jn-num.w-' + id + '-sl-val');
    function bump(dir) {
      return U.el('button.jn-btn.jn-btn--ghost.w-' + id + '-nudge', {
        text: dir < 0 ? '−' : '+',
        attrs: { type: 'button', 'aria-label': name + (dir < 0 ? '减一点' : '加一点') },
        on: { click: function () { input.value = clamp(+input.value + dir * nudge, +input.min, +input.max); show(); onInput(+input.value); } }
      });
    }
    var row = U.el('div.w-' + id + '-sl', [U.el('span.w-' + id + '-sl-name', { text: name }), nudge ? bump(-1) : null, input, nudge ? bump(1) : null, val]);
    function show() { val.textContent = fmt ? fmt(+input.value) : input.value; }
    input.addEventListener('input', function () { show(); onInput(+input.value); });
    show();
    return {
      row: row, input: input,
      get: function () { return +input.value; },
      set: function (v) { input.value = v; show(); },
      range: function (lo, hi) { input.min = lo; input.max = hi; show(); }
    };
  }

  function mkBtn(text, cls, fn) {
    return U.el('button.jn-btn.jn-btn--sm' + (cls || ''), { text: text, attrs: { type: 'button' }, on: { click: fn } });
  }

  /** 分段选择：items = [{ v, t }]；返回 { el, set(v) }。onPick 返回 false 表示这次不换。 */
  function makeSeg(id, items, value, onPick) {
    var el = U.el('div.jn-seg.w-' + id + '-seg');
    var btns = items.map(function (it) {
      var b = U.el('button', { text: it.t, attrs: { type: 'button' }, on: { click: function () { if (onPick(it.v) !== false) set(it.v); } } });
      el.appendChild(b);
      return b;
    });
    function set(v) { items.forEach(function (it, i) { btns[i].classList.toggle('is-on', it.v === v); }); }
    set(value);
    return { el: el, set: set };
  }

  /** 画布上的指针位置（CSS 像素，相对画布左上角）。 */
  function ptOf(canvas, e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真指针 */ } }

  /** 保留 n 位小数并去掉多余的 0；fix(7.40, 2) -> '7.4' */
  function fix(x, n) { return String(+x.toFixed(n)); }
  /** 三位有效数字的定点写法：6.71 / 13.1 / 139 */
  function fmt3(x) { var a = Math.abs(x); return a < 9.995 ? x.toFixed(2) : a < 99.95 ? x.toFixed(1) : String(Math.round(x)); }
  /** 千分位：12756 -> '12,756' */
  function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  P.fmt3 = fmt3;

  function text(g, s, x, y, color, size, align, font, weight) {
    g.font = (weight || 500) + ' ' + size + 'px ' + font;
    g.fillStyle = color;
    g.textAlign = align || 'left';
    g.fillText(s, x, y);
  }

  /* ================================================================== *
   * 1. pendulum 双摆
   *
   * 模型：两个质点 m1、m2 挂在两根没有质量的硬杆 l1、l2 上，没有摩擦和空气阻力。
   *       θ1、θ2 都从“竖直向下”量起（弧度），ω = dθ/dt。
   * 运动方程（由拉格朗日方程推出，与 Wikipedia “Double pendulum”、myphysicslab.com 的写法等价）：
   *   δ = θ1 − θ2，  D = 2·m1 + m2 − m2·cos(2δ)
   *   θ1'' = [ −g(2m1+m2)·sinθ1 − m2·g·sin(θ1−2θ2) − 2·sinδ·m2·(ω2²·l2 + ω1²·l1·cosδ) ] / (l1·D)
   *   θ2'' = [ 2·sinδ·( ω1²·l1·(m1+m2) + g·(m1+m2)·cosθ1 + ω2²·l2·m2·cosδ ) ] / (l2·D)
   * 机械能（势能零点取在悬挂点）：
   *   E = ½·m1·l1²·ω1² + ½·m2·[ l1²ω1² + l2²ω2² + 2·l1·l2·ω1·ω2·cosδ ] − (m1+m2)·g·l1·cosθ1 − m2·g·l2·cosθ2
   * 积分：经典四阶龙格—库塔（RK4），固定步长 H = 1/480 秒；dev/test-phys.js 验证 60 秒内能量漂移远小于 1%。
   * params: { twins: false, a1: 上杆初始角(°), a2: 下杆初始角(°) }
   * ================================================================== */
  var PEND = {
    G: 9.8,             // m/s²
    L1: 0.5, L2: 0.5,   // m：两根杆各 50 厘米
    M1: 1, M2: 1,       // kg：两个摆锤一样重（方程里只用到质量之比）
    H: 1 / 480,         // s：RK4 步长
    EPS: 0.001,         // rad：“双胞胎”模式里，两只摆的上杆初始角度只差这么多
    SPLIT: 30,          // °：角度差超过它，就算“肉眼可见地分开了”
    START: [125, 165],  // °：单只双摆的默认起点（上杆、下杆）
    START2: [110, 150]  // °：双胞胎模式的默认起点
  };
  P.PEND = PEND;

  /** 状态 s = [θ1, θ2, ω1, ω2]，把导数写进 o。 */
  P.pendDeriv = function (s, o) {
    var C = PEND, t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3];
    var d = t1 - t2, sd = Math.sin(d), cd = Math.cos(d);
    var den = 2 * C.M1 + C.M2 - C.M2 * Math.cos(2 * d);
    o[0] = w1;
    o[1] = w2;
    o[2] = (-C.G * (2 * C.M1 + C.M2) * Math.sin(t1) - C.M2 * C.G * Math.sin(t1 - 2 * t2) -
            2 * sd * C.M2 * (w2 * w2 * C.L2 + w1 * w1 * C.L1 * cd)) / (C.L1 * den);
    o[3] = (2 * sd * (w1 * w1 * C.L1 * (C.M1 + C.M2) + C.G * (C.M1 + C.M2) * Math.cos(t1) + w2 * w2 * C.L2 * C.M2 * cd)) / (C.L2 * den);
    return o;
  };
  var pk1 = [0, 0, 0, 0], pk2 = [0, 0, 0, 0], pk3 = [0, 0, 0, 0], pk4 = [0, 0, 0, 0], ptmp = [0, 0, 0, 0];
  /** 原地前进一步 RK4。 */
  P.pendStep = function (s, h) {
    var i;
    P.pendDeriv(s, pk1);
    for (i = 0; i < 4; i++) ptmp[i] = s[i] + 0.5 * h * pk1[i];
    P.pendDeriv(ptmp, pk2);
    for (i = 0; i < 4; i++) ptmp[i] = s[i] + 0.5 * h * pk2[i];
    P.pendDeriv(ptmp, pk3);
    for (i = 0; i < 4; i++) ptmp[i] = s[i] + h * pk3[i];
    P.pendDeriv(ptmp, pk4);
    for (i = 0; i < 4; i++) s[i] += (h / 6) * (pk1[i] + 2 * pk2[i] + 2 * pk3[i] + pk4[i]);
    return s;
  };
  P.pendEnergy = function (s) {
    var C = PEND, t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3];
    var T = 0.5 * C.M1 * C.L1 * C.L1 * w1 * w1 +
            0.5 * C.M2 * (C.L1 * C.L1 * w1 * w1 + C.L2 * C.L2 * w2 * w2 + 2 * C.L1 * C.L2 * w1 * w2 * Math.cos(t1 - t2));
    var V = -(C.M1 + C.M2) * C.G * C.L1 * Math.cos(t1) - C.M2 * C.G * C.L2 * Math.cos(t2);
    return T + V;
  };
  /** 两只摆的“角度差”：两根杆各自角度差的平方和开方（弧度）。 */
  P.pendSep = function (a, b) { return hypot(a[0] - b[0], a[1] - b[1]); };

  var PEND_WHY = '只有一根杆的摆，来回的路线每次都一样。接上第二根杆，两根杆互相拉扯：起点抬得高一些，它甩起来就看着毫无规律，几乎不会走回同一条路线——可它每一步都严格照着同一条物理规则走，没有任何随机。\n\n' +
    '规则完全确定，结果却没法长期预测，这种现象叫**混沌**。起点很低的时候，它反而摆得规规矩矩，差不多是来回重复的。\n\n' +
    '这里的摆没有摩擦，所以永远不会停。现实里的双摆会慢慢停下来。';
  var PEND_WHY2 = '两只摆的规则一模一样，只是松手时上面那根杆差了 ' + PEND.EPS + ' 弧度（约 ' + fix(PEND.EPS / DEG, 3) + '°），眼睛根本看不出来。\n\n' +
    '可是这点差别不会乖乖待着：它差不多每过一小会儿就翻一倍，翻着翻着就大到看得见了。下面那条曲线画的就是这个过程（纵轴每一格是 10 倍）。\n\n' +
    '气象学家洛伦茨在算天气时发现了同样的事，后来有了“蝴蝶效应”这个名字。天气预报只能准几天，主要就是因为这个：一开始量得再准，也总有一点误差。';

  function pendulumView(root, params, ctx, preview) {
    var C = PEND, pal = palette(root), twins = !!params.twins;
    var def = twins ? C.START2 : C.START;
    var start = [(params.a1 != null ? +params.a1 : def[0]) * DEG, (params.a2 != null ? +params.a2 : def[1]) * DEG];
    var TRAIL = twins ? 720 : 1440;        // 每 2 个物理步记一个点（240 点/秒）：轨迹留 3 秒 / 6 秒
    var ui = preview ? { stage: root } : scaffold(root, 'pendulum');
    var cv = makeCanvas(ui.stage, 'w-pendulum-cv', preview);
    var A = sys(), B = twins ? sys() : null;
    var t = 0, running = true, drag = 0, touched = false, doneSent = false, splitAt = -1, half = 0;
    var sepNow = C.EPS, sepLog = [];
    var stepper = makeStepper(C.H, 60);
    var hud = null, pauseBtn = null, why = null;

    function sys() { return { s: [0, 0, 0, 0], x: new Float32Array(TRAIL), y: new Float32Array(TRAIL), n: 0, head: 0 }; }
    function push(q) {
      q.x[q.head] = C.L1 * Math.sin(q.s[0]) + C.L2 * Math.sin(q.s[1]);
      q.y[q.head] = C.L1 * Math.cos(q.s[0]) + C.L2 * Math.cos(q.s[1]);
      q.head = (q.head + 1) % TRAIL;
      if (q.n < TRAIL) q.n++;
    }
    function reset() {
      A.s = [start[0], start[1], 0, 0]; A.n = 0; A.head = 0;
      if (B) { B.s = [start[0] + C.EPS, start[1], 0, 0]; B.n = 0; B.head = 0; }
      t = 0; splitAt = -1; sepLog = []; sepNow = C.EPS; half = 0;
    }
    function step(h) {
      P.pendStep(A.s, h);
      if (B) P.pendStep(B.s, h);
      t += h;
      if ((++half & 1) === 0) { push(A); if (B) push(B); }
    }
    function afterSteps() {
      if (!B) return;
      sepNow = P.pendSep(A.s, B.s);
      var deg = sepNow / DEG;
      sepLog.push(t, Math.log(deg) / Math.LN10);
      if (sepLog.length > 1600) {            // 太长就隔一个丢一个
        var keep = [];
        for (var i = 0; i < sepLog.length; i += 4) keep.push(sepLog[i], sepLog[i + 1]);
        sepLog = keep;
      }
      if (splitAt < 0 && deg > C.SPLIT) splitAt = t;
    }

    /* ---------- 画 ---------- */
    function rects() {
      var w = cv.w, h = cv.h;
      if (!twins) return { pr: { x: 0, y: 0, w: w, h: h }, cr: null };
      if (w > h * 1.25) {
        var cw = Math.round(w * 0.44);
        return { pr: { x: 0, y: 0, w: w - cw, h: h }, cr: { x: w - cw, y: 0, w: cw, h: h } };
      }
      var ch = Math.round(clamp(h * 0.34, 80, 180));
      return { pr: { x: 0, y: 0, w: w, h: h - ch }, cr: { x: 0, y: h - ch, w: w, h: ch } };
    }
    function geom(r) {
      var S = Math.min(r.w, r.h) * 0.46 / (C.L1 + C.L2);
      return { ox: r.x + r.w / 2, oy: r.y + r.h / 2, S: S };
    }
    function bobs(q, G) {
      var x1 = G.ox + C.L1 * Math.sin(q.s[0]) * G.S, y1 = G.oy + C.L1 * Math.cos(q.s[0]) * G.S;
      return { x1: x1, y1: y1, x2: x1 + C.L2 * Math.sin(q.s[1]) * G.S, y2: y1 + C.L2 * Math.cos(q.s[1]) * G.S };
    }
    function drawTrail(q, G, color) {
      var g = cv.g, n = q.n, BATCH = 18;
      if (n < 2) return;
      var per = Math.ceil(n / BATCH);
      g.strokeStyle = color; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      for (var b = 0; b < BATCH; b++) {
        var i0 = b * per, i1 = Math.min(n - 1, i0 + per);
        if (i0 >= n - 1) break;
        g.globalAlpha = 0.04 + 0.8 * Math.pow((i1 + 1) / n, 1.8);
        g.beginPath();
        for (var i = i0; i <= i1; i++) {
          var k = (q.head - n + i + TRAIL * 2) % TRAIL;
          var x = G.ox + q.x[k] * G.S, y = G.oy + q.y[k] * G.S;
          if (i === i0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    function drawArm(q, G, color, alpha) {
      var g = cv.g, b = bobs(q, G), r = clamp(G.S * 0.045, 5, 13);
      g.globalAlpha = alpha;
      g.strokeStyle = pal.ink2; g.lineWidth = Math.max(2, r * 0.36); g.lineCap = 'round';
      g.beginPath(); g.moveTo(G.ox, G.oy); g.lineTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.stroke();
      g.fillStyle = pal.ink2;
      g.beginPath(); g.arc(b.x1, b.y1, r * 0.8, 0, TAU); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.arc(b.x2, b.y2, r, 0, TAU); g.fill();
      g.globalAlpha = 1;
      return b;
    }
    function drawChart(r) {
      var g = cv.g, fs = pal.xs;
      var x0 = r.x + fs * 3.1, x1 = r.x + r.w - 10, y0 = r.y + fs * 1.9, y1 = r.y + r.h - 8;
      var tMax = Math.max(10, Math.ceil(t / 5) * 5), lo = -1.6, hi = 2.6;       // 纵轴是 log10(度)：约 0.03° 到 400°
      function X(tt) { return x0 + (x1 - x0) * tt / tMax; }
      function Y(l) { return y1 - (y1 - y0) * (clamp(l, lo, hi) - lo) / (hi - lo); }
      g.lineWidth = 1; g.strokeStyle = pal.line;
      [[-1, '0.1°'], [0, '1°'], [1, '10°'], [2, '100°']].forEach(function (k) {
        g.beginPath(); g.moveTo(x0, Y(k[0])); g.lineTo(x1, Y(k[0])); g.stroke();
        text(g, k[1], x0 - 5, Y(k[0]) + fs * 0.35, pal.muted, fs, 'right', pal.num);
      });
      text(g, '两只摆的角度差', x0, r.y + fs * 1.15, pal.ink2, fs, 'left', pal.font, 600);
      if (r.w > 230) text(g, tMax + ' 秒', x1, r.y + fs * 1.15, pal.muted, fs, 'right', pal.num);
      if (splitAt >= 0) {
        g.strokeStyle = pal.accent; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(X(splitAt), y0); g.lineTo(X(splitAt), y1); g.stroke();
        g.setLineDash([]);
      }
      if (sepLog.length >= 4) {
        g.strokeStyle = pal.accent; g.lineWidth = 2.5; g.lineJoin = 'round';
        g.beginPath();
        for (var i = 0; i < sepLog.length; i += 2) {
          if (i === 0) g.moveTo(X(sepLog[i]), Y(sepLog[i + 1])); else g.lineTo(X(sepLog[i]), Y(sepLog[i + 1]));
        }
        g.stroke();
      }
    }
    function draw() {
      var g = cv.g;
      if (!cv.w || !cv.h) return;
      g.clearRect(0, 0, cv.w, cv.h);
      var R = rects(), G = geom(R.pr);
      drawTrail(A, G, pal.p1);
      if (B) drawTrail(B, G, pal.p2);
      g.fillStyle = pal.muted;
      g.beginPath(); g.arc(G.ox, G.oy, 4, 0, TAU); g.fill();
      if (B) drawArm(B, G, pal.p2, 0.95);
      var b = drawArm(A, G, pal.p1, 1);
      if (!preview && !touched) {
        g.strokeStyle = pal.ink; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.setLineDash([3, 5]);
        g.beginPath(); g.arc(b.x2, b.y2, 24, 0, TAU); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        text(g, '拖动小球，松手就甩', R.pr.x + R.pr.w / 2, R.pr.y + pal.sm * 1.6, pal.muted, pal.sm, 'center', pal.font);
      }
      if (R.cr) drawChart(R.cr);
    }
    function hudText() {
      if (!hud) return;
      if (!twins) { hud.textContent = drag ? '松手就开始' : '已经甩了 ' + t.toFixed(1) + ' 秒'; return; }
      var deg = sepNow / DEG;
      var s = deg >= 180 ? '角度差超过 180°' : '角度差 ' + (deg < 10 ? fix(deg, deg < 1 ? 3 : 1) : Math.round(deg)) + '°';      // 角度没有折回 0–360°，转的圈数不同就会超过 180°
      hud.textContent = drag ? '松手：两只摆只差 ' + fix(C.EPS / DEG, 3) + '°' :
        splitAt >= 0 ? s + ' · 第 ' + splitAt.toFixed(1) + ' 秒分道扬镳' : s + ' · 现在还像同一只';
    }

    var loop = makeLoop(function (dt) {
      if (running && !drag) {
        stepper(dt, step);
        afterSteps();
        if (preview && twins && t > 18) reset();
        if (!preview && !doneSent && touched && (twins ? splitAt >= 0 : t > 6)) {
          doneSent = true;
          ctx.done(twins ? { text: '第 ' + splitAt.toFixed(1) + ' 秒分道扬镳' } : { text: '甩起来了' });
        }
      }
      draw();
      hudText();
    });

    /* ---------- 拖动摆锤设定起点 ---------- */
    function setDrag(p) {
      var G = geom(rects().pr);
      if (drag === 1) A.s[0] = Math.atan2(p.x - G.ox, p.y - G.oy);
      else { var b = bobs(A, G); A.s[1] = Math.atan2(p.x - b.x1, p.y - b.y1); }
      start = [A.s[0], A.s[1]];
      reset();
    }
    function onDown(e) {
      var p = ptOf(cv.el, e), b = bobs(A, geom(rects().pr));
      var d1 = hypot(p.x - b.x1, p.y - b.y1), d2 = hypot(p.x - b.x2, p.y - b.y2);
      if (Math.min(d1, d2) > 60) return;
      drag = d2 <= d1 ? 2 : 1;
      touched = true;
      capture(cv.el, e);
      e.preventDefault();
      setDrag(p);
    }
    function onMove(e) { if (drag) setDrag(ptOf(cv.el, e)); }
    function onUp() {
      if (!drag) return;
      drag = 0;
      running = true;
      if (pauseBtn) pauseBtn.textContent = '暂停';
      ctx.sfx('whoosh');
      loop.start();
    }

    reset();
    if (preview) {
      // 预览第一帧就有轨迹：先算上 2.5 秒；双胞胎只先走 0.2 秒（要看它们从重合到分开），静态画面则直接给出分开以后的样子
      for (var f = 0, nf = Math.round((twins ? (ctx.reduced ? 6 : 0.2) : 2.5) * 60); f < nf; f++) {
        for (var k = 0; k < 8; k++) step(C.H);
        afterSteps();
      }
    } else {
      hud = U.el('div.w-pendulum-hud.jn-num');
      why = makeWhy(root, 'pendulum', twins ? PEND_WHY2 : PEND_WHY);
      pauseBtn = mkBtn('暂停', '.jn-btn--ghost', function () {
        running = !running;
        pauseBtn.textContent = running ? '暂停' : '继续';
      });
      ui.panel.appendChild(U.el('div.w-pendulum-top', [hud, why.btn]));
      ui.panel.appendChild(U.el('div.w-pendulum-row', [
        mkBtn('回到起点', '.jn-btn--ghost', function () { reset(); touched = true; }),
        mkBtn('换个姿势', '', function () {
          start = [(60 + Math.random() * 120) * (Math.random() < 0.5 ? -1 : 1) * DEG, (Math.random() * 360 - 180) * DEG];
          reset(); touched = true; running = true; pauseBtn.textContent = '暂停';
          ctx.sfx('pop');
        }),
        pauseBtn
      ]));
      cv.el.addEventListener('pointerdown', onDown);
      cv.el.addEventListener('pointermove', onMove);
      cv.el.addEventListener('pointerup', onUp);
      cv.el.addEventListener('pointercancel', onUp);
    }
    autoFit(cv, ctx, draw);
    draw();
    hudText();
    if (!(preview && ctx.reduced)) loop.start();

    return {
      destroy: function () {
        loop.destroy();
        cv.dispose();
        cv.el.removeEventListener('pointerdown', onDown);
        cv.el.removeEventListener('pointermove', onMove);
        cv.el.removeEventListener('pointerup', onUp);
        cv.el.removeEventListener('pointercancel', onUp);
      }
    };
  }

  JN.registerWidget({
    id: 'pendulum',
    name: '双摆',
    rules: '拖动任意一个小球摆好姿势，松手。起点抬得高，它甩起来看着毫无规律，几乎不会走回同一条路线；起点低就规矩得多。“双胞胎”模式里有两只几乎一样的摆，看它们什么时候分道扬镳。',
    mount: function (root, params, ctx) { return pendulumView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return pendulumView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 2. wavependulum 摆的波浪
   *
   * 15 只单摆并排，绳长按规律递减：在一个“大周期” Γ = 60 秒里，第 i 只（i = 0…14）正好摆 51 + i 次。
   *   周期    T_i = Γ / (51 + i)                       （最长的 60/51 ≈ 1.176 秒，最短的 60/65 ≈ 0.923 秒）
   *   绳长    小角度单摆 T = 2π·√(L/g)  ⇒  L_i = g·T_i² / (4π²)   （g = 9.8 m/s²：约 34.4 厘米 … 21.2 厘米）
   *   位移    θ_i(t) = θ0·cos(2π·(51 + i)·t / Γ)      （一起从同一侧松手）
   * 小角度单摆的运动有精确解，所以这里直接按公式算位置、不做数值积分——时间轴才能随便拖。
   * t = Γ 时每只摆都摆了整数次，相位全是 2π 的整数倍，于是同时回到起点；
   * t = Γ/k 时，相位只取决于 (51 + i) 除以 k 的余数，所以分成 k 队（k = 2 就是单数、双数各站一边）。
   * 说明：真实的摆在摆角不小时周期会略长，但这个倍数只和摆角有关、和绳长无关，
   *       所以队形照样重现，只是大周期整体拉长一点（dev/test-phys.js 里用 RK4 验证了这一点）。
   * params: {}
   * ================================================================== */
  var WAVE = {
    G: 9.8,       // m/s²
    N: 15,        // 摆的个数
    GAMMA: 60,    // s：大周期
    N0: 51,       // 最长的那只在一个大周期里摆的次数；之后每只多 1 次
    AMP: 18       // °：画面上的摆角（画大一点好看清；公式按小角度单摆）
  };
  P.WAVE = WAVE;
  P.waveSwings = function (i) { return WAVE.N0 + i; };
  P.wavePeriod = function (i) { return WAVE.GAMMA / (WAVE.N0 + i); };
  P.waveLength = function (i) { var T = P.wavePeriod(i); return WAVE.G * T * T / (4 * Math.PI * Math.PI); };
  P.wavePhase = function (i, t) { return TAU * (WAVE.N0 + i) * t / WAVE.GAMMA; };
  /** 归一化位移（−1…1） */
  P.waveX = function (i, t) { return Math.cos(P.wavePhase(i, t)); };

  var WAVE_MARKS = [
    { t: 3, name: '一条蛇' },
    { t: WAVE.GAMMA / 4, name: '四队' },
    { t: WAVE.GAMMA / 3, name: '三队' },
    { t: WAVE.GAMMA / 2, name: '两队' },
    { t: WAVE.GAMMA, name: '归队' }
  ];
  var WAVE_WHY = '一只摆来回一次要多久，只看绳子多长：绳子越短，摆得越快。跟球多重没关系；只要摆得不太高，跟摆多大也几乎没关系。\n\n' +
    '这 ' + WAVE.N + ' 只摆的绳长是算好的：' + WAVE.GAMMA + ' 秒里，最长的正好摆 ' + WAVE.N0 + ' 次，旁边那只 ' + (WAVE.N0 + 1) + ' 次……最短的 ' + (WAVE.N0 + WAVE.N - 1) + ' 次。' +
    '按公式，最长的绳子是 ' + fix(P.waveLength(0) * 100, 1) + ' 厘米，最短的 ' + fix(P.waveLength(WAVE.N - 1) * 100, 1) + ' 厘米。\n\n' +
    '一起松手后，快的一点点领先，队伍就拉成一条蛇。' + (WAVE.GAMMA / 2) + ' 秒时，每只摆了“次数的一半”：双数次的回到原位，单数次的正好在对面，于是分成两队（橙色和蓝色）。\n\n' +
    WAVE.GAMMA + ' 秒时，每只都摆了整数次，同时回到起点，一切重来。';

  function waveView(root, params, ctx, preview) {
    var W = WAVE, pal = palette(root);
    var ui = preview ? { stage: root } : scaffold(root, 'wavependulum');
    var cv = makeCanvas(ui.stage, 'w-wavependulum-cv', preview);
    var t = preview ? 3 : 0, speed = 1, playing = true, doneSent = false, seek = null, seeking = false, hud = null, playBtn = null;
    var LEN = U.range(W.N).map(P.waveLength);

    function colorOf(i) { return (W.N0 + i) % 2 ? pal.p1 : pal.p2; }      // 单数次橙、双数次蓝：30 秒时正好一边一队
    /** 斜着看的摆架：第 i 只的悬挂点向右上方错开，近大远小不做（各只摆按同一比例画，绳长才看得出差别）。 */
    function drawRig(r) {
      var g = cv.g, n = W.N, amp = W.AMP * DEG;
      var dx = Math.min(13, r.w * 0.42 / n), dy = dx * 0.5;
      var S = Math.min((r.h - dy * n - 26) / LEN[0], (r.w - dx * n - 30) / (2 * LEN[0] * Math.sin(amp)));
      var rb = clamp(S * 0.02, 4, 8);
      var x0 = r.x + (r.w - dx * (n - 1)) / 2, y0 = r.y + 10 + dy * (n - 1);
      g.strokeStyle = pal.ink2; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0 - 8, y0 + 4); g.lineTo(x0 + dx * (n - 1) + 8, y0 - dy * (n - 1) - 4); g.stroke();
      for (var i = n - 1; i >= 0; i--) {
        var th = amp * P.waveX(i, t), px = x0 + i * dx, py = y0 - i * dy;
        var bx = px + S * LEN[i] * Math.sin(th), by = py + S * LEN[i] * Math.cos(th);
        g.strokeStyle = pal.muted; g.lineWidth = 1; g.globalAlpha = 0.7;
        g.beginPath(); g.moveTo(px, py); g.lineTo(bx, by); g.stroke();
        g.globalAlpha = 1; g.fillStyle = colorOf(i);
        g.beginPath(); g.arc(bx, by, rb, 0, TAU); g.fill();
      }
    }
    /** 从正上方看：横向是第几只摆，纵向是它摆到哪儿了。 */
    function drawTop(r) {
      var g = cv.g, n = W.N, gap = r.w / (n + 1), A = r.h * 0.36, cy = r.y + r.h / 2, rb = clamp(gap * 0.3, 3.5, 9), i;
      g.strokeStyle = pal.line; g.lineWidth = 1;
      for (i = 0; i < n; i++) { g.beginPath(); g.moveTo(r.x + gap * (i + 1), cy - A); g.lineTo(r.x + gap * (i + 1), cy + A); g.stroke(); }
      g.strokeStyle = pal.ink; g.globalAlpha = 0.22; g.lineWidth = 2; g.lineJoin = 'round';
      g.beginPath();
      for (i = 0; i < n; i++) { var y = cy - A * P.waveX(i, t); if (i) g.lineTo(r.x + gap * (i + 1), y); else g.moveTo(r.x + gap, y); }
      g.stroke();
      g.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        g.fillStyle = colorOf(i);
        g.beginPath(); g.arc(r.x + gap * (i + 1), cy - A * P.waveX(i, t), rb, 0, TAU); g.fill();
      }
    }
    function draw() {
      var g = cv.g, w = cv.w, h = cv.h;
      if (!w || !h) return;
      g.clearRect(0, 0, w, h);
      if (preview || h < 250) { drawTop({ x: 0, y: 0, w: w, h: h }); return; }
      var hr = Math.round(h * 0.56);
      drawRig({ x: 0, y: 0, w: w, h: hr });
      g.strokeStyle = pal.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(16, hr + 0.5); g.lineTo(w - 16, hr + 0.5); g.stroke();
      text(g, '从正上方看', 16, hr + pal.xs * 1.5, pal.muted, pal.xs, 'left', pal.font);
      drawTop({ x: 0, y: hr + pal.xs * 2, w: w, h: h - hr - pal.xs * 2 });      // 给「从正上方看」这行字留出一条，不和小球叠在一起
    }
    function status() {
      if (!hud) return;
      var near = null;
      WAVE_MARKS.forEach(function (m) { if (Math.abs(t - m.t) < 0.6) near = m.name; });
      if (t < 0.6) near = '归队';
      hud.textContent = '第 ' + t.toFixed(1) + ' 秒 · 最长的摆了 ' + (W.N0 * t / W.GAMMA).toFixed(1) + ' 次 · 最短的 ' +
        ((W.N0 + W.N - 1) * t / W.GAMMA).toFixed(1) + ' 次' + (near ? ' · ' + near : '');
      if (seek && !seeking) seek.set(t.toFixed(2));
    }
    var loop = makeLoop(function (dt) {
      if (playing && !seeking) {
        t += dt * speed;
        if (t >= W.GAMMA) {
          t -= W.GAMMA;
          if (!preview && !doneSent) { doneSent = true; ctx.done({ text: W.GAMMA + ' 秒后，' + W.N + ' 只摆重新排成一条线' }); }
        }
      }
      draw();
      status();
    });

    if (!preview) {
      hud = U.el('div.w-wavependulum-hud.jn-num');
      seek = makeSlider('wavependulum', '时间', 0, W.GAMMA, 0.05, 0, function (v) { return U.fmtTime(v * 1000); }, function (v) {
        t = clamp(v, 0, W.GAMMA - 0.001);
        draw(); status();
      });
      var grab = function () { seeking = true; }, drop = function () { seeking = false; };
      seek.input.addEventListener('pointerdown', grab);
      ['pointerup', 'pointercancel', 'change', 'blur'].forEach(function (n) { seek.input.addEventListener(n, drop); });
      var chips = U.el('div.w-wavependulum-marks', WAVE_MARKS.map(function (m) {
        return U.el('button.jn-chip', { text: m.name, attrs: { type: 'button' }, on: { click: function () {
          t = clamp(m.t - 2, 0, W.GAMMA - 0.001);        // 跳到这个队形出现前 2 秒，看它怎么排出来
          playing = true; seeking = false; playBtn.textContent = '暂停';
          ctx.sfx('tap');
        } } });
      }));
      playBtn = mkBtn('暂停', '.jn-btn--ghost', function () {
        playing = !playing;
        playBtn.textContent = playing ? '暂停' : '播放';
      });
      var seg = makeSeg('wavependulum', [{ v: 0.25, t: '¼×' }, { v: 0.5, t: '½×' }, { v: 1, t: '1×' }, { v: 2, t: '2×' }], 1, function (v) { speed = v; });
      var why = makeWhy(root, 'wavependulum', WAVE_WHY);
      ui.panel.appendChild(U.el('div.w-wavependulum-top', [hud, why.btn]));
      ui.panel.appendChild(seek.row);
      ui.panel.appendChild(chips);
      ui.panel.appendChild(U.el('div.w-wavependulum-row', [playBtn, seg.el]));
    }
    if (preview && ctx.reduced) t = 6.5;
    autoFit(cv, ctx, draw);
    draw();
    status();
    if (!(preview && ctx.reduced)) loop.start();
    return { destroy: function () { loop.destroy(); cv.dispose(); } };
  }

  JN.registerWidget({
    id: 'wavependulum',
    name: '摆的波浪',
    rules: '15 只摆一起松手，绳子一只比一只短。看它们怎么从一条蛇散开、分队，60 秒后又排回一条线。可以拖时间轴、调快慢。',
    mount: function (root, params, ctx) { return waveView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return waveView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 3. curves 万花尺曲线（内旋轮线 hypotrochoid）
   *
   * 半径 r 的小齿轮贴着半径 R 的大圈内侧只滚不滑，笔尖离小齿轮圆心 d。小齿轮圆心绕大圈中心转过角度 t 时：
   *   x(t) = (R − r)·cos t + d·cos((R − r)/r · t)
   *   y(t) = (R − r)·sin t − d·sin((R − r)/r · t)
   * （只滚不滑 ⇒ 小齿轮相对自己圆心反向自转了 (R − r)/r · t。见 Wikipedia “Hypotrochoid”。）
   * R、r 取整数齿数时：
   *   - 笔尖到中心的距离 ρ² = (R−r)² + d² + 2(R−r)·d·cos(R·t/r)，t 每增加 2π·r/R 到一次最远点，也就是画出一个花瓣；
   *     换句话说，小齿轮每滚过自己的 r 个齿，画一瓣。
   *   - 曲线闭合，要等大圈和小齿轮同时回到起点：一共滚过 lcm(R, r) 个齿，小齿轮圆心绕了 r / gcd(R, r) 圈。
   *   - 所以 花瓣数 = lcm(R, r) / r = R / gcd(R, r)。dev/test-phys.js 把曲线实际描一遍来数，对 20 组 (R, r) 都一致。
   * params: { quiz: false }   quiz 为 true 时是“猜花瓣”：给出 R、r，先猜再画
   * ================================================================== */
  P.hypo = function (R, r, d, t, out) {
    var k = (R - r) / r;
    out[0] = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    out[1] = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    return out;
  };
  P.hypoTurns = function (R, r) { return r / P.gcd(R, r); };
  P.hypoPetals = function (R, r) { return R / P.gcd(R, r); };
  /** 不用公式：把整条闭合曲线描一遍，数“离中心最远的点”有几个（就是花瓣尖）。 */
  P.hypoCountPetals = function (R, r, d) {
    var end = TAU * P.hypoTurns(R, r);
    var n = Math.round(end / (TAU * r / R)) * 96;          // 每瓣 96 个采样点；这里的瓣数只用来定采样密度
    var rho = [], o = [0, 0], i, c = 0;
    for (i = 0; i < n; i++) { P.hypo(R, r, d, 0.01234 + end * i / n, o); rho.push(o[0] * o[0] + o[1] * o[1]); }
    for (i = 0; i < n; i++) if (rho[i] > rho[(i + n - 1) % n] && rho[i] >= rho[(i + 1) % n]) c++;
    return c;
  };

  var CURVES_WHY = '小轮每滚过自己的一圈齿，笔尖就离中心最远一次，画出一个花瓣。\n\n' +
    '什么时候画完？要等大圈和小轮**同时**回到出发时的位置，线才接得上。所以花瓣数是：\n\n' +
    '**花瓣数 = 大圈齿数 ÷（两个齿数的最大公因数）**\n\n' +
    '比如大圈 96、小轮 36，最大公因数是 12，花瓣 96 ÷ 12 = 8 个；小轮自己要绕大圈 36 ÷ 12 = 3 圈。\n\n' +
    '两个齿数没有公因数（互质）时，花瓣最多、图案最密。笔尖离小轮中心越远，花瓣越尖。';

  /** 一朵“好看的”：花瓣 5–24 个，小轮最多绕 12 圈。rnd 是 0–1 的随机函数。 */
  P.curvesPick = function (rnd) {
    for (var k = 0; k < 200; k++) {
      var R = [72, 84, 90, 96, 105, 108, 120][Math.floor(rnd() * 7)];
      var r = Math.round(R * (0.18 + rnd() * 0.44));
      var p = P.hypoPetals(R, r), turns = P.hypoTurns(R, r);
      if (p >= 5 && p <= 24 && turns <= 12 && turns >= 2) return { R: R, r: r, d: Math.round((0.55 + rnd() * 0.45) * 100) / 100 };
    }
    return { R: 96, r: 36, d: 0.85 };
  };
  /** 猜花瓣的题目：level 0 是热身（大圈正好是小轮的整数倍），之后要用到最大公因数。 */
  P.curvesQuiz = function (level, rnd) {
    for (var k = 0; k < 400; k++) {
      var a = 3 + Math.floor(rnd() * 10);                 // 花瓣数 3–12，数得过来
      var b = level === 0 ? 1 : 2 + Math.floor(rnd() * (a - 2));
      if (b >= a || P.gcd(a, b) !== 1 || b / a > 0.62) continue;
      var g = 4 + Math.floor(rnd() * 27);
      var R = a * g, r = b * g;
      if (R < 48 || R > 120 || r < 10) continue;
      var pool = [b, g, Math.round(R / r), a + 1, a - 1, a * 2, a + b, R / 12, 2 * b].filter(function (x) { return x >= 2 && x !== a && x === Math.round(x); });
      var opts = [a];
      while (opts.length < 4 && pool.length) {
        var x = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        if (opts.indexOf(x) < 0) opts.push(x);
      }
      for (var extra = a + 2; opts.length < 4; extra++) if (opts.indexOf(extra) < 0) opts.push(extra);
      opts.sort(function (p, q) { return p - q; });
      return { R: R, r: r, g: g, petals: a, turns: b, options: opts };
    }
    return { R: 96, r: 36, g: 12, petals: 8, turns: 3, options: [3, 6, 8, 12] };
  };

  function curvesView(root, params, ctx, preview) {
    var pal = palette(root), quiz = !!params.quiz && !preview;
    var COLORS = [pal.p1, pal.p2, pal.p3, pal.accent, pal.trio, pal.show];
    var ui = preview ? { stage: root } : scaffold(root, 'curves');
    var cv = makeCanvas(ui.stage, 'w-curves-cv', preview);
    var ink = document.createElement('canvas'), live = document.createElement('canvas');     // 画好的几层 / 正在画的这一层
    var inkG = ink.getContext('2d'), liveG = live.getContext('2d');
    var layers = [], timers = makeTimers(), o = [0, 0];
    var cur = { R: 96, r: 36, d: 0.85, color: COLORS[0], tt: 0, end: 0, fast: false };
    var animating = false, showGear = true, onFinish = null;
    var QN = 5, q = null, qi = 0, score = 0, qState = 'ask', el = {};

    function ringPx() { return Math.min(cv.w, cv.h) * 0.47; }
    /** 把 L 这条曲线从 t0 画到 t1。 */
    function stroke(g, L, t0, t1) {
      if (t1 <= t0) return;
      var u = ringPx() / L.R, cx = cv.w / 2, cy = cv.h / 2, d = L.d * L.r;
      var n = Math.max(1, Math.ceil((t1 - t0) / (0.035 / Math.max(1, (L.R - L.r) / L.r))));
      g.strokeStyle = L.color; g.lineWidth = 1.6; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      for (var i = 0; i <= n; i++) {
        P.hypo(L.R, L.r, d, t0 + (t1 - t0) * i / n, o);
        if (i) g.lineTo(cx + o[0] * u, cy - o[1] * u); else g.moveTo(cx + o[0] * u, cy - o[1] * u);
      }
      g.stroke();
    }
    function wipe(c, g) {
      c.width = cv.el.width; c.height = cv.el.height;      // 重设尺寸同时清空
      g.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
    }
    function rebuild() {
      wipe(ink, inkG); wipe(live, liveG);
      layers.forEach(function (L) { stroke(inkG, L, 0, TAU * P.hypoTurns(L.R, L.r)); });
      stroke(liveG, cur, 0, cur.tt);
    }
    function setCur(R, r, d, animate, then) {
      cur.R = R; cur.r = r; cur.d = d;
      cur.end = TAU * P.hypoTurns(R, r);
      wipe(live, liveG);
      onFinish = then || null;
      if (animate) { cur.tt = 0; animating = true; loop.start(); }
      else { cur.tt = cur.end; animating = false; stroke(liveG, cur, 0, cur.end); }
      info();
      draw();
    }
    /** 圆心绕大圈的转速（圈/秒）：小轮自转不超过 2.5 圈/秒、绕圈不超过 1.2 圈/秒；整朵花超过 14 秒就快进并把小轮藏起来。 */
    function orbitHz() {
      var k = (cur.R - cur.r) / cur.r, f = Math.min(1.2, 2.5 / k), turns = cur.end / TAU;
      cur.fast = turns / f > 14;
      return cur.fast ? turns / 14 : f;
    }
    function freeze() {                                    // 把当前这层定下来，换下一个颜色
      layers.push({ R: cur.R, r: cur.r, d: cur.d, color: cur.color });
      if (layers.length > 8) layers.shift();
      cur.color = COLORS[(COLORS.indexOf(cur.color) + 1) % COLORS.length];
      rebuild();
    }
    function draw() {
      var g = cv.g, w = cv.w, h = cv.h;
      if (!w || !h) return;
      var cx = w / 2, cy = h / 2, Rp = ringPx(), u = Rp / cur.R;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = pal.surface3; g.lineWidth = 5;
      g.beginPath(); g.arc(cx, cy, Rp + 3.5, 0, TAU); g.stroke();
      g.drawImage(ink, 0, 0, w, h);
      g.drawImage(live, 0, 0, w, h);
      if (!showGear || (!animating && !(quiz && qState === 'ask'))) return;
      var t = cur.tt, k = (cur.R - cur.r) / cur.r;
      var gx = cx + (cur.R - cur.r) * Math.cos(t) * u, gy = cy - (cur.R - cur.r) * Math.sin(t) * u;
      P.hypo(cur.R, cur.r, cur.d * cur.r, t, o);
      var px = cx + o[0] * u, py = cy - o[1] * u;
      if (!cur.fast) {
        g.strokeStyle = pal.ink2; g.globalAlpha = 0.75; g.lineWidth = 1.5;
        g.beginPath(); g.arc(gx, gy, cur.r * u, 0, TAU); g.stroke();
        for (var s = 0; s < 3; s++) {                      // 三根辐条，看得出小轮在自转
          var a = -k * t + s * TAU / 3;
          g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + cur.r * u * Math.cos(a), gy - cur.r * u * Math.sin(a)); g.stroke();
        }
        g.globalAlpha = 1;
      }
      g.fillStyle = cur.color;
      g.beginPath(); g.arc(px, py, 4.5, 0, TAU); g.fill();
      g.strokeStyle = pal.ink; g.lineWidth = 1.5; g.stroke();
    }
    var loop = makeLoop(function (dt) {
      if (animating) {
        var t1 = Math.min(cur.end, cur.tt + TAU * orbitHz() * dt);
        stroke(liveG, cur, cur.tt, t1);
        cur.tt = t1;
        if (quiz && el.count) el.count.textContent = '数到 ' + Math.floor(cur.tt / (TAU * cur.r / cur.R) + 1e-9) + ' 瓣…';
        if (t1 >= cur.end) {
          animating = false;
          var f = onFinish; onFinish = null;
          if (f) f();
        }
      }
      draw();
      if (!animating) loop.stop();
    });
    function finishNow() {
      if (!animating) return;
      stroke(liveG, cur, cur.tt, cur.end);
      cur.tt = cur.end; animating = false;
      var f = onFinish; onFinish = null;
      if (f) f();
      draw();
    }

    /* ---------- 自由画 ---------- */
    function info() {
      if (!el.info) return;
      el.info.textContent = '大圈 ' + cur.R + ' 齿 · 小轮 ' + cur.r + ' 齿 → ' + P.hypoPetals(cur.R, cur.r) + ' 个花瓣，小轮绕 ' + P.hypoTurns(cur.R, cur.r) + ' 圈';
    }
    function buildFree() {
      var sR, sr, sd;
      function fromSliders() { setCur(sR.get(), Math.min(sr.get(), sR.get() - 1), sd.get() / 100, false); }
      sR = makeSlider('curves', '大圈', 40, 120, 1, cur.R, function (v) { return v + ' 齿'; }, function (v) {
        sr.range(5, v - 1);
        fromSliders();
      });
      sr = makeSlider('curves', '小轮', 5, cur.R - 1, 1, cur.r, function (v) { return v + ' 齿'; }, fromSliders);
      sd = makeSlider('curves', '笔尖', 10, 100, 1, Math.round(cur.d * 100), function (v) { return v + '%'; }, fromSliders);
      el.info = U.el('div.w-curves-hud.jn-num');
      var why = makeWhy(root, 'curves', CURVES_WHY);
      ui.panel.appendChild(U.el('div.w-curves-top', [el.info, why.btn]));
      ui.panel.appendChild(sR.row); ui.panel.appendChild(sr.row); ui.panel.appendChild(sd.row);
      ui.panel.appendChild(U.el('div.w-curves-row', [
        mkBtn('画一遍', '', function () { setCur(cur.R, cur.r, cur.d, true); ctx.sfx('tap'); }),
        mkBtn('随机', '.jn-btn--ghost', function () {
          var p = P.curvesPick(Math.random);
          sR.set(p.R); sr.range(5, p.R - 1); sr.set(p.r); sd.set(Math.round(p.d * 100));
          setCur(p.R, p.r, p.d, true, function () { ctx.done({ text: P.hypoPetals(p.R, p.r) + ' 个花瓣' }); });
          ctx.sfx('pop');
        }),
        mkBtn('叠一层', '.jn-btn--ghost', function () { finishNow(); freeze(); setCur(cur.R, cur.r, cur.d, false); ctx.sfx('tap'); }),
        mkBtn('清空', '.jn-btn--ghost', function () { layers = []; cur.color = COLORS[0]; rebuild(); setCur(cur.R, cur.r, cur.d, false); })
      ]));
      setCur(cur.R, cur.r, cur.d, true);
    }

    /* ---------- 猜花瓣 ---------- */
    function ask() {
      q = P.curvesQuiz(qi === 0 ? 0 : 1, Math.random);
      qState = 'ask';
      cur.color = COLORS[qi % COLORS.length];
      setCur(q.R, q.r, 0.8, false);
      wipe(live, liveG); cur.tt = 0;                       // 只摆好大圈和小轮，先不画
      el.prog.textContent = '第 ' + (qi + 1) + ' / ' + QN + ' 题 · 猜对 ' + score;
      el.ask.textContent = '大圈 ' + q.R + ' 齿，小轮 ' + q.r + ' 齿。画出来有几个花瓣？';
      el.count.textContent = '';
      el.say.textContent = '';
      el.next.hidden = true;
      U.clear(el.opts);
      q.options.forEach(function (n) {
        el.opts.appendChild(U.el('button.jn-btn.jn-btn--ghost.w-curves-opt', { text: String(n), attrs: { type: 'button' }, on: { click: function () { pick(n, this); } } }));
      });
      draw();
    }
    function pick(n, btn) {
      if (qState !== 'ask') return;
      qState = 'draw';
      btn.classList.add('is-picked');
      ctx.sfx('tap');
      setCur(q.R, q.r, 0.8, true, function () { reveal(n); });
    }
    function reveal(n) {
      qState = 'done';
      var ok = n === q.petals;
      if (ok) score++;
      Array.prototype.forEach.call(el.opts.children, function (b) {
        b.disabled = true;
        if (+b.textContent === q.petals) b.classList.add('is-right');
        else if (b.classList.contains('is-picked')) b.classList.add('is-wrong');
      });
      el.count.textContent = q.petals + ' 瓣';
      el.say.textContent = (ok ? '对了！' : '是 ' + q.petals + ' 个。') + q.R + ' 和 ' + q.r + ' 的最大公因数是 ' + q.g + '，' + q.R + ' ÷ ' + q.g + ' = ' + q.petals +
        '。小轮绕了 ' + q.turns + ' 圈才回到起点。';
      el.prog.textContent = '第 ' + (qi + 1) + ' / ' + QN + ' 题 · 猜对 ' + score;
      el.next.textContent = qi + 1 < QN ? '下一题' : '看结果';
      el.next.hidden = false;
      el.why.btn.hidden = false;
      ctx.sfx(ok ? 'good' : 'bad');
      ctx.haptic(ok ? 20 : [30, 40, 30]);
    }
    function next() {
      if (qState === 'ask' || qState === 'draw') return;
      if (qState === 'over') { qi = 0; score = 0; ask(); return; }
      qi++;
      if (qi < QN) { ask(); return; }
      qState = 'over';
      U.clear(el.opts);
      el.ask.textContent = QN + ' 题猜对 ' + score + ' 题';
      el.say.textContent = score === QN ? '全中。花瓣数 = 大圈齿数 ÷ 最大公因数，你已经看穿了。' : '窍门：花瓣数 = 大圈齿数 ÷ 两个齿数的最大公因数。';
      el.count.textContent = '';
      el.next.textContent = '再来一局';
      ctx.done({ win: score >= QN - 1, text: QN + ' 题猜对 ' + score + ' 题' });
      if (score === QN) { ctx.confetti(); ctx.sfx('win'); }
    }
    function buildQuiz() {
      el.prog = U.el('div.w-curves-hud.jn-num');
      el.count = U.el('div.w-curves-count.jn-num');
      el.ask = U.el('div.w-curves-ask');
      el.opts = U.el('div.w-curves-opts');
      el.say = U.el('div.w-curves-say');
      el.next = mkBtn('下一题', '', next);
      el.why = makeWhy(root, 'curves', CURVES_WHY);
      el.why.btn.hidden = true;                           // 第一次揭晓以后才出现，不然就剧透了
      ui.panel.appendChild(U.el('div.w-curves-top', [el.prog, el.count]));
      ui.panel.appendChild(el.ask);
      ui.panel.appendChild(el.opts);
      ui.panel.appendChild(el.say);
      ui.panel.appendChild(U.el('div.w-curves-row', [el.next, el.why.btn]));
      ask();
    }

    /* ---------- 预览：三朵花一层层画出来，停一会儿，清空重来 ---------- */
    var SHOW = [{ R: 96, r: 36, d: 0.85 }, { R: 105, r: 30, d: 0.9 }, { R: 96, r: 40, d: 0.62 }], si = 0;
    function showNext() {
      if (si >= SHOW.length) { si = 0; layers = []; cur.color = COLORS[0]; rebuild(); }
      var p = SHOW[si++];
      setCur(p.R, p.r, p.d, true, function () {
        timers.later(function () { freeze(); showNext(); }, si >= SHOW.length ? 2600 : 900);
      });
    }

    wipe(ink, inkG); wipe(live, liveG);
    autoFit(cv, ctx, function (changed) { if (changed) rebuild(); draw(); });
    if (preview) {
      if (ctx.reduced) {
        SHOW.forEach(function (p, i) { layers.push({ R: p.R, r: p.r, d: p.d, color: COLORS[i] }); });
        showGear = false; cur.tt = 0; rebuild(); draw();
      } else showNext();
    } else if (quiz) buildQuiz();
    else buildFree();

    return { destroy: function () { loop.destroy(); timers.clear(); cv.dispose(); } };
  }

  JN.registerWidget({
    id: 'curves',
    name: '万花尺',
    rules: '小齿轮在大圈里滚，笔尖画出花。拖滑块换齿数和笔尖位置；“猜花瓣”里先猜有几个花瓣，再看它画出来。',
    mount: function (root, params, ctx) { return curvesView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return curvesView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 4. fractal 分形
   *
   * tree 分形树：每根树枝的顶端分出两根，各向两边偏一个角度，长度乘以“缩短比例”。
   *   共 n 层（树干算第 1 层）：树枝总数 = 1 + 2 + 4 + … + 2^(n−1) = 2^n − 1，最细的一层有 2^(n−1) 根。
   * koch 科赫雪花：从正三角形（周长 P0、面积 A0）开始，每加一层，把每条边中间的三分之一换成一个小尖角。
   *   边数 ×4、每条边长 ×1/3  ⇒  周长 P_n = P0·(4/3)^n，没有上限；
   *   第 k 层新长出 3·4^(k−1) 个小三角形，每个面积 A0/9^k  ⇒  这一层新增 (A0/3)·(4/9)^(k−1)
   *   ⇒  A_n = A0·[1 + (3/5)·(1 − (4/9)^n)]，上限是 A0·8/5 = 1.6·A0。
   *   （dev/test-phys.js 用实际生成的多边形量周长、算面积，与这两个公式对照。）
   * params: { kind: 'tree' | 'koch', angle: 28, ratio: 0.72, levels: 9, level: 0 }
   * ================================================================== */
  var AU_KM = 149597870.7;       // 千米：1 天文单位（日地平均距离），IAU 2012 年决议 B2 的定义值
  P.AU_KM = AU_KM;
  P.treeCount = function (n) { return Math.pow(2, n) - 1; };
  P.kochSides = function (n) { return 3 * Math.pow(4, n); };
  P.kochPerimeter = function (n) { return Math.pow(4 / 3, n); };                 // 是 P0 的多少倍
  P.kochArea = function (n) { return 1 + 0.6 * (1 - Math.pow(4 / 9, n)); };       // 是 A0 的多少倍
  P.KOCH_AREA_LIMIT = 1.6;
  /** 第 n 层科赫雪花的顶点 [x0, y0, x1, y1, …]（初始边长 1，逆时针，y 轴向上）。grow∈[0,1]：最后一层的小尖角长出了多少（动画用）。 */
  P.kochPoints = function (n, grow) {
    var h = Math.sqrt(3) / 2, pts = [0, 0, 1, 0, 0.5, h];
    for (var k = 1; k <= n; k++) {
      var f = k === n && grow != null ? grow : 1, out = [], m = pts.length / 2;
      for (var i = 0; i < m; i++) {
        var j = (i + 1) % m, ax = pts[2 * i], ay = pts[2 * i + 1];
        var dx = (pts[2 * j] - ax) / 3, dy = (pts[2 * j + 1] - ay) / 3;
        // 尖角顶点 = 边的中点 + 向外的法线 (dy, −dx) × (√3/2)：正好是边长三分之一的正三角形的高
        out.push(ax, ay, ax + dx, ay + dy, ax + 1.5 * dx + dy * h * f, ay + 1.5 * dy - dx * h * f, ax + 2 * dx, ay + 2 * dy);
      }
      pts = out;
    }
    return pts;
  };
  P.polyPerimeter = function (p) {
    var s = 0, m = p.length / 2;
    for (var i = 0; i < m; i++) { var j = (i + 1) % m; s += hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]); }
    return s;
  };
  P.polyArea = function (p) {          // 鞋带公式
    var s = 0, m = p.length / 2;
    for (var i = 0; i < m; i++) { var j = (i + 1) % m; s += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
    return Math.abs(s) / 2;
  };

  var KOCH_MAX = 6, KOCH_SIDE0 = 0.1;      // 界面最多 6 层；“如果”里用的初始边长：0.1 米
  var TREE_WHY = '规则只有一条：每根树枝的顶端，分出两根小一号的树枝。\n\n' +
    '同一条规则重复 9 次，就有 2⁹ − 1 = ' + P.treeCount(9) + ' 根树枝。每多一层，树枝数差不多翻一倍。\n\n' +
    '随便折下一根树枝单独看，它和整棵树长得一样。这叫**自相似**，是分形的标志。真的树、河的支流、肺里的气管、闪电，都有点这个意思，只是没这么规整。';
  var KOCH_WHY = '每加一层，每条边的中间都鼓出一个小尖角：一条边变四条，每条是原来的三分之一长。所以周长每次乘以 4/3，加到第 ' + KOCH_MAX + ' 层是原来的 ' +
    fmt3(P.kochPerimeter(KOCH_MAX)) + ' 倍，而且可以一直涨下去，没有尽头。\n\n' +
    '面积不一样：新长的小三角越来越小，全加起来有个封顶，永远超不过最初那个三角形的 ' + P.KOCH_AREA_LIMIT + ' 倍。\n\n' +
    '如果从边长 ' + Math.round(KOCH_SIDE0 * 100) + ' 厘米的三角形开始，加到第 100 层，周长大约是地球到太阳距离的 ' +
    fix(3 * KOCH_SIDE0 * P.kochPerimeter(100) / (AU_KM * 1000), 1) + ' 倍，可整片雪花还是能放在手掌上。';

  function fractalView(root, params, ctx, preview) {
    var pal = palette(root), kind = params.kind === 'koch' ? 'koch' : 'tree';
    var ui = preview ? { stage: root } : scaffold(root, 'fractal');
    var cv = makeCanvas(ui.stage, 'w-fractal-cv', preview);
    var timers = makeTimers(), clock = 0, doneSent = false, loop = null, redraw = null;
    var still = preview && ctx.reduced, body = null, why = null;

    /* ---------- 分形树 ---------- */
    function tree() {
      var ang = clamp(+params.angle || 28, 5, 85), ratio = clamp(+params.ratio || 0.72, 0.4, 0.82);
      var n = clamp(Math.round(+params.levels || (preview ? 8 : 9)), 1, 11);
      var grown = still ? n : 0, wind = true, hold = 0, hud = null, box = null;
      var seg = [], cnt = [], MAXN = 11, d;
      for (d = 0; d < MAXN; d++) seg.push(new Float32Array(4 << d));

      function branch(x, y, a, len, dep, sway) {
        var f = clamp(grown - dep, 0, 1);
        if (dep >= n || f <= 0) return;
        if (sway) a += (dep / n) * 3.2 * DEG * Math.sin(TAU * 0.3 * clock + dep * 0.7 + x * 2);     // 0.3 Hz 的慢风，越细的枝摆得越多
        var x2 = x + Math.sin(a) * len * f, y2 = y + Math.cos(a) * len * f, arr = seg[dep], k = cnt[dep] * 4;
        arr[k] = x; arr[k + 1] = y; arr[k + 2] = x2; arr[k + 3] = y2;
        cnt[dep]++;
        branch(x2, y2, a - ang * DEG, len * ratio, dep + 1, sway);
        branch(x2, y2, a + ang * DEG, len * ratio, dep + 1, sway);
      }
      function build(sway) { for (var i = 0; i < MAXN; i++) cnt[i] = 0; branch(0, 0, 0, 1, 0, sway); }
      /** 量一下整棵树（长满、没风时）占多大，用来把它正好放进画布。 */
      function measure() {
        var g0 = grown; grown = n; build(false); grown = g0;
        var x0 = 0, x1 = 0, y0 = 0, y1 = 0;
        for (var i = 0; i < n; i++) for (var k = 0; k < cnt[i] * 4; k += 2) {
          x0 = Math.min(x0, seg[i][k]); x1 = Math.max(x1, seg[i][k]);
          y0 = Math.min(y0, seg[i][k + 1]); y1 = Math.max(y1, seg[i][k + 1]);
        }
        box = { x0: x0, x1: x1, y0: y0, y1: y1 };
      }
      function draw() {
        var g = cv.g, w = cv.w, h = cv.h;
        if (!w || !h) return;
        g.clearRect(0, 0, w, h);
        if (!box) measure();
        var S = Math.min((w * 0.9) / (box.x1 - box.x0 || 1), (h * 0.9) / (box.y1 - box.y0 || 1));
        var ox = w / 2 - (box.x0 + box.x1) / 2 * S, oy = h / 2 + (box.y0 + box.y1) / 2 * S;
        build(wind && !still);
        var w0 = clamp(S * 0.07, 2.5, 12);
        g.lineCap = 'round';
        for (var i = 0; i < n; i++) {
          if (!cnt[i]) break;
          g.strokeStyle = i >= n - 3 && n > 3 ? pal.ok : pal.ink2;
          g.lineWidth = Math.max(1, w0 * Math.pow(0.74, i));
          g.beginPath();
          for (var k = 0, a = seg[i]; k < cnt[i] * 4; k += 4) { g.moveTo(ox + a[k] * S, oy - a[k + 1] * S); g.lineTo(ox + a[k + 2] * S, oy - a[k + 3] * S); }
          g.stroke();
        }
      }
      function say() {
        if (hud) hud.textContent = n + ' 层 · 一共 ' + group(P.treeCount(n)) + ' 根树枝 · 最细的一层 ' + group(Math.pow(2, n - 1)) + ' 根';
      }
      redraw = draw;
      loop = makeLoop(function (dt) {
        clock += dt;
        if (grown < n) {
          grown = Math.min(n, grown + dt * 2.2);          // 每秒长 2.2 层
          if (grown >= n && !preview && !doneSent) { doneSent = true; ctx.done({ text: group(P.treeCount(n)) + ' 根树枝' }); }
        } else if (preview && (hold += dt) > 4.5) { hold = 0; grown = 0; }
        draw();
      });
      if (!preview) {
        hud = U.el('div.w-fractal-hud.jn-num');
        var windBtn = mkBtn('风：开', '.jn-btn--ghost', function () { wind = !wind; windBtn.textContent = wind ? '风：开' : '风：关'; });
        body.appendChild(hud);
        body.appendChild(makeSlider('fractal', '分叉角度', 5, 85, 1, ang, function (v) { return v + '°'; }, function (v) { ang = v; box = null; }).row);
        body.appendChild(makeSlider('fractal', '缩短比例', 40, 82, 1, Math.round(ratio * 100), function (v) { return v + '%'; }, function (v) { ratio = v / 100; box = null; }).row);
        body.appendChild(makeSlider('fractal', '层数', 1, MAXN, 1, n, function (v) { return v + ' 层'; }, function (v) { n = v; grown = Math.min(grown, n); box = null; say(); }).row);
        body.appendChild(U.el('div.w-fractal-row', [mkBtn('再长一次', '', function () { grown = 0; ctx.sfx('pop'); }), windBtn]));
        say();
      }
    }

    /* ---------- 科赫雪花 ---------- */
    function koch() {
      var level = clamp(Math.round(+params.level || 0), 0, KOCH_MAX), grow = 1, auto = preview, wait = 0, el = {};
      function draw() {
        var g = cv.g, w = cv.w, h = cv.h;
        if (!w || !h) return;
        g.clearRect(0, 0, w, h);
        var pts = P.kochPoints(level, smooth(grow));
        var side = Math.min(w, h) * 0.47 * Math.sqrt(3);        // 雪花始终落在最初三角形的外接圆里：半径 = 边长/√3
        var ox = w / 2 - side / 2, oy = h / 2 + side * Math.sqrt(3) / 6;
        g.beginPath();
        for (var i = 0; i < pts.length; i += 2) { if (i) g.lineTo(ox + pts[i] * side, oy - pts[i + 1] * side); else g.moveTo(ox + pts[i] * side, oy - pts[i + 1] * side); }
        g.closePath();
        g.fillStyle = pal.p2; g.globalAlpha = 0.22; g.fill();
        g.globalAlpha = 1; g.strokeStyle = pal.ink; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
        if (preview) {                                        // 预览：左上角写出这一层的周长倍数
          text(g, '第 ' + level + ' 层', 10, pal.xs * 1.6, pal.muted, pal.xs, 'left', pal.font);
          text(g, '周长 ×' + fmt3(P.kochPerimeter(level)), 10, pal.xs * 3.1, pal.ink, pal.sm, 'left', pal.num, 700);
        }
      }
      function say() {
        if (!el.hud) return;
        var per = P.kochPerimeter(level), area = P.kochArea(level), full = P.kochPerimeter(KOCH_MAX);
        el.hud.textContent = '第 ' + level + ' 层 · ' + group(P.kochSides(level)) + ' 条边';
        el.per.textContent = '周长 ×' + fmt3(per);
        el.area.textContent = '面积 ×' + fmt3(area) + '（封顶 ' + P.KOCH_AREA_LIMIT + '）';
        el.perBar.style.width = (per / full * 100).toFixed(1) + '%';
        el.areaBar.style.width = (area / full * 100).toFixed(1) + '%';
        el.cap.style.left = (P.KOCH_AREA_LIMIT / full * 100).toFixed(1) + '%';
      }
      function setLevel(v, animate) {
        if (v === level) return;
        grow = animate && v > level ? 0 : 1;
        level = v;
        if (el.sl) el.sl.set(level);
        say();
        if (level === KOCH_MAX && !preview && !doneSent) { doneSent = true; ctx.done({ text: '周长是原来的 ' + fmt3(P.kochPerimeter(level)) + ' 倍' }); }
        loop.start();
      }
      redraw = draw;
      loop = makeLoop(function (dt) {
        if (grow < 1) grow = Math.min(1, grow + dt / 0.8);
        else if (auto) {
          wait += dt;
          if (wait > (level >= (preview ? 5 : KOCH_MAX) ? 2.4 : 0.7)) {
            wait = 0;
            if (level >= (preview ? 5 : KOCH_MAX)) { if (preview) setLevel(0, false); else { auto = false; el.auto.textContent = '自动长一遍'; } }
            else setLevel(level + 1, true);
          }
        }
        draw();
        if (grow >= 1 && !auto) loop.stop();
      });
      if (still) { level = 4; auto = false; }
      if (!preview) {
        el.hud = U.el('div.w-fractal-hud.jn-num');
        el.per = U.el('span.jn-num'); el.area = U.el('span.jn-num');
        el.perBar = U.el('i.w-fractal-fill'); el.areaBar = U.el('i.w-fractal-fill.is-area'); el.cap = U.el('i.w-fractal-cap');
        body.appendChild(el.hud);
        body.appendChild(U.el('div.w-fractal-stat', [el.per, U.el('div.w-fractal-bar', [el.perBar])]));
        body.appendChild(U.el('div.w-fractal-stat', [el.area, U.el('div.w-fractal-bar', [el.areaBar, el.cap])]));
        el.sl = makeSlider('fractal', '层数', 0, KOCH_MAX, 1, level, function (v) { return v + ' 层'; }, function (v) { auto = false; el.auto.textContent = '自动长一遍'; setLevel(v, true); });
        body.appendChild(el.sl.row);
        el.auto = mkBtn('自动长一遍', '', function () {
          auto = !auto;
          el.auto.textContent = auto ? '停' : '自动长一遍';
          if (auto) { wait = 0; if (level >= KOCH_MAX) setLevel(0, false); loop.start(); }
        });
        body.appendChild(U.el('div.w-fractal-row', [
          mkBtn('− 一层', '.jn-btn--ghost', function () { auto = false; el.auto.textContent = '自动长一遍'; setLevel(Math.max(0, level - 1), false); draw(); }),
          mkBtn('+ 一层', '.jn-btn--ghost', function () { auto = false; el.auto.textContent = '自动长一遍'; setLevel(Math.min(KOCH_MAX, level + 1), true); ctx.sfx('pop'); }),
          el.auto
        ]));
        say();
      }
    }

    /** 开始（或切换到）某一种：停掉旧的循环，清空控件区，重新搭 */
    function start(k) {
      kind = k;
      if (loop) loop.destroy();
      if (body) U.clear(body);
      clock = 0;
      if (kind === 'koch') koch(); else tree();
      if (why) { why.set(kind === 'koch' ? KOCH_WHY : TREE_WHY); why.toggle(false); }
      redraw();
      if (!still) loop.start();
    }
    if (!preview) {
      why = makeWhy(root, 'fractal', '');
      body = U.el('div.w-fractal-body');
      ui.panel.appendChild(U.el('div.w-fractal-top', [
        makeSeg('fractal', [{ v: 'tree', t: '分形树' }, { v: 'koch', t: '科赫雪花' }], kind, function (v) { if (v !== kind) { start(v); ctx.sfx('tap'); } }).el,
        why.btn
      ]));
      ui.panel.appendChild(body);
    }
    start(kind);
    autoFit(cv, ctx, function () { redraw(); });
    return { destroy: function () { loop.destroy(); timers.clear(); cv.dispose(); } };
  }

  JN.registerWidget({
    id: 'fractal',
    name: '分形',
    rules: '一条简单的规则重复很多次。分形树：调分叉角度、缩短比例和层数。科赫雪花：一层层加尖角，看周长和面积谁涨得停不下来。',
    mount: function (root, params, ctx) { return fractalView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return fractalView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 5. hoopshot 投篮物理
   *
   * 尺寸（米）。依据：FIBA《篮球规则·篮球器材》与球场图；括号里是 NBA 的对应值。
   *   篮圈上沿离地 3.05（3,050 mm；NBA 10 英尺 = 3.048）
   *   篮圈内径 0.45（450–459 mm；NBA 18 英寸 = 0.457）
   *   篮圈中心到篮板正面 0.375（圈中心距端线内沿 1.575，篮板正面距端线 1.20；NBA 15 英寸 = 0.381）
   *   篮板高 1.05，下沿离地 2.90，所以上沿 3.95
   *   罚球线到篮圈中心的水平距离 4.225 = 5.80 − 1.575（罚球线外沿距端线内沿 5.80，即距篮板 4.60）
   *       NBA：罚球线距篮板 15 英尺 = 4.572，减去 0.381 得 4.19。两种算法都约 4.2 米。
   *   三分线 6.75（FIBA 弧顶到篮圈中心正下方；底角 6.60；NBA 弧顶 7.24）
   *   篮球直径 0.246：7 号球周长 FIBA 2020 版为 750–770 mm（直径 23.9–24.5 cm），旧版规则与国标为 749–780 mm
   *       （直径 23.8–24.8 cm）；这里按任务给定的常用值 24.6 cm。改这一个常数，所有结果会跟着重算。
   * 物理：只算重力，g = 9.8 m/s²；不计空气阻力和球的旋转；球在“出手点—篮圈中心”这个竖直平面里飞（不考虑左右偏）。
   *   x(t) = v·cosθ·t        y(t) = h0 + v·sinθ·t − ½·g·t²
   * 判定（侧面看，篮圈是内径两端的两个点：前沿 F = (D − 0.225, 3.05)，后沿 B = (D + 0.225, 3.05)，钢条粗细忽略）：
   *   空心入网 ⇔ 球心下落穿过篮圈平面时落在 F、B 之间，并且整个飞行中球心离 F、B 都不小于球半径。
   *   如果把球在篮圈附近的一小段路近似成直线（入筐角 φ = 速度方向与水平面的夹角），这就是：
   *       |x_c − D| ≤ 0.225 − 球半径 / sin φ
   *   也就是：沿着来球方向看，篮圈前后方向只剩 篮圈内径 × sin φ 这么宽，球要从这条缝里穿过去。
   *   所以 sin φ < 球直径 / 篮圈内径 时，不碰筐不可能进：φ 至少要 asin(0.246 / 0.45) ≈ 33.1°。
   * 碰撞（简化）：碰到 F、B 两个点、篮板、地板时，沿法线方向的速度反向并乘以恢复系数，切向速度不变。
   *   恢复系数是估计值：篮圈 0.6、篮板 0.7、地板 0.76（规则要求球底离地 1.8 米落下时，球顶反弹到 1.2–1.4 米，
   *   折算成恢复系数约 0.73–0.80，取中间），
   *   所以“蹭筐进不进”只是大致像样；“空心”的判定不依赖这些估计。
   * 最省力的角度：把球正好送到圈心所需的速度 v(θ) = √( g·D² / (2·cos²θ·(D·tanθ − Δh)) )，Δh = 3.05 − h0，
   *   它在 θ* = 45° + ½·atan(Δh / D) 处最小。组件里不直接用这个结论，而是把每个角度都扫一遍找最小值；
   *   dev/test-phys.js 核对两者一致。
   * params: { mode: 'free' | 'challenge' | 'explore', spot: 'ft' | 'three' | 'mix', height: 2.0 }
   * ================================================================== */
  var HOOP = {
    G: 9.8,
    RIM_H: 3.05, RIM_D: 0.45, BALL_D: 0.246,
    BOARD_X: 0.375, BOARD_LO: 2.90, BOARD_HI: 3.95,
    FT: 5.80 - 1.575, THREE: 6.75,
    H0: 2.0,
    DT: 1 / 600,                              // s：模拟步长（固定）
    E_RIM: 0.6, E_BOARD: 0.7, E_FLOOR: 0.76,  // 恢复系数（估计值，见上）
    SIG_V: 0.01,                              // “手抖”：出手速度的相对误差（标准差 1%）
    SIG_A: 1                                  // “手抖”：出手角度的误差（标准差 1°）
  };
  P.HOOP = HOOP;
  var RB = HOOP.BALL_D / 2, RR = HOOP.RIM_D / 2;
  var GOLD = 0.6180339887498949;

  /** 不碰筐能进的最小入筐角（弧度） */
  P.hoopMinEntry = function () { return Math.asin(HOOP.BALL_D / HOOP.RIM_D); };
  /** 沿来球方向看，篮圈前后方向“看起来”有多宽（米） */
  P.hoopApparent = function (entry) { return HOOP.RIM_D * Math.sin(entry); };
  /** 解析解：t 时刻球心的位置和速度，写进 o = [x, y, vx, vy] */
  P.hoopAt = function (th, v, h0, t, o) {
    o[0] = v * Math.cos(th) * t;
    o[1] = h0 + v * Math.sin(th) * t - 0.5 * HOOP.G * t * t;
    o[2] = v * Math.cos(th);
    o[3] = v * Math.sin(th) - HOOP.G * t;
    return o;
  };
  /** 把球心正好送到圈心需要的出手速度；这个角度够不着时返回 NaN */
  P.hoopCenterSpeed = function (th, h0, D) {
    var c = Math.cos(th), den = 2 * c * c * (D * Math.tan(th) - (HOOP.RIM_H - h0));
    return den > 0 ? Math.sqrt(HOOP.G * D * D / den) : NaN;
  };
  /** 一次出手的解析判定。cF / cB：球面离前沿 / 后沿最近时还差多少（米）；从错的一侧过去记为负数。两者都 ≥ 0 才是空心。 */
  P.hoopEval = function (th, v, h0, D) {
    var g = HOOP.G, vx = v * Math.cos(th), vy = v * Math.sin(th), dh = HOOP.RIM_H - h0;
    var disc = vy * vy - 2 * g * dh;
    var r = { reach: false, swish: false, xc: NaN, entry: NaN, tc: NaN, cF: -9, cB: -9 };
    if (!(disc > 0) || !(vx > 0)) return r;
    var root = Math.sqrt(disc);
    r.reach = true;
    r.tc = (vy + root) / g;                    // 下落时穿过篮圈平面的时刻
    r.xc = vx * r.tc;
    r.entry = Math.atan2(root, vx);            // 入筐角
    var tEnd = (vy + Math.sqrt(disc + 4 * g * RB)) / g;      // 球心降到圈下一个球直径处，之后不可能再碰到圈
    var t0 = Math.max(0, (D - 1.2) / vx);
    if (tEnd < t0 + 0.05) t0 = Math.max(0, tEnd - 0.3);
    function d2(t, px) { var x = vx * t - px, y = h0 + vy * t - 0.5 * g * t * t - HOOP.RIM_H; return x * x + y * y; }
    function near(px) {                        // 球心离 (px, 圈高) 最近时的距离：先粗扫，再黄金分割细化
      var n = Math.max(8, Math.ceil((tEnd - t0) / 0.008)), h = (tEnd - t0) / n, best = t0, bd = Infinity, i, d;
      for (i = 0; i <= n; i++) { d = d2(t0 + h * i, px); if (d < bd) { bd = d; best = t0 + h * i; } }
      var a = Math.max(0, best - h), b = best + h;
      for (i = 0; i < 44; i++) { var c1 = b - GOLD * (b - a), c2 = a + GOLD * (b - a); if (d2(c1, px) < d2(c2, px)) b = c2; else a = c1; }
      return Math.sqrt(d2((a + b) / 2, px));
    }
    r.cF = (r.xc > D - RR ? 1 : -1) * near(D - RR) - RB;
    r.cB = (r.xc < D + RR ? 1 : -1) * near(D + RR) - RB;
    r.swish = r.cF >= 0 && r.cB >= 0;
    return r;
  };
  /** 固定出手角，能空心入网的出手速度范围 { lo, hi, mid, entry }；这个角度进不了时返回 null。 */
  P.hoopWindow = function (th, h0, D) {
    var vc = P.hoopCenterSpeed(th, h0, D);
    if (!(vc > 0)) return null;
    function m(v) { var e = P.hoopEval(th, v, h0, D); return e.reach ? Math.min(e.cF, e.cB) : -9; }
    var a = vc * 0.92, b = vc * 1.08, i;
    for (i = 0; i < 48; i++) { var c1 = b - GOLD * (b - a), c2 = a + GOLD * (b - a); if (m(c1) > m(c2)) b = c2; else a = c1; }
    var vs = (a + b) / 2;
    if (m(vs) < 0) return null;
    function edge(bad) {                       // 二分：bad 这头进不了，vs 那头能进
      var good = vs;
      for (var k = 0; k < 50; k++) { var mid = (bad + good) / 2; if (m(mid) >= 0) good = mid; else bad = mid; }
      return good;
    }
    var w = { lo: edge(vc * 0.9), hi: edge(vc * 1.1) };
    w.mid = (w.lo + w.hi) / 2;
    w.entry = P.hoopEval(th, w.mid, h0, D).entry;
    return w;
  };
  /** 把每个出手角（度）的空心速度范围都算出来；easy = 最省力（所需速度最小）的那个角度。 */
  P.hoopTable = function (h0, D, a0, a1, step) {
    a0 = a0 || 30; a1 = a1 || 80; step = step || 0.5;
    var T = { h0: h0, D: D, a0: a0, a1: a1, step: step, rows: [], easy: null };
    for (var i = 0; a0 + i * step <= a1 + 1e-9; i++) {
      var a = a0 + i * step, w = P.hoopWindow(a * DEG, h0, D);
      T.rows.push(w);
      if (w && (!T.easy || w.lo < T.easy.v)) T.easy = { a: a, v: w.lo };
    }
    return T;
  };
  P.hoopRow = function (T, aDeg) {             // 表里线性插值
    var f = (aDeg - T.a0) / T.step, i = Math.floor(f), u = f - i;
    var p = T.rows[i], q = T.rows[i + 1];
    if (!p) return null;
    if (u < 1e-9 || !q) return u < 1e-9 ? p : null;
    return { lo: lerp(p.lo, q.lo, u), hi: lerp(p.hi, q.hi, u), mid: lerp(p.mid, q.mid, u), entry: lerp(p.entry, q.entry, u) };
  };
  function erf(x) {                            // Abramowitz & Stegun 7.1.26，绝对误差 < 1.5e−7
    var s = x < 0 ? -1 : 1, t = 1 / (1 + 0.3275911 * Math.abs(x));
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  /** 手会抖时的空心命中率：瞄准 (aDeg, v)，实际出手速度 ~ 正态(v, sigV·v)，角度 ~ 正态(aDeg, sigA°)。
   *  对角度做数值积分（±3.5σ，49 个点），每个角度下速度落在 [lo, hi] 里的概率用正态分布函数直接算。 */
  P.hoopHitRate = function (T, aDeg, v, sigV, sigA) {
    var sum = 0, ws = 0, K = sigA > 0 ? 24 : 0;        // sigA = 0：角度不抖，只算一个点
    for (var k = -K; k <= K; k++) {
      var z = K ? 3.5 * k / K : 0, wt = Math.exp(-0.5 * z * z), w = P.hoopRow(T, aDeg + z * sigA);
      ws += wt;
      if (!w) continue;
      sum += wt * (sigV > 0 ? Phi((w.hi - v) / (sigV * v)) - Phi((w.lo - v) / (sigV * v)) : v >= w.lo && v <= w.hi ? 1 : 0);
    }
    return sum / ws;
  };
  /** 每个角度都瞄准自己速度范围的正中间，手抖时的命中率；best = 命中率最高（最稳）的角度（只在 ≤ aMax 的角度里找）。 */
  P.hoopStable = function (T, sigV, sigA, aMax) {
    var rates = [], best = null;
    T.rows.forEach(function (w, i) {
      var a = T.a0 + i * T.step, r = w ? P.hoopHitRate(T, a, w.mid, sigV, sigA) : 0;
      rates.push(r);
      if (w && (aMax == null || a <= aMax + 1e-9) && (!best || r > best.rate + 1e-12)) best = { a: a, rate: r };
    });
    return { rates: rates, best: best };
  };

  /* ---------- 逐步模拟（带碰撞）：组件里球就是这么飞的 ---------- */
  P.hoopShot = function (th, v, h0, D) {
    return { x: 0, y: h0, vx: v * Math.cos(th), vy: v * Math.sin(th), t: 0, D: D,
      rim: false, board: false, scored: false, landed: false, over: false, bounces: 0,
      cross: null,        // 没碰到任何东西之前、下落穿过篮圈平面的那一下：{ x, entry }（先碰了筐或板就没有）
      entry: null,        // 进球那一下的入筐角
      result: null };     // swish 空心 / rattle 蹭筐进 / bank 打板进 / out 碰到了没进 / air 三不沾
  };
  function hoopBounce(s, px, py, e) {          // 球碰到点 (px, py)：推出去，法向速度反向并乘以 e
    var dx = s.x - px, dy = s.y - py, d = hypot(dx, dy);
    if (d >= RB || d === 0) return false;
    var nx = dx / d, ny = dy / d, vn = s.vx * nx + s.vy * ny;
    s.x = px + nx * RB; s.y = py + ny * RB;
    if (vn < 0) { s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny; }
    return true;
  }
  P.hoopStep = function (s, dt) {
    var C = HOOP, D = s.D, y0 = s.y, x0 = s.x, vy0 = s.vy;
    s.x += s.vx * dt;                          // 匀加速运动的精确更新（不是欧拉近似）
    s.y += s.vy * dt - 0.5 * C.G * dt * dt;
    s.vy -= C.G * dt;
    s.t += dt;
    if (y0 > C.RIM_H && s.y <= C.RIM_H) {      // 下落穿过篮圈平面
      var f = (y0 - C.RIM_H) / (y0 - s.y), xc = x0 + (s.x - x0) * f, ang = Math.atan2(-(vy0 + (s.vy - vy0) * f), Math.abs(s.vx));
      if (!s.cross && !s.rim && !s.board) s.cross = { x: xc, entry: ang };
      if (!s.scored && !s.landed && Math.abs(xc - D) < RR) { s.scored = true; s.entry = ang; }
    }
    if (s.scored && s.y < C.RIM_H - RB) {
      // 整个球已经落到篮圈平面以下、兜在网里：判定到此为止。球网把横向速度兜掉，也不让球穿到篮板后面（只为好看）
      s.vx *= Math.max(0, 1 - 14 * dt);
      if (s.x > D + C.BOARD_X - RB) { s.x = D + C.BOARD_X - RB; s.vx = 0; }
    } else {
      // 球心穿过篮圈平面以后，球的上半边仍然可能蹭到后沿，所以进球之后照样检查（那算“蹭筐进”，不算空心）
      if (hoopBounce(s, D - RR, C.RIM_H, C.E_RIM)) s.rim = true;
      if (hoopBounce(s, D + RR, C.RIM_H, C.E_RIM)) s.rim = true;
      if (hoopBounce(s, D + C.BOARD_X, clamp(s.y, C.BOARD_LO, C.BOARD_HI), C.E_BOARD)) s.board = true;
    }
    if (s.y < RB) {
      s.y = RB;
      if (s.vy < 0) s.vy = -s.vy * C.E_FLOOR;
      s.landed = true; s.bounces++;
    }
    var gone = s.t > 8 || s.x < -4 || s.x > D + 5;
    if (!s.result && (s.landed || gone || (s.scored && s.y < C.RIM_H - 0.6))) {
      s.result = s.scored ? (s.rim ? 'rattle' : s.board ? 'bank' : 'swish') : (s.rim || s.board) ? 'out' : 'air';
    }
    if (s.result && (s.landed || gone)) s.over = true;
    return s;
  };
  /** 一口气模拟到出结果（测试和“这一球会怎样”的判定用）。 */
  P.hoopRun = function (th, v, h0, D) {
    var s = P.hoopShot(th, v, h0, D);
    for (var i = 0; i < 6000 && !s.result; i++) P.hoopStep(s, HOOP.DT);
    return s;
  };
  /** 正态随机数（Box–Muller），rnd 是 0–1 均匀随机函数 */
  P.gauss = function (rnd) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd()); };

  var HOOP_SPOTS = {
    near: { d: 3, name: '近投' }, ft: { d: HOOP.FT, name: '罚球线' }, mid: { d: 5.5, name: '中距离' },
    three: { d: HOOP.THREE, name: '三分线' }, far: { d: 8, name: '超远' }
  };
  var HOOP_PLAN = { ft: ['ft', 'ft', 'ft', 'ft', 'ft'], three: ['three', 'three', 'three', 'three', 'three'], mix: ['near', 'ft', 'mid', 'three', 'far'] };
  var HOOP_HEIGHTS = [1.6, 1.8, 2.0, 2.2, 2.4, 2.6];
  var HOOP_SAY = { swish: '空心入网！', rattle: '蹭筐进了', bank: '打板进！', out: '碰到了，没进', air: '三不沾' };
  var HOOP_WHY = '从球的角度看篮筐：球是斜着飞过去的，所以篮圈在它眼里不是一个正圆，而是被压扁的椭圆。\n\n' +
    '**看起来的宽度 = 篮圈直径 × sin(入筐角)**\n\n' +
    '篮圈内径 ' + fix(HOOP.RIM_D * 100, 1) + ' 厘米，球直径约 ' + fix(HOOP.BALL_D * 100, 1) + ' 厘米。入筐角 90°（垂直掉进去）时，篮筐足足有 ' + fix(HOOP.RIM_D * 100, 1) + ' 厘米宽；' +
    '入筐角 45° 时只剩 ' + fix(P.hoopApparent(45 * DEG) * 100, 1) + ' 厘米；小于 ' + Math.floor(P.hoopMinEntry() / DEG) + '° 时，这条缝比球还窄，不蹭筐根本进不去。\n\n' +
    '所以弧线高一点，球眼里的篮筐就大一点，前后差几厘米也照样进。代价是：弧线越高，出手越费力。\n\n' +
    '这里只算了重力：没有空气阻力，没有旋转，球也不会左右偏。';
  var HOOP_WHY_X = '绿色的带子：每个出手角度下，能空心入网的出手速度范围。带子越宽，力气大一点小一点都没事。\n\n' +
    '最省力的角度在带子的最低点；再平就要更用力，而且带子很快变细、消失。\n\n' +
    '黄线是“手会抖”时的命中率：假设每次出手，速度会差 ' + fix(HOOP.SIG_V * 100, 1) + '%，角度会差 ' + HOOP.SIG_A + '°。' +
    '试试只让速度抖、只让角度抖：只抖角度时，最省力的角度附近最稳（那里的带子是平的，角度歪一点没影响）；只抖速度时，越高越稳。两样都抖，答案在中间偏高的地方。\n\n' +
    '这只是一个只算重力、只算空心球的模型。真的投篮还有旋转和蹭筐弹进，弧线太高也更费力、更难控制，所以别把这里的“最稳角度”当成标准答案。';

  function hoopView(root, params, ctx, preview) {
    var C = HOOP, pal = palette(root);
    var mode = preview ? 'preview' : params.mode === 'challenge' || params.mode === 'explore' ? params.mode : 'free';
    var spotKey = params.spot === 'three' || (params.spot === 'mix' && mode === 'challenge') ? params.spot : 'ft';
    var h0 = clamp(+params.height || C.H0, 1.4, 2.8);
    var D = HOOP_SPOTS[HOOP_PLAN[spotKey][0]].d;
    var aim = { a: 52, v: 7.3 };                 // 瞄准：出手角（度）、出手速度（m/s）
    var ui = preview ? { stage: root } : scaffold(root, 'hoopshot');
    var cv = makeCanvas(ui.stage, 'w-hoopshot-cv', preview);
    var timers = makeTimers(), stepper = makeStepper(C.DT, 60);
    var shot = null, flying = false, reported = false, path = [], ghosts = [], sub = 0;
    var S = 0, hx = 0, fy = 0, flash = null, flashT = 0, eyeEntry = NaN;
    var onResult = function () {}, onOver = function () {}, extraDraw = null, guideFull = false, band = null, o4 = [0, 0, 0, 0];
    var pathD = D, rest = 0;      // 当前这条轨迹是在哪个距离投的；球落地后歇多久回到手里

    function courtRect() { return mode === 'explore' ? { x: 0, y: 0, w: cv.w, h: Math.round(cv.h * 0.5) } : { x: 0, y: 0, w: cv.w, h: cv.h }; }
    function apexOf(a, v) { var vy = v * Math.sin(a * DEG); return h0 + vy * vy / (2 * C.G); }
    /** 镜头：把“出手的人—篮架”整个放进画面，横竖同一个比例（按真实比例画）。 */
    function frame(dt) {
      var r = courtRect(), camD = preview ? C.THREE : D, xr = camD + 2.1;
      var top = band ? apexOf(aim.a, band.hi) : apexOf(aim.a, aim.v);
      if (shot && flying) top = Math.max(top, shot.y);
      var yr = clamp(Math.max(4.6, top + 0.7), 4.6, 9.5);
      var target = Math.min(r.w / xr, (r.h - 30) / yr);
      S = S && dt ? S + (target - S) * Math.min(1, dt * 7) : target;
      hx = r.x + r.w - (r.w - xr * S) / 2 - 1.0 * S;
      fy = r.y + r.h - 26;
    }
    function X(x, d) { return hx + (x - (d == null ? D : d)) * S; }      // x 从出手点量起；篮圈中心在 x = D
    function Y(y) { return fy - y * S; }

    function drawCourt(r) {
      var g = cv.g, bx = X(D + C.BOARD_X), ry = Y(C.RIM_H), i;
      g.fillStyle = pal.surface; g.fillRect(r.x, fy, r.w, r.y + r.h - fy);
      g.strokeStyle = pal.muted; g.lineWidth = 1.5; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(r.x, fy); g.lineTo(r.x + r.w, fy); g.stroke();
      g.strokeStyle = pal.surface3; g.lineWidth = Math.max(3, 0.13 * S); g.lineJoin = 'round';     // 篮架
      g.beginPath(); g.moveTo(X(D + 0.85), fy); g.lineTo(X(D + 0.85), Y(2.75)); g.lineTo(bx + 0.04 * S, Y(3.25)); g.stroke();
      g.fillStyle = pal.ink2;                                                                      // 篮板
      g.fillRect(bx, Y(C.BOARD_HI), Math.max(2.5, 0.04 * S), (C.BOARD_HI - C.BOARD_LO) * S);
      var sw = flash && flash.net ? Math.sin(flashT * 22) * 0.05 * Math.max(0, 1 - flashT / 0.5) : 0;   // 进球后球网晃两下
      g.strokeStyle = pal.ink2; g.globalAlpha = 0.55; g.lineWidth = 1;
      for (i = 0; i <= 4; i++) {
        var u = i / 4, x0 = D - RR + u * 2 * RR, x1 = D - 0.13 + u * 0.26 + sw;
        g.beginPath(); g.moveTo(X(x0), ry); g.lineTo(X(x1), Y(C.RIM_H - 0.42)); g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = pal.danger; g.lineWidth = Math.max(2.5, 0.04 * S); g.lineCap = 'round';      // 篮圈（侧面看是一条线）
      g.beginPath(); g.moveTo(X(D - RR), ry); g.lineTo(bx, ry); g.stroke();
      g.strokeStyle = pal.muted; g.lineWidth = 1;                                                  // 地上的距离标注
      g.beginPath(); g.moveTo(X(0), fy + 4); g.lineTo(X(0), fy + 10); g.moveTo(X(D), fy + 4); g.lineTo(X(D), fy + 10); g.moveTo(X(0), fy + 7); g.lineTo(X(D), fy + 7); g.stroke();
      var nm = '';
      Object.keys(HOOP_SPOTS).forEach(function (k) { if (HOOP_SPOTS[k].d === D) nm = HOOP_SPOTS[k].name + ' · '; });
      text(g, nm + '离篮筐 ' + fix(D, 3) + ' 米', X(D / 2), fy + 8 + pal.xs, pal.muted, pal.xs, 'center', pal.font);
    }
    function drawShooter() {
      var g = cv.g, x = X(-0.3), tall = h0 * 0.86;        // 画一个小人：出手点在头顶上方一点
      g.strokeStyle = pal.muted; g.fillStyle = pal.muted; g.lineCap = 'round'; g.lineWidth = Math.max(3, 0.15 * S);
      g.beginPath(); g.moveTo(x, fy - 0.08 * S); g.lineTo(x, Y(tall * 0.8)); g.stroke();
      g.lineWidth = Math.max(2, 0.08 * S);
      g.beginPath(); g.moveTo(x, Y(tall * 0.8)); g.lineTo(X(-0.06), Y(h0 - 0.14)); g.stroke();
      g.beginPath(); g.arc(x, Y(tall - 0.11), Math.max(3, 0.11 * S), 0, TAU); g.fill();
    }
    function drawBall(x, y) {
      var g = cv.g, r = Math.max(3.5, RB * S), px = X(x), py = Y(y);
      g.fillStyle = pal.p1;
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
      if (r > 5) {
        g.strokeStyle = pal.bg; g.globalAlpha = 0.55; g.lineWidth = Math.max(1, r * 0.12);
        g.beginPath(); g.moveTo(px - r, py); g.lineTo(px + r, py); g.moveTo(px, py - r); g.lineTo(px, py + r); g.stroke();
        g.globalAlpha = 1;
      }
    }
    function drawPath(p, d, color, alpha, width) {
      var g = cv.g;
      if (p.length < 4) return;
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      for (var i = 0; i < p.length; i += 2) { if (i) g.lineTo(X(p[i], d), Y(p[i + 1])); else g.moveTo(X(p[i], d), Y(p[i + 1])); }
      g.stroke();
      g.globalAlpha = 1;
    }
    /** 用解析解画一条弧线：到球心落回篮圈高度为止（够不着就画到落地）；frac < 1 时只画开头一段。 */
    function arcPoints(a, v, frac) {
      var th = a * DEG, e = P.hoopEval(th, v, h0, D), vy = v * Math.sin(th);
      var tEnd = e.reach ? e.tc : (vy + Math.sqrt(vy * vy + 2 * C.G * (h0 - RB))) / C.G, pts = [];
      for (var i = 0, n = 48; i <= n * frac; i++) { P.hoopAt(th, v, h0, tEnd * i / n, o4); pts.push(o4[0], o4[1]); }
      return pts;
    }
    function drawGuide() {
      var g = cv.g, pts = arcPoints(aim.a, aim.v, guideFull ? 1 : 0.34);
      g.fillStyle = pal.ink; g.globalAlpha = 0.6;
      for (var i = 2; i < pts.length; i += 2) { g.beginPath(); g.arc(X(pts[i]), Y(pts[i + 1]), 1.7, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    /** “球眼里的篮筐”：沿来球方向看，篮圈是一个压扁的椭圆，前后方向只剩 内径 × sin(入筐角)。
     *  画在控件区左上角的小画布上（它同时是「为什么」按钮），旁边一行字给出数字。 */
    var EYE_W = 58, EYE_H = 54, eye = null, eyeG = null, eyeSay = null, eyeShown = null;
    function buildEye(btn) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      eye = U.el('canvas.w-hoopshot-eye');
      eye.width = EYE_W * dpr; eye.height = EYE_H * dpr;
      eye.style.width = EYE_W + 'px'; eye.style.height = EYE_H + 'px';
      eyeG = eye.getContext('2d');
      eyeG.setTransform(dpr, 0, 0, dpr, 0, 0);
      btn.insertBefore(eye, btn.firstChild);
      eyeSay = U.el('div.w-hoopshot-eyesay.jn-num');
    }
    function drawEye() {
      var key = eyeEntry > 0 ? Math.round(eyeEntry / DEG * 10) : -1;
      if (!eyeG || key === eyeShown) return;
      eyeShown = key;
      var g = eyeG, a = EYE_W / 2 - 3, cx = EYE_W / 2, cy = EYE_H / 2, rb = a * C.BALL_D / C.RIM_D;
      g.clearRect(0, 0, EYE_W, EYE_H);
      if (key < 0) { eyeSay.textContent = '球还到不了篮筐的高度'; eyeSay.classList.remove('is-bad'); return; }
      var bb = a * Math.sin(eyeEntry), fits = bb >= rb;
      g.fillStyle = pal.p1;
      g.beginPath(); g.arc(cx, cy, rb, 0, TAU); g.fill();
      g.strokeStyle = fits ? pal.ok : pal.danger; g.lineWidth = 3;
      g.beginPath(); g.ellipse(cx, cy, a, Math.max(1, bb), 0, 0, TAU); g.stroke();
      eyeSay.textContent = '入筐角 ' + Math.round(eyeEntry / DEG) + '°：球眼里的篮筐' + (fits ? '有 ' : '只剩 ') + fix(P.hoopApparent(eyeEntry) * 100, 1) + ' 厘米宽' +
        (fits ? '' : '，比球（' + fix(C.BALL_D * 100, 1) + '）还窄');
      eyeSay.classList.toggle('is-bad', !fits);
    }
    function draw() {
      var g = cv.g, r = courtRect();
      if (!cv.w || !cv.h) return;
      if (!S) frame(0);
      g.clearRect(0, 0, cv.w, cv.h);
      drawCourt(r);
      ghosts.forEach(function (q, i) { drawPath(q.p, q.d, pal.ink2, 0.12 + 0.1 * i, 1.5); });
      if (band) {                                  // 探索：能空心的最慢和最快两条弧线，中间涂色
        var lo = arcPoints(aim.a, band.lo, 1), hi = arcPoints(aim.a, band.hi, 1), k;
        g.fillStyle = pal.ok; g.globalAlpha = 0.3;
        g.beginPath();
        for (k = 0; k < lo.length; k += 2) { if (k) g.lineTo(X(lo[k]), Y(lo[k + 1])); else g.moveTo(X(lo[k]), Y(lo[k + 1])); }
        for (k = hi.length - 2; k >= 0; k -= 2) g.lineTo(X(hi[k]), Y(hi[k + 1]));
        g.closePath(); g.fill();
        g.globalAlpha = 1;
        drawPath(lo, D, pal.ok, 0.9, 1.5); drawPath(hi, D, pal.ok, 0.9, 1.5);
      } else if (mode === 'explore') {             // 探索里进不了的角度：整条弧线画成红色虚线
        g.setLineDash([5, 5]); drawPath(arcPoints(aim.a, aim.v, 1), D, pal.danger, 0.9, 1.5); g.setLineDash([]);
      } else if (!flying && mode !== 'preview') drawGuide();
      drawPath(path, pathD, pal.p1, 0.95, 2);
      drawShooter();
      if (shot) drawBall(shot.x + D - shot.D, shot.y); else drawBall(0, h0);
      if (flash && flashT < 1.6) {
        g.globalAlpha = clamp(1.6 - flashT, 0, 1) * clamp(flashT * 6, 0, 1);
        text(g, flash.t, Math.min(X(D) - 6, r.x + r.w - 8), Y(C.BOARD_HI) - 10, flash.ok ? pal.ok : pal.ink2, pal.sm * 1.25, 'right', pal.font, 800);
        g.globalAlpha = 1;
      }
      if (extraDraw) extraDraw();
    }
    function fire(a, v) {
      if (flying) return false;
      if (path.length) { ghosts.push({ p: path, d: pathD }); if (ghosts.length > 3) ghosts.shift(); }
      shot = P.hoopShot(a * DEG, v, h0, D);
      path = [0, h0]; pathD = D; flying = true; reported = false; sub = 0; rest = 0; flash = null;
      ctx.sfx('whoosh');
      return true;
    }
    function predictEye() { var e = P.hoopEval(aim.a * DEG, band ? band.mid : aim.v, h0, D); eyeEntry = e.reach ? e.entry : NaN; }
    var loop = makeLoop(function (dt) {
      frame(dt);
      flashT += dt;
      if (flying) {
        var rim0 = shot.rim, board0 = shot.board, sc0 = shot.scored, b0 = shot.bounces;
        stepper(dt, function (h) {
          if (shot.over) return;
          P.hoopStep(shot, h);
          if (++sub % 6 === 0 && path.length < 1600) path.push(shot.x, shot.y);
        });
        if (shot.cross) eyeEntry = shot.cross.entry;
        if ((shot.rim && !rim0) || (shot.board && !board0)) { ctx.sfx('tick'); ctx.haptic(10); }
        if (shot.bounces > b0) ctx.sfx('tap');
        if (shot.scored && !sc0) { flash = { t: shot.rim ? HOOP_SAY.rattle : shot.board ? HOOP_SAY.bank : HOOP_SAY.swish, ok: true, net: true }; flashT = 0; ctx.sfx('good'); ctx.haptic(30); }
        if (shot.result && !reported) {
          reported = true;
          if (!shot.scored) { flash = { t: HOOP_SAY[shot.result], ok: false }; flashT = 0; }
          onResult(shot);
        }
        if (shot.over) { flying = false; onOver(); }
      } else if (shot && (rest += dt) > 0.45) shot = null;      // 球回到手里
      draw();
      drawEye();
    });

    /* ---------- 控件（三种模式共用的部分） ---------- */
    var hud = null, sA = null, sV = null, goBtn = null, dragging = false, doneSent = false;
    var aimChanged = function () { predictEye(); };
    function say(t) { if (hud) hud.textContent = t; }
    /** 顶行：左边是“球眼里的篮筐”小图（点它看「为什么」），右边两行字：入筐角的数字、这一球的结果 */
    function topRow(whyText) {
      var why = makeWhy(root, 'hoopshot', whyText);
      buildEye(why.btn);
      hud = U.el('div.w-hoopshot-hud');
      ui.panel.appendChild(U.el('div.w-hoopshot-top', [why.btn, U.el('div.w-hoopshot-says', [eyeSay, hud])]));
    }
    function describe(s) {
      if (s.scored) return HOOP_SAY[s.result];
      if (!s.cross) return s.rim || s.board ? '砸在筐上，弹出来了' : '三不沾：球没够着篮筐的高度';
      var cm = Math.round((s.cross.x - s.D) * 100);
      return HOOP_SAY[s.result] + '：落点离圈心' + (cm === 0 ? '不到 1 厘米' : cm < 0 ? '短了 ' + -cm + ' 厘米' : '远了 ' + cm + ' 厘米');
    }
    /** 换了位置或高度后，把速度拨到“差一点够着”的地方：给个起点，不给答案。 */
    function suggest() {
      var vc = P.hoopCenterSpeed(aim.a * DEG, h0, D);
      if (vc > 0) aim.v = clamp(Math.round(vc * 0.95 * 50) / 50, 5, 13);
      if (sV) sV.set(aim.v);
      aimChanged();
    }
    function aimControls(withSpeed) {
      sA = makeSlider('hoopshot', '角度', 35, 75, 0.5, aim.a, function (v) { return fix(v, 1) + '°'; }, function (v) { aim.a = v; aimChanged(); }, 0.5);
      ui.panel.appendChild(sA.row);
      if (!withSpeed) return;
      sV = makeSlider('hoopshot', '速度', 5, 13, 0.01, aim.v, function (v) { return v.toFixed(2) + ' 米/秒'; }, function (v) { aim.v = v; aimChanged(); }, 0.02);
      ui.panel.appendChild(sV.row);
    }
    function heightChip(then) {
      var b = U.el('button.jn-chip', { text: '出手点 ' + h0.toFixed(1) + ' 米', attrs: { type: 'button', 'aria-label': '出手点高度' }, on: { click: function () {
        h0 = HOOP_HEIGHTS[(HOOP_HEIGHTS.indexOf(h0) + 1) % HOOP_HEIGHTS.length];
        b.textContent = '出手点 ' + h0.toFixed(1) + ' 米';
        then();
      } } });
      return b;
    }
    function spotSeg(then) {
      return makeSeg('hoopshot', [{ v: 'ft', t: '罚球线' }, { v: 'three', t: '三分线' }], spotKey === 'three' ? 'three' : 'ft', function (v) {
        if (flying) return false;              // 球还在飞，等它落地再换位置
        D = HOOP_SPOTS[v].d; path = []; ghosts = []; shot = null;
        then();
      }).el;
    }
    /* 在球场上拖：手指相对出手点的方向定角度，距离定速度 */
    function onDown(e) { if (flying) return; dragging = true; capture(cv.el, e); onMove(e); e.preventDefault(); }
    function onMove(e) {
      if (!dragging || !sA) return;
      var p = ptOf(cv.el, e), r = courtRect();
      if (mode === 'explore' && p.y > r.h) { aim.a = clamp(Math.round((35 + 40 * (p.x - pal.xs * 3.4) / (cv.w - pal.xs * 6)) * 2) / 2, 35, 75); }
      else {
        var dx = (p.x - X(0)) / S, dy = (Y(h0) - p.y) / S;
        if (dx < 0.15) return;
        aim.a = clamp(Math.round(Math.atan2(dy, dx) / DEG * 2) / 2, 35, 75);
        if (sV) { aim.v = clamp(Math.round((4 + 2.2 * hypot(dx, dy)) * 50) / 50, 5, 13); sV.set(aim.v); }
      }
      sA.set(aim.a);
      aimChanged();
    }
    function onUp() { dragging = false; }

    /* ---------- 自由投 ---------- */
    function buildFree() {
      topRow(HOOP_WHY);
      aimControls(true);
      goBtn = mkBtn('出手', '.w-hoopshot-go', function () { if (fire(aim.a, aim.v)) say('……'); });
      ui.panel.appendChild(U.el('div.w-hoopshot-row', [goBtn, spotSeg(suggest), heightChip(suggest)]));
      say('调好角度和速度，点「出手」。虚线只画了开头一小段。');      // 自由投不给完整的瞄准线，靠试
      onResult = function (s) {
        say(describe(s));
        if (s.scored && !doneSent) { doneSent = true; ctx.done({ win: true, text: HOOP_SAY[s.result] }); if (s.result === 'swish') ctx.confetti(); }
      };
      suggest();
    }

    /* ---------- 挑战：进够 5 个用了几次出手。手会抖：速度 ±1%、角度 ±1°（标准差） ---------- */
    function buildChallenge() {
      var plan = HOOP_PLAN[spotKey], makes = 0, shots = 0, over = false, real = '', best = ctx.store.get('best-' + spotKey, 0);
      var score = U.el('div.w-hoopshot-score.jn-num');
      function spot() { var sp = HOOP_SPOTS[plan[Math.min(makes, plan.length - 1)]]; D = sp.d; return sp; }
      function show() { score.textContent = spot().name + ' · 进 ' + makes + '/' + plan.length + ' · 出手 ' + shots + ' 次' + (best ? ' · 最好 ' + best + ' 次' : ''); }
      function restart() {
        over = false; makes = 0; shots = 0; ghosts = []; path = []; shot = null;
        goBtn.textContent = '出手';
        show(); suggest();
        say('进 ' + plan.length + ' 个要出手几次？注意：手会抖一点，实际出手和你瞄的不完全一样。');
      }
      topRow('挑战里你的手会抖：每次出手，速度大约差 ' + fix(C.SIG_V * 100, 1) + '%，角度大约差 ' + C.SIG_A + '°（都是随机的）。所以光瞄准还不够，得选一条“差一点也能进”的弧线。\n\n' + HOOP_WHY);
      guideFull = true;
      aimControls(true);
      goBtn = mkBtn('出手', '.w-hoopshot-go', function () {
        if (over) { restart(); return; }
        var a = aim.a + P.gauss(Math.random) * C.SIG_A, v = aim.v * (1 + P.gauss(Math.random) * C.SIG_V);
        if (!fire(a, v)) return;
        shots++;
        real = '实际出手 ' + a.toFixed(1) + '°、' + v.toFixed(2) + ' 米/秒';
        say(real);
        show();
      });
      ui.panel.appendChild(U.el('div.w-hoopshot-row', [goBtn, score]));
      onResult = function (s) {
        if (s.scored) makes++;
        say(describe(s) + '（' + real + '）');
      };
      onOver = function () {
        if (over || !shot || !shot.scored) { show(); return; }
        if (makes < plan.length) { if (spot().d !== shot.D) { path = []; ghosts = []; shot = null; suggest(); } show(); return; }
        over = true;
        var record = !best || shots < best;
        if (record) { best = shots; ctx.store.set('best-' + spotKey, best); }
        show();
        say('进 ' + plan.length + ' 个用了 ' + shots + ' 次出手' + (record ? '，新纪录！' : '。最好成绩 ' + best + ' 次'));
        goBtn.textContent = '再来一局';
        ctx.done({ win: true, text: '进 ' + plan.length + ' 个用了 ' + shots + ' 次出手' });
        ctx.sfx('win');
        if (record) ctx.confetti();
      };
      restart();
    }

    /* ---------- 探索：每个角度能空心的速度范围、最省力的角度、手抖时最稳的角度 ---------- */
    function buildExplore() {
      var cache = {}, wob = 'both', T = null, st = null, A0 = 35, A1 = 75;
      function table() {
        var key = h0 + '|' + D;
        T = cache[key] || (cache[key] = P.hoopTable(h0, D));
        st = P.hoopStable(T, wob === 'a' ? 0 : C.SIG_V, wob === 'v' ? 0 : C.SIG_A, A1);
        aimChanged();
      }
      function chart() {
        var g = cv.g, r = courtRect(), fs = pal.xs, top = r.h, i, a, w;
        var x0 = fs * 3.4, x1 = cv.w - fs * 2.6, y0 = top + fs * 2.6, y1 = cv.h - fs * 1.7, vLo = Infinity, vHi = -Infinity, rMax = 0.05;
        T.rows.forEach(function (w, i) {
          a = T.a0 + i * T.step;
          if (w && a >= A0 && a <= A1) { vLo = Math.min(vLo, w.lo); vHi = Math.max(vHi, w.hi); rMax = Math.max(rMax, st.rates[i]); }
        });
        if (!(vHi > vLo)) return;
        var room = Math.min(0.45, 2.1 * fs / (y1 - y0));           // 最低点下面留出写「最省力」的地方
        vHi += (vHi - vLo) * 0.1; vLo = T.easy.v - room * (vHi - T.easy.v) / (1 - room);
        function XA(a) { return x0 + (x1 - x0) * (a - A0) / (A1 - A0); }
        function YV(v) { return y1 - (y1 - y0) * (v - vLo) / (vHi - vLo); }
        function YR(q) { return y1 - (y1 - y0) * q / (rMax * 1.12); }
        g.strokeStyle = pal.line; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.stroke();
        for (a = 40; a <= 70; a += 10) text(g, a + '°', XA(a), y1 + fs * 1.2, pal.muted, fs, 'center', pal.num);
        text(g, vHi.toFixed(1), x0 - 4, y0 + fs * 0.4, pal.muted, fs, 'right', pal.num);
        text(g, vLo.toFixed(1), x0 - 4, y1, pal.muted, fs, 'right', pal.num);
        text(g, '绿：能空心的速度（米/秒）', fs * 0.6, top + fs * 1.3, pal.ok, fs, 'left', pal.font, 600);
        text(g, '黄：手抖命中率', cv.w - fs * 0.6, top + fs * 1.3, pal.accent, fs, 'right', pal.font, 600);
        var first = -1, last = -1;
        T.rows.forEach(function (w, i) { a = T.a0 + i * T.step; if (w && a >= A0 && a <= A1) { if (first < 0) first = i; last = i; } });
        g.fillStyle = pal.ok; g.globalAlpha = 0.5;
        g.beginPath();
        for (i = first; i <= last; i++) { w = T.rows[i]; a = T.a0 + i * T.step; if (i === first) g.moveTo(XA(a), YV(w.lo)); else g.lineTo(XA(a), YV(w.lo)); }
        for (i = last; i >= first; i--) g.lineTo(XA(T.a0 + i * T.step), YV(T.rows[i].hi));
        g.closePath(); g.fill();
        g.globalAlpha = 0.9; g.strokeStyle = pal.ok; g.lineWidth = 1.2; g.lineJoin = 'round'; g.stroke();      // 描一圈边：带子很细的地方也看得见
        g.globalAlpha = 1; g.strokeStyle = pal.accent; g.lineWidth = 2;
        g.beginPath();
        for (i = first; i <= last; i++) { a = T.a0 + i * T.step; if (i === first) g.moveTo(XA(a), YR(st.rates[i])); else g.lineTo(XA(a), YR(st.rates[i])); }
        g.stroke();
        text(g, Math.round(rMax * 100) + '%', x1 + 4, YR(rMax) + fs * 0.35, pal.accent, fs, 'left', pal.num);
        if (XA(T.a0 + first * T.step) - x0 > fs * 5) text(g, '进不了', (x0 + XA(T.a0 + first * T.step)) / 2, (y0 + y1) / 2, pal.muted, fs, 'center', pal.font);
        g.fillStyle = pal.p2;                             // 最省力
        g.beginPath(); g.arc(XA(T.easy.a), YV(T.easy.v), 4.5, 0, TAU); g.fill();
        text(g, '最省力 ' + fix(T.easy.a, 1) + '°', XA(T.easy.a), YV(T.easy.v) + fs * 1.4, pal.p2, fs, 'center', pal.font, 700);
        if (st.best) {                                    // 最稳
          g.fillStyle = pal.accent;
          g.beginPath(); g.arc(XA(st.best.a), YR(st.best.rate), 4.5, 0, TAU); g.fill();
          text(g, st.best.a >= A1 ? '越高越稳' : '最稳 ' + fix(st.best.a, 1) + '°', Math.min(XA(st.best.a), x1 - fs * 2.2), YR(st.best.rate) - fs * 0.7, pal.accent, fs, 'center', pal.font, 700);
        }
        g.strokeStyle = pal.ink; g.lineWidth = 1.5;        // 当前角度
        g.beginPath(); g.moveTo(XA(aim.a), y0); g.lineTo(XA(aim.a), y1); g.stroke();
        if (band) { g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(XA(aim.a), YV(band.lo)); g.lineTo(XA(aim.a), YV(band.hi)); g.stroke(); }
      }
      topRow(HOOP_WHY_X + '\n\n' + HOOP_WHY);
      aimControls(false);
      aimChanged = function () {
        band = P.hoopRow(T, aim.a);
        aim.v = band ? band.mid : P.hoopCenterSpeed(aim.a * DEG, h0, D) || aim.v;      // 进不了的角度：拿“正好送到圈心”的速度来画
        predictEye();
        var i = Math.round((aim.a - T.a0) / T.step);
        say(fix(aim.a, 1) + '° 出手：' + (band ? '速度在 ' + band.lo.toFixed(2) + '–' + band.hi.toFixed(2) + ' 米/秒之间都能空心（余地 ' + ((band.hi - band.lo) / band.mid * 100).toFixed(1) + '%）。手抖时命中率 ' +
          Math.round(st.rates[i] * 100) + '%。' : '入筐角不到 ' + Math.floor(P.hoopMinEntry() / DEG) + '°，不蹭筐进不去。'));
      };
      goBtn = mkBtn('投一个', '.w-hoopshot-go', function () { fire(aim.a, aim.v); });
      ui.panel.appendChild(U.el('div.w-hoopshot-row', [goBtn, spotSeg(table)]));
      ui.panel.appendChild(U.el('div.w-hoopshot-row', [U.el('span.w-hoopshot-lab', { text: '手抖' }),
        makeSeg('hoopshot', [{ v: 'v', t: '只抖速度' }, { v: 'a', t: '只抖角度' }, { v: 'both', t: '都抖' }], wob, function (v) { wob = v; table(); }).el]));
      onResult = function (s) { if (s.scored && !doneSent) { doneSent = true; ctx.done({ text: '最省力 ' + fix(T.easy.a, 1) + '°' }); } };
      extraDraw = chart;
      aim.a = 58;
      sA.set(aim.a);
      table();
    }

    /* ---------- 预览：罚球线、三分线轮流出手，个个空心，留下轨迹 ---------- */
    function buildPreview() {
      var list = [['ft', 53], ['three', 50], ['ft', 63], ['three', 59]], i = 0;
      function next() {
        var it = list[i++ % list.length];
        D = HOOP_SPOTS[it[0]].d;
        aim.a = it[1];
        aim.v = P.hoopWindow(aim.a * DEG, h0, D).mid;
        fire(aim.a, aim.v);
      }
      onOver = function () { timers.later(next, 650); };
      if (ctx.reduced) { D = C.FT; aim.a = 58; aim.v = P.hoopWindow(58 * DEG, h0, D).mid; path = arcPoints(aim.a, aim.v, 1); }
      else timers.later(next, 250);
    }

    if (mode === 'preview') buildPreview();
    else {
      if (mode === 'challenge') buildChallenge(); else if (mode === 'explore') buildExplore(); else buildFree();
      cv.el.addEventListener('pointerdown', onDown);
      cv.el.addEventListener('pointermove', onMove);
      cv.el.addEventListener('pointerup', onUp);
      cv.el.addEventListener('pointercancel', onUp);
    }

    autoFit(cv, ctx, function () { S = 0; draw(); });
    predictEye();
    draw();
    drawEye();
    if (!(preview && ctx.reduced)) loop.start();
    return {
      destroy: function () {
        loop.destroy(); timers.clear(); cv.dispose();
        cv.el.removeEventListener('pointerdown', onDown);
        cv.el.removeEventListener('pointermove', onMove);
        cv.el.removeEventListener('pointerup', onUp);
        cv.el.removeEventListener('pointercancel', onUp);
      }
    };
  }

  JN.registerWidget({
    id: 'hoopshot',
    name: '投篮物理',
    rules: '调好出手角度和速度，点「出手」。球只受重力，按真实比例飞向 3.05 米高的篮筐。挑战模式里手会抖一点点，看进 5 个要出手几次；探索模式看哪个角度最省力、哪个最稳。',
    mount: function (root, params, ctx) { return hoopView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return hoopView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 7. scale 如果地球是一个篮球
   *
   * 同一个比例尺：k = 球的直径 ÷ 地球直径。任何真实长度 × k 就是缩小后的长度，全部现算。
   * 数据来源：NASA Planetary Fact Sheet 与各天体的 Fact Sheet（nssdc.gsfc.nasa.gov/planetary/factsheet/，2026 年 11 月核对）
   *   直径 = Planetary Fact Sheet 主表的 “Diameter (km)” 一行，也就是赤道直径（百科和课本上列的也是这个口径）：
   *     地球 12,756；月球 3,475；火星 6,792；木星 142,984；土星 120,536；海王星 49,528
   *     太阳不在主表里，用 Sun Fact Sheet 的半径 695,700 × 2 = 1,391,400（太阳几乎是正球，不分赤道和两极）
   *   距离 = Semimajor axis（轨道半长轴，10^6 km）：月球到地球 0.3844；火星 227.956；木星 778.479；土星 1432.041；海王星 4514.953
   *   日地距离用 1 天文单位 = 149,597,870.7 km（IAU 定义值；NASA 表里写作 149.6）
   *   比邻星：距离 4.2465 光年（Gaia DR3 视差 768.07 毫角秒）；半径约 0.16 个太阳半径（不同测量在 0.154–0.162 之间，只当约数用）
   *   1 光年 = 9.4607304725808×10^12 km；光速 299,792.458 km/s（都是定义值）
   * “旅程”把天体排在一条直线上：地球 → 月球 → 太阳 → 太阳另一侧的火星、木星、土星、海王星 → 比邻星。
   *   行星写的是它到太阳的距离；真实的行星各转各的，并不会排成一排。
   * 参照物的大小（米）：乒乓球 0.040（ITTF）；网球 0.0654–0.0686（ITF），取 0.067；垒球周长 30.5 cm → 0.097；光盘 0.12；
   *   排球周长 65–67 cm → 0.21；足球（5 号）周长 68–70 cm → 0.22；篮球 0.246（同 hoopshot）；篮圈内径 0.45；
   *   乒乓球桌高 0.76、长 2.74（ITTF）；米尺 1；排球网高 2.43（男子）；篮筐高 3.05；篮球场 28 × 15（FIBA）；公交车约 12；泳池 50；
   *   7 号电池直径 10.5 mm；玻璃弹珠约 16 mm；绿豆、黄豆、大人身高、门高、轿车长度是约数。
   * params: { ball: 'basketball' | 'soccer' | 'pingpong' | 'marble' }
   * ================================================================== */
  var SCALE = {
    EARTH_D: 12756,                 // km：赤道直径
    MOON_DIST: 384400,              // km
    C_KMS: 299792.458,              // km/s
    LY_KM: 9.4607304725808e12,      // km
    EARTH_ROUND: 40075,             // km：赤道周长
    WALK_KMH: 4.5, DRIVE_KMH: 100, FLOOR_M: 3, TRACK_M: 400,
    BALLS: [
      { id: 'basketball', name: '篮球', d: HOOP.BALL_D },
      { id: 'soccer', name: '足球', d: 0.22 },
      { id: 'pingpong', name: '乒乓球', d: 0.04 },
      { id: 'marble', name: '玻璃弹珠', d: 0.016 }
    ],
    BODIES: [   // d：直径 km；dist：距离 km；from：从哪儿量
      { id: 'moon', name: '月球', d: 3475, dist: 384400, from: 'earth' },
      { id: 'sun', name: '太阳', d: 2 * 695700, dist: AU_KM, from: 'earth' },
      { id: 'mars', name: '火星', d: 6792, dist: 227.956e6, from: 'sun' },
      { id: 'jupiter', name: '木星', d: 142984, dist: 778.479e6, from: 'sun' },
      { id: 'saturn', name: '土星', d: 120536, dist: 1432.041e6, from: 'sun' },
      { id: 'neptune', name: '海王星', d: 49528, dist: 4514.953e6, from: 'sun' },
      { id: 'proxima', name: '比邻星', d: 0.16 * 2 * 695700, dist: 4.2465 * 9.4607304725808e12, from: 'sun', approx: true }
    ]
  };
  P.SCALE = SCALE;
  var SIZE_REFS = [
    [0.0045, '绿豆', 0], [0.007, '黄豆', 0], [0.0105, '7 号电池的粗细', 1], [0.016, '玻璃弹珠', 0], [0.04, '乒乓球', 0], [0.067, '网球', 0],
    [0.097, '垒球', 0], [0.12, '光盘', 0], [0.21, '排球', 0], [0.22, '足球', 0], [HOOP.BALL_D, '篮球', 0], [HOOP.RIM_D, '篮圈的口径', 1],
    [0.65, '健身球', 0], [0.76, '乒乓球桌的高度', 1], [1, '一把米尺的长度', 1], [1.7, '一个大人的身高', 1], [2, '一扇门的高度', 1], [2.43, '排球网的高度', 1],
    [2.74, '乒乓球桌的长度', 1], [HOOP.RIM_H, '篮筐的高度', 1], [4.5, '一辆小轿车的长度', 1], [12, '一辆公交车的长度', 1],
    [15, '篮球场的宽度', 1], [28, '篮球场的长度', 1], [50, '标准泳池的长度', 1]
  ];
  var DIST_REFS = [[HOOP.RIM_D, '篮圈的口径'], [1.525, '乒乓球桌的宽度'], [2.74, '乒乓球桌的长度'], [HOOP.FT, '罚球线到篮筐'], [HOOP.THREE, '三分线到篮筐'],
    [7.24, 'NBA 三分线到篮筐'], [15, '篮球场的宽度'], [28, '篮球场的长度']];
  function sp(n) { return /^[A-Za-z0-9]/.test(n) ? ' ' + n : n; }      // 中文后面接数字或字母时空一格

  /** 缩小后的长度（米）写成人话：6.70 厘米 / 7.41 米 / 2.89 千米 / 77.5 万千米 */
  P.fmtLen = function (m) {
    if (m < 0.01) return fmt3(m * 1000) + ' 毫米';
    if (m < 1) return fmt3(m * 100) + ' 厘米';
    if (m < 1000) return fmt3(m) + ' 米';
    if (m < 1e7) return fmt3(m / 1000) + ' 千米';
    return fmt3(m / 1e7) + ' 万千米';
  };
  /** 真实的长度（千米） */
  P.fmtKm = function (km) {
    if (km < 1e4) return group(km) + ' 千米';
    if (km < 1e8) return fmt3(km / 1e4) + ' 万千米';
    if (km < 1e12) return fmt3(km / 1e8) + ' 亿千米';
    return fmt3(km / 1e12) + ' 万亿千米';
  };
  function refLen(m) { return m < 0.02 ? fix(m * 1000, 1) + ' 毫米' : m < 1 ? fix(m * 100, 1) + ' 厘米' : fix(m, 2) + ' 米'; }
  function nearest(list, m) {
    var best = list[0];
    list.forEach(function (r) { if (Math.abs(Math.log(m / r[0])) < Math.abs(Math.log(m / best[0]))) best = r; });
    return best;
  }
  /** 给一个大小（米）找最接近的参照物，并照实说是差不多、大一圈还是小一圈。 */
  P.sizeRef = function (m) {
    var r = nearest(SIZE_REFS, m), q = m / r[0], n = sp(r[1]) + '（' + refLen(r[0]) + '）', t;
    if (q >= 0.93 && q <= 1.07) t = '和' + n + '差不多' + (r[2] ? '' : '大');
    else if (q > 1.07 && q <= 1.45) t = '比' + n + (r[2] ? '多一点' : '大一圈');
    else if (q < 0.93 && q >= 0.7) t = '比' + n + (r[2] ? '少一点' : '小一圈');
    else t = q > 1 ? '是' + n + '的 ' + fix(q, 1) + ' 倍' : '只有' + n + '的 ' + Math.round(q * 100) + '%';
    if (m > 6) t += '，约 ' + Math.round(m / SCALE.FLOOR_M) + ' 层楼高';
    return { text: t, name: r[1], size: r[0], q: q };
  };
  function mins(min) { return min >= 20 ? Math.round(min / 5) * 5 : Math.max(1, Math.round(min)); }
  /** 给一段距离（米）配一个参照：球场上的距离、跑道圈数、走路或开车的时间、绕地球几圈、几倍地月距离。 */
  P.distRef = function (m) {
    var km = m / 1000, h;
    if (m < 40) {
      var r = nearest(DIST_REFS, m), q = m / r[0], n = sp(r[1]) + '（' + (r[0] < 1 ? refLen(r[0]) : fix(r[0], 3) + ' 米') + '）';
      return q >= 0.93 && q <= 1.07 ? '和' + n + '差不多' : q > 1.07 && q <= 1.6 ? '比' + n + '远一点' : q < 0.93 && q >= 0.6 ? '比' + n + '近一点' :
        q > 1 ? '是' + n + '的 ' + fix(q, 1) + ' 倍' : '只有' + n + '的 ' + Math.round(q * 100) + '%';
    }
    if (m < 150) return '大约 ' + fix(m / 28, 1) + ' 个篮球场的长度';
    if (m < 2000) return '绕 ' + SCALE.TRACK_M + ' 米跑道 ' + fix(m / SCALE.TRACK_M, 1) + ' 圈';
    if (km < 30) { h = km / SCALE.WALK_KMH; return h < 0.92 ? '走路大约 ' + mins(h * 60) + ' 分钟' : '走路要 ' + fix(h, 1) + ' 小时'; }
    if (km < 2000) { h = km / SCALE.DRIVE_KMH; return '开车（时速 ' + SCALE.DRIVE_KMH + ' 千米）' + (h < 0.92 ? '大约 ' + mins(h * 60) + ' 分钟' : '要 ' + fix(h, 1) + ' 小时'); }
    if (km < SCALE.MOON_DIST / 2) return '能绕真正的地球 ' + fix(km / SCALE.EARTH_ROUND, 1) + ' 圈';
    return '是真正的地月距离（' + P.fmtKm(SCALE.MOON_DIST) + '）的 ' + fix(km / SCALE.MOON_DIST, 1) + ' 倍';
  };
  /** 比例尺：缩小后每 1 千米变成多少米 */
  P.scaleK = function (ballD) { return ballD / SCALE.EARTH_D; };
  /** 某个天体缩小后的直径、距离、在“旅程”直线上离地球多远（都是米） */
  P.scaleBody = function (b, ballD) {
    var k = P.scaleK(ballD);
    return { d: b.d * k, dist: b.dist * k, road: (b.id === 'moon' || b.id === 'sun' || b.id === 'proxima' ? b.dist : AU_KM + b.dist) * k };
  };
  /** 光：缩小后的光速（米/秒），以及真实的光行时间（秒 / 年） */
  P.scaleLight = function (ballD) {
    return { speed: SCALE.C_KMS * P.scaleK(ballD), sunSec: AU_KM / SCALE.C_KMS, moonSec: SCALE.MOON_DIST / SCALE.C_KMS,
      proximaYr: SCALE.BODIES[6].dist / SCALE.LY_KM };
  };

  function minSec(sec) { var m = Math.floor(sec / 60); return m + ' 分 ' + Math.floor(sec - m * 60) + ' 秒'; }
  function speedWord(v) { return v >= 3.5 ? '和骑自行车差不多' : v >= 1.6 ? '和慢跑差不多' : v >= 0.8 ? '和散步差不多' : '比散步还慢'; }

  function scaleView(root, params, ctx, preview) {
    var K = SCALE, pal = palette(root);
    var ball = K.BALLS.filter(function (b) { return b.id === params.ball; })[0] || K.BALLS[0];
    var ui = preview ? { stage: root } : scaffold(root, 'scale');
    var cv = makeCanvas(ui.stage, 'w-scale-cv', preview);
    var N = K.BODIES.length + 1;                 // 第 0 站是地球自己
    var p = 0, target = 0, drag = null, shown = -1, doneSent = false, light = -1, el = {};
    var COLOR = { moon: pal.ink2, sun: pal.accent, mars: pal.danger, jupiter: pal.warn, saturn: pal.accent, neptune: pal.p2, proxima: pal.danger };
    var sc = [];                                 // 每个天体缩小后的 { d, dist, road }
    function rescale() { sc = K.BODIES.map(function (b) { return P.scaleBody(b, ball.d); }); shown = -1; }
    function loglerp(a, b, u) { return Math.exp(lerp(Math.log(a), Math.log(b), u)); }
    /** 在第 i 站和第 i+1 站之间按对数插值（镜头“拉远”的感觉） */
    function between(f) { var i = Math.min(N - 2, Math.floor(p)), u = smooth(p - i); return loglerp(f(i), f(i + 1), u); }

    function drawEarth(x, y, r) {
      var g = cv.g;
      if (r < 2.5) { g.fillStyle = ball.id === 'basketball' ? pal.p1 : ball.id === 'marble' ? pal.p2 : pal.ink; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); return; }
      g.fillStyle = ball.id === 'basketball' ? pal.p1 : ball.id === 'marble' ? pal.p2 : pal.ink;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (r < 7) return;
      g.strokeStyle = pal.bg; g.globalAlpha = 0.55; g.lineWidth = Math.max(1, r * 0.07);
      g.beginPath();
      if (ball.id === 'basketball') {            // 篮球的纹路
        g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
        g.moveTo(x - r * 0.72, y - r * 0.69); g.quadraticCurveTo(x - r * 0.2, y, x - r * 0.72, y + r * 0.69);
        g.moveTo(x + r * 0.72, y - r * 0.69); g.quadraticCurveTo(x + r * 0.2, y, x + r * 0.72, y + r * 0.69);
      } else if (ball.id === 'soccer') {         // 足球：中间一块五边形
        for (var k = 0; k < 5; k++) {
          var a = -Math.PI / 2 + k * TAU / 5, a2 = a + TAU / 5;
          g.moveTo(x + r * 0.36 * Math.cos(a), y + r * 0.36 * Math.sin(a)); g.lineTo(x + r * 0.36 * Math.cos(a2), y + r * 0.36 * Math.sin(a2));
          g.moveTo(x + r * 0.36 * Math.cos(a), y + r * 0.36 * Math.sin(a)); g.lineTo(x + r * 0.95 * Math.cos(a), y + r * 0.95 * Math.sin(a));
        }
      } else g.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU);      // 乒乓球、弹珠：一点高光
      g.stroke();
      g.globalAlpha = 1;
    }
    function drawBody(i, x, y, r, alpha) {
      var g = cv.g, b = K.BODIES[i];
      g.globalAlpha = alpha; g.fillStyle = COLOR[b.id];
      g.beginPath(); g.arc(x, y, Math.max(2.5, r), 0, TAU); g.fill();
      if (b.id === 'saturn' && r > 6) {          // 土星环（外径约为球体的 2.3 倍）
        g.strokeStyle = pal.ink2; g.lineWidth = Math.max(1, r * 0.08);
        g.beginPath(); g.ellipse(x, y, r * 2.3, r * 0.5, -0.2, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    }
    /** 上半：把球和天体按同一个比例并排放在地上，比大小。 */
    function drawSizes(r) {
      var g = cv.g, fs = pal.xs, room = Math.min(r.h * 0.62, r.w * 0.42), floor = r.y + r.h - fs * 2.4;
      var s = between(function (i) { return room / Math.max(ball.d, i ? sc[i - 1].d : ball.d); });      // 每米多少像素
      var ex = r.x + r.w * lerp(0.5, 0.26, smooth(p)), bx = r.x + r.w * 0.68, er = ball.d * s / 2;
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      g.strokeStyle = pal.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(r.x + 12, floor + 0.5); g.lineTo(r.x + r.w - 12, floor + 0.5); g.stroke();
      for (var i = 0; i < K.BODIES.length; i++) {
        var a = 1 - Math.abs(p - (i + 1));
        if (a <= 0.02) continue;
        var br = sc[i].d * s / 2;
        drawBody(i, bx, floor - Math.max(br, 2.5), br, clamp(a, 0, 1));
        g.globalAlpha = clamp(a, 0, 1);
        text(g, K.BODIES[i].name + ' ' + P.fmtLen(sc[i].d), bx, floor + fs * 1.5, pal.ink, fs, 'center', pal.font, 600);
        g.globalAlpha = 1;
      }
      var man = 1.7 * s;                         // 一个 1.7 米高的大人当比例尺
      if (man > 7 && man < r.h * 0.8) {
        var mx = r.x + r.w * 0.4;                // 站在球和天体之间，不挡住谁
        g.strokeStyle = pal.muted; g.fillStyle = pal.muted; g.lineCap = 'round'; g.lineWidth = Math.max(1.5, man * 0.07);
        g.beginPath(); g.moveTo(mx, floor - man * 0.04); g.lineTo(mx, floor - man * 0.78); g.stroke();
        g.beginPath(); g.arc(mx, floor - man * 0.9, man * 0.09, 0, TAU); g.fill();
        text(g, '大人', mx, floor + fs * 1.5, pal.muted, fs, 'center', pal.font);
      }
      drawEarth(ex, floor - Math.max(er, 2.5), er);
      text(g, ball.name + '地球', ex, floor + fs * 1.5, pal.ink2, fs, 'center', pal.font, 600);
      g.restore();
    }
    /** 下半（预览里是全部）：一条直线上的“旅程”，位置和大小都按比例；小到看不见的画成一个 2.5 像素的点。 */
    function drawRoad(r) {
      var g = cv.g, fs = pal.xs, cy = r.y + r.h * 0.5;
      var span = between(function (i) { return i ? sc[i - 1].road : ball.d * 1.2; });
      var ex = r.x + r.w * lerp(0.5, 0.13, smooth(p)), usable = r.x + r.w * 0.9 - ex;
      function SX(x) { return ex + x / span * usable; }
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      g.strokeStyle = pal.line; g.lineWidth = 1; g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(r.x, cy + 0.5); g.lineTo(r.x + r.w, cy + 0.5); g.stroke();
      g.setLineDash([]);
      var cur = Math.round(p), lastLabel = ex;
      for (var i = 0; i < K.BODIES.length; i++) {
        var x = SX(sc[i].road), rr = sc[i].d / 2 / span * usable;
        if (x - rr > r.x + r.w + 4) break;
        drawBody(i, x, cy, rr, 1);
        if (i + 1 <= cur + 1 && x - lastLabel > fs * 2.6 && x < r.x + r.w - 4) {
          text(g, K.BODIES[i].name, Math.min(x, r.x + r.w - fs * 1.8), cy + Math.min(Math.max(rr, 3), r.h * 0.3) + fs * 1.4, i + 1 === cur ? pal.ink : pal.muted, fs, 'center', pal.font, i + 1 === cur ? 700 : 500);
          lastLabel = x;
        }
      }
      var er = ball.d / 2 / span * usable;
      drawEarth(ex, cy, er);
      text(g, '地球', ex, cy + Math.min(Math.max(er, 3), r.h * 0.34) + fs * 1.4, pal.ink2, fs, 'center', pal.font, 600);
      if (cur > 0 && Math.abs(p - cur) < 0.3) {    // 这一站的距离标注
        var b = K.BODIES[cur - 1], x1 = SX(sc[cur - 1].road), x0 = b.from === 'sun' && b.id !== 'proxima' ? SX(sc[1].road) : ex;
        var ty = preview ? cy + Math.min(r.h * 0.34, 46) : cy - Math.min(r.h * 0.3, 26);
        g.globalAlpha = clamp(1 - Math.abs(p - cur) / 0.3, 0, 1);
        if (preview) {                             // 预览没有上半部分的比大小，这里给两头各画一个放大的样子（同一个放大倍数）
          var mag = Math.min(r.h * 0.2, 24) / (Math.max(ball.d, sc[cur - 1].d) / 2), by = cy - Math.min(r.h * 0.32, 48);
          g.strokeStyle = pal.line; g.lineWidth = 1;
          g.beginPath(); g.moveTo(ex, cy - 5); g.lineTo(ex, by); g.moveTo(x1, cy - 5); g.lineTo(x1, by); g.stroke();
          drawBody(cur - 1, x1, by, sc[cur - 1].d / 2 * mag, g.globalAlpha);
          g.globalAlpha = clamp(1 - Math.abs(p - cur) / 0.3, 0, 1);
          drawEarth(ex, by, ball.d / 2 * mag);
        }
        g.strokeStyle = pal.ink2; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0, ty - 4); g.lineTo(x0, ty + 4); g.moveTo(x1, ty - 4); g.lineTo(x1, ty + 4); g.moveTo(x0, ty); g.lineTo(x1, ty); g.stroke();
        text(g, (x0 === ex ? '' : '离太阳 ') + P.fmtLen(sc[cur - 1].dist), (x0 + x1) / 2, ty - fs * 0.6, pal.ink, fs * 1.1, 'center', pal.num, 700);
        g.globalAlpha = 1;
      }
      if (light >= 0 && cur === 2) {               // 光从太阳跑到地球
        var lx = lerp(SX(sc[1].road), ex, clamp(light, 0, 1));
        g.fillStyle = pal.ink;
        g.beginPath(); g.arc(lx, cy, 4, 0, TAU); g.fill();
        text(g, minSec(clamp(light, 0, 1) * P.scaleLight(ball.d).sunSec), lx, cy - fs, pal.accent, fs * 1.1, 'center', pal.num, 700);
      }
      g.restore();
    }
    function caption(r) {                          // 预览里的一句话
      var g = cv.g, i = Math.round(p), t;
      if (Math.abs(p - i) > 0.25) return;
      if (i === 0) t = '把地球缩成一个' + ball.name;
      else t = K.BODIES[i - 1].name + '：' + P.fmtLen(sc[i - 1].d) + '，在 ' + P.fmtLen(sc[i - 1].dist) + '外';
      g.globalAlpha = clamp(1 - Math.abs(p - i) / 0.25, 0, 1);
      text(g, t, r.w / 2, r.h - pal.sm * 0.8, pal.ink, pal.sm, 'center', pal.font, 700);
      g.globalAlpha = 1;
    }
    function draw() {
      var g = cv.g, w = cv.w, h = cv.h;
      if (!w || !h) return;
      g.clearRect(0, 0, w, h);
      if (preview) { drawRoad({ x: 0, y: 0, w: w, h: h - pal.sm * 1.6 }); caption({ w: w, h: h }); return; }
      var hs = Math.round(h * 0.6);
      drawSizes({ x: 0, y: 0, w: w, h: hs });
      drawRoad({ x: 0, y: hs, w: w, h: h - hs });
    }
    /* ---------- 下面的文字：全部由常数现算 ---------- */
    function facts() {
      var i = Math.round(p);
      if (!el.name || (i === shown && light < 0)) return;
      shown = i;
      el.pos.textContent = (i + 1) + ' / ' + N;
      el.prev.disabled = i === 0; el.next.disabled = i === N - 1;
      if (light >= 0) {
        var L = P.scaleLight(ball.d);
        el.name.textContent = '光的旅程';
        el.real.textContent = '真实的光速：每秒 ' + group(K.C_KMS) + ' 千米';
        el.f1.textContent = '按这个比例，光每秒只走 ' + (L.speed >= 1 ? fmt3(L.speed) + ' 米' : fmt3(L.speed * 100) + ' 厘米') + '（时速 ' + fix(L.speed * 3.6, 1) + ' 千米，' + speedWord(L.speed) + '）。';
        el.f2.textContent = '从太阳到地球：' + minSec(L.sunSec) + '。到月球：' + fix(L.moonSec, 1) + ' 秒。到比邻星：' + fix(L.proximaYr, 2) + ' 年。';
        return;
      }
      if (i === 0) {
        el.name.textContent = ball.name + '地球';
        el.real.textContent = '真实直径 ' + P.fmtKm(K.EARTH_D);
        el.f1.textContent = '把地球缩成一个' + ball.name + '（' + P.fmtLen(ball.d) + '），等于缩小 ' + group(K.EARTH_D * 1000 / ball.d / 1e4) + ' 万倍。';
        el.f2.textContent = '其他天体用同一个比例缩小。往左拖，或者点 ▶ 出发。';
        return;
      }
      var b = K.BODIES[i - 1], q = sc[i - 1];
      el.name.textContent = b.name;
      el.real.textContent = '真实直径' + (b.approx ? '约 ' : ' ') + P.fmtKm(b.d) + ' · ' + (b.from === 'earth' ? '离地球 ' : '离太阳 ') +
        (b.id === 'proxima' ? fix(b.dist / K.LY_KM, 2) + ' 光年' : P.fmtKm(b.dist));
      el.f1.textContent = '大小 ' + (b.approx ? '约 ' : '') + P.fmtLen(q.d) + '：' + P.sizeRef(q.d).text + '。';
      el.f2.textContent = (b.from === 'earth' ? '离' + ball.name + '地球 ' : b.id === 'proxima' ? '离我们 ' : '离太阳 ') + P.fmtLen(q.dist) + '：' + P.distRef(q.dist) +
        (b.id === 'proxima' ? '；光也要走 ' + fix(b.dist / K.LY_KM, 2) + ' 年' : '') + '。';
      if (i === N - 1 && !doneSent) { doneSent = true; ctx.done({ text: '比邻星在 ' + P.fmtLen(q.dist) + ' 外' }); }
    }
    function go(i) { target = clamp(i, 0, N - 1); light = -1; shown = -1; ctx.sfx('tap'); }

    var SHOW = [[0, 1.4], [1, 2.6], [2, 3]], si = 0, hold = 0;       // 预览：地球 → 月球 → 太阳，每站停几秒
    var loop = makeLoop(function (dt) {
      if (preview) {
        if (Math.abs(p - target) < 0.004) {
          hold += dt;
          if (hold > SHOW[si][1]) { hold = 0; si = (si + 1) % SHOW.length; target = SHOW[si][0]; if (si === 0) p = 0; }
        }
        p += clamp(target - p, -dt * 0.42, dt * 0.42);               // 匀速拉远，一站约 2.4 秒
      } else if (!drag) {
        p += (target - p) * Math.min(1, dt * 5);
        if (Math.abs(target - p) < 0.002) p = target;
        if (light >= 0 && p === 2 && light < 1) light = Math.min(1, light + dt / 8);
      }
      draw();
      facts();
    });
    function onDown(e) { drag = { x: ptOf(cv.el, e).x, p: p }; light = -1; capture(cv.el, e); e.preventDefault(); }
    function onMove(e) { if (drag) p = clamp(drag.p - (ptOf(cv.el, e).x - drag.x) / (cv.w * 0.5), 0, N - 1); }
    function onUp() { if (!drag) return; target = Math.round(p); drag = null; shown = -1; }

    rescale();
    if (!preview) {
      el.name = U.el('b.w-scale-name'); el.real = U.el('span.w-scale-real');
      el.f1 = U.el('div.w-scale-fact'); el.f2 = U.el('div.w-scale-fact');
      el.pos = U.el('span.w-scale-pos.jn-num');
      el.prev = U.el('button.jn-btn.jn-btn--ghost.jn-btn--icon', { text: '◀', attrs: { type: 'button', 'aria-label': '上一站' }, on: { click: function () { go(target - 1); } } });
      el.next = U.el('button.jn-btn.jn-btn--icon', { text: '▶', attrs: { type: 'button', 'aria-label': '下一站' }, on: { click: function () { go(target + 1); } } });
      var why = makeWhy(root, 'scale', '课本上的太阳系，为了画得下，把距离缩得比大小狠得多。这里大小和距离用的是**同一个比例**，所以你会发现：天体都很小，中间几乎全是空的。\n\n' +
        '每个数字都是用真实的直径、距离乘以同一个比例算出来的，换一个球，所有数字跟着变。数据来自 NASA 的行星数据表（直径用的是赤道直径）；参照物（网球、球场、跑道）用的是标准尺寸。\n\n' +
        '“旅程”把行星排成了一条直线，方便比较。真实的行星各转各的，离太阳的远近是对的，但并不会排成一排。');
      ui.panel.appendChild(U.el('div.w-scale-top', [U.el('div.w-scale-title', [el.name, el.real]), why.btn]));
      ui.panel.appendChild(el.f1); ui.panel.appendChild(el.f2);
      ui.panel.appendChild(U.el('div.w-scale-row', [el.prev, el.pos, el.next,
        mkBtn('光的旅程', '.jn-btn--ghost', function () { target = 2; light = 0; shown = -1; ctx.sfx('whoosh'); })]));
      ui.panel.appendChild(U.el('div.w-scale-row', [U.el('span.w-scale-lab', { text: '换个球' }),
        makeSeg('scale', K.BALLS.map(function (b) { return { v: b.id, t: b.id === 'marble' ? '弹珠' : b.name }; }), ball.id, function (v) {
          ball = K.BALLS.filter(function (b) { return b.id === v; })[0];
          rescale(); ctx.sfx('pop');
        }).el]));
      cv.el.addEventListener('pointerdown', onDown);
      cv.el.addEventListener('pointermove', onMove);
      cv.el.addEventListener('pointerup', onUp);
      cv.el.addEventListener('pointercancel', onUp);
    } else if (ctx.reduced) { p = target = 1; }
    autoFit(cv, ctx, draw);
    draw();
    facts();
    if (!(preview && ctx.reduced)) loop.start();
    return {
      destroy: function () {
        loop.destroy();
        cv.dispose();
        cv.el.removeEventListener('pointerdown', onDown);
        cv.el.removeEventListener('pointermove', onMove);
        cv.el.removeEventListener('pointerup', onUp);
        cv.el.removeEventListener('pointercancel', onUp);
      }
    };
  }

  JN.registerWidget({
    id: 'scale',
    name: '如果地球是一个篮球',
    rules: '把地球缩成一个篮球，太阳系里别的天体按同一个比例缩小。往左拖（或点 ▶）一站站走：月球、太阳、火星……最后是离太阳最近的恒星。可以把篮球换成别的球。',
    mount: function (root, params, ctx) { return scaleView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return scaleView(root, params || {}, ctx, true); }
  });

  /* ================================================================== *
   * 6. illusion 视觉错觉
   *
   * 每一种都是“图没骗你，是大脑骗了你”，并且配一个能当场验证的控件。
   * 错觉图本身的颜色是刺激参数，不是界面配色：黑白砖、一深一浅的背景、同一种灰、用来留残像的蓝，
   * 都必须是固定的值，所以集中写在 STIM 里，不走主题变量；其余（线条、标注、底板）仍然用主题变量。
   * 盲点：视神经盘的中心大约在注视点外侧（颞侧）15.5° 处。屏幕上十字和圆点相距 s，
   *   圆点落进盲点时眼睛离屏幕约 s / tan(15.5°)。换算成厘米用的是“1 个 CSS 像素约 1/160 英寸”，只是估计。
   * 解释只写公认的部分；缪勒—莱尔和赫尔曼栅格的成因没有定论，文字里照实说“还在争论”。
   * params: { kind: 'muller' | 'ebbinghaus' | 'cafewall' | 'contrast' | 'hermann' | 'afterimage' | 'blindspot' | 'tour' }
   * ================================================================== */
  var STIM = { black: '#000000', white: '#ffffff', gray: '#808080', dark: '#262626', light: '#d9d9d9', blue: '#0b84c4' };
  var ILL = { STARE: 20, BLIND_DEG: 15.5, PX_CM: 2.54 / 160 };
  var ILLUSIONS = {
    muller: { name: '缪勒—莱尔错觉', on: '量一量', off: '收起标尺', ask: '上下两条横线，哪条更长？', opts: ['上面长', '下面长', '一样长'], truth: 2,
      seen: '两条横线，上面那条看起来更长。', proven: '两条虚线一比：一样长。线头朝外张，线就显得长。',
      why: '线头朝外张开的那条显得长，线头往里收的那条显得短，哪怕你已经知道它们一样长，看上去还是不一样。\n\n为什么会这样，**科学家还在争论**。一种说法：朝外张的线头像墙角远处的那条棱，大脑按“远处的东西实际更大”把它放大了。另一种说法：眼睛估长度时，把线头也一起算了进去。都还没有定论。' },
    ebbinghaus: { name: '艾宾浩斯错觉', on: '拿走周围的圆', off: '放回去', ask: '两个橙色的圆，哪个更大？', opts: ['左边大', '右边大', '一样大'], truth: 2,
      seen: '两个橙色的圆，右边那个看起来更大。', proven: '周围的圆一拿走：一样大。',
      why: '大脑判断大小不用尺子，靠的是和旁边的东西比。被一圈大圆围着，中间的圆就显得小；被一圈小圆围着，就显得大。\n\n周围的圆离得多近也有影响，细节科学家还在研究。' },
    cafewall: { name: '咖啡墙错觉', on: '对齐砖块', off: '错开砖块', ask: '这些灰色的横线，是平行的吗？', opts: ['平行', '歪的'], truth: 0,
      seen: '灰色的横线看起来一头高一头低。', proven: '砖一对齐，线就平了。其实它们一直是平行的。',
      why: '每条灰线上下的砖是错开的：有的地方上黑下白，有的地方上白下黑。一般认为，眼睛里负责找“边”的细胞会把这些地方的灰线看歪一点点；一小段一小段接起来，整条线就斜了。\n\n把砖对齐，这种错位没有了，线马上变平。它的名字来自英国布里斯托一家咖啡馆的外墙，墙上的瓷砖就是这么错开贴的。' },
    contrast: { name: '同时对比', on: '盖住背景', off: '露出背景', ask: '两个小方块，哪个颜色更深？', opts: ['左边深', '右边深', '一样'], truth: 2,
      seen: '右边的小方块看起来更深。', proven: '背景一盖住：两块是同一种灰。',
      why: '眼睛不量绝对的亮度，只看“比周围亮还是暗”。同一种灰，放在深色旁边显得浅，放在浅色旁边显得深。\n\n这其实很有用：一张白纸从屋里拿到太阳底下，反射的光强了上百倍，你看它却一直是白的。' },
    hermann: { name: '赫尔曼栅格', on: '把路弄弯', off: '把路拉直', ask: '白色的路口上，有几个灰点？', opts: ['很多', '只有几个', '一个也没有'], truth: 2,
      seen: '路口上有若隐若现的灰点。盯住哪个路口，那个路口的点就不见了。', proven: '路一弯，灰点全没了：图上本来就没画灰点。',
      why: '图上只有黑方块和白色的路，一个灰点也没画。\n\n老的教科书说，这是视网膜上相邻的细胞互相“压制”造成的。可是后来有人发现，只要把白色的路弄弯一点，灰点就没了，老解释说不通这一点。所以它到底是怎么来的，**科学家还在争论**。' },
    afterimage: { name: '补色后像', why: '眼睛里有三种管颜色的感光细胞。盯着蓝色看久了，对蓝色起反应的那些细胞“累了”，反应变弱。\n\n这时再看白色（白光里各种颜色都有），蓝色的信号偏弱，剩下的颜色占了上风，你看到的就是它的补色：一个橙黄色的球。过几秒细胞缓过来，残像就散了。' },
    blindspot: { name: '盲点', why: '眼球后面有一小块地方，是视神经穿出去的出口，那里没有感光细胞。圆点的像正好落在那儿时，你就看不见它。\n\n平时没感觉，是因为两只眼睛的盲点不在同一个位置，互相补上了。只用一只眼时，大脑会用周围的颜色和图案把这个洞“补”上，所以你看到的不是一个黑洞，而是一片连续的背景。' }
  };
  var ILL_TOUR = ['muller', 'contrast', 'ebbinghaus', 'cafewall', 'hermann'];

  function illusionView(root, params, ctx, preview) {
    var pal = palette(root);
    var tour = params.kind === 'tour' && !preview;
    var kind = tour ? ILL_TOUR[0] : ILLUSIONS[params.kind] ? params.kind : 'ebbinghaus';
    var ui = preview ? { stage: root } : scaffold(root, 'illusion');
    var cv = makeCanvas(ui.stage, 'w-illusion-cv', preview);
    var pf = 0, want = 0, clockT = 0, el = {}, why = null;
    var st = { ratio: 1, revealed: false, phase: 'ready', left: 0, fade: 1, eye: 'right', line: false };

    function panelRect(w, h) { var m = Math.min(12, w * 0.03); return { x: m, y: m, w: w - 2 * m, h: h - 2 * m }; }
    function rrect(g, r, rad) {
      g.beginPath();
      g.moveTo(r.x + rad, r.y); g.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad); g.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
      g.arcTo(r.x, r.y + r.h, r.x, r.y, rad); g.arcTo(r.x, r.y, r.x + r.w, r.y, rad); g.closePath();
    }
    var DRAW = {
      muller: function (g, w, h) {
        var L = Math.min(w * 0.52, 250), L2 = L * st.ratio, cx = w / 2, y1 = h * 0.36, y2 = h * 0.64, fin = L * 0.17;
        function shaft(y, len, dir) {             // dir = +1：线头朝外张（显得长）；−1：往里收（显得短）
          g.strokeStyle = pal.ink; g.lineWidth = 4; g.lineCap = 'round'; g.globalAlpha = 1;
          g.beginPath(); g.moveTo(cx - len / 2, y); g.lineTo(cx + len / 2, y); g.stroke();
          g.globalAlpha = 1 - 0.8 * pf;
          g.beginPath();
          [-1, 1].forEach(function (side) {
            var x = cx + side * len / 2, fx = x + side * dir * fin * Math.cos(40 * DEG);
            g.moveTo(fx, y - fin * Math.sin(40 * DEG)); g.lineTo(x, y); g.lineTo(fx, y + fin * Math.sin(40 * DEG));
          });
          g.stroke(); g.globalAlpha = 1;
        }
        shaft(y1, L, 1); shaft(y2, L2, -1);
        if (pf > 0.01) {
          g.strokeStyle = pal.accent; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.globalAlpha = pf;
          g.beginPath();
          [-1, 1].forEach(function (side) { g.moveTo(cx + side * L / 2, y1 - 26); g.lineTo(cx + side * L / 2, y2 + 26); });
          g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        }
      },
      ebbinghaus: function (g, w, h) {
        var c = Math.min(w / 16.6, h / 10.6), m = (w - 15.8 * c) / 2, yc = h / 2, xl = m + 4.9 * c, xr = m + 13.6 * c, k, a;
        g.fillStyle = pal.ink2; g.globalAlpha = 0.85 * (1 - pf);
        for (k = 0; k < 6; k++) { a = k * TAU / 6; g.beginPath(); g.arc(xl + Math.cos(a) * 3.3 * c * (1 + 0.7 * pf), yc + Math.sin(a) * 3.3 * c * (1 + 0.7 * pf), 1.6 * c, 0, TAU); g.fill(); }
        for (k = 0; k < 8; k++) { a = k * TAU / 8; g.beginPath(); g.arc(xr + Math.cos(a) * 1.75 * c * (1 + 0.9 * pf), yc + Math.sin(a) * 1.75 * c * (1 + 0.9 * pf), 0.42 * c, 0, TAU); g.fill(); }
        g.globalAlpha = 1; g.fillStyle = pal.p1;
        g.beginPath(); g.arc(xl, yc, c, 0, TAU); g.fill();
        g.beginPath(); g.arc(xr, yc, c, 0, TAU); g.fill();
        if (pf > 0.01) {
          g.strokeStyle = pal.accent; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.globalAlpha = pf;
          g.beginPath(); g.moveTo(xl - 2 * c, yc - c); g.lineTo(xr + 2 * c, yc - c); g.moveTo(xl - 2 * c, yc + c); g.lineTo(xr + 2 * c, yc + c); g.stroke();
          g.setLineDash([]); g.globalAlpha = 1;
        }
      },
      cafewall: function (g, w, h) {
        var r = panelRect(w, h), T = r.w / 7.4, rh = T * 0.78, m = Math.max(2, Math.round(T * 0.075));
        var rows = Math.max(3, Math.floor((r.h - m) / (rh + m))), y0 = r.y + (r.h - rows * (rh + m) - m) / 2;
        g.save(); rrect(g, { x: r.x, y: y0, w: r.w, h: rows * (rh + m) + m }, 6); g.clip();
        g.fillStyle = STIM.gray; g.fillRect(r.x, y0, r.w, rows * (rh + m) + m);
        for (var j = 0; j < rows; j++) {
          var off = j % 2 ? 0.5 * T * (1 - pf) : 0;          // 单数行错开半块砖；“对齐”时慢慢移回去
          for (var k = -1; k < 9; k++) { g.fillStyle = k & 1 ? STIM.black : STIM.white; g.fillRect(r.x + k * T + off, y0 + m + j * (rh + m), T + 0.5, rh); }
        }
        g.restore();
      },
      contrast: function (g, w, h) {
        var r = panelRect(w, h), s = Math.min(r.w * 0.2, r.h * 0.34), cy = r.y + r.h / 2, slide = smooth(pf) * (r.w / 4 - s / 2);
        g.save(); rrect(g, r, 10); g.clip();
        g.fillStyle = pal.surface2; g.fillRect(r.x, r.y, r.w, r.h);
        g.globalAlpha = 1 - pf;
        g.fillStyle = STIM.dark; g.fillRect(r.x, r.y, r.w / 2, r.h);
        g.fillStyle = STIM.light; g.fillRect(r.x + r.w / 2, r.y, r.w / 2, r.h);
        g.globalAlpha = 1; g.fillStyle = STIM.gray;         // 两个小方块用的是同一个色值；“盖住背景”时它们滑到一起
        g.fillRect(r.x + r.w / 4 - s / 2 + slide, cy - s / 2, s, s);
        g.fillRect(r.x + r.w * 3 / 4 - s / 2 - slide, cy - s / 2, s, s);
        g.restore();
      },
      hermann: function (g, w, h) {
        var r = panelRect(w, h), n = 6, s = Math.min(r.w, r.h) / (n + (n + 1) * 0.24), gap = s * 0.24, A = pf * s * 0.075, side = n * s + (n + 1) * gap;
        var x0 = r.x + (r.w - side) / 2, y0 = r.y + (r.h - side) / 2, i, j, k, u, M = 12;
        g.fillStyle = STIM.white; g.fillRect(x0, y0, side, side);
        g.fillStyle = STIM.black;
        for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
          var x = x0 + gap + i * (s + gap), y = y0 + gap + j * (s + gap);
          g.beginPath();                                    // 四条边都按同一条正弦线弯，相邻方块平移后仍然对得上，路的宽度不变
          for (k = 0; k <= M; k++) { u = k / M; g.lineTo(x + u * s, y + A * Math.sin(TAU * u)); }
          for (k = 0; k <= M; k++) { u = k / M; g.lineTo(x + s + A * Math.sin(TAU * u), y + u * s); }
          for (k = M; k >= 0; k--) { u = k / M; g.lineTo(x + u * s, y + s + A * Math.sin(TAU * u)); }
          for (k = M; k >= 0; k--) { u = k / M; g.lineTo(x + A * Math.sin(TAU * u), y + u * s); }
          g.closePath(); g.fill();
        }
      },
      afterimage: function (g, w, h) {
        var r = panelRect(w, h), cx = w / 2, cy = h / 2, R = Math.min(r.w, r.h) * 0.3;
        g.save(); rrect(g, r, 10); g.clip();
        g.fillStyle = STIM.white; g.fillRect(r.x, r.y, r.w, r.h);
        if (st.fade > 0.01) {                               // 一个“蓝色的篮球”：残像会是它的补色，橙黄色
          g.globalAlpha = st.fade; g.fillStyle = STIM.blue;
          g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
          g.strokeStyle = STIM.white; g.lineWidth = Math.max(2, R * 0.05);
          g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
          g.moveTo(cx - R * 0.72, cy - R * 0.69); g.quadraticCurveTo(cx - R * 0.2, cy, cx - R * 0.72, cy + R * 0.69);
          g.moveTo(cx + R * 0.72, cy - R * 0.69); g.quadraticCurveTo(cx + R * 0.2, cy, cx + R * 0.72, cy + R * 0.69);
          g.stroke(); g.globalAlpha = 1;
        }
        g.fillStyle = STIM.black;                           // 盯住这个小黑点
        g.beginPath(); g.arc(cx, cy, 3.5, 0, TAU); g.fill();
        g.restore();
      },
      blindspot: function (g, w, h) {
        var r = panelRect(w, h), cy = h / 2, right = st.eye === 'right', xc = r.x + r.w * (right ? 0.09 : 0.91), xd = r.x + r.w * (right ? 0.91 : 0.09), rd = Math.max(8, r.w * 0.03);      // 十字和圆点相距 0.82 个画面宽
        g.save(); rrect(g, r, 10); g.clip();
        g.fillStyle = pal.surface; g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = pal.ink; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(xc - 10, cy); g.lineTo(xc + 10, cy); g.moveTo(xc, cy - 10); g.lineTo(xc, cy + 10); g.stroke();
        if (st.line) {                                      // 一条中间断开的线：缺口落进盲点时，线看起来是连着的
          var xa = r.x + r.w * (right ? 0.4 : 0.6), dir = right ? 1 : -1;
          g.beginPath(); g.moveTo(xa, cy); g.lineTo(xd - dir * rd * 1.3, cy); g.moveTo(xd + dir * rd * 1.3, cy); g.lineTo(right ? r.x + r.w : r.x, cy); g.stroke();
        } else { g.fillStyle = pal.ink; g.globalAlpha = preview ? 1 - 0.9 * smooth(pf) : 1; g.beginPath(); g.arc(xd, cy, rd, 0, TAU); g.fill(); g.globalAlpha = 1; }
        g.restore();
      }
    };
    function blindCm() { return Math.round(panelRect(cv.w, cv.h).w * 0.82 * ILL.PX_CM / Math.tan(ILL.BLIND_DEG * DEG)); }
    function draw() {
      if (!cv.w || !cv.h) return;
      cv.g.clearRect(0, 0, cv.w, cv.h);
      DRAW[kind](cv.g, cv.w, cv.h);
    }
    function caption() {
      if (!el.hud || tour) return;
      var I = ILLUSIONS[kind];
      if (kind === 'afterimage') {
        el.hud.textContent = st.phase === 'stare' ? '盯住球心的小黑点，别移开：还有 ' + Math.ceil(st.left) + ' 秒' :
          st.phase === 'after' ? '继续盯着小黑点。白底上是不是浮出一个橙黄色的球？' : '盯着蓝色球心的小黑点看 ' + ILL.STARE + ' 秒，别移开眼睛。';
      } else if (kind === 'blindspot') {
        el.hud.textContent = (st.eye === 'right' ? '闭上左眼，用右眼' : '闭上右眼，用左眼') + '盯住十字。把手机从一臂远慢慢拉近，到离眼睛大约 ' + blindCm() + ' 厘米时，' +
          (st.line ? '线上的缺口会消失，线变成连着的。' : '圆点会消失。');
      } else if (kind === 'muller' && !st.revealed) el.hud.textContent = '拖滑块，把下面那条调到你觉得“和上面一样长”，再点「量一量」。';
      else if (kind === 'muller') {
        var d = Math.round((st.ratio - 1) * 100);
        el.hud.textContent = Math.abs(d) <= 2 ? '几乎一样长（差 ' + Math.abs(d) + '%）。你的眼睛很难骗。' : '你把下面那条调' + (d > 0 ? '长' : '短') + '了 ' + Math.abs(d) + '%。看虚线：线头朝外的那条只是“显得”长。';
      } else el.hud.textContent = want ? I.proven : I.seen;
    }
    var loop = makeLoop(function (dt) {
      var busy = false;
      if (pf !== want) { pf = want > pf ? Math.min(want, pf + dt / 1.1) : Math.max(want, pf - dt / 1.1); busy = true; }      // 验证动作 1.1 秒做完，不闪
      if (kind === 'afterimage') {
        if (st.phase === 'stare') { st.left -= dt; busy = true; if (st.left <= 0) { st.phase = 'after'; st.left = 12; ctx.sfx('pop'); if (!preview) ctx.done({ text: '看到残像了吗' }); } }
        else if (st.phase === 'after' && preview) { st.left -= dt; busy = true; if (st.left <= 8) { st.phase = 'stare'; st.left = 7; } }
        var f = st.phase === 'after' ? 0 : 1;
        if (st.fade !== f) { st.fade = f > st.fade ? Math.min(1, st.fade + dt / 0.5) : Math.max(0, st.fade - dt / 0.5); busy = true; }
      } else if (preview) { clockT += dt; busy = true; if (clockT > 3) { clockT = 0; want = want ? 0 : 1; } }                  // 预览：每 3 秒验证一次、还原一次
      draw();
      caption();
      if (!busy) loop.stop();
    });
    function setWant(v) { want = v; if (el.proof) el.proof.textContent = ILLUSIONS[kind][v ? 'off' : 'on']; loop.start(); }

    /* ---------- 单独看一种 ---------- */
    function buildOne() {
      var I = ILLUSIONS[kind], row = [];
      el.hud = U.el('div.w-illusion-hud');
      why = makeWhy(root, 'illusion', I.why);
      ui.panel.appendChild(U.el('div.w-illusion-top', [el.hud, why.btn]));
      if (kind === 'muller') {
        st.ratio = 0.82;
        ui.panel.appendChild(makeSlider('illusion', '下面那条', 70, 140, 1, 82, function () { return ''; }, function (v) {
          st.ratio = v / 100; st.revealed = false; want = 0; el.proof.textContent = I.on; loop.start();
        }).row);
        el.proof = mkBtn(I.on, '', function () { st.revealed = !want; setWant(want ? 0 : 1); if (st.revealed) ctx.done({ text: '差了 ' + Math.abs(Math.round((st.ratio - 1) * 100)) + '%' }); });
        row.push(el.proof);
      } else if (kind === 'afterimage') {
        el.proof = mkBtn('开始盯 ' + ILL.STARE + ' 秒', '', function () { st.phase = 'stare'; st.left = ILL.STARE; st.fade = 1; el.proof.textContent = '重新开始'; loop.start(); });
        row.push(el.proof);
      } else if (kind === 'blindspot') {
        row.push(mkBtn('换一只眼', '.jn-btn--ghost', function () { st.eye = st.eye === 'right' ? 'left' : 'right'; loop.start(); }));
        row.push(mkBtn('换成一条线', '', function () { st.line = !st.line; this.textContent = st.line ? '换回圆点' : '换成一条线'; loop.start(); ctx.done({ text: '找到盲点了' }); }));
      } else {
        el.proof = mkBtn(I.on, '', function () { setWant(want ? 0 : 1); ctx.sfx('tap'); if (want) ctx.done({ text: I.name }); });
        row.push(el.proof);
      }
      ui.panel.appendChild(U.el('div.w-illusion-row', row));
    }

    /* ---------- 闯关：五种依次来，先答再揭晓 ---------- */
    var ti = 0, fooled = 0, answered = false;
    function stage() {
      kind = ILL_TOUR[ti]; pf = 0; want = 0; answered = false;
      var I = ILLUSIONS[kind];
      el.prog.textContent = '第 ' + (ti + 1) + ' / ' + ILL_TOUR.length + ' 关 · 被骗 ' + fooled + ' 次';
      el.ask.textContent = I.ask;
      el.say.textContent = '';
      el.next.hidden = true;
      why.btn.hidden = true; why.toggle(false);
      why.set(I.why);
      U.clear(el.opts);
      I.opts.forEach(function (t, i) {
        el.opts.appendChild(U.el('button.jn-btn.jn-btn--ghost.w-illusion-opt', { text: t, attrs: { type: 'button' }, on: { click: function () { answer(i, this); } } }));
      });
      loop.start();
    }
    function answer(i, btn) {
      if (answered) return;
      answered = true;
      var I = ILLUSIONS[kind], ok = i === I.truth;
      if (!ok) fooled++;
      Array.prototype.forEach.call(el.opts.children, function (b, k) { b.disabled = true; if (k === I.truth) b.classList.add('is-right'); });
      if (!ok) btn.classList.add('is-wrong');
      el.say.textContent = (ok ? '没被骗。' : '被骗了。') + I.proven;
      el.prog.textContent = '第 ' + (ti + 1) + ' / ' + ILL_TOUR.length + ' 关 · 被骗 ' + fooled + ' 次';
      el.next.textContent = ti + 1 < ILL_TOUR.length ? '下一关' : '看结果';
      el.next.hidden = false;
      why.btn.hidden = false;
      ctx.sfx(ok ? 'good' : 'bad');
      setWant(1);
    }
    function nextStage() {
      if (ti >= ILL_TOUR.length) { ti = 0; fooled = 0; stage(); return; }
      if (!answered) return;
      ti++;
      if (ti < ILL_TOUR.length) { stage(); return; }
      var n = ILL_TOUR.length;
      U.clear(el.opts);
      el.ask.textContent = n + ' 关里被骗了 ' + fooled + ' 次';
      el.say.textContent = fooled === 0 ? '一次都没上当。不过就算知道答案，它们看起来还是老样子，对吧？' : '别在意：这些图骗的是所有人的眼睛。知道答案以后再看，它们看起来还是老样子。';
      el.next.textContent = '再闯一次';
      ctx.done({ win: fooled <= 2, text: n + ' 关里被骗了 ' + fooled + ' 次' });
      if (fooled === 0) ctx.confetti();
    }
    function buildTour() {
      el.prog = U.el('div.w-illusion-hud.jn-num');
      el.ask = U.el('div.w-illusion-ask'); el.opts = U.el('div.w-illusion-opts'); el.say = U.el('div.w-illusion-say');
      el.next = mkBtn('下一关', '', nextStage);
      why = makeWhy(root, 'illusion', '');
      ui.panel.appendChild(U.el('div.w-illusion-top', [el.prog, why.btn]));
      ui.panel.appendChild(el.ask); ui.panel.appendChild(el.opts); ui.panel.appendChild(el.say);
      ui.panel.appendChild(U.el('div.w-illusion-row', [el.next]));
      stage();
    }

    if (preview) { if (kind === 'afterimage') { st.phase = 'stare'; st.left = 7; } else if (kind === 'blindspot') clockT = 0; }
    else if (tour) buildTour();
    else buildOne();
    autoFit(cv, ctx, function () { draw(); if (el.hud) loop.start(); });      // 说明文字放到下一帧再更新（盲点的距离估计跟画面宽度有关）
    draw();
    caption();
    if (!(preview && ctx.reduced)) loop.start();
    return { destroy: function () { loop.destroy(); cv.dispose(); } };
  }

  JN.registerWidget({
    id: 'illusion',
    name: '视觉错觉',
    rules: '图没有骗你，是大脑骗了你。每一种错觉都有一个按钮，可以当场验证。闯关模式里先回答、再揭晓。',
    mount: function (root, params, ctx) { return illusionView(root, params || {}, ctx, false); },
    preview: function (root, params, ctx) { return illusionView(root, params || {}, ctx, true); }
  });

})();
