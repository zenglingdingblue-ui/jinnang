/* 锦囊 · widgets/duel —— 面对面、在一部手机上的对决（组件工程师 G2）
 *   reaction 反应对决 · tapwar 指尖拔河 · mathduel 心算对决 · gomoku 五子棋
 *   dots 点格棋 · tensec 估 10 秒 · stroop 颜色与字打架
 * 结构照 basic.js：一个 IIFE，只通过 JN.registerWidget 对外。
 * 不碰 DOM 的纯逻辑（出题、判五连、电脑落子、点格棋规则……）另外挂在 JN._duel 下，
 * 给 dev/test-duel.js 在 Node 里验证用。
 *
 * 共同的版面：两个人面对面坐，手机平放在中间。0 号玩家在下方，1 号在上方（上半屏整块旋转 180°），
 * 三个人时 2 号在下方右侧。玩家颜色 --p1 / --p2 / --p3。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;
  var el = U.el;
  var D = (JN._duel = {});

  /* ================================================================== *
   * 共用的小工具
   * ================================================================== */

  /* 每个组件实例一个 Kit：计时器、动画帧、监听都从这里登记，destroy 时一把清掉。 */
  function Kit() {
    var alive = true, timers = [], ivals = [], rafId = 0, rafFn = null, offs = [];
    var kit = {
      alive: function () { return alive; },
      after: function (ms, fn) {
        var id = setTimeout(function () {
          var i = timers.indexOf(id);
          if (i >= 0) timers.splice(i, 1);
          if (alive) fn();
        }, ms);
        timers.push(id);
        return id;
      },
      cancel: function (id) {
        clearTimeout(id);
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
      },
      every: function (ms, fn) {
        var id = setInterval(function () { if (alive) fn(); }, ms);
        ivals.push(id);
        return id;
      },
      stopEvery: function (id) {
        clearInterval(id);
        var i = ivals.indexOf(id);
        if (i >= 0) ivals.splice(i, 1);
      },
      /* 同一时间只跑一个 rAF 循环 */
      loop: function (fn) {
        kit.stopLoop();
        rafFn = fn;
        rafId = requestAnimationFrame(function tick(t) {
          if (!alive || rafFn !== fn) return;
          rafId = requestAnimationFrame(tick);
          fn(t);
        });
      },
      stopLoop: function () {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        rafFn = null;
      },
      on: function (node, type, fn, opts) {
        node.addEventListener(type, fn, opts);
        offs.push(function () { node.removeEventListener(type, fn, opts); });
      },
      clearTimers: function () {
        timers.forEach(function (id) { clearTimeout(id); });
        timers = [];
        ivals.forEach(function (id) { clearInterval(id); });
        ivals = [];
        kit.stopLoop();
      },
      destroy: function () {
        alive = false;
        kit.clearTimers();
        offs.forEach(function (f) { f(); });
        offs = [];
      }
    };
    return kit;
  }

  function now() { return performance.now(); }

  /* 抢速度的按键：手指按下的瞬间就算（pointerdown），不等抬手；每根手指各算各的，两个人同时按互不影响。
   * 键盘或脚本触发的 click（detail 为 0）也认，方便无障碍和自动测试；真手指产生的 click 不重复计。 */
  function onPress(kit, node, fn) {
    kit.on(node, 'pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      fn(e);
    });
    kit.on(node, 'click', function (e) { if (e.detail === 0) fn(e); });
  }

  var PCOLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)'];

  /* 面对面的座位：返回 { wrap, pads }。pads[p] 是 p 号玩家自己的那一块，CSS 变量 --pc 是他的颜色。 */
  function seats(id, n) {
    var wrap = el('div.w-' + id + '-wrap', { attrs: { 'data-n': n } });
    var pads = [];
    for (var p = 0; p < n; p++) {
      var pad = el('div.w-' + id + '-pad', { attrs: { 'data-p': p } });
      pad.style.setProperty('--pc', PCOLORS[p]);
      pads.push(pad);
    }
    if (n >= 2) wrap.appendChild(el('div.w-' + id + '-side.w-' + id + '-side--top.jn-flip', [pads[1]]));
    wrap.appendChild(el('div.w-' + id + '-side.w-' + id + '-side--bot', n >= 3 ? [pads[0], pads[2]] : [pads[0]]));
    return { wrap: wrap, pads: pads };
  }

  function clampInt(v, lo, hi, fallback) {
    v = Number(v);
    if (!isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, Math.round(v)));
  }
  function ri(rnd, lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
  function pickOf(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  /* 负数用真正的减号 −（U+2212），和题目里的减号一致 */
  function fmtNum(v) { return (v < 0 ? '−' : '') + Math.abs(v); }

  /* ================================================================== *
   * 纯逻辑 1：心算题
   * mathQ(kind, level, rnd) -> { kind, level, text, options:[字符串], answer:正确选项下标, left?, right? }
   *   kind  arith 四则运算 · compare 比大小 · estimate 估算
   *   level easy · mid · hard
   * 约定（测试脚本按这个独立复算）：
   *   arith    text 是一个算式，options[answer] 等于它的值，其余选项都不等于它，选项互不相同。
   *   compare  left、right 是两个式子；options = [left, '=', right]，answer 0 表示左边大、1 一样大、2 右边大。
   *   estimate text 是一个算式；四个选项里 options[answer] 离准确值最近，而且是唯一最近的。
   * ================================================================== */
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function sup(n) { return String(n).split('').map(function (ch) { return SUP.charAt(+ch); }).join(''); }

  /* 从一堆“像样的错误答案”里挑 3 个：不重复、不等于正确答案；不够就用正确答案附近的数补上 */
  function withWrongs(rnd, v, cands, allowNeg) {
    var seen = {}, pool = [];
    seen[v] = 1;
    function take(x) {
      if (pool.length >= 3 || x !== Math.round(x) || seen[x]) return;
      if (!allowNeg && v >= 0 && x < 0) return;
      if (v > 0 && x === 0) return;
      seen[x] = 1;
      pool.push(x);
    }
    U.shuffle(cands, rnd).forEach(take);
    for (var k = 1; pool.length < 3; k++) { take(v + k); take(v - k); }
    var opts = U.shuffle(pool.concat([v]), rnd);
    return { options: opts.map(fmtNum), answer: opts.indexOf(v) };
  }

  function arithQ(level, rnd) {
    var a, b, c, d, v, text, wrong, neg = false, t;
    if (level === 'easy') {
      t = ri(rnd, 0, 3);
      if (t === 0) { a = ri(rnd, 11, 69); b = ri(rnd, 11, 69); v = a + b; text = a + ' + ' + b; wrong = [v + 10, v - 10, v + 1, v - 1, v + 2, v - 2]; }
      else if (t === 1) { a = ri(rnd, 30, 99); b = ri(rnd, 11, a - 6); v = a - b; text = a + ' − ' + b; wrong = [v + 10, v - 10, v + 1, v - 1, v + 2, v - 2]; }
      else if (t === 2) { a = ri(rnd, 3, 9); b = ri(rnd, 3, 9); v = a * b; text = a + ' × ' + b; wrong = [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, v + 1, v - 1, v + 2]; }
      else { a = ri(rnd, 3, 9); b = ri(rnd, 3, 9); v = b; text = (a * b) + ' ÷ ' + a; wrong = [v + 1, v - 1, v + 2, v - 2, a]; }
    } else if (level === 'hard') {
      t = ri(rnd, 0, 6);
      if (t === 0) { a = ri(rnd, 12, 29); b = ri(rnd, 11, 19); v = a * b; text = a + ' × ' + b; wrong = [v + 10, v - 10, v + a, v - a, v + b, v - b, v + 20, v - 2]; }
      else if (t === 1) { a = ri(rnd, 6, 12); b = ri(rnd, 6, 12); c = ri(rnd, 3, 9); d = ri(rnd, 3, 9); v = a * b - c * d; text = a + ' × ' + b + ' − ' + c + ' × ' + d; neg = v < 0; wrong = [a * b + c * d, v + 10, v - 10, v + 1, v - 1, v + c, v - d, v + 2]; }
      else if (t === 2) { a = ri(rnd, 12, 48); b = ri(rnd, 12, 48); c = ri(rnd, 3, 9); v = (a + b) * c; text = '(' + a + ' + ' + b + ') × ' + c; wrong = [a + b * c, v + c, v - c, v + 10, v - 10, v + 2 * c]; }
      else if (t === 3) { a = ri(rnd, 13, 25); if (a === 20) a = 19; v = a * a; text = a + sup(2); wrong = [v + 10, v - 10, v + a, v - a, (a + 1) * (a + 1), (a - 1) * (a - 1), v + 20, v - 20]; }
      else if (t === 4) { a = ri(rnd, 20, 90); b = ri(rnd, 4, 9); c = ri(rnd, 4, 9); v = -a + b * c; text = '−' + a + ' + ' + b + ' × ' + c; neg = true; wrong = [-v, a + b * c, -(a + b * c), v + 10, v - 10, v + 1, v - 1, (b - a) * c]; }
      else if (t === 5) { a = ri(rnd, 12, 25); b = ri(rnd, 6, 19); v = b; text = (a * b) + ' ÷ ' + a; wrong = [v + 1, v - 1, v + 2, v - 2, v + 10]; }
      else { a = ri(rnd, 10, 60); b = ri(rnd, 4, 9); c = ri(rnd, 4, 9); v = a - b * c; text = a + ' − ' + b + ' × ' + c; neg = true; wrong = [(a - b) * c, -v, v + 10, v - 10, v + 1, v - 1, a + b * c]; }
    } else {
      t = ri(rnd, 0, 5);
      if (t === 0) { a = ri(rnd, 120, 480); b = ri(rnd, 25, 99); v = a + b; text = a + ' + ' + b; wrong = [v + 10, v - 10, v + 100, v - 100, v + 1, v - 1, v + 20]; }
      else if (t === 1) { a = ri(rnd, 120, 480); b = ri(rnd, 25, 99); v = a - b; text = a + ' − ' + b; wrong = [v + 10, v - 10, v + 100, v + 1, v - 1, v + 20, v - 20]; }
      else if (t === 2) { a = ri(rnd, 12, 39); b = ri(rnd, 3, 9); v = a * b; text = a + ' × ' + b; wrong = [v + b, v - b, v + 10, v - 10, a * (b + 1), a * (b - 1)]; }
      else if (t === 3) { b = ri(rnd, 3, 9); a = ri(rnd, 12, 30); v = a; text = (a * b) + ' ÷ ' + b; wrong = [v + 1, v - 1, v + 2, v - 2, v + 10, v - 10]; }
      else if (t === 4) { a = ri(rnd, 4, 9); b = ri(rnd, 4, 9); c = ri(rnd, 11, 49); v = a * b + c; text = a + ' × ' + b + ' + ' + c; wrong = [a * (b + c), v + 10, v - 10, v + 1, v - 1, v + a]; }
      else { a = ri(rnd, 4, 9); b = ri(rnd, 4, 9); c = ri(rnd, 5, a * b - 1); v = a * b - c; text = a + ' × ' + b + ' − ' + c; wrong = [v + 10, v + 1, v - 1, v + 2, v - 2, a * b + c, v + a]; }
    }
    var w = withWrongs(rnd, v, wrong, neg);
    return { text: text, options: w.options, answer: w.answer };
  }

  /* 比大小。每个式子带着自己的精确值（分数 [分子, 分母]，分母为正），用交叉相乘比较，不经过小数。 */
  function fr(n, d) { return { n: n, d: d }; }
  function cmpFrac(x, y) { var k = x.n * y.d - y.n * x.d; return k > 0 ? 1 : k < 0 ? -1 : 0; }
  function compareQ(level, rnd) {
    var L, R, a, b, c, d, n, k, t;
    function frac(x, y) { return { s: x + '/' + y, v: fr(x, y) }; }
    function num(x) { return { s: String(x), v: fr(x, 1) }; }
    function prod(x, y) { return { s: x + ' × ' + y, v: fr(x * y, 1) }; }
    function pct(x, p) { return { s: x + ' 的 ' + p + '%', v: fr(x * p, 100) }; }
    function pow(x, e) { return { s: x + sup(e), v: fr(Math.pow(x, e), 1) }; }
    function dec(hundredths) { return { s: String(hundredths / 100), v: fr(hundredths, 100) }; }
    if (level === 'easy') {
      t = ri(rnd, 0, 4);
      if (t === 0) { d = ri(rnd, 5, 12); a = ri(rnd, 1, d - 1); b = ri(rnd, 1, d - 1); L = frac(a, d); R = frac(b, d); }
      else if (t === 1) { n = ri(rnd, 1, 5); a = ri(rnd, n + 1, 12); b = ri(rnd, n + 1, 12); L = frac(n, a); R = frac(n, b); }
      else if (t === 2) { a = ri(rnd, 3, 9); b = ri(rnd, 3, 9); L = prod(a, b); R = num(a * b + ri(rnd, -3, 3)); }
      else if (t === 3) { a = ri(rnd, 3, 9); b = ri(rnd, 3, 9); c = ri(rnd, 3, 9); d = ri(rnd, 3, 9); L = prod(a, b); R = prod(c, d); }
      else { d = ri(rnd, 5, 12); a = ri(rnd, 2, d - 1); L = frac(a, d); R = frac(1, 2); }
    } else if (level === 'hard') {
      t = ri(rnd, 0, 5);
      if (t === 0) {                       // 两个挨得很近的分数
        b = ri(rnd, 7, 15); d = ri(rnd, 7, 15); a = ri(rnd, 2, b - 1);
        c = U.clamp(Math.round(a * d / b) + ri(rnd, -1, 1), 1, d - 1);
        L = frac(a, b); R = frac(c, d);
      } else if (t === 1) {                // 负分数：绝对值大的反而小
        b = ri(rnd, 3, 9); d = ri(rnd, 3, 9); a = ri(rnd, 1, b - 1); c = ri(rnd, 1, d - 1);
        L = { s: '−' + a + '/' + b, v: fr(-a, b) }; R = { s: '−' + c + '/' + d, v: fr(-c, d) };
      } else if (t === 2) {                // a 的 b 次方 和 b 的 a 次方（2⁴ 和 4² 一样大）
        if (rnd() < 0.2) { L = pow(2, 10); R = pow(10, 3); }
        else { a = ri(rnd, 2, 6); b = ri(rnd, 2, 6); L = pow(a, b); R = pow(b, a); }
      } else if (t === 3) {                // 和相同的两组乘积：越靠近越大
        n = ri(rnd, 15, 40); a = ri(rnd, 0, 4); b = ri(rnd, 0, 4);
        L = prod(n - a, n + a); R = prod(n - b, n + b);
      } else if (t === 4) {                // 百分数
        L = pct(pickOf(rnd, [40, 60, 80, 120, 150, 240]), pickOf(rnd, [15, 20, 25, 30, 35, 45, 60, 75]));
        R = pct(pickOf(rnd, [40, 60, 80, 120, 150, 240]), pickOf(rnd, [15, 20, 25, 30, 35, 45, 60, 75]));
      } else {                             // 小数和分数
        a = ri(rnd, 1, 19) * 5; d = pickOf(rnd, [3, 6, 7, 8, 9, 11, 12]);
        c = U.clamp(Math.round(a * d / 100) + ri(rnd, -1, 1), 1, d - 1);
        L = dec(a); R = frac(c, d);
      }
    } else {
      t = ri(rnd, 0, 4);
      if (t === 0) { b = ri(rnd, 3, 9); d = ri(rnd, 3, 9); a = ri(rnd, 1, b - 1); c = ri(rnd, 1, d - 1); L = frac(a, b); R = frac(c, d); }
      else if (t === 1) { b = ri(rnd, 2, 6); a = ri(rnd, 1, b - 1); k = ri(rnd, 2, 4); L = frac(a, b); R = rnd() < 0.6 ? frac(a * k, b * k) : frac(a * k + pickOf(rnd, [-1, 1]), b * k); }
      else if (t === 2) {                  // 常见小数和分数
        a = pickOf(rnd, [20, 25, 30, 40, 50, 60, 70, 75, 80]); d = pickOf(rnd, [2, 3, 4, 5, 8]);
        c = U.clamp(Math.round(a * d / 100) + (rnd() < 0.3 ? pickOf(rnd, [-1, 1]) : 0), 1, d - 1);
        L = dec(a); R = frac(c, d);
      } else if (t === 3) {                // “50 的 30%”和“30 的 50%”其实一样大
        a = pickOf(rnd, [20, 30, 40, 50, 60, 80]); b = pickOf(rnd, [10, 20, 25, 30, 40, 50, 60, 75]);
        if (rnd() < 0.45) { L = pct(a, b); R = pct(b, a); }
        else { L = pct(a, b); R = pct(pickOf(rnd, [20, 30, 40, 50, 60, 80]), pickOf(rnd, [10, 20, 25, 30, 40, 50, 60, 75])); }
      } else { n = ri(rnd, 11, 30); k = ri(rnd, 1, 2); L = prod(n - k, n + k); R = prod(n, n); }
    }
    if (L.s === R.s) return null;
    if (rnd() < 0.5) { var tmp = L; L = R; R = tmp; }
    var rel = cmpFrac(L.v, R.v);
    return { text: '哪边大？', left: L.s, right: R.s, options: [L.s, '=', R.s], answer: rel > 0 ? 0 : rel === 0 ? 1 : 2 };
  }

  /* 估算：四个选项等距排开，其中一个离准确值明显最近（偏差不超过步长的三成），不会出现“两个差不多近”的题。 */
  function estOptions(rnd, v) {
    var mag = 1;
    while (mag * 10 <= v) mag *= 10;
    var steps = U.shuffle([mag / 5, mag / 2, mag, mag * 2], rnd);
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st / v < 0.09 || st / v > 0.36) continue;
      var c = Math.round(v / st) * st;
      if (c <= 0 || Math.abs(v - c) > 0.3 * st) continue;
      var kmax = Math.min(3, Math.round(c / st) - 1);     // 最小的选项也得是正数
      if (kmax < 0) continue;
      var k = ri(rnd, 0, kmax), opts = [];
      for (var j = 0; j < 4; j++) opts.push(c + (j - k) * st);
      var wan = opts[0] >= 10000;                          // 四个都上万才用“万”做单位，否则直接写数字
      return { options: opts.map(function (x) { return wan ? (x / 10000) + ' 万' : String(x); }), answer: k };
    }
    return null;
  }
  function estimateQ(level, rnd) {
    var a, b, v, text, t;
    if (level === 'easy') {
      t = ri(rnd, 0, 2);
      if (t === 0) { a = ri(rnd, 21, 98); b = ri(rnd, 3, 9); v = a * b; text = a + ' × ' + b; }
      else if (t === 1) { a = ri(rnd, 105, 895); b = ri(rnd, 105, 895); v = a + b; text = a + ' + ' + b; }
      else { a = ri(rnd, 400, 990); b = ri(rnd, 105, a - 150); v = a - b; text = a + ' − ' + b; }
    } else if (level === 'hard') {
      t = ri(rnd, 0, 4);
      if (t === 0) { a = ri(rnd, 105, 895); b = ri(rnd, 105, 495); v = a * b; text = a + ' × ' + b; }
      else if (t === 1) { a = pickOf(rnd, [19, 21, 24, 26, 31, 49, 51, 74, 76, 99, 101, 124, 149, 151, 199, 249]); b = ri(rnd, 205, 995); v = a * b / 100; text = (a / 100) + ' × ' + b; }
      else if (t === 2) { a = ri(rnd, 26, 95); if (a % 10 === 0) a += 1; v = a * a; text = a + sup(2); }
      else if (t === 3) { a = ri(rnd, 10000, 98000); b = ri(rnd, 105, 495); v = a / b; text = a + ' ÷ ' + b; }
      else { a = ri(rnd, 205, 995); b = pickOf(rnd, [19, 21, 24, 26, 32, 34, 49, 51, 74, 76]); v = a * b / 100; text = a + ' 的 ' + b + '%'; }
    } else {
      t = ri(rnd, 0, 2);
      if (t === 0) { a = ri(rnd, 105, 895); b = ri(rnd, 12, 48); v = a * b; text = a + ' × ' + b; }
      else if (t === 1) { a = ri(rnd, 1200, 9800); b = ri(rnd, 12, 48); v = a / b; text = a + ' ÷ ' + b; }
      else { a = ri(rnd, 1050, 8950); b = ri(rnd, 1050, 8950); v = a + b; text = a + ' + ' + b; }
    }
    if (!(v >= 50)) return null;
    var o = estOptions(rnd, v);
    return o && { text: text, options: o.options, answer: o.answer };
  }

  D.LEVELS = ['easy', 'mid', 'hard'];
  D.KINDS = ['arith', 'compare', 'estimate'];
  D.mathQ = function (kind, level, rnd) {
    rnd = rnd || Math.random;
    if (D.KINDS.indexOf(kind) < 0) kind = 'arith';
    if (D.LEVELS.indexOf(level) < 0) level = 'mid';
    var q = null;
    for (var tries = 0; tries < 400 && !q; tries++) {
      q = kind === 'compare' ? compareQ(level, rnd) : kind === 'estimate' ? estimateQ(level, rnd) : arithQ(level, rnd);
    }
    if (!q) q = { text: '7 × 8', options: ['54', '56', '58', '63'], answer: 1 };   // 理论上到不了这里
    q.kind = q.left ? 'compare' : kind;
    q.level = level;
    return q;
  };

  /* ================================================================== *
   * 纯逻辑 2：五子棋
   * 棋盘 b 是长度 n×n 的数组：0 空，1 下方玩家，2 上方玩家（或电脑）。连成五个或更多都算赢。
   * ================================================================== */
  var GD = [[0, 1], [1, 0], [1, 1], [1, -1]];      // 横、竖、右下斜、左下斜

  /* 经过 (r,c) 这颗子的同色连线，够五个就返回这一串的下标（按顺序），否则返回 null */
  function gmkLine(b, n, r, c) {
    var p = b[r * n + c];
    if (!p) return null;
    for (var d = 0; d < 4; d++) {
      var dr = GD[d][0], dc = GD[d][1], cells = [r * n + c];
      var rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === p) { cells.push(rr * n + cc); rr += dr; cc += dc; }
      rr = r - dr; cc = c - dc;
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === p) { cells.unshift(rr * n + cc); rr -= dr; cc -= dc; }
      if (cells.length >= 5) return cells;
    }
    return null;
  }
  /* 整盘找五连：返回 { p, cells } 或 null */
  function gmkFindWin(b, n) {
    for (var i = 0; i < n * n; i++) {
      if (!b[i]) continue;
      var line = gmkLine(b, n, (i / n) | 0, i % n);
      if (line) return { p: b[i], cells: line };
    }
    return null;
  }

  /* —— 电脑怎么看棋 ——
   * 假设自己在某个空位落子，沿四个方向各取以它为中心的 9 格（左右各 4 格；任何含这颗子的五连都落在这 9 格里），
   * 每格记 1 己方、0 空、2 对方或界外，给这条线定型：
   *   五连 FIVE：已经有连续五个。
   *   活四 O4：再下一手能成五的空位有两个以上（堵不住）。   冲四 F4：只有一个。
   *   活三 O3：再下一手能成活四。   眠三 S3：再下一手只能成冲四。
   *   活二 O2 / 眠二 S2：再下一手能成活三 / 眠三。
   * 定义是递归的，所以直接照定义递归算，并按 9 格的三进制编码缓存（最多 3^9 = 19683 种）。 */
  var G_S2 = 1, G_O2 = 2, G_S3 = 3, G_O3 = 4, G_F4 = 5, G_O4 = 6, G_FIVE = 7;
  var gTable = null;
  var gBuf = [0, 0, 0, 0, 1, 0, 0, 0, 0];
  var gCnt = [0, 0, 0, 0, 0, 0, 0, 0];
  function gLevel(a) {
    var code = 0, i;
    for (i = 0; i < 9; i++) code = code * 3 + a[i];
    if (gTable[code] >= 0) return gTable[code];
    var lv = 0;
    for (i = 0; i <= 4 && !lv; i++) {
      if (a[i] === 1 && a[i + 1] === 1 && a[i + 2] === 1 && a[i + 3] === 1 && a[i + 4] === 1) lv = G_FIVE;
    }
    if (!lv) {
      var best = 0, fives = 0;
      for (i = 0; i < 9; i++) {
        if (a[i] !== 0) continue;
        a[i] = 1;
        var s = gLevel(a);
        a[i] = 0;
        if (s === G_FIVE) fives++;
        if (s > best) best = s;
      }
      lv = best === G_FIVE ? (fives >= 2 ? G_O4 : G_F4)
        : best === G_O4 ? G_O3
        : best === G_F4 ? G_S3
        : best === G_O3 ? G_O2
        : best === G_S3 ? G_S2 : 0;
    }
    gTable[code] = lv;
    return lv;
  }
  function gInit() {
    if (gTable) return;
    gTable = new Int8Array(19683);
    for (var i = 0; i < gTable.length; i++) gTable[i] = -1;
  }
  /* 假设 p 落在 (r,c)：四个方向各成什么型，数进 cnt[型] */
  function gCount(b, n, r, c, p, cnt) {
    var d, k;
    for (k = 0; k < 8; k++) cnt[k] = 0;
    for (d = 0; d < 4; d++) {
      var dr = GD[d][0], dc = GD[d][1];
      for (k = -4; k <= 4; k++) {
        if (k === 0) { gBuf[4] = 1; continue; }
        var rr = r + dr * k, cc = c + dc * k;
        var v = (rr < 0 || rr >= n || cc < 0 || cc >= n) ? 3 : b[rr * n + cc];
        gBuf[k + 4] = v === 0 ? 0 : v === p ? 1 : 2;
      }
      cnt[gLevel(gBuf)]++;
    }
  }
  /* 把型换成分数。mine：这是自己落子的进攻分；否则是“对方要是下在这儿”的防守分。
   * 分数分档，保证优先级：自己成五 > 堵对方成五 > 自己活四/双冲四 > 自己冲四活三 > 堵对方活四（即对方现在有活三）
   * > 堵对方冲四活三 > 自己双活三 > 堵对方双活三 > 其余按型累加。 */
  function gScore(cnt, mine) {
    if (cnt[G_FIVE]) return mine ? 1e8 : 5e7;
    if (cnt[G_O4] || cnt[G_F4] >= 2) return mine ? 1e7 : 2e6;
    if (cnt[G_F4] && cnt[G_O3]) return mine ? 5e6 : 1e6;
    if (cnt[G_O3] >= 2) return mine ? 5e5 : 2e5;
    return mine
      ? cnt[G_F4] * 900 + cnt[G_O3] * 3000 + cnt[G_S3] * 260 + cnt[G_O2] * 320 + cnt[G_S2] * 30
      : cnt[G_F4] * 350 + cnt[G_O3] * 1300 + cnt[G_S3] * 110 + cnt[G_O2] * 160 + cnt[G_S2] * 14;
  }
  /* 候选点：离任何一颗棋子不超过两格的空位 */
  function gCands(b, n) {
    var mark = new Uint8Array(n * n), out = [];
    for (var i = 0; i < n * n; i++) {
      if (!b[i]) continue;
      var r = (i / n) | 0, c = i % n;
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          var j = rr * n + cc;
          if (!b[j] && !mark[j]) { mark[j] = 1; out.push(j); }
        }
      }
    }
    return out;
  }
  /* 经过 (r,c)（p 的子）的线上，p 再下一手就能成五的空位 */
  function gFiveCells(b, n, r, c, p) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      var dr = GD[d][0], dc = GD[d][1];
      for (var s = -4; s <= 0; s++) {
        var empty = -1, mine = 0, ok = true;
        for (var i = 0; i < 5 && ok; i++) {
          var rr = r + dr * (s + i), cc = c + dc * (s + i);
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) { ok = false; break; }
          var v = b[rr * n + cc];
          if (v === p) mine++;
          else if (v === 0 && empty < 0) empty = rr * n + cc;
          else ok = false;
        }
        if (ok && mine === 4 && empty >= 0 && out.indexOf(empty) < 0) out.push(empty);
      }
    }
    return out;
  }
  /* 连续冲四取胜（VCF）搜索：me 每一手都下出“四”，对方只能堵那唯一的点；看能不能一路逼到成五或活四。
   * forced ≥ 0 表示 me 这一手自己也被逼着只能下在 forced（对方刚好也有个四）。找到返回第一手的下标，否则 −1。 */
  function gVcf(b, n, me, depth, forced, budget) {
    if (budget.n-- <= 0) return -1;
    var opp = 3 - me, cands = forced >= 0 ? [forced] : gCands(b, n), fours = [], i, m;
    for (i = 0; i < cands.length; i++) {
      m = cands[i];
      gCount(b, n, (m / n) | 0, m % n, me, gCnt);
      if (gCnt[G_FIVE]) return m;
      if (gCnt[G_O4] || gCnt[G_F4]) fours.push(m);
    }
    if (depth <= 0) return -1;
    for (i = 0; i < fours.length; i++) {
      m = fours[i];
      b[m] = me;
      var fc = gFiveCells(b, n, (m / n) | 0, m % n, me), win = false;
      if (fc.length >= 2) win = true;                       // 两个成五点，对方只能堵一个
      else if (fc.length === 1) {
        var x = fc[0];
        b[x] = opp;                                         // 对方只能堵在这里
        if (!gmkLine(b, n, (x / n) | 0, x % n)) {           // 堵的这一手没让对方自己成五
          var of = gFiveCells(b, n, (x / n) | 0, x % n, opp);
          if (of.length <= 1 && gVcf(b, n, me, depth - 1, of.length ? of[0] : -1, budget) >= 0) win = true;
        }
        b[x] = 0;
      }
      b[m] = 0;
      if (win) return m;
    }
    return -1;
  }

  /* 电脑落子：返回下标。level 1 新手（会漏看活三和组合杀，分数带噪声）· 2 普通 · 3 高手（加连续冲四搜索，并且不走送杀的棋）。
   * 任何强度下都保证：自己能成五必下；否则对方已成四必堵。 */
  function gmkAI(b, n, me, level, rnd) {
    rnd = rnd || Math.random;
    level = level || 2;
    gInit();
    var opp = 3 - me, cands = gCands(b, n), rows = [], i, m, r, c;
    var mid = (n - 1) / 2;
    if (!cands.length) {
      var center = ((n / 2) | 0) * n + ((n / 2) | 0);
      if (!b[center]) return center;
      for (i = 0; i < n * n; i++) if (!b[i]) return i;
      return -1;
    }
    for (i = 0; i < cands.length; i++) {
      m = cands[i]; r = (m / n) | 0; c = m % n;
      gCount(b, n, r, c, me, gCnt);
      if (gCnt[G_FIVE]) return m;                           // 自己能成五：必下
      var a = gScore(gCnt, true);
      gCount(b, n, r, c, opp, gCnt);
      rows.push({ m: m, a: a, d: gScore(gCnt, false), five: gCnt[G_FIVE] > 0, s: 0 });
    }
    var blocks = rows.filter(function (x) { return x.five; });
    if (blocks.length) {                                    // 对方已成四：必堵（有两处也只能堵一处，挑对自己更有用的）
      blocks.sort(function (x, y) { return y.a - x.a; });
      return blocks[0].m;
    }
    if (level >= 3) {
      var w = gVcf(b, n, me, 7, -1, { n: 5000 });
      if (w >= 0) return w;
    }
    var blind = level <= 1 && rnd() < 0.4;
    rows.forEach(function (x) {
      var d = x.d;
      if (level <= 1) {
        if (d >= 2e6) { if (blind) d = 1500; }              // 新手有四成的时候看不出对面的活三
        else if (d >= 2e5) d = 1500;                        // 也从来看不出“冲四活三”“双活三”这种组合
      }
      var dist = Math.abs(((x.m / n) | 0) - mid) + Math.abs(x.m % n - mid);
      x.s = (x.a + d) * (level <= 1 ? 0.7 + 0.6 * rnd() : 1) - dist * 3 + rnd() * 20;
    });
    rows.sort(function (x, y) { return y.s - x.s; });
    if (level >= 3 && rows[0].a < 5e6) {
      // 往后多看一步：按分数从高到低，挑第一手“下完以后对方没法连续冲四杀掉我”的
      for (i = 0; i < rows.length && i < 8; i++) {
        m = rows[i].m;
        b[m] = me;
        var my5 = gFiveCells(b, n, (m / n) | 0, m % n, me);
        var danger = my5.length >= 2 ? -1 : gVcf(b, n, opp, 5, my5.length ? my5[0] : -1, { n: 2500 });
        b[m] = 0;
        if (danger < 0) return m;
      }
    }
    return rows[0].m;
  }
  D.gmkLine = gmkLine;
  D.gmkFindWin = gmkFindWin;
  D.gmkAI = gmkAI;
  D.gmkFiveCells = function (b, n, r, c, p) { return gFiveCells(b, n, r, c, p); };
  /* 给测试用：假设 p 落在 (r,c)，四个方向各成什么型。返回 cnt，cnt[D.G.O3] 就是活三的条数 */
  D.G = { S2: G_S2, O2: G_O2, S3: G_S3, O3: G_O3, F4: G_F4, O4: G_O4, FIVE: G_FIVE };
  D.gmkShapes = function (b, n, r, c, p) {
    var cnt = [0, 0, 0, 0, 0, 0, 0, 0];
    gInit();
    gCount(b, n, r, c, p, cnt);
    return cnt;
  };
  /* 给测试用：p 现在落在哪些空位能直接成五 */
  D.gmkWinningMoves = function (b, n, p) {
    var out = [];
    for (var i = 0; i < n * n; i++) {
      if (b[i]) continue;
      b[i] = p;
      if (gmkLine(b, n, (i / n) | 0, i % n)) out.push(i);
      b[i] = 0;
    }
    return out;
  };

  /* ================================================================== *
   * 纯逻辑 3：点格棋
   * n×n 个格子、(n+1)×(n+1) 个点。
   *   横边 h：第 r 行点（r = 0..n）上从第 c 个点到第 c+1 个点（c = 0..n−1），下标 r*n + c。
   *           它是格子 (r−1, c) 的下边、格子 (r, c) 的上边。
   *   竖边 v：第 c 列点（c = 0..n）上从第 r 个点到第 r+1 个点（r = 0..n−1），下标 r*(n+1) + c。
   *           它是格子 (r, c−1) 的右边、格子 (r, c) 的左边。
   * 规则：轮流画一条边；谁画下第四条边围成一个格子，谁得一分并且必须再画一条；全部围完分高者胜。
   * ================================================================== */
  function dotsNew(n, players, first) {
    return {
      n: n, players: players,
      h: fill((n + 1) * n, -1), v: fill(n * (n + 1), -1), box: fill(n * n, -1),
      score: fill(players, 0), turn: first || 0, left: n * n, moves: 0
    };
  }
  function dotsSides(s, r, c) {
    var n = s.n;
    return (s.h[r * n + c] >= 0 ? 1 : 0) + (s.h[(r + 1) * n + c] >= 0 ? 1 : 0) +
      (s.v[r * (n + 1) + c] >= 0 ? 1 : 0) + (s.v[r * (n + 1) + c + 1] >= 0 ? 1 : 0);
  }
  function dotsFree(s, type, r, c) {
    var n = s.n;
    if (type === 'h') return r >= 0 && r <= n && c >= 0 && c < n && s.h[r * n + c] < 0;
    if (type === 'v') return r >= 0 && r < n && c >= 0 && c <= n && s.v[r * (n + 1) + c] < 0;
    return false;
  }
  /* 当前玩家画一条边。不合法返回 null；否则返回 { who, made:[围成的格子下标], again, over } */
  function dotsPlay(s, type, r, c) {
    if (s.left === 0 || !dotsFree(s, type, r, c)) return null;
    var n = s.n, who = s.turn, made = [];
    if (type === 'h') s.h[r * n + c] = who; else s.v[r * (n + 1) + c] = who;
    s.moves++;
    (type === 'h' ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]]).forEach(function (bx) {
      var br = bx[0], bc = bx[1];
      if (br < 0 || br >= n || bc < 0 || bc >= n) return;
      if (s.box[br * n + bc] < 0 && dotsSides(s, br, bc) === 4) { s.box[br * n + bc] = who; made.push(br * n + bc); }
    });
    s.score[who] += made.length;
    s.left -= made.length;
    if (!made.length) s.turn = (who + 1) % s.players;
    return { who: who, made: made, again: made.length > 0 && s.left > 0, over: s.left === 0 };
  }
  D.dotsNew = dotsNew;
  D.dotsPlay = dotsPlay;
  D.dotsFree = dotsFree;
  D.dotsSides = dotsSides;

  /* ================================================================== *
   * 纯逻辑 4：其余几个小游戏
   * ================================================================== */

  /* 反应对决一轮的信号安排：[{ at 距开始毫秒, hold 亮多久（真信号为 0：一直亮到有人按）, shape, color, real }]，最后一个是真信号。
   *   simple：只有一个真信号，在 1.5–5 秒之间出现。
   *   trick ：真信号之前有 0–3 个假信号。假信号与目标至少有一处（形状或颜色）不同，
   *           而且不出“形状相同、只是红绿对调”的，照顾红绿色弱的人。 */
  var R_SHAPES = ['circle', 'square', 'triangle', 'diamond'];
  var R_COLORS = ['green', 'red', 'yellow', 'blue'];
  function reactionPlan(mode, rnd, target) {
    rnd = rnd || Math.random;
    target = target || { shape: 'circle', color: 'green' };
    if (mode !== 'trick') return [{ at: Math.round(1500 + rnd() * 3500), hold: 0, shape: target.shape, color: target.color, real: true }];
    var x = rnd(), decoys = x < 0.2 ? 0 : x < 0.55 ? 1 : x < 0.85 ? 2 : 3, plan = [], t = 0;
    for (var i = 0; i < decoys; i++) {
      var s, c, tries = 0;
      do {
        var share = rnd();            // 六成的假信号只差一处，最像真的
        s = share < 0.3 ? target.shape : pickOf(rnd, R_SHAPES);
        c = share >= 0.3 && share < 0.6 ? target.color : pickOf(rnd, R_COLORS);
        tries++;
      } while (tries < 50 && ((s === target.shape && c === target.color) ||
        (s === target.shape && ((c === 'red' && target.color === 'green') || (c === 'green' && target.color === 'red')))));
      t += Math.round(1300 + rnd() * 1100);
      plan.push({ at: t, hold: 650, shape: s, color: c, real: false });
    }
    t += Math.round((decoys ? 1300 : 1500) + rnd() * (decoys ? 1100 : 2500));
    plan.push({ at: t, hold: 0, shape: target.shape, color: target.color, real: true });
    return plan;
  }
  D.reactionPlan = reactionPlan;
  D.R_SHAPES = R_SHAPES;
  D.R_COLORS = R_COLORS;

  /* 指尖拔河：绳结位置 pos ∈ [−1, 1]，+1 是下方玩家（0 号）的胜利线，−1 是上方玩家的。
   * 每点一下移动 0.07（两人手速差两成时，大约七八秒分出胜负）；下方玩家的每一下只算 (1 − 负重)。 */
  var TAP_STEP = 0.07;
  D.tapwarStep = function (pos, p, handicap) {
    return U.clamp(pos + (p === 0 ? TAP_STEP * (1 - (handicap || 0)) : -TAP_STEP), -1, 1);
  };

  /* 估秒：按百分之一秒取整以后再比，谁离目标近谁赢。返回按差距从小到大排好的 [{ p, cs 实际用时（厘秒）, diff 与目标的差（厘秒，正数是按晚了） }] */
  D.tensecRank = function (targetSec, timesMs) {
    var goal = Math.round(targetSec * 100);
    return timesMs.map(function (ms, p) {
      var cs = Math.round(ms / 10);
      return { p: p, cs: cs, diff: cs - goal };
    }).sort(function (x, y) { return Math.abs(x.diff) - Math.abs(y.diff) || x.p - y.p; });
  };
  D.fmtCs = function (cs) { return (cs / 100).toFixed(2); };

  /* 斯特鲁普测试的题目：count 题里“一致”（字义 = 字的颜色）和“不一致”各一半；
   * 四种字色出现的次数尽量相同（20 题时正好各 5 次）；
   * 打乱后保证相邻两题不完全相同、同一种字色不连续出现三次。 */
  var S_KEYS = ['red', 'blue', 'green', 'yellow'];
  var S_WORDS = ['红', '蓝', '绿', '黄'];
  function stroopTrials(rnd, count) {
    rnd = rnd || Math.random;
    count = count || 20;
    var half = count >> 1, list = [], i;
    for (i = 0; i < half; i++) list.push({ word: i % 4, ink: i % 4, same: true });
    for (i = 0; i < count - half; i++) {
      var ink = (i + half) % 4;                 // 接着“一致”题往下轮，四种字色才能凑平
      list.push({ word: (ink + 1 + ri(rnd, 0, 2)) % 4, ink: ink, same: false });
    }
    var out = list;
    for (var tries = 0; tries < 300; tries++) {
      out = U.shuffle(list, rnd);
      var ok = true;
      for (i = 1; i < out.length && ok; i++) {
        if (out[i].word === out[i - 1].word && out[i].ink === out[i - 1].ink) ok = false;
        if (i >= 2 && out[i].ink === out[i - 1].ink && out[i].ink === out[i - 2].ink) ok = false;
      }
      if (ok) break;
    }
    return out;
  }
  /* recs: [{ same, ok, rt }]。只用答对的题算平均反应时间；干扰代价 = 不一致题平均 − 一致题平均（毫秒）。 */
  function stroopStats(recs) {
    function mean(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
    var same = [], diff = [], wrong = 0;
    recs.forEach(function (x) {
      if (!x.ok) { wrong++; return; }
      (x.same ? same : diff).push(x.rt);
    });
    var s = { n: recs.length, wrong: wrong, same: mean(same), diff: mean(diff), all: mean(same.concat(diff)), cost: null };
    if (s.same != null && s.diff != null) s.cost = s.diff - s.same;
    return s;
  }
  D.stroopTrials = stroopTrials;
  D.stroopStats = stroopStats;
  D.S_KEYS = S_KEYS;
  D.S_WORDS = S_WORDS;

  /* ================================================================== *
   * reaction 反应对决
   * params: { players: 2 | 3, mode: 'simple' | 'trick', first: 3（先赢几轮算赢，默认五局三胜） }
   * ================================================================== */
  function shapeNode(id, shape, color, mini) {
    return el('span.w-' + id + '-shape' + (mini ? '.w-' + id + '-shape--mini' : ''), { attrs: { 'data-shape': shape, 'data-color': color } });
  }

  JN.registerWidget({
    id: 'reaction',
    name: '反应对决',
    rules: '每人管自己那一块。屏幕一变绿就按，先按到的人赢这一轮；还没变就按算抢跑，这一轮判负。先赢三轮的人获胜。' +
      '花样模式会冒出假信号：只有和“目标”颜色、形状都一样的图案出现时才能按，按错了也算输。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var n = Number(params.players) === 3 ? 3 : 2;
      var trick = params.mode === 'trick';
      var need = clampInt(params.first, 1, 5, 3);
      var lay = seats('reaction', n);
      var score = fill(n, 0), ready = fill(n, false), out = fill(n, false), late = fill(n, false);
      var phase = 'gate';          // gate 等大家点准备 → armed 预备 → go 信号亮了 → shown 这一轮出结果 → over 整局结束
      var target = { shape: 'circle', color: 'green' };
      var roundNo = 0, t0 = 0, firstRt = -1, winner = -1, flashOn = null, planTimers = [], overAt = 0;

      var ui = lay.pads.map(function (pad, p) {
        var u = {
          pad: pad,
          pips: el('div.w-reaction-pips', U.range(need).map(function () { return el('i'); })),
          sig: el('div.w-reaction-sig'),
          big: el('div.w-reaction-big'),
          sub: el('div.w-reaction-sub'),
          again: el('button.jn-btn.jn-btn--light.w-reaction-again', { text: '再来一局', attrs: { type: 'button' } })
        };
        u.again.hidden = true;
        onPress(kit, u.again, rematch);
        U.append(pad, [u.pips, u.sig, u.big, u.sub, u.again]);
        onPress(kit, pad, function (e) { if (e.target !== u.again) press(p); });
        return u;
      });
      root.appendChild(lay.wrap);

      function set(p, state, big, sub) {
        var u = ui[p];
        u.pad.setAttribute('data-s', state);
        u.big.textContent = big || '';
        U.clear(u.sub);
        U.append(u.sub, sub);
      }
      function showSig(p, f) {
        U.clear(ui[p].sig);
        if (f) ui[p].sig.appendChild(shapeNode('reaction', f.shape, f.color));
      }
      function armedLook(p) {
        showSig(p, null);
        set(p, 'armed', '预备……', trick ? ['只认这个 ', shapeNode('reaction', target.shape, target.color, true)] : '一变绿就按');
      }
      function pips() {
        ui.forEach(function (u, p) {
          for (var k = 0; k < need; k++) u.pips.children[k].classList.toggle('is-on', k < score[p]);
        });
      }
      function gate() {
        phase = 'gate';
        ui.forEach(function (u, p) {
          ready[p] = false;
          showSig(p, null);
          set(p, 'gate', '点一下，准备', trick ? '只有“目标”图案出现才能按' : '一变绿就按，先按的赢');
        });
        pips();
      }

      function startRound() {
        roundNo++;
        phase = 'armed';
        winner = -1; firstRt = -1; flashOn = null;
        if (trick) target = roundNo === 1 ? { shape: 'circle', color: 'green' } : { shape: pickOf(Math.random, R_SHAPES), color: pickOf(Math.random, R_COLORS) };
        ui.forEach(function (u, p) { out[p] = false; late[p] = false; armedLook(p); });
        planTimers = reactionPlan(trick ? 'trick' : 'simple', Math.random, target).map(function (f) {
          return kit.after(f.at, function () { flash(f); });
        });
      }
      function stopPlan() {
        planTimers.forEach(function (id) { kit.cancel(id); });
        planTimers = [];
      }
      function flash(f) {
        if (phase !== 'armed') return;
        ctx.sfx('pop');
        ctx.haptic(40);
        if (f.real) {
          phase = 'go';
          t0 = now();
          ui.forEach(function (u, p) {
            if (out[p]) return;
            if (trick) { showSig(p, f); set(p, 'flash', '', ''); }
            else set(p, 'go', '按！', '');
          });
          // 四秒都没人按：这一轮作废重来
          planTimers.push(kit.after(4000, function () {
            if (phase !== 'go') return;
            phase = 'shown';
            ui.forEach(function (u, p) { showSig(p, null); set(p, 'lose', '没人按？', '这一轮不算，重来'); });
            kit.after(1500, startRound);
          }));
        } else {
          flashOn = f;
          ui.forEach(function (u, p) { if (!out[p]) { showSig(p, f); set(p, 'flash', '', ''); } });
          planTimers.push(kit.after(f.hold, function () {
            if (phase !== 'armed' || flashOn !== f) return;
            flashOn = null;
            ui.forEach(function (u, p) { if (!out[p]) armedLook(p); });
          }));
        }
      }

      function press(p) {
        if (phase === 'gate') {
          if (ready[p]) return;
          ready[p] = true;
          set(p, 'ready', '准备好了', n === 2 ? '等对面' : '等其他人');
          ctx.sfx('tap');
          if (ready.every(Boolean)) { phase = 'wait'; kit.after(700, startRound); }
        } else if (phase === 'armed') {
          if (out[p]) return;
          out[p] = true;                                   // 信号没亮（或者亮的是假信号）就按：这一轮出局
          showSig(p, null);
          set(p, 'foul', flashOn ? '不是这个！' : '抢跑！', '这一轮你出局');
          ctx.sfx('buzz');
          ctx.haptic([40, 40, 40]);
          var live = U.range(n).filter(function (q) { return !out[q]; });
          if (live.length === 1) endRound(live[0], -1);
        } else if (phase === 'go') {
          if (!out[p]) endRound(p, Math.max(1, Math.round(now() - t0)));
        } else if (phase === 'shown' && firstRt >= 0 && p !== winner && !out[p] && !late[p]) {
          var rt = Math.round(now() - t0);                 // 慢的那位也告诉他慢了多少，免得不服
          if (rt - firstRt > 1200) return;
          late[p] = true;
          set(p, 'lose', '慢了 ' + Math.max(1, rt - firstRt) + ' 毫秒', '你 ' + rt + ' · 对手 ' + firstRt);
        }
      }

      function endRound(w, rt) {
        stopPlan();
        phase = 'shown';
        winner = w; firstRt = rt;
        score[w]++;
        pips();
        ui.forEach(function (u, p) {
          if (p === w) {
            showSig(p, null);
            set(p, 'win', rt >= 0 ? rt + ' 毫秒' : '这轮归你', rt >= 0 ? '你先按到' : (n === 2 ? '对面出局了' : '别人都出局了'));
          } else if (!out[p]) {
            showSig(p, null);
            set(p, 'lose', '被抢先了', '对手 ' + rt + ' 毫秒');
          }
        });
        ctx.sfx('good');
        if (score[w] >= need) kit.after(1300, finish);
        else kit.after(2300, startRound);
      }

      function finish() {
        phase = 'over';
        overAt = now();
        ui.forEach(function (u, p) {
          var others = U.range(n).filter(function (q) { return q !== p; }).map(function (q) { return score[q]; });
          showSig(p, null);
          set(p, p === winner ? 'champ' : 'beaten', p === winner ? '你赢了！' : '这局输了', '比分 ' + score[p] + ' : ' + others.join(' : '));
          u.again.hidden = false;
        });
        ctx.sfx('win');
        ctx.haptic([30, 60, 120]);
        ctx.confetti();
        ctx.done({ text: '比分 ' + score.join(' : ') });
      }
      function rematch() {
        if (phase !== 'over' || now() - overAt < 500) return;
        ctx.sfx('tap');
        roundNo = 0;
        ui.forEach(function (u, p) { score[p] = 0; u.again.hidden = true; set(p, 'ready', '新的一局', '手拿开，等信号'); });
        pips();
        phase = 'wait';
        kit.after(900, startRound);
      }

      gate();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var box = el('div.w-reaction-pv', [
        el('div.w-reaction-pvhalf', { attrs: { 'data-p': 1 } }, [el('b')]),
        el('div.w-reaction-pvhalf', { attrs: { 'data-p': 0 } }, [el('b')])
      ]);
      var top = box.children[0], bot = box.children[1];
      root.appendChild(box);
      var steps = [
        function () { box.setAttribute('data-s', 'armed'); top.firstChild.textContent = '预备……'; bot.firstChild.textContent = '预备……'; },
        function () { box.setAttribute('data-s', 'go'); top.firstChild.textContent = '按！'; bot.firstChild.textContent = '按！'; },
        function () { box.setAttribute('data-s', 'win'); top.firstChild.textContent = '慢了 31 毫秒'; bot.firstChild.textContent = '236 毫秒'; }
      ];
      var waits = [1700, 500, 1800], i = 0;
      function next() {
        steps[i]();
        var w = waits[i];
        i = (i + 1) % steps.length;
        kit.after(w, next);
      }
      if (ctx.reduced) steps[2](); else next();
      return { destroy: function () { kit.destroy(); } };
    }
  });

  /* ================================================================== *
   * tapwar 指尖拔河
   * params: { handicap: 0–0.5（下方玩家的负重，开局前可用滑块改）, secs: 10–20（一局最长几秒，默认 15） }
   * ================================================================== */
  JN.registerWidget({
    id: 'tapwar',
    name: '指尖拔河',
    rules: '两个人各自狂点自己那半块屏幕，把中间的绳结往自己这边拉，拉过自己面前那条线就赢。时间到了还没分出胜负，绳结在谁那边谁赢。' +
      '底下的滑块可以给下方的人加“负重”：负重三成，就是他每点一下只算七成的力气。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var handicap = Math.round(U.clamp(Number(params.handicap) || 0, 0, 0.5) * 20) / 20;
      var secs = clampInt(params.secs, 10, 20, 15);
      var lay = seats('tapwar', 2);
      var arena = el('div.w-tapwar-arena');
      while (lay.wrap.firstChild) arena.appendChild(lay.wrap.firstChild);

      var goalTop = U.svg('line', { class: 'w-tapwar-goal', 'data-p': 1 });
      var goalBot = U.svg('line', { class: 'w-tapwar-goal', 'data-p': 0 });
      var cord = U.svg('path', { class: 'w-tapwar-cord' });
      var twist = U.svg('path', { class: 'w-tapwar-twist' });
      var knot = U.svg('g', { class: 'w-tapwar-knot' }, [
        U.svg('circle', { r: 19, class: 'w-tapwar-knot-halo' }),
        U.svg('circle', { r: 12, class: 'w-tapwar-knot-dot' })
      ]);
      var gripTop = U.svg('line', { class: 'w-tapwar-grip', 'data-p': 1 });
      var gripBot = U.svg('line', { class: 'w-tapwar-grip', 'data-p': 0 });
      var svg = U.svg('svg', { class: 'w-tapwar-rope', 'aria-hidden': 'true' }, [goalTop, goalBot, cord, twist, gripTop, gripBot, knot]);
      var fx = el('div.w-tapwar-fx');
      arena.appendChild(svg);
      arena.appendChild(fx);

      var loadText = el('span.w-tapwar-load-t');
      var range = el('input.jn-range.w-tapwar-load-r', { attrs: { type: 'range', min: 0, max: 50, step: 5, 'aria-label': '下方玩家的负重' } });
      range.value = Math.round(handicap * 100);
      var strip = el('div.w-tapwar-load', [loadText, range]);
      lay.wrap.appendChild(arena);
      lay.wrap.appendChild(strip);
      root.appendChild(lay.wrap);

      var ui = lay.pads.map(function (pad, p) {
        var u = {
          pad: pad,
          big: el('div.w-tapwar-big'),
          sub: el('div.w-tapwar-sub'),
          alert: el('div.w-tapwar-alert'),
          again: el('button.jn-btn.jn-btn--light.w-tapwar-again', { text: '再来一局', attrs: { type: 'button' } })
        };
        u.again.hidden = true;
        onPress(kit, u.again, rematch);
        U.append(pad, [u.alert, u.big, u.sub, u.again]);
        onPress(kit, pad, function (e) { if (e.target !== u.again) press(p, e); });
        return u;
      });

      var phase = 'gate';            // gate → count → play → over
      var ready = [false, false], taps = [0, 0], wins = [0, 0], streak = 0, lastTap = [0, 0];
      var pos = 0, disp = 0, energy = 0, tStart = 0, shownSec = -1, danger = -1, lastBuzz = 0, ripples = 0, clockId = 0;
      var W = 0, H = 0, reach = 0, ROPE = 1.12;

      function set(p, state, big, sub) {
        ui[p].pad.setAttribute('data-s', state);
        ui[p].big.textContent = big;
        ui[p].sub.textContent = sub;
      }
      function loadLabel() {
        var pct = Math.round(handicap * 100);
        var hint = streak >= 2 && pct < 50 ? '下面这位连赢 ' + streak + ' 局了，加点负重？' : streak <= -2 && pct > 0 ? '上面这位连赢 ' + (-streak) + ' 局了，减点负重？' : '';
        loadText.textContent = hint || (pct ? '下方负重 ' + pct + '%：每点一下只算 ' + (100 - pct) + '%' : '下方负重 0：公平对决');
      }
      kit.on(range, 'input', function () {
        handicap = U.clamp((Number(range.value) || 0) / 100, 0, 0.5);
        streak = 0;
        loadLabel();
      });

      function layout() {
        W = arena.clientWidth || ctx.size().w || 320;
        H = arena.clientHeight || ctx.size().h || 480;
        reach = H * 0.27;                       // 中线到胜利线的距离
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        [[goalTop, H / 2 - reach, 14], [goalBot, H / 2 + reach, 14],
          [gripTop, H / 2 - reach * ROPE, W / 2 - 22], [gripBot, H / 2 + reach * ROPE, W / 2 - 22]].forEach(function (g) {
          g[0].setAttribute('x1', g[2]); g[0].setAttribute('x2', W - g[2]);
          g[0].setAttribute('y1', g[1]); g[0].setAttribute('y2', g[1]);
        });
        draw(0);
      }
      /* 画绳子：一条竖线加一点左右抖动，抖动幅度跟着最近的点击力度（energy）走；绳纹跟着绳结一起移动。
       * 绳子两头各伸出胜利线一小截（握把），不压住两边贴着外侧的字。 */
      function draw(t) {
        var cx = W / 2, ky = H / 2 + disp * reach;
        var amp = ctx.reduced ? 0 : 1.5 + energy * 7;
        var y0 = H / 2 - reach * ROPE, y1 = H / 2 + reach * ROPE;
        var d = '', kx = cx;
        for (var i = 0; i <= 24; i++) {
          var y = y0 + (y1 - y0) * i / 24;
          var x = cx + (i === 0 || i === 24 ? 0 : amp * Math.sin(y * 0.045 + t * 0.03));
          d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        }
        kx = cx + amp * Math.sin(ky * 0.045 + t * 0.03);
        cord.setAttribute('d', d);
        twist.setAttribute('d', d);
        twist.setAttribute('stroke-dashoffset', (-ky).toFixed(1));
        knot.setAttribute('transform', 'translate(' + kx.toFixed(1) + ' ' + ky.toFixed(1) + ')');
      }
      function ripple(e, p) {
        if (ctx.reduced || ripples > 14 || e.clientX == null) return;
        var r = arena.getBoundingClientRect();
        var dot = el('i.w-tapwar-ripple');
        dot.style.left = (e.clientX - r.left) + 'px';
        dot.style.top = (e.clientY - r.top) + 'px';
        dot.style.setProperty('--pc', PCOLORS[p]);
        fx.appendChild(dot);
        ripples++;
        kit.after(420, function () { ripples--; if (dot.parentNode) dot.parentNode.removeChild(dot); });
      }

      function gate() {
        phase = 'gate';
        ready = [false, false];
        range.disabled = false;
        lay.wrap.setAttribute('data-phase', 'gate');
        set(0, 'gate', '点一下，准备', '把绳结拉过你面前这条线');
        set(1, 'gate', '点一下，准备', '把绳结拉过你面前这条线');
        loadLabel();
      }
      function countdown() {
        phase = 'count';
        range.disabled = true;
        lay.wrap.setAttribute('data-phase', 'count');
        pos = 0; disp = 0; energy = 0; taps = [0, 0]; danger = -1;
        lay.wrap.removeAttribute('data-danger');
        draw(0);
        var k = 3;
        (function step() {
          if (k === 0) return go();
          set(0, 'count', String(k), '手指就位');
          set(1, 'count', String(k), '手指就位');
          ctx.sfx('pop');
          k--;
          kit.after(520, step);
        })();
      }
      function go() {
        phase = 'play';
        lay.wrap.setAttribute('data-phase', 'play');
        tStart = now();
        shownSec = -1;
        set(0, 'play', '狂点！', '');
        set(1, 'play', '狂点！', '');
        ctx.sfx('whoosh');
        ctx.haptic(60);
        clock();
        clockId = kit.every(100, clock);       // 倒计时、告急、时间到都由定时器管，不依赖动画帧
        kit.loop(frame);                       // 动画帧只负责画绳子
      }
      function frame(t) {
        disp += (pos - disp) * 0.3;
        energy *= 0.93;
        draw(t);
      }
      function clock() {
        var left = secs * 1000 - (now() - tStart);
        var s = Math.max(0, Math.ceil(left / 1000));
        if (s !== shownSec) {
          shownSec = s;
          ui[0].sub.textContent = ui[1].sub.textContent = '还剩 ' + s + ' 秒';
          if (s <= 5 && s > 0) ctx.sfx('pop');
        }
        // 绳结离谁的线只剩三成多：对面那位告急
        var dz = pos > 0.62 ? 1 : pos < -0.62 ? 0 : -1;
        if (dz !== danger) {
          danger = dz;
          if (dz < 0) lay.wrap.removeAttribute('data-danger'); else lay.wrap.setAttribute('data-danger', dz);
          ui[0].alert.textContent = dz < 0 ? '' : dz === 0 ? '顶住！' : '再来几下！';
          ui[1].alert.textContent = dz < 0 ? '' : dz === 1 ? '顶住！' : '再来几下！';
        }
        if (danger >= 0 && now() - lastBuzz > 420) { lastBuzz = now(); ctx.haptic(25); }
        if (left <= 0) finish(pos > 0.0001 ? 0 : pos < -0.0001 ? 1 : -1, true);
      }

      function press(p, e) {
        if (phase === 'gate') {
          if (ready[p]) return;
          ready[p] = true;
          set(p, 'ready', '准备好了', '等对面');
          ctx.sfx('tap');
          if (ready[0] && ready[1]) { phase = 'wait'; kit.after(500, countdown); }
        } else if (phase === 'play') {
          var t = now();
          if (t - lastTap[p] < 25) return;       // 同一瞬间落下的几根手指（一巴掌拍上去）只算一下
          lastTap[p] = t;
          pos = D.tapwarStep(pos, p, handicap);
          taps[p]++;
          energy = Math.min(1, energy + 0.22);
          ui[p].big.textContent = taps[p];
          ctx.sfx(p ? 'tick' : 'tap');
          ripple(e, p);
          if (pos >= 1) finish(0, false);
          else if (pos <= -1) finish(1, false);
        }
      }

      function finish(w, timeUp) {
        if (phase !== 'play') return;
        phase = 'over';
        kit.stopLoop();
        kit.stopEvery(clockId);
        var dur = Math.max(0.5, (now() - tStart) / 1000);
        disp = pos;
        energy = 0;
        draw(0);
        lay.wrap.setAttribute('data-phase', 'over');
        lay.wrap.removeAttribute('data-danger');
        ui[0].alert.textContent = ui[1].alert.textContent = '';
        if (w >= 0) { wins[w]++; streak = w === 0 ? Math.max(1, streak + 1) : Math.min(-1, streak - 1); }
        [0, 1].forEach(function (p) {
          var stat = taps[p] + ' 下，每秒 ' + (taps[p] / dur).toFixed(1) + ' 下 · 比分 ' + wins[p] + ' : ' + wins[1 - p];
          if (w < 0) set(p, 'draw', '平局！', stat);
          else if (p === w) set(p, 'win', '你赢了！', stat);
          else set(p, 'lose', timeUp ? '时间到，差一点' : '被拉过去了', stat);
        });
        range.disabled = false;
        loadLabel();
        ctx.sfx('win');
        ctx.haptic([30, 60, 120]);
        if (w >= 0) ctx.confetti();
        ctx.done({ text: w < 0 ? '平局' : (w === 0 ? '下方' : '上方') + '获胜，比分 ' + wins[0] + ' : ' + wins[1] });
        // 两个人的手指这时候还在乱点：晚一点再把「再来一局」放出来，免得被误触
        kit.after(1100, function () { ui[0].again.hidden = false; ui[1].again.hidden = false; });
      }
      function rematch() {
        if (phase !== 'over') return;
        ui[0].again.hidden = true;
        ui[1].again.hidden = true;
        countdown();
      }

      ctx.onResize(layout);
      gate();
      layout();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      root.appendChild(el('div.w-tapwar-pv' + (ctx.reduced ? '.is-still' : ''), [
        el('div.w-tapwar-pvhalf', { attrs: { 'data-p': 1 } }),
        el('div.w-tapwar-pvhalf', { attrs: { 'data-p': 0 } }),
        el('div.w-tapwar-pvcord'),
        el('div.w-tapwar-pvknot')
      ]));
      return { destroy: function () {} };
    }
  });

  /* ================================================================== *
   * mathduel 心算对决
   * params: { kind: 'arith' | 'compare' | 'estimate', levels: { bottom: 'easy'|'mid'|'hard', top: … }, to: 7 }
   * ================================================================== */
  var LV_NAMES = { easy: '易', mid: '中', hard: '难' };
  var KIND_NAMES = { arith: '加减乘除', compare: '比大小', estimate: '估一估' };

  /* 把式子变成节点：分数 a/b 排成上下结构，其余照原样 */
  function mathNode(id, s) {
    var box = el('span.w-' + id + '-expr');
    String(s).split(/(\d+\/\d+)/).forEach(function (part) {
      var m = /^(\d+)\/(\d+)$/.exec(part);
      if (m) box.appendChild(el('span.w-' + id + '-frac', [el('span', { text: m[1] }), el('span', { text: m[2] })]));
      else if (part) box.appendChild(document.createTextNode(part));
    });
    return box;
  }
  function closest(e, sel, within) {
    var t = e.target && e.target.closest ? e.target.closest(sel) : null;
    return t && within.contains(t) ? t : null;
  }

  JN.registerWidget({
    id: 'mathduel',
    name: '心算对决',
    rules: '两边同时出题，谁先点对谁得一分；点错了要冻住 1.5 秒。先到 7 分的人赢。' +
      '开局前每个人给自己选难度（易 / 中 / 难）：难度不一样时两边的题也不一样，大人做难的才公平。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var kind = D.KINDS.indexOf(params.kind) >= 0 ? params.kind : 'arith';
      var goal = clampInt(params.to, 3, 12, 7);
      var lv = params.levels || {};
      var levels = [D.LEVELS.indexOf(lv.bottom) >= 0 ? lv.bottom : 'mid', D.LEVELS.indexOf(lv.top) >= 0 ? lv.top : 'mid'];
      var lay = seats('mathduel', 2);
      var score = [0, 0], ready = [false, false], locked = [false, false], lockTimer = [0, 0], qs = [null, null];
      var phase = 'gate';          // gate 选难度、点准备 → play 一题进行中 → pause 刚有人得分 → over
      var overAt = 0;

      var ui = lay.pads.map(function (pad, p) {
        var u = {
          pad: pad,
          score: el('span.w-mathduel-score.jn-num', { text: '0' }),
          track: el('div.w-mathduel-track', U.range(goal).map(function () { return el('i'); })),
          lv: el('span.w-mathduel-lv'),
          q: el('div.w-mathduel-q'),
          opts: el('div.w-mathduel-opts'),
          lock: el('div.w-mathduel-lock', [el('span', { text: '点错了，冻住 1.5 秒' }), el('i')]),
          cover: el('div.w-mathduel-cover')
        };
        U.append(pad, [el('div.w-mathduel-head', [u.score, u.track, u.lv]), u.q, u.lock, u.opts, u.cover]);
        onPress(kit, u.opts, function (e) {
          var b = closest(e, '.w-mathduel-opt', u.opts);
          if (b) answer(p, +b.getAttribute('data-i'), b);
        });
        onPress(kit, u.cover, function (e) {
          var b = closest(e, 'button', u.cover);
          if (!b || ready[p]) return;
          if (b.hasAttribute('data-lv')) {
            levels[p] = b.getAttribute('data-lv');
            Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle('is-on', x === b); });
            ctx.sfx('tap');
          } else if (!(phase === 'over' && now() - overAt < 600)) {
            ready[p] = true;
            b.textContent = '等对面……';
            b.disabled = true;
            ctx.sfx('tap');
            if (ready[0] && ready[1]) { phase = 'wait'; kit.after(450, start); }
          }
        });
        return u;
      });
      root.appendChild(lay.wrap);

      function head() {
        ui.forEach(function (u, p) {
          u.score.textContent = score[p];
          u.lv.textContent = '难度：' + LV_NAMES[levels[p]];
          for (var k = 0; k < goal; k++) u.track.children[k].classList.toggle('is-on', k < score[p]);
        });
      }
      function cover(p, title, sub, btn) {
        var u = ui[p];
        ready[p] = false;
        U.clear(u.cover);
        U.append(u.cover, [
          el('div.w-mathduel-cover-t', { text: title }),
          el('div.w-mathduel-cover-s', { text: sub }),
          el('div.w-mathduel-pick', [
            el('span', { text: '我的难度' }),
            el('div.jn-seg.w-mathduel-seg', D.LEVELS.map(function (L) {
              return el('button' + (levels[p] === L ? '.is-on' : ''), { text: LV_NAMES[L], attrs: { type: 'button', 'data-lv': L } });
            }))
          ]),
          el('button.jn-btn.jn-btn--lg.w-mathduel-go', { text: btn, attrs: { type: 'button' } })
        ]);
        u.cover.hidden = false;
      }

      function start() {
        score = [0, 0];
        ui.forEach(function (u) { u.cover.hidden = true; });
        head();
        nextQ();
      }
      function nextQ() {
        phase = 'play';
        var q0 = D.mathQ(kind, levels[0]);
        qs = [q0, levels[0] === levels[1] ? q0 : D.mathQ(kind, levels[1])];   // 难度一样就出同一道题
        ui.forEach(function (u, p) {
          var q = qs[p];
          kit.cancel(lockTimer[p]);
          locked[p] = false;
          u.pad.classList.remove('is-locked');
          u.pad.setAttribute('data-s', 'play');
          u.pad.setAttribute('data-kind', q.kind);
          U.clear(u.q);
          U.clear(u.opts);
          if (q.kind === 'compare') {
            U.append(u.q, [el('span.w-mathduel-ask', { text: '哪边大？' }), el('span.w-mathduel-tip', { text: '点大的那个，一样大点中间' })]);
          } else {
            U.append(u.q, [
              el('span.w-mathduel-ask' + (q.text.length > 9 ? '.is-long' : ''), [mathNode('mathduel', q.text), q.kind === 'estimate' ? ' ≈ ?' : ' = ?']),
              q.kind === 'estimate' ? el('span.w-mathduel-tip', { text: '不用算准，选最接近的' }) : null
            ]);
          }
          q.options.forEach(function (o, i) {
            u.opts.appendChild(el('button.w-mathduel-opt' + (q.kind === 'compare' && i === 1 ? '.w-mathduel-opt--eq' : '') + (o.length > 5 ? '.is-long' : ''),
              { attrs: { type: 'button', 'data-i': i } }, [mathNode('mathduel', o)]));
          });
        });
      }
      function answer(p, i, btn) {
        if (phase !== 'play' || locked[p] || btn.disabled) return;
        var o = 1 - p;
        if (i === qs[p].answer) {
          phase = 'pause';
          score[p]++;
          btn.classList.add('is-right');
          ui[p].pad.setAttribute('data-s', 'point');
          ui[o].pad.setAttribute('data-s', 'miss');
          ui[o].pad.classList.remove('is-locked');
          ui[o].opts.children[qs[o].answer].classList.add('is-right');     // 对面那题的答案也亮出来
          head();
          ctx.sfx('good');
          ctx.haptic(20);
          if (score[p] >= goal) kit.after(900, function () { finish(p); });
          else kit.after(950, nextQ);
        } else {
          btn.classList.add('is-wrong');
          btn.disabled = true;
          locked[p] = true;
          ui[p].pad.classList.remove('is-locked');
          void ui[p].pad.offsetWidth;                                       // 让冻结进度条的动画从头开始
          ui[p].pad.classList.add('is-locked');
          ctx.sfx('bad');
          ctx.haptic([30, 30, 30]);
          lockTimer[p] = kit.after(1500, function () { locked[p] = false; ui[p].pad.classList.remove('is-locked'); });
        }
      }
      function finish(w) {
        phase = 'over';
        overAt = now();
        ui.forEach(function (u, p) {
          cover(p, p === w ? '你赢了！' : '这局输了', '比分 ' + score[p] + ' : ' + score[1 - p], '再来一局');
          u.pad.setAttribute('data-s', p === w ? 'win' : 'lose');
        });
        ctx.sfx('win');
        ctx.haptic([30, 60, 120]);
        ctx.confetti();
        ctx.done({ text: (w === 0 ? '下方' : '上方') + '获胜，比分 ' + score[0] + ' : ' + score[1] });
      }

      head();
      ui.forEach(function (u, p) {
        u.pad.setAttribute('data-s', 'gate');
        cover(p, KIND_NAMES[kind] + ' · 抢 ' + goal + ' 分', '谁先点对谁得分，点错冻住 1.5 秒', '准备好了');
      });
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var kind = D.KINDS.indexOf(params.kind) >= 0 ? params.kind : 'arith';
      var q = el('div.w-mathduel-pvq'), opts = el('div.w-mathduel-pvopts');
      root.appendChild(el('div.w-mathduel-pv', { attrs: { 'data-kind': kind } }, [q, opts]));
      var rnd = ctx.rng('mathduel-preview');
      function show() {
        var item = D.mathQ(kind, 'mid', rnd);
        U.clear(q);
        U.clear(opts);
        if (item.kind === 'compare') q.textContent = '哪边大？';
        else U.append(q, [mathNode('mathduel', item.text), item.kind === 'estimate' ? ' ≈ ?' : ' = ?']);
        item.options.forEach(function (o) { opts.appendChild(el('span.w-mathduel-pvopt', [mathNode('mathduel', o)])); });
        if (ctx.reduced) { opts.children[item.answer].classList.add('is-right'); return; }
        kit.after(1500, function () { opts.children[item.answer].classList.add('is-right'); });
        kit.after(2600, show);
      }
      show();
      return { destroy: function () { kit.destroy(); } };
    }
  });

  /* ================================================================== *
   * gomoku 五子棋
   * params: { ai: false, level: 1 | 2 | 3（电脑强弱，默认 2）, size: 11 | 13（默认按屏幕宽度自动选） }
   * 防误触：点棋盘只是预选（显示虚影），再点同一格或者按「落子」才真的落下。
   * ================================================================== */
  var AI_NAMES = ['新手', '普通', '高手'];

  /* 把指针位置换算成 SVG viewBox 里的坐标（棋盘在容器里是等比缩放、居中的） */
  function svgPoint(svg, e) {
    var m = svg.getScreenCTM && svg.getScreenCTM();
    if (!m || !svg.createSVGPoint) return null;
    var pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(m.inverse());
  }

  JN.registerWidget({
    id: 'gomoku',
    name: '五子棋',
    rules: '轮流落子，先把五个（或更多）自己的棋子连成一条线的人赢，横、竖、斜都算。' +
      '点棋盘只是预选，再点一下同一格或者按「落子」才算下定；下错了可以悔棋。上一局输的人下一局先走。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var ai = !!params.ai;
      var level = clampInt(params.level, 1, 3, 2);
      var sz = ctx.size();
      var want = Number(params.size);
      var n = want === 11 || want === 13 ? want : (Math.min(sz.w - 16, sz.h - 150) >= 338 ? 13 : 11);   // 没指定就看屏幕：够宽用 13 路，否则 11 路
      var b = fill(n * n, 0), moves = [];
      var first = 1, turn = 1;           // 1 下方玩家，2 上方玩家（或电脑）
      var sel = -1, selAt = 0, over = false, winner = 0, wins = [0, 0], thinking = false, endAt = 0;

      // —— 棋盘 ——
      var grid = '', i;
      for (i = 0; i < n; i++) grid += 'M0.5 ' + (i + 0.5) + 'H' + (n - 0.5) + 'M' + (i + 0.5) + ' 0.5V' + (n - 0.5);
      var star = n >= 13 ? 3 : 2, mid = (n - 1) / 2;
      var gStones = U.svg('g');
      var ghost = U.svg('circle', { class: 'w-gomoku-ghost', r: 0.42, display: 'none' });
      var svg = U.svg('svg', { class: 'w-gomoku-board', viewBox: '0 0 ' + n + ' ' + n }, [
        U.svg('rect', { class: 'w-gomoku-bg', x: 0, y: 0, width: n, height: n, rx: 0.4 }),
        U.svg('path', { class: 'w-gomoku-grid', d: grid }),
        U.svg('g', { class: 'w-gomoku-stars' }, [[star, star], [star, n - 1 - star], [n - 1 - star, star], [n - 1 - star, n - 1 - star], [mid, mid]].map(function (s) {
          return U.svg('circle', { cx: s[0] + 0.5, cy: s[1] + 0.5, r: 0.1 });
        })),
        gStones, ghost
      ]);

      // —— 上下两条信息栏 ——
      function makeBar(p) {
        var isAi = ai && p === 2;
        var bar = {
          msg: el('b.w-gomoku-msg'),
          note: el('span.w-gomoku-note'),
          undo: el('button.jn-btn.jn-btn--ghost.w-gomoku-btn', { text: '悔棋', attrs: { type: 'button' } }),
          ok: el('button.jn-btn.w-gomoku-btn', { text: '落子', attrs: { type: 'button' } }),
          again: el('button.jn-btn.jn-btn--light.w-gomoku-btn', { text: '再来一局', attrs: { type: 'button' } }),
          seg: null
        };
        if (isAi) {
          bar.seg = el('div.jn-seg.w-gomoku-seg', AI_NAMES.map(function (name, k) {
            return el('button' + (k + 1 === level ? '.is-on' : ''), { text: name, attrs: { type: 'button', 'data-lv': k + 1 } });
          }));
          onPress(kit, bar.seg, function (e) {
            var t = closest(e, 'button', bar.seg);
            if (!t) return;
            level = +t.getAttribute('data-lv');
            Array.prototype.forEach.call(bar.seg.children, function (x) { x.classList.toggle('is-on', x === t); });
            ctx.sfx('tap');
          });
        } else {
          onPress(kit, bar.undo, undo);
          onPress(kit, bar.ok, function () { if (!over && turn === p && sel >= 0) place(sel); });
          onPress(kit, bar.again, rematch);
        }
        bar.node = el('div.w-gomoku-bar' + (p === 2 && !ai ? '.jn-flip' : ''), { attrs: { 'data-p': p - 1 } }, [
          el('div.w-gomoku-who', [el('i.w-gomoku-stone'), el('div.w-gomoku-txt', [bar.msg, bar.note])]),
          el('div.w-gomoku-acts', isAi ? [bar.seg] : [bar.undo, bar.ok, bar.again])
        ]);
        bar.node.style.setProperty('--pc', PCOLORS[p - 1]);
        return bar;
      }
      var bars = [null, makeBar(1), makeBar(2)];
      var wrap = el('div.w-gomoku-wrap', { attrs: { 'data-ai': ai ? 1 : 0 } }, [bars[2].node, el('div.w-gomoku-boardbox', [svg]), bars[1].node]);
      root.appendChild(wrap);

      function render(winCells) {
        U.clear(gStones);
        moves.forEach(function (m, k) {
          gStones.appendChild(U.svg('circle', {
            class: 'w-gomoku-st' + (k === moves.length - 1 ? ' is-last' : '') + (winCells && winCells.indexOf(m) >= 0 ? ' is-win' : ''),
            'data-p': b[m] - 1, cx: m % n + 0.5, cy: ((m / n) | 0) + 0.5, r: 0.43
          }));
        });
        if (winCells) {
          var a = winCells[0], z = winCells[winCells.length - 1];
          gStones.appendChild(U.svg('line', { class: 'w-gomoku-winline', x1: a % n + 0.5, y1: ((a / n) | 0) + 0.5, x2: z % n + 0.5, y2: ((z / n) | 0) + 0.5 }));
        } else if (moves.length) {
          var l = moves[moves.length - 1];
          gStones.appendChild(U.svg('circle', { class: 'w-gomoku-lastdot', cx: l % n + 0.5, cy: ((l / n) | 0) + 0.5, r: 0.11 }));
        }
        if (sel >= 0) {
          ghost.setAttribute('cx', sel % n + 0.5);
          ghost.setAttribute('cy', ((sel / n) | 0) + 0.5);
          ghost.setAttribute('data-p', turn - 1);
          ghost.removeAttribute('display');
        } else ghost.setAttribute('display', 'none');
      }
      function canUndo() {
        if (over || thinking || !moves.length) return false;
        return !ai || (turn === 1 && moves.length >= 2);
      }
      function status() {
        wrap.setAttribute('data-turn', over ? -1 : turn - 1);
        [1, 2].forEach(function (p) {
          var bar = bars[p], mine = turn === p, score = '比分 ' + wins[p - 1] + ' : ' + wins[2 - p];
          bar.node.classList.toggle('is-turn', !over && mine);
          bar.node.classList.toggle('is-won', over && winner === p);
          if (ai && p === 2) {
            bar.msg.textContent = over ? (winner === 2 ? '电脑赢了' : winner === 1 ? '电脑认输' : '平局') : thinking ? '电脑在想……' : '电脑';
            bar.note.textContent = score;
            return;
          }
          if (over) {
            bar.msg.textContent = winner === p ? '你赢了！' : winner ? '这局输了' : '平局';
            bar.note.textContent = score + (winner && winner !== p ? ' · 下局你先走' : '');
          } else if (mine) {
            bar.msg.textContent = '轮到你';
            bar.note.textContent = sel >= 0 ? '再点一下同一格，或按「落子」' : moves.length ? '点棋盘选位置' : '你先走，点棋盘选位置';
          } else {
            bar.msg.textContent = ai ? '等电脑' : '等对面';
            bar.note.textContent = score;
          }
          bar.undo.hidden = over;
          bar.ok.hidden = over;
          bar.again.hidden = !over;
          bar.undo.disabled = !canUndo();
          bar.ok.disabled = !(mine && sel >= 0);
        });
      }

      function place(m) {
        if (over || b[m]) return;
        b[m] = turn;
        moves.push(m);
        sel = -1;
        ctx.sfx('tap');
        ctx.haptic(10);
        var line = gmkLine(b, n, (m / n) | 0, m % n);
        if (line) return end(turn, line);
        if (moves.length === n * n) return end(0, null);
        turn = 3 - turn;
        render(null);
        status();
        if (ai && turn === 2) aiMove();
      }
      function aiMove() {
        thinking = true;
        status();
        kit.after(450 + Math.random() * 350, function () {
          thinking = false;
          var m = gmkAI(b, n, 2, level);
          if (m >= 0) place(m);
        });
      }
      function end(w, line) {
        over = true;
        winner = w;
        endAt = now();
        if (w) wins[w - 1]++;
        render(line);
        status();
        ctx.sfx(ai && w === 2 ? 'bad' : 'win');
        ctx.haptic([30, 60, 120]);
        if (w && !(ai && w === 2)) ctx.confetti();
        ctx.done({ win: ai ? w === 1 : undefined, text: w ? (w === 1 ? '下方' : ai ? '电脑' : '上方') + '获胜，共 ' + moves.length + ' 手' : '平局' });
      }
      function undo() {
        if (!canUndo()) return;
        var k = ai ? 2 : 1;                  // 和电脑下：连电脑刚走的那一手一起退回来
        while (k-- > 0 && moves.length) b[moves.pop()] = 0;
        if (!ai) turn = 3 - turn;
        sel = -1;
        ctx.sfx('whoosh');
        render(null);
        status();
      }
      function rematch() {
        if (!over || now() - endAt < 500) return;
        first = winner ? 3 - winner : 3 - first;   // 输的人先走；平局就换一下
        for (var k = 0; k < b.length; k++) b[k] = 0;
        moves = [];
        over = false; winner = 0; sel = -1;
        turn = first;
        render(null);
        status();
        if (ai && turn === 2) aiMove();
      }

      onPress(kit, svg, function (e) {
        if (over || thinking || (ai && turn === 2) || e.clientX == null) return;
        var pt = svgPoint(svg, e);
        if (!pt) return;
        var c = Math.floor(pt.x), r = Math.floor(pt.y);
        if (r < 0 || r >= n || c < 0 || c >= n) return;
        var m = r * n + c;
        if (b[m]) return;
        if (m === sel) { if (now() - selAt > 140) place(m); return; }   // 太快的连击当作手抖，不算确认
        sel = m;
        selAt = now();
        ctx.sfx('tick');
        render(null);
        status();
      });

      render(null);
      status();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var n = 7;
      // 一小段固定的棋谱 [行, 列, 谁]：0 号走出斜着的活三，1 号没理会，于是活四、成五
      var script = [[3, 3, 0], [2, 3, 1], [4, 4, 0], [2, 4, 1], [2, 2, 0], [2, 5, 1], [5, 5, 0], [1, 1, 1], [6, 6, 0]];
      var grid = '', i;
      for (i = 0; i < n; i++) grid += 'M0.5 ' + (i + 0.5) + 'H' + (n - 0.5) + 'M' + (i + 0.5) + ' 0.5V' + (n - 0.5);
      var g = U.svg('g');
      root.appendChild(el('div.w-gomoku-pv', [U.svg('svg', { class: 'w-gomoku-board', viewBox: '0 0 ' + n + ' ' + n }, [
        U.svg('rect', { class: 'w-gomoku-bg', x: 0, y: 0, width: n, height: n, rx: 0.4 }),
        U.svg('path', { class: 'w-gomoku-grid', d: grid }), g
      ])]));
      var winSet = [[2, 2], [3, 3], [4, 4], [5, 5], [6, 6]];
      function draw(k, done) {
        U.clear(g);
        script.slice(0, k).forEach(function (s, j) {
          var win = done && s[2] === 0 && winSet.some(function (w) { return w[0] === s[0] && w[1] === s[1]; });
          g.appendChild(U.svg('circle', { class: 'w-gomoku-st' + (j === k - 1 && !done ? ' is-last' : '') + (win ? ' is-win' : ''), 'data-p': s[2], cx: s[1] + 0.5, cy: s[0] + 0.5, r: 0.43 }));
        });
        if (done) g.appendChild(U.svg('line', { class: 'w-gomoku-winline', x1: 2.5, y1: 2.5, x2: 6.5, y2: 6.5 }));
      }
      if (ctx.reduced) draw(script.length, true);
      else {
        var k = 0;
        (function step() {
          k++;
          if (k > script.length + 3) k = 1;
          draw(Math.min(k, script.length), k > script.length);
          kit.after(k >= script.length ? 700 : 420, step);
        })();
      }
      return { destroy: function () { kit.destroy(); } };
    }
  });

  /* ================================================================== *
   * dots 点格棋
   * params: { players: 2 | 3 }
   * 5×5 个点、4×4 个格子。按住棋盘时离手指最近的那条空边会亮起来，抬手才画下去；
   * 手指正好落在两条边中间（分不清想点哪条）时不画，免得画错。
   * ================================================================== */
  function dotsBoard(N) {
    var M = 9, S = (100 - 2 * M) / N, r, c;
    var edges = [], boxes = [], gBox = U.svg('g'), gEdge = U.svg('g'), gDot = U.svg('g');
    for (r = 0; r < N; r++) {
      for (c = 0; c < N; c++) {
        var box = U.svg('rect', { class: 'w-dots-box', x: M + c * S + 1.2, y: M + r * S + 1.2, width: S - 2.4, height: S - 2.4, rx: 1.6 });
        boxes.push(box);
        gBox.appendChild(box);
      }
    }
    function edge(type, er, ec, x1, y1, x2, y2) {
      var node = U.svg('line', { class: 'w-dots-edge', x1: x1, y1: y1, x2: x2, y2: y2 });
      edges.push({ type: type, r: er, c: ec, x1: x1, y1: y1, x2: x2, y2: y2, node: node });
      gEdge.appendChild(node);
    }
    for (r = 0; r <= N; r++) for (c = 0; c < N; c++) edge('h', r, c, M + c * S, M + r * S, M + (c + 1) * S, M + r * S);
    for (r = 0; r < N; r++) for (c = 0; c <= N; c++) edge('v', r, c, M + c * S, M + r * S, M + c * S, M + (r + 1) * S);
    for (r = 0; r <= N; r++) for (c = 0; c <= N; c++) gDot.appendChild(U.svg('circle', { class: 'w-dots-dot', cx: M + c * S, cy: M + r * S, r: 2.3 }));
    var svg = U.svg('svg', { class: 'w-dots-board', viewBox: '0 0 100 100' }, [gBox, gEdge, gDot]);
    return {
      svg: svg, edges: edges, boxes: boxes, S: S,
      find: function (type, er, ec) {
        for (var i = 0; i < edges.length; i++) if (edges[i].type === type && edges[i].r === er && edges[i].c === ec) return edges[i];
        return null;
      },
      /* 把一步棋的结果画上去 */
      paint: function (e, res) {
        edges.forEach(function (x) { x.node.classList.remove('is-new'); });
        e.node.classList.add('is-on');
        e.node.classList.add('is-new');
        e.node.setAttribute('data-p', res.who);
        res.made.forEach(function (bi) { boxes[bi].setAttribute('data-p', res.who); boxes[bi].classList.add('is-on'); });
      },
      reset: function () {
        edges.forEach(function (x) { x.node.setAttribute('class', 'w-dots-edge'); x.node.removeAttribute('data-p'); });
        boxes.forEach(function (x) { x.setAttribute('class', 'w-dots-box'); x.removeAttribute('data-p'); });
      }
    };
  }

  JN.registerWidget({
    id: 'dots',
    name: '点格棋',
    rules: '轮流在相邻的两个点之间画一条边。谁画下第四条边、围成一个小格子，这个格子就归谁，并且要接着再画一条。' +
      '16 个格子全部围完，格子多的人赢。按住棋盘能看到会画哪条边，抬手才算数。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var np = Number(params.players) === 3 ? 3 : 2;
      var N = 4;
      var board = dotsBoard(N);
      var svg = board.svg;
      var st = dotsNew(N, np, 0), gameNo = 0, over = false, endAt = 0, bonus = false, hot = null, activeId = null;

      var seatUi = U.range(np).map(function (p) {
        var s = { score: el('b.w-dots-score.jn-num', { text: '0' }), msg: el('span.w-dots-msg') };
        s.node = el('div.w-dots-seat', { attrs: { 'data-p': p } }, [el('i.w-dots-chip'), s.score, s.msg]);
        s.node.style.setProperty('--pc', PCOLORS[p]);
        return s;
      });
      function makeBar(top) {
        var again = el('button.jn-btn.jn-btn--light.w-dots-again', { text: '再来一局', attrs: { type: 'button' } });
        again.hidden = true;
        onPress(kit, again, rematch);
        // 三个人时下方两位各占一头（0 号在左、2 号在右），「再来一局」夹在中间
        var kids = top ? [seatUi[1].node, again] : np === 3 ? [seatUi[0].node, again, seatUi[2].node] : [seatUi[0].node, again];
        return { again: again, node: el('div.w-dots-bar' + (top ? '.jn-flip' : ''), kids) };
      }
      var bars = [makeBar(true), makeBar(false)];
      var wrap = el('div.w-dots-wrap', { attrs: { 'data-n': np } }, [bars[0].node, el('div.w-dots-boardbox', [svg]), bars[1].node]);
      root.appendChild(wrap);

      function status() {
        wrap.style.setProperty('--tc', over ? 'transparent' : PCOLORS[st.turn]);
        var best = Math.max.apply(null, st.score);
        var champs = st.score.filter(function (x) { return x === best; }).length;
        seatUi.forEach(function (s, p) {
          var mine = !over && st.turn === p;
          s.score.textContent = st.score[p];
          s.node.classList.toggle('is-turn', mine);
          s.node.classList.toggle('is-won', over && st.score[p] === best);
          s.msg.textContent = over ? (st.score[p] === best ? (champs > 1 ? '并列第一' : '赢了！') : '') : mine ? (bonus ? '再走一步' : '轮到你') : '';
        });
        bars.forEach(function (bar) { bar.again.hidden = !over; });
      }
      function setHot(e) {
        if (hot === e) return;
        if (hot) hot.node.classList.remove('is-hot');
        hot = e;
        if (hot) hot.node.classList.add('is-hot');
      }
      /* 离手指最近的空边；太远，或者和第二近的差不多远（分不清），就不选 */
      function pick(ev) {
        var pt = ev.clientX == null ? null : svgPoint(svg, ev);
        if (!pt) return null;
        var best = null, d1 = 1e9, d2 = 1e9;
        board.edges.forEach(function (e) {
          if (!dotsFree(st, e.type, e.r, e.c)) return;
          var dx = e.x2 - e.x1, dy = e.y2 - e.y1;
          var t = U.clamp(((pt.x - e.x1) * dx + (pt.y - e.y1) * dy) / (dx * dx + dy * dy), 0, 1);
          var qx = e.x1 + t * dx - pt.x, qy = e.y1 + t * dy - pt.y;
          var d = Math.sqrt(qx * qx + qy * qy);
          if (d < d1) { d2 = d1; d1 = d; best = e; } else if (d < d2) d2 = d;
        });
        return best && d1 <= board.S * 0.5 && d2 - d1 >= board.S * 0.1 ? best : null;
      }
      function claim(e) {
        var res = dotsPlay(st, e.type, e.r, e.c);
        if (!res) return;
        board.paint(e, res);
        bonus = res.again;
        if (res.made.length) { ctx.sfx('good'); ctx.haptic(30); } else ctx.sfx('tap');
        if (res.over) {
          over = true;
          endAt = now();
          status();
          ctx.sfx('win');
          ctx.haptic([30, 60, 120]);
          ctx.confetti();
          ctx.done({ text: '比分 ' + st.score.join(' : ') });
        } else status();
      }
      function rematch() {
        if (!over || now() - endAt < 500) return;
        gameNo++;
        st = dotsNew(N, np, gameNo % np);            // 轮流先手
        over = false; bonus = false;
        board.reset();
        status();
      }

      kit.on(svg, 'pointerdown', function (e) {
        if (over || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        activeId = e.pointerId;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真指针，忽略 */ }
        setHot(pick(e));
      });
      kit.on(svg, 'pointermove', function (e) { if (e.pointerId === activeId) setHot(pick(e)); });
      function release(e, commit) {
        if (e.pointerId !== activeId) return;
        activeId = null;
        var edge = commit && !over ? pick(e) : null;
        setHot(null);
        if (edge) claim(edge);
      }
      kit.on(svg, 'pointerup', function (e) { release(e, true); });
      kit.on(svg, 'pointercancel', function (e) { release(e, false); });

      status();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var N = 3, board = dotsBoard(N), st, rnd = ctx.rng('dots-preview');
      root.appendChild(el('div.w-dots-pv', [board.svg]));
      /* 自动下：能围成格子就围；否则尽量不给对方送“三条边”的格子；再否则随便走 */
      function choose() {
        var free = board.edges.filter(function (e) { return dotsFree(st, e.type, e.r, e.c); });
        function sidesAfter(e) {
          var worst = 0, win = false;
          (e.type === 'h' ? [[e.r - 1, e.c], [e.r, e.c]] : [[e.r, e.c - 1], [e.r, e.c]]).forEach(function (bx) {
            if (bx[0] < 0 || bx[0] >= N || bx[1] < 0 || bx[1] >= N) return;
            var k = dotsSides(st, bx[0], bx[1]) + 1;
            if (k === 4) win = true; else if (k > worst) worst = k;
          });
          return win ? -1 : worst;
        }
        var scored = U.shuffle(free, rnd).map(function (e) { return { e: e, k: sidesAfter(e) }; });
        scored.sort(function (x, y) { return (x.k === 3 ? 9 : x.k) - (y.k === 3 ? 9 : y.k); });
        return scored.length ? scored[0].e : null;
      }
      function step() {
        var e = choose();
        if (!e) { st = dotsNew(N, 2, 0); board.reset(); return kit.after(500, step); }
        var res = dotsPlay(st, e.type, e.r, e.c);
        board.paint(e, res);
        kit.after(res.over ? 1600 : 380, step);
      }
      st = dotsNew(N, 2, 0);
      if (ctx.reduced) { for (var k = 0; k < 40; k++) { var e = choose(); if (!e) break; board.paint(e, dotsPlay(st, e.type, e.r, e.c)); } }
      else step();
      return { destroy: function () { kit.destroy(); } };
    }
  });

  /* ================================================================== *
   * tensec 估 10 秒
   * params: { target: 10 | 7 | 15 | 'random'（每局随机 5–15 秒）, players: 2 | 3, distract: false }
   * ================================================================== */
  JN.registerWidget({
    id: 'tensec',
    name: '估 10 秒',
    rules: '轮流来：按「开始」，表走两秒就藏起来；心里默数，觉得到了目标时间就按「停」。谁离目标最近谁赢，差距精确到 0.01 秒。' +
      '干扰模式下，表藏起来以后屏幕上会乱跳一堆假数字。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var np = Number(params.players) === 3 ? 3 : 2;
      var randomTarget = params.target === 'random';
      var fixed = randomTarget ? 10 : clampInt(params.target, 3, 30, 10);
      var distract = !!params.distract;
      var lay = seats('tensec', np);
      var target = fixed, gameNo = 0, order = [], cur = 0, times = [], wins = fill(np, 0);
      var phase = 'idle';          // idle 等当前玩家按开始 → run 计时中 → gap 刚按停，给大家看一眼 → over
      var t0 = 0, masked = false, noiseId = 0, overAt = 0, maskTimer = 0, autoTimer = 0;

      var ui = lay.pads.map(function (pad, p) {
        var u = {
          pad: pad,
          goal: el('div.w-tensec-goal'),
          time: el('div.w-tensec-time.jn-big', { text: '0.00' }),
          diff: el('div.w-tensec-diff'),
          btn: el('button.w-tensec-btn', { text: '开始', attrs: { type: 'button' } }),
          again: el('button.jn-btn.jn-btn--light.w-tensec-again', { text: '再来一局', attrs: { type: 'button' } }),
          noise: el('div.w-tensec-noise', U.range(distract ? 6 : 0).map(function () { return el('span.jn-num'); }))
        };
        u.again.hidden = true;
        onPress(kit, u.btn, function () { press(p); });
        onPress(kit, u.again, rematch);
        U.append(pad, [u.noise, u.goal, u.time, u.diff, u.btn, u.again]);
        return u;
      });
      root.appendChild(lay.wrap);

      function set(p, state, diff) {
        ui[p].pad.setAttribute('data-s', state);
        if (diff != null) ui[p].diff.textContent = diff;
      }
      function newGame() {
        target = randomTarget ? ri(Math.random, 5, 15) : fixed;
        order = U.range(np).map(function (k) { return (k + gameNo) % np; });     // 每局换一个人先来
        cur = 0;
        times = fill(np, null);
        phase = 'idle';
        ui.forEach(function (u, p) {
          goalLine(p, '');
          u.time.textContent = '0.00';
          u.btn.textContent = '开始';
          u.btn.hidden = false;
          u.again.hidden = true;
        });
        turn();
      }
      function goalLine(p, tail) {
        U.clear(ui[p].goal);
        U.append(ui[p].goal, [randomTarget ? '这局目标 ' : '目标 ', el('b.jn-num', { text: String(target) }), ' 秒', tail ? el('span.w-tensec-tally', { text: tail }) : null]);
      }
      function turn() {
        phase = 'idle';
        var who = order[cur];
        ui.forEach(function (u, p) {
          if (times[p] != null) return;                     // 已经测完的人保留自己的成绩
          u.btn.disabled = p !== who;
          set(p, p === who ? 'turn' : 'wait', p === who ? '轮到你：按开始，心里数' : (np === 2 ? '等对面先来' : '等一下'));
        });
      }
      function stopNoise() {
        if (noiseId) kit.stopEvery(noiseId);
        noiseId = 0;
      }
      function fake() { return (Math.random() * (target + 6)).toFixed(2); }
      function frame() {                                      // 前两秒：表看得见
        var ms = now() - t0;
        if (!masked && ms < 2000) ui[order[cur]].time.textContent = (Math.floor(ms / 10) / 100).toFixed(2);
      }
      function mask() {                                       // 两秒到：把表藏起来
        var u = ui[order[cur]];
        masked = true;
        kit.stopLoop();
        u.pad.setAttribute('data-s', 'blind');
        u.time.textContent = '?.??';
        u.diff.textContent = '表藏起来了，接着数……';
        if (!distract) return;
        // 干扰：大字和背景里的小数字一起乱跳（减少动效时跳得慢一些）
        noiseId = kit.every(ctx.reduced ? 700 : 130, function () {
          u.time.textContent = fake();
          Array.prototype.forEach.call(u.noise.children, function (s) {
            if (Math.random() < 0.5) return;
            s.textContent = fake();
            s.style.left = (5 + Math.random() * 70) + '%';
            s.style.top = (5 + Math.random() * 80) + '%';
          });
        });
      }
      function press(p) {
        if (p !== order[cur]) return;
        if (phase === 'idle') {
          phase = 'run';
          masked = false;
          t0 = now();
          ui[p].btn.textContent = '停！';
          set(p, 'run', '看两眼，记住这个节奏');
          ui.forEach(function (u, q) { if (q !== p && times[q] == null) u.diff.textContent = '嘘，对手在数……'; });
          ctx.sfx('pop');
          ctx.haptic(15);
          kit.loop(frame);
          maskTimer = kit.after(2000, mask);
          autoTimer = kit.after(Math.max(25000, target * 3000), function () { stop(now() - t0); });   // 忘了按：自动停，免得卡住
        } else if (phase === 'run') {
          var ms = now() - t0;
          if (ms >= 1000) stop(ms);                          // 一秒以内的第二下当作手抖
        }
      }
      function diffText(d) {
        return d === 0 ? '分毫不差！' : (d > 0 ? '慢了 ' : '快了 ') + D.fmtCs(Math.abs(d)) + ' 秒';
      }
      function stop(ms) {
        var p = order[cur], u = ui[p];
        phase = 'gap';
        kit.stopLoop();
        kit.cancel(maskTimer);
        kit.cancel(autoTimer);
        stopNoise();
        times[p] = ms;
        var cs = Math.round(ms / 10);
        u.time.textContent = D.fmtCs(cs);
        u.btn.disabled = true;
        u.btn.hidden = true;
        Array.prototype.forEach.call(u.noise.children, function (s) { s.textContent = ''; });
        set(p, 'done', diffText(cs - Math.round(target * 100)));
        ctx.sfx('good');
        ctx.haptic(30);
        cur++;
        kit.after(cur < np ? 900 : 1200, cur < np ? turn : finish);
      }
      function finish() {
        phase = 'over';
        overAt = now();
        var rank = D.tensecRank(target, times);
        var best = Math.abs(rank[0].diff);
        var champs = rank.filter(function (x) { return Math.abs(x.diff) === best; }).length;
        rank.forEach(function (x) {
          var won = Math.abs(x.diff) === best;
          if (won) wins[x.p]++;
          set(x.p, won ? 'win' : 'lose', (won ? (champs > 1 ? '并列最接近！\n' : '最接近！\n') : '') + diffText(x.diff));
          ui[x.p].again.hidden = false;
        });
        ui.forEach(function (u, p) {                        // 累计比分：自己的写在最前面
          var others = U.range(np).filter(function (q) { return q !== p; }).map(function (q) { return wins[q]; });
          goalLine(p, '比分 ' + wins[p] + ' : ' + others.join(' : '));
        });
        ctx.sfx('win');
        ctx.haptic([30, 60, 120]);
        ctx.confetti();
        ctx.done({ text: '目标 ' + target + ' 秒，最接近的只差 ' + D.fmtCs(best) + ' 秒' });
      }
      function rematch() {
        if (phase !== 'over' || now() - overAt < 500) return;
        gameNo++;
        newGame();
      }

      newGame();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var time = el('div.w-tensec-pvtime.jn-big', { text: '0.00' });
      var sub = el('div.w-tensec-pvsub', { text: '目标 10 秒' });
      var box = el('div.w-tensec-pv', [time, sub]);
      root.appendChild(box);
      if (ctx.reduced) { time.textContent = '10.08'; sub.textContent = '只差 0.08 秒'; return { destroy: function () {} }; }
      var t0 = now(), state = '';
      // 把 10 秒压成 4 秒左右演一遍：走表 → 藏起来 → 揭晓
      kit.every(60, function () {
        var t = (now() - t0) % 6200, s = t < 1300 ? 'run' : t < 4000 ? 'blind' : 'show';
        if (s === 'run') time.textContent = (t / 650).toFixed(2);
        if (s === state) return;
        state = s;
        box.setAttribute('data-s', s);
        if (s === 'run') sub.textContent = '目标 10 秒';
        if (s === 'blind') { time.textContent = '?.??'; sub.textContent = '表藏起来了，接着数……'; }
        if (s === 'show') { time.textContent = '10.08'; sub.textContent = '只差 0.08 秒'; }
      });
      return { destroy: function () { kit.destroy(); } };
    }
  });

  /* ================================================================== *
   * stroop 颜色与字打架（斯特鲁普效应）
   * params: { players: 1 | 2（两人轮流测，最后对比）, count: 20 }
   * 说明：干扰代价 = 不一致题的平均反应时间 − 一致题的平均反应时间（只算答对的题）。
   * 原理（J. R. Stroop, 1935；MacLeod, 1991 综述）：读字是高度自动化的过程，字义会自动冒出来，
   * 和“说出墨水颜色”这个需要注意力的任务冲突，大脑要先抑制字义，所以不一致的题更慢。
   * ================================================================== */
  var S_WHY = '为什么会慢？认字太熟练，成了自动反应：眼睛一扫，字的意思就先蹦出来，和“看颜色”抢跑。大脑得先把它按住，这一按就多花了这点时间。';
  var S_WHY_SHORT = '认字太熟，字义会自动蹦出来抢跑，大脑得先按住它。';

  JN.registerWidget({
    id: 'stroop',
    name: '颜色与字打架',
    rules: '屏幕上会出现“红、蓝、绿、黄”这几个字，但字的颜色不一定和字的意思一样。别读字，点字的颜色，越快越好。' +
      '一轮 20 题，最后算出“字的意思”把你拖慢了多少毫秒。两个人就轮流测，再比一比。',
    mount: function (root, params, ctx) {
      var kit = Kit();
      var np = Number(params.players) === 2 ? 2 : 1;
      var total = clampInt(params.count, 8, 40, 20);
      total -= total % 2;
      var lay = seats('stroop', np);
      var aid = !!ctx.store.get('aid', false);       // 色觉辅助：在字下面加一个代表字色的形状
      var stats = [null, null], gameNo = 0, turnNo = 0, overAt = 0;
      var run = null;                                // 正在进行的那一轮测试

      var ui = lay.pads.map(function (pad, p) {
        var u = {
          pad: pad,
          prog: el('span.w-stroop-prog'),
          bar: el('i'),
          word: el('span.w-stroop-word'),
          hint: el('i.w-stroop-mark.w-stroop-cue'),
          keys: el('div.w-stroop-keys', S_KEYS.map(function (k, i) {
            return el('button.w-stroop-key', { attrs: { type: 'button', 'data-k': k, 'data-i': i } }, [el('i.w-stroop-mark', { attrs: { 'data-k': k } }), el('span', { text: S_WORDS[i] })]);
          })),
          cover: el('div.w-stroop-cover')
        };
        u.stim = el('div.w-stroop-stim', [u.word, u.hint]);
        U.append(pad, [el('div.w-stroop-head', [u.prog, el('div.w-stroop-bar', [u.bar])]), u.stim, u.keys, u.cover]);
        onPress(kit, u.keys, function (e) {
          var b = closest(e, '.w-stroop-key', u.keys);
          if (b && run && run.p === p) run.key(+b.getAttribute('data-i'));
        });
        onPress(kit, u.cover, function (e) {
          var b = closest(e, 'button', u.cover);
          if (!b) return;
          if (b.classList.contains('w-stroop-aid')) {
            aid = !aid;
            ctx.store.set('aid', aid);
            ui.forEach(function (x) {
              var a = x.cover.querySelector('.w-stroop-aid');
              if (a) { a.textContent = aidText(); a.classList.toggle('is-on', aid); }
            });
            ctx.sfx('tap');
          } else if (b.classList.contains('w-stroop-go')) {
            if (stats[0] && (np === 1 || stats[1])) { if (now() - overAt < 500) return; gameNo++; stats = [null, null]; turnNo = 0; if (np === 1) begin(0); else gates(); }
            else begin(p);
          }
        });
        return u;
      });
      root.appendChild(lay.wrap);

      function aidText() { return '形状提示：' + (aid ? '开' : '关'); }
      function cover(p, state, nodes) {
        var u = ui[p];
        u.pad.setAttribute('data-s', state);
        U.clear(u.cover);
        U.append(u.cover, nodes);
        u.cover.hidden = false;
      }
      function goBtn(text, small) { return el('button.jn-btn.w-stroop-go' + (small ? '' : '.jn-btn--lg'), { text: text, attrs: { type: 'button' } }); }
      function whoseTurn() { return np === 1 ? 0 : (gameNo + turnNo) % 2; }
      /* 开场（以及两个人之间换手）时每个人看到什么 */
      function gates() {
        var who = whoseTurn();
        ui.forEach(function (u, p) {
          if (stats[p]) return cover(p, 'wait', summary(p).concat([el('div.w-stroop-note', { text: '等对面测完再比' })]));
          if (p !== who) return cover(p, 'wait', [el('div.w-stroop-title', { text: '对面先测' }), el('div.w-stroop-note', { text: '等他测完就轮到你。可以盯着他看，给点压力。' })]);
          var demo = el('span.w-stroop-word.w-stroop-word--demo', { text: S_WORDS[0], attrs: { 'data-ink': 'blue' } });
          cover(p, 'gate', [
            el('div.w-stroop-title', { text: '别读字，点字的颜色' }),
            el('div.w-stroop-demo', [demo, el('span', { text: '→ 这个要点「蓝」' })]),
            goBtn(np === 2 && stats[1 - p] ? '轮到我了' : '开始'),
            el('button.jn-chip.w-stroop-aid' + (aid ? '.is-on' : ''), { text: aidText(), attrs: { type: 'button' } })
          ]);
        });
      }
      function fmtCost(s) { return s.cost == null ? '算不出来' : (s.cost > 0 ? '+' : s.cost < 0 ? '−' : '') + Math.abs(s.cost) + ' 毫秒'; }
      function summary(p) {
        var s = stats[p];
        return [
          el('div.w-stroop-title', { text: '干扰代价 ' + fmtCost(s) }),
          el('div.w-stroop-note', { text: '一致 ' + (s.same == null ? '—' : s.same) + ' 毫秒 · 不一致 ' + (s.diff == null ? '—' : s.diff) + ' 毫秒' + (s.wrong ? ' · 错 ' + s.wrong + ' 题' : '') })
        ];
      }
      function bars(s) {
        var max = Math.max(s.same || 0, s.diff || 0, 1);
        function row(label, v, cls) {
          return el('div.w-stroop-row', [
            el('span.w-stroop-row-l', { text: label }),
            el('div.w-stroop-row-b', [el('i.' + cls, { style: { width: Math.round((v || 0) / max * 100) + '%' } })]),
            el('span.w-stroop-row-v.jn-num', { text: v == null ? '—' : v + ' 毫秒' })
          ]);
        }
        return el('div.w-stroop-rows', [row('字和颜色一致', s.same, 'w-stroop-fill--same'), row('字和颜色打架', s.diff, 'w-stroop-fill--diff')]);
      }

      function begin(p) {
        if (run || p !== whoseTurn() || stats[p]) return;
        var u = ui[p];
        var trials = stroopTrials(Math.random, total), k = -1, recs = [], t0 = 0, open = false, tmo = 0;
        u.cover.hidden = true;
        u.pad.setAttribute('data-s', 'test');
        ui.forEach(function (x, q) {
          if (q !== p && !stats[q]) cover(q, 'wait', [el('div.w-stroop-title', { text: '对面正在测' }), el('div.w-stroop-note', { text: '等他测完就轮到你。' })]);
        });
        function next() {
          k++;
          u.bar.style.width = Math.round(k / trials.length * 100) + '%';
          if (k >= trials.length) return finishRun();
          u.prog.textContent = '第 ' + (k + 1) + ' / ' + trials.length + ' 题';
          u.word.textContent = '+';
          u.word.removeAttribute('data-ink');
          u.hint.removeAttribute('data-k');
          u.stim.setAttribute('data-s', 'fix');
          kit.after(k === 0 ? 900 : 350 + Math.random() * 250, function () {
            var tr = trials[k];
            u.word.textContent = S_WORDS[tr.word];
            u.word.setAttribute('data-ink', S_KEYS[tr.ink]);
            if (aid) u.hint.setAttribute('data-k', S_KEYS[tr.ink]);
            u.stim.setAttribute('data-s', 'show');
            t0 = now();
            open = true;
            tmo = kit.after(4000, function () { if (open) record(false, 4000, '太慢了'); });
          });
        }
        function record(ok, rt, why) {
          open = false;
          kit.cancel(tmo);
          recs.push({ same: trials[k].same, ok: ok, rt: Math.round(rt) });
          if (ok) { ctx.sfx('tick'); return next(); }
          u.word.textContent = why;
          u.word.removeAttribute('data-ink');
          u.hint.removeAttribute('data-k');
          u.stim.setAttribute('data-s', 'miss');
          ctx.sfx('bad');
          ctx.haptic([30, 30, 30]);
          kit.after(500, next);
        }
        function finishRun() {
          run = null;
          stats[p] = stroopStats(recs);
          turnNo++;
          ctx.sfx('good');
          if (np === 2 && !stats[1 - p]) return gates();
          results();
        }
        run = { p: p, key: function (i) { if (open) record(i === trials[k].ink, now() - t0, '点错了'); } };
        next();
      }

      function results() {
        overAt = now();
        if (np === 1) {
          var s = stats[0];
          cover(0, 'result', [
            el('div.w-stroop-kicker', { text: '字的意思把你拖慢了' }),
            el('div.w-stroop-cost.jn-big', { text: fmtCost(s) }),
            bars(s),
            el('div.w-stroop-note', { text: (s.wrong ? '答错 ' + s.wrong + ' 题（不计入平均）。' : '') + '每次会有几十毫秒的出入，多测几次更准。' }),
            el('div.w-stroop-why', { text: s.cost != null && s.cost <= 0 ? '这一轮你没被字带跑，少见。多半是运气，再测一次看看。平时大多数人不一致的题会慢一截：认字太熟练，字的意思会自动蹦出来，和“看颜色”抢跑。' : S_WHY }),
            goBtn('再测一次')
          ]);
          ctx.sfx('win');
          ctx.done({ text: '干扰代价 ' + fmtCost(s) });
          return;
        }
        // 两个人：干扰代价小的人更“不容易被字带跑”；算不出来的（某一类题全错）排在后面
        var a = stats[0].cost, b = stats[1].cost;
        var w = a == null && b == null ? -1 : a == null ? 1 : b == null ? 0 : a < b ? 0 : b < a ? 1 : -1;
        ui.forEach(function (u, p) {
          var me = stats[p], you = stats[1 - p];
          cover(p, w === p ? 'win' : 'result', [
            el('div.w-stroop-title', { text: w < 0 ? '打平了' : w === p ? '你更不容易被带跑！' : '对面更不容易被带跑' }),
            el('div.w-stroop-vs', [
              el('div', [el('span', { text: '你' }), el('b.jn-num', { text: fmtCost(me) }), el('small', { text: '平均 ' + (me.all == null ? '—' : me.all) + ' · 错 ' + me.wrong })]),
              el('div', [el('span', { text: '对面' }), el('b.jn-num', { text: fmtCost(you) }), el('small', { text: '平均 ' + (you.all == null ? '—' : you.all) + ' · 错 ' + you.wrong })])
            ]),
            el('div.w-stroop-why', { text: '干扰代价 = 打架的题慢了多少。' + S_WHY_SHORT }),
            goBtn('再来一局', true)
          ]);
        });
        ctx.sfx('win');
        ctx.confetti();
        ctx.done({ text: '干扰代价 ' + fmtCost(stats[0]) + ' 对 ' + fmtCost(stats[1]) });
      }

      ui.forEach(function (u) { u.prog.textContent = '共 ' + total + ' 题'; u.word.textContent = '+'; });
      gates();
      return { destroy: function () { kit.destroy(); } };
    },

    preview: function (root, params, ctx) {
      var kit = Kit();
      var word = el('span.w-stroop-word');
      root.appendChild(el('div.w-stroop-pv', [word, el('div.w-stroop-pvkeys', S_KEYS.map(function (k) { return el('i', { attrs: { 'data-k': k } }); }))]));
      var seq = [[0, 1], [2, 3], [1, 1], [3, 0], [0, 2], [2, 2], [1, 3]], i = 0;   // [字, 字色]
      function show() {
        word.textContent = S_WORDS[seq[i][0]];
        word.setAttribute('data-ink', S_KEYS[seq[i][1]]);
        i = (i + 1) % seq.length;
      }
      show();
      if (!ctx.reduced) kit.every(1100, show);
      return { destroy: function () { kit.destroy(); } };
    }
  });
})();
