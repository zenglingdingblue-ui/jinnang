#!/usr/bin/env node
/* 锦囊 · G5 物理与数字的正确性测试（不需要浏览器）
 * 用法：node dev/test-phys.js
 * 直接加载 js/widgets/phys.js，验证它挂在 JN._phys 下的纯逻辑函数——组件里用的就是这些函数。
 * 有任何一项不通过，退出码为 1。
 */
'use strict';
var fs = require('fs');
var path = require('path');
global.window = { JN: { util: { range: function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; } }, registerWidget: function () {}, md: function (s) { return s; } } };
require(path.join(__dirname, '..', 'js', 'widgets', 'phys.js'));
var P = global.window.JN._phys;
var DEG = Math.PI / 180, TAU = Math.PI * 2;
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else fail++; console.log((cond ? '  通过  ' : '  失败  ') + msg); }
function near(a, b, rel) { return Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300); }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function rng(seed) { var h = seed >>> 0; return function () { h = (h + 0x6d2b79f5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ 1. 双摆 */
console.log('\n[1] 双摆：无阻尼 60 秒的能量漂移（RK4，步长 1/' + Math.round(1 / P.PEND.H) + ' 秒）');
(function () {
  var C = P.PEND, eMin = -(C.M1 + C.M2) * C.G * C.L1 - C.M2 * C.G * C.L2;      // 两根杆都竖直向下时的能量（最低）
  function drift(a1, a2) {
    var s = [a1 * DEG, a2 * DEG, 0, 0], e0 = P.pendEnergy(s) - eMin, worst = 0;
    for (var i = 0, n = Math.round(60 / C.H); i < n; i++) { P.pendStep(s, C.H); worst = Math.max(worst, Math.abs(P.pendEnergy(s) - eMin - e0)); }
    return worst / e0;
  }
  var cases = [C.START, C.START2, [179, 179], [90, -90], [170, -175], [45, 60]], rnd = rng(7), worst = 0;
  for (var k = 0; k < 14; k++) cases.push([Math.round(rnd() * 360 - 180), Math.round(rnd() * 360 - 180)]);
  cases.forEach(function (c, i) {
    var d = drift(c[0], c[1]);
    worst = Math.max(worst, d);
    if (i < 6) console.log('    起点 (' + c[0] + '°, ' + c[1] + '°)：相对漂移 ' + d.toExponential(2));
  });
  console.log('    另外 14 个随机起点一并计入；最大相对漂移 ' + worst.toExponential(2) + '（相对于“高出静止状态的能量”）');
  ok(worst < 0.01, '20 个起点 60 秒内总能量漂移都小于 1%（最大 ' + (worst * 100).toFixed(5) + '%）');
  // 双胞胎：角度差超过 SPLIT 度的时刻
  var a = [C.START2[0] * DEG, C.START2[1] * DEG, 0, 0], b = [C.START2[0] * DEG + C.EPS, C.START2[1] * DEG, 0, 0], t = 0, split = -1;
  while (t < 60 && split < 0) { P.pendStep(a, C.H); P.pendStep(b, C.H); t += C.H; if (P.pendSep(a, b) / DEG > C.SPLIT) split = t; }
  console.log('    双胞胎默认起点 (' + C.START2.join('°, ') + '°)，上杆只差 ' + C.EPS + ' rad = ' + (C.EPS / DEG).toFixed(4) + '°：第 ' + split.toFixed(2) + ' 秒角度差超过 ' + C.SPLIT + '°');
  ok(split > 2 && split < 20, '双胞胎先重合几秒再分开（' + split.toFixed(1) + ' 秒）');
})();

/* ------------------------------------------------------------------ 2. 摆的波浪 */
console.log('\n[2] 摆的波浪：周期、绳长、同相');
(function () {
  var W = P.WAVE, i, t;
  console.log('    第 i 只：次数 / 周期(s) / 绳长(cm)');
  [0, 1, 7, 13, 14].forEach(function (i) { console.log('    ' + pad(i + 1, 3) + pad(P.waveSwings(i), 5) + pad(P.wavePeriod(i).toFixed(4), 9) + (P.waveLength(i) * 100).toFixed(2)); });
  var worst = 0;
  for (i = 0; i < W.N; i++) worst = Math.max(worst, Math.abs(P.waveX(i, W.GAMMA) - 1));
  ok(worst < 1e-9, 't = ' + W.GAMMA + ' 秒时 15 只摆全部回到起点（最大偏差 ' + worst.toExponential(1) + '）');
  var best = 1e9, bestT = 0;
  for (t = 0.5; t <= W.GAMMA - 0.5; t += 0.001) {
    var m = 0;
    for (i = 0; i < W.N; i++) m = Math.max(m, 1 - P.waveX(i, t));
    if (m < best) { best = m; bestT = t; }
  }
  ok(best > 0.05, '在这之前没有提前同相（0.5–59.5 秒内最接近的一次在 ' + bestT.toFixed(2) + ' 秒，仍有摆偏离 ' + best.toFixed(3) + ' 个振幅）');
  function groups(t) {
    var seen = [];
    for (var i = 0; i < W.N; i++) { var ph = ((P.wavePhase(i, t) % TAU) + TAU) % TAU; if (!seen.some(function (q) { var d = Math.abs(q - ph); return Math.min(d, TAU - d) < 1e-6; })) seen.push(ph); }
    return seen.length;
  }
  ok(groups(W.GAMMA / 2) === 2 && groups(W.GAMMA / 3) === 3 && groups(W.GAMMA / 4) === 4, 'Γ/2、Γ/3、Γ/4 时相位分别分成 2、3、4 组');
  // 用 RK4 积分真实的摆（θ'' = −(g/L)·sinθ），量周期：小角度时等于 2π√(L/g)；摆角 18° 时所有摆的周期拉长同一个倍数
  function period(L, th0) {
    var th = th0, w = 0, h = 1e-4, tt = 0, prevW = 0, zeros = [];
    function acc(x) { return -(W.G / L) * Math.sin(x); }
    while (zeros.length < 2 && tt < 10) {
      var k1t = w, k1w = acc(th), k2t = w + 0.5 * h * k1w, k2w = acc(th + 0.5 * h * k1t), k3t = w + 0.5 * h * k2w, k3w = acc(th + 0.5 * h * k2t), k4t = w + h * k3w, k4w = acc(th + h * k3t);
      prevW = w;
      th += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t); w += h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w); tt += h;
      if (prevW < 0 && w >= 0) zeros.push(tt - h * w / (w - prevW));      // 速度由负变正：摆到另一头，正好半个周期
      if (prevW > 0 && w <= 0 && tt > h * 2) zeros.push(tt - h * w / (w - prevW));
    }
    return zeros[1];
  }
  var small = 0, ratios = [];
  for (i = 0; i < W.N; i++) {
    small = Math.max(small, Math.abs(period(P.waveLength(i), 0.5 * DEG) / P.wavePeriod(i) - 1));
    ratios.push(period(P.waveLength(i), W.AMP * DEG) / P.wavePeriod(i));
  }
  var spread = Math.max.apply(null, ratios) - Math.min.apply(null, ratios);
  ok(small < 2e-5, 'RK4 量出的小角度（0.5°）周期与 Γ/(51+i) 一致（最大相对差 ' + small.toExponential(1) + '）');
  ok(spread < 1e-6, '摆角 ' + W.AMP + '° 时 15 只摆的周期都拉长同一个倍数 ' + ratios[0].toFixed(5) + '（≈ 1 + θ0²/16 = ' + (1 + Math.pow(W.AMP * DEG, 2) / 16).toFixed(5) + '），队形照样重现');
})();

/* ------------------------------------------------------------------ 3. 投篮 */
console.log('\n[3] 投篮：抛物线、判定、能进的角度—速度范围');
(function () {
  var H = P.HOOP, RB = H.BALL_D / 2, o = [0, 0, 0, 0];
  console.log('    常数：篮圈高 ' + H.RIM_H + '，内径 ' + H.RIM_D + '，球直径 ' + H.BALL_D + '，罚球线 ' + H.FT.toFixed(3) + '，三分线 ' + H.THREE + '，g = ' + H.G + '，步长 1/' + Math.round(1 / H.DT) + ' s');
  ok(near(P.hoopMinEntry() / DEG, Math.asin(0.246 / 0.45) / DEG, 1e-12) && Math.abs(P.hoopMinEntry() / DEG - 33.14) < 0.01, '不碰筐的最小入筐角 = asin(24.6/45) = ' + (P.hoopMinEntry() / DEG).toFixed(2) + '°');
  // (a) 逐步模拟与解析解
  var worst = 0;
  [[45, 7.5, 2, H.FT], [52, 7.3, 2, H.FT], [60, 9.2, 2.2, H.THREE], [70, 10.4, 1.8, H.THREE]].forEach(function (c) {
    var s = P.hoopShot(c[0] * DEG, c[1], c[2], c[3]);
    while (s.x < c[3] - 1 && s.y > 1) { P.hoopStep(s, H.DT); P.hoopAt(c[0] * DEG, c[1], c[2], s.t, o); worst = Math.max(worst, Math.abs(s.x - o[0]), Math.abs(s.y - o[1]), Math.abs(s.vy - o[3])); }
  });
  ok(worst < 1e-9, '逐步模拟的抛物线与解析解 x = v·cosθ·t、y = h0 + v·sinθ·t − ½gt² 一致（最大偏差 ' + worst.toExponential(1) + ' 米）');
  // (b) 入筐角：圈心球满足 tanφ = tanθ − 2Δh/D
  var w2 = 0;
  [[50, 2, H.FT], [60, 2, H.FT], [48, 2.4, H.THREE], [65, 1.6, H.THREE]].forEach(function (c) {
    var v = P.hoopCenterSpeed(c[0] * DEG, c[1], c[2]), e = P.hoopEval(c[0] * DEG, v, c[1], c[2]);
    w2 = Math.max(w2, Math.abs(e.xc - c[2]), Math.abs(Math.tan(e.entry) - (Math.tan(c[0] * DEG) - 2 * (H.RIM_H - c[1]) / c[2])));
  });
  ok(w2 < 1e-9, '圈心球：落点正在圈心，入筐角满足 tanφ = tanθ − 2Δh/D');
  // (c) 最省力的角度：扫描 vs 闭式解 45° + ½·atan(Δh/D)
  [['罚球线', H.FT], ['三分线', H.THREE]].forEach(function (sp) {
    var best = 0, bv = Infinity;
    for (var a = 30; a <= 80; a += 0.01) { var v = P.hoopCenterSpeed(a * DEG, H.H0, sp[1]); if (v < bv) { bv = v; best = a; } }
    var closed = 45 + 0.5 * Math.atan((H.RIM_H - H.H0) / sp[1]) / DEG;
    ok(Math.abs(best - closed) < 0.02, sp[0] + '：送到圈心最省力的角度，扫描得 ' + best.toFixed(2) + '°，闭式解 ' + closed.toFixed(2) + '°（速度 ' + bv.toFixed(3) + ' m/s）');
  });
  // (d) 解析判定与逐步模拟（带碰撞）的结论对照
  var total = 0, agree = 0, edge = 0, bad = 0;
  [H.FT, H.THREE].forEach(function (D) {
    for (var a = 42; a <= 75; a += 1.5) {
      var vc = P.hoopCenterSpeed(a * DEG, H.H0, D);
      for (var v = vc - 0.3; v <= vc + 0.3; v += 0.004) {
        var e = P.hoopEval(a * DEG, v, H.H0, D), s = P.hoopRun(a * DEG, v, H.H0, D);
        total++;
        if (e.swish === (s.result === 'swish')) agree++;
        else if (Math.abs(Math.min(e.cF, e.cB)) < 0.002) edge++;       // 离筐沿不到 2 毫米：差在步长上
        else bad++;
      }
    }
  });
  ok(bad === 0, '解析判定与逐步模拟对照 ' + total + ' 次出手：' + agree + ' 次一致，' + edge + ' 次是离筐沿不到 2 毫米的擦边球，' + bad + ' 次真正矛盾');
  // (e) 直线近似：缝宽 ≈ 篮圈内径·sinφ − 球直径（沿垂直于来球方向量）
  var e1 = P.hoopEval(60 * DEG, P.hoopCenterSpeed(60 * DEG, 2, H.FT), 2, H.FT);
  ok(Math.abs((e1.cF + e1.cB) - (H.RIM_D * Math.sin(e1.entry) - H.BALL_D)) < 0.004, '圈心球前后余量之和 ' + ((e1.cF + e1.cB) * 100).toFixed(2) + ' cm ≈ 内径·sinφ − 球直径 = ' +
    ((H.RIM_D * Math.sin(e1.entry) - H.BALL_D) * 100).toFixed(2) + ' cm（抛物线略弯，差几毫米以内）');
  // (f) 打印“能进的角度—速度范围”
  [['罚球线', H.FT], ['三分线', H.THREE]].forEach(function (sp) {
    var T = P.hoopTable(H.H0, sp[1]);
    var both = P.hoopStable(T, H.SIG_V, H.SIG_A, 75), vOnly = P.hoopStable(T, H.SIG_V, 0, 75), aOnly = P.hoopStable(T, 0, H.SIG_A, 75);
    console.log('\n    ' + sp[0] + '（D = ' + sp[1].toFixed(3) + ' m，出手点 ' + H.H0 + ' m）：能空心入网的出手速度范围');
    console.log('    角度   最小速度  最大速度  宽度(m/s)  余地(%)  入筐角   手抖命中率：都抖 / 只抖速度 / 只抖角度');
    for (var a = 40; a <= 75; a += 2.5) {
      var w = P.hoopRow(T, a), i = Math.round((a - T.a0) / T.step);
      console.log('    ' + pad(a.toFixed(1) + '°', 7) + (w ? pad(w.lo.toFixed(3), 10) + pad(w.hi.toFixed(3), 10) + pad((w.hi - w.lo).toFixed(3), 11) + pad(((w.hi - w.lo) / w.mid * 100).toFixed(2), 9) +
        pad((w.entry / DEG).toFixed(1) + '°', 9) + pad((both.rates[i] * 100).toFixed(0) + '%', 7) + pad((vOnly.rates[i] * 100).toFixed(0) + '%', 7) + (aOnly.rates[i] * 100).toFixed(0) + '%' : '进不了（入筐角不到 33.1°）'));
    }
    var firstOk = null;
    T.rows.forEach(function (w, i) { if (w && firstOk == null) firstOk = T.a0 + i * T.step; });
    console.log('    能空心的最小出手角 ' + firstOk + '°；最省力 ' + T.easy.a + '°（' + T.easy.v.toFixed(3) + ' m/s）；最稳：都抖 ' + both.best.a + '°（' + (both.best.rate * 100).toFixed(0) + '%），只抖速度 ' +
      vOnly.best.a + '°，只抖角度 ' + aOnly.best.a + '°');
    var mono = true, prev = 0;
    T.rows.forEach(function (w, i) { var a = T.a0 + i * T.step; if (w && a <= 75) { if (w.hi - w.lo < prev - 1e-6) mono = false; prev = w.hi - w.lo; } });
    ok(mono, sp[0] + '：速度范围的宽度随出手角单调变宽（到 75° 为止）');
    ok(vOnly.best.a >= 75 - 1e-9, sp[0] + '：只抖速度时越高越稳（最稳在扫描上限 75°）');
    ok(Math.abs(aOnly.best.a - T.easy.a) <= 4, sp[0] + '：只抖角度时，最稳的角度（' + aOnly.best.a + '°）就在最省力的角度（' + T.easy.a + '°）附近');
    ok(both.best.a > T.easy.a && both.best.a < 75, sp[0] + '：两样都抖时，最稳的角度（' + both.best.a + '°）比最省力的高，但不是越高越好');
  });
})();

/* ------------------------------------------------------------------ 4. 如果地球是一个篮球 */
console.log('\n[4] 如果地球是一个篮球：每个缩放结果与手算对照');
(function () {
  var S = P.SCALE, ball = 0.246, k = 0.246 / 12756;       // 手算用的比例：每千米 → 米（地球赤道直径 12,756 km）
  console.log('    比例：' + ball + ' m ÷ ' + S.EARTH_D + ' km，即缩小 ' + Math.round(S.EARTH_D * 1000 / ball).toLocaleString('en-US') + ' 倍');
  // 手算值（独立写出的数字，不经过组件代码）：直径 m、距离 m
  var hand = { moon: [0.067016, 7.4132], sun: [26.833, 2885.0], mars: [0.13098, 4396.1], jupiter: [2.7575, 15013], saturn: [2.3245, 27617], neptune: [0.95515, 87071], proxima: [4.2933, 7.7478e8] };
  // 直径口径：NASA Planetary Fact Sheet 主表的赤道直径（km）。这里再写一遍，和组件里的常数逐个对照
  var nasa = { moon: 3475, sun: 1391400, mars: 6792, jupiter: 142984, saturn: 120536, neptune: 49528 };
  ok(S.EARTH_D === 12756 && S.BODIES.every(function (b) { return b.id === 'proxima' || b.d === nasa[b.id]; }), '直径用的是 NASA 主表的赤道直径：地球 12,756、月球 3,475、火星 6,792、木星 142,984、土星 120,536、海王星 49,528；太阳 1,391,400');
  console.log('    ' + pad('天体', 6) + pad('真实直径(km)', 14) + pad('缩小后直径', 13) + pad('真实距离(km)', 16) + pad('缩小后距离', 13) + '参照');
  var allOk = true;
  S.BODIES.forEach(function (b) {
    var r = P.scaleBody(b, ball), h = hand[b.id];
    var good = near(r.d, b.d * k, 1e-12) && near(r.dist, b.dist * k, 1e-12) && near(r.d, h[0], 1e-3) && near(r.dist, h[1], 1e-3);
    if (!good) allOk = false;
    console.log('    ' + pad(b.name, 6 - (b.name.length - 2)) + pad(b.d.toLocaleString('en-US', { maximumFractionDigits: 1 }), 16) + pad(P.fmtLen(r.d), 14) +
      pad(b.dist.toExponential(4), 18) + pad(P.fmtLen(r.dist), 14) + P.sizeRef(r.d).text + '；' + P.distRef(r.dist) + (good ? '' : '  ← 不一致'));
  });
  ok(allOk, '7 个天体的缩小后直径、距离都等于 真实值 × 0.246/12756，并与手算值相差不到 0.1%');
  var L = P.scaleLight(ball);
  console.log('    光：缩小后的光速 ' + L.speed.toFixed(4) + ' m/s（时速 ' + (L.speed * 3.6).toFixed(1) + ' km）；太阳→地球 ' + L.sunSec.toFixed(1) + ' s = ' + Math.floor(L.sunSec / 60) + ' 分 ' + Math.floor(L.sunSec % 60) +
    ' 秒；地球→月球 ' + L.moonSec.toFixed(3) + ' s；到比邻星 ' + L.proximaYr.toFixed(4) + ' 年');
  ok(near(L.speed, 299792.458 * k, 1e-12) && near(L.speed, 5.7815, 1e-4) && near(L.sunSec, 499.005, 1e-5) && near(L.moonSec, 1.2822, 1e-4) && near(L.proximaYr, 4.2465, 1e-9),
    '光速缩小后 5.78 m/s；日地 499.0 秒（8 分 19 秒）；用这个速度走完缩小后的日地距离也是 ' + (P.scaleBody(S.BODIES[1], ball).dist / L.speed).toFixed(1) + ' 秒');
  var others = S.BALLS.slice(1).map(function (bb) { return bb.name + ' ' + bb.d + ' m → 月球 ' + P.fmtLen(P.scaleBody(S.BODIES[0], bb.d).d) + '、' + P.fmtLen(P.scaleBody(S.BODIES[0], bb.d).dist) + ' 外，太阳 ' + P.fmtLen(P.scaleBody(S.BODIES[1], bb.d).d) + '、' + P.fmtLen(P.scaleBody(S.BODIES[1], bb.d).dist) + ' 外'; });
  console.log('    换个球：\n      ' + others.join('\n      '));
  ok(near(P.scaleBody(S.BODIES[0], 0.04).dist, 384400 * 0.04 / 12756, 1e-12), '换成乒乓球后数字按同一公式重算');
  ok(P.sizeRef(0.067).q === 1 && /网球/.test(P.sizeRef(0.0670).text) && /篮球场的长度/.test(P.sizeRef(26.83).text) && /40 分钟/.test(P.distRef(2885)) && /米尺/.test(P.sizeRef(0.955).text) && /排球网/.test(P.sizeRef(2.32).text) && /乒乓球桌的长度/.test(P.sizeRef(2.76).text),
    '参照物：6.7 cm ↔ 网球，26.8 m ↔ 篮球场的长度（28 m），2.89 km ↔ 走路约 40 分钟（时速 ' + S.WALK_KMH + ' km），95.5 cm ↔ 米尺，2.32 m ↔ 排球网高，2.76 m ↔ 乒乓球桌长');
})();

/* ------------------------------------------------------------------ 5. 万花尺 */
console.log('\n[5] 万花尺：花瓣数公式 R ÷ gcd(R, r) 与实际描出的曲线对照');
(function () {
  var pairs = [[96, 36], [96, 24], [105, 30], [96, 40], [60, 24], [72, 27], [120, 45], [84, 35], [90, 36], [100, 37], [96, 77], [80, 30], [63, 28], [48, 20], [110, 44], [75, 20], [64, 24], [99, 36], [120, 50], [52, 39]];
  var allOk = true, rows = [];
  pairs.forEach(function (p) {
    var R = p[0], r = p[1], f = P.hypoPetals(R, r), c1 = P.hypoCountPetals(R, r, 0.8 * r), c2 = P.hypoCountPetals(R, r, r);
    var a = [0, 0], b = [0, 0], end = TAU * P.hypoTurns(R, r);
    P.hypo(R, r, 0.8 * r, 0, a); P.hypo(R, r, 0.8 * r, end, b);
    var closed = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-8, early = false;
    for (var k = 1; k < P.hypoTurns(R, r); k++) { P.hypo(R, r, 0.8 * r, TAU * k, b); if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-6) early = true; }
    if (f !== c1 || f !== c2 || !closed || early) allOk = false;
    rows.push('(' + R + ',' + r + ')→' + f + (f === c1 && f === c2 ? '' : '≠' + c1 + '/' + c2));
  });
  console.log('    ' + rows.slice(0, 10).join('  ') + '\n    ' + rows.slice(10).join('  '));
  ok(allOk, '20 组 (R, r)：公式给出的花瓣数 = 实际曲线上“离中心最远点”的个数（笔尖在 0.8r 和在齿轮边缘两种情况都数了），且正好绕 r/gcd 圈闭合、不会提前闭合');
  var q = P.curvesQuiz(1, rng(3)), q0 = P.curvesQuiz(0, rng(5));
  ok(q.petals === P.hypoPetals(q.R, q.r) && q.options.indexOf(q.petals) >= 0 && q.options.length === 4 && q0.R % q0.r === 0, '猜花瓣出的题：正确答案在四个选项里，热身题的大圈是小轮的整数倍');
})();

/* ------------------------------------------------------------------ 6. 科赫雪花、分形树 */
console.log('\n[6] 分形：科赫雪花的周长与面积、分形树的树枝数');
(function () {
  var a0 = Math.sqrt(3) / 4, allOk = true, line = [];
  for (var n = 0; n <= 6; n++) {
    var p = P.kochPoints(n, 1), per = P.polyPerimeter(p) / 3, area = P.polyArea(p) / a0;
    if (p.length / 2 !== P.kochSides(n) || !near(per, P.kochPerimeter(n), 1e-9) || !near(area, P.kochArea(n), 1e-9)) allOk = false;
    line.push(n + ' 层：' + P.kochSides(n) + ' 边，周长 ×' + per.toFixed(4) + '，面积 ×' + area.toFixed(4));
  }
  console.log('    ' + line.join('\n    '));
  ok(allOk, '0–6 层：实际多边形的边数、周长、面积与 3·4ⁿ、(4/3)ⁿ、1 + 0.6·(1 − (4/9)ⁿ) 一致');
  ok(P.kochArea(20) < P.KOCH_AREA_LIMIT && P.kochArea(20) > P.kochArea(19) && near(P.kochArea(60), 1.6, 1e-12), '面积一直在涨，但永远到不了 1.6 倍（20 层时 ×' + P.kochArea(20).toFixed(9) + '）');
  ok(P.treeCount(9) === 511 && P.treeCount(11) === 2047, '分形树 9 层 511 根、11 层 2047 根树枝');
})();

/* ------------------------------------------------------------------ 7. 卡片上的数字 */
console.log('\n[7] 卡片文字里的数字与组件算出来的一致');
(function () {
  var cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'w-phys.json'), 'utf8')), by = {};
  cards.forEach(function (c) { by[c.id] = [c.title, c.body, c.more || '', c.hint || ''].join('\n'); });
  var H = P.HOOP, S = P.SCALE, W = P.WAVE, bb = S.BALLS[0].d, moon = P.scaleBody(S.BODIES[0], bb), sun = P.scaleBody(S.BODIES[1], bb), prox = P.scaleBody(S.BODIES[6], bb), L = P.scaleLight(bb);
  function has(id, str, what) { ok(by[id].indexOf(str) >= 0, id + ' 里的「' + str + '」= ' + what); }
  ok(cards.length === 12 && cards.filter(function (c) { return c.type === 'play'; }).length === 5 && cards.filter(function (c) { return c.type === 'show'; }).length === 7, '12 张卡片：play 5、show 7');
  has('play-501', H.FT.toFixed(3) + ' 米', '罚球线到篮筐中心 5.80 − 1.575');
  has('play-501', H.RIM_H + ' 米', '篮筐高');
  has('play-501', '速度大约差 ' + H.SIG_V * 100 + '%，角度大约差 ' + H.SIG_A + '°', '手抖的标准差');
  has('play-502', H.THREE + ' 米', '三分线');
  has('play-502', (H.THREE - H.FT).toFixed(1) + ' 米', '三分线比罚球线远多少');
  has('play-503', '96 ÷ 12 = ' + P.hypoPetals(96, 36), '花瓣数');
  has('play-503', '绕 ' + P.hypoTurns(96, 36) + ' 圈', '小轮绕的圈数');
  has('play-504', '9 层就有 ' + P.treeCount(9) + ' 根', '树枝数');
  has('play-504', P.KOCH_AREA_LIMIT + ' 倍', '面积上限');
  has('show-202', (P.PEND.EPS / DEG).toFixed(3) + '°', P.PEND.EPS + ' 弧度');
  has('show-203', W.N + ' 只摆', '摆的个数');
  has('show-203', '摆 ' + W.N0 + ' 次', '最长的摆次数');
  has('show-203', '最短的 ' + (W.N0 + W.N - 1) + ' 次', '最短的摆次数');
  has('show-203', W.GAMMA + ' 秒', '大周期');
  has('show-204', (P.hoopApparent(45 * DEG) * 100).toFixed(1) + ' 厘米', '45° 入筐时看起来的宽度');
  has('show-204', '小于 ' + Math.floor(P.hoopMinEntry() / DEG) + '°', '最小入筐角 ' + (P.hoopMinEntry() / DEG).toFixed(1) + '°');
  has('show-204', (H.BALL_D * 100).toFixed(1) + ' 厘米', '球直径');
  has('show-207', Math.round(S.EARTH_D * 1000 / bb / 1e4) + ' 万', '缩小倍数');
  has('show-207', moon.dist.toFixed(1) + ' 米', '月球距离 ' + P.fmtLen(moon.dist));
  has('show-207', '直径 ' + Math.round(sun.d) + ' 米', '太阳直径 ' + P.fmtLen(sun.d));
  has('show-207', (sun.dist / 1000).toFixed(1) + ' 千米', '太阳距离 ' + P.fmtLen(sun.dist));
  has('show-207', P.fmtLen(prox.dist).replace(' ', ' '), '比邻星距离');
  has('show-207', '每秒只走 ' + L.speed.toFixed(1) + ' 米', '缩小后的光速');
  has('show-207', Math.floor(L.sunSec / 60) + ' 分 ' + Math.floor(L.sunSec % 60) + ' 秒', '日地光行时间');
  ok(/网球/.test(P.sizeRef(moon.d).text) && Math.abs(prox.dist / 1000 / S.MOON_DIST - 2) < 0.05, 'show-207：月球 ↔ 网球；比邻星 ≈ 2 倍真实地月距离（“比真的月亮还远一倍”）');
})();

console.log('\ntest-phys：' + pass + ' 项通过，' + fail + ' 项失败');
process.exit(fail ? 1 : 0);
