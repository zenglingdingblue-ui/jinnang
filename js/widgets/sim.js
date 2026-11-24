/* 锦囊 · widgets/sim —— 概率与算法模拟（组件工程师 G4）
 * 七个组件：monty 三门问题 · galton 高尔顿板 · chaosgame 混沌游戏 · montepi 扔飞镖算圆周率
 *           life 生命游戏 · sorting 排序赛跑 · birthday 生日悖论
 * 套路都一样：先让人猜，再让他亲手验证，结果违反直觉。不是上课，是变魔术，然后把魔术拆给他看。
 *
 * 文件结构：
 *   1. 纯逻辑：不碰 DOM，挂在 JN._sim 下。dev/test-sim.js 在 Node 里直接验证（概率、公式、规则都在这里）。
 *   2. 公用小工具：读 CSS 变量、画布（按 devicePixelRatio，上限 2）、动画循环（页面不可见时暂停）、
 *      计时器、「为什么」折叠面板、预览骨架。
 *   3. 七个组件。每个组件的 mount 完整可玩，preview 是卡片上自动循环的小动画。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;

  /* ====================================================================== *
   * 1. 纯逻辑
   * ====================================================================== */
  var SIM = (JN._sim = {});

  /* ---------- 1.1 三门问题 ----------
   * n 扇门，奖品等可能地藏在其中一扇后面。玩家先选一扇；主持人知道奖品在哪，
   * 他从玩家没选的门里打开 n−2 扇空门，只留下一扇不开。
   *   不换：赢 ⇔ 第一次就选中了                      P = 1/n
   *   换：  赢 ⇔ 第一次没选中（这时主持人别无选择，留下的那扇必然有奖）  P = (n−1)/n
   * n = 3 → 1/3 与 2/3；n = 100 → 1/100 与 99/100。
   * 下面是照着这个过程老老实实模拟的，没有直接用上面的结论。
   */
  /** 主持人留下不开的那扇门。玩家没选中时只能留奖品门；选中了就在其余 n−1 扇里随便留一扇。 */
  SIM.montyHost = function (rnd, n, prize, pick) {
    if (pick !== prize) return prize;
    var o = Math.floor(rnd() * (n - 1));
    return o >= pick ? o + 1 : o;
  };
  SIM.montyDeal = function (rnd, n) {
    var prize = Math.floor(rnd() * n);
    var pick = Math.floor(rnd() * n);
    return { prize: prize, pick: pick, other: SIM.montyHost(rnd, n, prize, pick) };
  };
  /** 玩一局，返回是否赢。swap 为真表示换到主持人留下的那扇门。 */
  SIM.montyPlay = function (rnd, n, swap) {
    var d = SIM.montyDeal(rnd, n);
    return (swap ? d.other : d.pick) === d.prize;
  };
  SIM.montyTheory = function (n) { return { swap: (n - 1) / n, stay: 1 / n }; };

  /* ---------- 1.2 高尔顿板 ----------
   * 每颗球经过 rows 排钉子，每碰一颗钉子独立地以概率 p 向右、1−p 向左。
   * 落进第 k 号槽（从左数 0…rows）⇔ 恰好向右拐了 k 次，所以槽里的球数服从二项分布：
   *   P(k) = C(rows, k) · p^k · (1−p)^(rows−k)，均值 rows·p，方差 rows·p·(1−p)。
   */
  SIM.binomPMF = function (n, p) {
    var out = new Array(n + 1);
    var c = 1;                                  // c = C(n,k)，递推 C(n,k+1) = C(n,k)·(n−k)/(k+1)
    for (var k = 0; k <= n; k++) {
      out[k] = c * Math.pow(p, k) * Math.pow(1 - p, n - k);
      c = c * (n - k) / (k + 1);
    }
    return out;
  };
  /** 一颗球落进哪个槽（真的拐 rows 次弯，不是直接从分布里抽）。 */
  SIM.galtonDrop = function (rnd, rows, p) {
    var k = 0;
    for (var i = 0; i < rows; i++) if (rnd() < p) k++;
    return k;
  };
  /** 猜球游戏的得分：押中第 k 槽得 1/P(k) 分（四舍五入到一位小数）。
   *  这样无论押哪个槽，每颗球的平均得分都约等于 P(k)·(1/P(k)) = 1 分：赔率是“公平”的，
   *  区别只在于押中间经常中、每次分少，押边上几乎不中、中一次分很多。 */
  SIM.galtonOdds = function (pmf) {
    return pmf.map(function (p) { return Math.round(10 / p) / 10; });
  };

  /* ---------- 1.3 混沌游戏 ----------
   * 规则：从任意一点出发，每次随机选一个顶点，朝它跳过去一段（两点连线上的固定比例 jump），画一个点。
   * 这其实是一个迭代函数系统：每次跳跃都是一次以该顶点为中心、比例 1−jump 的收缩。
   *   三角形 jump = 1/2      → 谢尔宾斯基三角形
   *   正方形 jump = 1/2      → 均匀铺满，没有图案；加一条“不能连续两次选同一个顶点”才出现分形
   *   正 n 边形要让 n 个缩小的副本刚好相切，收缩比例是
   *       s(n) = 1 / ( 2·(1 + Σ_{k=1}^{⌊n/4⌋} cos(2πk/n)) )，跳跃比例 jump = 1 − s(n)
   *       n=3 → s=1/2；n=5 → s=(3−√5)/2≈0.382，jump≈0.618（黄金分割）；n=6 → s=1/3，jump=2/3
   *   地毯：四个角 + 四条边的中点共 8 个点，jump = 2/3（8 个 1/3 大小的副本）→ 谢尔宾斯基地毯
   */
  SIM.kissRatio = function (n) {
    var s = 1;
    for (var k = 1; k <= Math.floor(n / 4); k++) s += Math.cos(2 * Math.PI * k / n);
    return 1 / (2 * s);
  };
  function ngon(n, rot) {
    var a = [];
    for (var i = 0; i < n; i++) { var t = rot + i * 2 * Math.PI / n; a.push([Math.cos(t), Math.sin(t)]); }
    return a;
  }
  /** 把一组顶点平移缩放进 [0,w]×[0,h]（长边为 1），方便按画布大小再放大。顶点保持绕一圈的顺序。 */
  function chaosDef(pts, jump, norepeat) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var k = 1 / Math.max(x1 - x0, y1 - y0);
    return {
      verts: pts.map(function (p) { return [(p[0] - x0) * k, (p[1] - y0) * k]; }),
      w: (x1 - x0) * k, h: (y1 - y0) * k, jump: jump, norepeat: !!norepeat
    };
  }
  SIM.CHAOS = {
    tri: chaosDef(ngon(3, -Math.PI / 2), 1 - SIM.kissRatio(3)),
    square: chaosDef([[0, 0], [1, 0], [1, 1], [0, 1]], 1 / 2, true),
    penta: chaosDef(ngon(5, -Math.PI / 2), 1 - SIM.kissRatio(5)),
    hexa: chaosDef(ngon(6, 0), 1 - SIM.kissRatio(6)),
    carpet: chaosDef([[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]], 2 / 3)
  };
  /** 图形内部的一个随机起点（各顶点的随机凸组合）。 */
  SIM.chaosStart = function (def, rnd) {
    var x = 0, y = 0, sum = 0;
    def.verts.forEach(function (v) { var w = 0.05 - Math.log(1 - rnd()); x += v[0] * w; y += v[1] * w; sum += w; });
    return { x: x / sum, y: y / sum, last: -1 };
  };
  /** 跳一步，返回这次选中的顶点序号。 */
  SIM.chaosStep = function (def, st, rnd) {
    var n = def.verts.length, v;
    if (def.norepeat && st.last >= 0) { v = Math.floor(rnd() * (n - 1)); if (v >= st.last) v++; }
    else v = Math.floor(rnd() * n);
    st.x += (def.verts[v][0] - st.x) * def.jump;
    st.y += (def.verts[v][1] - st.y) * def.jump;
    st.last = v;
    return v;
  };
  /** 点 (x,y) 在三角形 T 里的重心坐标 [a,b,c]，a+b+c=1。 */
  SIM.bary = function (T, x, y) {
    var ax = T[0][0], ay = T[0][1], bx = T[1][0], by = T[1][1], cx = T[2][0], cy = T[2][1];
    var d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    var a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    var b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    return [a, b, 1 - a - b];
  };
  /** 点落在谢尔宾斯基三角形第几层的“空洞”里（1 = 正中间最大的倒三角）；不在前 levels 层的任何洞里返回 0。
   *  朝顶点 A 跳一半之后重心坐标 a' = (a+1)/2 ≥ 1/2，所以跳过 m 次的点不可能在前 m 层的洞里。 */
  SIM.sierpinskiHole = function (T, x, y, levels) {
    var w = SIM.bary(T, x, y), EPS = 1e-9;
    for (var L = 1; L <= levels; L++) {
      var i = w[0] >= 0.5 - EPS ? 0 : w[1] >= 0.5 - EPS ? 1 : w[2] >= 0.5 - EPS ? 2 : -1;
      if (i < 0) return L;
      w = [w[0] * 2, w[1] * 2, w[2] * 2];
      w[i] -= 1;
    }
    return 0;
  };

  /* ---------- 1.4 扔飞镖算 π ----------
   * 在边长 2 的正方形里均匀撒点，落进内切单位圆的概率 = 圆面积/正方形面积 = π·1² / 2² = π/4，
   * 所以 π ≈ 4 × 圆内点数 / 总点数。
   * 误差：每个点是一次成功率 q = π/4 的伯努利试验，估计值的标准差
   *   σ = 4·√(q(1−q)/N) = √(π(4−π)/N) ≈ 1.642/√N
   * ——想多准一位小数（误差缩小 10 倍），得多扔 100 倍的飞镖。
   */
  SIM.PI_SE = Math.sqrt(Math.PI * (4 - Math.PI));
  SIM.piRun = function (rnd, n) {
    var inside = 0;
    for (var i = 0; i < n; i++) { var x = rnd() * 2 - 1, y = rnd() * 2 - 1; if (x * x + y * y <= 1) inside++; }
    return inside;
  };

  /* ---------- 1.5 生命游戏 ----------
   * 康威的规则（B3/S23）：空格子周围正好 3 个活细胞 → 出生；活细胞周围有 2 或 3 个活细胞 → 存活；其余死亡。
   * 棋盘首尾相接（环面）。cur / nxt 是只含 0/1 的 Uint8Array，按行存放。返回下一代的活细胞数。
   */
  SIM.lifeStep = function (cur, nxt, cols, rows) {
    var pop = 0;
    for (var y = 0; y < rows; y++) {
      var yu = (y === 0 ? rows - 1 : y - 1) * cols, yc = y * cols, yd = (y === rows - 1 ? 0 : y + 1) * cols;
      for (var x = 0; x < cols; x++) {
        var xl = x === 0 ? cols - 1 : x - 1, xr = x === cols - 1 ? 0 : x + 1;
        var n = cur[yu + xl] + cur[yu + x] + cur[yu + xr] + cur[yc + xl] + cur[yc + xr] + cur[yd + xl] + cur[yd + x] + cur[yd + xr];
        var a = (n === 3 || (n === 2 && cur[yc + x] === 1)) ? 1 : 0;
        nxt[yc + x] = a;
        pop += a;
      }
    }
    return pop;
  };
  /* 经典图案（O 是活细胞）。已在 dev/test-sim.js 里验证：
   *   glider 滑翔机：4 代后整体向右下平移一格      lwss 轻型飞船：4 代后整体向左平移两格
   *   pulsar 脉冲星：周期 3                        gun 高斯帕滑翔机枪：周期 30，每 30 代发射一架滑翔机
   *   rpent R 五格：无限大棋盘上要到第 1103 代才稳定下来（剩 116 个细胞）；在首尾相接的小棋盘上结局不同 */
  SIM.LIFE = {
    glider: ['.O.', '..O', 'OOO'],
    lwss: ['.O..O', 'O....', 'O...O', 'OOOO.'],
    pulsar: [
      '..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............',
      '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
    rpent: ['.OO', 'OO.', '.O.'],
    gun: [
      '........................O...........',
      '......................O.O...........',
      '............OO......OO............OO',
      '...........O...O....OO............OO',
      'OO........O.....O...OO..............',
      'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........',
      '...........O...O....................',
      '............OO......................'],
    eater: ['OO..', 'O.O.', '..O.', '..OO']
  };
  /** 图案 → [[x,y],…] */
  SIM.lifeCells = function (pat) {
    var out = [];
    pat.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row.charAt(x) === 'O') out.push([x, y]); });
    return out;
  };
  SIM.lifePlace = function (grid, cols, rows, cells, ox, oy) {
    cells.forEach(function (c) {
      var x = ((ox + c[0]) % cols + cols) % cols, y = ((oy + c[1]) % rows + rows) % rows;
      grid[y * cols + x] = 1;
    });
  };
  /** 把整盘状态压成一个字符串（每 16 个格子一个字符），用来精确判断“这一盘以前出现过没有”。 */
  SIM.lifeKey = function (grid) {
    var parts = [], n = grid.length;
    for (var i = 0; i < n; i += 16) {
      var c = 0, m = Math.min(16, n - i);
      for (var b = 0; b < m; b++) c |= grid[i + b] << b;
      parts.push(c);
    }
    return String.fromCharCode.apply(null, parts);
  };
  /** 一个开局的“命运”：环面有限、规则确定，所以迟早进入循环。
   *  返回 { mu: 折腾了多少代才进入循环, lambda: 循环的周期, pop: 进入循环时的活细胞数 }；全灭算周期 1。 */
  SIM.lifeFate = function (grid, cols, rows, maxGen) {
    var a = Uint8Array.from(grid), b = new Uint8Array(a.length), seen = new Map(), pop = 0;
    seen.set(SIM.lifeKey(a), 0);
    for (var t = 1; t <= maxGen; t++) {
      pop = SIM.lifeStep(a, b, cols, rows);
      var tmp = a; a = b; b = tmp;
      var k = SIM.lifeKey(a);
      if (seen.has(k)) return { mu: seen.get(k), lambda: t - seen.get(k), pop: pop };
      seen.set(k, t);
    }
    return { mu: maxGen, lambda: 0, pop: pop, capped: true };
  };
  /* 滑翔机枪 + “吞噬者”。
   * 枪每 30 代朝右下发射一架滑翔机。棋盘首尾相接，滑翔机绕一圈回来会把枪撞坏，所以在航线上放一个
   * 吞噬者（eater 1）：它把滑翔机吃掉，自己毫发无损，整套装置就能一直运转（周期 30）。
   * 位置是在 Node 里穷举验证出来的：枪的左上角在 (1,1)，吞噬者的左上角在 (27+k, 13+k)，k ≥ 0 都成立
   * （滑翔机沿对角线飞，吞噬者平移 (1,1) 只是让它晚 4 代被吃）。横放需要棋盘至少 38×20；
   * 竖长的棋盘把整套装置沿对角线翻转（至少 20×38），滑翔机能飞得更远。dev/test-sim.js 对多种尺寸验证了“周期 30、枪完好”。
   */
  SIM.lifeGunLayout = function (cols, rows) {
    var okN = cols >= 38 && rows >= 20, okT = rows >= 38 && cols >= 20;
    if (!okN && !okT) return null;
    var kN = Math.min(cols - 32, rows - 19), kT = Math.min(rows - 32, cols - 19);
    var t = okT && (!okN || kT > kN);
    return { transpose: t, k: Math.max(0, Math.min(t ? kT : kN, 24)) };
  };
  SIM.lifeGunCells = function (cols, rows) {
    var lay = SIM.lifeGunLayout(cols, rows);
    if (!lay) return null;
    var cells = SIM.lifeCells(SIM.LIFE.gun).map(function (c) { return [c[0] + 1, c[1] + 1]; });
    SIM.lifeCells(SIM.LIFE.eater).forEach(function (c) { cells.push([c[0] + 27 + lay.k, c[1] + 13 + lay.k]); });
    return lay.transpose ? cells.map(function (c) { return [c[1], c[0]]; }) : cells;
  };

  /* ---------- 1.6 排序 ----------
   * 五种算法都生成一份“操作录像”（ops：每三个数一条 [类型, i, j]），组件按录像回放，一拍一次比较。
   * 比较次数的理论值（n 个互不相同的数、随机顺序）：
   *   冒泡（不提前收工）  n(n−1)/2，每次都一样
   *   选择                n(n−1)/2，每次都一样
   *   插入                平均 n(n−1)/4 + n − H_n
   *                       （第 i 个数前面平均有 i/2 个比它大，各比一次，再多比一次确认停下；它若是新的最小值就省掉这一次，概率 1/(i+1)）
   *   快速（末位当基准的 Lomuto 划分）  平均 2(n+1)H_n − 4n
   *                       （C_n = n−1 + (2/n)·Σ_{k<n} C_k 的解；划分后两段仍是随机顺序）
   *   归并（自顶向下）    平均 M(n) = M(⌈n/2⌉) + M(⌊n/2⌋) + n − a/(b+1) − b/(a+1)，a=⌈n/2⌉，b=⌊n/2⌋
   *                       （合并两段有序数列要比 a+b−“最后剩下不用比的那一截”次，那一截的平均长度是 a/(b+1)+b/(a+1)）
   *   其中 H_n = 1 + 1/2 + … + 1/n。
   */
  var OP_CMP = 0, OP_SWAP = 1, OP_ROT = 2, OP_MARK = 3, OP_FOCUS = 4, OP_PIVOT = 5;
  SIM.OP = { CMP: OP_CMP, SWAP: OP_SWAP, ROT: OP_ROT, MARK: OP_MARK, FOCUS: OP_FOCUS, PIVOT: OP_PIVOT };
  SIM.SORT_KEYS = ['bubble', 'selection', 'insertion', 'quick', 'merge'];
  SIM.sortTrace = function (name, input) {
    var a = Array.prototype.slice.call(input), n = a.length, ops = [], cmps = 0;
    function cmp(i, j) { ops.push(OP_CMP, i, j); cmps++; return a[i] - a[j]; }
    function swap(i, j) { var t = a[i]; a[i] = a[j]; a[j] = t; ops.push(OP_SWAP, i, j); }
    /* 把第 j 个数抽出来插到第 i 个位置，中间的整体右移一格（归并时用，保证画面上始终是同一组柱子） */
    function rot(i, j) { var t = a[j]; for (var k = j; k > i; k--) a[k] = a[k - 1]; a[i] = t; ops.push(OP_ROT, i, j); }
    function mark(i, j) { ops.push(OP_MARK, i, j); }
    function focus(i, j) { ops.push(OP_FOCUS, i, j); }
    var i, j, m;
    if (name === 'bubble') {
      for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - 1 - i; j++) if (cmp(j, j + 1) > 0) swap(j, j + 1);
        mark(n - 1 - i, n - 1 - i);
      }
      if (n) mark(0, 0);
    } else if (name === 'selection') {
      for (i = 0; i < n - 1; i++) {
        m = i;
        for (j = i + 1; j < n; j++) if (cmp(j, m) < 0) m = j;
        if (m !== i) swap(i, m);
        mark(i, i);
      }
      if (n) mark(n - 1, n - 1);
    } else if (name === 'insertion') {
      for (i = 1; i < n; i++) {
        j = i;
        while (j > 0 && cmp(j - 1, j) > 0) { swap(j - 1, j); j--; }
      }
      if (n) mark(0, n - 1);
    } else if (name === 'quick') {
      (function qs(lo, hi) {
        if (lo > hi) return;
        if (lo === hi) { mark(lo, lo); return; }
        focus(lo, hi);
        ops.push(OP_PIVOT, hi, 0);
        var p = lo;
        for (var q = lo; q < hi; q++) if (cmp(q, hi) < 0) { if (p !== q) swap(p, q); p++; }
        if (p !== hi) swap(p, hi);
        mark(p, p);
        qs(lo, p - 1);
        qs(p + 1, hi);
      })(0, n - 1);
    } else if (name === 'merge') {
      (function ms(lo, hi) {
        if (lo >= hi) return;
        var mid = (lo + hi) >> 1;
        ms(lo, mid);
        ms(mid + 1, hi);
        focus(lo, hi);
        var p = lo, q = mid + 1;                 // 左段 [p, q−1]，右段 [q, hi]
        while (p < q && q <= hi) {
          if (cmp(p, q) <= 0) p++;
          else { rot(p, q); p++; q++; }
        }
      })(0, n - 1);
      if (n) mark(0, n - 1);
    } else {
      throw new Error('未知的排序算法 ' + name);
    }
    if (n) focus(0, n - 1);
    return { ops: ops, comparisons: cmps, result: a };
  };
  /** 回放一条会改动数组的操作。 */
  SIM.sortApply = function (a, t, i, j) {
    var x, k;
    if (t === OP_SWAP) { x = a[i]; a[i] = a[j]; a[j] = x; }
    else if (t === OP_ROT) { x = a[j]; for (k = j; k > i; k--) a[k] = a[k - 1]; a[i] = x; }
  };
  SIM.sortTheory = function (name, n) {
    var H = 0, k;
    for (k = 1; k <= n; k++) H += 1 / k;
    if (name === 'bubble' || name === 'selection') return { mean: n * (n - 1) / 2, exact: true };
    if (name === 'insertion') return { mean: n * (n - 1) / 4 + n - H, exact: false };
    if (name === 'quick') return { mean: 2 * (n + 1) * H - 4 * n, exact: false };
    if (name === 'merge') {
      var memo = {};
      var M = function (m) {
        if (m <= 1) return 0;
        if (memo[m] != null) return memo[m];
        var a = Math.ceil(m / 2), b = Math.floor(m / 2);
        return (memo[m] = M(a) + M(b) + m - a / (b + 1) - b / (a + 1));
      };
      return { mean: M(n), exact: false };
    }
    return null;
  };

  /* ---------- 1.7 生日悖论 ----------
   * 假设一年 365 天、每天出生的可能性一样（不算 2 月 29 日）。n 个人里“没有任何两个人同一天”的概率：
   *   Q(n) = 365/365 × 364/365 × 363/365 × … × (365−n+1)/365
   * 至少有一对撞上的概率 P(n) = 1 − Q(n)。
   *   P(23) ≈ 0.5073（第一次超过一半），P(40) ≈ 0.8912，P(70) ≈ 0.9992。
   * 直觉偏低的原因：23 个人能配出 C(23,2) = 253 对；而“有人和‘我’同一天”只有 1 − (364/365)^22 ≈ 5.9%。
   */
  SIM.birthdayTheory = function (n, days) {
    days = days || 365;
    if (n > days) return 1;
    var q = 1;
    for (var k = 0; k < n; k++) q *= (days - k) / days;
    return 1 - q;
  };
  var bdaySeen = new Int32Array(365), bdayStamp = 0;
  /** 随机生成一屋 n 个人的生日（0…364），写进 out（可省略），返回这一屋有没有人撞日子。 */
  SIM.birthdayRoom = function (rnd, n, out) {
    var hit = false;
    bdayStamp++;
    for (var i = 0; i < n; i++) {
      var d = Math.floor(rnd() * 365);
      if (out) out[i] = d;
      if (bdaySeen[d] === bdayStamp) hit = true;
      bdaySeen[d] = bdayStamp;
    }
    return hit;
  };
  SIM.MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  /** 一年里的第 d 天（0 起）→ [月(0 起), 日(1 起)] */
  SIM.dayToDate = function (d) {
    var m = 0;
    while (d >= SIM.MONTH_DAYS[m]) { d -= SIM.MONTH_DAYS[m]; m++; }
    return [m, d + 1];
  };

  /* ====================================================================== *
   * 2. 公用小工具
   * ====================================================================== */
  function clampInt(v, lo, hi, dflt) {
    v = parseInt(v, 10);
    if (isNaN(v)) return dflt;
    return v < lo ? lo : v > hi ? hi : v;
  }
  function clampNum(v, lo, hi, dflt) {
    v = parseFloat(v);
    if (isNaN(v)) return dflt;
    return v < lo ? lo : v > hi ? hi : v;
  }
  /** 1234567 → '1,234,567' */
  function fmtN(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /** 0.6667 → '66.7%' */
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }

  /** 颜色和字体全部从 CSS 变量读（base.css 定义、theme.css 可覆盖），画布里不写死颜色。 */
  function readColors(node) {
    var cs = window.getComputedStyle(node);
    function v(name, fb) { var s = cs.getPropertyValue(name); s = s ? String(s).trim() : ''; return s || fb; }
    var ink = v('--ink', cs.color);
    /* 类型色在这里都是画在深色画布上的线条、点、柱子：优先读亮色 --c-*-hi（theme.css 提供），读不到再退回 --c-*-a */
    function hi(type) { return v('--c-' + type + '-hi', '') || v('--c-' + type + '-a', ink); }
    return {
      bg: v('--bg', 'transparent'), surface: v('--surface', 'transparent'), surface2: v('--surface-2', 'transparent'), surface3: v('--surface-3', 'transparent'),
      line: v('--line', ink), ink: ink, ink2: v('--ink-2', ink), muted: v('--muted', ink),
      on: v('--on-color', ink), on2: v('--on-color-2', ink),
      accent: v('--accent', ink), ok: v('--ok', ink), warn: v('--warn', ink), danger: v('--danger', ink),
      show: hi('show'), trio: hi('trio'), puzzle: hi('puzzle'),
      p1: v('--p1', ink), p2: v('--p2', ink), p3: v('--p3', ink),
      fNum: v('--font-num', cs.fontFamily), fUi: v('--font-ui', cs.fontFamily)
    };
  }
  function font(C, px, weight, num) { return (weight || 600) + ' ' + px + 'px ' + (num ? C.fNum : C.fUi); }

  /** 铺满 host 的画布。fit() 按 devicePixelRatio（上限 2）对齐像素；尺寸变了会把 changed 置真。 */
  function mkCanvas(host) {
    var el = document.createElement('canvas');
    host.appendChild(el);
    var o = { el: el, g: el.getContext('2d'), w: 0, h: 0, dpr: 1, changed: false };
    o.fit = function () {
      var w = host.clientWidth, h = host.clientHeight;
      if (w < 4 || h < 4) { o.w = 0; o.h = 0; return false; }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (el.width !== pw || el.height !== ph) { el.width = pw; el.height = ph; o.changed = true; }
      o.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.w = w; o.h = h; o.dpr = dpr;
      return true;
    };
    return o;
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** 动画循环：tick(dt 秒)。页面不可见时暂停，回来时不“追帧”；单帧 dt 上限 64ms，模拟步数由各组件自己限流。 */
  function mkLoop(tick) {
    var raf = 0, on = false, dead = false, last = 0;
    function frame(now) {
      raf = 0;
      if (!on || dead) return;
      var dt = now - last;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 64) dt = 64;
      tick(dt / 1000);
      if (on && !dead && !raf && !document.hidden) raf = window.requestAnimationFrame(frame);
    }
    function kick() {
      if (on && !dead && !raf && !document.hidden) { last = window.performance.now(); raf = window.requestAnimationFrame(frame); }
    }
    function onVis() {
      if (document.hidden) { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }
      else kick();
    }
    document.addEventListener('visibilitychange', onVis);
    return {
      start: function () { on = true; kick(); },
      stop: function () { on = false; if (raf) { window.cancelAnimationFrame(raf); raf = 0; } },
      running: function () { return on; },
      destroy: function () {
        dead = true; on = false;
        if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }
  function mkTimers() {
    var ids = [];
    return {
      set: function (fn, ms) {
        var id = window.setTimeout(function () { var k = ids.indexOf(id); if (k >= 0) ids.splice(k, 1); fn(); }, ms);
        ids.push(id);
        return id;
      },
      clearAll: function () { ids.forEach(function (id) { window.clearTimeout(id); }); ids = []; }
    };
  }

  /** 舞台骨架：一个竖排的容器 + 顶上一行提示语。屏幕宽裕时字大一号。 */
  function mkShell(root, id, ctx) {
    var sayEl = U.el('div.w-' + id + '-say', { attrs: { 'aria-live': 'polite' } });
    var head = U.el('div.w-' + id + '-head', [sayEl]);
    var wrap = U.el('div.w-' + id + '-wrap', [head]);
    root.appendChild(wrap);
    function roomy() { var s = ctx.size(); wrap.classList.toggle('is-roomy', s.w >= 380 && s.h >= 600); }
    roomy();
    return {
      wrap: wrap, head: head, roomy: roomy,
      say: function (t) { if (sayEl.textContent !== t) sayEl.textContent = t; }
    };
  }
  function mkBtn(text, cls, fn) {
    return U.el('button.jn-btn' + (cls || ''), { text: text, attrs: { type: 'button' }, on: { click: fn } });
  }
  /** 可折叠的「为什么」：默认收起，不挡着玩；点开是从底部升起的一页大白话。 */
  function mkWhy(wrap, id, title, text) {
    var body = U.el('div.w-' + id + '-why-body', { html: JN.md(text) });
    var panel = U.el('div.w-' + id + '-why', { attrs: { hidden: '', role: 'region', 'aria-label': title } });
    var btn = U.el('button.jn-chip.w-' + id + '-whybtn', { text: '为什么？', attrs: { type: 'button', 'aria-expanded': 'false' } });
    function toggle() {
      var open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('is-on', open);
    }
    btn.addEventListener('click', toggle);
    U.append(panel, [
      U.el('div.w-' + id + '-why-head', [U.el('b', { text: title }), mkBtn('收起', '.jn-btn--ghost.w-' + id + '-why-x', toggle)]),
      body
    ]);
    wrap.appendChild(panel);
    return {
      btn: btn,
      set: function (t, newTitle) { body.innerHTML = JN.md(t); if (newTitle) panel.querySelector('b').textContent = newTitle; },
      close: function () { if (!panel.hasAttribute('hidden')) toggle(); },
      /* 有些「为什么」一看标题就剧透（“为什么该换？”）：先藏着，等玩家亲手试出结果再露面 */
      hide: function () { btn.hidden = true; },
      show: function () { if (btn.hidden) { btn.hidden = false; btn.classList.add('jn-pop'); } }
    };
  }
  /** 小数字牌：上面一行小字说明，下面一个数。 */
  function mkStat(id, label, cls) {
    var k = U.el('span.w-' + id + '-stat-k', { text: label });
    var v = U.el('span.w-' + id + '-stat-v.jn-num', { text: '—' });
    return {
      el: U.el('div.w-' + id + '-stat' + (cls || ''), [k, v]),
      set: function (t) { if (v.textContent !== t) v.textContent = t; },
      label: function (t) { if (k.textContent !== t) k.textContent = t; }
    };
  }
  /** 分段选择：items = [{ key, text }]，返回 { el, set(key) }。 */
  function mkSeg(id, items, cur, onPick) {
    var el = U.el('div.jn-seg.w-' + id + '-seg', { attrs: { role: 'group' } });
    var btns = items.map(function (it) {
      var b = U.el('button', { text: it.text, attrs: { type: 'button' }, on: { click: function () { set(it.key); onPick(it.key); } } });
      el.appendChild(b);
      return b;
    });
    function set(key) { items.forEach(function (it, i) { btns[i].classList.toggle('is-on', it.key === key); btns[i].setAttribute('aria-pressed', it.key === key ? 'true' : 'false'); }); }
    set(cur);
    return { el: el, set: set, btns: btns };
  }

  /** 预览骨架：一块铺满的画布（需要“只增不擦”的底层时再加一块 back），自动循环；
   *  ctx.reduced 为真时只画一帧静态结果。setup(P) 返回 { tick(dt), draw(), still(), resize() }。 */
  function mkPreview(root, ctx, id, opts, setup) {
    var host = U.el('div.w-' + id + '-pv', { attrs: { 'aria-hidden': 'true' } });
    root.appendChild(host);
    var P = { W: 0, H: 0, C: readColors(root), back: opts && opts.back ? mkCanvas(host) : null };
    var cv = mkCanvas(host);
    P.cv = cv; P.g = cv.g;
    var impl = setup(P);
    var ready = false, dead = false;
    function boot() {
      if (dead) return;
      var okFront = cv.fit();
      if (P.back) P.back.fit();
      if (!okFront) { ready = false; return; }
      P.W = cv.w; P.H = cv.h; P.C = readColors(root);
      if (ctx.reduced && impl.still) impl.still();
      if (impl.resize) impl.resize();
      ready = true;
      impl.draw();
    }
    var loop = mkLoop(function (dt) { if (!ready) return; impl.tick(dt); impl.draw(); });
    ctx.onResize(boot);
    boot();
    if (!ctx.reduced) loop.start();
    return { destroy: function () { dead = true; loop.destroy(); } };
  }

  /* ====================================================================== *
   * 3.1 monty 三门问题
   * params: { doors: 3 }   doors: 100 时直接玩一百扇门的版本（主持人打开 98 扇空门）
   * ====================================================================== */
  function montyWhy(n) {
    var big = n > 3;
    return (big
      ? '你随手指的那扇门，猜中的机会只有 ' + n + ' 分之一。\n\n主持人**知道**球在哪。他把另外 ' + (n - 1) + ' 扇里的 ' + (n - 2) + ' 扇空门全打开，只留一扇不开——他是“特意”绕开那一扇的。球更可能在你随手指的门后面，还是在他特意留下的门后面？\n\n'
      : '先把 3 扇门换成 **100 扇**。你随手指一扇，猜中的机会只有 1%。主持人知道球在哪，他把另外 99 扇里的 98 扇空门全打开，只留一扇不开。球更可能在你随手指的那扇后面，还是在他“特意留下”的那扇后面？\n\n')
      + '只有一种情况换了会输：你第一下就指中了（' + (big ? n + ' 分之一' : '3 扇门时是 1/3') + '）。其余时候主持人别无选择，只能把有球的那扇留给你。\n\n'
      + (big ? '3 扇门是一回事，只是没这么明显：' : '回到 3 扇门：')
      + '第一下指中的机会是 1/3，这个数不会因为他开了一扇门就变大。剩下的 2/3，全挤到另一扇没开的门上了。\n\n'
      + '- 不换：赢面 ' + (big ? '1/' + n : '1/3') + '\n- 换：赢面 ' + (big ? (n - 1) + '/' + n : '2/3') + '\n\n'
      + '要是主持人自己也不知道球在哪、是瞎开的，那就真成一半一半了。关键在于他知道，而且绝不会把球开出来。';
  }
  function montyBall() {
    var s = U.svg('svg', { viewBox: '0 0 48 48', class: 'w-monty-ball', 'aria-hidden': 'true' });
    s.appendChild(U.svg('circle', { cx: 24, cy: 24, r: 21, class: 'w-monty-ball-fill' }));
    s.appendChild(U.svg('path', { d: 'M3 24h42M24 3v42M9.5 9c7 6.6 7 23.4 0 30M38.5 9c-7 6.6-7 23.4 0 30', class: 'w-monty-ball-line' }));
    return s;
  }

  JN.registerWidget({
    id: 'monty',
    name: '三门问题',
    rules: '几扇门里只有一扇后面藏着篮球。你先选一扇；主持人知道球在哪，他会把其余的空门打开，只留一扇不开。这时你可以换到那扇门，也可以不换。',
    mount: function (root, params, ctx) {
      params = params || {};
      var n = clampInt(params.doors, 3, 100, 3);
      var many = n > 10;
      var cols = many ? 10 : n <= 5 ? n : Math.ceil(n / 2);
      var th = SIM.montyTheory(n);
      var rnd = ctx.rng();
      var T = mkTimers();
      var alive = true;
      var tally = { swap: [0, 0], stay: [0, 0] };       // [赢, 玩]，手动和自动都记在这里
      var st = 'pick', prize = 0, pick = -1, other = -1;
      var auto = null;

      var sh = mkShell(root, 'monty', ctx);
      var why = mkWhy(sh.wrap, 'monty', '为什么该换？', montyWhy(n));
      why.hide();                                          // 玩完第一局（或自动玩过）才出现
      sh.head.appendChild(why.btn);

      var doorsEl = U.el('div.w-monty-doors' + (many ? '.is-many' : ''));
      var doors = U.range(n).map(function (i) {
        var inside = U.el('span.w-monty-in');
        var leaf = U.el('span.w-monty-leaf', many ? null : [U.el('span.w-monty-no.jn-num', { text: String(i + 1) })]);
        var el = U.el('button.w-monty-door', { attrs: { type: 'button', 'aria-label': (i + 1) + ' 号门' }, on: { click: function () { choose(i); } } }, [inside, leaf]);
        doorsEl.appendChild(el);
        return { el: el, inside: inside, leaf: leaf };
      });

      var hint = U.el('div.w-monty-hint');
      var btnSwap = mkBtn('换', '.w-monty-b', function () { decide(true); });
      var btnStay = mkBtn('不换', '.jn-btn--light.w-monty-b', function () { decide(false); });
      var btnAgain = mkBtn('再来一局', '.w-monty-b', newRound);
      var btnAny = mkBtn('懒得挑，随便来一扇', '.jn-btn--ghost.w-monty-b', function () { choose(Math.floor(rnd() * n)); });
      var act = U.el('div.w-monty-act');

      function mkRow(key, label) {
        var fill = U.el('i.w-monty-fill.is-' + key), mark = U.el('i.w-monty-mark');
        mark.style.left = (th[key] * 100) + '%';
        var val = U.el('span.w-monty-val.jn-num', { text: '—' }), sub = U.el('div.w-monty-sub');
        return {
          fill: fill, val: val, sub: sub,
          el: U.el('div.w-monty-row', [U.el('div.w-monty-line', [U.el('span.w-monty-key', { text: label }), U.el('span.w-monty-track', [fill, mark]), val]), sub])
        };
      }
      var rowSwap = mkRow('swap', '换'), rowStay = mkRow('stay', '不换');
      var boardEl = U.el('div.w-monty-board', [rowSwap.el, rowStay.el]);
      var autoBtn = mkBtn('自动玩 1000 次', '.jn-btn--ghost.w-monty-b', startAuto);
      var zeroBtn = mkBtn('清零', '.jn-btn--ghost.w-monty-b.is-narrow', function () {
        if (auto) return;
        tally.swap = [0, 0]; tally.stay = [0, 0];
        board();
      });
      U.append(sh.wrap, [doorsEl, act, boardEl, U.el('div.w-monty-ctl', [autoBtn, zeroBtn])]);

      function board() {
        [['swap', rowSwap], ['stay', rowStay]].forEach(function (p) {
          var w = tally[p[0]][0], g = tally[p[0]][1], r = g ? w / g : 0;
          p[1].fill.style.width = (r * 100).toFixed(2) + '%';
          p[1].val.textContent = g ? pct(r) : '—';
          p[1].sub.textContent = '赢 ' + fmtN(w) + ' / 玩 ' + fmtN(g) + ' 次 · 理论 ' + pct(th[p[0]]);
        });
      }
      function renderAct() {
        U.clear(act);
        if (st === 'pick') {
          hint.textContent = '↑ 点一扇门';
          U.append(act, many ? [btnAny] : [hint]);
        } else if (st === 'opening') {
          hint.textContent = '主持人正在开门……';
          U.append(act, [hint]);
        } else if (st === 'decide') {
          btnSwap.textContent = '换到 ' + (other + 1) + ' 号';
          btnStay.textContent = '不换，就 ' + (pick + 1) + ' 号';
          U.append(act, [btnSwap, btnStay]);
        } else {
          U.append(act, [btnAgain]);
        }
      }
      function layout() {
        sh.roomy();
        var w = doorsEl.clientWidth, h = doorsEl.clientHeight;
        if (w < 20 || h < 20) return;
        var gap = many ? 3 : n > 5 ? 8 : 12, dw = 0, dh = 0;
        if (many) {
          /* 门很多时：在几种排法里挑“每扇门最大、又还像门”的那种（矮胖的舞台排成 20 列的长廊） */
          [10, 20, 25].forEach(function (c) {
            var r = Math.ceil(n / c), a = (w - gap * (c - 1)) / c, b = (h - gap * (r - 1)) / r;
            b = Math.min(b, a * 2.2); a = Math.min(a, b);
            if (a * b > dw * dh) { dw = a; dh = b; cols = c; }
          });
        } else {
          var rowsN = Math.ceil(n / cols);
          dw = (w - gap * (cols - 1)) / cols; dh = (h - gap * (rowsN - 1)) / rowsN;
          dw = Math.min(dw, 132, dh * 0.62); dh = Math.min(dh, dw * 1.75);
        }
        doorsEl.style.setProperty('--cols', String(cols));
        doorsEl.style.setProperty('--dw', Math.floor(dw) + 'px');
        doorsEl.style.setProperty('--dh', Math.floor(dh) + 'px');
        doorsEl.style.setProperty('--gap', gap + 'px');
      }

      function newRound() {
        if (!alive) return;
        T.clearAll();
        st = 'pick';
        prize = Math.floor(rnd() * n);                  // 球先藏好，之后不会再动
        pick = other = -1;
        doors.forEach(function (d) {
          d.el.className = 'w-monty-door';
          d.leaf.style.transitionDelay = '';
          U.clear(d.inside);
        });
        sh.say(many ? n + ' 扇门，只有一扇后面有篮球。先选一扇。' : '篮球藏在其中一扇门后面。先选一扇。');
        renderAct();
      }
      function choose(i) {
        if (!alive || st !== 'pick') return;
        pick = i;
        other = SIM.montyHost(rnd, n, prize, pick);
        st = 'opening';
        doors[i].el.classList.add('is-pick');
        ctx.sfx('tap');
        sh.say('你选了 ' + (i + 1) + ' 号。主持人知道球在哪——看他怎么开门。');
        renderAct();
        T.set(openHost, 520);
      }
      function openHost() {
        if (!alive || st !== 'opening') return;
        var k = 0, first = -1;
        doors.forEach(function (d, i) {
          if (i === pick || i === other) return;
          if (first < 0) first = i;
          if (many) d.leaf.style.transitionDelay = (k * 7) + 'ms';
          d.el.classList.add('is-open');
          k++;
        });
        ctx.sfx('whoosh');
        T.set(function () {
          if (!alive) return;
          st = 'decide';
          sh.say(n === 3
            ? '他打开了 ' + (first + 1) + ' 号：空的。现在换到 ' + (other + 1) + ' 号，还是守着 ' + (pick + 1) + ' 号？'
            : '他一口气打开了 ' + (n - 2) + ' 扇空门，只留下 ' + (other + 1) + ' 号没开。换吗？');
          renderAct();
        }, many ? 950 : 420);
      }
      function decide(sw) {
        if (!alive || st !== 'decide') return;
        var fin = sw ? other : pick, win = fin === prize;
        var t = tally[sw ? 'swap' : 'stay'];
        t[1]++;
        if (win) t[0]++;
        st = 'reveal';
        doors.forEach(function (d, i) {
          d.leaf.style.transitionDelay = '';
          d.el.classList.add('is-open');
          d.el.classList.toggle('is-pick', i === fin);
          if (i === prize) { d.inside.appendChild(montyBall()); d.el.classList.add('is-prize'); }
        });
        sh.say((sw ? '换了——' : '没换——') + (win ? '赢了！球就在 ' + (prize + 1) + ' 号。' : '没中，球在 ' + (prize + 1) + ' 号。') + '多玩几局，看看下面两根柱子。');
        renderAct();
        board();
        why.show();
        ctx.sfx(win ? 'win' : 'bad');
        ctx.haptic(win ? [20, 40, 60] : 30);
        if (win) ctx.confetti();
        ctx.done({ win: win, text: (sw ? '换了，' : '没换，') + (win ? '赢了' : '没中') });
      }

      /* 自动玩：“换”和“不换”各玩 1000 局（各自独立发牌）。先慢后快，看两根柱子从乱跳到站稳。 */
      function autoBatch(k) {
        while (k-- > 0) {
          tally.swap[1]++; if (SIM.montyPlay(rnd, n, true)) tally.swap[0]++;
          tally.stay[1]++; if (SIM.montyPlay(rnd, n, false)) tally.stay[0]++;
        }
      }
      var loop = mkLoop(function (dt) {
        if (!auto) { loop.stop(); return; }
        auto.t += dt;
        auto.acc += (6 + 150 * auto.t * auto.t) * dt;   // 局/秒：越玩越快
        var k = Math.min(Math.floor(auto.acc), 60, auto.left);
        auto.acc -= k; auto.left -= k;
        autoBatch(k);
        board();
        if (auto.left <= 0) endAuto();
      });
      function startAuto() {
        if (!alive || auto) return;
        auto = { t: 0, acc: 0, left: 1000 };
        autoBtn.disabled = true;
        boardEl.classList.add('is-auto');
        ctx.sfx('tap');
        if (ctx.reduced) { autoBatch(auto.left); auto.left = 0; endAuto(); return; }
        loop.start();
      }
      function endAuto() {
        auto = null;
        loop.stop();
        autoBtn.disabled = false;
        boardEl.classList.remove('is-auto');
        board();
        why.show();
        ctx.sfx('good');
      }

      ctx.onResize(layout);
      board();
      newRound();
      layout();
      return {
        destroy: function () {
          alive = false;
          auto = null;
          loop.destroy();
          T.clearAll();
        }
      };
    },

    /* 预览：三扇门先慢慢玩三局，然后快进；下面“换 / 不换”两根柱子赛跑，各自站到 2/3 和 1/3。 */
    preview: function (root, params, ctx) {
      var n = clampInt(params && params.doors, 3, 100, 3);
      var th = SIM.montyTheory(n), rnd = ctx.rng();
      return mkPreview(root, ctx, 'monty', null, function (P) {
        var games = 0, wins = 0, t = 0, cur = null, curT = 0, acc = 0;
        function deal() { cur = SIM.montyDeal(rnd, n); games++; if (cur.other === cur.prize) wins++; curT = 0; }
        function reset() { games = 0; wins = 0; t = 0; cur = null; curT = 0; acc = 0; }
        function door(g, x, y, w, h, i, C) {
          var open = cur && (curT >= 0.8 || (curT >= 0.4 && i !== cur.pick && i !== cur.other));
          var r = Math.min(6, w * 0.18);
          if (!open) {
            g.globalAlpha = 0.92; g.fillStyle = C.on;
            roundRect(g, x, y, w, h, r); g.fill();
            if (w > 14) { g.globalAlpha = 0.35; g.fillStyle = C.bg; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.54, Math.max(1.5, w * 0.07), 0, 6.2832); g.fill(); }
          } else {
            g.globalAlpha = 0.3; g.strokeStyle = C.on; g.lineWidth = 1.5;
            roundRect(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); g.stroke();
            if (i === cur.prize) {
              g.globalAlpha = 1; g.fillStyle = C.p1;
              g.beginPath(); g.arc(x + w / 2, y + h * 0.62, Math.min(w, h) * 0.3, 0, 6.2832); g.fill();
            }
          }
          if (cur && i === cur.pick) {
            g.globalAlpha = 1; g.strokeStyle = C.accent; g.lineWidth = w > 14 ? 3 : 2;
            roundRect(g, x - 2.5, y - 2.5, w + 5, h + 5, r + 2); g.stroke();
          }
          g.globalAlpha = 1;
        }
        function bar(g, C, y, h, label, val, target, color) {
          var W = P.W, x0 = 50, x1 = W - 54, bw = x1 - x0;
          g.fillStyle = C.on; g.globalAlpha = 1;
          g.font = font(C, 13, 700); g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(label, 10, y + h / 2);
          g.globalAlpha = 0.18; roundRect(g, x0, y, bw, h, h / 2); g.fill();
          g.globalAlpha = 1; g.fillStyle = color;
          if (val > 0) { roundRect(g, x0, y, Math.max(h, bw * val), h, h / 2); g.fill(); }
          g.strokeStyle = C.on; g.globalAlpha = 0.9; g.lineWidth = 1.5; g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(x0 + bw * target, y - 4); g.lineTo(x0 + bw * target, y + h + 4); g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1; g.fillStyle = C.on; g.font = font(C, 15, 800, true); g.textAlign = 'right';
          g.fillText(games ? Math.round(val * 100) + '%' : '—', W - 8, y + h / 2);
        }
        return {
          still: function () { reset(); for (var i = 0; i < 600; i++) deal(); curT = 9; },
          tick: function (dt) {
            t += dt; curT += dt;
            if (t < 3.3) { if (!cur || curT >= 1.1) deal(); }
            else if (t < 8) {
              var u = t - 3.3;
              acc += (5 + 40 * u * u) * dt;
              var k = Math.min(Math.floor(acc), 40);
              acc -= k;
              while (k-- > 0) { deal(); curT = 9; }
            } else if (t > 10) reset();
          },
          draw: function () {
            var g = P.g, W = P.W, H = P.H, C = P.C, i;
            g.clearRect(0, 0, W, H);
            var top = 8, dh = H * 0.5 - top;
            if (n <= 5) {
              var dw = Math.min(W * 0.19, dh * 0.64), gap = dw * 0.42, x0 = (W - (n * dw + (n - 1) * gap)) / 2;
              for (i = 0; i < n; i++) door(g, x0 + i * (dw + gap), top, dw, dh, i, C);
            } else {
              var pc = n > 40 ? 20 : 10, pr = Math.ceil(n / pc), cw = Math.min((W - 20) / pc, dh / pr * 0.9), ch = dh / pr, gx = (W - cw * pc) / 2;
              for (i = 0; i < n; i++) door(g, gx + (i % pc) * cw + 1.5, top + Math.floor(i / pc) * ch + 1.5, cw - 3, ch - 3, i, C);
            }
            var bh = Math.max(10, Math.min(18, H * 0.085)), by = H * 0.5 + (H * 0.5 - 2 * bh) / 3;
            bar(g, C, by, bh, '换', games ? wins / games : 0, th.swap, C.accent);
            bar(g, C, by + bh + (H * 0.5 - 2 * bh) / 3, bh, '不换', games ? 1 - wins / games : 0, th.stay, C.on);
          }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.2 galton 高尔顿板
   * params: { rows: 10, p: 0.5, mode: 'free' | 'bet' }
   *   free：小球不停落下，可调速度和“向右的概率”，底部叠画二项分布的理论曲线
   *   bet ：猜球游戏。每颗球落下前押一个槽，押中得 1/概率 分，十颗球后看总分（默认 6 排钉子、7 个槽）
   * ====================================================================== */
  /* 模拟器：每颗球出发时就把一路上的左右拐（真随机）定好，之后只是把它演出来。
   * s 是球的进度，单位“排”：−1…0 从顶上落到第一颗钉子，j…j+1 从第 j 排弹到下一排，rows…rows+1 落进槽里。
   * 推进速度按“排/秒”算，与帧率无关；同屏的球有上限，超出的直接记数。 */
  function mkGalton(rows, p, rnd) {
    var S = {
      rows: rows, p: p, pmf: SIM.binomPMF(rows, p),
      counts: new Int32Array(rows + 1), total: 0, balls: [],
      rate: 14, speed: 12, launching: true, acc: 0, maxBalls: 140, onLand: null
    };
    function land(k) { S.counts[k]++; S.total++; if (S.onLand) S.onLand(k); }
    S.clear = function () {
      for (var i = 0; i <= rows; i++) S.counts[i] = 0;
      S.total = 0; S.balls.length = 0; S.acc = 0;
    };
    S.setP = function (np) { S.p = np; S.pmf = SIM.binomPMF(rows, np); S.clear(); };
    S.launch = function () {
      var path = 0, k = 0;
      for (var j = 0; j < rows; j++) if (rnd() < S.p) { path |= 1 << j; k++; }
      if (S.balls.length >= S.maxBalls) { land(k); return; }
      S.balls.push({ s: -1, path: path, k: k });
    };
    S.step = function (dt) {
      var i, w = 0, bs = S.balls, ds = S.speed * dt;
      if (S.launching) {
        S.acc = Math.min(S.acc + S.rate * dt, 24);      // 单帧最多补发 24 颗
        while (S.acc >= 1) { S.acc -= 1; S.launch(); }
      }
      for (i = 0; i < bs.length; i++) {
        var b = bs[i];
        b.s += ds;
        if (b.s >= rows + 1) land(b.k); else bs[w++] = b;
      }
      bs.length = w;
    };
    return S;
  }
  function galtonGeom(W, H, rows, padX) {
    var dx = (W - 2 * padX) / (rows + 1);
    var top = 16;
    var binH = U.clamp(H * 0.36, 36, 210);
    var dy = Math.max(3, Math.min(dx * 0.9, (H - top - binH - 2) / (rows + 0.9)));
    var yBin = top + (rows + 0.9) * dy;
    return {
      dx: dx, dy: dy, top: top, padX: padX, cx: W / 2, yBin: yBin, bottom: H - 2, binH: H - 2 - yBin,
      rb: U.clamp(dx * 0.2, 2, 6.5), rp: U.clamp(dx * 0.08, 1.2, 2.6)
    };
  }
  /* o: { pv 预览配色, curve 是否画理论曲线, padX, sel 押中的槽, flashK / flashT / flashHit 落槽闪一下 } */
  function galtonDraw(g, W, H, S, C, o) {
    var rows = S.rows, G = galtonGeom(W, H, rows, o.padX || 0), k, j, i;
    var cBar = o.pv ? C.on : C.show, cBall = o.pv ? C.accent : C.p1, cPeg = o.pv ? C.on : C.muted, cCurve = o.pv ? C.on : C.accent;
    g.clearRect(0, 0, W, H);
    var pmax = 0, maxCount = 0;
    for (k = 0; k <= rows; k++) { if (S.pmf[k] > pmax) pmax = S.pmf[k]; if (S.counts[k] > maxCount) maxCount = S.counts[k]; }
    /* 每颗球在柱子里占的高度 u：一开始一颗一格，球多了以后整体压扁，让“理论上最高的槽”正好顶到 90% */
    var u = Math.min(G.rb * 1.8, 0.9 * G.binH / Math.max(1, pmax * S.total), 0.985 * G.binH / Math.max(1, maxCount));
    function barH(k2) { return S.counts[k2] * u; }

    if (o.sel != null && o.sel >= 0) {
      g.globalAlpha = 0.16; g.fillStyle = C.accent;
      g.fillRect(G.padX + o.sel * G.dx, G.yBin - G.dy * 0.2, G.dx, G.bottom - G.yBin + G.dy * 0.2);
      g.globalAlpha = 1;
    }
    for (k = 0; k <= rows; k++) {
      var h = barH(k);
      if (h > 0) {
        var isFlash = o.flashK === k && o.flashT < 0.6;
        g.globalAlpha = o.pv ? 0.88 : 1;
        g.fillStyle = isFlash ? (o.flashHit ? C.accent : C.ink) : cBar;
        roundRect(g, G.padX + k * G.dx + 1.5, G.bottom - h, G.dx - 3, h, Math.min(3, G.dx * 0.2));
        g.fill();
      }
    }
    g.globalAlpha = o.pv ? 0.35 : 1;
    g.strokeStyle = o.pv ? C.on : C.line; g.lineWidth = 1;
    g.beginPath();
    for (k = 0; k <= rows + 1; k++) { var lx = Math.round(G.padX + k * G.dx) + 0.5; if (lx > W - 0.5) lx = W - 0.5; g.moveTo(lx, G.yBin - G.dy * 0.2); g.lineTo(lx, G.bottom); }
    g.moveTo(G.padX, G.bottom + 0.5); g.lineTo(W - G.padX, G.bottom + 0.5);
    g.stroke();
    g.globalAlpha = 1;

    if (o.curve) {
      /* 理论曲线：二项分布 P(k)，按“最高的槽 = 90% 槽高”画，球越多柱子越贴近它 */
      g.strokeStyle = cCurve; g.lineWidth = 2; g.setLineDash([5, 4]); g.globalAlpha = 0.95;
      g.beginPath();
      var px = 0, py = 0;
      for (k = 0; k <= rows; k++) {
        var x = G.padX + (k + 0.5) * G.dx, y = G.bottom - S.pmf[k] / pmax * 0.9 * G.binH;
        if (k === 0) g.moveTo(x, y); else g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
      }
      g.lineTo(px, py);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = cCurve;
      for (k = 0; k <= rows; k++) { g.beginPath(); g.arc(G.padX + (k + 0.5) * G.dx, G.bottom - S.pmf[k] / pmax * 0.9 * G.binH, 2.2, 0, 6.2832); g.fill(); }
      g.globalAlpha = 1;
    }

    g.fillStyle = cPeg; g.globalAlpha = o.pv ? 0.55 : 0.9;
    for (j = 0; j < rows; j++) {
      var yj = G.top + (j + 0.9) * G.dy;
      for (i = 0; i <= j; i++) { g.beginPath(); g.arc(G.cx + (i - j / 2) * G.dx, yj, G.rp, 0, 6.2832); g.fill(); }
    }
    g.globalAlpha = 1;

    g.fillStyle = cBall;
    var off = G.rb + G.rp, bs = S.balls;
    for (i = 0; i < bs.length; i++) {
      var b = bs[i], s = b.s, bx, by, t;
      if (s < 0) {
        t = s + 1;
        bx = G.cx; by = (G.top - G.rb) + (G.top + 0.9 * G.dy - off - (G.top - G.rb)) * t * t;
      } else if (s < rows) {
        j = Math.floor(s); t = s - j;
        var kx = 0;
        for (k = 0; k < j; k++) kx += (b.path >> k) & 1;
        var xa = G.cx + (kx - j / 2) * G.dx, xb = xa + (((b.path >> j) & 1) ? 0.5 : -0.5) * G.dx;
        var ya = G.top + (j + 0.9) * G.dy - off, yb = j + 1 < rows ? ya + G.dy : G.yBin;
        bx = xa + (xb - xa) * t;
        by = ya + (yb - ya) * t * t - G.dy * 0.2 * 4 * t * (1 - t) * (1 - t);
      } else {
        t = Math.min(1, s - rows);
        bx = G.padX + (b.k + 0.5) * G.dx;
        var yLand = Math.max(G.yBin, G.bottom - barH(b.k) - G.rb);
        by = G.yBin + (yLand - G.yBin) * t * t;
      }
      g.beginPath(); g.arc(bx, by, G.rb, 0, 6.2832); g.fill();
    }
  }

  function nChooseK(n, k) { var c = 1; for (var i = 0; i < k; i++) c = c * (n - i) / (i + 1); return Math.round(c); }
  /* 「为什么」里的数字都按实际的钉子排数现算：走法总数 2^rows，落到中间的走法 C(rows, ⌊rows/2⌋) */
  function galtonWhyFree(rows) {
    var half = Math.floor(rows / 2), ways = nChooseK(rows, half), total = Math.pow(2, rows);
    return '每颗球每碰一颗钉子，就像抛一次硬币：左，或者右。\n\n'
      + '想落到最边上，得**每一次**都拐向同一边——' + rows + ' 排钉子，机会是 ' + fmtN(total) + ' 分之一。想落到' + (rows % 2 ? '中间' : '正中间') + '，只要向右 ' + half + ' 次、向左 ' + (rows - half) + ' 次，先后顺序随便：一共有 ' + fmtN(ways) + ' 种走法。路多的地方球就多，所以中间高、两边矮。\n\n'
      + '这个形状叫**二项分布**（黄色虚线就是算出来的）。钉子排数越多，它越像一口钟——连投 100 个罚球能进几个、一袋薯片到底有多重，很多“好多小随机加在一起”的东西都长这样。\n\n'
      + '把“向右的概率”拧到 0.7：每次都更偏右一点，整座山就挪过去了，但还是一座山。';
  }
  function galtonWhyBet(rows) {
    var half = Math.floor(rows / 2), ways = nChooseK(rows, half), total = Math.pow(2, rows);
    var odds = SIM.galtonOdds(SIM.binomPMF(rows, 0.5));
    var miss = Math.pow(1 - 1 / total, 10);                 // 十颗球全押最边上，一次都不中的机会
    return '每个槽的得分 = 1 ÷ 落进这个槽的机会（四舍五入到一位小数）。' + rows + ' 排钉子，一共 ' + fmtN(total) + ' 种走法：\n\n'
      + '- ' + (rows % 2 ? '中间' : '正中间') + '：' + fmtN(ways) + ' 种走法，机会 ' + ways + '/' + total + '，押中得 ' + odds[half] + ' 分\n'
      + '- 最边上：只有 1 种走法，机会 1/' + total + '，押中得 ' + odds[0] + ' 分\n\n'
      + '有意思的是：这样定分以后，**不管押哪儿，长期平均下来每颗球都是 1 分左右**。押中间不是“平均更赚”，而是“稳”：十颗球大概能中 ' + Math.round(10 * ways / total) + ' 颗。\n\n'
      + '押最边上呢？十颗球里一次都不中的机会有 ' + pct(miss, 0) + '。中一次就 ' + odds[0] + ' 分——可大多数时候是抱着零分回家。\n\n'
      + '只有十颗球的时候，稳比赌大的管用。这就是为什么大家都往中间押。';
  }

  JN.registerWidget({
    id: 'galton',
    name: '高尔顿板',
    rules: '小球从顶上落下，每碰到一颗钉子就随机向左或向右拐，最后落进底下的槽里。看看哪些槽里的球最多。猜球玩法：每颗球落下前先押一个槽，押中得分，十颗球后看总分。',
    mount: function (root, params, ctx) {
      params = params || {};
      var bet = params.mode === 'bet';
      var rows = clampInt(params.rows, 4, 14, bet ? 6 : 10);
      var rnd = ctx.rng();
      var S = mkGalton(rows, bet ? 0.5 : clampNum(params.p, 0.1, 0.9, 0.5), rnd);   // 猜球固定用公平的钉子
      var C = readColors(root);
      var alive = true, doneOnce = false;
      var view = { curve: !bet, padX: 0, sel: -1, flashK: -1, flashT: 9, flashHit: false };

      var sh = mkShell(root, 'galton', ctx);
      var why = mkWhy(sh.wrap, 'galton', bet ? '为什么大家都押中间？' : '为什么会堆成一座山？', bet ? galtonWhyBet(rows) : galtonWhyFree(rows));
      why.hide();                                          // 山堆出来（或十颗球押完）以后才出现
      sh.head.appendChild(why.btn);
      var stage = U.el('div.w-galton-stage' + (bet ? '.is-bet' : ''));
      var cv = mkCanvas(stage);
      sh.wrap.appendChild(stage);

      function draw() { if (cv.fit()) galtonDraw(cv.g, cv.w, cv.h, S, C, view); }
      var loop = mkLoop(function (dt) {
        S.step(dt);
        view.flashT += dt;
        afterStep();
        draw();
      });
      var afterStep = function () {};

      if (!bet) {
        /* ---------- 自由模式 ---------- */
        var SPEEDS = { slow: { rate: 3, speed: 6 }, fast: { rate: 16, speed: 12 }, flood: { rate: 170, speed: 28 } };
        var LIMIT = 4000, paused = false, shownTotal = -1;
        var tN = mkStat('galton', '已经落下'), tSim = mkStat('galton', '最热槽·模拟'), tTh = mkStat('galton', '最热槽·理论');
        var hot = 0;
        var pVal = U.el('span.w-galton-pval.jn-num');
        var range = U.el('input.jn-range.w-galton-range', { attrs: { type: 'range', min: '10', max: '90', step: '5', value: String(Math.round(S.p * 20) * 5), 'aria-label': '向右的概率' } });
        var pauseBtn = mkBtn('暂停', '.jn-btn--ghost.w-galton-b', function () { setPaused(!paused); });
        var seg = mkSeg('galton', [{ key: 'slow', text: '慢' }, { key: 'fast', text: '快' }, { key: 'flood', text: '瀑布' }], 'fast', function (key) { setSpeed(key); });
        var clearBtn = mkBtn('清空', '.jn-btn--ghost.w-galton-b', function () {
          S.clear(); S.launching = true; shownTotal = -1;
          sayRule();
          if (paused) setPaused(false);
          stats(); draw();
        });
        U.append(sh.wrap, [
          U.el('div.w-galton-stats', [tN.el, tSim.el, tTh.el]),
          U.el('label.w-galton-prow', [U.el('span', { text: '向右的概率' }), range, pVal]),
          U.el('div.w-galton-ctl', [pauseBtn, seg.el, clearBtn])
        ]);
        var setSpeed = function (key) { S.rate = SPEEDS[key].rate; S.speed = SPEEDS[key].speed; };
        var setPaused = function (v) {
          paused = v;
          pauseBtn.textContent = v ? '继续' : '暂停';
          if (v) loop.stop(); else { if (S.total >= LIMIT) { S.clear(); shownTotal = -1; sayRule(); } S.launching = true; loop.start(); }
        };
        var sayRule = function () {
          sh.say(Math.abs(S.p - 0.5) < 1e-9
            ? '每碰一颗钉子，随机向左或向右。猜猜哪个槽最后最满？'
            : '每次有 ' + Math.round(S.p * 100) + '% 的机会向右。山会往哪边挪？');
        };
        var applyP = function () {
          var p = clampInt(range.value, 10, 90, 50) / 100;
          S.setP(p);
          hot = 0;
          for (var k = 1; k <= rows; k++) if (S.pmf[k] > S.pmf[hot] + 1e-12) hot = k;
          pVal.textContent = p.toFixed(2);
          var mid = Math.abs(p - 0.5) < 1e-9 && rows % 2 === 0;
          tSim.label(mid ? '正中槽·模拟' : '最热槽·模拟');
          tTh.label(mid ? '正中槽·理论' : '最热槽·理论');
          tTh.set(pct(S.pmf[hot]));
          shownTotal = -1;
          sayRule();
        };
        var stats = function () {
          if (S.total === shownTotal) return;
          shownTotal = S.total;
          tN.set(fmtN(S.total) + ' 颗');
          tSim.set(S.total ? pct(S.counts[hot] / S.total) : '—');
        };
        afterStep = function () {
          stats();
          if (S.total >= 100) why.show();
          if (!doneOnce && S.total >= 200) { doneOnce = true; ctx.done({ text: '落了 200 颗球' }); }
          if (S.total >= LIMIT && S.launching) {
            S.launching = false;
            sh.say('攒够 ' + fmtN(LIMIT) + ' 颗了，山形已经站稳。拧一拧概率，或者清空再来。');
          }
          if (!S.launching && !S.balls.length && !paused) { paused = true; pauseBtn.textContent = '再来'; loop.stop(); }
        };
        range.addEventListener('input', function () {
          applyP();
          if (paused) setPaused(false); else S.launching = true;
          draw();
        });
        cv.el.addEventListener('pointerdown', function () { if (!paused && S.total < LIMIT) { S.launch(); ctx.sfx('pop'); } });
        setSpeed('fast');
        applyP();
        stats();
        if (ctx.reduced) { for (var q = 0; q < 300; q++) { S.counts[SIM.galtonDrop(rnd, rows, S.p)]++; S.total++; } stats(); why.show(); }
        loop.start();
      } else {
        /* ---------- 猜球游戏 ---------- */
        var ROUND = 10;
        var odds = SIM.galtonOdds(S.pmf);
        var B = { ball: 0, tenths: 0, hits: 0, phase: 'bet', rainTo: 0 };
        S.launching = false;
        S.speed = 7.5;
        var tBall = mkStat('galton', '第几颗'), tScore = mkStat('galton', '总分'), tPrev = mkStat('galton', '上一轮');
        var prevScore = null;
        var fmtOdd = function (o) { return o >= 100 || o % 1 === 0 ? String(Math.round(o)) : o.toFixed(1); };
        var oddBtns = odds.map(function (o, k) {
          return U.el('button.w-galton-odd', {
            attrs: { type: 'button', 'aria-label': '押第 ' + (k + 1) + ' 槽，押中得 ' + fmtOdd(o) + ' 分' },
            on: { click: function () { placeBet(k); } }
          }, [U.el('b.jn-num', { text: fmtOdd(o) }), U.el('i', { text: '分' })]);
        });
        var oddsRow = U.el('div.w-galton-odds', oddBtns);
        oddsRow.style.setProperty('--bins', String(rows + 1));
        var againBtn = mkBtn('再来十颗', '.w-galton-b', function () { newRound(); });
        var rainBtn = mkBtn('撒 300 颗看看', '.jn-btn--ghost.w-galton-b', function () { rain(); });
        var ctl = U.el('div.w-galton-ctl');
        U.append(sh.wrap, [oddsRow, U.el('div.w-galton-stats', [tBall.el, tScore.el, tPrev.el]), ctl]);
        var score = function () { return (B.tenths / 10).toFixed(1); };
        var betStats = function () {
          tBall.set(Math.min(B.ball + (B.phase === 'over' || B.phase === 'rain' ? 0 : 1), ROUND) + ' / ' + ROUND);
          tScore.set(score() + ' 分');
          tPrev.set(prevScore == null ? '—' : prevScore + ' 分');
        };
        var lockOdds = function (v) { oddBtns.forEach(function (b, k) { b.disabled = v; b.classList.toggle('is-on', k === view.sel); }); };
        var newRound = function () {
          if (!alive) return;
          if (B.ball >= ROUND) prevScore = score();          // 两个人轮流玩时，方便和上一轮比
          S.clear(); S.launching = false; S.speed = 7.5;
          B.ball = 0; B.tenths = 0; B.hits = 0; B.phase = 'bet';
          view.sel = -1; view.curve = false; view.flashK = -1;
          U.clear(ctl);
          ctl.appendChild(U.el('div.w-galton-tip', { text: '槽下面的数字 = 押中能得的分。越难中，分越高。' }));
          lockOdds(false);
          sh.say('十颗球。每颗落下之前，先押它会掉进哪个槽。');
          betStats();
          draw();
        };
        var placeBet = function (k) {
          if (!alive || B.phase !== 'bet') return;
          B.phase = 'fly';
          view.sel = k;
          lockOdds(true);
          S.launch();
          ctx.sfx('tap');
          sh.say('第 ' + (B.ball + 1) + ' 颗出发——你押第 ' + (k + 1) + ' 槽，中了得 ' + fmtOdd(odds[k]) + ' 分。');
          loop.start();
        };
        var rain = function () {
          if (!alive || B.phase !== 'over') return;
          B.phase = 'rain';
          B.rainTo = S.total + 300;
          view.curve = true; view.sel = -1;
          lockOdds(true);
          S.rate = 110; S.speed = 24; S.launching = true;
          rainBtn.disabled = true;
          sh.say('看——球最爱往中间挤。黄线是算出来的形状。');
          loop.start();
        };
        S.onLand = function (k) {
          if (B.phase !== 'fly') return;
          var hit = k === view.sel;
          B.ball++;
          view.flashK = k; view.flashT = 0; view.flashHit = hit;
          if (hit) { B.tenths += Math.round(odds[k] * 10); B.hits++; ctx.sfx('good'); ctx.haptic(30); } else ctx.sfx('tick');
          if (B.ball >= ROUND) {
            B.phase = 'over';
            var total = B.tenths / 10;
            sh.say('十颗球，总分 ' + score() + '（押中 ' + B.hits + ' 次）。平均线是 10 分——' + (total >= 10 ? '你在线上。' : '这回在线下。'));
            U.clear(ctl);
            rainBtn.disabled = false;
            U.append(ctl, [againBtn, rainBtn]);
            lockOdds(true);
            why.show();
            if (total >= 20) ctx.confetti();
            ctx.sfx(total >= 10 ? 'win' : 'bad');
            ctx.done({ win: total >= 10, text: '十颗球 ' + score() + ' 分' });
          } else {
            B.phase = 'bet';
            view.sel = -1;
            lockOdds(false);
            sh.say((hit ? '中了！+' + fmtOdd(odds[k]) + ' 分。' : '落在第 ' + (k + 1) + ' 槽，没中。') + '第 ' + (B.ball + 1) + ' 颗押哪儿？');
          }
          betStats();
        };
        afterStep = function () {
          if (B.phase === 'rain' && S.total >= B.rainTo) S.launching = false;
          if (!S.balls.length && !S.launching && view.flashT > 0.7) loop.stop();
        };
        cv.el.addEventListener('pointerdown', function (e) {
          var r = cv.el.getBoundingClientRect();
          if (r.width > 0) placeBet(U.clamp(Math.floor((e.clientX - r.left) / r.width * (rows + 1)), 0, rows));
        });
        newRound();
      }

      ctx.onResize(function () { C = readColors(root); sh.roomy(); draw(); });
      draw();
      return {
        destroy: function () {
          alive = false;
          S.onLand = null;
          loop.destroy();
        }
      };
    },

    /* 预览：小球不断落下，堆成钟形；攒够了停一下，清空重来。 */
    preview: function (root, params, ctx) {
      var p = clampNum(params && params.p, 0.1, 0.9, 0.5), rnd = ctx.rng(), ROWS = 8;
      return mkPreview(root, ctx, 'galton', null, function (P) {
        var S = mkGalton(ROWS, p, rnd), hold = 0;
        S.rate = 30; S.speed = 13;
        return {
          still: function () { S.clear(); S.launching = false; for (var i = 0; i < 500; i++) { S.counts[SIM.galtonDrop(rnd, ROWS, p)]++; S.total++; } },
          tick: function (dt) {
            if (S.total >= 450) {
              S.launching = false;
              if (!S.balls.length) { hold += dt; if (hold > 1.8) { S.clear(); S.launching = true; hold = 0; } }
            }
            S.step(dt);
          },
          draw: function () { galtonDraw(P.g, P.W, P.H, S, P.C, { pv: true, curve: true, padX: 8 }); }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.3 chaosgame 混沌游戏
   * params: { variant: 'tri' | 'square' | 'penta' | 'hexa' | 'carpet' }
   * ====================================================================== */
  var CHAOS_ORDER = ['tri', 'square', 'penta', 'hexa', 'carpet'];
  var CHAOS_GUESS = ['一团乱点', '均匀铺满', '有规律的图案'];
  var CHAOS_UI = {
    tri: {
      tab: '三角', hole: true,
      ask: '三个顶点，一个点在里面随机乱跳几千次。猜猜会画出什么？',
      rule: '规则：随机挑一个顶点，朝它跳一半，点个点。',
      verdict: '三角形里套着三角形——中间那个大洞，一个点都没落进去。',
      why: '每跳一次，你和被选中的那个顶点之间的距离正好**减半**。\n\n所以不管原来在哪儿，跳完这一步，一定落在靠近某个顶点的那个“半大”小三角形里——三个角各有一个。正中间那块倒着的三角形，谁也跳不进去。\n\n再跳一步，同样的事缩小一号：每个小三角形的正中间，也跳不进去。再跳，再小一号……一层套一层的空洞，就是你看到的图案。\n\n骰子是公平的，三个顶点被选中的次数差不多。随机的只是**先后顺序**，规则把“乱”收拾成了形状。数学家管它叫谢尔宾斯基三角形。'
    },
    square: {
      tab: '方形',
      ask: '四个顶点，随机跳，但不许连着两次选同一个。猜猜会画出什么？',
      rule: '规则：四个顶点里随机挑，但不许和上一次相同；朝它跳一半。',
      verdict: '就多了一条“不许连选”，方块里冒出一层套一层的花纹。',
      why: '四个顶点、每次跳一半——要是随便选，点会把整个方块均匀铺满，什么图案都没有。\n\n这里只多了一条规矩：**不许连着两次选同一个顶点**。就这一条，方块里有些地方变成“永远跳不到”：想落在紧挨某个顶点的角落，得连着朝它跳两次，而这正好被禁止了。\n\n每个角上缺一块，缺的那块旁边又按同样的规矩缺更小的一块……一条小小的禁令，挖出了一整套花纹。'
    },
    penta: {
      tab: '五边',
      ask: '五个顶点，每次朝选中的顶点跳到 0.618 的位置。猜猜会画出什么？',
      rule: '规则：五个顶点里随机挑一个，朝它跳到 0.618 的位置。',
      verdict: '五个小五边形围成一圈，每个里面又是五个更小的。',
      why: '五个顶点，每次不是跳一半，而是跳到 **0.618** 的位置——就是黄金分割。\n\n为什么偏偏是这个数？每跳一次，相当于把整个图形“缩小”后搬到那个顶点旁边。缩到原来的 0.382 倍（1 − 0.618）时，五个缩小的五边形刚好肩并肩挨着，不重叠也不留缝。\n\n于是：大五边形 = 五个小五边形围成一圈，每个小的里面又是五个更小的……中间永远空着。跳得多一点或少一点，图案就糊了。'
    },
    hexa: {
      tab: '六边',
      ask: '六个顶点，每次朝选中的顶点跳到三分之二的位置。猜猜会画出什么？',
      rule: '规则：六个顶点里随机挑一个，朝它跳到三分之二的位置。',
      verdict: '六个小六边形围成一圈，中间空出一片雪花。',
      why: '六个顶点，每次跳到三分之二的位置，也就是把图形缩到原来的三分之一、挤到那个顶点旁边。\n\n六个缩小的六边形正好围成一圈、角顶着角；每个里面又是六个更小的。\n\n中间空出来的那一片，边缘是一圈越看越细的锯齿，像一片雪花——数学家管这种锯齿叫科赫曲线。'
    },
    carpet: {
      tab: '地毯',
      ask: '四个角加四条边的中点，随机挑一个，朝它跳到三分之二。会画出什么？',
      rule: '规则：四个角加四条边的中点，随机挑一个，朝它跳到三分之二的位置。',
      verdict: '一块全是方洞的地毯：洞的周围是小洞，小洞周围是更小的洞。',
      why: '八个落脚目标：四个角，加四条边的中点。每次跳到三分之二的位置，相当于把整块图形缩成三分之一，摆到那个目标旁边。\n\n八个小方块围成一圈，正好把正中间那一格空了出来。每个小方块里又空出自己的正中间……洞里套洞，这块布叫谢尔宾斯基地毯。'
    }
  };

  JN.registerWidget({
    id: 'chaosgame',
    name: '混沌游戏',
    rules: '几个顶点，一个会跳的点。每次随机选一个顶点，朝它跳过去一段（三角形是跳一半），在落脚的地方画一个点。重复几千次，看会画出什么。',
    mount: function (root, params, ctx) {
      params = params || {};
      var key = CHAOS_UI[params.variant] ? params.variant : 'tri';
      var def = SIM.CHAOS[key], ui = CHAOS_UI[key];
      var rnd = ctx.rng(), C = readColors(root), alive = true;
      var MAXP = 30000, VERDICT_AT = 3000;
      var xs = new Float32Array(MAXP), ys = new Float32Array(MAXP), vs = new Uint8Array(MAXP);
      var N = 0, st = null, freq = [], holeHits = 0;
      var phase = 'guess', guess = -1, verdictDone = false;
      var anim = null, burst = 0, auto = false, autoT = 0, acc = 0;
      var sc = 1, ox = 0, oy = 0, vcol = [];

      var sh = mkShell(root, 'chaosgame', ctx);
      var why = mkWhy(sh.wrap, 'chaosgame', '乱跳怎么会跳出图案？', ui.why);
      why.hide();                                          // 图案浮现以后才出现
      sh.head.appendChild(why.btn);
      var stage = U.el('div.w-chaosgame-stage');
      var dots = mkCanvas(stage), over = mkCanvas(stage);
      var tN = mkStat('chaosgame', '点数'), tSim = mkStat('chaosgame', '最常选中'), tTh = mkStat('chaosgame', '理论各占'), tHole = mkStat('chaosgame', '大洞里有');
      var ctl = U.el('div.w-chaosgame-ctl');
      var guessBtns = CHAOS_GUESS.map(function (t, i) {
        return U.el('button.jn-chip.w-chaosgame-guess', { text: t, attrs: { type: 'button' }, on: { click: function () { pickGuess(i); } } });
      });
      var stepBtn = mkBtn('一步', '.jn-btn--ghost.w-chaosgame-b', function () { stepOnce(); });
      var hundredBtn = mkBtn('一百步', '.jn-btn--ghost.w-chaosgame-b', function () { if (phase === 'play' && N < MAXP) { burst += 100; loop.start(); } });
      var autoBtn = mkBtn('自动', '.w-chaosgame-b', function () { setAuto(!auto); });
      var resetBtn = mkBtn('重来', '.jn-btn--ghost.w-chaosgame-b', function () { restart(); });
      var tabs = mkSeg('chaosgame', CHAOS_ORDER.map(function (k) { return { key: k, text: CHAOS_UI[k].tab }; }), key, function (k) { setVariant(k); });
      U.append(sh.wrap, [stage, U.el('div.w-chaosgame-stats', [tN.el, tSim.el, tTh.el, tHole.el]), ctl, tabs.el]);

      function X(u) { return ox + u * sc; }
      function Y(v) { return oy + v * sc; }
      function inside(ux, uy) {
        var n = def.verts.length, sign = 0;
        for (var i = 0; i < n; i++) {
          var a = def.verts[i], b = def.verts[(i + 1) % n];
          var cr = (b[0] - a[0]) * (uy - a[1]) - (b[1] - a[1]) * (ux - a[0]);
          if (Math.abs(cr) < 1e-12) continue;
          if (sign === 0) sign = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sign) return false;
        }
        return true;
      }
      function plot(i) {
        var g = dots.g, s = i < 40 ? 3.2 : i < 400 ? 2.2 : 1.4;
        g.fillStyle = vcol[vs[i] % vcol.length];
        g.fillRect(X(xs[i]) - s / 2, Y(ys[i]) - s / 2, s, s);
      }
      /* 全量重画：尺寸变了、换规则、重来时才做；平时只往底层画布上添新的点 */
      function draw() {
        if (!dots.fit() || !over.fit()) return;
        dots.changed = over.changed = false;
        var m = 20;
        sc = Math.max(10, Math.min((dots.w - 2 * m) / def.w, (dots.h - 2 * m) / def.h));
        ox = (dots.w - def.w * sc) / 2; oy = (dots.h - def.h * sc) / 2;
        vcol = [C.show, C.accent, C.trio, C.p2, C.ok, C.p1, C.puzzle, C.ink2];
        dots.g.clearRect(0, 0, dots.w, dots.h);
        for (var i = 0; i < N; i++) plot(i);
        drawOver();
      }
      function drawOver() {
        if (!dots.fit() || !over.fit()) return;
        if (dots.changed || over.changed) { draw(); return; }
        var g = over.g, n = def.verts.length, i, v;
        g.clearRect(0, 0, over.w, over.h);
        g.strokeStyle = C.line; g.lineWidth = 1;
        g.beginPath();
        for (i = 0; i <= n; i++) { v = def.verts[i % n]; if (i === 0) g.moveTo(X(v[0]), Y(v[1])); else g.lineTo(X(v[0]), Y(v[1])); }
        g.stroke();
        if (anim) {
          v = def.verts[anim.v];
          g.globalAlpha = Math.max(0, 1 - anim.t);
          g.strokeStyle = C.ink; g.lineWidth = 1.5; g.setLineDash([4, 4]);
          g.beginPath(); g.moveTo(X(anim.fx), Y(anim.fy)); g.lineTo(X(v[0]), Y(v[1])); g.stroke();
          g.setLineDash([]);
          g.strokeStyle = vcol[anim.v % vcol.length]; g.lineWidth = 3;
          g.beginPath(); g.arc(X(v[0]), Y(v[1]), 11 + 8 * anim.t, 0, 6.2832); g.stroke();
          g.globalAlpha = 1;
        }
        var rv = n > 6 ? 8 : 10;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(C, rv + 2, 800);
        for (i = 0; i < n; i++) {
          v = def.verts[i];
          g.fillStyle = vcol[i % vcol.length];
          g.beginPath(); g.arc(X(v[0]), Y(v[1]), rv, 0, 6.2832); g.fill();
          g.fillStyle = C.bg;
          g.fillText(String.fromCharCode(65 + i), X(v[0]), Y(v[1]) + 0.5);
        }
        if (st) {
          g.strokeStyle = C.ink; g.lineWidth = 2;
          g.beginPath(); g.arc(X(st.x), Y(st.y), N === 0 ? 6 : 4.5, 0, 6.2832); g.stroke();
          if (N === 0) {
            g.fillStyle = C.ink; g.beginPath(); g.arc(X(st.x), Y(st.y), 2.2, 0, 6.2832); g.fill();
            g.font = font(C, 12, 600); g.textAlign = 'left';
            g.fillText('起点', X(st.x) + 10, Y(st.y));
          }
        }
      }
      function stats() {
        var mx = 0;
        for (var i = 0; i < freq.length; i++) if (freq[i] > mx) mx = freq[i];
        tN.set(fmtN(N));
        tSim.set(N ? pct(mx / N) : '—');
        tHole.set(holeHits + ' 个');
      }
      function renderCtl() {
        U.clear(ctl);
        U.append(ctl, phase === 'guess' ? guessBtns : [stepBtn, hundredBtn, autoBtn, resetBtn]);
        autoBtn.textContent = auto ? '暂停' : '自动';
      }
      function restart() {
        N = 0; holeHits = 0; anim = null; burst = 0; acc = 0; verdictDone = false;
        auto = false; autoT = 0;
        freq = def.verts.map(function () { return 0; });
        st = SIM.chaosStart(def, rnd);
        tHole.el.hidden = !ui.hole;
        tTh.set(pct(1 / def.verts.length));
        renderCtl();
        stats();
        sh.say(phase === 'guess' ? ui.ask : ui.rule + '点图里可换起点。');
        draw();
      }
      function setVariant(k) {
        key = k; def = SIM.CHAOS[k]; ui = CHAOS_UI[k];
        why.set(ui.why);
        restart();
      }
      function pickGuess(i) {
        if (!alive || phase !== 'guess') return;
        guess = i; phase = 'play';
        ctx.sfx('tap');
        renderCtl();
        sh.say('你猜：' + CHAOS_GUESS[i] + '。' + ui.rule);
      }
      function stepRaw() {
        var v = SIM.chaosStep(def, st, rnd);
        xs[N] = st.x; ys[N] = st.y; vs[N] = v;
        freq[v]++;
        if (ui.hole && SIM.sierpinskiHole(def.verts, st.x, st.y, 1)) holeHits++;
        plot(N);
        N++;
        return v;
      }
      function afterSteps() {
        stats();
        if (!verdictDone && N >= VERDICT_AT) {
          verdictDone = true;
          var right = guess === 2;
          sh.say((guess >= 0 ? '你猜的是“' + CHAOS_GUESS[guess] + '”。' : '') + ui.verdict);
          ctx.sfx(right ? 'win' : 'good');
          if (right) ctx.confetti();
          ctx.done({ win: guess < 0 ? undefined : right, text: fmtN(N) + ' 个点画出了图案' });
          guess = -1;
          why.show();
        }
        if (N >= MAXP) {
          auto = false; burst = 0;
          autoBtn.textContent = '自动';
          sh.say('三万个点了，够清楚了。换一种规则试试？');
        }
      }
      function stepOnce() {
        if (!alive || phase !== 'play' || N >= MAXP) return;
        var fx = st.x, fy = st.y, v = stepRaw();
        anim = { fx: fx, fy: fy, v: v, t: 0 };
        ctx.sfx('tick');
        afterSteps();
        if (N < VERDICT_AT) sh.say('第 ' + fmtN(N) + ' 步：抽中 ' + String.fromCharCode(65 + v) + '，朝它跳' + (def.jump === 0.5 ? '一半' : '到 ' + (Math.abs(def.jump - 2 / 3) < 1e-9 ? '三分之二' : def.jump.toFixed(3)) + ' 处') + '。');
        if (ctx.reduced) { anim = null; drawOver(); } else loop.start();
      }
      function setAuto(v) {
        auto = !!v && phase === 'play' && N < MAXP;
        autoT = 0;
        autoBtn.textContent = auto ? '暂停' : '自动';
        if (auto) loop.start();
      }
      var loop = mkLoop(function (dt) {
        var k = 0;
        if (anim) { anim.t += dt / 0.55; if (anim.t >= 1) anim = null; }
        if (burst > 0) {
          acc += 220 * dt;
          k = Math.min(Math.floor(acc), burst, 60);
          burst -= k; acc -= k;
        } else if (auto) {
          autoT += dt;
          acc += Math.min(30 + 500 * autoT * autoT, 4000) * dt;   // 点/秒：先慢后快
          k = Math.min(Math.floor(acc), 320);                     // 单帧上限
          acc -= k;
        } else acc = 0;
        if (k > 0) {
          var fx = st.x, fy = st.y, v = -1;
          while (k-- > 0 && N < MAXP) { fx = st.x; fy = st.y; v = stepRaw(); }
          if (v >= 0) anim = { fx: fx, fy: fy, v: v, t: 0.45 };
          afterSteps();
        }
        drawOver();
        if (!anim && burst <= 0 && !auto) loop.stop();
      });
      over.el.addEventListener('pointerdown', function (e) {
        if (!alive || phase !== 'play') return;
        var r = over.el.getBoundingClientRect();
        var ux = (e.clientX - r.left - ox) / sc, uy = (e.clientY - r.top - oy) / sc;
        if (N === 0 && inside(ux, uy)) {
          st.x = ux; st.y = uy; st.last = -1;
          ctx.sfx('pop');
          drawOver();
        } else stepOnce();
      });

      ctx.onResize(function () { C = readColors(root); sh.roomy(); draw(); });
      restart();
      return { destroy: function () { alive = false; auto = false; burst = 0; loop.destroy(); } };
    },

    /* 预览：头几步慢慢跳（看得见规则），然后越跳越快，图形浮现；停一会儿，从头再来。 */
    preview: function (root, params, ctx) {
      var key = CHAOS_UI[params && params.variant] ? params.variant : 'tri';
      var def = SIM.CHAOS[key], rnd = ctx.rng();
      return mkPreview(root, ctx, 'chaosgame', { back: true }, function (P) {
        var MAXN = 7000, xs = new Float32Array(MAXN), ys = new Float32Array(MAXN), vs = new Uint8Array(MAXN);
        var n = 0, t = 0, acc = 0, hold = 0, st = SIM.chaosStart(def, rnd), last = null, sc = 1, ox = 0, oy = 0, cols = [];
        function plot(i) {
          var g = P.back.g, s = i < 30 ? 2.6 : 1.5;
          g.fillStyle = cols[vs[i] % cols.length];
          g.fillRect(ox + xs[i] * sc - s / 2, oy + ys[i] * sc - s / 2, s, s);
        }
        function one() {
          var fx = st.x, fy = st.y, v = SIM.chaosStep(def, st, rnd);
          xs[n] = st.x; ys[n] = st.y; vs[n] = v;
          plot(n); n++;
          last = { fx: fx, fy: fy, v: v };
        }
        function reset() { n = 0; t = 0; acc = 0; hold = 0; last = null; st = SIM.chaosStart(def, rnd); P.back.g.clearRect(0, 0, P.W, P.H); }
        return {
          resize: function () {
            var m = 12;
            sc = Math.max(10, Math.min((P.W - 2 * m) / def.w, (P.H - 2 * m) / def.h));
            ox = (P.W - def.w * sc) / 2; oy = (P.H - def.h * sc) / 2;
            cols = [P.C.on, P.C.accent, P.C.p1];
            P.back.g.clearRect(0, 0, P.W, P.H);
            for (var i = 0; i < n; i++) plot(i);
          },
          still: function () { n = 0; st = SIM.chaosStart(def, rnd); for (var i = 0; i < MAXN; i++) { var v = SIM.chaosStep(def, st, rnd); xs[n] = st.x; ys[n] = st.y; vs[n] = v; n++; } last = null; t = 99; },
          tick: function (dt) {
            t += dt;
            if (n < MAXN) {
              var u = Math.max(0, t - 1.6);
              acc += Math.min(4 + 500 * u * u, 3000) * dt;
              var k = Math.min(Math.floor(acc), 200, MAXN - n);
              acc -= k;
              while (k-- > 0) one();
            } else { hold += dt; if (hold > 2) reset(); }
          },
          draw: function () {
            var g = P.g, C = P.C, i, v;
            g.clearRect(0, 0, P.W, P.H);
            if (last && t < 3) {
              v = def.verts[last.v];
              g.globalAlpha = 0.8; g.strokeStyle = C.on; g.lineWidth = 1.2; g.setLineDash([3, 3]);
              g.beginPath(); g.moveTo(ox + last.fx * sc, oy + last.fy * sc); g.lineTo(ox + v[0] * sc, oy + v[1] * sc); g.stroke();
              g.setLineDash([]);
              g.lineWidth = 2; g.beginPath(); g.arc(ox + st.x * sc, oy + st.y * sc, 4, 0, 6.2832); g.stroke();
              g.globalAlpha = 1;
            }
            for (i = 0; i < def.verts.length; i++) {
              v = def.verts[i];
              g.fillStyle = cols[i % cols.length];
              g.beginPath(); g.arc(ox + v[0] * sc, oy + v[1] * sc, last && t < 3 && last.v === i ? 6.5 : 4.5, 0, 6.2832); g.fill();
            }
          }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.4 montepi 扔飞镖算圆周率
   * params: {}（暂时没有可调参数）
   * ====================================================================== */
  var PI_WHY = '把正方形的边长当作 2，里面那个圆的半径就是 1。\n\n- 正方形的面积：2 × 2 = 4\n- 圆的面积：π × 1 × 1 = π\n\n闭着眼乱扔，飞镖落在哪儿都一样可能，所以“落在圆里的比例”≈ 圆的面积 ÷ 正方形的面积 = **π ÷ 4**。反过来，比例 × 4 ≈ π。\n\n我们根本没去量圆，只是数了数点——用“瞎蒙”来算数，这招叫蒙特卡洛方法，科学家用它算那些公式搞不定的东西。\n\n不过它很慢：下面那条线越往右越贴近 π，可贴近得越来越费劲。想多准一位小数，得多扔 **100 倍**的飞镖。浅色的喇叭口，就是“扔了这么多个，大概能准到哪儿”。';

  JN.registerWidget({
    id: 'montepi',
    name: '扔飞镖算圆周率',
    rules: '正方形里画一个正好顶到四条边的圆。闭着眼往正方形里扔飞镖（落点完全随机），数一数落在圆里的占多少，再乘以 4，就是圆周率的估计值。',
    mount: function (root, params, ctx) {
      var rnd = ctx.rng(), C = readColors(root), alive = true;
      var MAXS = 20000, LIMIT = 100000, PI = Math.PI;
      var px = new Float32Array(MAXS), py = new Float32Array(MAXS), big = new Uint8Array(MAXS);
      var total = 0, inside = 0, sN = [], sE = [], nextSample = 1;
      var auto = false, autoT = 0, acc = 0, doneOnce = false;
      var side = 0, bx = 0, by = 0;

      var sh = mkShell(root, 'montepi', ctx);
      var why = mkWhy(sh.wrap, 'montepi', '为什么乘以 4 就是 π？', PI_WHY);
      sh.head.appendChild(why.btn);
      var boardHost = U.el('div.w-montepi-board'), chartHost = U.el('div.w-montepi-chart');
      var board = mkCanvas(boardHost), chart = mkCanvas(chartHost);
      var tEst = mkStat('montepi', '模拟估计'), tPi = mkStat('montepi', '真正的 π'), tErr = mkStat('montepi', '差了');
      tPi.set('3.1416');
      var autoBtn = mkBtn('自动', '.w-montepi-b', function () { setAuto(!auto); });
      U.append(sh.wrap, [
        boardHost,
        U.el('div.w-montepi-stats', [tEst.el, tPi.el, tErr.el]),
        chartHost,
        U.el('div.w-montepi-ctl', [
          mkBtn('扔 1 个', '.jn-btn--ghost.w-montepi-b', function () { toss(1, true); }),
          mkBtn('扔 100 个', '.jn-btn--ghost.w-montepi-b', function () { toss(100, false); }),
          autoBtn,
          mkBtn('清空', '.jn-btn--ghost.w-montepi-b', function () { reset(); })
        ])
      ]);

      function dot(x, y, isIn, isBig) {
        var g = board.g, X = bx + (x + 1) / 2 * side, Y = by + (y + 1) / 2 * side;
        g.fillStyle = isIn ? C.show : C.p1;
        if (isBig) { g.beginPath(); g.arc(X, Y, 3.2, 0, 6.2832); g.fill(); }
        else g.fillRect(X - 0.9, Y - 0.9, 1.8, 1.8);
      }
      function frame() {
        var g = board.g;
        g.strokeStyle = C.ink2; g.lineWidth = 1.5;
        g.strokeRect(bx + 0.75, by + 0.75, side - 1.5, side - 1.5);
        g.beginPath(); g.arc(bx + side / 2, by + side / 2, side / 2 - 0.75, 0, 6.2832); g.stroke();
      }
      function drawBoard() {
        if (!board.fit()) return;
        board.changed = false;
        var g = board.g;
        side = Math.max(20, Math.min(board.w, board.h) - 2);
        bx = (board.w - side) / 2; by = (board.h - side) / 2;
        g.clearRect(0, 0, board.w, board.h);
        g.fillStyle = C.surface;
        g.fillRect(bx, by, side, side);
        var n = Math.min(total, MAXS);
        for (var i = 0; i < n; i++) dot(px[i], py[i], px[i] * px[i] + py[i] * py[i] <= 1, big[i] === 1);
        frame();
      }
      function drawChart() {
        if (!chart.fit()) return;
        var g = chart.g, W = chart.w, H = chart.h, L = 30, R = 8, T = 5, B = 15, SPAN = 0.6, i, n, e;
        var lx = Math.log(Math.max(100, total)) / Math.LN10;
        function X(v) { return L + (W - L - R) * (Math.log(v) / Math.LN10) / lx; }
        function Y(v) { return T + (H - T - B) * (1 - (U.clamp(v, PI - SPAN, PI + SPAN) - (PI - SPAN)) / (2 * SPAN)); }
        g.clearRect(0, 0, W, H);
        /* 喇叭口：π ± 2σ，σ = 1.642/√N（见 1.4 的推导） */
        g.fillStyle = C.accent; g.globalAlpha = 0.14;
        g.beginPath();
        for (i = 0; i <= 40; i++) { n = Math.pow(10, lx * i / 40); if (i === 0) g.moveTo(X(n), Y(PI + 2 * SIM.PI_SE / Math.sqrt(n))); else g.lineTo(X(n), Y(PI + 2 * SIM.PI_SE / Math.sqrt(n))); }
        for (i = 40; i >= 0; i--) { n = Math.pow(10, lx * i / 40); g.lineTo(X(n), Y(PI - 2 * SIM.PI_SE / Math.sqrt(n))); }
        g.closePath(); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = C.line; g.lineWidth = 1;
        g.fillStyle = C.muted; g.font = font(C, 10, 500, true); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        var names = ['1', '10', '100', '1千', '1万', '10万', '100万'];
        g.beginPath();
        for (e = 0; e <= lx + 1e-9; e++) { var tx = Math.round(X(Math.pow(10, e))) + 0.5; g.moveTo(tx, T); g.lineTo(tx, H - B); g.fillText(names[e] || '', Math.min(tx, W - 12), H - 3); }
        g.stroke();
        g.strokeStyle = C.accent; g.lineWidth = 1.5; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(L, Y(PI)); g.lineTo(W - R, Y(PI)); g.stroke();
        g.setLineDash([]);
        g.fillStyle = C.accent; g.font = font(C, 12, 800, true); g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText('π', L - 8, Y(PI));
        if (sN.length) {
          g.strokeStyle = C.show; g.lineWidth = 2; g.lineJoin = 'round';
          g.beginPath();
          for (i = 0; i < sN.length; i++) { if (i === 0) g.moveTo(X(sN[i]), Y(sE[i])); else g.lineTo(X(sN[i]), Y(sE[i])); }
          g.lineTo(X(total), Y(4 * inside / total));
          g.stroke();
          g.fillStyle = C.ink; g.beginPath(); g.arc(X(total), Y(4 * inside / total), 3, 0, 6.2832); g.fill();
        }
      }
      var sayAt = 0;
      function refresh() {
        if (total) {
          var est = 4 * inside / total, d = est - PI, now = window.performance.now();
          tEst.set(est.toFixed(4));
          tErr.set((d >= 0 ? '+' : '−') + Math.abs(d).toFixed(4));
          if (!auto || now - sayAt > 180) {                 // 自动扔的时候，这行算式一秒只改五六次（它是读屏会念的区域）
            sayAt = now;
            sh.say('圆里 ' + fmtN(inside) + ' ÷ 全部 ' + fmtN(total) + ' × 4 = ' + est.toFixed(4));
          }
        } else {
          tEst.set('—'); tErr.set('—');
          sh.say('闭着眼往方块里扔飞镖。圆里的 ÷ 全部的 × 4，会是多少？');
        }
        drawChart();
        if (!doneOnce && total >= 1000) { doneOnce = true; ctx.done({ text: '扔了 ' + fmtN(total) + ' 个，π ≈ ' + (4 * inside / total).toFixed(3) }); }
      }
      function throwN(k, isBig) {
        for (var i = 0; i < k; i++) {
          var x = rnd() * 2 - 1, y = rnd() * 2 - 1, isIn = x * x + y * y <= 1;
          if (total < MAXS) { px[total] = x; py[total] = y; big[total] = isBig ? 1 : 0; }
          total++;
          if (isIn) inside++;
          if (side > 0) dot(x, y, isIn, isBig);
          if (total >= nextSample) { sN.push(total); sE.push(4 * inside / total); nextSample = total < 200 ? total + 1 : Math.ceil(total * 1.02); }
        }
      }
      function toss(k, isBig) {
        if (!alive || total >= LIMIT) return;
        if (board.fit() && board.changed) drawBoard();
        throwN(Math.min(k, LIMIT - total), isBig);
        frame();
        ctx.sfx(k > 1 ? 'whoosh' : 'pop');
        refresh();
      }
      function reset() {
        setAuto(false);
        total = 0; inside = 0; sN = []; sE = []; nextSample = 1; acc = 0;
        drawBoard();
        refresh();
      }
      function setAuto(v) {
        auto = !!v && total < LIMIT;
        autoT = 0;
        autoBtn.textContent = auto ? '暂停' : '自动';
        if (auto) loop.start(); else { loop.stop(); if (total) refresh(); }
      }
      var loop = mkLoop(function (dt) {
        if (!auto) { loop.stop(); return; }
        autoT += dt;
        acc += Math.min(20 + 350 * autoT * autoT, 6000) * dt;    // 个/秒：先慢后快
        var k = Math.min(Math.floor(acc), 600, LIMIT - total);  // 单帧上限 600 个
        acc -= k;
        if (k > 0) {
          if (board.fit() && board.changed) drawBoard();
          throwN(k, false);
          frame();
          refresh();
        }
        if (total >= LIMIT) {
          setAuto(false);
          sh.say('十万个了，估计值 ' + (4 * inside / total).toFixed(4) + '。想再准一位小数，得扔一千万个。');
        }
      });
      board.el.addEventListener('pointerdown', function () { toss(1, true); });

      ctx.onResize(function () { C = readColors(root); sh.roomy(); drawBoard(); drawChart(); });
      drawBoard();
      refresh();
      return { destroy: function () { alive = false; auto = false; loop.destroy(); } };
    },

    /* 预览：点越撒越多，右边的数字一点点逼近 3.14。 */
    preview: function (root, params, ctx) {
      var rnd = ctx.rng();
      return mkPreview(root, ctx, 'montepi', { back: true }, function (P) {
        var MAXN = 9000, px = new Float32Array(MAXN), py = new Float32Array(MAXN);
        var n = 0, inside = 0, t = 0, acc = 0, hold = 0, side = 10, bx = 0, by = 0;
        function dot(i) {
          var g = P.back.g, isIn = px[i] * px[i] + py[i] * py[i] <= 1;
          g.globalAlpha = isIn ? 1 : 0.6;
          g.fillStyle = isIn ? P.C.accent : P.C.on;
          g.fillRect(bx + (px[i] + 1) / 2 * side - 0.8, by + (py[i] + 1) / 2 * side - 0.8, 1.6, 1.6);
          g.globalAlpha = 1;
        }
        function board() {
          var g = P.back.g;
          g.clearRect(0, 0, P.W, P.H);
          for (var i = 0; i < n; i++) dot(i);
        }
        function add() {
          var x = rnd() * 2 - 1, y = rnd() * 2 - 1;
          px[n] = x; py[n] = y;
          if (x * x + y * y <= 1) inside++;
          n++;
        }
        return {
          resize: function () {
            side = Math.max(20, Math.min(P.H - 12, P.W * 0.58));
            bx = 8; by = (P.H - side) / 2;
            board();
          },
          still: function () { n = 0; inside = 0; for (var i = 0; i < 5000; i++) add(); t = 99; },
          tick: function (dt) {
            t += dt;
            if (n < MAXN) {
              acc += Math.min(4 + 220 * t * t, 3000) * dt;
              var k = Math.min(Math.floor(acc), 200, MAXN - n);
              acc -= k;
              while (k-- > 0) { add(); dot(n - 1); }
            } else {
              hold += dt;
              if (hold > 2) { n = 0; inside = 0; t = 0; acc = 0; hold = 0; board(); }
            }
          },
          draw: function () {
            var g = P.g, C = P.C, W = P.W, H = P.H;
            g.clearRect(0, 0, W, H);
            g.strokeStyle = C.on; g.lineWidth = 1.5; g.globalAlpha = 0.9;
            g.strokeRect(bx + 0.75, by + 0.75, side - 1.5, side - 1.5);
            g.beginPath(); g.arc(bx + side / 2, by + side / 2, side / 2 - 0.75, 0, 6.2832); g.stroke();
            g.globalAlpha = 1;
            var x0 = bx + side + 12, cw = W - x0 - 6;
            if (cw < 40) return;
            var fs = U.clamp(cw / 3.3, 14, 34);
            g.fillStyle = C.on; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
            g.font = font(C, Math.max(11, fs * 0.45), 700);
            g.fillText('π ≈', x0, H / 2 - fs * 0.62);
            g.font = font(C, fs, 800, true);
            g.fillStyle = C.accent;
            g.fillText(n ? (4 * inside / n).toFixed(3) : '?', x0, H / 2 + fs * 0.42);
            g.fillStyle = C.on; g.globalAlpha = 0.8;
            g.font = font(C, Math.max(10, fs * 0.38), 600, true);
            g.fillText(fmtN(n) + ' 个', x0, H / 2 + fs * 0.42 + Math.max(14, fs * 0.6));
            g.globalAlpha = 1;
          }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.5 life 生命游戏
   * params: { preset: 'random' | 'glider' | 'lwss' | 'pulsar' | 'rpent' | 'gun' | 'empty', mode: 'free' | 'five', cells: 5 }
   *   free：自由玩。手指画细胞，播放 / 暂停 / 单步 / 速度 / 清空 / 随机 / 预设图案；棋盘四边相连
   *   five：挑战。只许摆 cells 个格子（默认 5），比谁的图案“折腾”得最久才消停
   * ====================================================================== */
  var LIFE_PRESETS = [
    { key: 'glider', name: '滑翔机', fact: '5 个细胞，每 4 代斜着挪一格' },
    { key: 'lwss', name: '轻型飞船', fact: '9 个细胞，每 4 代横着飞两格' },
    { key: 'pulsar', name: '脉冲星', fact: '每 3 代重复一次，像在呼吸' },
    { key: 'rpent', name: 'R 五格', fact: '才 5 个细胞，大棋盘上能折腾 1103 代' },
    { key: 'gun', name: '滑翔机枪', fact: '每 30 代造出一架滑翔机' },
    { key: 'random', name: '随机一盘', fact: '乱撒一把，看谁活下来' }
  ];
  /* 预览用的“涂鸦”：一张笑脸。试过几种画法，这一张在小棋盘上能热闹地演化一百多代（见交付说明） */
  var LIFE_SMILE = ['O.......O', 'O.......O', 'O.......O', '.........', 'OO.....OO', '..OOOOO..'];
  var LIFE_WHY = '每个格子只看身边的 8 个邻居，规矩就三条：\n\n- 空格子旁边**正好 3 个**活的 → 出生\n- 活格子旁边有 **2 或 3 个**活的 → 活下去\n- 其余情况 → 死掉（太孤单，或者太挤）\n\n没有谁在指挥，每个格子只管自己。可是凑在一起，就出现了会走路的“滑翔机”、会呼吸的“脉冲星”，还有不停造滑翔机的“枪”。\n\n这是数学家康威 1970 年想出来的。后来有人用它搭出了会走字的电子钟、能一个个算出质数的机器，甚至在生命游戏里又造了一台“生命游戏”。几条简单的规矩叠在一起，能长出谁也没设计过的复杂东西。\n\n屏幕下面那行“实测”，是程序自己看出来的规律：比如发现现在这一盘和 3 代以前一模一样，就写“每 3 代重复一次”。';
  /* 下面的数字来自穷举（node dev/test-sim.js --census 可以重跑，约三四分钟）：40×40 的环面上，在中间 8×8 的区域里摆 5 个格子，
   * 按平移、旋转、翻转去重后共 237,459 种；其中 237,156 种五代之内就定型，撑过五代的 303 种，撑过 12 代的只有 11 种
   * （9 种是 R 五格和它的“前身”，663–665 代；另外 2 种 248–249 代）。 */
  var LIFE_WHY_FIVE = '生命游戏里没有“差不多”：挪一个格子，后面每一代都可能完全不同。\n\n这块棋盘是 40×40，上下左右连在一起。在中间摆 5 个格子，一共有 23 万多种摆法（转个方向、翻个面算同一种），我们让电脑全试了一遍：\n\n- 绝大多数，五代之内就全灭或者定住不动\n- 能撑过五代的，只有 303 种\n- 能撑过 12 代的，只有 **11 种**——它们全都能撑 200 代以上\n\n那 11 种里最有名的一个，数学家叫它 **R 五格**。在无限大的棋盘上，它要折腾到第 1103 代才消停；咱们这块棋盘小，它会绕回来撞上自己，结局不一样。\n\n“折腾了几代”是这么算的：从开局到它不再出新花样为止——全灭、一动不动、或者开始重复同一套动作，都算消停。';

  function mkWorld(cols, rows) {
    var n = cols * rows;
    var w = { cols: cols, rows: rows, cur: new Uint8Array(n), nxt: new Uint8Array(n), age: new Uint8Array(n), gen: 0, pop: 0 };
    w.step = function () {
      var c = w.cur, x = w.nxt, a = w.age;
      w.pop = SIM.lifeStep(c, x, cols, rows);
      for (var i = 0; i < n; i++) a[i] = x[i] ? (c[i] ? (a[i] < 250 ? a[i] + 1 : 250) : 0) : 0;    // 刚出生的记 0，用来上高亮色
      w.cur = x; w.nxt = c; w.gen++;
    };
    w.recount = function () { var p = 0; for (var i = 0; i < n; i++) p += w.cur[i]; w.pop = p; };
    w.clear = function () { w.cur.fill(0); w.age.fill(0); w.gen = 0; w.pop = 0; };
    w.place = function (cells, ox, oy) { SIM.lifePlace(w.cur, cols, rows, cells, ox, oy); w.recount(); };
    w.placeCentered = function (pat) { w.place(SIM.lifeCells(pat), Math.floor((cols - pat[0].length) / 2), Math.floor((rows - pat.length) / 2)); };
    return w;
  }
  /* v: { px, py, w, h 棋盘在画布上的矩形；x0, y0 可见区域左上角（单位：格，可以是小数）；size 每格的像素 } */
  function lifeDraw(g, w, v, C, o) {
    var s = v.size, cols = w.cols, rows = w.rows, x, y, i, pass;
    var xa = Math.max(0, Math.floor(v.x0)), xb = Math.min(cols - 1, Math.ceil(v.x0 + v.w / s) - 1);
    var ya = Math.max(0, Math.floor(v.y0)), yb = Math.min(rows - 1, Math.ceil(v.y0 + v.h / s) - 1);
    g.save();
    g.beginPath(); g.rect(v.px, v.py, v.w, v.h); g.clip();
    if (!o.pv) { g.fillStyle = C.surface; g.fillRect(v.px, v.py, v.w, v.h); }
    if (!o.pv && s >= 9) {
      g.strokeStyle = C.line; g.lineWidth = 1; g.globalAlpha = s >= 20 ? 1 : 0.5;
      g.beginPath();
      for (x = xa; x <= xb + 1; x++) { var gx = Math.round(v.px + (x - v.x0) * s) + 0.5; g.moveTo(gx, v.py); g.lineTo(gx, v.py + v.h); }
      for (y = ya; y <= yb + 1; y++) { var gy = Math.round(v.py + (y - v.y0) * s) + 0.5; g.moveTo(v.px, gy); g.lineTo(v.px + v.w, gy); }
      g.stroke();
      g.globalAlpha = 1;
    }
    if (o.zone) {
      g.strokeStyle = C.accent; g.lineWidth = 2; g.globalAlpha = o.zone.a;
      g.strokeRect(v.px + (o.zone.x - v.x0) * s, v.py + (o.zone.y - v.y0) * s, o.zone.n * s, o.zone.n * s);
      g.globalAlpha = 1;
    }
    var gap = s >= 14 ? 2 : s >= 5 ? 1 : 0.5, r = s >= 14 ? 4 : s >= 8 ? 2 : 0;
    for (pass = 0; pass < 2; pass++) {
      g.fillStyle = pass === 1 ? C.accent : (o.pv ? C.on : C.show);
      for (y = ya; y <= yb; y++) for (x = xa; x <= xb; x++) {
        i = y * cols + x;
        if (!w.cur[i] || (w.age[i] === 0) !== (pass === 1)) continue;
        var cx = v.px + (x - v.x0) * s + gap / 2, cy = v.py + (y - v.y0) * s + gap / 2;
        if (r) { roundRect(g, cx, cy, s - gap, s - gap, r); g.fill(); } else g.fillRect(cx, cy, s - gap, s - gap);
      }
    }
    g.restore();
  }

  function lifeFree(root, params, ctx) {
    var rnd = ctx.rng(), C = readColors(root), alive = true;
    var SPEED = { slow: 4, mid: 12, fast: 40 };
    var world = null, view = { px: 0, py: 0, w: 0, h: 0, x0: 0, y0: 0, size: 8 };
    var playing = false, gps = SPEED.mid, acc = 0, doneOnce = false;
    var hist = [], snaps = [], snapGen = [-9, -9, -9, -9], finding = '', settled = false;
    var painting = false, paintVal = 1, lastCell = null, pid = -1;
    var first = { empty: 1, random: 1, glider: 1, lwss: 1, pulsar: 1, rpent: 1, gun: 1 }[params.preset] ? params.preset : 'random';

    var sh = mkShell(root, 'life', ctx);
    var why = mkWhy(sh.wrap, 'life', '没人指挥，它怎么像活的？', LIFE_WHY);
    sh.head.appendChild(why.btn);
    var stage = U.el('div.w-life-stage');
    var cv = mkCanvas(stage);
    var status = U.el('div.w-life-status');
    var playBtn = mkBtn('播放', '.w-life-b', function () { setPlaying(!playing); });
    var stepBtn = mkBtn('单步', '.jn-btn--ghost.w-life-b', function () { setPlaying(false); if (world) { stepOnce(); draw(); } });
    var seg = mkSeg('life', [{ key: 'slow', text: '慢' }, { key: 'mid', text: '中' }, { key: 'fast', text: '快' }], 'mid', function (k) { gps = SPEED[k]; });
    var menuBtn = mkBtn('图案', '.jn-btn--ghost.w-life-b', function () { toggleMenu(); });
    var randBtn = mkBtn('随机', '.jn-btn--ghost.w-life-b', function () { load('random'); });
    var clearBtn = mkBtn('清空', '.jn-btn--ghost.w-life-b', function () { load('empty'); });
    var menu = U.el('div.w-life-menu', { attrs: { hidden: '' } });
    var items = {};
    LIFE_PRESETS.forEach(function (p) {
      items[p.key] = U.el('button.w-life-item', { attrs: { type: 'button' }, on: { click: function () { toggleMenu(false); load(p.key); } } }, [U.el('b', { text: p.name }), U.el('span', { text: p.fact })]);
      menu.appendChild(items[p.key]);
    });
    U.append(sh.wrap, [stage, status, U.el('div.w-life-ctl', [playBtn, stepBtn, seg.el]), U.el('div.w-life-ctl', [menuBtn, randBtn, clearBtn]), menu]);

    function toggleMenu(force) {
      var open = force == null ? menu.hasAttribute('hidden') : force;
      if (open && world) items.gun.hidden = !SIM.lifeGunLayout(world.cols, world.rows);
      if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
      menuBtn.classList.toggle('is-on', open);
    }
    /* 格子大小随舞台自适应：横向大约 40 格（每格 6–12 像素），纵向能放多少放多少 */
    function fitWorld() {
      if (!cv.fit()) return false;
      var cs = U.clamp(Math.floor(cv.w / 40), 6, 12);
      var cols = Math.max(10, Math.floor(cv.w / cs)), rows = Math.max(10, Math.floor(cv.h / cs));
      if (!world || world.cols !== cols || world.rows !== rows) {
        var old = world;
        world = mkWorld(cols, rows);
        if (old) {
          var dx = Math.floor((cols - old.cols) / 2), dy = Math.floor((rows - old.rows) / 2);
          for (var y = 0; y < old.rows; y++) for (var x = 0; x < old.cols; x++) {
            var nx = x + dx, ny = y + dy;
            if (old.cur[y * old.cols + x] && nx >= 0 && ny >= 0 && nx < cols && ny < rows) world.cur[ny * cols + nx] = 1;
          }
          world.gen = old.gen;
          world.recount();
        }
        resetDetect();
      }
      view.size = cs; view.w = cols * cs; view.h = rows * cs;
      view.px = Math.floor((cv.w - view.w) / 2); view.py = Math.floor((cv.h - view.h) / 2);
      return true;
    }
    function draw() {
      if (!fitWorld()) return;
      cv.g.clearRect(0, 0, cv.w, cv.h);
      lifeDraw(cv.g, world, view, C, {});
    }
    function updateStatus() {
      if (!world) return;
      var t = '第 ' + fmtN(world.gen) + ' 代 · 活着 ' + fmtN(world.pop) + ' 个' + (finding ? ' · ' + finding : '');
      if (status.textContent !== t) status.textContent = t;
    }
    function record() {
      var idx = world.gen % 4;
      hist.push(SIM.lifeKey(world.cur));
      if (hist.length > 64) hist.shift();
      if (!snaps[idx] || snaps[idx].length !== world.cur.length) snaps[idx] = new Uint8Array(world.cur.length);
      snaps[idx].set(world.cur);
      snapGen[idx] = world.gen;
    }
    function resetDetect() {
      hist = []; snapGen = [-9, -9, -9, -9]; finding = ''; settled = false;
      if (world) record();
    }
    function shiftMatch(old, list) {
      var a = world.cur, cols = world.cols, rows = world.rows;
      for (var k = 0; k < list.length; k++) {
        var dx = list[k][0], dy = list[k][1], same = true;
        for (var y = 0; y < rows && same; y++) {
          var oy = ((y - dy + rows) % rows) * cols, ay = y * cols;
          for (var x = 0; x < cols; x++) if (a[ay + x] !== old[oy + (x - dx + cols) % cols]) { same = false; break; }
        }
        if (same) return true;
      }
      return false;
    }
    /* 实测规律：和最近 64 代里的某一代一模一样 → 周期；和 4 代前相比整体平移了 → 飞船。两种判断都是精确比较，不是估计。 */
    function detect() {
      var key = SIM.lifeKey(world.cur), f = '', idx = world.gen % 4, i;
      settled = false;
      if (world.pop === 0) { f = '全灭了'; settled = true; }
      else {
        for (i = hist.length - 1; i >= 0; i--) if (hist[i] === key) {
          var p = hist.length - i;
          f = p === 1 ? '实测：一动不动了' : '实测：每 ' + p + ' 代重复一次';
          settled = p === 1;
          break;
        }
        if (!f && snapGen[idx] === world.gen - 4) {
          if (shiftMatch(snaps[idx], [[1, 1], [1, -1], [-1, 1], [-1, -1]])) f = '实测：每 4 代斜着挪一格';
          else if (shiftMatch(snaps[idx], [[2, 0], [-2, 0], [0, 2], [0, -2]])) f = '实测：每 4 代平移两格';
        }
      }
      finding = f;
      record();
    }
    function setPlaying(v) {
      playing = !!v && !!world;
      playBtn.textContent = playing ? '暂停' : '播放';
      if (playing) loop.start(); else loop.stop();
    }
    function stepOnce() {
      world.step();
      detect();
      updateStatus();
      if (!doneOnce && (world.gen >= 100 || finding)) { doneOnce = true; ctx.done({ text: '演化到第 ' + world.gen + ' 代' }); }
      if (settled && playing) setPlaying(false);
    }
    function load(key) {
      if (!world && !fitWorld()) return;
      var cols = world.cols, rows = world.rows, cells, i, p = null;
      world.clear();
      if (key === 'gun') { cells = SIM.lifeGunCells(cols, rows); if (cells) world.place(cells, 0, 0); else key = 'random'; }
      if (key === 'random') { for (i = 0; i < world.cur.length; i++) world.cur[i] = rnd() < 0.3 ? 1 : 0; world.recount(); }
      else if (key === 'glider') world.place(SIM.lifeCells(SIM.LIFE.glider), Math.floor(cols / 4), Math.floor(rows / 4));
      else if (key === 'lwss') world.place(SIM.lifeCells(SIM.LIFE.lwss), cols - 9, Math.floor(rows / 2) - 2);
      else if (key === 'pulsar' || key === 'rpent') world.placeCentered(SIM.LIFE[key]);
      LIFE_PRESETS.forEach(function (q) { if (q.key === key) p = q; });
      resetDetect();
      acc = 0;
      sh.say(p ? p.name + '：' + p.fact + '。' : '手指在格子上画几笔，再按播放，看它变成什么。');
      setPlaying(key !== 'empty');
      updateStatus();
      draw();
    }
    var loop = mkLoop(function (dt) {
      if (!playing || !world) { loop.stop(); return; }
      if (!painting) {
        acc += gps * dt;
        var k = Math.min(Math.floor(acc), 4);             // 单帧最多算 4 代
        acc -= k;
        if (acc > 4) acc = 0;
        while (k-- > 0 && playing) stepOnce();
      }
      draw();
    });

    function cellAt(e) {
      var r = cv.el.getBoundingClientRect();
      var x = Math.floor((e.clientX - r.left - view.px) / view.size), y = Math.floor((e.clientY - r.top - view.py) / view.size);
      return (x < 0 || y < 0 || x >= world.cols || y >= world.rows) ? null : { x: x, y: y };
    }
    function paint(x, y) {
      var i = y * world.cols + x;
      if (world.cur[i] !== paintVal) { world.cur[i] = paintVal; world.age[i] = 0; world.pop += paintVal ? 1 : -1; }
    }
    function paintLine(a, b) {
      var x = a.x, y = a.y, dx = Math.abs(b.x - x), dy = Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1, err = dx - dy, guard = 0;
      while (guard++ < 400) {
        paint(x, y);
        if (x === b.x && y === b.y) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    }
    function endPaint(e) {
      if (!painting || (e && e.pointerId !== pid)) return;
      painting = false;
      resetDetect();
      updateStatus();
    }
    cv.el.addEventListener('pointerdown', function (e) {
      if (!alive || !world) return;
      toggleMenu(false);
      var c = cellAt(e);
      if (!c) return;
      e.preventDefault();
      painting = true; pid = e.pointerId;
      try { cv.el.setPointerCapture(pid); } catch (err) { /* 合成事件没有可捕获的指针，忽略 */ }
      paintVal = world.cur[c.y * world.cols + c.x] ? 0 : 1;
      paint(c.x, c.y);
      lastCell = c;
      finding = '';
      updateStatus();
      draw();
    });
    cv.el.addEventListener('pointermove', function (e) {
      if (!painting || e.pointerId !== pid) return;
      var c = cellAt(e);
      if (!c) return;
      paintLine(lastCell, c);
      lastCell = c;
      updateStatus();
      draw();
    });
    cv.el.addEventListener('pointerup', endPaint);
    cv.el.addEventListener('pointercancel', endPaint);
    cv.el.addEventListener('pointerleave', endPaint);
    cv.el.addEventListener('lostpointercapture', endPaint);

    var booted = false;
    function boot() { if (!booted && fitWorld()) { booted = true; load(first); } }
    ctx.onResize(function () { C = readColors(root); sh.roomy(); boot(); draw(); updateStatus(); });
    boot();
    return { destroy: function () { alive = false; playing = false; loop.destroy(); } };
  }

  function lifeFive(root, params, ctx) {
    var K = clampInt(params.cells, 3, 8, 5), N = 40, E = 8, C0 = (N - E) / 2, MAXGEN = 5000;
    var C = readColors(root), alive = true;
    var world = mkWorld(N, N), view = { px: 0, py: 0, w: 0, h: 0, x0: C0, y0: C0, size: 10 };
    var phase = 'edit', placed = 0, tries = 0, best = parseInt(ctx.store.get('five' + K, 0), 10) || 0;
    var span = E, target = E, runT = 0, acc = 0, seen = null, lastStart = null, shownMu = 0, proKey = '', proRun = false;

    var sh = mkShell(root, 'life', ctx);
    var why = mkWhy(sh.wrap, 'life', '差一个格子，命差这么多？', LIFE_WHY_FIVE);
    why.hide();                                            // 试过三次才出现（里面提到了“R 五格”）
    sh.head.appendChild(why.btn);
    var stage = U.el('div.w-life-stage');
    var cv = mkCanvas(stage);
    var tA = mkStat('life', '还能摆'), tB = mkStat('life', '活着'), tC = mkStat('life', '最高纪录');
    var goBtn = mkBtn('开跑', '.w-life-b', function () { start(); });
    var clrBtn = mkBtn('清空', '.jn-btn--ghost.w-life-b', function () { edit(null); });
    var tweakBtn = mkBtn('改一改', '.w-life-b', function () { edit(lastStart); });
    var againBtn = mkBtn('清空重摆', '.jn-btn--ghost.w-life-b', function () { edit(null); });
    var proBtn = mkBtn('数学家的答案', '.jn-btn--ghost.w-life-b', function () { pro(); });
    var runTip = U.el('div.w-life-tip', { text: '演化中……越跑越快' });
    var ctl = U.el('div.w-life-ctl');
    U.append(sh.wrap, [stage, U.el('div.w-life-stats', [tA.el, tB.el, tC.el]), ctl]);

    function renderCtl() {
      U.clear(ctl);
      goBtn.disabled = placed !== K;
      if (tries >= 3 && phase !== 'run') why.show();
      var showPro = K === 5 && tries >= 3;
      if (phase === 'edit') U.append(ctl, [goBtn, clrBtn, showPro ? proBtn : null]);
      else if (phase === 'run') U.append(ctl, [runTip]);
      else U.append(ctl, [tweakBtn, againBtn, showPro ? proBtn : null]);
    }
    function refresh() {
      if (phase === 'edit') { tA.label('还能摆'); tA.set((K - placed) + ' 个'); }
      else { tA.label(phase === 'run' ? '第几代' : '折腾了'); tA.set(fmtN(phase === 'run' ? world.gen : shownMu) + ' 代'); }
      tB.set(world.pop + ' 个');
      tC.set(best ? fmtN(best) + ' 代' : '—');
      draw();
    }
    function draw() {
      if (!cv.fit()) return;
      var side = Math.floor(Math.min(cv.w, cv.h));
      view.w = view.h = side;
      view.px = Math.floor((cv.w - side) / 2); view.py = Math.floor((cv.h - side) / 2);
      view.size = side / span;
      view.x0 = view.y0 = (N - span) / 2;
      cv.g.clearRect(0, 0, cv.w, cv.h);
      lifeDraw(cv.g, world, view, C, { zone: span > E + 0.05 && span < N - 0.05 ? { x: C0, y: C0, n: E, a: 0.35 } : null });
    }
    /* 镜头要多大才装得下所有活细胞（以棋盘中心为准） */
    function neededSpan() {
      var c = (N - 1) / 2, d = 0, cur = world.cur;
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (cur[y * N + x]) d = Math.max(d, Math.abs(x - c), Math.abs(y - c));
      var s = 2 * (d + 0.5) + 4;
      return s > N - 4 ? N : Math.max(E, s);
    }
    function edit(cells) {
      if (!alive) return;
      phase = 'edit';
      seen = null;
      world.clear();
      placed = 0;
      if (cells) { world.cur.set(cells); world.recount(); placed = world.pop; }
      target = E;
      sh.say(placed === K ? '挪一个格子试试——差一格，结局可能差很远。' : '在中间摆 ' + K + ' 个格子。比的是：谁的图案折腾得最久才消停。');
      renderCtl();
      refresh();
      loop.start();
    }
    function pro() {
      if (!alive) return;
      edit(null);
      world.place(SIM.lifeCells(SIM.LIFE.rpent), C0 + 3, C0 + 2);
      placed = world.pop;
      proKey = SIM.lifeKey(world.cur);
      sh.say('这个图案叫“R 五格”。按「开跑」，坐稳了。');
      renderCtl();
      refresh();
    }
    function start() {
      if (!alive || phase !== 'edit' || placed !== K) return;
      phase = 'run';
      tries++;
      lastStart = Uint8Array.from(world.cur);
      seen = new Map();
      seen.set(SIM.lifeKey(world.cur), 0);
      proRun = proKey !== '' && SIM.lifeKey(world.cur) === proKey;      // 原样照抄“数学家的答案”不算自己的纪录
      world.gen = 0; world.age.fill(1);
      runT = 0; acc = 0;
      ctx.sfx('whoosh');
      sh.say('开跑！看它能折腾到第几代。');
      renderCtl();
      refresh();
      loop.start();
    }
    function finish(mu, lambda) {
      phase = 'over';
      seen = null;
      shownMu = mu;
      var pop = world.pop, rec = mu > best && mu > 0 && !proRun, msg;
      var glide = lambda === 4 * N;                         // 滑翔机每 4 代斜移一格，绕 N×N 的棋盘一圈正好 4N 代
      if (rec) { best = mu; ctx.store.set('five' + K, best); }
      if (!lambda) msg = '超过 ' + fmtN(MAXGEN) + ' 代还没消停——算你通关！';
      else if (mu === 0) msg = lambda === 1 ? '一动不动，一点花样都没有——算 0 代。' : glide ? '它能一直滑下去，可动作只有那一套——没有新花样，算 0 代。' : '一上来就在重复同一套动作（每 ' + lambda + ' 代一轮）——算 0 代。';
      else msg = '折腾了 ' + fmtN(mu) + ' 代，' + (pop === 0 ? '然后全灭了。' : lambda === 1 ? '然后一动不动了（剩 ' + pop + ' 个）。' : glide ? '然后有滑翔机一圈一圈地滑，再没有新花样。' :'然后开始重复同一套动作（每 ' + lambda + ' 代一轮）。');
      sh.say(msg + (rec ? '新纪录！' : proRun ? '（照抄的不算纪录）' : ''));
      ctx.sfx(mu >= 20 ? 'win' : mu > 0 ? 'good' : 'bad');
      ctx.haptic(rec ? [20, 40, 60] : 20);
      if (mu >= 100) ctx.confetti();
      ctx.done({ win: rec, text: '折腾了 ' + fmtN(mu) + ' 代' });
      renderCtl();
      refresh();
    }
    /* 一代一代算，并精确记录每一盘出现过没有：棋盘有限、规则确定，第一次“撞见以前的自己”就说明进入了循环。
     * 以前那一盘是第 mu 代 → 折腾了 mu 代；之后每 lambda 代重复一次。 */
    function oneGen() {
      world.step();
      var key = SIM.lifeKey(world.cur);
      if (seen.has(key)) { var mu = seen.get(key); finish(mu, world.gen - mu); return; }
      seen.set(key, world.gen);
      if (world.gen >= MAXGEN) { finish(MAXGEN, 0); return; }
      target = Math.max(target, neededSpan());
    }
    var loop = mkLoop(function (dt) {
      if (phase === 'run') {
        runT += dt;
        acc += (runT < 2 ? 4 : Math.min(4 + 60 * (runT - 2) * (runT - 2), 240)) * dt;   // 代/秒：先慢慢看，再快进
        var k = Math.min(Math.floor(acc), 6);                                          // 单帧最多 6 代
        acc -= k;
        while (k-- > 0 && phase === 'run') oneGen();
      }
      span += (target - span) * Math.min(1, dt * (phase === 'run' ? 5 : 9));
      if (Math.abs(target - span) < 0.03) span = target;
      if (ctx.reduced) span = target;
      refresh();
      if (phase !== 'run' && span === target) loop.stop();
    });
    cv.el.addEventListener('pointerdown', function (e) {
      if (!alive || phase !== 'edit') return;
      if (span !== E) { span = target = E; draw(); }        // 镜头还在往回推：直接到位，这一下点击照样算数
      var r = cv.el.getBoundingClientRect();
      var x = Math.floor(view.x0 + (e.clientX - r.left - view.px) / view.size), y = Math.floor(view.y0 + (e.clientY - r.top - view.py) / view.size);
      if (x < C0 || y < C0 || x >= C0 + E || y >= C0 + E) return;
      var i = y * N + x;
      if (world.cur[i]) { world.cur[i] = 0; placed--; ctx.sfx('tick'); }
      else if (placed < K) { world.cur[i] = 1; world.age[i] = 0; placed++; ctx.sfx('pop'); }
      else { ctx.sfx('buzz'); sh.say('只能摆 ' + K + ' 个。点一下已经摆好的格子可以拿掉。'); refresh(); return; }
      world.pop = placed;
      sh.say(placed === K ? '摆好了。按「开跑」。' : '还能摆 ' + (K - placed) + ' 个。挨着摆才活得下去。');
      renderCtl();
      refresh();
    });

    ctx.onResize(function () { C = readColors(root); sh.roomy(); draw(); });
    edit(null);
    return { destroy: function () { alive = false; phase = 'dead'; seen = null; loop.destroy(); } };
  }

  JN.registerWidget({
    id: 'life',
    name: '生命游戏',
    rules: '每个格子看周围 8 个邻居：空格子周围正好有 3 个活细胞，就出生；活细胞周围有 2 或 3 个活细胞，就活下去；其余情况（太孤单或太挤）就死掉。棋盘上下左右是连通的。',
    mount: function (root, params, ctx) {
      params = params || {};
      return params.mode === 'five' ? lifeFive(root, params, ctx) : lifeFree(root, params, ctx);
    },

    /* 预览：棋盘够大就放“滑翔机枪”（一直在发射），否则随机开局；
     * five 模式轮流演示几个五格图案的下场（不演 R 五格，不剧透）；preset: 'empty' 演一张笑脸变成别的东西。 */
    preview: function (root, params, ctx) {
      params = params || {};
      var rnd = ctx.rng(), five = params.mode === 'five';
      var TRY = [['OOO', '.O.', '.O.'], ['.O.', 'OOO', '.O.'], ['O.', 'O.', 'O.', 'OO'], ['OOOOO']];
      return mkPreview(root, ctx, 'life', null, function (P) {
        var world = null, view = { px: 0, py: 0, w: 0, h: 0, x0: 0, y0: 0, size: 6 }, acc = 0, t = 0, kind = '', tryI = 0;
        function seed() {
          var cols = world.cols, rows = world.rows, cells = null, i, want = params.preset;
          world.clear(); t = 0; acc = 0;
          if (five) { world.placeCentered(TRY[tryI++ % TRY.length]); kind = 'try'; return; }
          if (want === 'empty') { world.placeCentered(LIFE_SMILE); kind = 'smile'; return; }
          if (want === 'glider' || want === 'lwss' || want === 'pulsar' || want === 'rpent') { world.placeCentered(SIM.LIFE[want]); kind = want; return; }
          if (want !== 'random') cells = SIM.lifeGunCells(cols, rows);
          if (cells) { world.place(cells, 0, 0); kind = 'gun'; return; }
          for (i = 0; i < world.cur.length; i++) world.cur[i] = rnd() < 0.3 ? 1 : 0;
          world.recount();
          kind = 'random';
        }
        return {
          resize: function () {
            var cs = five ? Math.max(5, Math.floor(P.H / 15)) : params.preset === 'empty' ? Math.max(5, Math.round(P.W / 37)) : Math.max(4, Math.round(P.W / 50));
            var cols = Math.max(8, Math.floor(P.W / cs)), rows = Math.max(8, Math.floor(P.H / cs));
            world = mkWorld(cols, rows);
            view.size = cs; view.w = cols * cs; view.h = rows * cs;
            view.px = Math.floor((P.W - view.w) / 2); view.py = Math.floor((P.H - view.h) / 2);
            seed();
            if (ctx.reduced && !five) for (var i = 0; i < 45; i++) world.step();
          },
          tick: function (dt) {
            if (!world) return;
            t += dt;
            var wait = kind === 'try' ? 0.8 : kind === 'smile' ? 1.4 : 0;
            if (t > wait) acc += (kind === 'try' ? 5 : kind === 'smile' ? 8 : 12) * dt;
            var k = Math.min(Math.floor(acc), 3);
            acc -= k;
            while (k-- > 0) world.step();
            if ((kind === 'try' && t > 4.2) || (kind === 'smile' && (t > 10.5 || world.pop === 0)) || (kind === 'random' && (t > 14 || world.pop === 0)) || (kind === 'rpent' && t > 18)) seed();
          },
          draw: function () {
            P.g.clearRect(0, 0, P.W, P.H);
            if (world) lifeDraw(P.g, world, view, P.C, { pv: true });
          }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.6 sorting 排序赛跑
   * params: { n: 40, pair: ['bubble', 'quick'], mode: 'race' | 'bet' }
   *   两条赛道用同一份数据同时开跑，一拍 = 一次比较（交换、挪动算在这一拍里），谁用的拍数少谁先到。
   *   bet：开跑前先押谁赢；押注阶段不显示算法名字（“快速排序”这个名字太剧透），只说它的办法。
   * ====================================================================== */
  var SORT_UI = {
    bubble: { name: '冒泡排序', how: '相邻两根比一比，高的往后换；一趟一趟来' },
    selection: { name: '选择排序', how: '每一趟找出最矮的那根，放到最前面' },
    insertion: { name: '插入排序', how: '像理扑克牌：一根一根插到它该在的位置' },
    quick: { name: '快速排序', how: '挑一根当“裁判”，矮的去左边、高的去右边，两边再各自这么干' },
    merge: { name: '归并排序', how: '先分成小组各自排好，再两组两组合并起来' }
  };
  var SORT_WHY = '**一句话**：冒泡每次只和隔壁比，一趟只能把一根柱子送到位；快速排序一趟就把所有柱子分成“矮的”和“高的”两堆，然后两堆各自再分——每一次比较都没白费。\n\n数一数（n 是柱子的根数）：\n\n- 冒泡、选择：把每一对都比一遍，n×(n−1)÷2 次。40 根就是 780 次，一次不多一次不少\n- 插入：运气平平的时候，大约是它们的一半多一点\n- 快速、归并：每分一层要比大约 n 次，可层数只有“把 n 对半砍几次能砍到 1”那么多——40 根只要五六层\n\n柱子越多差得越远：从 40 根变成 400 根，冒泡要多比 100 倍，快速只多比不到 20 倍。\n\n给一亿个数排序：冒泡大约要比 5000 万亿次，就算每秒比一亿次也得一年半；快速排序大约 34 亿次，半分钟。办法不一样，差出来的不是一点半点。';
  function sortPair(p) {
    return (Array.isArray(p) && p.length === 2 && SORT_UI[p[0]] && SORT_UI[p[1]] && p[0] !== p[1]) ? [p[0], p[1]] : null;
  }
  function sortLane(key) {
    return { key: key, a: [], ops: [], ip: 0, cmp: 0, total: 0, done: false, hiA: -1, hiB: -1, swA: -1, swB: -1, lo: 0, hi: 0, sorted: null };
  }
  function sortLoad(L, data) {
    var tr = SIM.sortTrace(L.key, data);
    L.a = data.slice(); L.ops = tr.ops; L.total = tr.comparisons;
    L.ip = 0; L.cmp = 0; L.done = false;
    L.hiA = L.hiB = L.swA = L.swB = -1;
    L.lo = 0; L.hi = data.length - 1;
    L.sorted = new Uint8Array(data.length);
  }
  /* 走一拍：消耗一次比较，以及紧跟在它后面的交换 / 挪动 / 标记。 */
  function sortTick(L) {
    var ops = L.ops, n = ops.length, seen = false, k;
    L.swA = L.swB = -1;
    while (L.ip < n) {
      var t = ops[L.ip], i = ops[L.ip + 1], j = ops[L.ip + 2];
      if (t === OP_CMP) {
        if (seen) break;
        seen = true; L.cmp++; L.hiA = i; L.hiB = j;
      } else if (t === OP_SWAP || t === OP_ROT) { SIM.sortApply(L.a, t, i, j); L.swA = i; L.swB = j; }
      else if (t === OP_MARK) { for (k = i; k <= j; k++) L.sorted[k] = 1; }
      else if (t === OP_FOCUS) { L.lo = i; L.hi = j; }
      L.ip += 3;
    }
    if (L.ip >= n) { L.done = true; L.hiA = L.hiB = L.swA = L.swB = -1; }
  }
  /* 画一条赛道。白色 = 正在比较的两根，金色 = 刚被交换或挪动的，绿色（预览里是全亮）= 已经到位的。 */
  function sortDraw(g, x, y, W, H, L, C, base, pv) {
    var n = L.a.length, bw = W / n, gap = bw >= 5 ? 1.5 : bw >= 3 ? 1 : 0, i;
    for (i = 0; i < n; i++) {
      var h = Math.max(2, L.a[i] / n * (H - 1)), col = base, alpha = pv ? 0.55 : 1;
      if (i === L.hiA || i === L.hiB) { col = pv ? C.accent : C.ink; alpha = 1; }
      else if (i === L.swA || i === L.swB) { col = C.accent; alpha = 1; }
      else if (L.sorted[i] || L.done) { col = pv ? base : C.ok; alpha = 1; }
      else if (i < L.lo || i > L.hi) alpha = pv ? 0.3 : 0.38;
      g.globalAlpha = alpha; g.fillStyle = col;
      g.fillRect(x + i * bw + gap / 2, y + H - h, Math.max(1, bw - gap), h);
    }
    g.globalAlpha = 1;
  }

  JN.registerWidget({
    id: 'sorting',
    name: '排序赛跑',
    rules: '一组高矮不一的柱子，两种排队的办法同时开工，都要把柱子从矮到高排好。每比较一次两根柱子的高矮算一步，谁用的步数少谁先排完。',
    mount: function (root, params, ctx) {
      params = params || {};
      var bet = params.mode === 'bet';
      var n = clampInt(params.n, 8, 120, 40);
      var pair = sortPair(params.pair) || ['bubble', 'quick'];
      var rnd = ctx.rng(), C = readColors(root), alive = true;
      var data = [], phase = 'idle', acc = 0, tps = 60, betOn = -1, score = [0, 0], firstDone = -1;
      var LETTER = ['A', 'B'];

      var sh = mkShell(root, 'sorting', ctx);
      var why = mkWhy(sh.wrap, 'sorting', '差距是从哪儿来的？', SORT_WHY);
      why.hide();                                          // 第一场比完才出现，不然名字就把结果说了
      sh.head.appendChild(why.btn);
      var lanes = pair.map(function (key, idx) {
        var L = sortLane(key);
        L.nameBtn = U.el('button.jn-chip.w-sorting-name', { attrs: { type: 'button' }, on: { click: function () { cycle(idx); } } });
        L.mid = U.el('span.w-sorting-mid');
        L.cnt = U.el('span.w-sorting-cnt.jn-num');
        L.host = U.el('div.w-sorting-stage');
        L.cv = mkCanvas(L.host);
        L.el = U.el('div.w-sorting-lane.is-' + (idx ? 'b' : 'a'), [U.el('div.w-sorting-lab', [L.nameBtn, L.mid, L.cnt]), L.host]);
        sh.wrap.appendChild(L.el);
        return L;
      });
      var startBtn = mkBtn('开跑', '.w-sorting-b', function () { if (phase === 'over') prepare(); start(); });
      var dataBtn = mkBtn('换一组', '.jn-btn--ghost.w-sorting-b', function () { prepare(); });
      var sizes = [20, 40, 80];
      if (sizes.indexOf(n) < 0) { sizes.push(n); sizes.sort(function (a, b) { return a - b; }); }
      var sizeBtn = mkBtn('', '.jn-btn--ghost.w-sorting-b', function () {
        n = sizes[(sizes.indexOf(n) + 1) % sizes.length];
        ctx.sfx('tap');
        prepare();
      });
      var betBtns = [0, 1].map(function (i) { return mkBtn('押 ' + LETTER[i] + ' 队', '.w-sorting-b.is-' + (i ? 'b' : 'a'), function () { placeBet(i); }); });
      var againBtn = mkBtn('再押一局', '.w-sorting-b', function () { nextBet(); });
      var ctl = U.el('div.w-sorting-ctl');
      sh.wrap.appendChild(ctl);

      function hidden() { return bet && phase !== 'over'; }
      function label(L, idx) {
        var ui = SORT_UI[L.key], th = SIM.sortTheory(L.key, n);
        L.nameBtn.textContent = hidden() ? LETTER[idx] + ' 队' : ui.name;
        L.nameBtn.disabled = bet || phase === 'run';
        L.mid.textContent = hidden() ? ui.how : (th.exact ? '算出来：每次都是 ' : '算出来：平均约 ') + fmtN(th.mean) + ' 次';
        L.cnt.textContent = (L.done ? '✓ ' : '比较 ') + fmtN(L.cmp) + ' 次';
      }
      function render() {
        lanes.forEach(function (L, idx) {
          label(L, idx);
          if (!L.cv.fit()) return;
          L.cv.g.clearRect(0, 0, L.cv.w, L.cv.h);
          sortDraw(L.cv.g, 0, 0, L.cv.w, L.cv.h, L, C, idx ? C.p2 : C.p1, false);
        });
      }
      function renderCtl() {
        U.clear(ctl);
        if (bet) U.append(ctl, phase === 'idle' ? betBtns : phase === 'over' ? [againBtn] : [U.el('div.w-sorting-tip', { text: '你押的是 ' + LETTER[betOn] + ' 队……' })]);
        else {
          startBtn.textContent = phase === 'run' ? '比赛中' : phase === 'over' ? '再来一局' : '开跑';
          startBtn.disabled = phase === 'run';
          sizeBtn.textContent = n + ' 根 ⇄';
          sizeBtn.setAttribute('aria-label', '柱子数：' + n + ' 根，点一下换');
          U.append(ctl, [startBtn, dataBtn, sizeBtn]);
        }
      }
      function prepare() {
        if (!alive) return;
        loop.stop();
        data = U.shuffle(U.range(n).map(function (v) { return v + 1; }), rnd);
        lanes.forEach(function (L) { sortLoad(L, data); });
        /* 慢的那个大约跑 12 秒；快的先到之后，剩下的三倍速快进 */
        tps = U.clamp(Math.max(lanes[0].total, lanes[1].total) / 12, 20, 600);
        phase = 'idle'; acc = 0; betOn = -1; firstDone = -1;
        sh.say(bet
          ? '同一堆柱子，两种排法，下面写着各自的办法。押谁先排完？'
          : '同样一堆柱子，' + SORT_UI[lanes[0].key].name + '对' + SORT_UI[lanes[1].key].name + '。猜猜谁先排完？（点名字能换算法）');
        renderCtl();
        render();
      }
      function cycle(idx) {
        if (!alive || bet || phase === 'run') return;
        var L = lanes[idx], other = lanes[1 - idx].key, k = SIM.SORT_KEYS.indexOf(L.key);
        do { k = (k + 1) % SIM.SORT_KEYS.length; } while (SIM.SORT_KEYS[k] === other);
        L.key = SIM.SORT_KEYS[k];
        ctx.sfx('tap');
        prepare();
        sh.say(SORT_UI[L.key].name + '：' + SORT_UI[L.key].how + '。');
      }
      function start() {
        if (!alive || phase !== 'idle') return;
        phase = 'run';
        acc = 0;
        ctx.sfx('whoosh');
        if (!bet) sh.say('开跑！白色是正在比的两根，绿色是已经到位的。');
        renderCtl();
        if (ctx.reduced) { while (phase === 'run') beat(); render(); return; }
        loop.start();
      }
      function placeBet(i) {
        if (!alive || !bet || phase !== 'idle') return;
        betOn = i;
        sh.say('你押 ' + LETTER[i] + ' 队。开跑！');
        start();
      }
      function nextBet() {
        var ks = U.shuffle(SIM.SORT_KEYS, rnd);
        lanes[0].key = ks[0]; lanes[1].key = ks[1];
        prepare();
      }
      function beat() {
        lanes.forEach(function (L, idx) {
          if (L.done) return;
          sortTick(L);
          if (L.done && firstDone < 0 && !lanes[1 - idx].done) {
            firstDone = idx;
            ctx.sfx('good');
            if (!bet) sh.say(SORT_UI[L.key].name + '排完了！对面还在比……（快进中）');
            else sh.say(LETTER[idx] + ' 队排完了！对面还在比……（快进中）');
          }
        });
        if (lanes[0].done && lanes[1].done) finish();
      }
      function finish() {
        phase = 'over';
        var a = lanes[0], b = lanes[1], tie = a.cmp === b.cmp, w = a.cmp < b.cmp ? 0 : 1;
        var W = lanes[w], Lz = lanes[1 - w], msg, right = false;
        if (tie) msg = '平局！两边都比较了 ' + fmtN(a.cmp) + ' 次。';
        else msg = SORT_UI[W.key].name + '赢了：比较 ' + fmtN(W.cmp) + ' 次，对面 ' + fmtN(Lz.cmp) + ' 次——是它的 ' + (Lz.cmp / W.cmp).toFixed(1) + ' 倍。';
        if (bet) {
          if (tie) msg += '这把不算。A 队是' + SORT_UI[a.key].name + '，B 队是' + SORT_UI[b.key].name + '。';
          else {
            right = betOn === w;
            score[1]++;
            if (right) score[0]++;
            msg = (right ? '押对了！' : '押错了。') + LETTER[w] + ' 队是' + SORT_UI[W.key].name + '：' + fmtN(W.cmp) + ' 次对 ' + fmtN(Lz.cmp) + ' 次，差 ' + (Lz.cmp / W.cmp).toFixed(1) + ' 倍。（押对 ' + score[0] + '/' + score[1] + '）';
          }
        }
        why.show();
        sh.say(msg);
        ctx.sfx(bet ? (right ? 'win' : tie ? 'good' : 'bad') : 'win');
        if (bet && right) ctx.confetti();
        ctx.done(bet && !tie ? { win: right, text: right ? '押对了' : '押错了' } : { text: tie ? '平局' : SORT_UI[W.key].name + '赢了，快 ' + (Lz.cmp / W.cmp).toFixed(1) + ' 倍' });
        renderCtl();
        render();
      }
      var loop = mkLoop(function (dt) {
        if (phase !== 'run') { loop.stop(); return; }
        acc += tps * (firstDone >= 0 ? 3 : 1) * dt;
        var k = Math.min(Math.floor(acc), 40);             // 单帧最多 40 拍
        acc -= k;
        if (acc > 40) acc = 0;
        while (k-- > 0 && phase === 'run') beat();
        render();
      });

      ctx.onResize(function () { C = readColors(root); sh.roomy(); render(); });
      prepare();
      return { destroy: function () { alive = false; phase = 'dead'; loop.destroy(); } };
    },

    /* 预览：两条赛道循环赛跑（默认冒泡对快速）。bet 模式不显示名字，也不演到终点——停在半路问“谁先排完？” */
    preview: function (root, params, ctx) {
      params = params || {};
      var bet = params.mode === 'bet', rnd = ctx.rng(), N = 24;
      var pair = sortPair(params.pair) || ['bubble', 'quick'];
      return mkPreview(root, ctx, 'sorting', null, function (P) {
        var lanes = [sortLane(pair[0]), sortLane(pair[1])], acc = 0, t = 0, hold = 0, tps = 50, running = true;
        function setup() {
          var data = U.shuffle(U.range(N).map(function (v) { return v + 1; }), rnd);
          if (bet) { var ks = U.shuffle(SIM.SORT_KEYS, rnd); lanes[0].key = ks[0]; lanes[1].key = ks[1]; }
          lanes.forEach(function (L) { sortLoad(L, data); });
          tps = Math.max(lanes[0].total, lanes[1].total) / 5.5;
          acc = 0; t = 0; hold = 0; running = true;
        }
        setup();
        return {
          still: function () { setup(); for (var i = 0; i < 70; i++) lanes.forEach(function (L) { if (!L.done) sortTick(L); }); running = false; hold = -1e9; },
          tick: function (dt) {
            t += dt;
            if (running) {
              acc += tps * ((lanes[0].done || lanes[1].done) ? 2.5 : 1) * dt;
              var k = Math.min(Math.floor(acc), 20);
              acc -= k;
              while (k-- > 0) lanes.forEach(function (L) { if (!L.done) sortTick(L); });
              if ((lanes[0].done && lanes[1].done) || (bet && t > 2.8)) running = false;
            } else { hold += dt; if (hold > (bet ? 1.5 : 1.9)) setup(); }
          },
          draw: function () {
            var g = P.g, C = P.C, W = P.W, H = P.H, lh = (H - 6) / 2, i;
            g.clearRect(0, 0, W, H);
            for (i = 0; i < 2; i++) {
              var L = lanes[i], y = 2 + i * (lh + 2), top = 17;
              g.fillStyle = C.on; g.textBaseline = 'top'; g.textAlign = 'left';
              g.font = font(C, 12, 700);
              g.fillText(bet ? (i ? 'B 队' : 'A 队') : SORT_UI[L.key].name.replace('排序', ''), 6, y + 1);
              g.textAlign = 'right'; g.font = font(C, 12, 700, true);
              g.fillStyle = L.done ? C.accent : C.on;
              g.fillText((L.done ? '✓ ' : '') + L.cmp + ' 次', W - 6, y + 1);
              sortDraw(g, 6, y + top, W - 12, lh - top - 2, L, C, C.on, true);
            }
            if (bet && !running) {
              var tw = Math.min(W - 24, 150), th = 34;
              g.globalAlpha = 0.78; g.fillStyle = C.bg;
              roundRect(g, (W - tw) / 2, (H - th) / 2, tw, th, th / 2); g.fill();
              g.globalAlpha = 1; g.fillStyle = C.accent; g.textAlign = 'center'; g.textBaseline = 'middle';
              g.font = font(C, 16, 800);
              g.fillText('谁先排完？', W / 2, H / 2 + 1);
            }
          }
        };
      });
    }
  });

  /* ====================================================================== *
   * 3.7 birthday 生日悖论
   * params: { n: 23 }   默认人数（比如一个班 40 人）
   * ====================================================================== */
  function bdayWhy(n) {
    var pairs = n * (n - 1) / 2, q = 1 - SIM.birthdayTheory(n), me = 1 - Math.pow(364 / 365, n - 1);
    return '直觉算的其实是另一道题：“屋里有没有人和**我**同一天？”——那确实难，' + n + ' 个人的屋子里只有 ' + pct(me, 0) + ' 左右。\n\n'
      + '可题目问的是“**随便哪两个人**有没有撞”。' + n + ' 个人能配出 ' + n + '×' + (n - 1) + '÷2 = **' + fmtN(pairs) + ' 对**，每一对都是一次撞日子的机会。' + fmtN(pairs) + ' 张彩票一起刮，中一张就不稀奇了。\n\n'
      + '反过来算最清楚：让大家一个个进屋，每个人都得躲开前面所有人的生日。\n\n'
      + '- 第 2 个人躲开的机会：364/365\n- 第 3 个人：363/365\n- ……\n- 第 ' + n + ' 个人：' + (366 - n) + '/365\n\n'
      + '全乘起来，“一对都不撞”只剩 **' + pct(q) + '**，所以至少撞一对的机会是 ' + pct(1 - q) + '。\n\n'
      + '（这里当作一年 365 天、每天出生的人一样多，不算 2 月 29 日。）';
  }
  var bdayCnt = new Uint8Array(365);
  /* 画一年的日历：12 行（月）× 31 列（日）。有人过生日的格子涂实，两人以上同一天的格子高亮并画圈。
   * 返回撞了日子的那些天（一年里的第几天）。 */
  function bdayDraw(g, W, H, room, shown, C, o) {
    var lw = o.pv ? 0 : 20, i, m, d, idx = 0, hitsDays = [];
    /* 四周留出不到一格的边，撞日子的圈才不会被画布切掉 */
    var cell = Math.max(2, Math.min((W - lw - 4) / 31.8, (H - 4) / 13.6));
    var ox = lw + (W - lw - cell * 31) / 2, oy = (H - cell * 12) / 2, gap = cell >= 7 ? 1.5 : 1;
    bdayCnt.fill(0);
    for (i = 0; i < shown; i++) if (bdayCnt[room[i]] < 250) bdayCnt[room[i]]++;
    if (!o.pv) {
      g.fillStyle = C.muted; g.font = font(C, Math.max(8, Math.min(11, cell)), 600, true); g.textAlign = 'right'; g.textBaseline = 'middle';
      for (m = 0; m < 12; m++) g.fillText(String(m + 1), ox - 5, oy + (m + 0.5) * cell + 0.5);
    }
    for (m = 0; m < 12; m++) for (d = 0; d < SIM.MONTH_DAYS[m]; d++, idx++) {
      var c = bdayCnt[idx], x = ox + d * cell, y = oy + m * cell;
      if (c >= 2) { hitsDays.push(idx); continue; }
      g.globalAlpha = c ? 1 : (o.pv ? 0.2 : 0.1);
      g.fillStyle = c ? (o.pv ? C.on : C.show) : (o.pv ? C.on : C.ink);
      g.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap);
    }
    g.globalAlpha = 1;
    hitsDays.forEach(function (day) {
      var dt = SIM.dayToDate(day), x = ox + (dt[1] - 1) * cell + cell / 2, y = oy + dt[0] * cell + cell / 2;
      var pulse = 0.5 + 0.5 * Math.sin((o.pulse || 0) * 7);
      g.fillStyle = C.accent;
      g.fillRect(x - cell / 2 - 1, y - cell / 2 - 1, cell + 2, cell + 2);
      g.strokeStyle = C.accent; g.lineWidth = 2; g.globalAlpha = 0.9 - 0.4 * pulse;
      g.beginPath(); g.arc(x, y, cell * (0.95 + 0.35 * pulse), 0, 6.2832); g.stroke();
      g.globalAlpha = 1;
    });
    return hitsDays;
  }

  JN.registerWidget({
    id: 'birthday',
    name: '生日悖论',
    rules: '先猜：一屋子人里，至少有两个人同一天生日的可能性有多大？再随机“请”一屋又一屋的人进来，看看到底多常撞日子。',
    mount: function (root, params, ctx) {
      params = params || {};
      var n = clampInt(params.n, 2, 70, 23);
      var rnd = ctx.rng(), C = readColors(root), alive = true;
      var rooms = new Int32Array(71), hits = new Int32Array(71);
      var room = new Int16Array(70), shown = 0, shownF = 0, roomHit = false, revealing = false, counted = true;
      var batch = 0, acc = 0, pulse = 9, phase = 'guess', lastDays = [];

      var sh = mkShell(root, 'birthday', ctx);
      var why = mkWhy(sh.wrap, 'birthday', '才这么几个人，怎么就撞了？', bdayWhy(n));
      why.hide();                                          // 猜之前不给看答案
      sh.head.appendChild(why.btn);

      var gNum = U.el('div.w-birthday-gnum.jn-big', { text: '？' });
      var gRange = U.el('input.jn-range.w-birthday-range', { attrs: { type: 'range', min: '0', max: '100', step: '1', value: '0', 'aria-label': '你猜的可能性（百分比）' } });
      var gBtn = mkBtn('就猜这个', '.jn-btn--lg.w-birthday-go', function () { lockGuess(); });
      gBtn.disabled = true;
      var guessBox = U.el('div.w-birthday-guess', [
        U.el('div.w-birthday-gtip', { text: '拖动滑块，押一个数' }),
        gNum,
        gRange,
        U.el('div.w-birthday-gscale', [U.el('span', { text: '0% 不可能' }), U.el('span', { text: '一半一半' }), U.el('span', { text: '100% 肯定有' })]),
        gBtn
      ]);

      var calHost = U.el('div.w-birthday-cal'), chartHost = U.el('div.w-birthday-chart');
      var cal = mkCanvas(calHost), chart = mkCanvas(chartHost);
      var tRoom = mkStat('birthday', '这一屋'), tSim = mkStat('birthday', '模拟'), tTh = mkStat('birthday', '理论');
      var nVal = U.el('span.w-birthday-nval.jn-num');
      var nRange = U.el('input.jn-range.w-birthday-range', { attrs: { type: 'range', min: '2', max: '70', step: '1', value: String(n), 'aria-label': '屋里的人数' } });
      var oneBtn = mkBtn('再来一屋', '.w-birthday-b', function () { newRoom(true); });
      var manyBtn = mkBtn('跑 1000 屋', '.jn-btn--ghost.w-birthday-b', function () { runBatch(); });
      var simBox = U.el('div.w-birthday-sim', { attrs: { hidden: '' } }, [
        calHost,
        U.el('div.w-birthday-stats', [tRoom.el, tSim.el, tTh.el]),
        chartHost,
        U.el('label.w-birthday-nrow', [U.el('span', { text: '人数' }), nRange, nVal]),
        U.el('div.w-birthday-ctl', [oneBtn, manyBtn])
      ]);
      U.append(sh.wrap, [guessBox, simBox]);

      function dateName(day) { var d = SIM.dayToDate(day); return (d[0] + 1) + '月' + d[1] + '日'; }
      function stats() {
        tSim.label(rooms[n] ? '模拟 ' + rooms[n] + ' 屋' : '模拟');
        tSim.set(rooms[n] ? pct(hits[n] / rooms[n]) : '—');
        tTh.set(pct(SIM.birthdayTheory(n)));
        nVal.textContent = n + ' 人';
      }
      function drawChart() {
        if (!chart.fit()) return;
        var g = chart.g, W = chart.w, H = chart.h, L = 32, R = 10, T = 8, B = 15, k;
        function X(v) { return L + (W - L - R) * (v - 2) / 68; }
        function Y(p) { return T + (H - T - B) * (1 - p); }
        g.clearRect(0, 0, W, H);
        g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.muted; g.font = font(C, 10, 500, true);
        g.textAlign = 'right'; g.textBaseline = 'middle';
        [0, 0.5, 1].forEach(function (p) {
          var y = Math.round(Y(p)) + 0.5;
          g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
          g.fillText(Math.round(p * 100) + '%', L - 5, y);
        });
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        [2, 10, 23, 40, 55, 70].forEach(function (v) { g.fillText(v + (v === 70 ? ' 人' : ''), Math.min(X(v), W - 16), H - 3); });
        /* 理论曲线 P(k) = 1 − 365/365 × 364/365 × … × (365−k+1)/365 */
        g.strokeStyle = C.accent; g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath();
        for (k = 2; k <= 70; k++) { if (k === 2) g.moveTo(X(k), Y(SIM.birthdayTheory(k))); else g.lineTo(X(k), Y(SIM.birthdayTheory(k))); }
        g.stroke();
        /* 各个人数已经模拟出来的频率（跑够 20 屋才画） */
        g.fillStyle = C.show;
        for (k = 2; k <= 70; k++) if (rooms[k] >= 20) { g.beginPath(); g.arc(X(k), Y(hits[k] / rooms[k]), k === n ? 4.5 : 3, 0, 6.2832); g.fill(); }
        g.font = font(C, 10, 700, true); g.textBaseline = 'middle';
        [23, 40].forEach(function (v) {
          var p = SIM.birthdayTheory(v);
          g.fillStyle = C.accent; g.beginPath(); g.arc(X(v), Y(p), 3.5, 0, 6.2832); g.fill();
          if (Math.abs(v - n) < 9 && v !== n) return;
          g.fillStyle = C.ink2; g.textAlign = 'left';
          g.fillText(v + ' 人 ' + pct(p), X(v) + 7, Y(p) + 9);
        });
        var pn = SIM.birthdayTheory(n), xn = Math.round(X(n)) + 0.5;
        g.strokeStyle = C.ink; g.globalAlpha = 0.55; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(xn, T); g.lineTo(xn, H - B); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.arc(X(n), Y(pn), 5.5, 0, 6.2832); g.stroke();
      }
      function render() {
        if (cal.fit()) {
          cal.g.clearRect(0, 0, cal.w, cal.h);
          lastDays = bdayDraw(cal.g, cal.w, cal.h, room, shown, C, { pulse: pulse });
        }
        drawChart();
      }
      function settle() {
        if (!counted) { counted = true; rooms[n]++; if (roomHit) hits[n]++; }
        shown = n; revealing = false;
      }
      function announce() {
        tRoom.set(roomHit ? '撞了！' : '没撞');
        tRoom.el.classList.toggle('is-hit', roomHit);
        if (!roomHit) { sh.say('这一屋 ' + n + ' 个人，365 天随便挑，没人撞。再来一屋？'); return; }
        var cnt = {}, days = [], i;
        for (i = 0; i < n; i++) { cnt[room[i]] = (cnt[room[i]] || 0) + 1; if (cnt[room[i]] === 2) days.push(room[i]); }
        days.sort(function (a, b) { return a - b; });
        sh.say('撞了！' + days.slice(0, 3).map(function (d) { return dateName(d) + '（' + cnt[d] + ' 人）'; }).join('、') + (days.length > 3 ? ' 等 ' + days.length + ' 天' : '') + '。');
      }
      function newRoom(animated) {
        if (!alive || phase !== 'sim') return;
        batch = 0;
        settle();
        roomHit = SIM.birthdayRoom(rnd, n, room);
        counted = false; shown = 0; shownF = 0; revealing = true; pulse = 0;
        if (!animated || ctx.reduced) { settle(); announce(); stats(); render(); return; }
        ctx.sfx('tap');
        tRoom.set('……');
        tRoom.el.classList.remove('is-hit');
        loop.start();
      }
      function runBatch() {
        if (!alive || phase !== 'sim') return;
        settle();
        batch = 1000; acc = 0;
        ctx.sfx('whoosh');
        sh.say(n + ' 个人一屋，连跑 1000 屋……');
        if (ctx.reduced) { step(1000); return; }
        loop.start();
      }
      function step(k) {
        k = Math.min(k, batch);
        batch -= k;
        while (k-- > 0) { roomHit = SIM.birthdayRoom(rnd, n, room); rooms[n]++; if (roomHit) hits[n]++; }
        shown = n; counted = true; revealing = false; pulse = 0;
        tRoom.set(roomHit ? '撞了！' : '没撞');
        tRoom.el.classList.toggle('is-hit', roomHit);
        stats();
        if (batch <= 0) {
          batch = 0;
          sh.say(n + ' 个人一屋，试了 ' + fmtN(rooms[n]) + ' 屋，' + fmtN(hits[n]) + ' 屋撞了：' + pct(hits[n] / rooms[n]) + '。算出来是 ' + pct(SIM.birthdayTheory(n)) + '。');
          ctx.sfx('good');
        }
        render();
      }
      function setN(v) {
        if (phase !== 'sim') return;
        batch = 0;
        settle();
        n = clampInt(v, 2, 70, 23);
        newRoom(false);
      }
      function lockGuess() {
        if (!alive || phase !== 'guess' || gBtn.disabled) return;
        phase = 'sim';
        var g = clampInt(gRange.value, 0, 100, 0), p = SIM.birthdayTheory(n) * 100, diff = Math.abs(g - p);
        guessBox.hidden = true;
        simBox.removeAttribute('hidden');
        why.show();
        ctx.sfx(diff <= 5 ? 'win' : 'good');
        if (diff <= 5) ctx.confetti();
        ctx.done({ win: diff <= 5, text: '猜 ' + g + '%，算出来 ' + p.toFixed(1) + '%' });
        stats();
        newRoom(false);
        sh.say('你猜 ' + g + '%。算出来是 ' + p.toFixed(1) + '%' + (diff <= 5 ? '——神了！' : g < p ? '——比你想的高。' : '——比你想的低。') + '不信？一屋一屋地试。');
      }
      var loop = mkLoop(function (dt) {
        var busy = false;
        pulse += dt;
        if (batch > 0) {
          acc += 700 * dt;                                 // 屋/秒
          var k = Math.min(Math.floor(acc), 40);            // 单帧最多 40 屋
          acc -= k;
          if (k > 0) step(k); else render();
          busy = batch > 0;
        } else if (revealing) {
          shownF += n * dt / 0.7;
          shown = Math.min(n, Math.floor(shownF));
          if (shown >= n) { settle(); announce(); stats(); pulse = 0; }
          render();
          busy = true;
        } else render();
        if (!busy && pulse > 1.6) loop.stop();
      });
      gRange.addEventListener('input', function () {
        gNum.textContent = clampInt(gRange.value, 0, 100, 0) + '%';
        gBtn.disabled = false;
      });
      nRange.addEventListener('input', function () { setN(nRange.value); });

      ctx.onResize(function () { C = readColors(root); sh.roomy(); if (phase === 'sim') render(); });
      sh.say('一个 ' + n + ' 人的房间里，至少有两个人同一天生日——你觉得可能性有多大？');
      return { destroy: function () { alive = false; batch = 0; revealing = false; loop.destroy(); } };
    },

    /* 预览：一屋一屋地刷。每屋的人落在日历上，撞了日子的那天亮起来；底下记着撞了几屋。 */
    preview: function (root, params, ctx) {
      var n = clampInt(params && params.n, 2, 70, 23), rnd = ctx.rng();
      return mkPreview(root, ctx, 'birthday', null, function (P) {
        var room = new Int16Array(70), shownF = 0, t = 0, hit = false, rooms = 0, hits = 0, counted = true;
        function next() {
          if (rooms >= 12) { rooms = 0; hits = 0; }
          hit = SIM.birthdayRoom(rnd, n, room);
          shownF = 0; t = 0; counted = false;
        }
        next();
        return {
          still: function () { rooms = 0; hits = 0; do { next(); } while (!hit); shownF = n; counted = true; rooms = 1; hits = 1; t = 0.3; },
          tick: function (dt) {
            t += dt;
            shownF = Math.min(n, shownF + n * dt / 0.5);
            if (shownF >= n && !counted) { counted = true; rooms++; if (hit) hits++; }
            if (t > (hit ? 1.7 : 1.0)) next();
          },
          draw: function () {
            var g = P.g, C = P.C, W = P.W, H = P.H, fh = 22;
            g.clearRect(0, 0, W, H);
            g.save();
            bdayDraw(g, W, H - fh, room, Math.floor(shownF), C, { pv: true, pulse: t });
            g.restore();
            g.textBaseline = 'middle'; g.font = font(C, 12, 700);
            g.fillStyle = C.on; g.textAlign = 'left';
            g.fillText(n + ' 人一屋', 8, H - fh / 2);
            g.textAlign = 'right';
            g.fillStyle = hit && counted ? C.accent : C.on;
            g.fillText((hit && counted ? '撞了！ ' : '') + hits + ' / ' + rooms + ' 屋', W - 8, H - fh / 2);
          }
        };
      });
    }
  });
})();
