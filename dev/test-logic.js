#!/usr/bin/env node
/* 锦囊 · G1（逻辑与数字）组件的正确性测试
 * 用法：node dev/test-logic.js
 * 把 js/core.js 和 js/widgets/logic.js 装进一个假的 window，只测 JN._logic 里的纯逻辑。
 * 每一项都尽量用“另一种算法”来对照（穷举、暴力回溯、广度优先），而不是把同一段代码再跑一遍。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const box = vm.createContext({ console });
box.window = box;
for (const f of ['js/core.js', 'js/widgets/logic.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), box, { filename: f });
}
const JN = box.JN;
const L = JN._logic;
const U = JN.util;

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（得到 ' + JSON.stringify(a) + '，应为 ' + JSON.stringify(b) + '）'); }
function section(name) { console.log('\n== ' + name); }
const rnd = U.rng('g1-test');

/* ---------- 小工具：精确分数的算式求值（给 24 点用，独立于组件里的实现） ---------- */
function gcdB(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
function evalExpr(src) {
  const toks = src.replace(/\s+/g, '').match(/\d+|[+−×÷()]/g);
  let i = 0;
  const num = (n, d) => { if (d === 0n) throw new Error('÷0'); if (d < 0n) { n = -n; d = -d; } const g = gcdB(n, d) || 1n; return [n / g, d / g]; };
  function atom() {
    const t = toks[i++];
    if (t === '(') { const v = sum(); if (toks[i++] !== ')') throw new Error('括号不配对'); return v; }
    return num(BigInt(t), 1n);
  }
  function prod() {
    let v = atom();
    while (toks[i] === '×' || toks[i] === '÷') {
      const op = toks[i++], w = atom();
      v = op === '×' ? num(v[0] * w[0], v[1] * w[1]) : num(v[0] * w[1], v[1] * w[0]);
    }
    return v;
  }
  function sum() {
    let v = prod();
    while (toks[i] === '+' || toks[i] === '−') {
      const op = toks[i++], w = prod();
      v = op === '+' ? num(v[0] * w[1] + w[0] * v[1], v[1] * w[1]) : num(v[0] * w[1] - w[0] * v[1], v[1] * w[1]);
    }
    return v;
  }
  const v = sum();
  if (i !== toks.length) throw new Error('算式没读完：' + src);
  return v;
}
const numsIn = (expr) => (expr.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
const sorted = (a) => a.slice().sort((x, y) => x - y);

/* ====================================================================== */
section('make24 · 算 24 点');
{
  // 四道经典难题
  const classics = [[3, 3, 8, 8], [1, 5, 5, 5], [4, 4, 10, 10], [1, 3, 4, 6]];
  for (const nums of classics) {
    const s = L.make24.solve(nums);
    ok(!!s, nums.join(' ') + ' 应该有解');
    if (!s) continue;
    const v = evalExpr(s.expr);
    ok(v[0] === 24n && v[1] === 1n, nums.join(' ') + ' 的解 ' + s.expr + ' 应等于 24');
    eq(numsIn(s.expr), sorted(nums), nums.join(' ') + ' 的解四张牌各用一次');
    console.log('  ' + nums.join(' ') + '  →  ' + s.expr + ' = 24');
  }
  // 3388、1555、1346 必须经过分数；4 4 10 10 有全整数的走法
  ok(L.make24.grade([3, 3, 8, 8]).plain === 0, '3 3 8 8 没有全整数的走法');
  ok(L.make24.grade([1, 5, 5, 5]).plain === 0, '1 5 5 5 没有全整数的走法');
  ok(L.make24.grade([1, 3, 4, 6]).plain === 0, '1 3 4 6 没有全整数的走法');
  ok(L.make24.grade([4, 4, 10, 10]).plain > 0, '4 4 10 10 有全整数的走法');
  eq(L.make24.solve([3, 3, 8, 8]).expr, '8 ÷ (3 − 8 ÷ 3)', '3 3 8 8 的解法');
  ok(L.make24.solve([1, 1, 1, 1]) === null, '1 1 1 1 无解');
  ok(L.make24.solve([1, 1, 1, 2]) === null, '1 1 1 2 无解（最大只能凑出 6）');
  eq(L.make24.solve([1, 1, 1, 13]).expr, '(1 + 1) × (13 − 1)', '1 1 1 13 的解法');
  for (const lv of ['easy', 'normal', 'hard']) {
    const cfg = L.make24.levels[lv], g = L.make24.grade(cfg.fallback);
    ok(g.all > 0 && g.plain >= cfg.lo && g.plain < cfg.hi && cfg.fallback.every((n) => n <= cfg.max), lv + ' 档的保底题落在本档里');
  }

  // 另一种算法：四个数的全排列 × 三个运算符 × 五种加括号方式，用整数分子分母精确计算
  const OPS = [
    (a, b) => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]],
    (a, b) => [a[0] * b[1] - b[0] * a[1], a[1] * b[1]],
    (a, b) => [a[0] * b[0], a[1] * b[1]],
    (a, b) => [a[0] * b[1], a[1] * b[0]]
  ];
  const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i)).map((p) => [x].concat(p)));
  function bruteSolvable(nums) {
    for (const p of perms(nums)) {
      const [a, b, c, d] = p.map((n) => [n, 1]);
      for (const f of OPS) for (const g of OPS) for (const h of OPS) {
        const outs = [h(g(f(a, b), c), d), h(f(a, g(b, c)), d), g(f(a, b), h(c, d)), f(a, h(g(b, c), d)), f(a, g(b, h(c, d)))];
        for (const r of outs) if (r[1] !== 0 && !Number.isNaN(r[0]) && r[0] === 24 * r[1]) return true;
      }
    }
    return false;
  }
  let total = 0, solvable = 0, mismatch = 0, badExpr = 0, needFrac = 0;
  for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) for (let c = b; c <= 13; c++) for (let d = c; d <= 13; d++) {
    total++;
    const nums = [a, b, c, d];
    const s = L.make24.solve(nums);
    if (s) {
      solvable++;
      const v = evalExpr(s.expr);
      if (!(v[0] === 24n && v[1] === 1n) || JSON.stringify(numsIn(s.expr)) !== JSON.stringify(nums)) badExpr++;
      // 把步骤一步步重放一遍，最后必须剩一张 24
      const hand = L.make24.items(nums);
      for (const st of s.steps) {
        const x = hand.find((h) => h && h.id === st.a), y = hand.find((h) => h && h.id === st.b);
        const r = L.make24.combine(x, st.op, y); r.id = st.b;
        hand[hand.indexOf(x)] = null; hand[hand.indexOf(y)] = r;
      }
      const left = hand.filter(Boolean);
      if (left.length !== 1 || !L.frac.is(left[0].v, 24)) badExpr++;
      if (L.make24.grade(nums).plain === 0) needFrac++;
    }
    if (!!s !== bruteSolvable(nums)) mismatch++;
  }
  eq(total, 1820, '1–13 四张牌的组合数');
  eq(solvable, 1362, '其中有解的组合数（公认结果 1362）');
  eq(mismatch, 0, '与“全排列×五种括号”的暴力算法逐题对照，不一致的题数');
  eq(badExpr, 0, '给出的算式或步骤算不出 24 的题数');
  console.log('  1820 种组合里 ' + solvable + ' 种有解；其中 ' + needFrac + ' 种必须经过分数或负数');

  // 随机发牌：三档都必须有解，而且落在各自的难度档里
  for (const lv of ['easy', 'normal', 'hard']) {
    const cfg = L.make24.levels[lv];
    let bad = 0;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const nums = L.make24.deal(lv, rnd);
      const g = L.make24.grade(nums);
      seen.add(nums.join(','));
      if (nums.length !== 4 || nums.some((n) => n < 1 || n > cfg.max) || g.all === 0 || g.plain < cfg.lo || g.plain >= cfg.hi) bad++;
    }
    eq(bad, 0, lv + ' 档发出的 300 手牌里不合格的手数');
    ok(seen.size >= 40, lv + ' 档发牌够多样（300 手里有 ' + seen.size + ' 种）');
  }
  // 残局提示：1 5 5 5 先算 1÷5 之后，剩下的三张仍然有解；先算 5+5 就没救了
  const A = L.make24.atom;
  const mk = (arr) => arr.map((x, i) => Object.assign({ id: i }, x));
  ok(L.make24.solveItems(mk([L.make24.combine(A(1), '/', A(5)), A(5), A(5)]), 24) !== null, '1÷5、5、5 还能算出 24');
  ok(L.make24.solveItems(mk([L.make24.combine(A(5), '+', A(5)), A(1), A(5)]), 24) === null, '10、1、5 算不出 24');
  ok(L.make24.combine(A(5), '/', L.make24.combine(A(3), '-', A(3))) === null, '除以 0 被拒绝');
  eq(L.frac.str(L.frac.op('/', L.frac.make(8), L.frac.make(3))), '8/3', '分数显示');
  eq(L.frac.str(L.frac.op('-', L.frac.make(1), L.frac.make(5))), '−4', '负数显示');
}

/* ====================================================================== */
section('bulls · 猜数字');
{
  eq(L.bulls.score('1234', '1234'), { a: 4, b: 0 }, '全中');
  eq(L.bulls.score('1234', '4321'), { a: 0, b: 4 }, '全错位');
  eq(L.bulls.score('1234', '5678'), { a: 0, b: 0 }, '全不沾边');
  eq(L.bulls.score('0123', '0231'), { a: 1, b: 3 }, '0 打头');
  eq(L.bulls.score('5281', '5812'), { a: 1, b: 3 }, '一般情况');
  ok(L.bulls.valid('0123') && !L.bulls.valid('1123') && !L.bulls.valid('123') && !L.bulls.valid('12a4'), '合法性检查');
  let bad = 0;
  for (let i = 0; i < 20000; i++) {
    const s = L.bulls.secret(rnd), g = L.bulls.secret(rnd);
    const sc = L.bulls.score(s, g);
    let a = 0, common = 0;
    for (let k = 0; k < 4; k++) { if (s[k] === g[k]) a++; if (s.includes(g[k])) common++; }
    const back = L.bulls.score(g, s);
    if (!L.bulls.valid(s) || sc.a !== a || sc.b !== common - a || back.a !== sc.a || back.b !== sc.b) bad++;
  }
  eq(bad, 0, '两万组随机题与独立算法对照，不一致的组数');
  // 判分自洽：每次都猜“与之前所有反馈不矛盾”的第一个数，一定能猜中
  const all = [];
  for (let n = 0; n < 10000; n++) { const s = String(n).padStart(4, '0'); if (L.bulls.valid(s)) all.push(s); }
  eq(all.length, 5040, '四位不重复数字共 5040 个');
  let worst = 0;
  for (let game = 0; game < 200; game++) {
    const secret = L.bulls.secret(rnd);
    let cands = all, turns = 0;
    for (;;) {
      const g = cands[0];
      const sc = L.bulls.score(secret, g);
      turns++;
      if (sc.a === 4) break;
      cands = cands.filter((c) => { const t = L.bulls.score(c, g); return t.a === sc.a && t.b === sc.b; });
      if (!cands.length || turns > 20) { turns = 99; break; }
    }
    worst = Math.max(worst, turns);
  }
  ok(worst <= 10, '按反馈筛选一定能猜中（200 局里最多用了 ' + worst + ' 次）');
}

/* ====================================================================== */
section('nim · 取石子');
{
  // —— 一堆：动态规划算出每个 n 的胜负，再与策略对照 ——
  for (const last of ['win', 'lose']) {
    const MAX = 3, TOP = 60;
    const win = [false];     // win[n]：轮到你、还剩 n 颗，你能不能必胜（n=0 不会用到）
    for (let n = 1; n <= TOP; n++) {
      let w = false;
      for (let k = 1; k <= Math.min(MAX, n); k++) {
        const rest = n - k;
        const iWin = rest === 0 ? last === 'win' : !win[rest];
        if (iWin) w = true;
      }
      win[n] = w;
    }
    let bad = 0;
    for (let n = 1; n <= TOP; n++) {
      const m = L.nim.takeMove(n, MAX, last);
      if (m.winning !== win[n] || m.take < 1 || m.take > Math.min(MAX, n)) bad++;
    }
    eq(bad, 0, '抢 21（' + last + '）：策略判断的必胜/必输与动态规划不一致的局面数');
    // 穷举：电脑先手处在必胜局面，对手怎么拿，电脑都赢
    const memo = new Map();
    function aiWins(n) {     // 轮到电脑，还剩 n 颗
      if (memo.has(n)) return memo.get(n);
      const t = L.nim.takeMove(n, MAX, last).take;
      let res;
      if (n - t === 0) res = last === 'win';
      else {
        res = true;
        for (let k = 1; k <= Math.min(MAX, n - t); k++) {
          const rest = n - t - k;
          if (rest === 0) { if (last === 'win') res = false; }       // 对手拿到最后一颗
          else if (!aiWins(rest)) res = false;
        }
      }
      memo.set(n, res);
      return res;
    }
    let lost = 0, winCount = 0;
    for (let n = 1; n <= TOP; n++) if (win[n]) { winCount++; if (!aiWins(n)) lost++; }
    eq(lost, 0, '抢 21（' + last + '）：' + winCount + ' 个必胜局面里电脑会输的个数');
  }
  eq(L.nim.takeMove(21, 3, 'win'), { take: 1, winning: true }, '21 颗、拿最后一颗赢：先手拿 1 颗必胜');
  ok(L.nim.takeMove(21, 3, 'lose').winning === false, '21 颗、拿最后一颗输：先手必输');
  ok(L.nim.takeMove(20, 3, 'lose').take === 3, '20 颗、拿最后一颗输：拿 3 颗留 17');

  // —— 多堆：0..7 三堆共 512 个局面 ——
  for (const last of ['win', 'lose']) {
    const key = (h) => h.join(',');
    const memo = new Map();
    function wins(h) {       // 轮到你，局面 h，能不能必胜
      const k = key(h);
      if (memo.has(k)) return memo.get(k);
      let w = false;
      for (let i = 0; i < 3 && !w; i++) for (let t = 1; t <= h[i] && !w; t++) {
        const nh = h.slice(); nh[i] -= t;
        const empty = nh.every((x) => x === 0);
        if (empty ? last === 'win' : !wins(nh)) w = true;
      }
      memo.set(k, w);
      return w;
    }
    const aiMemo = new Map();
    function aiWins(h) {     // 轮到电脑，照策略走，对手任意应对，电脑是否必胜
      const k = key(h);
      if (aiMemo.has(k)) return aiMemo.get(k);
      const m = L.nim.heapMove(h, last);
      const nh = h.slice(); nh[m.heap] -= m.take;
      let res;
      if (nh.every((x) => x === 0)) res = last === 'win';
      else {
        res = true;
        for (let i = 0; i < 3; i++) for (let t = 1; t <= nh[i]; t++) {
          const oh = nh.slice(); oh[i] -= t;
          if (oh.every((x) => x === 0)) { if (last === 'win') res = false; }
          else if (!aiWins(oh)) res = false;
        }
      }
      aiMemo.set(k, res);
      return res;
    }
    let bad = 0, lost = 0, winCount = 0, illegal = 0;
    for (let a = 0; a <= 7; a++) for (let b = 0; b <= 7; b++) for (let c = 0; c <= 7; c++) {
      if (a + b + c === 0) continue;
      const h = [a, b, c];
      const m = L.nim.heapMove(h, last);
      if (!m || m.take < 1 || m.take > h[m.heap]) { illegal++; continue; }
      if (m.winning !== wins(h)) bad++;
      if (wins(h)) { winCount++; if (!aiWins(h)) lost++; }
    }
    eq(illegal, 0, '多堆（' + last + '）：不合法的走法数');
    eq(bad, 0, '多堆（' + last + '）：策略判断与穷举不一致的局面数');
    eq(lost, 0, '多堆（' + last + '）：' + winCount + ' 个必胜局面里电脑会输的个数');
    ok(wins([3, 5, 7]), '3、5、7 开局先手必胜（' + last + '）');
  }
  eq(L.nim.heapMove([3, 5, 7], 'win').take, 1, '3、5、7：先手拿走 1 颗');
  // 放水：ease=0 永远走最优；ease=1 走的也必须合法；收尾时不放水
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const n = U.randInt(1, 21, rnd), last = rnd() < 0.5 ? 'win' : 'lose';
    const best = L.nim.takeMove(n, 3, last);
    const strict = L.nim.aiTake(n, 3, last, 0, rnd), loose = L.nim.aiTake(n, 3, last, 1, rnd);
    if (strict.take !== best.take || loose.take < 1 || loose.take > Math.min(3, n)) bad++;
    if (n <= 5 && loose.take !== best.take) bad++;
    const h = [U.randInt(0, 3, rnd), U.randInt(0, 5, rnd), U.randInt(0, 7, rnd)];
    if (h[0] + h[1] + h[2] === 0) continue;
    const hb = L.nim.heapMove(h, last), hs = L.nim.aiHeap(h, last, 0, rnd), hl = L.nim.aiHeap(h, last, 1, rnd);
    if (hs.heap !== hb.heap || hs.take !== hb.take || hl.take < 1 || hl.take > h[hl.heap]) bad++;
  }
  eq(bad, 0, '放水参数：不合法或不符合约定的走法数');
}

/* ====================================================================== */
section('hanoi · 汉诺塔');
{
  for (let n = 1; n <= 8; n++) {
    const moves = L.hanoi.solve(n, 0, 1, 2);
    const pegs = [[], [], []];
    for (let d = n; d >= 1; d--) pegs[0].push(d);
    let legal = true;
    for (const [f, t] of moves) {
      const d = pegs[f].pop();
      if (d == null || (pegs[t].length && pegs[t][pegs[t].length - 1] < d)) legal = false;
      pegs[t].push(d);
    }
    ok(legal && pegs[2].length === n && moves.length === Math.pow(2, n) - 1 && L.hanoi.minMoves(n) === moves.length,
      n + ' 层：最优解合法、搬完、正好 2^n − 1 = ' + (Math.pow(2, n) - 1) + ' 步');
  }
  // 广度优先搜出每个局面到“全在某根柱子上”的真实最短距离，与 plan() 对照
  for (let n = 3; n <= 6; n++) {
    const total = Math.pow(3, n);
    const decode = (code) => { const pos = [0]; for (let d = 1; d <= n; d++) { pos[d] = code % 3; code = Math.floor(code / 3); } return pos; };
    const encode = (pos) => { let c = 0; for (let d = n; d >= 1; d--) c = c * 3 + pos[d]; return c; };
    const neighbours = (pos) => {
      const top = [0, 0, 0];
      for (let d = n; d >= 1; d--) top[pos[d]] = d;      // 每根柱子最上面（最小）的盘
      const out = [];
      for (let f = 0; f < 3; f++) for (let t = 0; t < 3; t++) {
        if (f === t || !top[f] || (top[t] && top[t] < top[f])) continue;
        const np = pos.slice(); np[top[f]] = t; out.push(np);
      }
      return out;
    };
    let bad = 0, badHint = 0;
    for (let target = 0; target < 3; target++) {
      const dist = new Array(total).fill(-1);
      const goal = [0]; for (let d = 1; d <= n; d++) goal[d] = target;
      const q = [encode(goal)]; dist[q[0]] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        for (const nb of neighbours(decode(q[qi]))) { const c = encode(nb); if (dist[c] < 0) { dist[c] = dist[q[qi]] + 1; q.push(c); } }
      }
      for (let code = 0; code < total; code++) {
        const pos = decode(code), p = L.hanoi.plan(pos, n, target);
        if (p.dist !== dist[code]) { bad++; continue; }
        if (p.dist > 0) {
          // 照提示走一步，距离必须正好减 1，而且这一步合法
          const m = p.move, np = pos.slice();
          const legal = neighbours(pos).some((x) => x[m.disc] === m.to && pos[m.disc] === m.from);
          np[m.disc] = m.to;
          if (!legal || dist[encode(np)] !== dist[code] - 1) badHint++;
        }
      }
    }
    eq(bad, 0, n + ' 层：' + total + ' 个局面 × 3 个目标，plan() 的步数与广度优先不一致的个数');
    eq(badHint, 0, n + ' 层：提示的那一步不合法或没有更近的个数');
    const start = [0]; for (let d = 1; d <= n; d++) start[d] = 0;
    eq(L.hanoi.hint(start, n, 0).dist, Math.pow(2, n) - 1, n + ' 层：开局提示的步数');
  }
}

/* ====================================================================== */
section('sudoku · 迷你数独');
{
  // 独立的暴力解法：按顺序逐格试 1..n，数出全部解
  function bruteCount(g, n, br, bc, limit) {
    const at = g.indexOf(0);
    if (at < 0) return 1;
    const r = Math.floor(at / n), c = at % n;
    let total = 0;
    for (let v = 1; v <= n && total < limit; v++) {
      let fine = true;
      for (let i = 0; i < n && fine; i++) if (g[r * n + i] === v || g[i * n + c] === v) fine = false;
      const r0 = r - (r % br), c0 = c - (c % bc);
      for (let i = 0; i < br && fine; i++) for (let j = 0; j < bc; j++) if (g[(r0 + i) * n + c0 + j] === v) fine = false;
      if (!fine) continue;
      g[at] = v;
      total += bruteCount(g, n, br, bc, limit - total);
      g[at] = 0;
    }
    return total;
  }
  function validSolution(s, n, br, bc) {
    const full = (cells) => cells.map((i) => s[i]).sort((a, b) => a - b).join('') === Array.from({ length: n }, (_, i) => i + 1).join('');
    for (let k = 0; k < n; k++) {
      if (!full(Array.from({ length: n }, (_, i) => k * n + i))) return false;
      if (!full(Array.from({ length: n }, (_, i) => i * n + k))) return false;
    }
    for (let r0 = 0; r0 < n; r0 += br) for (let c0 = 0; c0 < n; c0 += bc) {
      const cells = [];
      for (let i = 0; i < br; i++) for (let j = 0; j < bc; j++) cells.push((r0 + i) * n + c0 + j);
      if (!full(cells)) return false;
    }
    return true;
  }
  for (const size of [4, 6]) {
    const sh = L.sudoku.shape(size);
    for (const lv of ['easy', 'normal', 'hard']) {
      const want = L.sudoku.givens[size][lv];
      let bad = 0, minG = 99, maxG = 0, sumG = 0;
      const ROUNDS = 200;
      for (let i = 0; i < ROUNDS; i++) {
        const p = L.sudoku.generate(size, rnd, want);
        const givens = p.puzzle.filter(Boolean).length;
        minG = Math.min(minG, givens); maxG = Math.max(maxG, givens); sumG += givens;
        const subset = p.puzzle.every((v, k) => v === 0 || v === p.solution[k]);
        const uniq = bruteCount(p.puzzle.slice(), sh.n, sh.br, sh.bc, 3) === 1;
        const uniq2 = L.sudoku.count(p.puzzle, size, 3) === 1;
        const clean = L.sudoku.conflicts(p.solution, size).length === 0;
        if (!subset || !uniq || !uniq2 || !clean || !validSolution(p.solution, sh.n, sh.br, sh.bc) || givens !== p.givens || givens < want) bad++;
      }
      eq(bad, 0, size + '×' + size + ' ' + lv + '：' + ROUNDS + ' 题里不是唯一解或终盘不合法的题数');
      console.log('  ' + size + '×' + size + ' ' + lv + '：已知数 ' + minG + '–' + maxG + '，平均 ' + (sumG / ROUNDS).toFixed(1) + '（目标 ' + want + '）');
    }
  }
  const sh6 = L.sudoku.shape(6);
  ok(sh6.br === 2 && sh6.bc === 3 && L.sudoku.shape(4).bc === 2, '宫的形状：6×6 是两行三列，4×4 是 2×2');
  const clash = L.sudoku.conflicts([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4);
  ok(clash[0] && clash[1] && !clash[2], '冲突检查：同一行两个 1');
  ok(L.sudoku.count([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, 5) > 1, '只给一行的 4×4 不是唯一解');
}

/* ====================================================================== */
section('lights · 关灯');
{
  // 独立算法（“追灯法”）：枚举第一行怎么按，后面每一行被迫把上一行的灯按灭，最后看末行是否全灭
  function chase(state, n) {
    let best = -1;
    for (let first = 0; first < (1 << n); first++) {
      let s = state, count = 0;
      for (let c = 0; c < n; c++) if ((first >> c) & 1) { s = L.lights.press(s, n, c); count++; }
      for (let r = 1; r < n; r++) for (let c = 0; c < n; c++) {
        if ((s >> ((r - 1) * n + c)) & 1) { s = L.lights.press(s, n, r * n + c); count++; }
      }
      if (s === 0 && (best < 0 || count < best)) best = count;
    }
    return best;     // -1 表示无解
  }
  for (const n of [3, 5]) {
    for (const lv of ['easy', 'normal', 'hard']) {
      const [lo, hi] = L.lights.steps[n][lv];
      let bad = 0;
      for (let i = 0; i < 300; i++) {
        const p = L.lights.generate(n, rnd, lo, hi);
        let s = p.state, steps = 0;
        while (s !== 0 && steps < 40) {
          const sol = L.lights.solve(s, n);
          if (sol <= 0) break;
          let cell = 0; while (!((sol >> cell) & 1)) cell++;      // 提示：解里编号最小的那一格
          s = L.lights.press(s, n, cell); steps++;
        }
        if (p.state === 0 || s !== 0 || steps !== p.min || p.min < lo || p.min > hi || chase(p.state, n) !== p.min) bad++;
      }
      eq(bad, 0, n + '×' + n + ' ' + lv + '：300 题里“跟着提示解不开、或步数不是最少”的题数');
    }
    // 任意灯况：可解性和最少步数都与追灯法一致
    let bad = 0, unsolvable = 0;
    const ROUNDS = n === 3 ? 512 : 4000;
    for (let i = 0; i < ROUNDS; i++) {
      const state = n === 3 ? i : Math.floor(rnd() * (1 << 25));
      const sol = L.lights.solve(state, n), ref = chase(state, n);
      if (sol < 0) { unsolvable++; if (ref !== -1) bad++; continue; }
      let s = state;
      for (let c = 0; c < n * n; c++) if ((sol >> c) & 1) s = L.lights.press(s, n, c);
      if (s !== 0 || L.lights.bits(sol) !== ref) bad++;
    }
    eq(bad, 0, n + '×' + n + '：' + ROUNDS + ' 个灯况与追灯法对照，不一致的个数');
    console.log('  ' + n + '×' + n + '：' + ROUNDS + ' 个灯况里无解的有 ' + unsolvable + ' 个' + (n === 5 ? '（理论上约四分之三）' : '（理论上 0 个）'));
    if (n === 3) eq(unsolvable, 0, '3×3 任何灯况都有解');
  }
  // 乱按之后再跟提示：仍然解得开
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    let s = L.lights.generate(5, rnd, 5, 8).state;
    for (let k = 0; k < 7; k++) s = L.lights.press(s, 5, U.randInt(0, 24, rnd));
    let steps = 0;
    while (s !== 0 && steps < 30) { const sol = L.lights.solve(s, 5); let cell = 0; while (!((sol >> cell) & 1)) cell++; s = L.lights.press(s, 5, cell); steps++; }
    if (s !== 0) bad++;
  }
  eq(bad, 0, '5×5 乱按 7 下之后再跟提示，解不开的题数');
}

/* ====================================================================== */
section('memory · 记忆翻牌');
{
  for (const pairs of [6, 8, 10]) {
    const d = L.memory.deck(pairs, rnd), g = L.memory.grid(pairs);
    const counts = {};
    d.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    ok(d.length === pairs * 2 && Object.keys(counts).length === pairs && Object.values(counts).every((c) => c === 2) && g.cols * g.rows === pairs * 2,
      pairs + ' 对：每种正好两张，网格 ' + g.cols + '×' + g.rows + ' 刚好摆满');
  }
}

/* ====================================================================== */
section('onestroke · 一笔画');
{
  const levels = L.stroke.levels;
  ok(levels.length >= 8, '至少 8 关（现有 ' + levels.length + ' 关）');
  eq(levels.filter((l) => !l.ok).map((l) => l.name), ['七座桥'], '只有“七座桥”画不出来');
  eq(levels.filter((l) => l.bridge).length, 1, '七桥关卡只有一个');
  levels.forEach((lv, idx) => {
    const tag = '第 ' + (idx + 1) + ' 关「' + lv.name + '」';
    const a = L.stroke.analyse(lv);
    const route = L.stroke.brute(lv);
    ok(a.connected, tag + ' 图是连通的');
    eq(a.ok, lv.ok, tag + ' 按奇点规律判断的可解性');
    eq(route !== null, lv.ok, tag + ' 暴力搜索的可解性');
    ok(a.odd.length % 2 === 0, tag + ' 奇点个数是偶数');
    if (route) {
      // 路线合法：每条边正好一次，首尾相接（从第一条边的两个端点各试着走一遍）
      const fine = new Set(route).size === lv.edges.length && route.length === lv.edges.length;
      const walk = (start) => { let cur = start; for (const e of route) { const [x, y] = lv.edges[e]; if (x === cur) cur = y; else if (y === cur) cur = x; else return false; } return true; };
      const first = lv.edges[route[0]];
      ok(fine && (walk(first[0]) || walk(first[1])), tag + ' 暴力搜到的路线每条边走一次且首尾相接');
    }
    // 起点：0 个奇点任意点都行；2 个奇点只能从奇点出发
    lv.nodes.forEach((_, s) => {
      const can = L.stroke.feasible(lv, [], s);
      const should = lv.ok && (a.odd.length === 0 || a.odd.indexOf(s) >= 0);
      if (can !== should) ok(false, tag + ' 起点 ' + s + ' 的可行性判断不对');
    });
    // 从每个合法起点跟着提示走，一定能画完
    a.starts.forEach((s) => {
      const used = []; let cur = s, n = 0;
      for (;;) {
        const e = L.stroke.next(lv, used, cur);
        if (e < 0) break;
        used[e] = true; n++;
        cur = lv.edges[e][0] === cur ? lv.edges[e][1] : lv.edges[e][0];
      }
      if (n !== lv.edges.length) ok(false, tag + ' 从点 ' + s + ' 跟着提示没能画完（只画了 ' + n + ' 条）');
    });
    ok(lv.ok ? a.starts.length > 0 : a.starts.length === 0, tag + ' 合法起点 ' + a.starts.length + ' 个，奇点 ' + a.odd.length + ' 个，共 ' + lv.edges.length + ' 条线');
    // 版面：点都在画布里，彼此不挤（手指点得准）；重复的边必须弯向不同方向
    let layout = true;
    lv.nodes.forEach((p, i) => {
      if (p[0] < 8 || p[0] > 92 || p[1] < 8 || p[1] > 92) layout = false;
      lv.nodes.forEach((q, j) => { if (j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 14) layout = false; });
    });
    const seen = new Set();
    lv.edges.forEach((e) => {
      const flip = e[0] > e[1];
      const k = Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]) + ':' + ((e[2] || 0) * (flip ? -1 : 1)).toFixed(2);
      if (seen.has(k) || e[0] === e[1]) layout = false;
      seen.add(k);
    });
    ok(layout, tag + ' 版面：点在画布内、间距够、没有重叠的线');
  });
  const bridge = levels.find((l) => l.bridge);
  eq(L.stroke.analyse(bridge).deg.slice().sort((a, b) => a - b), [3, 3, 3, 5], '七桥图四个点的度数是 5、3、3、3');
  eq(bridge.edges.length, 7, '七桥图有七条边');
  eq(bridge.nodes.length, 4, '七桥图有四个点');
  eq(L.stroke.analyse(levels[levels.indexOf(bridge) + 1]).odd.length, 2, '多修一座桥之后只剩 2 个奇点');
  // 五角星与六芒星：交点真的在直线上（否则画出来是折线）
  // q 到直线 pr 的距离不超过 0.2（坐标四舍五入到 0.1，画布 100×100）
  const collinear = (p, q, r) => Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / Math.hypot(r[0] - p[0], r[1] - p[1]) < 0.2;
  const star = levels.find((l) => l.name === '五角星'), hex = levels.find((l) => l.name === '六芒星');
  let straight = true;
  for (let k = 0; k < 5; k++) if (!collinear(star.nodes[k], star.nodes[5 + k], star.nodes[(k + 2) % 5]) || !collinear(star.nodes[k], star.nodes[5 + (k + 1) % 5], star.nodes[(k + 2) % 5])) straight = false;
  for (let k = 0; k < 6; k++) if (!collinear(hex.nodes[k], hex.nodes[6 + k], hex.nodes[(k + 2) % 6]) || !collinear(hex.nodes[k], hex.nodes[6 + (k + 1) % 6], hex.nodes[(k + 2) % 6])) straight = false;
  ok(straight, '五角星、六芒星的交点都落在直线上');
}

/* ====================================================================== */
section('mindread · 读心术');
{
  let bad = 0;
  for (let n = 1; n <= 63; n++) {
    const answers = [0, 1, 2, 3, 4, 5].map((k) => L.mind.card(k).includes(n));
    if (L.mind.reveal(answers) !== n) bad++;
    const firsts = [0, 1, 2, 3, 4, 5].filter((k) => answers[k]).reduce((s, k) => s + L.mind.card(k)[0], 0);
    if (firsts !== n) bad++;
    if (answers.filter(Boolean).length !== n.toString(2).replace(/0/g, '').length) bad++;
  }
  eq(bad, 0, '1–63 里读错的数的个数');
  for (let k = 0; k < 6; k++) {
    const c = L.mind.card(k);
    ok(c.length === 32 && c[0] === Math.pow(2, k) && c.every((v, i) => i === 0 || v > c[i - 1]) && c[31] <= 63,
      '第 ' + (k + 1) + ' 张卡片：32 个数，从小到大，第一个是 ' + Math.pow(2, k));
  }
  eq(L.mind.reveal([false, false, false, false, false, false]), 0, '六张都说没有：得 0（界面会提示重来）');
  eq(L.mind.reveal([true, false, true, false, false, true]), 37, '1 + 4 + 32 = 37');
}

/* ====================================================================== */
section('cipher · 凯撒密码');
{
  const samples = L.caesar.lines.concat(['Hello, World! 123', 'wan fan chi sha?', 'XYZ xyz ABC abc', '今晚吃 PIZZA 吗', '', 'a']);
  let bad = 0;
  for (let k = -30; k <= 60; k++) {
    for (const t of samples) {
      const enc = L.caesar.encode(t, k);
      if (L.caesar.decode(enc, k) !== t) bad++;
      if (enc.length !== t.length) bad++;
      if (enc.replace(/[A-Za-z]/g, '') !== t.replace(/[A-Za-z]/g, '')) bad++;       // 非字母原样
      if (L.caesar.shift(enc, 26 - (((k % 26) + 26) % 26)) !== t) bad++;             // 再挪 26−k 位也回到原文
    }
  }
  eq(bad, 0, '加密再解密（位移 −30..60 × ' + samples.length + ' 句）不还原的次数');
  eq(L.caesar.encode('ABC XYZ abc xyz', 3), 'DEF ABC def abc', '位移 3');
  eq(L.caesar.encode('HELLO', 26), 'HELLO', '位移 26 等于没动');
  eq(L.caesar.decode('KHOOR', 3), 'HELLO', '解密');
  ok(L.caesar.lines.length >= 12, '内置句子不少于 12 条（现有 ' + L.caesar.lines.length + ' 条）');
  ok(L.caesar.lines.every((s) => /^[A-Z]+( [A-Z]+)*$/.test(s) && s.length <= 30), '内置句子只有大写字母和空格，不超过 30 个字符');
  eq(new Set(L.caesar.lines).size, L.caesar.lines.length, '内置句子没有重复');
  let ambiguous = 0;
  for (const s of L.caesar.lines) for (let k = 1; k <= 25; k++) if (L.caesar.encode(s, k) === s) ambiguous++;
  eq(ambiguous, 0, '位移 1–25 都会改变句子（正确位移唯一）');
}

/* ====================================================================== */
section('组件注册');
{
  const ids = ['make24', 'bulls', 'nim', 'hanoi', 'sudoku', 'lights', 'memory', 'onestroke', 'mindread', 'cipher'];
  const have = Object.keys(JN.widgets || {});
  if (have.length) {
    eq(ids.filter((id) => !JN.widgets[id]), [], '十个组件都已注册');
    ok(ids.every((id) => JN.widgets[id] && typeof JN.widgets[id].mount === 'function' && JN.widgets[id].name && JN.widgets[id].rules), '每个组件都有 name、rules、mount');
    ok(typeof JN.widgets.hanoi.preview === 'function', 'hanoi 提供 preview');
  } else {
    console.log('  （界面部分还没写，跳过）');
  }
}

/* ====================================================================== */
section('卡片 content/w-logic.json');
{
  const file = path.join(ROOT, 'content/w-logic.json');
  if (fs.existsSync(file)) {
    const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
    eq(cards.map((c) => c.id), Array.from({ length: 22 }, (_, i) => 'play-' + (101 + i)), '正好 22 张，play-101 到 play-122');
    ok(cards.every((c) => c.type === 'play' && c.format === 'widget'), '全部是 play / widget');
    const ids = ['make24', 'bulls', 'nim', 'hanoi', 'sudoku', 'lights', 'memory', 'onestroke', 'mindread', 'cipher'];
    eq(ids.filter((id) => !cards.some((c) => c.widget === id)), [], '每个组件至少一张卡片');
    eq(cards.filter((c) => ids.indexOf(c.widget) < 0).map((c) => c.id), [], '没有引用别人的组件');
    // 同一个组件的卡片，参数必须真的不一样
    const seen = new Set();
    let dup = 0;
    cards.forEach((c) => { const k = c.widget + JSON.stringify(c.params || {}); if (seen.has(k)) dup++; seen.add(k); });
    eq(dup, 0, '同一组件的卡片参数互不相同');
    // 参数落在组件支持的范围里
    const checks = {
      make24: (p) => !p.nums || (p.nums.length === 4 && L.make24.solve(p.nums) !== null && !!L.make24.levels[p.level || 'normal']),
      bulls: (p) => ['solo', 'duo'].includes(p.mode),
      nim: (p) => ['take21', 'heaps'].includes(p.game) && ['ai', 'duo'].includes(p.vs) && ['win', 'lose'].includes(p.last) && (p.ease == null || (p.ease >= 0 && p.ease <= 1)),
      hanoi: (p) => p.discs >= 3 && p.discs <= 6,
      sudoku: (p) => [4, 6].includes(p.size) && typeof p.check === 'boolean',
      lights: (p) => [3, 5].includes(p.size),
      memory: (p) => [6, 8, 10].includes(p.pairs) && [1, 2].includes(p.players),
      onestroke: (p) => p.level >= 1 && p.level <= L.stroke.levels.length,
      mindread: () => true,
      cipher: (p) => ['decode', 'write'].includes(p.mode)
    };
    eq(cards.filter((c) => checks[c.widget] && !checks[c.widget](c.params || {})).map((c) => c.id), [], '每张卡片的参数都在组件支持的范围里');
    const bridgeCard = cards.find((c) => c.widget === 'onestroke' && c.params.level > 1);
    ok(bridgeCard && L.stroke.levels[bridgeCard.params.level - 1].bridge, '「七座桥」那张卡片的 level 指向七桥关卡');
    // 卡片文字里的几个数字，和这里算出来的对一遍
    const all = JSON.stringify(cards);
    ok(all.includes('1820') && all.includes('1362'), '24 点卡片里的 1820 / 1362 与本测试核对过的结果一致');
    ok(all.includes('18446744073709551615') && String(2n ** 64n - 1n) === '18446744073709551615', '汉诺塔卡片里的 2^64 − 1');
    const years = Number(2n ** 64n - 1n) / (365.25 * 24 * 3600) / 1e8;      // 亿年
    ok(years > 5800 && years < 5900 && all.includes('5800 亿年'), '64 层一秒一步约 ' + Math.round(years) + ' 亿年（卡片写“大约 5800 亿年”）');
    ok(L.hanoi.minMoves(5) === 31 && L.hanoi.minMoves(3) === 7 && all.includes('31 步') && all.includes('7 步'), '汉诺塔卡片里的 7 步、31 步');
    // 猜数字卡片里的开局办法：0123 和 4567 两次的 A+B 加起来，用 4 减，就是 8、9 里有几个
    let bad = 0;
    for (let i = 0; i < 2000; i++) {
      const s = L.bulls.secret(rnd), a = L.bulls.score(s, '0123'), b = L.bulls.score(s, '4567');
      if (4 - (a.a + a.b + b.a + b.b) !== (s.includes('8') ? 1 : 0) + (s.includes('9') ? 1 : 0)) bad++;
    }
    eq(bad, 0, '猜数字卡片里的“0123 + 4567”开局推理');
  } else {
    console.log('  （卡片文件还没有，跳过）');
  }
}

console.log('\n' + (failures.length ? '有 ' + failures.length + ' 项没通过，' : '') + passed + ' 项检查通过' + (failures.length ? '' : '，0 项失败'));
process.exit(failures.length ? 1 : 0);
