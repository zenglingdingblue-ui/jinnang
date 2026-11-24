#!/usr/bin/env node
/* 锦囊 · sim 组件（G4）的数学正确性测试。
 * 用法：node dev/test-sim.js             常规测试，约 15 秒
 *       node dev/test-sim.js --census    再加上“五格挑战”的穷举（23 万多种开局逐个演化，约三四分钟），
 *                                        用来核对组件「为什么」和卡片里引用的那几个数
 * 只测 js/widgets/sim.js 里挂在 JN._sim 下的纯逻辑，不需要浏览器。
 * 随机数都带固定种子，结果可复现；最后一行是汇总，有失败时退出码为 1。
 */
'use strict';
global.window = global;                       // core.js / sim.js 加载时只用到 window.JN
require('../js/core.js');
require('../js/widgets/sim.js');
var JN = global.JN, S = JN._sim, rng = JN.util.rng;

var pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
}
function near(x, target, tol) { return Math.abs(x - target) <= tol; }
function section(t) { console.log('\n' + t); }

/* ---------------------------------------------------------------- 组件注册 */
section('组件注册');
['monty', 'galton', 'chaosgame', 'montepi', 'life', 'sorting', 'birthday'].forEach(function (id) {
  var w = JN.widgets[id];
  ok(!!w && typeof w.mount === 'function' && typeof w.preview === 'function' && !!w.name && !!w.rules, id + ' 已注册（mount / preview / name / rules 齐全）');
});

/* ---------------------------------------------------------------- 三门问题 */
section('三门问题');
(function () {
  var rnd = rng('monty-test'), N = 100000, i, w;
  for (w = 0, i = 0; i < N; i++) if (S.montyPlay(rnd, 3, true)) w++;
  ok(near(w / N, 2 / 3, 0.01), '3 扇门·换：十万次胜率在 0.667±0.01', '实测 ' + (w / N).toFixed(4));
  for (w = 0, i = 0; i < N; i++) if (S.montyPlay(rnd, 3, false)) w++;
  ok(near(w / N, 1 / 3, 0.01), '3 扇门·不换：十万次胜率在 0.333±0.01', '实测 ' + (w / N).toFixed(4));
  for (w = 0, i = 0; i < N; i++) if (S.montyPlay(rnd, 100, true)) w++;
  ok(near(w / N, 0.99, 0.003), '100 扇门·换：胜率约 0.99', '实测 ' + (w / N).toFixed(4));
  for (w = 0, i = 0; i < N; i++) if (S.montyPlay(rnd, 100, false)) w++;
  ok(near(w / N, 0.01, 0.003), '100 扇门·不换：胜率约 0.01', '实测 ' + (w / N).toFixed(4));
  var bad = 0, uniq = {};
  for (i = 0; i < 20000; i++) {
    var d = S.montyDeal(rnd, 3);
    if (d.other === d.pick || d.other < 0 || d.other > 2) bad++;
    if (d.pick !== d.prize && d.other !== d.prize) bad++;          // 主持人绝不会把奖品门打开
    if (d.pick === d.prize) uniq[d.pick + '>' + d.other] = (uniq[d.pick + '>' + d.other] || 0) + 1;
  }
  ok(bad === 0, '主持人留下的门从不是玩家选的那扇；玩家没选中时留下的一定是奖品门');
  var counts = Object.keys(uniq).map(function (k) { return uniq[k]; });
  ok(counts.length === 6 && Math.min.apply(0, counts) / Math.max.apply(0, counts) > 0.85, '玩家选中时，主持人在另外两扇里随机留一扇（六种情况大致均匀）');
  var t3 = S.montyTheory(3), t100 = S.montyTheory(100);
  ok(near(t3.swap, 2 / 3, 1e-12) && near(t3.stay, 1 / 3, 1e-12) && near(t100.swap, 0.99, 1e-12), '理论值：3 门 2/3 与 1/3，100 门 99/100');
})();

/* ---------------------------------------------------------------- 高尔顿板 */
section('高尔顿板');
(function () {
  function pascal(n) { var r = [1]; for (var i = 0; i < n; i++) { var s = [1]; for (var k = 1; k <= i; k++) s.push(r[k - 1] + r[k]); s.push(1); r = s; } return r; }
  var allSum = true, allMatch = true;
  [[4, 0.5], [6, 0.5], [10, 0.5], [10, 0.7], [14, 0.3], [8, 0.1], [12, 0.9]].forEach(function (c) {
    var n = c[0], p = c[1], pmf = S.binomPMF(n, p), C = pascal(n), sum = 0;
    pmf.forEach(function (v, k) { sum += v; if (Math.abs(v - C[k] * Math.pow(p, k) * Math.pow(1 - p, n - k)) > 1e-12) allMatch = false; });
    if (Math.abs(sum - 1) > 1e-12) allSum = false;
  });
  ok(allSum, '理论分布各槽概率之和为 1（7 组 rows / p）');
  ok(allMatch, '理论分布 = C(n,k)·p^k·(1−p)^(n−k)（与杨辉三角对照）');
  var sym = S.binomPMF(10, 0.5);
  ok(sym.every(function (v, k) { return Math.abs(v - sym[10 - k]) < 1e-15; }) && near(sym[5], 252 / 1024, 1e-15), 'p=0.5 时左右对称，10 排钉子正中间那槽 = 252/1024 ≈ 24.6%');
  [[10, 0.5], [10, 0.7], [6, 0.5]].forEach(function (c) {
    var n = c[0], p = c[1], rnd = rng('galton-' + n + '-' + p), N = 200000, cnt = new Array(n + 1).fill(0), pmf = S.binomPMF(n, p), worst = 0, mean = 0;
    for (var i = 0; i < N; i++) cnt[S.galtonDrop(rnd, n, p)]++;
    cnt.forEach(function (v, k) { worst = Math.max(worst, Math.abs(v / N - pmf[k])); mean += k * v / N; });
    ok(worst < 0.005 && near(mean, n * p, 0.02), '模拟 20 万颗球（' + n + ' 排，p=' + p + '）：各槽频率与二项分布相差 < 0.005，平均右拐 ' + mean.toFixed(3) + ' 次（理论 ' + (n * p) + '）');
  });
  var pmf6 = S.binomPMF(6, 0.5), odds = S.galtonOdds(pmf6);
  ok(odds.join(',') === '64,10.7,4.3,3.2,4.3,10.7,64', '猜球赔率（6 排）= 1/概率：64, 10.7, 4.3, 3.2, 4.3, 10.7, 64');
  ok(odds.every(function (o, k) { return near(o * pmf6[k], 1, 0.01); }), '押任何一槽，每颗球的平均得分都约为 1（赔率公平）');
  var p10 = 1 - Math.pow(63 / 64, 10);
  ok(near(p10, 0.146, 0.001), '十颗球全押最边上，至少中一次的机会 ≈ 14.6%', p10.toFixed(4));
})();

/* ---------------------------------------------------------------- 混沌游戏 */
section('混沌游戏');
(function () {
  ok(near(S.CHAOS.tri.jump, 0.5, 1e-15) && near(S.CHAOS.square.jump, 0.5, 1e-15), '三角、方形：跳到一半');
  ok(near(S.CHAOS.penta.jump, (Math.sqrt(5) - 1) / 2, 1e-12), '五边形：跳到 0.618…（黄金分割）', S.CHAOS.penta.jump.toFixed(10));
  ok(near(S.kissRatio(5), (3 - Math.sqrt(5)) / 2, 1e-12) && near(S.kissRatio(6), 1 / 3, 1e-12) && near(S.kissRatio(3), 0.5, 1e-15), '相切比例 s(3)=1/2，s(5)=(3−√5)/2，s(6)=1/3');
  ok(near(S.CHAOS.hexa.jump, 2 / 3, 1e-12) && near(S.CHAOS.carpet.jump, 2 / 3, 1e-15) && S.CHAOS.carpet.verts.length === 8, '六边形、地毯：跳到三分之二；地毯有 8 个点');
  // 三角形：跳过 m 次的点不在前 m 层的任何空洞里；三个顶点被选中的频率各约 1/3
  var def = S.CHAOS.tri, rnd = rng('chaos-tri'), st = S.chaosStart(def, rnd), holes = 0, big = 0, f = [0, 0, 0], N = 100000, i, outside = 0;
  ok(S.sierpinskiHole(def.verts, def.w / 2, def.h * 0.6, 3) === 1, '空洞判定：三角形正中间的点在第 1 层空洞里');
  for (i = 1; i <= N; i++) {
    f[S.chaosStep(def, st, rnd)]++;
    var lv = S.sierpinskiHole(def.verts, st.x, st.y, Math.min(i, 8));
    if (lv) holes++;
    if (lv === 1) big++;
    var w = S.bary(def.verts, st.x, st.y);
    if (w[0] < -1e-9 || w[1] < -1e-9 || w[2] < -1e-9) outside++;
  }
  ok(big === 0, '十万个点没有一个落进中间的大空洞', '落进 ' + big + ' 个');
  ok(holes === 0 && outside === 0, '跳过 m 次的点不在前 m 层（查到第 8 层）的任何空洞里，也不会出三角形');
  ok(f.every(function (v) { return near(v / N, 1 / 3, 0.01); }), '三个顶点被选中的频率各约 1/3', f.map(function (v) { return (v / N).toFixed(3); }).join(' '));
  // 方形：不连续两次选同一个顶点
  def = S.CHAOS.square; rnd = rng('chaos-sq'); st = S.chaosStart(def, rnd);
  var rep = 0, last = -1, g = [0, 0, 0, 0];
  for (i = 0; i < N; i++) { var v = S.chaosStep(def, st, rnd); if (v === last) rep++; last = v; g[v]++; }
  ok(rep === 0, '方形变体：十万步里没有连续两次选中同一个顶点');
  ok(g.every(function (c) { return near(c / N, 0.25, 0.01); }), '方形变体：四个顶点频率各约 1/4', g.map(function (c) { return (c / N).toFixed(3); }).join(' '));
  // 所有变体：点始终留在图形的包围盒里
  var inBox = true;
  Object.keys(S.CHAOS).forEach(function (key) {
    var d = S.CHAOS[key], r = rng('chaos-' + key), s = S.chaosStart(d, r);
    for (var k = 0; k < 20000; k++) { S.chaosStep(d, s, r); if (s.x < -1e-9 || s.y < -1e-9 || s.x > d.w + 1e-9 || s.y > d.h + 1e-9) inBox = false; }
  });
  ok(inBox, '五种变体的点都不会跳出图形');
  // 分形的“空”：把三角形切成 4^6 = 4096 个小三角，点再多也只能点亮其中 3^6 = 729 个
  def = S.CHAOS.tri; rnd = rng('chaos-cover'); st = S.chaosStart(def, rnd);
  var lit = {};
  for (i = 0; i < 200000; i++) {
    S.chaosStep(def, st, rnd);
    if (i < 10) continue;
    var b = S.bary(def.verts, st.x, st.y), addr = '';
    for (var L = 0; L < 6; L++) { var c = b[0] >= 0.5 ? 0 : b[1] >= 0.5 ? 1 : 2; addr += c; b = [b[0] * 2, b[1] * 2, b[2] * 2]; b[c] -= 1; }
    lit[addr] = 1;
  }
  ok(Object.keys(lit).length === 729, '二十万个点只点亮了 4096 个小三角里的 729 个（= 3^6，占 17.8%）', '点亮 ' + Object.keys(lit).length + ' 个');
})();

/* ---------------------------------------------------------------- 扔飞镖算 π */
section('扔飞镖算圆周率');
(function () {
  var rnd = rng('pi-test'), N = 1000000, est = 4 * S.piRun(rnd, N) / N;
  ok(near(est, Math.PI, 0.01), '一百万个点：估计值与 π 相差 < 0.01', '估计 ' + est.toFixed(5));
  ok(near(S.PI_SE, 1.6422, 0.0001), '误差公式的常数 √(π(4−π)) ≈ 1.6422', S.PI_SE.toFixed(5));
  var runs = 3000, n = 1000, sum = 0, sq = 0;
  for (var i = 0; i < runs; i++) { var e = 4 * S.piRun(rnd, n) / n; sum += e; sq += e * e; }
  var mean = sum / runs, sd = Math.sqrt(sq / runs - mean * mean), th = S.PI_SE / Math.sqrt(n);
  ok(near(sd, th, th * 0.08) && near(mean, Math.PI, 0.005), '3000 轮、每轮扔 1000 个：估计值的波动 ≈ 1.642/√N', '实测标准差 ' + sd.toFixed(4) + '，理论 ' + th.toFixed(4));
})();

/* ---------------------------------------------------------------- 生命游戏 */
section('生命游戏');
(function () {
  function world(cols, rows, pat, ox, oy) { var g = new Uint8Array(cols * rows); S.lifePlace(g, cols, rows, S.lifeCells(pat), ox, oy); return g; }
  function run(g, cols, rows, gens) { var a = Uint8Array.from(g), b = new Uint8Array(a.length), pop = 0; for (var i = 0; i < gens; i++) { pop = S.lifeStep(a, b, cols, rows); var t = a; a = b; b = t; } return { g: a, pop: pop }; }
  function same(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function shifted(a, b, cols, rows, dx, dy) { for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) if (a[y * cols + x] !== b[((y - dy + rows) % rows) * cols + ((x - dx + cols) % cols)]) return false; return true; }
  function count(g) { var n = 0; for (var i = 0; i < g.length; i++) n += g[i]; return n; }

  // 规则本身：逐条核对 B3/S23
  var rulesOk = true;
  for (var self = 0; self <= 1; self++) for (var nb = 0; nb <= 8; nb++) {
    var g0 = new Uint8Array(25), order = [6, 7, 8, 11, 13, 16, 17, 18];
    g0[12] = self;
    for (var q = 0; q < nb; q++) g0[order[q]] = 1;
    var out = new Uint8Array(25);
    S.lifeStep(g0, out, 5, 5);
    var want = (nb === 3 || (nb === 2 && self === 1)) ? 1 : 0;
    if (out[12] !== want) rulesOk = false;
  }
  ok(rulesOk, '规则 B3/S23：3 个邻居出生，2 或 3 个邻居存活，其余死亡（18 种情况逐一核对）');
  var wrap = new Uint8Array(36); wrap[0] = wrap[5] = wrap[30] = 1;                      // 三个角隔着边界相邻
  var wout = new Uint8Array(36); S.lifeStep(wrap, wout, 6, 6);
  ok(wout[35] === 1, '边界环绕：三个角上的细胞让第四个角出生');

  var gl = world(20, 20, S.LIFE.glider, 5, 5), gl4 = run(gl, 20, 20, 4).g;
  ok(shifted(gl4, gl, 20, 20, 1, 1) && !same(run(gl, 20, 20, 2).g, gl), '滑翔机：4 代后整体向右下平移一格');
  var gl80 = run(gl, 20, 20, 80).g;
  ok(same(gl80, gl), '滑翔机在 20×20 的环面上 80 代后回到原位（4×20）');
  var lw = world(30, 20, S.LIFE.lwss, 12, 8);
  ok(count(lw) === 9 && shifted(run(lw, 30, 20, 4).g, lw, 30, 20, -2, 0), '轻型飞船：9 个细胞，4 代后整体向左平移两格');
  var pu = world(21, 21, S.LIFE.pulsar, 4, 4);
  ok(count(pu) === 48 && !same(run(pu, 21, 21, 1).g, pu) && !same(run(pu, 21, 21, 2).g, pu) && same(run(pu, 21, 21, 3).g, pu), '脉冲星：48 个细胞，周期恰好为 3');

  // 滑翔机枪：单独放在大棋盘上，每 30 代多出一架滑翔机（5 个细胞）
  var gun = world(120, 120, S.LIFE.gun, 10, 10), pops = [30, 60, 90, 120].map(function (t) { return run(gun, 120, 120, t).pop; });
  ok(count(gun) === 36 && pops.join(',') === '41,46,51,56', '滑翔机枪：36 个细胞，每 30 代发射一架滑翔机', '第 30/60/90/120 代细胞数 ' + pops.join('/'));
  // 枪 + 吞噬者：在各种尺寸的环面上都以周期 30 一直运转
  var dims = [[38, 20], [38, 35], [43, 38], [50, 33], [41, 50], [41, 64], [39, 44], [47, 60], [70, 76], [20, 38], [24, 60], [33, 50]], gunOk = true, gunDetail = [];
  dims.forEach(function (d) {
    var cols = d[0], rows = d[1], cells = S.lifeGunCells(cols, rows);
    if (!cells) { gunOk = false; gunDetail.push(d.join('×') + ' 放不下'); return; }
    var g = new Uint8Array(cols * rows); S.lifePlace(g, cols, rows, cells, 0, 0);
    var a = run(g, cols, rows, 900).g, b = run(a, cols, rows, 30).g, c = run(a, cols, rows, 15).g;
    var intact = SIM_gunIntact(a, cols, rows);
    if (!same(a, b) || same(a, c) || !intact) { gunOk = false; gunDetail.push(d.join('×') + ' 不稳定'); }
  });
  function SIM_gunIntact(a, cols, rows) {
    var lay = S.lifeGunLayout(cols, rows), okk = true;
    S.LIFE.gun.forEach(function (row, y) { for (var x = 0; x < row.length; x++) { var X = lay.transpose ? y + 1 : x + 1, Y = lay.transpose ? x + 1 : y + 1; if (a[Y * cols + X] !== (row.charAt(x) === 'O' ? 1 : 0)) okk = false; } });
    return okk;
  }
  ok(gunOk, '滑翔机枪 + 吞噬者：12 种棋盘尺寸上 900 代后仍是周期 30、枪完好', gunDetail.join('；'));
  ok(S.lifeGunLayout(37, 37) === null && S.lifeGunLayout(30, 60) !== null && S.lifeGunLayout(60, 19) === null, '棋盘太小时不提供滑翔机枪');

  // R 五格
  // 600×600 的环面足够大：飞出去的滑翔机要到第 1358 代才绕回来撞上残骸，之前和无限大棋盘完全一样
  var BIG = 600, big = world(BIG, BIG, S.LIFE.rpent, BIG / 2 - 1, BIG / 2 - 1), a2 = Uint8Array.from(big), b2 = new Uint8Array(a2.length), popAt = {}, t;
  for (t = 1; t <= 1300; t++) { popAt[t] = S.lifeStep(a2, b2, BIG, BIG); var tmp = a2; a2 = b2; b2 = tmp; }
  var stable = true;
  for (t = 1103; t <= 1300; t++) if (popAt[t] !== 116) stable = false;
  ok(stable && popAt[1102] !== 116, 'R 五格在大棋盘（600×600）上：第 1103 代起细胞数稳定在 116，第 1102 代还不是', '第 1102 代 ' + popAt[1102] + ' 个');
  var small = world(40, 40, S.LIFE.rpent, 19, 19), fate = S.lifeFate(small, 40, 40, 5000);
  ok(fate.mu === 663 && fate.lambda === 2, 'R 五格在 40×40 的环面上：折腾 663 代后进入周期 2 的循环', JSON.stringify(fate));
  var gfate = S.lifeFate(world(40, 40, S.LIFE.glider, 5, 5), 40, 40, 5000);
  ok(gfate.mu === 0 && gfate.lambda === 160, '滑翔机在 40×40 的环面上：从第 0 代起就在循环，周期 160');
  var one = new Uint8Array(1600); one[820] = 1;
  var ofate = S.lifeFate(one, 40, 40, 100);
  ok(ofate.mu === 1 && ofate.lambda === 1 && ofate.pop === 0, '孤零零一个细胞：第 1 代就全灭');
  // 五格挑战（40×40 环面）里几个有代表性的开局
  function mu5(pat) { return S.lifeFate(world(40, 40, pat, 18, 18), 40, 40, 5000).mu; }
  var mus = [mu5(['OOO', '.O.', '.O.']), mu5(['.O.', 'OOO', '.O.']), mu5(['OOOOO']), mu5(['O.', 'O.', 'O.', 'OO']), mu5(['OO.', '..O', '..O', '..O']), mu5(['OO', 'O.', 'O.', '.O'])];
  ok(mus.join(',') === '10,6,6,9,665,249', '五格挑战：T 形 10 代、十字 6 代、一字 6 代、L 形 9 代；R 五格的“前身”665 代；另一个长寿图案 249 代', mus.join(' / '));
})();

/* ---------------------------------------------------------------- 五格挑战的穷举（慢，默认不跑） */
if (process.argv.indexOf('--census') >= 0) (function () {
  section('五格挑战穷举（--census，约三四分钟）');
  // 40×40 环面，中间 8×8 的编辑区里所有 5 格摆法；按平移 + 旋转 + 翻转去重，逐个算“折腾了几代”
  var N = 40, B = 8, K = 5, A = new Uint8Array(N * N), Bf = new Uint8Array(N * N);
  function fate(cells) {
    A.fill(0);
    var a = A, b = Bf, o = (N - B) / 2, seen = new Map(), pop;
    cells.forEach(function (c) { a[(o + c[1]) * N + o + c[0]] = 1; });
    seen.set(S.lifeKey(a), 0);
    for (var t = 1; t <= 20000; t++) {
      pop = S.lifeStep(a, b, N, N);
      var tmp = a; a = b; b = tmp;
      if (pop === 0) return t;
      var k = S.lifeKey(a);
      if (seen.has(k)) return seen.get(k);
      seen.set(k, t);
    }
    return 20000;
  }
  function canon(cells) {
    var best = null;
    for (var s = 0; s < 8; s++) {
      var pts = cells.map(function (c) { var x = c[0], y = c[1], t; if (s & 1) x = -x; if (s & 2) y = -y; if (s & 4) { t = x; x = y; y = t; } return [x, y]; });
      var mx = Infinity, my = Infinity;
      pts.forEach(function (q) { if (q[0] < mx) mx = q[0]; if (q[1] < my) my = q[1]; });
      var ks = pts.map(function (q) { return (q[1] - my) * 16 + (q[0] - mx); }).sort(function (p, q) { return p - q; }).join(',');
      if (best === null || ks < best) best = ks;
    }
    return best;
  }
  var seenPat = new Set(), raw = 0, distinct = 0, le5 = 0, ge6 = 0, ge10 = 0, gt12 = 0, gt200 = 0, max = 0;
  (function rec(start, chosen) {
    if (chosen.length === K) {
      raw++;
      var cells = chosen.map(function (i) { return [i % B, (i / B) | 0]; }), c = canon(cells);
      if (seenPat.has(c)) return;
      seenPat.add(c);
      var m = fate(cells);
      distinct++;
      if (m <= 5) le5++; else ge6++;
      if (m >= 10) ge10++;
      if (m > 12) gt12++;
      if (m > 200) gt200++;
      if (m > max) max = m;
      return;
    }
    for (var i = start; i < B * B; i++) rec(i + 1, chosen.concat(i));
  })(0, []);
  ok(raw === 7624512 && distinct === 237459, '8×8 里摆 5 个格子：共 7,624,512 种摆法，去掉平移 / 旋转 / 翻转后 237,459 种', raw + ' / ' + distinct);
  ok(le5 === 237156 && ge6 === 303, '五代之内就定型的 237,156 种（99.87%），撑过五代的 303 种', le5 + ' / ' + ge6);
  ok(ge10 === 183 && gt12 === 11 && gt200 === 11 && max === 665, '撑到 10 代以上的 183 种；撑过 12 代的只有 11 种，而且都超过 200 代；最长 665 代', ge10 + ' / ' + gt12 + ' / ' + gt200 + ' / ' + max);
})();

/* ---------------------------------------------------------------- 排序 */
section('排序');
(function () {
  var names = { bubble: '冒泡', selection: '选择', insertion: '插入', quick: '快速', merge: '归并' };
  function isSorted(a) { for (var i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false; return true; }
  S.SORT_KEYS.forEach(function (key) {
    var rnd = rng('sort-' + key), allOk = true, replayOk = true, cmpOk = true;
    for (var t = 0; t < 1000; t++) {
      var n = 1 + Math.floor(rnd() * 60), arr = [], i;
      if (t % 3 === 0) for (i = 0; i < n; i++) arr.push(Math.floor(rnd() * 10));          // 有重复值
      else arr = JN.util.shuffle(JN.util.range(n).map(function (v) { return v + 1; }), rnd);
      if (t === 0) arr = []; if (t === 1) arr = [5]; if (t === 2) arr = JN.util.range(30); if (t === 4) arr = JN.util.range(30).reverse();
      var tr = S.sortTrace(key, arr), want = arr.slice().sort(function (p, q) { return p - q; });
      if (!isSorted(tr.result) || tr.result.join(',') !== want.join(',')) allOk = false;
      var b = arr.slice(), cmps = 0;
      for (i = 0; i < tr.ops.length; i += 3) { if (tr.ops[i] === S.OP.CMP) cmps++; else S.sortApply(b, tr.ops[i], tr.ops[i + 1], tr.ops[i + 2]); }
      if (b.join(',') !== want.join(',')) replayOk = false;
      if (cmps !== tr.comparisons) cmpOk = false;
    }
    ok(allOk && replayOk && cmpOk, names[key] + '排序：一千组随机数据（含空数组、重复值、已排好、倒序）结果正确，按录像回放也得到同样结果');
  });
  // 比较次数与理论值
  var n = 40, trials = 4000, rnd = rng('sort-theory');
  var sums = {}, mins = {}, maxs = {};
  S.SORT_KEYS.forEach(function (k) { sums[k] = 0; mins[k] = Infinity; maxs[k] = 0; });
  for (var t = 0; t < trials; t++) {
    var arr = JN.util.shuffle(JN.util.range(n), rnd);
    S.SORT_KEYS.forEach(function (k) { var c = S.sortTrace(k, arr).comparisons; sums[k] += c; mins[k] = Math.min(mins[k], c); maxs[k] = Math.max(maxs[k], c); });
  }
  ok(mins.bubble === 780 && maxs.bubble === 780 && mins.selection === 780 && maxs.selection === 780, '40 根柱子：冒泡、选择每次都恰好比较 n(n−1)/2 = 780 次');
  ['insertion', 'quick', 'merge'].forEach(function (k) {
    var th = S.sortTheory(k, n).mean, m = sums[k] / trials;
    ok(near(m, th, th * 0.012), names[k] + '排序：4000 组数据平均比较 ' + m.toFixed(1) + ' 次，理论 ' + th.toFixed(1) + ' 次（相差 < 1.2%）');
  });
  ok(near(S.sortTheory('quick', 40).mean, 190.84, 0.01) && near(S.sortTheory('merge', 40).mean, 165.1, 0.1) && near(S.sortTheory('insertion', 40).mean, 425.72, 0.01), '理论值（n=40）：插入 ≈ 425.7，快速 ≈ 190.8，归并 ≈ 165.1');
  var r40 = S.sortTheory('bubble', 40).mean / S.sortTheory('quick', 40).mean, bub400 = S.sortTheory('bubble', 400).mean / 780, q400 = S.sortTheory('quick', 400).mean / S.sortTheory('quick', 40).mean;
  ok(near(r40, 4.09, 0.01) && near(bub400, 102.3, 0.1) && near(q400, 19.2, 0.1), '冒泡是快速的 ' + r40.toFixed(2) + ' 倍（40 根）；柱子变 10 倍，冒泡要多比 ' + bub400.toFixed(1) + ' 倍，快速只多 ' + q400.toFixed(1) + ' 倍');
})();

/* ---------------------------------------------------------------- 生日悖论 */
section('生日悖论');
(function () {
  ok(S.birthdayTheory(23).toFixed(4) === '0.5073', '理论值 n=23：0.5073', S.birthdayTheory(23).toFixed(6));
  ok(S.birthdayTheory(40).toFixed(4) === '0.8912', '理论值 n=40：0.8912', S.birthdayTheory(40).toFixed(6));
  ok(S.birthdayTheory(22) < 0.5 && S.birthdayTheory(23) > 0.5, '23 是第一个让概率超过一半的人数', 'P(22)=' + S.birthdayTheory(22).toFixed(4));
  ok(S.birthdayTheory(1) === 0 && S.birthdayTheory(2).toFixed(5) === (1 / 365).toFixed(5) && S.birthdayTheory(366) === 1 && S.birthdayTheory(70).toFixed(4) === '0.9992' && S.birthdayTheory(30).toFixed(3) === '0.706', '边界：1 人为 0，2 人为 1/365，366 人为 1；30 人 0.706，70 人 0.9992');
  ok(near(1 - Math.pow(364 / 365, 22), 0.0586, 0.0001) && 23 * 22 / 2 === 253, '“有人和我同一天”只有 5.9%；23 人能配出 253 对');
  [23, 40, 10].forEach(function (n) {
    var rnd = rng('bday-' + n), N = 100000, hit = 0, out = new Int16Array(n), bad = 0;
    for (var i = 0; i < N; i++) {
      var h = S.birthdayRoom(rnd, n, out);
      if (h) hit++;
      if (i < 2000) {                                   // 抽查：返回值与逐对比较一致，日子都在 0…364
        var dup = false;
        for (var a = 0; a < n; a++) { if (out[a] < 0 || out[a] > 364) bad++; for (var b = a + 1; b < n; b++) if (out[a] === out[b]) dup = true; }
        if (dup !== h) bad++;
      }
    }
    ok(bad === 0 && near(hit / N, S.birthdayTheory(n), 0.006), '模拟十万屋（' + n + ' 人）：' + (hit / N).toFixed(4) + '，理论 ' + S.birthdayTheory(n).toFixed(4));
  });
  var total = 0; S.MONTH_DAYS.forEach(function (d) { total += d; });
  var d0 = S.dayToDate(0), d58 = S.dayToDate(58), d59 = S.dayToDate(59), d364 = S.dayToDate(364);
  ok(total === 365 && d0.join('/') === '0/1' && d58.join('/') === '1/28' && d59.join('/') === '2/1' && d364.join('/') === '11/31', '日历：365 天，第 0 天是 1 月 1 日，第 364 天是 12 月 31 日');
})();

console.log('\nsim 数学测试：' + pass + ' 项通过，' + fail + ' 项失败');
process.exit(fail ? 1 : 0);
