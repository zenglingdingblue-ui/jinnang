#!/usr/bin/env node
/* 锦囊 · G2 对决组件的纯逻辑测试。
 * 用法：node dev/test-duel.js
 * 不需要浏览器：给 core.js 和 duel.js 一个最小的 window，然后直接调用 JN._duel 下的函数。
 * 这里的验算都是另写的（表达式求值器、暴力找五连、独立记账的点格棋），不复用被测代码。
 */
'use strict';
const path = require('path');
global.window = {};
global.document = {};
require(path.join(__dirname, '..', 'js', 'core.js'));
require(path.join(__dirname, '..', 'js', 'widgets', 'duel.js'));
const JN = global.window.JN;
const D = JN._duel;
const U = JN.util;

let checks = 0;
const fails = [];
function ok(cond, msg) {
  checks++;
  if (!cond && fails.length < 40) fails.push(msg);
  return cond;
}
function section(name, fn) {
  const before = checks, f0 = fails.length, t0 = Date.now();
  fn();
  console.log(`${fails.length === f0 ? '通过' : '失败'}  ${name}（${checks - before} 项检查，${Date.now() - t0} ms）`);
}

/* ------------------------------------------------------------------ *
 * 独立的表达式求值器：有理数（BigInt 分子分母），精确，没有浮点误差。
 * 认得：整数、小数、“万”、+ −（或 -）× ÷ /、括号、上标指数、“A 的 p%”、负号。
 * ------------------------------------------------------------------ */
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a || 1n; };
const R = (n, d = 1n) => { if (d === 0n) throw new Error('除以零'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => R(a.n * b.n, a.d * b.d);
const div = (a, b) => R(a.n * b.d, a.d * b.n);
const cmp = (a, b) => { const k = a.n * b.d - b.n * a.d; return k > 0n ? 1 : k < 0n ? -1 : 0; };
const absR = (a) => R(a.n < 0n ? -a.n : a.n, a.d);
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function evalExpr(text) {
  const s = String(text).replace(/\s+/g, '');
  let i = 0;
  const isMinus = (ch) => ch === '−' || ch === '-';
  function number() {
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`这里应该是数字：“${text}” 第 ${i} 位`);
    i += m[0].length;
    const [ip, fp = ''] = m[0].split('.');
    let v = R(BigInt(ip + fp), 10n ** BigInt(fp.length));
    if (s[i] === '万') { i++; v = mul(v, R(10000n)); }
    return v;
  }
  function primary() {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error('括号没闭合：' + text); i++; return v; }
    return number();
  }
  function postfix() {
    let v = primary(), e = '';
    while (i < s.length && SUPS.includes(s[i])) { e += SUPS.indexOf(s[i]); i++; }
    if (e) { let p = R(1n); for (let k = 0; k < Number(e); k++) p = mul(p, v); v = p; }
    if (s[i] === '的') { i++; const p = number(); if (s[i] !== '%') throw new Error('“的”后面应该是百分数：' + text); i++; v = div(mul(v, p), R(100n)); }
    return v;
  }
  function unary() { if (isMinus(s[i])) { i++; const v = unary(); return R(-v.n, v.d); } return postfix(); }
  function term() {
    let v = unary();
    while (s[i] === '×' || s[i] === '÷' || s[i] === '/') { const op = s[i++]; const r = unary(); v = op === '×' ? mul(v, r) : div(v, r); }
    return v;
  }
  function expr() {
    let v = term();
    while (s[i] === '+' || isMinus(s[i])) { const op = s[i++]; const r = term(); v = op === '+' ? add(v, r) : sub(v, r); }
    return v;
  }
  const v = expr();
  if (i !== s.length) throw new Error(`没读完：“${text}” 剩下 “${s.slice(i)}”`);
  return v;
}
const show = (v) => (v.d === 1n ? String(v.n) : `${v.n}/${v.d}`);

section('求值器自检', () => {
  const cases = [
    ['3 + 4 × 5', '23'], ['(3 + 4) × 5', '35'], ['84 ÷ 7', '12'], ['2¹⁰', '1024'], ['17²', '289'],
    ['50 的 30%', '15'], ['−7/9', '-7/9'], ['2.5 万', '25000'], ['0.49 × 815', '7987/20'],
    ['−37 + 6 × 8', '11'], ['10 − 4 × 9', '-26'], ['7 × 8 − 3 × 9', '29'], ['6032 ÷ 29', '208'], ['0.75', '3/4'], ['120 的 35%', '42']
  ];
  cases.forEach(([t, want]) => ok(show(evalExpr(t)) === want, `求值器算错：${t} 得到 ${show(evalExpr(t))}，应为 ${want}`));
});

/* ------------------------------------------------------------------ *
 * 1. 心算题：每种题型 × 每种难度各 2000 道（共 18000 道）
 * ------------------------------------------------------------------ */
section('心算题 18000 道：答案正确、选项不重复、正确答案恰好出现一次', () => {
  const rnd = U.rng('test-duel-math');
  const seen = {};
  let equalCount = 0, compareCount = 0;
  D.KINDS.forEach((kind) => D.LEVELS.forEach((level) => {
    const texts = new Set();
    for (let k = 0; k < 2000; k++) {
      const q = D.mathQ(kind, level, rnd);
      const tag = `[${kind}/${level}] ${q.text}${q.left ? ' ' + q.left + ' ? ' + q.right : ''} 选项 ${JSON.stringify(q.options)} 答案 #${q.answer}`;
      ok(q.kind === kind && q.level === level, '题型或难度不对 ' + tag);
      ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, '答案下标越界 ' + tag);
      ok(q.options.every((o) => typeof o === 'string' && o.length > 0 && o.length <= 12), '选项不是短字符串 ' + tag);
      texts.add(q.left ? q.left + '|' + q.right : q.text);
      try {
        if (kind === 'arith') {
          ok(q.options.length === 4, '应有 4 个选项 ' + tag);
          const v = evalExpr(q.text), vals = q.options.map(evalExpr);
          ok(v.d === 1n, '答案应为整数 ' + tag);
          ok(cmp(vals[q.answer], v) === 0, `标的答案不对（实际 ${show(v)}）` + tag);
          ok(vals.filter((x) => cmp(x, v) === 0).length === 1, '正确答案没有恰好出现一次 ' + tag);
          ok(new Set(vals.map(show)).size === vals.length, '选项有重复 ' + tag);
          ok(q.text.length <= 16, '题目太长 ' + tag);
        } else if (kind === 'compare') {
          compareCount++;
          ok(q.options.length === 3 && q.options[0] === q.left && q.options[1] === '=' && q.options[2] === q.right, '选项应为 [左, =, 右] ' + tag);
          ok(q.left !== q.right, '两边不能是同一个式子 ' + tag);
          const rel = cmp(evalExpr(q.left), evalExpr(q.right));
          if (rel === 0) equalCount++;
          ok(q.answer === (rel > 0 ? 0 : rel === 0 ? 1 : 2), `比大小答案不对（左 ${show(evalExpr(q.left))} 右 ${show(evalExpr(q.right))}）` + tag);
          ok(q.left.length <= 10 && q.right.length <= 10, '式子太长 ' + tag);
        } else {
          ok(q.options.length === 4, '应有 4 个选项 ' + tag);
          const v = evalExpr(q.text), vals = q.options.map(evalExpr);
          ok(new Set(vals.map(show)).size === 4, '选项有重复 ' + tag);
          ok(vals.every((x) => x.n > 0n), '选项应为正数 ' + tag);
          const dist = vals.map((x) => absR(sub(x, v)));
          const best = dist[q.answer];
          const others = dist.filter((_, i) => i !== q.answer);
          ok(others.every((d) => cmp(d, best) > 0), `标的答案不是唯一最近的（准确值 ${show(v)}）` + tag);
          // “明显最近”：第二近的至少是它的两倍远
          ok(others.every((d) => cmp(d, mul(best, R(2n))) >= 0), `最近和第二近差得太少（准确值 ${show(v)}）` + tag);
          for (let j = 1; j < 4; j++) ok(cmp(vals[j], vals[j - 1]) > 0, '选项应从小到大排 ' + tag);
          ok(new Set(q.options.map((o) => /万/.test(o))).size === 1, '四个选项应该用同一种单位 ' + tag);
        }
      } catch (e) {
        ok(false, '解析失败：' + e.message + ' ' + tag);
      }
    }
    seen[kind + '/' + level] = texts.size;
    ok(texts.size >= 60, `[${kind}/${level}] 2000 道里只有 ${texts.size} 种不同的题，太少`);
  }));
  const share = equalCount / compareCount;
  ok(share > 0.08 && share < 0.4, `比大小里“一样大”的比例是 ${(share * 100).toFixed(1)}%，应在 8%–40% 之间（太少就没人点 =）`);
  console.log('      不同的题目数：' + Object.keys(seen).map((k) => k + ' ' + seen[k]).join('，') + `；比大小里“一样大”占 ${(share * 100).toFixed(1)}%`);
});

section('心算题：参数乱填也能出题', () => {
  [['x', 'y'], [undefined, undefined], ['arith', 'nope'], ['estimate', null]].forEach(([k, l]) => {
    const q = D.mathQ(k, l);
    ok(q && q.options.length >= 3 && q.answer >= 0 && q.answer < q.options.length, '非法参数没有回退到默认题型');
  });
});

/* ------------------------------------------------------------------ *
 * 2. 五子棋：五连判定
 * ------------------------------------------------------------------ */
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function bruteWin(b, n) {       // 独立写的暴力判定：任意起点、四个方向各看五格
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const p = b[r * n + c];
    if (!p) continue;
    for (const [dr, dc] of DIRS) {
      let k = 1;
      while (k < 5) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n || b[rr * n + cc] !== p) break;
        k++;
      }
      if (k === 5) return p;
    }
  }
  return 0;
}
function winningMoves(b, n, p) {
  const out = [];
  for (let i = 0; i < n * n; i++) {
    if (b[i]) continue;
    b[i] = p;
    if (bruteWin(b, n) === p) out.push(i);
    b[i] = 0;
  }
  return out;
}
const empty = (n) => new Array(n * n).fill(0);

section('五子棋：横竖斜、贴边贴角的五连都认，四连、断开的、跨行的都不认', () => {
  [11, 13].forEach((n) => {
    DIRS.forEach(([dr, dc], di) => {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const cells = [];
        for (let k = 0; k < 5; k++) cells.push([r + dr * k, c + dc * k]);
        if (cells.some(([rr, cc]) => rr < 0 || rr >= n || cc < 0 || cc >= n)) continue;
        const idx = cells.map(([rr, cc]) => rr * n + cc);
        const b = empty(n);
        idx.forEach((i) => { b[i] = 1; });
        // 从五颗子里的任何一颗出发都要认出来，而且返回的正是这五格
        cells.forEach(([rr, cc]) => {
          const line = D.gmkLine(b, n, rr, cc);
          ok(line && line.length === 5 && line.slice().sort((x, y) => x - y).join() === idx.slice().sort((x, y) => x - y).join(), `n=${n} 方向 ${di} 起点 (${r},${c}) 的五连没认出来`);
        });
        const w = D.gmkFindWin(b, n);
        ok(w && w.p === 1, `n=${n} 方向 ${di} 起点 (${r},${c})：整盘扫描没找到五连`);
        // 拿掉任意一颗：不该再算赢（四连，或中间断开）
        idx.forEach((gone) => {
          b[gone] = 0;
          ok(D.gmkFindWin(b, n) === null && idx.every((i) => i === gone || D.gmkLine(b, n, (i / n) | 0, i % n) === null), `n=${n} 方向 ${di} 起点 (${r},${c}) 少了一颗还判赢`);
          b[gone] = 2;      // 换成对方的子也一样
          ok(D.gmkFindWin(b, n) === null, `n=${n} 方向 ${di} 起点 (${r},${c}) 中间夹着对方的子还判赢`);
          b[gone] = 1;
        });
      }
    });
    // 跨行：上一行末尾三颗 + 下一行开头两颗，一维下标是连着的，但不是一条线
    for (let r = 0; r + 1 < n; r++) {
      const b = empty(n);
      [n - 3, n - 2, n - 1].forEach((c) => { b[r * n + c] = 2; });
      [0, 1].forEach((c) => { b[(r + 1) * n + c] = 2; });
      ok(D.gmkFindWin(b, n) === null && bruteWin(b, n) === 0, `n=${n} 第 ${r} 行末尾连到下一行开头被误判成五连`);
    }
    // 六连也算赢（长连不禁手）
    const b6 = empty(n);
    for (let c = 2; c < 8; c++) b6[4 * n + c] = 2;
    const l6 = D.gmkLine(b6, n, 4, 5);
    ok(l6 && l6.length === 6 && D.gmkFindWin(b6, n).p === 2, `n=${n} 六连应该算赢`);
    // 空格、单颗子
    ok(D.gmkLine(empty(n), n, 0, 0) === null, '空位不该有连线');
  });
});

section('五子棋：随机棋盘 4000 个，和暴力判定逐一对照', () => {
  const rnd = U.rng('test-duel-gmk-random');
  for (let t = 0; t < 4000; t++) {
    const n = t % 2 ? 13 : 11, b = empty(n);
    const stones = 20 + Math.floor(rnd() * (n * n - 40));
    for (let k = 0; k < stones; k++) b[Math.floor(rnd() * n * n)] = 1 + (k & 1);
    const w = D.gmkFindWin(b, n), bw = bruteWin(b, n);
    ok((w === null) === (bw === 0), `随机棋盘 #${t}：判定和暴力结果不一致（组件 ${w ? w.p : 0}，暴力 ${bw}）`);
    if (w) {
      ok(w.cells.length >= 5 && w.cells.every((i) => b[i] === w.p), `随机棋盘 #${t}：返回的连线里混进了别的子`);
      const rs = w.cells.map((i) => (i / n) | 0), cs = w.cells.map((i) => i % n);
      const dr = rs[1] - rs[0], dc = cs[1] - cs[0];
      ok(w.cells.every((_, k) => k === 0 || (rs[k] - rs[k - 1] === dr && cs[k] - cs[k - 1] === dc)) && Math.abs(dr) <= 1 && Math.abs(dc) <= 1, `随机棋盘 #${t}：返回的连线不是一条直线`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 3. 五子棋电脑：自己能成五必下；对方已成四必堵
 * ------------------------------------------------------------------ */
function scatter(n, rnd, count) {        // 随机摆一些子，保证盘上没有现成的五连
  for (;;) {
    const b = empty(n);
    for (let k = 0; k < count; k++) b[Math.floor(rnd() * n * n)] = 1 + (k & 1);
    if (!bruteWin(b, n)) return b;
  }
}
function plantFour(b, n, p, rnd) {       // 给 p 摆出“五格里四颗子、空一格”，返回是否成功（不能顺手造出五连）
  for (let tries = 0; tries < 200; tries++) {
    const [dr, dc] = DIRS[Math.floor(rnd() * 4)];
    const r = Math.floor(rnd() * n), c = Math.floor(rnd() * n);
    const cells = [];
    for (let k = 0; k < 5; k++) cells.push([r + dr * k, c + dc * k]);
    if (cells.some(([rr, cc]) => rr < 0 || rr >= n || cc < 0 || cc >= n)) continue;
    const gap = Math.floor(rnd() * 5);
    const saved = cells.map(([rr, cc]) => b[rr * n + cc]);
    cells.forEach(([rr, cc], k) => { b[rr * n + cc] = k === gap ? 0 : p; });
    if (!bruteWin(b, n)) return true;
    cells.forEach(([rr, cc], k) => { b[rr * n + cc] = saved[k]; });
  }
  return false;
}

section('五子棋电脑：棋型判断（活四、冲四、活三、眠三、活二，含跳着的和贴边的）', () => {
  const G = D.G, n = 13;
  // 在第 6 行摆子：X 己方，O 对方，. 空，* 准备落子的位置。返回这一手在横向成的型（只应有一条线成型）
  function shape(row) {
    const b = empty(n);
    let at = -1;
    row.split('').forEach((ch, c) => {
      if (ch === 'X') b[6 * n + c] = 1;
      else if (ch === 'O') b[6 * n + c] = 2;
      else if (ch === '*') at = c;
    });
    const cnt = D.gmkShapes(b, n, 6, at, 1);
    const hit = [G.FIVE, G.O4, G.F4, G.O3, G.S3, G.O2, G.S2].filter((k) => cnt[k] > 0);
    return hit.length ? hit[0] : 0;
  }
  const cases = [
    ['...XXXX*.....', G.FIVE, '四连再加一颗 = 五连'],
    ['..XX*XX......', G.FIVE, '中间补上 = 五连'],
    ['....XXX*.....', G.O4, '两头都空的四 = 活四'],
    ['...OXXX*.....', G.F4, '一头被堵的四 = 冲四'],
    ['...OXXX*O....', 0, '两头都被堵的四 = 死四，没用'],
    ['....XX.*X....', G.F4, '跳着的四（XX.XX）= 冲四'],
    ['....X.X*X.X..', G.O4, '一条线上有两个成五点，也算活四'],
    ['.....XX*.....', G.O3, '两头都空的三 = 活三'],
    ['....X.X*.....', G.O3, '跳一格的三（X.XX）= 活三'],
    ['...OXX*......', G.S3, '一头被堵的三 = 眠三'],
    ['...O.XX*.O...', G.S3, '总共只有五格空间的三：成不了活四，只是眠三'],
    ['...OXX*O.....', 0, '两头堵死的三 = 没用'],
    ['....X..*X....', G.S3, '隔两格（X..XX）= 眠三'],
    ['......X*.....', G.O2, '两头都空的二 = 活二'],
    ['.....OX*.....', G.S2, '一头被堵的二 = 眠二'],
    ['.......*.....', 0, '孤零零一颗子不算型'],
    ['XXX*.........', G.F4, '贴着左边的四 = 冲四（墙等于被堵）'],
    ['.........*XXX', G.F4, '贴着右边的四 = 冲四'],
    ['XX*..........', G.S3, '贴边的三 = 眠三'],
    ['*XXXX........', G.FIVE, '贴边的五连']
  ];
  cases.forEach(([row, want, why]) => ok(shape(row) === want, `棋型判断不对：“${row}” 应为 ${want}（${why}），得到 ${shape(row)}`));
  // 斜线和竖线：同样的子换个方向，结果应该一样
  [[1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
    const b = empty(n);
    [-2, -1].forEach((k) => { b[(6 + dr * k) * n + 6 + dc * k] = 2; });
    const cnt = D.gmkShapes(b, n, 6, 6, 2);
    ok(cnt[G.O3] === 1 && cnt[G.O4] === 0 && cnt[G.F4] === 0, `方向 (${dr},${dc}) 上的活三没认出来`);
  });
  // 一手同时成两条线：横着活三 + 竖着活三（双活三）
  const b2 = empty(n);
  [4, 5].forEach((c) => { b2[6 * n + c] = 1; });
  [4, 5].forEach((r) => { b2[r * n + 6] = 1; });
  ok(D.gmkShapes(b2, n, 6, 6, 1)[G.O3] === 2, '双活三应该数出两条活三');
});

section('五子棋电脑：自己能成五必下、对方已成四必堵（三种强度各 2400 个局面）', () => {
  const rnd = U.rng('test-duel-gmk-ai');
  const stat = { win: 0, block: 0, both: 0 };
  let maxMs = 0;
  for (let t = 0; t < 2400; t++) {
    const n = t % 2 ? 13 : 11;
    const b = scatter(n, rnd, 6 + Math.floor(rnd() * 50));
    const kind = t % 3;          // 0：电脑有四；1：对方有四；2：双方都有四（应该先赢）
    if (kind !== 1 && !plantFour(b, n, 2, rnd)) continue;
    if (kind !== 0 && !plantFour(b, n, 1, rnd)) continue;
    const mine = winningMoves(b, n, 2), theirs = winningMoves(b, n, 1);
    const snapshot = b.join('');
    [1, 2, 3].forEach((level) => {
      const t0 = Date.now();
      const m = D.gmkAI(b, n, 2, level, rnd);
      maxMs = Math.max(maxMs, Date.now() - t0);
      ok(b.join('') === snapshot, `电脑思考时改动了棋盘（局面 #${t}，强度 ${level}）`);
      ok(Number.isInteger(m) && m >= 0 && m < n * n && b[m] === 0, `电脑下在了不合法的位置 ${m}（局面 #${t}，强度 ${level}）`);
      if (mine.length) ok(mine.includes(m), `自己能成五却没下（局面 #${t}，强度 ${level}，下了 ${m}，能赢的点 ${mine}）`);
      else if (theirs.length) ok(theirs.includes(m), `对方已成四却没堵（局面 #${t}，强度 ${level}，下了 ${m}，该堵的点 ${theirs}）`);
    });
    if (mine.length && theirs.length) stat.both++; else if (mine.length) stat.win++; else if (theirs.length) stat.block++;
  }
  ok(stat.win > 500 && stat.block > 300 && stat.both > 300, '测试局面的覆盖不够：' + JSON.stringify(stat));
  console.log(`      局面：只有自己能赢 ${stat.win}，只需要堵 ${stat.block}，两边都有四 ${stat.both}；单步最长用时 ${maxMs} ms`);
});

section('五子棋电脑：空盘走天元；普通和高手会堵活三；不会下到有子的地方', () => {
  const rnd = U.rng('test-duel-gmk-open3');
  [11, 13].forEach((n) => {
    const c = (n - 1) / 2;
    ok(D.gmkAI(empty(n), n, 2, 2, rnd) === c * n + c, `n=${n} 空盘没有走正中间`);
    // 对方（1）横、竖、斜各摆一个两头都空的活三，电脑（2）只有两颗不相干的散子
    DIRS.forEach(([dr, dc], di) => {
      for (let rep = 0; rep < 30; rep++) {
        const b = empty(n);
        const three = [-1, 0, 1].map((k) => (c + dr * k) * n + (c + dc * k));
        three.forEach((i) => { b[i] = 1; });
        b[0 * n + 2 + (rep % 3)] = 2;
        b[(n - 1) * n + n - 3 - (rep % 2)] = 2;
        const ends = [(c - 2 * dr) * n + (c - 2 * dc), (c + 2 * dr) * n + (c + 2 * dc)];
        [2, 3].forEach((level) => {
          const m = D.gmkAI(b, n, 2, level, rnd);
          ok(ends.includes(m), `n=${n} 方向 ${di} 强度 ${level}：没有贴着堵活三（下了 ${(m / n) | 0},${m % n}）`);
        });
      }
    });
    // 自己有活三、对方什么都没有：应该直接长成活四（下一手必胜）
    const b = empty(n);
    [-1, 0, 1].forEach((k) => { b[c * n + c + k] = 2; });
    b[1] = 1; b[n * n - 2] = 1; b[3 * n] = 1;
    [1, 2, 3].forEach((level) => {
      const m = D.gmkAI(b, n, 2, level, rnd);
      b[m] = 2;
      ok(winningMoves(b, n, 2).length >= 2, `n=${n} 强度 ${level}：自己有活三却没有长成活四`);
      b[m] = 0;
    });
    // 对方（1）有一个“冲四活三”的点：横着是一头被堵的三连，竖着是两颗子，交点一落就是四 + 活三。
    // 电脑（2）手里没有先手，应该抢先占住这个点（或者它旁边那个成五点），不能让对方走成。
    {
      const g = empty(n), r = c;
      [c - 2, c - 1, c].forEach((x) => { g[r * n + x] = 1; });
      g[r * n + c - 3] = 2;
      g[(r - 2) * n + c + 1] = 1; g[(r - 1) * n + c + 1] = 1;
      g[1] = 2; g[n * n - 2] = 2;
      const key = r * n + c + 1, five = r * n + c + 2;
      [2, 3].forEach((level) => {
        const m = D.gmkAI(g, n, 2, level, rnd);
        ok(m === key || m === five, `n=${n} 强度 ${level}：没有防住对方的“冲四活三”（下了 ${(m / n) | 0},${m % n}）`);
      });
    }
    // 电脑自己有“冲四活三”的点：应该走它（或者直接走出别的必胜棋）
    {
      const g = empty(n), r = c;
      [c - 2, c - 1, c].forEach((x) => { g[r * n + x] = 2; });
      g[r * n + c - 3] = 1;
      g[(r - 2) * n + c + 1] = 2; g[(r - 1) * n + c + 1] = 2;
      g[1] = 1; g[n * n - 2] = 1; g[3 * n] = 1;
      [1, 2, 3].forEach((level) => {
        const m = D.gmkAI(g, n, 2, level, rnd);
        g[m] = 2;
        // 走完以后：自己有成五点（对方必须堵），而且堵了以后自己还有活三可长
        ok(winningMoves(g, n, 2).length >= 1, `n=${n} 强度 ${level}：有“冲四活三”却没走成四（下了 ${(m / n) | 0},${m % n}）`);
        g[m] = 0;
      });
    }
  });
});

section('五子棋电脑：强度有区分（高手对新手、普通对新手、高手对普通各 30 盘）', () => {
  function play(n, la, lb, seed) {        // la 执 1 先手，lb 执 2
    const rnd = U.rng(seed), b = empty(n);
    let turn = 1, moves = 0;
    for (;;) {
      const m = D.gmkAI(b, n, turn, turn === 1 ? la : lb, rnd);
      if (m < 0 || b[m]) return { w: -1, moves };
      b[m] = turn;
      moves++;
      if (bruteWin(b, n)) return { w: turn, moves };
      if (moves === n * n) return { w: 0, moves };
      turn = 3 - turn;
    }
  }
  [[3, 1], [2, 1], [3, 2]].forEach(([strong, weak]) => {
    let sw = 0, ww = 0, draws = 0, bad = 0, total = 0;
    for (let g = 0; g < 30; g++) {
      const n = g % 2 ? 13 : 11;
      const strongFirst = g % 4 < 2;
      const res = strongFirst ? play(n, strong, weak, 'g' + strong + weak + g) : play(n, weak, strong, 'g' + strong + weak + g);
      total += res.moves;
      if (res.w < 0) bad++;
      else if (res.w === 0) draws++;
      else if ((res.w === 1) === strongFirst) sw++; else ww++;
    }
    ok(bad === 0, '对局中出现了不合法的落子');
    if (weak === 1) ok(sw >= 24, `强度 ${strong} 对强度 ${weak} 只赢了 ${sw}/30 盘`);
    else ok(sw >= ww, `高手对普通不该输多赢少：${sw} 胜 ${ww} 负`);
    console.log(`      强度 ${strong} 对 ${weak}：${sw} 胜 ${ww} 负 ${draws} 平，平均 ${(total / 30).toFixed(0)} 手`);
  });
});

/* ------------------------------------------------------------------ *
 * 4. 点格棋
 * ------------------------------------------------------------------ */
section('点格棋：围格计分、连走、换人、非法走法', () => {
  // 一个格子：前三条边不得分并且轮流换人，第四条边得一分并且还是同一个人走
  let s = D.dotsNew(4, 2, 0);
  ok(s.turn === 0 && s.left === 16 && s.score.join() === '0,0', '开局状态不对');
  let r = D.dotsPlay(s, 'h', 0, 0);
  ok(r && r.who === 0 && r.made.length === 0 && !r.again && s.turn === 1, '第一条边：不得分，换人');
  r = D.dotsPlay(s, 'v', 0, 0);
  ok(r && r.who === 1 && r.made.length === 0 && s.turn === 0, '第二条边：不得分，换回来');
  r = D.dotsPlay(s, 'h', 1, 0);
  ok(r && r.who === 0 && r.made.length === 0 && s.turn === 1, '第三条边：不得分，换人');
  ok(D.dotsSides(s, 0, 0) === 3, '左上角的格子现在应该有三条边');
  r = D.dotsPlay(s, 'v', 0, 1);
  ok(r && r.who === 1 && r.made.join() === '0' && r.again && !r.over, '第四条边：围成 0 号格');
  ok(s.score.join() === '0,1' && s.box[0] === 1 && s.left === 15 && s.turn === 1, '围成的人得一分，并且还是他走');
  // 重复画同一条边、越界、乱写类型：都不算，状态不变
  const snap = JSON.stringify(s);
  ok(D.dotsPlay(s, 'h', 0, 0) === null && D.dotsPlay(s, 'v', 0, 1) === null, '已经画过的边不能再画');
  ok(D.dotsPlay(s, 'h', 5, 0) === null && D.dotsPlay(s, 'h', 0, 4) === null && D.dotsPlay(s, 'v', 4, 0) === null && D.dotsPlay(s, 'v', 0, 5) === null && D.dotsPlay(s, 'h', -1, 0) === null, '越界的边不能画');
  ok(D.dotsPlay(s, 'x', 0, 0) === null, '不认识的边类型不能画');
  ok(JSON.stringify(s) === snap, '非法走法不应改变局面');

  // 一条边同时围成两个格子：得两分
  s = D.dotsNew(4, 2, 0);
  // 格子 (0,0) 和 (0,1) 共用竖边 v(0,1)。先把其余六条边画上（中间穿插废边来控制轮到谁）
  [['h', 0, 0], ['h', 1, 0], ['v', 0, 0], ['h', 0, 1], ['h', 1, 1], ['v', 0, 2]].forEach(([t, rr, cc]) => {
    const res = D.dotsPlay(s, t, rr, cc);
    ok(res && res.made.length === 0, '铺垫的边不该围成格子');
  });
  ok(s.turn === 0 && s.score.join() === '0,0', '六条边之后应该轮到 0 号');
  r = D.dotsPlay(s, 'v', 0, 1);
  ok(r && r.made.slice().sort().join() === '0,1' && s.score.join() === '2,0' && s.turn === 0 && s.left === 14, '一条边围成两格应得两分并继续走');

  // 三个人：不得分时按 0 → 1 → 2 → 0 轮转；可以指定谁先手
  s = D.dotsNew(4, 3, 2);
  ok(s.turn === 2, '指定 2 号先手');
  const order = [];
  [['h', 0, 0], ['h', 0, 1], ['h', 0, 2], ['h', 0, 3], ['h', 4, 0]].forEach(([t, rr, cc]) => { order.push(D.dotsPlay(s, t, rr, cc).who); });
  ok(order.join() === '2,0,1,2,0' && s.turn === 1, '三人轮转顺序不对：' + order.join());
});

section('点格棋：随机下完 3000 盘，用另一套记账逐步核对', () => {
  const rnd = U.rng('test-duel-dots');
  for (let g = 0; g < 3000; g++) {
    const n = 4, players = 2 + (g % 2), first = g % players;
    const s = D.dotsNew(n, players, first);
    // 独立记账：每条边是否画了；每个格子归谁；每人几分
    const H = new Set(), V = new Set(), owner = {}, score = new Array(players).fill(0);
    const all = [];
    for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) all.push(['h', r, c]);
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) all.push(['v', r, c]);
    const todo = U.shuffle(all, rnd);
    let turn = first, moves = 0, good = true;
    const boxDone = (r, c) => H.has(r + ',' + c) && H.has((r + 1) + ',' + c) && V.has(r + ',' + c) && V.has(r + ',' + (c + 1));
    for (const [t, r, c] of todo) {
      if (s.turn !== turn) { good = false; break; }
      const res = D.dotsPlay(s, t, r, c);
      moves++;
      (t === 'h' ? H : V).add(r + ',' + c);
      let made = 0;
      for (let br = 0; br < n; br++) for (let bc = 0; bc < n; bc++) {
        const key = br * n + bc;
        if (owner[key] === undefined && boxDone(br, bc)) { owner[key] = turn; score[turn]++; made++; }
      }
      const done = Object.keys(owner).length === n * n;
      if (!res || res.who !== turn || res.made.length !== made || res.over !== done || res.again !== (made > 0 && !done)) { good = false; break; }
      if (!made) turn = (turn + 1) % players;
    }
    ok(good, `第 ${g} 盘：某一步的得分、连走或换人和独立记账对不上`);
    ok(moves === 40 && s.moves === 40 && s.left === 0, `第 ${g} 盘：应该正好 40 步下完`);
    ok(s.score.join() === score.join() && s.score.reduce((a, b) => a + b, 0) === 16, `第 ${g} 盘：比分不对 ${s.score} / ${score}`);
    ok(s.box.every((o, k) => o === owner[k]), `第 ${g} 盘：格子的归属不对`);
    ok(D.dotsPlay(s, 'h', 0, 0) === null, `第 ${g} 盘：下完以后不能再走`);
  }
});

/* ------------------------------------------------------------------ *
 * 5. 其余几个小游戏的规则
 * ------------------------------------------------------------------ */
section('反应对决：信号安排', () => {
  const rnd = U.rng('test-duel-reaction');
  for (let k = 0; k < 3000; k++) {
    const simple = D.reactionPlan('simple', rnd);
    ok(simple.length === 1 && simple[0].real && simple[0].at >= 1500 && simple[0].at <= 5000, '简单模式：只有一个真信号，在 1.5–5 秒之间');
    const target = { shape: D.R_SHAPES[k % 4], color: D.R_COLORS[(k >> 2) % 4] };
    const plan = D.reactionPlan('trick', rnd, target);
    const last = plan[plan.length - 1];
    ok(plan.length >= 1 && plan.length <= 4 && last.real && last.shape === target.shape && last.color === target.color, '花样模式：最后一个必须是真信号');
    ok(last.at >= 1300 && last.at <= 10000, '花样模式：真信号出现得太早或太晚 ' + last.at);
    plan.forEach((f, i) => {
      if (i === plan.length - 1) return;
      ok(!f.real && !(f.shape === target.shape && f.color === target.color), '假信号不能和目标一模一样');
      ok(!(f.shape === target.shape && ['red', 'green'].includes(f.color) && ['red', 'green'].includes(target.color)), '假信号不能只是红绿对调');
      ok(D.R_SHAPES.includes(f.shape) && D.R_COLORS.includes(f.color), '假信号的形状颜色不在清单里');
      ok(plan[i + 1].at - f.at >= f.hold + 500, '假信号熄灭后要留出间隔再出下一个');
    });
  }
});

section('指尖拔河：负重与边界', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(D.tapwarStep(0, 1, 0), -0.07) && near(D.tapwarStep(0, 0, 0), 0.07), '不负重时两边一下一样多');
  ok(near(D.tapwarStep(0, 0, 0.3), 0.07 * 0.7) && near(D.tapwarStep(0, 0, 0.5), 0.035), '负重三成 / 五成：下方每下只算七成 / 一半');
  ok(near(D.tapwarStep(0, 1, 0.5), -0.07), '负重只影响下方');
  ok(D.tapwarStep(0.98, 0, 0) === 1 && D.tapwarStep(-0.98, 1, 0) === -1, '不会越过胜利线');
  // 下方负重五成、手速是上方两倍：应该正好抵消
  let pos = 0;
  for (let k = 0; k < 50; k++) { pos = D.tapwarStep(pos, 0, 0.5); pos = D.tapwarStep(pos, 0, 0.5); pos = D.tapwarStep(pos, 1, 0.5); }
  ok(Math.abs(pos) < 1e-9, '负重五成 × 两倍手速应该打平');
});

section('估秒：排名与取整', () => {
  let rank = D.tensecRank(10, [10420, 9810]);
  ok(rank[0].p === 1 && rank[0].diff === -19 && rank[1].p === 0 && rank[1].diff === 42, '离目标近的排前面');
  rank = D.tensecRank(10, [10004, 9996, 12000]);
  ok(rank[0].diff === 0 && rank[1].diff === 0 && rank[2].p === 2 && rank[2].diff === 200, '按百分之一秒取整后再比');
  rank = D.tensecRank(7, [7300, 6700]);
  ok(Math.abs(rank[0].diff) === Math.abs(rank[1].diff) && rank[0].p === 0, '差距一样时并列（保持座位顺序）');
  ok(D.fmtCs(1042) === '10.42' && D.fmtCs(8) === '0.08' && D.fmtCs(1000) === '10.00', '时间显示两位小数');
});

section('斯特鲁普：题目配平与统计', () => {
  const rnd = U.rng('test-duel-stroop');
  for (let k = 0; k < 2000; k++) {
    const list = D.stroopTrials(rnd, 20);
    ok(list.length === 20, '应有 20 题');
    ok(list.filter((x) => x.same).length === 10, '一致与不一致各 10 题');
    ok(list.every((x) => x.same === (x.word === x.ink)), '“一致”的标记要和字义、字色对得上');
    ok([0, 1, 2, 3].every((c) => list.filter((x) => x.ink === c).length === 5), '四种字色各 5 次');
    ok(list.every((x) => x.word >= 0 && x.word < 4 && x.ink >= 0 && x.ink < 4), '字和颜色的编号越界');
    let adj = true;
    for (let i = 1; i < list.length; i++) {
      if (list[i].word === list[i - 1].word && list[i].ink === list[i - 1].ink) adj = false;
      if (i >= 2 && list[i].ink === list[i - 1].ink && list[i].ink === list[i - 2].ink) adj = false;
    }
    ok(adj, '相邻两题不能完全相同，同一种字色不能连出三次');
  }
  const s = D.stroopStats([
    { same: true, ok: true, rt: 500 }, { same: true, ok: true, rt: 600 }, { same: true, ok: false, rt: 300 },
    { same: false, ok: true, rt: 700 }, { same: false, ok: true, rt: 801 }, { same: false, ok: false, rt: 4000 }
  ]);
  ok(s.n === 6 && s.wrong === 2 && s.same === 550 && s.diff === 751 && s.cost === 201 && s.all === 650, '平均反应时间和干扰代价算得不对：' + JSON.stringify(s));
  const none = D.stroopStats([{ same: true, ok: true, rt: 500 }, { same: false, ok: false, rt: 900 }]);
  ok(none.cost === null && none.diff === null, '某一类题全错时干扰代价应为空');
  ok(D.S_KEYS.length === 4 && D.S_WORDS.join('') === '红蓝绿黄', '颜色词应为 红蓝绿黄');
});

section('组件注册', () => {
  ['reaction', 'tapwar', 'mathduel', 'gomoku', 'dots', 'tensec', 'stroop'].forEach((id) => {
    const w = JN.widgets[id];
    ok(w && typeof w.mount === 'function' && typeof w.preview === 'function' && w.name && w.rules && w.rules.length <= 140, '组件没注册好：' + id);
  });
});

console.log('');
if (fails.length) {
  fails.forEach((m) => console.log('  失败  ' + m));
  console.log(`${checks} 项检查，${fails.length}${fails.length >= 40 ? '+' : ''} 项失败`);
  process.exit(1);
}
console.log(`${checks} 项检查全部通过`);
