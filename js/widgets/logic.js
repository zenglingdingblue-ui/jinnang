/* 锦囊 · widgets/logic —— 逻辑与数字类组件（组件工程师 G1）
 * 十个“一起解决一件事”的小游戏：
 *   make24 算 24 点 · bulls 猜数字 · nim 取石子 · hanoi 汉诺塔 · sudoku 迷你数独
 *   lights 关灯 · memory 记忆翻牌 · onestroke 一笔画 · mindread 读心术 · cipher 密码机
 *
 * 文件分三段：
 *   A. 公共小工具（清理袋、秒表、结果条、尺寸）
 *   B. 纯逻辑：不碰 DOM，全部挂在 JN._logic 下，dev/test-logic.js 在 Node 里逐条验证
 *   C. 十个组件的界面
 * 类名一律 w-<组件 id>-…，样式在 css/widgets-logic.css。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;

  /* ====================================================================== *
   * A. 公共小工具
   * ====================================================================== */

  /** 清理袋：组件里所有的计时器、动画帧、全局监听都从这里走，destroy 时一次清空，之后不会再有代码在跑。 */
  function makeScope() {
    var timers = {}, frames = {}, offs = [], seq = 0, dead = false;
    return {
      isDead: function () { return dead; },
      after: function (ms, fn) {
        if (dead) return 0;
        var key = ++seq;
        timers[key] = setTimeout(function () { delete timers[key]; if (!dead) fn(); }, ms);
        return key;
      },
      every: function (ms, fn) {
        if (dead) return 0;
        var key = ++seq;
        timers[key] = setInterval(function () { if (!dead) fn(); }, ms);
        return key;
      },
      cancel: function (key) {
        if (!key || timers[key] == null) return;
        clearTimeout(timers[key]);
        clearInterval(timers[key]);
        delete timers[key];
      },
      frame: function (fn) {
        if (dead) return 0;
        var key = ++seq;
        frames[key] = requestAnimationFrame(function (t) { delete frames[key]; if (!dead) fn(t); });
        return key;
      },
      on: function (target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        offs.push(function () { target.removeEventListener(type, fn, opts); });
      },
      destroy: function () {
        var k;
        dead = true;
        for (k in timers) { clearTimeout(timers[k]); clearInterval(timers[k]); }
        for (k in frames) cancelAnimationFrame(frames[k]);
        offs.forEach(function (off) { off(); });
        timers = {}; frames = {}; offs = [];
      }
    };
  }

  /** 一次性的动画类（抖一下、弹一下）。重复触发能重播；播完自动摘掉，不会压住节点自己的 transform。 */
  function fx(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    node.addEventListener('animationend', function done() {
      node.removeEventListener('animationend', done);
      node.classList.remove(cls);
    });
  }

  /** 秒表：把已用时间写进 node（m:ss）。 */
  function makeClock(scope, node) {
    var t0 = 0, acc = 0, running = false, tick = 0;
    function ms() { return acc + (running ? Date.now() - t0 : 0); }
    function paint() { if (node) node.textContent = U.fmtTime(ms()); }
    return {
      ms: ms,
      running: function () { return running; },
      start: function () {
        if (running) return;
        running = true; t0 = Date.now();
        tick = scope.every(250, paint);
        paint();
      },
      stop: function () {
        if (!running) return;
        acc = ms(); running = false;
        scope.cancel(tick);
        paint();
      },
      reset: function () {
        acc = 0; running = false;
        scope.cancel(tick);
        paint();
      }
    };
  }

  function button(cls, label, onTap) {
    return U.el('button.' + cls, { text: label, attrs: { type: 'button' }, on: { click: onTap } });
  }

  /** 分段选择（.jn-seg）。items: [{ v, label }]；返回 { node, set(v) }。 */
  function segment(cls, items, value, onPick) {
    var box = U.el('div.jn-seg.' + cls);
    var btns = items.map(function (it) {
      var b = U.el('button', { text: it.label, attrs: { type: 'button' } });
      b.addEventListener('click', function () {
        if (b.classList.contains('is-on')) return;
        set(it.v);
        onPick(it.v);
      });
      box.appendChild(b);
      return b;
    });
    function set(v) { btns.forEach(function (b, i) { b.classList.toggle('is-on', items[i].v === v); }); }
    set(value);
    return { node: box, set: set };
  }

  /** 一局结束时从底部升起的结果条：标题、一行说明、可选的附加内容、按钮。类名按组件 id 生成（w-<id>-end…）。 */
  function makeEnd(id, host) {
    var p = 'w-' + id + '-end';
    var title = U.el('div.' + p + '-title');
    var sub = U.el('div.' + p + '-sub');
    var more = U.el('div.' + p + '-more');
    var btns = U.el('div.' + p + '-btns');
    var box = U.el('div.' + p, [title, sub, more, btns]);
    box.hidden = true;
    host.appendChild(box);
    return {
      node: box,
      more: more,
      /** o: { title, sub, more: 节点或数组, tone: 'win' | 'lose' | '', buttons: [{ label, on }] }，第一个按钮是主按钮 */
      show: function (o) {
        title.textContent = o.title || '';
        sub.textContent = o.sub || '';
        sub.hidden = !o.sub;
        U.clear(more);
        if (o.more) U.append(more, o.more);
        more.hidden = !o.more;
        U.clear(btns);
        (o.buttons || []).forEach(function (b, i) {
          btns.appendChild(button('jn-btn' + (i > 0 ? '.jn-btn--ghost' : ''), b.label, b.on));
        });
        box.setAttribute('data-tone', o.tone || '');
        box.hidden = false;
        box.scrollTop = 0;
        fx(box, p + '--in');
      },
      hide: function () { box.hidden = true; },
      shown: function () { return !box.hidden; }
    };
  }

  /** 立刻按当前舞台大小排一次版，之后舞台每次变化再排。拿不到尺寸时按 360×600 估。 */
  function watchSize(ctx, fn) {
    function run() {
      var s = ctx.size();
      fn(s.w > 0 ? s.w : 360, s.h > 0 ? s.h : 600);
    }
    ctx.onResize(run);
    run();
  }

  function setVars(node, vars) {
    for (var k in vars) node.style.setProperty('--' + k, typeof vars[k] === 'number' ? vars[k] + 'px' : vars[k]);
  }

  /** 把参数里的数收进 [lo, hi]，不是数就用默认值 */
  function numParam(v, lo, hi, dflt) {
    v = Number(v);
    if (!isFinite(v)) return dflt;
    return U.clamp(v, lo, hi);
  }

  /* ====================================================================== *
   * B. 纯逻辑（JN._logic）
   * ====================================================================== */
  var L = (JN._logic = JN._logic || {});

  /* ---------------------------------------------------------------------- *
   * B0. 分数：分子分母全程是整数，随时约分，没有浮点误差（8 ÷ 3 × 3 一定等于 8）
   * ---------------------------------------------------------------------- */
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }
  function fr(n, d) {
    if (d == null) d = 1;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  function frOp(op, a, b) {
    switch (op) {
      case '+': return fr(a.n * b.d + b.n * a.d, a.d * b.d);
      case '-': return fr(a.n * b.d - b.n * a.d, a.d * b.d);
      case '*': return fr(a.n * b.n, a.d * b.d);
      case '/': return b.n === 0 ? null : fr(a.n * b.d, a.d * b.n);
    }
    return null;
  }
  function frIs(a, n) { return a.d === 1 && a.n === n; }
  function frStr(a) { return (a.n < 0 ? '−' : '') + Math.abs(a.n) + (a.d === 1 ? '' : '/' + a.d); }
  L.frac = { make: fr, op: frOp, is: frIs, str: frStr, gcd: gcd };

  /* ---------------------------------------------------------------------- *
   * B1. 24 点
   * 求解：从手里的几个数里任取两个，用六种算法之一（a+b、a×b、a−b、b−a、a÷b、b÷a）合成一个，
   * 递归到只剩一个数，看它是不是 24。任何带括号的四则算式，求值过程都是一连串这样的“两两合并”，
   * 所以这个搜索不会漏解。四张牌最多 6×6 × 3×6 × 1×6 = 3888 条路，瞬间搜完。
   * 分两遍：第一遍只允许中间结果是非负整数（给出的提示更像人算的）；搜不到再放开分数和负数。
   * 公认结果：1–13 里任取四张（可重复）共 1820 种组合，其中 1362 种有解 —— test-logic.js 会核对。
   * ---------------------------------------------------------------------- */
  var SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

  /** 牌面：{ v 分数, e 算式字符串, p 优先级（3 一张原牌、2 乘除、1 加减） } */
  function atom24(n) { return { v: fr(n, 1), e: String(n), p: 3 }; }
  /** 把两张牌合成一张，顺手拼好算式（只在必要的地方加括号）。除以 0 时返回 null。 */
  function combine24(a, op, b) {
    var v = frOp(op, a.v, b.v);
    if (!v) return null;
    var p = PREC[op];
    var le = a.p < p ? '(' + a.e + ')' : a.e;
    var re = (b.p < p || (b.p === p && (op === '-' || op === '/'))) ? '(' + b.e + ')' : b.e;
    return { v: v, e: le + ' ' + SYM[op] + ' ' + re, p: p };
  }
  function tries24(x, y) {
    return [['+', x, y], ['*', x, y], ['-', x, y], ['-', y, x], ['/', x, y], ['/', y, x]];
  }
  /** items: [{ id, v, e, p }]。找到第一条能算出 target 的路就把步骤留在 path 里并返回 true。
   *  步骤：{ a: 先点的牌 id, op, b: 后点的牌 id, r: 合成的新牌（放在 b 的位置上，和界面一致） } */
  function search24(items, target, plain, path) {
    if (items.length === 1) return frIs(items[0].v, target);
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var rest = [];
        for (var k = 0; k < items.length; k++) if (k !== i && k !== j) rest.push(items[k]);
        var tries = tries24(items[i], items[j]);
        for (var t = 0; t < tries.length; t++) {
          var r = combine24(tries[t][1], tries[t][0], tries[t][2]);
          if (!r) continue;
          if (plain && (r.v.d !== 1 || r.v.n < 0)) continue;
          r.id = tries[t][2].id;
          path.push({ a: tries[t][1].id, op: tries[t][0], b: tries[t][2].id, r: r });
          if (search24(rest.concat([r]), target, plain, path)) return true;
          path.pop();
        }
      }
    }
    return false;
  }
  /** 数一数有多少条“两两合并”的路能算出 target（同一个算式换个顺序会重复计数，只用来比较难易）。 */
  function count24(items, target, plain) {
    if (items.length === 1) return frIs(items[0].v, target) ? 1 : 0;
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var rest = [];
        for (var k = 0; k < items.length; k++) if (k !== i && k !== j) rest.push(items[k]);
        var tries = tries24(items[i], items[j]);
        for (var t = 0; t < tries.length; t++) {
          var r = combine24(tries[t][1], tries[t][0], tries[t][2]);
          if (!r) continue;
          if (plain && (r.v.d !== 1 || r.v.n < 0)) continue;
          total += count24(rest.concat([r]), target, plain);
        }
      }
    }
    return total;
  }
  function items24(nums) {
    return nums.map(function (n, i) { var a = atom24(n); a.id = i; return a; });
  }
  /** 从当前这几张牌出发的解法步骤；无解返回 null。 */
  function solveItems24(items, target) {
    var path = [];
    if (search24(items, target, true, path)) return path;
    path = [];
    if (search24(items, target, false, path)) return path;
    return null;
  }
  /* 难度分档：用“只经过非负整数的算法有多少条”来衡量（全部 1362 种有解牌型的中位数大约是 8 条）。
   * easy   1–9  的牌，路很多（≥ 20 条），随手凑就能撞上，约 110 种牌型
   * normal 1–10 的牌，路不多不少（6–19 条），约 290 种
   * hard   1–13 的牌，只有寥寥几条路（< 6 条），其中 16 种必须经过分数（0 条），约 460 种
   * 门槛是把全部组合跑一遍后挑的；随机抽四个数，平均三五次就能抽到合格的。 */
  var LEVEL24 = {
    easy: { name: '简单', max: 9, lo: 20, hi: Infinity, fallback: [1, 2, 3, 4] },
    normal: { name: '普通', max: 10, lo: 6, hi: 20, fallback: [4, 7, 8, 8] },
    hard: { name: '困难', max: 13, lo: 0, hi: 6, fallback: [3, 3, 7, 7] }
  };
  L.make24 = {
    levels: LEVEL24,
    sym: SYM,
    atom: atom24,
    combine: combine24,
    items: items24,
    solveItems: solveItems24,
    /** solve([3,3,8,8]) -> { expr: '8 ÷ (3 − 8 ÷ 3)', steps: [...] }；无解返回 null */
    solve: function (nums, target) {
      var path = solveItems24(items24(nums), target == null ? 24 : target);
      if (!path) return null;
      return { expr: path.length ? path[path.length - 1].r.e : String(nums[0]), steps: path };
    },
    /** grade([..]) -> { plain: 只经过非负整数的路数, all: 全部路数 } */
    grade: function (nums, target) {
      target = target == null ? 24 : target;
      var plain = count24(items24(nums), target, true);
      return { plain: plain, all: plain > 0 ? plain : count24(items24(nums), target, false) };
    },
    /** 按难度随机发四张牌，保证有解。rnd 可省略。 */
    deal: function (level, rnd) {
      var cfg = LEVEL24[level] || LEVEL24.normal;
      for (var tries = 0; tries < 400; tries++) {
        var nums = [];
        for (var i = 0; i < 4; i++) nums.push(U.randInt(1, cfg.max, rnd));
        var g = L.make24.grade(nums);
        if (g.all > 0 && g.plain >= cfg.lo && g.plain < cfg.hi) return nums.sort(function (a, b) { return a - b; });
      }
      return cfg.fallback.slice();
    }
  };

  /* ---------------------------------------------------------------------- *
   * B2. 猜数字（几 A 几 B）
   * 数字和位置都对算 A；数字对、位置不对算 B。谜底和猜测都是不重复的数字，所以逐位比较即可。
   * ---------------------------------------------------------------------- */
  L.bulls = {
    score: function (secret, guess) {
      var a = 0, b = 0;
      for (var i = 0; i < guess.length; i++) {
        if (guess.charAt(i) === secret.charAt(i)) a++;
        else if (secret.indexOf(guess.charAt(i)) >= 0) b++;
      }
      return { a: a, b: b };
    },
    valid: function (s, len) {
      s = String(s);
      if (s.length !== (len || 4) || !/^\d+$/.test(s)) return false;
      for (var i = 0; i < s.length; i++) if (s.indexOf(s.charAt(i)) !== i) return false;
      return true;
    },
    secret: function (rnd, len) {
      return U.shuffle('0123456789'.split(''), rnd).slice(0, len || 4).join('');
    }
  };

  /* ---------------------------------------------------------------------- *
   * B3. 取石子
   *
   * 一堆（抢 21）：n 颗，每次拿 1..max 颗，记 m = max + 1。
   *   「拿到最后一颗赢」：轮到你时若 n 是 m 的倍数，你必输——你拿 k 颗，对方拿 m−k 颗，
   *     还给你的永远是 m 的倍数，直到 0，最后一颗归对方。反过来，n 不是 m 的倍数时，
   *     拿走 n mod m 颗，就把“m 的倍数”丢给了对方。
   *   「拿到最后一颗输」：谁被迫面对 1 颗谁输，相当于大家在抢“倒数第二颗”，
   *     把上面的 n 换成 n−1：轮到你时若 n ≡ 1 (mod m) 你必输，否则拿走 (n−1) mod m 颗。
   *
   * 多堆（Nim，Bouton 1901）：把各堆的颗数按二进制逐位异或，得到“尼姆和” s。
   *   「拿到最后一颗赢」：s = 0 时轮到谁谁输。理由：全空时 s = 0，且轮到的人已经输了；
   *     s = 0 时不管怎么拿，被动的那一堆变了，s 一定变成非 0；s ≠ 0 时取 s 的最高位，
   *     一定有一堆 h 在这一位上是 1，于是 h XOR s < h，把这堆减到 h XOR s，s 就回到 0。
   *   「拿到最后一颗输」：只要拿完后还剩至少一堆多于 1 颗，走法和上面完全一样；
   *     当只剩一堆多于 1 颗时，把它拿到剩 1 颗或拿光，使留下的“1 颗堆”是奇数个；
   *     全是 1 颗堆时没得选，剩偶数堆的一方赢。
   *
   * 两个函数都返回 winning：false 表示这个局面理论上必输，只能随便拿一手等对方出错。
   * test-logic.js 用穷举博弈树核对：只要局面必胜，照这里走就一定赢。
   * ---------------------------------------------------------------------- */
  L.nim = {
    takeMove: function (n, max, last) {
      var m = max + 1;
      var r = last === 'lose' ? (n - 1) % m : n % m;
      if (r > 0) return { take: r, winning: true };
      return { take: 1, winning: false };
    },
    heapMove: function (heaps, last) {
      var i, s = 0, big = 0, ones = 0, bigAt = -1;
      for (i = 0; i < heaps.length; i++) {
        s ^= heaps[i];
        if (heaps[i] > 1) { big++; bigAt = i; } else if (heaps[i] === 1) ones++;
      }
      if (last === 'lose') {
        if (big === 0) {
          for (i = 0; i < heaps.length; i++) if (heaps[i] === 1) return { heap: i, take: 1, winning: ones % 2 === 0 };
          return null;
        }
        if (big === 1) {
          return { heap: bigAt, take: ones % 2 === 0 ? heaps[bigAt] - 1 : heaps[bigAt], winning: true };
        }
      }
      if (s !== 0) {
        for (i = 0; i < heaps.length; i++) {
          var keep = heaps[i] ^ s;
          if (keep < heaps[i]) return { heap: i, take: heaps[i] - keep, winning: true };
        }
      }
      var top = -1;
      for (i = 0; i < heaps.length; i++) if (heaps[i] > 0 && (top < 0 || heaps[i] > heaps[top])) top = i;
      return top < 0 ? null : { heap: top, take: 1, winning: false };
    },
    /** 电脑在「抢 21」里的一手。ease：本来能赢时，以这个概率故意走一步别的（只在还剩不少颗时才放水，收尾不会犯傻）。 */
    aiTake: function (n, max, last, ease, rnd) {
      rnd = rnd || Math.random;
      var best = L.nim.takeMove(n, max, last);
      if (best.winning && n > max + 2 && rnd() < ease) {
        var alts = [];
        for (var k = 1; k <= Math.min(max, n); k++) if (k !== best.take) alts.push(k);
        if (alts.length) return { take: U.pick(alts, rnd), winning: false, slip: true };
      }
      return best;
    },
    /** 电脑在多堆里的一手，同样带放水。 */
    aiHeap: function (heaps, last, ease, rnd) {
      rnd = rnd || Math.random;
      var best = L.nim.heapMove(heaps, last);
      if (!best) return null;
      var total = 0, alive = 0;
      heaps.forEach(function (h) { total += h; if (h > 0) alive++; });
      if (best.winning && alive > 1 && total > 5 && rnd() < ease) {
        var alts = [];
        heaps.forEach(function (h, i) {
          for (var k = 1; k <= h; k++) if (!(i === best.heap && k === best.take)) alts.push({ heap: i, take: k });
        });
        if (alts.length) { var m = U.pick(alts, rnd); return { heap: m.heap, take: m.take, winning: false, slip: true }; }
      }
      return best;
    }
  };

  /* ---------------------------------------------------------------------- *
   * B4. 汉诺塔
   * 递归：要搬 n 层，先把上面 n−1 层搬到中转柱，再搬最大的那层，再把 n−1 层搬过来。
   * 步数 T(n) = 2·T(n−1) + 1 = 2^n − 1，而且不可能更少：最大的盘要挪窝，
   * 其余 n−1 个必须先整整齐齐叠在第三根柱子上（至少 T(n−1) 步），挪完还得再搬一遍。
   * ---------------------------------------------------------------------- */
  L.hanoi = {
    minMoves: function (n) { return Math.pow(2, n) - 1; },
    /** 最优解：[[from, to], ...]，把 n 层从 a 柱搬到 c 柱（b 是中转） */
    solve: function (n, a, b, c, out) {
      out = out || [];
      if (n <= 0) return out;
      L.hanoi.solve(n - 1, a, c, b, out);
      out.push([a, c]);
      L.hanoi.solve(n - 1, b, a, c, out);
      return out;
    },
    /** 任意合法局面：把 1..k 号盘（1 最小）全部搬到 target 柱最少还要几步、第一步怎么走。pos[d] 是 d 号盘所在的柱子。
     *  最大的那个不在 target 上时，它只需要动一次：先把比它小的都挪到第三根柱子，搬它，再把小的搬回来。 */
    plan: function (pos, k, target) {
      if (k === 0) return { dist: 0, move: null };
      if (pos[k] === target) return L.hanoi.plan(pos, k - 1, target);
      var aux = 3 - pos[k] - target;
      var sub = L.hanoi.plan(pos, k - 1, aux);
      return {
        dist: sub.dist + 1 + (Math.pow(2, k - 1) - 1),
        move: sub.move || { disc: k, from: pos[k], to: target }
      };
    },
    /** 从出发柱 home 以外的两根柱子里，挑离完工更近的那根来给提示 */
    hint: function (pos, n, home) {
      var best = null;
      for (var t = 0; t < 3; t++) {
        if (t === home) continue;
        var p = L.hanoi.plan(pos, n, t);
        if (!best || p.dist < best.dist) { best = p; best.target = t; }
      }
      return best;
    }
  };

  /* ---------------------------------------------------------------------- *
   * B5. 迷你数独：4×4（2×2 宫）和 6×6（两行三列的宫）
   * 出题：先用随机回溯填出一张完整的终盘，再按随机顺序一格格挖空；
   * 每挖一格都用回溯数一遍解的个数（数到 2 就停），不是唯一解就把这格放回去。
   * ---------------------------------------------------------------------- */
  function sdkShape(size) {
    return Number(size) === 6 ? { n: 6, br: 2, bc: 3 } : { n: 4, br: 2, bc: 2 };
  }
  /** 第 idx 格还能填哪些数 */
  function sdkOptions(g, sh, idx) {
    var n = sh.n, r = Math.floor(idx / n), c = idx % n, used = [], i, j;
    for (i = 0; i < n; i++) { used[g[r * n + i]] = true; used[g[i * n + c]] = true; }
    var r0 = r - (r % sh.br), c0 = c - (c % sh.bc);
    for (i = 0; i < sh.br; i++) for (j = 0; j < sh.bc; j++) used[g[(r0 + i) * n + c0 + j]] = true;
    var out = [];
    for (i = 1; i <= n; i++) if (!used[i]) out.push(i);
    return out;
  }
  /** 数解的个数，数到 limit 就停。每次挑候选最少的空格下手。会临时改写 g，返回前还原。 */
  function sdkCount(g, sh, limit) {
    var at = -1, opts = null, i;
    for (i = 0; i < g.length; i++) {
      if (g[i]) continue;
      var o = sdkOptions(g, sh, i);
      if (!o.length) return 0;
      if (!opts || o.length < opts.length) { at = i; opts = o; if (o.length === 1) break; }
    }
    if (at < 0) return 1;
    var total = 0;
    for (i = 0; i < opts.length && total < limit; i++) {
      g[at] = opts[i];
      total += sdkCount(g, sh, limit - total);
    }
    g[at] = 0;
    return total;
  }
  function sdkFill(g, sh, rnd) {
    var at = g.indexOf(0);
    if (at < 0) return true;
    var opts = U.shuffle(sdkOptions(g, sh, at), rnd);
    for (var i = 0; i < opts.length; i++) {
      g[at] = opts[i];
      if (sdkFill(g, sh, rnd)) return true;
    }
    g[at] = 0;
    return false;
  }
  /** 互相冲突（同行、同列或同宫里重复）的格子下标表：bad[i] = true */
  function sdkConflicts(g, sh) {
    var n = sh.n, bad = [], i, j;
    function same(a, b) {
      if (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n) return true;
      return Math.floor(Math.floor(a / n) / sh.br) === Math.floor(Math.floor(b / n) / sh.br) &&
        Math.floor((a % n) / sh.bc) === Math.floor((b % n) / sh.bc);
    }
    for (i = 0; i < g.length; i++) {
      if (!g[i]) continue;
      for (j = i + 1; j < g.length; j++) {
        if (g[j] === g[i] && same(i, j)) { bad[i] = true; bad[j] = true; }
      }
    }
    return bad;
  }
  var SDK_GIVENS = { 4: { easy: 8, normal: 6, hard: 4 }, 6: { easy: 20, normal: 15, hard: 10 } };
  L.sudoku = {
    shape: sdkShape,
    options: sdkOptions,
    count: function (grid, size, limit) { return sdkCount(grid.slice(), sdkShape(size), limit || 2); },
    conflicts: function (grid, size) { return sdkConflicts(grid, sdkShape(size)); },
    givens: SDK_GIVENS,
    /** generate(4 | 6, rnd, 想留几个已知数) -> { size, puzzle, solution, givens }。puzzle 里 0 是空格，保证唯一解。 */
    generate: function (size, rnd, givens) {
      var sh = sdkShape(size), n = sh.n, i;
      var sol = [];
      for (i = 0; i < n * n; i++) sol.push(0);
      sdkFill(sol, sh, rnd);
      var puz = sol.slice(), left = n * n;
      var order = U.shuffle(U.range(n * n), rnd);
      if (givens == null) givens = SDK_GIVENS[n].normal;
      for (i = 0; i < order.length && left > givens; i++) {
        var keep = puz[order[i]];
        puz[order[i]] = 0;
        if (sdkCount(puz, sh, 2) === 1) left--;
        else puz[order[i]] = keep;
      }
      return { size: n, puzzle: puz, solution: sol, givens: left };
    }
  };

  /* ---------------------------------------------------------------------- *
   * B6. 关灯
   * 按一格，它和上下左右一起翻转。按的先后顺序无所谓，同一格按两次等于没按，
   * 所以“解法”就是一组格子：每格按或不按。这是 GF(2)（只有 0 和 1、1+1=0）上的线性方程组 A·x = 当前灯况，
   * 用高斯消元求解。5×5 的 A 秩是 23：每个可解的局面有 4 组解，这里挑按键最少的那组给提示。
   * 出题用随机点按生成，所以一定可解。灯况用位掩码表示（第 i 位是第 i 格，亮为 1）。
   * ---------------------------------------------------------------------- */
  function bits(x) { var c = 0; while (x) { x &= x - 1; c++; } return c; }
  function lightMask(n, i) {
    var r = Math.floor(i / n), c = i % n, m = 1 << i;
    if (r > 0) m |= 1 << (i - n);
    if (r < n - 1) m |= 1 << (i + n);
    if (c > 0) m |= 1 << (i - 1);
    if (c < n - 1) m |= 1 << (i + 1);
    return m;
  }
  /** 返回按键最少的解（位掩码：该按哪些格）；无解返回 -1。 */
  function lightSolve(state, n) {
    var N = n * n, rows = [], pivots = [], isPivot = [], i, col, r = 0;
    for (i = 0; i < N; i++) rows.push({ m: lightMask(n, i), b: (state >> i) & 1 });   // A 是对称阵：第 i 行就是按第 i 格的掩码
    for (col = 0; col < N && r < N; col++) {
      var p = -1;
      for (i = r; i < N; i++) if ((rows[i].m >> col) & 1) { p = i; break; }
      if (p < 0) continue;
      var tmp = rows[r]; rows[r] = rows[p]; rows[p] = tmp;
      for (i = 0; i < N; i++) {
        if (i !== r && ((rows[i].m >> col) & 1)) { rows[i].m ^= rows[r].m; rows[i].b ^= rows[r].b; }
      }
      pivots[r] = col; isPivot[col] = true;
      r++;
    }
    for (i = r; i < N; i++) if (rows[i].b) return -1;
    var x0 = 0, basis = [];
    for (i = 0; i < r; i++) if (rows[i].b) x0 |= 1 << pivots[i];
    for (col = 0; col < N; col++) {
      if (isPivot[col]) continue;
      var v = 1 << col;                       // 自由变量取 1，主元变量跟着定
      for (i = 0; i < r; i++) if ((rows[i].m >> col) & 1) v |= 1 << pivots[i];
      basis.push(v);
    }
    var best = x0;
    for (var k = 1; k < (1 << basis.length); k++) {
      var x = x0;
      for (i = 0; i < basis.length; i++) if ((k >> i) & 1) x ^= basis[i];
      if (bits(x) < bits(best)) best = x;
    }
    return best;
  }
  var LIGHT_STEPS = { 3: { easy: [2, 3], normal: [3, 5], hard: [5, 7] }, 5: { easy: [3, 5], normal: [5, 8], hard: [8, 12] } };
  L.lights = {
    bits: bits,
    mask: lightMask,
    press: function (state, n, i) { return state ^ lightMask(n, i); },
    solve: lightSolve,
    steps: LIGHT_STEPS,
    /** 随机点按 lo..hi 格生成一题，并保证最少步数也落在 [lo, hi]。返回 { state, min } */
    generate: function (n, rnd, lo, hi) {
      var N = n * n, state = 0, i;
      for (var tries = 0; tries < 200; tries++) {
        var k = U.randInt(lo, hi, rnd);
        var cells = U.shuffle(U.range(N), rnd).slice(0, k);
        state = 0;
        for (i = 0; i < cells.length; i++) state ^= lightMask(n, cells[i]);
        var min = bits(lightSolve(state, n));
        if (state !== 0 && min >= lo && min <= hi) return { state: state, min: min };
      }
      state = lightMask(n, 0) ^ lightMask(n, N - 1) ^ lightMask(n, Math.floor(N / 2));
      return { state: state, min: bits(lightSolve(state, n)) };
    }
  };

  /* ---------------------------------------------------------------------- *
   * B7. 记忆翻牌：洗一副每种两张的牌
   * ---------------------------------------------------------------------- */
  L.memory = {
    deck: function (pairs, rnd) {
      var d = [];
      for (var i = 0; i < pairs; i++) d.push(i, i);
      return U.shuffle(d, rnd);
    },
    grid: function (pairs) {
      return pairs >= 10 ? { cols: 4, rows: 5 } : pairs >= 8 ? { cols: 4, rows: 4 } : { cols: 3, rows: 4 };
    }
  };

  /* ---------------------------------------------------------------------- *
   * B8. 一笔画
   * 欧拉（1736，哥尼斯堡七桥问题）：一张连在一起的图能一笔画成，当且仅当
   * “连着奇数条线的点”（奇点）是 0 个或 2 个。
   *   为什么：每路过一个点，进去一条线、出来一条线，一次用掉两条；
   *   所以除了起点和终点，其余的点连着的线必须是偶数条。
   *   0 个奇点：从哪个点出发都行，最后回到出发点；
   *   2 个奇点：必须从其中一个出发，在另一个结束；
   *   4 个以上：画不出来。（奇点的个数一定是偶数，不会出现 1 个、3 个。）
   * 七桥图四个点的度数是 5、3、3、3，全是奇点，所以做不到。
   *
   * 关卡：nodes 是 100×100 画布上的点；edges 是 [a, b] 或 [a, b, 弯度]（弯度是控制点偏离中点的距离 ÷ 线段长，
   * 用来画两点之间的第二条线）；ok 是预期能否画成，test-logic.js 会用暴力搜索逐关核对。
   * ---------------------------------------------------------------------- */
  function polar(r, deg, cx, cy) {
    var a = deg * Math.PI / 180;
    return [Math.round(((cx == null ? 50 : cx) + r * Math.cos(a)) * 10) / 10, Math.round(((cy == null ? 50 : cy) + r * Math.sin(a)) * 10) / 10];
  }
  var STROKE_LEVELS = (function () {
    var lv = [], nodes, edges, k;
    lv.push({ name: '三角', ok: true, nodes: [[50, 16], [86, 80], [14, 80]], edges: [[0, 1], [1, 2], [2, 0]] });
    lv.push({ name: '蝴蝶结', ok: true, nodes: [[50, 50], [14, 22], [14, 78], [86, 22], [86, 78]],
      edges: [[1, 2], [2, 0], [0, 1], [0, 3], [3, 4], [4, 0]] });
    lv.push({ name: '一刀切', ok: true, nodes: [[18, 18], [82, 18], [82, 82], [18, 82]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]] });
    lv.push({ name: '小房子', ok: true, nodes: [[20, 88], [80, 88], [80, 46], [20, 46], [50, 14]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3], [3, 4], [4, 2]] });
    lv.push({ name: '小鱼', ok: true, nodes: [[10, 50], [40, 22], [40, 78], [64, 50], [90, 26], [90, 74]],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2], [3, 4], [3, 5], [4, 5]] });
    // 七座桥：0 北岸、1 南岸、2 河心岛、3 东岛。岛到两岸各两座桥，岛到东岛一座，东岛到两岸各一座。
    var land = [[40, 13], [40, 87], [40, 50], [86, 50]];
    var bridges = [[2, 0, 0.36], [2, 0, -0.36], [2, 1, 0.36], [2, 1, -0.36], [2, 3], [3, 0], [3, 1]];
    lv.push({ name: '七座桥', ok: false, bridge: true, nodes: land, edges: bridges });
    // 在两岸之间多修一座桥：两岸从奇点变成偶点，只剩 2 个奇点，就能走了
    lv.push({ name: '第八座桥', ok: true, nodes: land, edges: bridges.concat([[0, 1, 0.5]]) });
    // 五角星：五条直线两两相交，交点也算点。尖角连 2 条线，里面的五边形每个点连 4 条
    nodes = []; edges = [];
    for (k = 0; k < 5; k++) nodes.push(polar(42, -90 + 72 * k, 50, 53));
    for (k = 0; k < 5; k++) nodes.push(polar(42 * 0.381966, -54 + 72 * k, 50, 53));
    for (k = 0; k < 5; k++) edges.push([k, 5 + k], [5 + k, 5 + (k + 1) % 5], [5 + (k + 1) % 5, (k + 2) % 5]);
    lv.push({ name: '五角星', ok: true, nodes: nodes, edges: edges });
    // 风车：四片叶子共用中心
    nodes = [[50, 50]]; edges = [];
    for (k = 0; k < 4; k++) {
      nodes.push(polar(40, -90 + 90 * k), polar(31, -38 + 90 * k));
      edges.push([0, 1 + 2 * k], [1 + 2 * k, 2 + 2 * k], [2 + 2 * k, 0]);
    }
    lv.push({ name: '风车', ok: true, nodes: nodes, edges: edges });
    // 六芒星：两个三角形叠在一起，六个交点也算点
    nodes = []; edges = [];
    for (k = 0; k < 6; k++) nodes.push(polar(42, -90 + 60 * k));
    for (k = 0; k < 6; k++) nodes.push(polar(42 / Math.sqrt(3), -60 + 60 * k));
    for (k = 0; k < 6; k++) edges.push([k, 6 + k], [6 + k, 6 + (k + 1) % 6], [6 + (k + 1) % 6, (k + 2) % 6]);
    lv.push({ name: '六芒星', ok: true, nodes: nodes, edges: edges });
    // 田字格本身有 4 个奇点（四条边的中点），画不成；加一撇连起其中两个，就只剩 2 个
    nodes = []; edges = [];
    for (k = 0; k < 9; k++) nodes.push([16 + 34 * (k % 3), 16 + 34 * Math.floor(k / 3)]);
    for (k = 0; k < 9; k++) {
      if (k % 3 < 2) edges.push([k, k + 1]);
      if (k < 6) edges.push([k, k + 3]);
    }
    edges.push([1, 5]);
    lv.push({ name: '田字加一撇', ok: true, nodes: nodes, edges: edges });
    return lv;
  })();

  function strokeDegrees(level, used) {
    var deg = level.nodes.map(function () { return 0; });
    level.edges.forEach(function (e, i) { if (!used || !used[i]) { deg[e[0]]++; deg[e[1]]++; } });
    return deg;
  }
  /** 没用过的边是不是连成一片（忽略已经没有线的点）；from 给定时还要求这一片包含 from */
  function strokeConnected(level, used, from) {
    var deg = strokeDegrees(level, used), start = -1, i;
    for (i = 0; i < deg.length; i++) if (deg[i] > 0) { start = i; break; }
    if (start < 0) return true;
    if (from != null && from >= 0) { if (deg[from] === 0) return false; start = from; }
    var seen = [], stack = [start];
    seen[start] = true;
    while (stack.length) {
      var u = stack.pop();
      level.edges.forEach(function (e, k) {
        if (used && used[k]) return;
        var v = e[0] === u ? e[1] : e[1] === u ? e[0] : -1;
        if (v >= 0 && !seen[v]) { seen[v] = true; stack.push(v); }
      });
    }
    for (i = 0; i < deg.length; i++) if (deg[i] > 0 && !seen[i]) return false;
    return true;
  }
  L.stroke = {
    levels: STROKE_LEVELS,
    degrees: strokeDegrees,
    /** analyse(level) -> { deg, odd: 奇点下标, connected, ok, starts: 可以当起点的点 } */
    analyse: function (level) {
      var deg = strokeDegrees(level), odd = [], all = [];
      deg.forEach(function (d, i) { if (d % 2) odd.push(i); if (d > 0) all.push(i); });
      var connected = strokeConnected(level);
      var ok = connected && (odd.length === 0 || odd.length === 2);
      return { deg: deg, odd: odd, connected: connected, ok: ok, starts: !ok ? [] : odd.length ? odd : all };
    },
    /** 走掉 used 里的边之后，从 at 出发还能不能把剩下的一笔走完 */
    feasible: function (level, used, at) {
      var deg = strokeDegrees(level, used), left = 0, odd = [];
      deg.forEach(function (d, i) { left += d; if (d % 2) odd.push(i); });
      if (left === 0) return true;
      if (!strokeConnected(level, used, at)) return false;
      return odd.length === 0 || (odd.length === 2 && odd.indexOf(at) >= 0);
    },
    /** 下一步走哪条边还稳（走完之后剩下的仍然能一笔画完）；已经没救了返回 -1 */
    next: function (level, used, at) {
      for (var i = 0; i < level.edges.length; i++) {
        var e = level.edges[i];
        if (used[i] || (e[0] !== at && e[1] !== at)) continue;
        var trial = used.slice();
        trial[i] = true;
        if (L.stroke.feasible(level, trial, e[0] === at ? e[1] : e[0])) return i;
      }
      return -1;
    },
    /** 暴力回溯找一条完整的路线（边的下标序列），找不到返回 null。只给测试用：不依赖上面的定理。 */
    brute: function (level) {
      var E = level.edges.length, used = [], path = [];
      function walk(at) {
        if (path.length === E) return true;
        for (var i = 0; i < E; i++) {
          var e = level.edges[i];
          if (used[i] || (e[0] !== at && e[1] !== at)) continue;
          used[i] = true; path.push(i);
          if (walk(e[0] === at ? e[1] : e[0])) return true;
          used[i] = false; path.pop();
        }
        return false;
      }
      for (var s = 0; s < level.nodes.length; s++) if (walk(s)) return path.slice();
      return null;
    }
  };

  /* ---------------------------------------------------------------------- *
   * B9. 读心术（二进制卡片）
   * 第 k 张卡片（k = 0..5）印着 1–63 里“二进制第 k 位是 1”的所有数，从小到大排，第一个正好是 2^k。
   * 每个数写成二进制只有一种写法，所以它出现在哪几张卡片上，就等于告诉了你它的每一位：
   * 把回答“有”的卡片的第一个数（1、2、4、8、16、32）加起来，就是那个数。
   * ---------------------------------------------------------------------- */
  L.mind = {
    card: function (k) {
      var out = [];
      for (var n = 1; n <= 63; n++) if ((n >> k) & 1) out.push(n);
      return out;
    },
    reveal: function (answers) {
      var sum = 0;
      for (var k = 0; k < 6; k++) if (answers[k]) sum += L.mind.card(k)[0];
      return sum;
    }
  };

  /* ---------------------------------------------------------------------- *
   * B10. 凯撒密码：每个英文字母在字母表里往后挪 k 位（Z 后面接着 A），大小写保留，其他字符原样。
   * 解密就是往回挪 k 位，也就是再往后挪 26 − k 位。
   * ---------------------------------------------------------------------- */
  function caesar(text, k) {
    k = ((Math.round(k) % 26) + 26) % 26;
    return String(text).replace(/[A-Za-z]/g, function (ch) {
      var base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode((ch.charCodeAt(0) - base + k) % 26 + base);
    });
  }
  var CIPHER_LINES = [
    'PASS ME THE BALL',
    'DAD CANNOT DUNK',
    'NOTHING BUT NET',
    'PIZZA FOR DINNER TONIGHT',
    'WHO ATE THE LAST DUMPLING',
    'LOSER WASHES THE DISHES',
    'MEET ME AT THE COURT AT SIX',
    'THREE POINTER AT THE BUZZER',
    'ICE CREAM AFTER THE GAME',
    'I HID YOUR SNEAKERS',
    'MOM IS THE REAL MVP',
    'SLEEP IN ON SUNDAY',
    'MOVIE NIGHT ON FRIDAY',
    'THE SNACKS ARE UNDER MY BED',
    'ROAD TRIP THIS WEEKEND',
    'YOU CANNOT GUARD ME',
    'ONE MORE GAME BEFORE BED',
    'MY SOCKS ARE NOT THAT SMELLY'
  ];
  L.caesar = {
    shift: caesar,
    encode: function (text, k) { return caesar(text, k); },
    decode: function (text, k) { return caesar(text, -k); },
    lines: CIPHER_LINES
  };

  /* ====================================================================== *
   * C. 界面
   * ====================================================================== */

  /* ---------------------------------------------------------------------- *
   * C1. make24 算 24 点
   * params: { level: 'easy' | 'normal' | 'hard'（默认 normal）, nums: [3, 3, 8, 8]（指定第一题，可省略） }
   * ---------------------------------------------------------------------- */
  function nums24(v) {
    if (!Array.isArray(v) || v.length !== 4) return null;
    var out = v.map(function (x) { return Math.round(Number(x)); });
    for (var i = 0; i < 4; i++) if (!(out[i] >= 1 && out[i] <= 99)) return null;
    return solveItems24(items24(out), 24) ? out : null;      // 指定的题无解就当没指定
  }
  var ORDER24 = ['easy', 'normal', 'hard'];

  JN.registerWidget({ id: 'make24',
    name: '算 24 点',
    rules: '四张牌都要用上，每张只用一次，用加减乘除算出 24。点一张牌，点一个符号，再点另一张牌，两张就合成一张。中间算出分数也没关系。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var level = LEVEL24[params.level] ? params.level : 'normal';
      var slots = [null, null, null, null];   // 四个牌位，合并掉的位置是 null
      var first = [];                         // 这一题的四个数
      var undo = [];                          // 每合并一次之前的牌面快照
      var sel = -1, op = null, hintTo = -1;
      var busy = false, solved = false, classic = false, hints = 0, flying = 0;

      var timeEl = U.el('span.w-make24-time.jn-num', { text: '0:00' });
      var levelBtn = button('jn-chip.w-make24-level', '', function () {
        level = ORDER24[(ORDER24.indexOf(level) + 1) % ORDER24.length];
        ctx.sfx('tap');
        deal(null, false);
      });
      var top = U.el('div.w-make24-top', [
        U.el('span.w-make24-goal', ['凑出 ', U.el('b.jn-num', { text: '24' })]),
        levelBtn,
        timeEl
      ]);
      var cardEls = U.range(4).map(function (i) { return button('w-make24-card', '', function () { tapCard(i); }); });
      var msg = U.el('div.w-make24-msg');
      var opEls = {};
      var NAMES = { '+': '加', '-': '减', '*': '乘', '/': '除' };
      var opsEl = U.el('div.w-make24-ops', ['+', '-', '*', '/'].map(function (o) {
        var b = button('w-make24-op', SYM[o], function () { tapOp(o); });
        b.setAttribute('aria-label', NAMES[o]);
        opEls[o] = b;
        return b;
      }));
      var undoBtn = button('jn-btn.jn-btn--ghost', '撤销', doUndo);
      var resetBtn = button('jn-btn.jn-btn--ghost', '重来', doReset);
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示', doHint);
      var nextBtn = button('jn-btn.jn-btn--ghost', '换一题', function () { ctx.sfx('whoosh'); deal(null, false); });
      var box = U.el('div.w-make24', [
        top,
        U.el('div.w-make24-cards', cardEls),
        msg,
        opsEl,
        U.el('div.w-make24-ctrl', [undoBtn, resetBtn, hintBtn, nextBtn])
      ]);
      var end = makeEnd('make24', box);
      var clock = makeClock(S, timeEl);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }

      function paintCard(i) {
        var el = cardEls[i], it = slots[i];
        U.clear(el);
        el.className = 'w-make24-card' + (it ? '' : ' is-empty') + (i === sel ? ' is-sel' : '') +
          (i === hintTo ? ' is-hint' : '') + (it && it.p < 3 ? ' is-made' : '');
        el.disabled = !it;
        if (!it) { el.removeAttribute('aria-label'); return; }
        var v = it.v, n = String(Math.abs(v.n)), d = String(v.d), whole = v.d === 1;
        var len = (whole ? n.length : Math.max(n.length, d.length)) + (v.n < 0 ? 0.7 : 0);
        var val = U.el('span.w-make24-val.jn-num', [
          v.n < 0 ? U.el('span', { text: '−' }) : null,
          whole ? n : U.el('span.w-make24-frac', [U.el('span', { text: n }), U.el('span', { text: d })])
        ]);
        val.style.setProperty('--k', String(Math.min(1, (whole ? 2.6 : 4.2) / len)));   // 数字长了就缩小
        el.appendChild(val);
        if (it.p < 3) el.appendChild(U.el('span.w-make24-from', { text: it.e }));       // 合成的牌下面写着它是怎么来的
        el.setAttribute('aria-label', frStr(v));
      }
      function paint() {
        for (var i = 0; i < 4; i++) paintCard(i);
        for (var o in opEls) opEls[o].classList.toggle('is-on', o === op);
        undoBtn.disabled = resetBtn.disabled = !undo.length || solved;
        hintBtn.disabled = solved;
      }

      function tapCard(i) {
        if (busy || solved || !slots[i]) return;
        if (sel === i) {                       // 再点一次：放下
          sel = -1; op = null; hintTo = -1;
          ctx.sfx('tap');
          paint();
          return;
        }
        if (sel >= 0 && op) { merge(sel, op, i); return; }
        sel = i; hintTo = -1;
        ctx.sfx('tap'); ctx.haptic(8);
        say('再点一个符号');
        paint();
      }
      function tapOp(o) {
        if (busy || solved) return;
        if (sel < 0) { say('先点一张牌'); fx(msg, 'jn-shake'); return; }
        op = op === o ? null : o;
        hintTo = -1;
        ctx.sfx('tap');
        say(op ? '再点另一张牌' : '再点一个符号');
        paint();
      }
      function merge(i, o, j) {
        var a = slots[i], b = slots[j];
        var r = combine24(a, o, b);
        if (!r) {
          say('不能除以 0');
          fx(cardEls[j], 'jn-shake');
          ctx.sfx('bad'); ctx.haptic(30);
          return;
        }
        undo.push(slots.slice());
        busy = true;
        // 先点的那张牌飞到后点的那张上
        var ra = cardEls[i].getBoundingClientRect(), rb = cardEls[j].getBoundingClientRect();
        cardEls[i].style.transform = 'translate(' + (rb.left - ra.left) + 'px,' + (rb.top - ra.top) + 'px) scale(0.55)';
        cardEls[i].style.opacity = '0';
        ctx.sfx('pop'); ctx.haptic(10);
        flying = S.after(ctx.reduced ? 0 : 170, function () {
          flying = 0;
          cardEls[i].style.transform = '';
          cardEls[i].style.opacity = '';
          slots[i] = null;
          slots[j] = r;
          sel = j; op = null; hintTo = -1;      // 新牌自动拿在手里，接着点符号就行
          busy = false;
          say(frStr(a.v) + ' ' + SYM[o] + ' ' + frStr(b.v) + ' = ' + frStr(r.v));
          paint();
          fx(cardEls[j], 'w-make24-card--pop');
          settle();
        });
      }
      function settle() {
        var left = slots.filter(Boolean);
        if (left.length > 1) return;
        if (frIs(left[0].v, 24)) { win(left[0]); return; }
        sel = -1;
        paint();
        say('算出来是 ' + frStr(left[0].v) + '，不是 24。撤销或者重来');
        fx(cardEls[slots.indexOf(left[0])], 'jn-shake');
        ctx.sfx('bad'); ctx.haptic(30);
      }
      function win(item) {
        solved = true; sel = -1; op = null; hintTo = -1;
        clock.stop();
        paint();
        say('');
        var total = ctx.store.get('solved', 0) + 1;
        ctx.store.set('solved', total);
        var used = '用时 ' + U.fmtTime(clock.ms());
        ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
        end.show({
          tone: 'win',
          title: '算出来了',
          sub: item.e + ' = 24',
          more: U.el('div.w-make24-stat', { text: used + (hints ? ' · 提示 ' + hints + ' 次' : '') + ' · 累计 ' + total + ' 题' }),
          buttons: [
            { label: '下一题', on: function () { deal(null, false); } },
            { label: '再算一遍', on: function () { deal(first, classic); } }
          ]
        });
        ctx.done({ win: true, text: used });
      }

      function doUndo() {
        if (busy || solved || !undo.length) return;
        slots = undo.pop();
        sel = -1; op = null; hintTo = -1;
        ctx.sfx('tap');
        say('退回一步');
        paint();
      }
      function doReset() {
        if (busy || solved || !undo.length) return;
        slots = undo[0];
        undo = [];
        sel = -1; op = null; hintTo = -1;
        ctx.sfx('whoosh');
        say('四张牌都回来了');
        paint();
      }
      /** 提示一步：从眼下这几张牌出发求解，帮你拿好第一张牌和符号，闪的那张是该点的 */
      function doHint() {
        if (busy || solved) return;
        var items = [];
        slots.forEach(function (it, i) { if (it) items.push({ id: i, v: it.v, e: it.e, p: it.p }); });
        var path = solveItems24(items, 24);
        if (!path || !path.length) {
          say('这条路算不到 24 了，撤销一步试试');
          fx(undoBtn, 'jn-shake');
          return;
        }
        hints++;
        sel = path[0].a; op = path[0].op; hintTo = path[0].b;
        say('试试 ' + frStr(slots[sel].v) + ' ' + SYM[op] + ' ' + frStr(slots[hintTo].v) + '，点闪的那张');
        ctx.sfx('tick');
        paint();
      }

      function deal(nums, isClassic) {
        S.cancel(flying);                       // 牌正飞到一半就换题：那一步作废
        flying = 0;
        cardEls.forEach(function (el) { el.style.transform = ''; el.style.opacity = ''; });
        classic = !!(nums && isClassic);
        first = nums ? nums.slice() : L.make24.deal(level);
        slots = first.map(atom24);
        undo = [];
        sel = -1; op = null; hintTo = -1;
        busy = false; solved = false; hints = 0;
        end.hide();
        levelBtn.textContent = classic ? '经典难题' : '难度：' + LEVEL24[level].name;
        clock.reset();
        clock.start();
        say('点一张牌，点符号，再点另一张牌');
        paint();
      }

      watchSize(ctx, function (w, h) {
        var opSize = h < 540 ? 52 : 60;
        var rest = h - (24 + 44 + 22 + opSize + 44 + 8 * 4);   // 上下内边距、上栏、提示行、符号、按钮、四道间距
        var ch = U.clamp(Math.floor((rest - 10) / 2), 52, 170);
        var cw = Math.min(Math.floor((w - 24 - 10) / 2), Math.round(ch * 1.35));
        setVars(box, { 'card-h': ch, 'card-w': cw, op: opSize });
      });
      deal(nums24(params.nums), true);
      return { destroy: function () { S.destroy(); } };
    },
    /* 卡片上的预览：四张牌轮流跳一下。不演示解法，免得剧透。 */
    preview: function (root, params, ctx) {
      var nums = nums24(params.nums) || (LEVEL24[params.level] || LEVEL24.normal).fallback;
      var box = U.el('div.w-make24-pv' + (ctx.reduced ? '.is-still' : ''), [
        U.el('div.w-make24-pvrow', nums.map(function (n, i) {
          return U.el('span.w-make24-pvcard.jn-num', { text: String(n), style: { animationDelay: (i * 0.25) + 's' } });
        })),
        U.el('div.w-make24-pvgoal.jn-num', { text: '= 24 ?' })
      ]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { u: Math.max(8, Math.floor(Math.min(w / 6.4, h / 3.6))) }); });
      return { destroy: function () {} };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C2. bulls 猜数字（几 A 几 B）
   * params: { mode: 'solo'（电脑出题，默认）| 'duo'（一个人出题，另一个人猜，然后交换） }
   * ---------------------------------------------------------------------- */
  JN.registerWidget({ id: 'bulls',
    name: '猜数字',
    rules: '谜底是四个各不相同的数字，0 也可能打头。每猜一次会得到“几 A 几 B”：A 是数字对、位置也对；B 是数字对、位置不对。猜到 4A 就赢，次数越少越厉害。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var LEN = 4, DIGITS = '1234567890'.split('');
      var duo = params.mode === 'duo';
      var WHO = ['橙方', '蓝方'];
      var phase = 'guess';        // set 出题中 · guess 在猜 · over 这一轮结束
      var secret = '', input = '', rows = [], marks = {}, marking = false;
      var round = 0;              // 双人：偶数轮橙方猜（蓝方出题），奇数轮反过来
      var tally = [null, null];   // 双人：这一回合两边各用了几次（Infinity 表示认输）
      var best = ctx.store.get('best', 0);
      var armed = 0;

      var info = U.el('div.w-bulls-info');
      var giveBtn = button('jn-chip.w-bulls-give', '认输', giveUp);
      var slotEls = U.range(LEN).map(function () { return U.el('div.w-bulls-slot.jn-num'); });
      var msg = U.el('div.w-bulls-msg');
      var list = U.el('div.w-bulls-list');
      var keyEls = {};
      var pad = U.el('div.w-bulls-pad', DIGITS.map(function (d) {
        keyEls[d] = button('w-bulls-key.jn-num', d, function () { tapKey(d); });
        return keyEls[d];
      }));
      var markBtn = button('jn-btn.jn-btn--ghost.w-bulls-mark', '做记号', function () {
        marking = !marking;
        ctx.sfx('tap');
        say(marking ? '点数字做记号：点一下划掉，再点一下圈起来' : '');
        paint();
      });
      var delBtn = button('jn-btn.jn-btn--ghost', '删除', function () {
        if (!input.length || phase === 'over') return;
        input = input.slice(0, -1);
        ctx.sfx('tap');
        paint();
      });
      var goBtn = button('jn-btn.w-bulls-go', '猜', submit);
      var box = U.el('div.w-bulls', [
        U.el('div.w-bulls-top', [info, giveBtn]),
        U.el('div.w-bulls-slots', slotEls),
        msg,
        list,
        pad,
        U.el('div.w-bulls-ctrl', [markBtn, delBtn, goBtn])
      ]);
      var end = makeEnd('bulls', box);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }
      function spaced(s) { return s.split('').join(' '); }
      function times(n) { return n === Infinity ? '认输' : n + ' 次'; }

      function paint() {
        var guesser = round % 2, setter = 1 - guesser, live = phase !== 'over';
        var who = phase === 'set' ? setter : guesser;
        setVars(box, { who: duo ? 'var(--p' + (who + 1) + ')' : 'var(--accent)', 'who-ink': duo ? 'var(--on-color)' : 'var(--accent-ink)' });
        if (phase === 'set') info.textContent = WHO[setter] + '出题';
        else info.textContent = (duo ? WHO[guesser] + '来猜 · ' : '') + '第 ' + (rows.length + (live ? 1 : 0)) + ' 次' + (!duo && best ? ' · 最佳 ' + best + ' 次' : '');
        slotEls.forEach(function (el, i) {
          el.textContent = input.charAt(i);
          el.classList.toggle('is-next', live && i === input.length);
        });
        DIGITS.forEach(function (d) {
          var el = keyEls[d], used = input.indexOf(d) >= 0, canMark = marking && phase === 'guess';
          el.classList.toggle('is-used', used);
          el.classList.toggle('is-no', phase !== 'set' && marks[d] === 1);
          el.classList.toggle('is-yes', phase !== 'set' && marks[d] === 2);
          el.disabled = !live || (!canMark && (used || input.length >= LEN));
        });
        goBtn.textContent = phase === 'set' ? '藏好了' : '猜';
        goBtn.disabled = !live || input.length < LEN;
        delBtn.disabled = !live || !input.length;
        markBtn.hidden = phase === 'set';
        markBtn.disabled = !live;
        markBtn.classList.toggle('is-on', marking);
        giveBtn.hidden = phase !== 'guess' || !rows.length;
      }

      function legend() {
        return U.el('div.w-bulls-legend', [
          U.el('div', [U.el('b.w-bulls-a', { text: 'A' }), ' 数字对，位置也对']),
          U.el('div', [U.el('b.w-bulls-b', { text: 'B' }), ' 数字对，位置不对']),
          U.el('div.jn-muted', { text: '比如谜底 5281，猜 5812，得 1A3B' })
        ]);
      }
      function addRow(r, idx) {
        var row = U.el('div.w-bulls-row' + (r.a === LEN ? '.is-hit' : ''), [
          U.el('span.w-bulls-idx.jn-num', { text: String(idx) }),
          U.el('span.w-bulls-guess.jn-num', { text: spaced(r.g) }),
          U.el('span.w-bulls-res.jn-num', [U.el('b.w-bulls-a', { text: r.a + 'A' }), U.el('b.w-bulls-b', { text: r.b + 'B' })])
        ]);
        list.appendChild(row);
        list.scrollTop = list.scrollHeight;
      }

      function tapKey(d) {
        if (phase === 'over') return;
        if (marking && phase === 'guess') {
          marks[d] = ((marks[d] || 0) + 1) % 3;
          ctx.sfx('tick');
          paint();
          return;
        }
        if (input.length >= LEN || input.indexOf(d) >= 0) return;
        input += d;
        ctx.sfx('tap'); ctx.haptic(8);
        paint();
      }
      function submit() {
        if (input.length < LEN || phase === 'over') return;
        if (phase === 'set') {
          secret = input;
          input = '';
          phase = 'guess';
          U.clear(list);
          list.appendChild(legend());
          ctx.sfx('whoosh');
          say('藏好了。手机交给' + WHO[round % 2] + '，开猜');
          paint();
          return;
        }
        var sc = L.bulls.score(secret, input);
        if (!rows.length) U.clear(list);
        rows.push({ g: input, a: sc.a, b: sc.b });
        addRow(rows[rows.length - 1], rows.length);
        input = '';
        if (sc.a === LEN) { finish(true); return; }
        ctx.sfx(sc.a + sc.b ? 'pop' : 'tick');
        say(sc.a + sc.b ? sc.a + 'A' + sc.b + 'B' : '一个都不沾边：这四个数字可以全划掉了');
        paint();
      }
      function giveUp() {
        if (phase !== 'guess') return;
        if (!armed) {                                   // 第一下只是确认，免得手滑
          giveBtn.textContent = '真的认输？';
          armed = S.after(2500, function () { armed = 0; giveBtn.textContent = '认输'; });
          return;
        }
        S.cancel(armed);
        armed = 0;
        giveBtn.textContent = '认输';
        finish(false);
      }
      function finish(won) {
        var n = rows.length, guesser = round % 2;
        var note = '猜了 ' + n + ' 次';
        phase = 'over'; input = ''; marking = false;
        if (!duo && won) {
          if (!best || n < best) { best = n; ctx.store.set('best', n); note = '新纪录'; } else note = '最佳纪录 ' + best + ' 次';
        }
        paint();
        say('');
        if (won) { ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti(); } else ctx.sfx('buzz');
        if (!duo) {
          end.show({
            tone: won ? 'win' : 'lose',
            title: won ? '猜中了，用了 ' + n + ' 次' : '谜底是 ' + spaced(secret),
            sub: note,
            buttons: [{ label: '再来一局', on: startSolo }]
          });
          ctx.done({ win: won, text: won ? '用了 ' + n + ' 次' : '认输' });
          return;
        }
        tally[guesser] = won ? n : Infinity;
        var head = won ? WHO[guesser] + '猜中了，用了 ' + n + ' 次' : WHO[guesser] + '认输，谜底是 ' + spaced(secret);
        if (guesser === 0) {
          end.show({
            tone: won ? 'win' : 'lose', title: head, sub: '交换：' + WHO[0] + '出题，' + WHO[1] + '来猜，看谁用的次数少',
            buttons: [{ label: '交换', on: nextRound }]
          });
        } else {
          var verdict = tally[0] === tally[1] ? '打平' : (tally[0] < tally[1] ? WHO[0] : WHO[1]) + '赢';
          end.show({
            tone: 'win', title: head, sub: WHO[0] + ' ' + times(tally[0]) + ' : ' + times(tally[1]) + ' ' + WHO[1] + '，' + verdict,
            buttons: [{ label: '再来一回合', on: nextRound }]
          });
        }
        ctx.done({ text: head });
      }

      function clearRound() {
        rows = []; marks = {}; marking = false; input = ''; secret = '';
        S.cancel(armed); armed = 0; giveBtn.textContent = '认输';
        U.clear(list);
        end.hide();
      }
      function startSolo() {
        clearRound();
        secret = L.bulls.secret();
        phase = 'guess';
        list.appendChild(legend());
        say('四个数字各不相同，0 也可能打头');
        paint();
      }
      function startSet() {
        clearRound();
        phase = 'set';
        var guesser = round % 2;
        list.appendChild(U.el('div.w-bulls-legend', [
          U.el('div.w-bulls-warn', { text: WHO[guesser] + '先别看！' }),
          U.el('div', { text: WHO[1 - guesser] + '输入四个不重复的数字，点“藏好了”，数字就会藏起来。' })
        ]));
        say('出题的人悄悄输');
        paint();
      }
      function nextRound() {
        round++;
        if (round % 2 === 0) tally = [null, null];
        startSet();
      }

      watchSize(ctx, function (w, h) {
        setVars(box, { key: U.clamp(Math.round(h * 0.085), 44, 58), slot: U.clamp(Math.round(h * 0.1), 46, 64) });
      });
      if (duo) startSet(); else startSolo();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：三次猜测一行行出现，最后一行 4A */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var secret = '5281', guesses = ['0123', '5612', '5281'];
      var rowEls = guesses.map(function (g) {
        var sc = L.bulls.score(secret, g);
        return U.el('div.w-bulls-pvrow.jn-num' + (sc.a === 4 ? '.is-hit' : ''), [
          U.el('span', { text: g.split('').join(' ') }),
          U.el('span', [U.el('b.w-bulls-a', { text: sc.a + 'A' }), U.el('b.w-bulls-b', { text: sc.b + 'B' })])
        ]);
      });
      var box = U.el('div.w-bulls-pv', rowEls);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { u: Math.max(10, Math.floor(Math.min(w / 11, h / 6.5))) }); });
      var shown = 0;
      function paint() { rowEls.forEach(function (el, i) { el.classList.toggle('is-in', i < shown); }); }
      if (ctx.reduced) { shown = rowEls.length; paint(); }
      else {
        paint();
        S.every(900, function () { shown = shown > rowEls.length + 1 ? 0 : shown + 1; paint(); });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C3. nim 取石子
   * params: { game: 'take21'（默认）| 'heaps', vs: 'ai'（默认）| 'duo', last: 'win'（默认）| 'lose', ease: 0–1（电脑放水的概率，默认 0.25） }
   * ---------------------------------------------------------------------- */
  var NIM_SECRET = {
    'take-win': '**给对方留下 4 的倍数。**\n\n他拿 1、2 或 3 颗，你就拿 3、2 或 1 颗——两人合起来正好 4 颗。只要你拿完后剩的是 20、16、12、8、4，最后一颗一定落在你手里。\n\n21 颗开局：先手拿 1 颗（剩 20），之后“他拿几，你就拿 4 减几”。所以这个规则下，先拿的人稳赢。',
    'take-lose': '**把最后 1 颗留给对方。**\n\n每次拿完，给对方留下 17、13、9、5、1（都是 4 的倍数多 1）。他拿几，你就拿 4 减几。\n\n21 自己就是“4 的倍数多 1”，所以这个规则下后拿的人稳赢——让对方先走。',
    'heaps-win': '**把每一堆拆成 4、2、1。**\n\n比如 7 = 4 + 2 + 1，5 = 4 + 1，3 = 2 + 1。数一数所有堆里一共有几个 4、几个 2、几个 1。\n\n每次拿完，让这三种数都是**偶数个**，对方就没救了：他不管怎么拿，总会把某一种变成奇数个，你再把它凑回偶数。一直凑到全空，最后一颗就是你拿的。\n\n开局 3、5、7：4 有两个，2 有两个，1 有三个——只有 1 多出一个。所以先手从任意一堆拿走 1 颗，就稳了。',
    'heaps-lose': '**先学“拿最后一颗赢”的走法**：把每堆拆成 4、2、1（7 = 4 + 2 + 1，5 = 4 + 1，3 = 2 + 1），每次拿完，让所有堆里的 4、2、1 都是偶数个。\n\n**收尾反过来**：当你这一手拿完，剩下的每一堆都只有 1 颗时，要给对方留**奇数堆**（1 堆或 3 堆），这样最后一颗就轮到他拿。\n\n开局 3、5、7 只有“1”多出一个，所以先手还是从任意一堆拿走 1 颗。'
  };

  JN.registerWidget({ id: 'nim',
    name: '取石子',
    rules: '两个人轮流拿石子。一堆的玩法：每次拿 1 到 3 颗。三堆的玩法：每次只能从一堆里拿，拿几颗都行。拿到最后一颗的人是赢还是输，看屏幕右上角。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var multi = params.game === 'heaps';
      var duo = params.vs === 'duo';
      var last = params.last === 'lose' ? 'lose' : 'win';
      var ease = numParam(params.ease, 0, 1, 0.25);
      var MAXTAKE = 3;
      var START = multi ? [3, 5, 7] : [21];
      var WHO = duo ? ['橙方', '蓝方'] : ['你', '电脑'];
      var heaps = START.slice(), turn = 0, first = 0, moved = false, over = false, busy = false;
      var pick = null;            // 多堆：{ heap, from } 选中了第 heap 堆从第 from 颗往右的全部
      var thinking = 0, score = [0, 0], rounds = 0;

      var turnEl = U.el('div.w-nim-turn');
      var firstSeg = segment('w-nim-first', [{ v: 0, label: WHO[0] + '先拿' }, { v: 1, label: WHO[1] + '先拿' }], first, function (v) {
        first = v;
        if (moved || over) return;
        S.cancel(thinking);
        turn = first;
        paint();
        if (!duo && turn === 1) aiSoon();
      });
      var board = U.el('div.w-nim-board');
      var msg = U.el('div.w-nim-msg');
      var ctrl = U.el('div.w-nim-ctrl');
      var box = U.el('div.w-nim', [
        U.el('div.w-nim-top', [turnEl, U.el('div.w-nim-rule', { text: last === 'win' ? '拿到最后一颗：赢' : '拿到最后一颗：输' })]),
        firstSeg.node,
        board,
        msg,
        ctrl
      ]);
      box.setAttribute('data-game', multi ? 'heaps' : 'take21');
      var end = makeEnd('nim', box);
      root.appendChild(box);

      // 一堆：一个大数字、21 颗小圆点、一排“谁拿了几颗”的记录；多堆：三行可以点的石子
      var countEl, dotEls = [], logEl, takeBtns = [], rowEls = [], confirmBtn;
      if (!multi) {
        countEl = U.el('span.w-nim-count.jn-big');
        var dots = U.el('div.w-nim-dots');
        dotEls = U.range(START[0]).map(function () { var d = U.el('span.w-nim-dot'); dots.appendChild(d); return d; });
        logEl = U.el('div.w-nim-log');
        U.append(board, [U.el('div.w-nim-left', ['还剩 ', countEl, ' 颗']), dots, logEl]);
        takeBtns = [1, 2, 3].map(function (k) {
          var b = button('jn-btn.w-nim-take', '拿 ' + k + ' 颗', function () { if (ready() && k <= heaps[0]) play(turn, 0, k); });
          ctrl.appendChild(b);
          return b;
        });
      } else {
        rowEls = START.map(function () { var r = U.el('div.w-nim-heap'); board.appendChild(r); return r; });
        confirmBtn = button('jn-btn.w-nim-take', '', function () {
          if (ready() && pick) play(turn, pick.heap, heaps[pick.heap] - pick.from);
        });
        ctrl.appendChild(confirmBtn);
      }

      function say(text) { msg.textContent = text || ''; }
      function total() { return heaps.reduce(function (a, b) { return a + b; }, 0); }
      function ready() { return !over && !busy && (duo || turn === 0); }

      function paint() {
        var mine = ready();
        box.setAttribute('data-turn', over ? 'x' : String(turn));
        turnEl.textContent = over ? '这一局结束' : duo ? '轮到' + WHO[turn] : turn === 0 ? '轮到你' : '电脑在想…';
        firstSeg.node.classList.toggle('is-off', moved || over);
        if (!multi) {
          countEl.textContent = String(heaps[0]);
          dotEls.forEach(function (d, i) { d.className = 'w-nim-dot' + (i >= heaps[0] ? ' is-gone' : ''); });
          takeBtns.forEach(function (b, i) { b.disabled = !mine || i + 1 > heaps[0]; });
          return;
        }
        rowEls.forEach(function (row, h) {
          U.clear(row);
          row.classList.toggle('is-empty', !heaps[h]);
          U.range(heaps[h]).forEach(function (i) {
            var on = pick && pick.heap === h && i >= pick.from;
            var st = button('w-nim-stone' + (on ? '.is-pick' : ''), '', function () {
              if (!ready()) return;
              pick = pick && pick.heap === h && pick.from === i ? null : { heap: h, from: i };
              ctx.sfx('tap'); ctx.haptic(8);
              paint();
            });
            st.setAttribute('aria-label', '第 ' + (h + 1) + ' 堆：拿走这一颗和它右边的，共 ' + (heaps[h] - i) + ' 颗');
            st.disabled = !mine;
            row.appendChild(st);
          });
        });
        var n = pick ? heaps[pick.heap] - pick.from : 0;
        confirmBtn.textContent = n ? '拿走这 ' + n + ' 颗' : '拿走';
        confirmBtn.disabled = !mine || !n;
      }

      /** who 从第 heap 堆拿走 take 颗：先让这几颗变色飞走，再结算 */
      function play(who, heap, take) {
        busy = true; moved = true; pick = null;
        paint();
        setVars(board, { taker: 'var(--p' + (who + 1) + ')' });
        var i;
        if (!multi) for (i = heaps[0] - take; i < heaps[0]; i++) dotEls[i].classList.add('is-going');
        else for (i = heaps[heap] - take; i < heaps[heap]; i++) rowEls[heap].children[i].classList.add('is-going');
        ctx.sfx('pop'); ctx.haptic(10);
        S.after(ctx.reduced ? 0 : 360, function () {
          heaps[heap] -= take;
          busy = false;
          if (!multi) {
            logEl.appendChild(U.el('span.w-nim-chip.jn-num.is-p' + who, { text: String(take) }));
            logEl.scrollLeft = logEl.scrollWidth;
          }
          say(WHO[who] + (multi ? '从第 ' + (heap + 1) + ' 堆' : '') + '拿了 ' + take + ' 颗');
          if (total() === 0) { finish(last === 'win' ? who : 1 - who, who); return; }
          turn = 1 - who;
          paint();
          if (!duo && turn === 1) aiSoon();
        });
      }
      function aiSoon() {
        S.cancel(thinking);
        thinking = S.after(ctx.reduced ? 300 : 700 + Math.floor(Math.random() * 400), function () {
          if (over || busy || turn !== 1) return;
          var m = multi ? L.nim.aiHeap(heaps, last, ease) : L.nim.aiTake(heaps[0], MAXTAKE, last, ease);
          if (m) play(1, multi ? m.heap : 0, m.take);
        });
      }
      function finish(winner, taker) {
        over = true;
        score[winner]++;
        rounds++;
        paint();
        var cheer = duo || winner === 0;
        var title = duo ? WHO[winner] + '赢了' : winner === 0 ? '你赢了' : '电脑赢了';
        if (cheer) { ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti(); } else ctx.sfx('buzz');
        var body = U.el('div.w-nim-secret', { html: JN.md(NIM_SECRET[(multi ? 'heaps' : 'take') + '-' + last]) });
        body.hidden = true;
        var tog = button('jn-chip.w-nim-secret-btn', '必胜秘诀（想自己琢磨就先别点）', function () {
          body.hidden = !body.hidden;
          tog.classList.toggle('is-on', !body.hidden);
        });
        end.show({
          tone: cheer ? 'win' : 'lose',
          title: title,
          sub: '最后一颗是' + WHO[taker] + '拿的 · ' + WHO[0] + ' ' + score[0] + ' : ' + score[1] + ' ' + WHO[1],
          more: [tog, body],
          buttons: [{ label: '再来一局', on: start }]
        });
        ctx.done(duo ? { text: title } : { win: winner === 0, text: title });
      }
      function start() {
        S.cancel(thinking);
        heaps = START.slice();
        turn = first; moved = false; over = false; busy = false; pick = null;
        if (logEl) U.clear(logEl);
        end.hide();
        say(multi ? '点一颗石子：它和它右边的一起拿走' : '每次拿 1、2 或 3 颗');
        paint();
        if (!duo && turn === 1) aiSoon();
      }

      watchSize(ctx, function (w, h) {
        var rest = h - (24 + 44 + 44 + 22 + 44 + 8 * 4);     // 内边距、上栏、先后手、提示行、按钮、间距
        if (!multi) setVars(box, { dot: U.clamp(Math.floor(Math.min((w - 24 - 6 * 8) / 7, (rest - 110) / 3 - 8)), 12, 40) });
        else setVars(box, { stone: U.clamp(Math.floor((w - 12) / 7), 40, 62), 'stone-h': U.clamp(Math.floor((rest - 2 * 12) / 3), 44, 84) });   // 三行之间有两道 12 的间距
      });
      start();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一堆石子被两种颜色轮流拿走 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var N = 12;
      var dotEls = U.range(N).map(function () { return U.el('span.w-nim-pvdot'); });
      var box = U.el('div.w-nim-pv', dotEls);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { u: Math.max(8, Math.floor(Math.min(w / 8.5, h / 4.2))) }); });
      var left = N, who = 0, script = [3, 1, 2, 2, 1, 3], step = 0;
      function paint() { dotEls.forEach(function (d, i) { d.className = 'w-nim-pvdot' + (i >= left ? ' is-gone is-p' + d.getAttribute('data-by') : ''); }); }
      if (ctx.reduced) { left = 7; dotEls.forEach(function (d, i) { d.setAttribute('data-by', i < 9 ? 1 : 0); }); paint(); }
      else {
        paint();
        S.every(800, function () {
          if (left === 0) { left = N; step = 0; who = 0; paint(); return; }
          var take = Math.min(script[step++ % script.length], left);
          for (var i = left - take; i < left; i++) dotEls[i].setAttribute('data-by', who);
          left -= take; who = 1 - who;
          paint();
        });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C4. hanoi 汉诺塔
   * params: { discs: 3–6（默认 4） }
   * ---------------------------------------------------------------------- */
  var HANOI_MIN = 3, HANOI_MAX = 6;

  /** 三根柱子和 n 个盘的画面，mount 和 preview 共用。tappable 时柱子是按钮。 */
  function hanoiView(n, tappable) {
    var pegEls = [0, 1, 2].map(function (i) {
      return tappable
        ? U.el('button.w-hanoi-peg', { attrs: { type: 'button', 'aria-label': '第 ' + (i + 1) + ' 根柱子' } })
        : U.el('div.w-hanoi-peg');
    });
    var discEls = [null];
    var layer = U.el('div.w-hanoi-discs');
    for (var d = 1; d <= n; d++) {
      discEls[d] = U.el('div.w-hanoi-disc', { attrs: { 'data-d': d } }, [U.el('div.w-hanoi-disc-in')]);
      layer.appendChild(discEls[d]);
    }
    var board = U.el('div.w-hanoi-board', [U.el('div.w-hanoi-pegs', pegEls), layer]);
    var g = { col: 100, dh: 24, base: 200, lift: 0, minW: 30, maxW: 90 };
    function widthOf(k) { return n === 1 ? g.maxW : g.minW + (g.maxW - g.minW) * (k - 1) / (n - 1); }
    return {
      node: board,
      pegs: pegEls,
      discs: discEls,
      /** 把棋盘定成 w×h，并据此算出盘的大小 */
      layout: function (w, h) {
        g.col = w / 3;
        g.dh = U.clamp(Math.floor((h - 26) / (n + 1.7)), 8, 36);
        g.base = h - 14;                                    // 底座的上沿
        g.lift = Math.max(0, g.base - (n + 1.6) * g.dh);    // 被拎起来的盘悬在柱子顶上
        g.maxW = g.col - 8;
        g.minW = Math.max(g.maxW * 0.34, Math.min(28, g.maxW));
        setVars(board, { w: w, h: h, 'disc-h': Math.max(5, g.dh - 3), 'rod-h': Math.round((n + 0.55) * g.dh) });
        for (var k = 1; k <= n; k++) discEls[k].style.width = Math.round(widthOf(k)) + 'px';
      },
      /** pegs: 三个数组，从下到上列出盘号；held: 被拎起来的盘号（没有就传 0） */
      place: function (pegs, held) {
        for (var p = 0; p < 3; p++) {
          for (var k = 0; k < pegs[p].length; k++) {
            var id = pegs[p][k];
            var x = Math.round(g.col * (p + 0.5) - widthOf(id) / 2);
            var y = Math.round(id === held ? g.lift : g.base - (k + 1) * g.dh);
            discEls[id].style.transform = 'translate(' + x + 'px,' + y + 'px)';
            discEls[id].classList.toggle('is-held', id === held);
          }
        }
      }
    };
  }

  JN.registerWidget({ id: 'hanoi',
    name: '汉诺塔',
    rules: '把整座塔搬到另一根柱子上。一次只能搬最上面的一个盘，大盘不能压在小盘上面。先点要搬的那根柱子，再点要放的那根。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var n = Math.round(numParam(params.discs, HANOI_MIN, HANOI_MAX, 4));
      var pegs = [[], [], []], held = -1, hintTo = -1, moves = 0, over = false;
      var demo = 0, cooling = 0, view = null, dims = { w: 300, h: 240 };

      var movesEl = U.el('b.jn-num', { text: '0' }), minEl = U.el('b.jn-num');
      var nEl = U.el('span.w-hanoi-n');
      var minusBtn = button('w-hanoi-step', '−', function () { resize(n - 1); });
      var plusBtn = button('w-hanoi-step', '+', function () { resize(n + 1); });
      minusBtn.setAttribute('aria-label', '少一层');
      plusBtn.setAttribute('aria-label', '多一层');
      var wrap = U.el('div.w-hanoi-wrap');
      var msg = U.el('div.w-hanoi-msg');
      var resetBtn = button('jn-btn.jn-btn--ghost', '重来', function () { stopDemo(); ctx.sfx('whoosh'); reset(); });
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示', doHint);
      var demoBtn = button('jn-btn.jn-btn--ghost', '看演示', function () {
        if (demo || cooling) { stopDemo(); reset(); } else startDemo();
      });
      var box = U.el('div.w-hanoi', [
        U.el('div.w-hanoi-top', [
          U.el('span', ['步数 ', movesEl, ' · 最少 ', minEl]),
          U.el('span.w-hanoi-size', [minusBtn, nEl, plusBtn])
        ]),
        wrap,
        msg,
        U.el('div.w-hanoi-ctrl', [resetBtn, hintBtn, demoBtn])
      ]);
      var end = makeEnd('hanoi', box);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }
      function topOf(p) { return pegs[p].length ? pegs[p][pegs[p].length - 1] : 0; }
      function render() {
        view.place(pegs, held >= 0 ? topOf(held) : 0);
        view.pegs.forEach(function (el, i) { el.classList.toggle('is-to', i === hintTo); });
        movesEl.textContent = String(moves);
        hintBtn.disabled = over || !!demo || !!cooling;
      }
      function build() {
        U.clear(wrap);
        view = hanoiView(n, true);
        view.pegs.forEach(function (el, i) { el.addEventListener('click', function () { tapPeg(i); }); });
        wrap.appendChild(view.node);
        view.layout(dims.w, dims.h);
        nEl.textContent = n + ' 层';
        minEl.textContent = String(L.hanoi.minMoves(n));
        minusBtn.disabled = n <= HANOI_MIN;
        plusBtn.disabled = n >= HANOI_MAX;
        reset();
      }
      function reset() {
        S.cancel(cooling);
        cooling = 0;
        pegs = [[], [], []];
        for (var d = n; d >= 1; d--) pegs[0].push(d);
        held = -1; hintTo = -1; moves = 0; over = false;
        end.hide();
        demoBtn.textContent = '看演示';
        say('把整座塔搬到另一根柱子上');
        render();
      }
      function resize(k) {
        k = U.clamp(k, HANOI_MIN, HANOI_MAX);
        if (k === n) return;
        stopDemo();
        n = k;
        ctx.sfx('tap');
        build();
      }

      function tapPeg(i) {
        if (demo || cooling) { stopDemo(); reset(); return; }     // 演示时点一下柱子：停下，换你来
        if (over) return;
        if (held < 0) {
          if (!pegs[i].length) return;
          held = i; hintTo = -1;
          ctx.sfx('tap'); ctx.haptic(8);
          render();
          return;
        }
        if (held === i) {                                         // 原地放下
          held = -1; hintTo = -1;
          ctx.sfx('tap');
          render();
          return;
        }
        var d = topOf(held), under = topOf(i);
        if (under && under < d) {
          say('大盘不能压在小盘上面');
          fx(view.discs[d].firstChild, 'jn-shake');
          ctx.sfx('bad'); ctx.haptic(40);
          return;
        }
        pegs[held].pop();
        pegs[i].push(d);
        held = -1; hintTo = -1; moves++;
        ctx.sfx('pop'); ctx.haptic(10);
        say('');
        render();
        if (pegs[1].length === n || pegs[2].length === n) win();
      }
      function win() {
        var min = L.hanoi.minMoves(n), perfect = moves === min;
        over = true;
        render();
        ctx.sfx('win'); ctx.haptic([20, 40, 80]);
        if (perfect) ctx.confetti();
        var again = { label: '再来一次', on: reset };
        var more = { label: '加一层', on: function () { resize(n + 1); } };
        var btns = n >= HANOI_MAX ? [again] : perfect ? [more, again] : [again, more];
        end.show({
          tone: 'win',
          title: perfect ? '一步都没浪费' : '搬完了',
          sub: perfect ? n + ' 层，' + moves + ' 步，不可能更少了' : '用了 ' + moves + ' 步，最少只要 ' + min + ' 步',
          buttons: btns
        });
        ctx.done({ win: true, text: n + ' 层 ' + moves + ' 步' });
      }
      /** 提示：算出离完工最近的走法，帮你把该搬的盘拎起来，目标柱子会亮 */
      function doHint() {
        if (over || demo || cooling) return;
        var pos = [0];
        pegs.forEach(function (stack, p) { stack.forEach(function (d) { pos[d] = p; }); });
        var h = L.hanoi.hint(pos, n, 0);
        if (!h || !h.move) return;
        held = h.move.from;
        hintTo = h.move.to;
        say('放到亮的那根上。照这样搬，还要 ' + h.dist + ' 步');
        ctx.sfx('tick');
        render();
      }
      function startDemo() {
        reset();
        var seq = L.hanoi.solve(n, 0, 1, 2), k = 0, lifted = false;
        demoBtn.textContent = '停下';
        say('先把小的挪开，给大的让路');
        demo = S.every(ctx.reduced ? 420 : 260, function () {
          if (k >= seq.length) {
            S.cancel(demo);
            demo = 0;
            say('一共 ' + seq.length + ' 步。换你来');
            cooling = S.after(1600, function () { cooling = 0; reset(); });
            return;
          }
          if (!lifted) { held = seq[k][0]; lifted = true; }
          else {
            pegs[seq[k][1]].push(pegs[seq[k][0]].pop());
            held = -1; lifted = false; moves++; k++;
            ctx.sfx('tick');
          }
          render();
        });
        render();
      }
      function stopDemo() {
        S.cancel(demo);
        S.cancel(cooling);
        demo = 0; cooling = 0;
        demoBtn.textContent = '看演示';
      }

      watchSize(ctx, function (w, h) {
        dims.w = Math.max(180, w - 24);
        dims.h = U.clamp(h - (24 + 44 + 22 + 44 + 8 * 3), 120, Math.round(dims.w * 0.95));
        if (view) { view.layout(dims.w, dims.h); render(); }
      });
      build();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：三层塔自动按最优解搬过去，再搬回来，循环 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var n = 3, from = 0, pegs, seq, k;
      var view = hanoiView(n, false);
      var box = U.el('div.w-hanoi-pv', [view.node]);
      root.appendChild(box);
      function restart() {
        pegs = [[], [], []];
        for (var d = n; d >= 1; d--) pegs[from].push(d);
        seq = L.hanoi.solve(n, from, 1, 2 - from);
        k = 0;
      }
      function step() { var m = seq[k++]; pegs[m[1]].push(pegs[m[0]].pop()); }
      restart();
      if (ctx.reduced) { step(); step(); step(); }     // 只画一帧：搬到一半的样子
      watchSize(ctx, function (w, h) {
        var bw = Math.max(90, Math.min(w - 16, 380)), bh = Math.max(60, Math.min(h - 16, Math.round(bw * 0.6)));
        view.layout(bw, bh);
        view.place(pegs, 0);
      });
      if (!ctx.reduced) {
        var rest = 0;
        S.every(640, function () {
          if (k >= seq.length) {
            if (++rest < 3) return;
            rest = 0; from = 2 - from;
            restart();
          } else step();
          view.place(pegs, 0);
        });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C5. sudoku 迷你数独
   * params: { size: 4（默认）| 6, check: true 时即时标出冲突, level: 'easy' | 'normal'（默认）| 'hard' }
   * ---------------------------------------------------------------------- */
  var SDK_ORDER = ['easy', 'normal', 'hard'];

  JN.registerWidget({ id: 'sudoku',
    name: '迷你数独',
    rules: '把空格填满，让每一行、每一列、每个粗线围住的小宫里，数字都不重复。4×4 用 1 到 4，6×6 用 1 到 6。先点格子，再点下面的数字。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var size = Number(params.size) === 6 ? 6 : 4;
      var level = SDK_GIVENS[4][params.level] ? params.level : 'normal';
      var check = params.check === true;
      var sh = sdkShape(size), N = sh.n;
      var puz = [], sol = [], grid = [], hinted = [], cellEls = [], numEls = [], edges = [];
      var sel = -1, solved = false, hints = 0, showBad = false;
      var dims = { w: 360, h: 600 };

      var timeEl = U.el('span.w-sudoku-time.jn-num', { text: '0:00' });
      var sizeSeg = segment('w-sudoku-size', [{ v: 4, label: '4×4' }, { v: 6, label: '6×6' }], size, function (v) {
        size = v;
        ctx.sfx('tap');
        build();
      });
      var board = U.el('div.w-sudoku-board');
      var msg = U.el('div.w-sudoku-msg');
      var pad = U.el('div.w-sudoku-pad');
      var eraseBtn = button('jn-btn.jn-btn--ghost', '擦掉', function () { fill(0); });
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示一格', doHint);
      var nextBtn = button('jn-btn.jn-btn--ghost', '换一题', function () { ctx.sfx('whoosh'); fresh(); });
      var box = U.el('div.w-sudoku', [
        U.el('div.w-sudoku-top', [sizeSeg.node, timeEl]),
        U.el('div.w-sudoku-wrap', [board]),
        msg,
        pad,
        U.el('div.w-sudoku-ctrl', [eraseBtn, hintBtn, nextBtn])
      ]);
      var end = makeEnd('sudoku', box);
      var clock = makeClock(S, timeEl);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }
      function peer(a, b) {
        var ra = Math.floor(a / N), rb = Math.floor(b / N), ca = a % N, cb = b % N;
        return ra === rb || ca === cb ||
          (Math.floor(ra / sh.br) === Math.floor(rb / sh.br) && Math.floor(ca / sh.bc) === Math.floor(cb / sh.bc));
      }
      function relayout() {
        // 上下内边距、上栏、提示行、数字键、按钮、四道间距
        var side = Math.floor(Math.min(dims.w - 24, dims.h - (24 + 44 + 22 + 44 + 44 + 8 * 4), 440) / N) * N;
        side = Math.max(side, N * 24);
        setVars(box, { side: side, cell: side / N, n: String(N) });
      }
      function build() {
        sh = sdkShape(size);
        N = sh.n;
        U.clear(board);
        U.clear(pad);
        cellEls = [];
        edges = [];
        U.range(N * N).forEach(function (i) {
          var r = Math.floor(i / N), c = i % N;
          edges[i] = ((c + 1) % sh.bc === 0 && c < N - 1 ? ' is-edge-r' : '') + ((r + 1) % sh.br === 0 && r < N - 1 ? ' is-edge-b' : '');
          var el = button('w-sudoku-cell', '', function () { pickCell(i); });
          cellEls.push(el);
          board.appendChild(el);
        });
        numEls = U.range(N).map(function (k) {
          var b = button('w-sudoku-num.jn-num', String(k + 1), function () { fill(k + 1); });
          pad.appendChild(b);
          return b;
        });
        sizeSeg.set(size);
        relayout();
        fresh();
      }
      function paint() {
        var bad = check || showBad ? sdkConflicts(grid, sh) : [];
        var same = sel >= 0 ? grid[sel] : 0;
        var counts = [];
        grid.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
        cellEls.forEach(function (el, i) {
          var cls = 'w-sudoku-cell jn-num' + edges[i];
          if (puz[i]) cls += ' is-given'; else if (hinted[i]) cls += ' is-hint';
          if (i === sel) cls += ' is-sel'; else if (sel >= 0 && peer(i, sel)) cls += ' is-peer';
          if (same && grid[i] === same && i !== sel) cls += ' is-same';
          if (bad[i]) cls += ' is-bad';
          el.className = cls;
          el.textContent = grid[i] ? String(grid[i]) : '';
          el.setAttribute('aria-label', '第 ' + (Math.floor(i / N) + 1) + ' 行第 ' + (i % N + 1) + ' 列' + (grid[i] ? '：' + grid[i] : '，空'));
        });
        numEls.forEach(function (b, k) {
          b.classList.toggle('is-full', (counts[k + 1] || 0) >= N);
          b.disabled = solved;
        });
        eraseBtn.disabled = solved || sel < 0 || !!puz[sel] || !grid[sel];
        hintBtn.disabled = solved;
      }
      function pickCell(i) {
        if (solved) return;
        sel = i;
        ctx.sfx('tap');
        paint();
      }
      function fill(v) {
        if (solved) return;
        if (sel < 0) { say('先点一个空格'); fx(msg, 'jn-shake'); return; }
        if (puz[sel]) { say('这一格是题目给的，改不了'); fx(cellEls[sel], 'jn-shake'); return; }
        grid[sel] = grid[sel] === v ? 0 : v;       // 再点一次同一个数字：擦掉
        hinted[sel] = false;
        showBad = false;
        ctx.sfx(grid[sel] ? 'pop' : 'tap'); ctx.haptic(8);
        say('');
        paint();
        settle();
      }
      function settle() {
        if (grid.indexOf(0) >= 0) return;
        for (var i = 0; i < grid.length; i++) {
          if (grid[i] !== sol[i]) {              // 题目唯一解：填满却不对，一定有撞车的数字
            showBad = true;
            paint();
            say('填满了，但有数字撞车了：看红色的');
            ctx.sfx('bad'); ctx.haptic(30);
            return;
          }
        }
        win();
      }
      function doHint() {
        if (solved) return;
        var at = -1, i;
        if (sel >= 0 && !puz[sel] && grid[sel] !== sol[sel]) at = sel;
        for (i = 0; at < 0 && i < grid.length; i++) if (!grid[i]) at = i;
        for (i = 0; at < 0 && i < grid.length; i++) if (grid[i] !== sol[i]) at = i;
        if (at < 0) return;
        grid[at] = sol[at];
        hinted[at] = true;
        hints++;
        sel = at;
        showBad = false;
        ctx.sfx('tick');
        say('这一格是 ' + sol[at]);
        paint();
        settle();
      }
      function win() {
        solved = true;
        sel = -1;
        clock.stop();
        paint();
        say('');
        ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
        var used = '用时 ' + U.fmtTime(clock.ms());
        var btns = [{ label: '再来一题', on: fresh }];
        if (size === 4) btns.push({ label: '挑战 6×6', on: function () { size = 6; build(); } });
        else if (level !== 'hard') btns.push({ label: '来道更难的', on: function () { level = SDK_ORDER[SDK_ORDER.indexOf(level) + 1]; fresh(); } });
        end.show({ tone: 'win', title: '填完了', sub: used + (hints ? ' · 提示 ' + hints + ' 格' : ''), buttons: btns });
        ctx.done({ win: true, text: used });
      }
      function fresh() {
        var p = L.sudoku.generate(size, null, SDK_GIVENS[N][level]);
        puz = p.puzzle;
        sol = p.solution;
        grid = puz.slice();
        hinted = [];
        sel = -1; solved = false; hints = 0; showBad = false;
        end.hide();
        clock.reset();
        clock.start();
        say('点一个空格，再点下面的数字');
        paint();
      }

      watchSize(ctx, function (w, h) { dims.w = w; dims.h = h; relayout(); });
      build();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一道 4×4 的题，空格一个个被填上 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var SOL = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
      var GIVEN = [0, 3, 5, 6, 9, 12, 15];
      var ORDER = [1, 4, 2, 7, 10, 8, 13, 11, 14];
      var cellEls = SOL.map(function (v, i) {
        var given = GIVEN.indexOf(i) >= 0;
        return U.el('div.w-sudoku-cell.jn-num' + (given ? '.is-given' : '') + (i % 4 === 1 ? '.is-edge-r' : '') + (Math.floor(i / 4) === 1 ? '.is-edge-b' : ''), { text: given ? String(v) : '' });
      });
      var box = U.el('div.w-sudoku-pv', [U.el('div.w-sudoku-board', cellEls)]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) {
        var side = Math.max(48, Math.floor(Math.min(w, h) * 0.84 / 4) * 4);
        setVars(box, { side: side, cell: side / 4, n: '4' });
      });
      var shown = 0;
      function paint() {
        ORDER.forEach(function (i, k) { cellEls[i].textContent = k < shown ? String(SOL[i]) : ''; });
      }
      if (ctx.reduced) { shown = 4; paint(); }
      else {
        S.every(520, function () {
          shown = shown > ORDER.length + 2 ? 0 : shown + 1;
          paint();
        });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C6. lights 关灯
   * params: { size: 3（默认）| 5, level: 'easy' | 'normal'（默认）| 'hard' }
   * ---------------------------------------------------------------------- */
  JN.registerWidget({ id: 'lights',
    name: '关灯',
    rules: '点一盏灯，它和上下左右的灯一起变：亮的灭，灭的亮。想办法把所有的灯都关掉。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var n = Number(params.size) === 5 ? 5 : 3;
      var level = LIGHT_STEPS[3][params.level] ? params.level : 'normal';
      var state = 0, first = 0, min = 0, steps = 0, hints = 0, hintAt = -1, over = false;
      var cellEls = [], dims = { w: 360, h: 600 };

      var stepsEl = U.el('b.jn-num', { text: '0' }), minEl = U.el('b.jn-num');
      var sizeSeg = segment('w-lights-size', [{ v: 3, label: '3×3' }, { v: 5, label: '5×5' }], n, function (v) {
        n = v;
        ctx.sfx('tap');
        build();
      });
      var board = U.el('div.w-lights-board');
      var msg = U.el('div.w-lights-msg');
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示', doHint);
      var resetBtn = button('jn-btn.jn-btn--ghost', '重来', function () { ctx.sfx('whoosh'); restart(); });
      var nextBtn = button('jn-btn.jn-btn--ghost', '换一题', function () { ctx.sfx('whoosh'); fresh(); });
      var box = U.el('div.w-lights', [
        U.el('div.w-lights-top', [U.el('span', ['步数 ', stepsEl, ' · 最少 ', minEl]), sizeSeg.node]),
        U.el('div.w-lights-wrap', [board]),
        msg,
        U.el('div.w-lights-ctrl', [hintBtn, resetBtn, nextBtn])
      ]);
      var end = makeEnd('lights', box);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }
      function relayout() {
        var side = Math.floor(Math.min(dims.w - 24, dims.h - (24 + 44 + 22 + 44 + 8 * 3), 440));
        side = Math.max(side, n * 30);
        setVars(box, { side: side, gap: n === 5 ? 6 : 10, n: String(n) });
      }
      function build() {
        U.clear(board);
        cellEls = [];
        U.range(n * n).forEach(function (i) {
          var el = button('w-lights-cell', '', function () { press(i); });
          el.setAttribute('aria-label', '第 ' + (Math.floor(i / n) + 1) + ' 行第 ' + (i % n + 1) + ' 盏');
          cellEls.push(el);
          board.appendChild(el);
        });
        sizeSeg.set(n);
        relayout();
        fresh();
      }
      function paint() {
        cellEls.forEach(function (el, i) {
          var on = !!((state >> i) & 1);
          el.classList.toggle('is-on', on);
          el.classList.toggle('is-hint', i === hintAt);
          el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        stepsEl.textContent = String(steps);
        minEl.textContent = String(min);
        hintBtn.disabled = over;
        resetBtn.disabled = over || steps === 0;
      }
      function press(i) {
        if (over) return;
        state = L.lights.press(state, n, i);
        steps++;
        hintAt = -1;
        ctx.sfx('tap'); ctx.haptic(8);
        say('');
        paint();
        fx(cellEls[i], 'w-lights-cell--tap');
        if (state === 0) win();
      }
      /** 提示：现解一遍方程，指出按键最少的那组解里的第一盏 */
      function doHint() {
        if (over) return;
        var sol = L.lights.solve(state, n), cell = 0;
        if (sol <= 0) return;
        while (!((sol >> cell) & 1)) cell++;
        hintAt = cell;
        hints++;
        say('按闪的那一盏。照这样按，还要 ' + bits(sol) + ' 下');
        ctx.sfx('tick');
        paint();
      }
      function win() {
        over = true;
        paint();
        ctx.sfx('win'); ctx.haptic([20, 40, 80]);
        if (steps <= min) ctx.confetti();
        var btns = [{ label: '再来一题', on: fresh }];
        if (n === 3) btns.push({ label: '换 5×5', on: function () { n = 5; build(); } });
        else if (level !== 'hard') btns.push({ label: '来道更难的', on: function () { level = SDK_ORDER[SDK_ORDER.indexOf(level) + 1]; fresh(); } });
        end.show({
          tone: 'win',
          title: '全关掉了',
          sub: (steps <= min ? steps + ' 步，一下都没多按' : '用了 ' + steps + ' 步，最少只要 ' + min + ' 步') + (hints ? ' · 提示 ' + hints + ' 次' : ''),
          buttons: btns
        });
        ctx.done({ win: true, text: steps + ' 步' });
      }
      function restart() {
        state = first;
        steps = 0; hintAt = -1; over = false;
        end.hide();
        say('点一盏灯，它和上下左右一起变');
        paint();
      }
      function fresh() {
        var range = LIGHT_STEPS[n][level];
        var p = L.lights.generate(n, null, range[0], range[1]);
        first = p.state;
        min = p.min;
        hints = 0;
        restart();
      }

      watchSize(ctx, function (w, h) { dims.w = w; dims.h = h; relayout(); });
      build();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一盘 3×3 自己按最少步数关灯，关完换一盘 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var state = 0, rest = 0;
      var cellEls = U.range(9).map(function () { return U.el('div.w-lights-cell'); });
      var box = U.el('div.w-lights-pv', [U.el('div.w-lights-board', cellEls)]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) {
        var side = Math.max(48, Math.floor(Math.min(w, h) * 0.84));
        setVars(box, { side: side, gap: Math.max(3, Math.round(side * 0.045)), n: '3' });
      });
      function paint(tap) {
        cellEls.forEach(function (el, i) {
          el.classList.toggle('is-on', !!((state >> i) & 1));
          el.classList.toggle('is-tap', i === tap);
        });
      }
      state = L.lights.generate(3, ctx.reduced ? ctx.rng('lights') : null, 3, 4).state;
      paint(-1);
      if (!ctx.reduced) {
        S.every(760, function () {
          if (state === 0) {
            if (++rest < 2) { paint(-1); return; }
            rest = 0;
            state = L.lights.generate(3, null, 3, 4).state;
            paint(-1);
            return;
          }
          var sol = L.lights.solve(state, 3), cell = 0;
          while (!((sol >> cell) & 1)) cell++;
          state = L.lights.press(state, 3, cell);
          paint(cell);
        });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C7. memory 记忆翻牌
   * params: { pairs: 6 | 8（默认）| 10, players: 1（默认）| 2 }
   * 牌面优先用插画雪碧图里的贴纸；雪碧图里没有的，用下面自己画的几何图形补。
   * ---------------------------------------------------------------------- */
  var MEM_ART = ['ball', 'hoop', 'sneaker', 'trophy', 'whistle', 'jersey', 'rocket', 'pizza', 'star', 'moon', 'dice', 'key',
    'bulb', 'planet', 'gamepad', 'kite', 'bike', 'cup', 'camera', 'tent', 'sun', 'magnet', 'flask', 'compass'];
  var MEM_INK = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--c-trio-a)', 'var(--c-puzzle-a)', 'var(--c-show-a)',
    'var(--danger)', 'var(--c-play-b)', 'var(--c-do-b)', 'var(--c-talk-b)', 'var(--c-show-b)'];
  /** 正多边形的路径；给了 inner 就是星形 */
  function polyPath(cx, cy, r, n, rot, inner) {
    var pts = [], steps = inner ? n * 2 : n;
    for (var i = 0; i < steps; i++) {
      var p = polar(inner && i % 2 ? inner : r, rot + i * 360 / steps, cx, cy);
      pts.push(p[0] + ' ' + p[1]);
    }
    return 'M' + pts.join(' L') + ' Z';
  }
  var MEM_SHAPES = [
    ['circle', { cx: 50, cy: 50, r: 33 }],
    ['rect', { x: 19, y: 19, width: 62, height: 62, rx: 11 }],
    ['path', { d: polyPath(50, 57, 42, 3, -90) }],                // 三角
    ['path', { d: polyPath(50, 50, 40, 4, -90) }],                // 菱形
    ['path', { d: polyPath(50, 53, 43, 5, -90, 18) }],            // 五角星
    ['path', { d: 'M50 86 C16 62 10 40 18 28 C27 15 44 18 50 31 C56 18 73 15 82 28 C90 40 84 62 50 86 Z' }],    // 心
    ['path', { d: polyPath(50, 50, 38, 6, 0) }],                  // 六边形
    ['path', { d: 'M38 12 H62 V38 H88 V62 H62 V88 H38 V62 H12 V38 H38 Z' }],      // 十字
    ['path', { d: 'M64 12 A40 40 0 1 0 88 62 A31 31 0 0 1 64 12 Z' }],            // 月牙
    ['path', { d: 'M50 14 A36 36 0 1 0 50 86 A36 36 0 1 0 50 14 Z M50 34 A16 16 0 1 1 50 66 A16 16 0 1 1 50 34 Z', 'fill-rule': 'evenodd' }],   // 圆环
    ['path', { d: 'M58 8 L22 56 H46 L40 92 L78 42 H54 Z' }],      // 闪电
    ['path', { d: 'M50 10 C38 30 20 46 20 62 A30 30 0 0 0 80 62 C80 46 62 30 50 10 Z' }]    // 水滴
  ];
  /** 选出 pairs 种牌面：{ art: 贴纸名或 null, shape: 备用图形的下标, ink: 底色 } */
  function memFaces(pairs, rnd) {
    var arts = U.shuffle(MEM_ART.filter(function (name) { return U.hasSymbol('art-' + name); }), rnd).slice(0, pairs);
    var shapes = U.shuffle(U.range(MEM_SHAPES.length), rnd);
    var inks = U.shuffle(MEM_INK, rnd);
    return U.range(pairs).map(function (i) {
      return { art: arts[i] || null, shape: arts[i] ? -1 : shapes[i - arts.length], ink: inks[i % inks.length] };
    });
  }
  function memCard(face, tag) {
    var pic;
    if (face.art) pic = U.art(face.art, 'w-memory-art');
    else {
      var s = MEM_SHAPES[face.shape];
      pic = U.svg('svg', { class: 'w-memory-art w-memory-shape', viewBox: '0 0 100 100', 'aria-hidden': 'true' }, [U.svg(s[0], s[1])]);
    }
    var front = U.el('div.w-memory-face', [pic]);
    front.style.setProperty('--tint', face.ink);
    return U.el(tag + '.w-memory-card', { attrs: tag === 'button' ? { type: 'button' } : null }, [
      U.el('div.w-memory-inner', [U.el('div.w-memory-back'), front])
    ]);
  }

  JN.registerWidget({ id: 'memory',
    name: '记忆翻牌',
    rules: '一次翻两张：图案一样就留在桌面上，不一样就扣回去。两个人玩时轮流翻，翻对了的人接着翻，最后看谁配成的对子多。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var pairs = [6, 8, 10].indexOf(Number(params.pairs)) >= 0 ? Number(params.pairs) : 8;
      var two = Number(params.players) === 2;
      var WHO = ['橙方', '蓝方'];
      var deck = [], cardEls = [], up = [], done = [];
      var turn = 0, starter = 0, moves = 0, score = [0, 0], flipBack = 0, over = false, game = 0;
      var dims = { w: 360, h: 600 };

      var movesEl = U.el('b.jn-num', { text: '0' });
      var timeEl = U.el('span.w-memory-time.jn-num', { text: '0:00' });
      var scoreEls = [0, 1].map(function (i) {
        return U.el('div.w-memory-score.is-p' + i, [U.el('span', { text: WHO[i] }), U.el('b.jn-num', { text: '0' })]);
      });
      var againBtn = button('jn-chip.w-memory-again', '重来', function () { ctx.sfx('whoosh'); start(); });
      var grid = U.el('div.w-memory-grid');
      var box = U.el('div.w-memory', [
        U.el('div.w-memory-top', two ? [scoreEls[0], scoreEls[1], againBtn] : [U.el('span', ['步数 ', movesEl]), timeEl, againBtn]),
        U.el('div.w-memory-wrap', [grid])
      ]);
      var end = makeEnd('memory', box);
      var clock = makeClock(S, timeEl);
      root.appendChild(box);

      function relayout() {
        var g = L.memory.grid(pairs), gap = 8;
        var cw = Math.floor((dims.w - 24 - (g.cols - 1) * gap) / g.cols);
        var ch = Math.floor((dims.h - (24 + 44 + 8) - (g.rows - 1) * gap) / g.rows);   // 内边距、上栏、一道间距
        ch = Math.max(24, Math.min(ch, Math.round(cw * 1.3)));
        cw = Math.max(24, Math.min(cw, Math.round(ch * 1.05)));
        setVars(box, { cw: cw, ch: ch, cols: String(g.cols) });
      }
      function paintTop() {
        movesEl.textContent = String(moves);
        scoreEls.forEach(function (el, i) {
          el.lastChild.textContent = String(score[i]);
          el.classList.toggle('is-turn', two && !over && turn === i);
        });
      }
      function tap(i) {
        if (over || done[i] || up.indexOf(i) >= 0) return;
        if (up.length === 2) settle();              // 手快：上一对还没扣回去就点了下一张
        if (!two) clock.start();
        up.push(i);
        cardEls[i].classList.add('is-up');
        ctx.sfx('tap'); ctx.haptic(8);
        if (up.length < 2) return;
        moves++;
        if (deck[up[0]] === deck[up[1]]) {
          var pair = [cardEls[up[0]], cardEls[up[1]]], who = turn, round = game;
          done[up[0]] = done[up[1]] = true;
          up = [];
          score[who]++;
          S.after(ctx.reduced ? 0 : 280, function () {
            if (round !== game) return;         // 这期间点了“重来”：这一对属于上一局，不管了
            pair.forEach(function (el) {
              el.classList.add('is-done');
              if (two) el.classList.add('is-p' + who);
            });
            ctx.sfx('good'); ctx.haptic(20);
            if (score[0] + score[1] === pairs) finish();
          });
        } else {
          flipBack = S.after(950, settle);
        }
        paintTop();
      }
      /** 把翻错的两张扣回去；两个人玩时换人 */
      function settle() {
        S.cancel(flipBack);
        flipBack = 0;
        if (up.length < 2) return;
        up.forEach(function (k) { cardEls[k].classList.remove('is-up'); });
        up = [];
        if (two) turn = 1 - turn;
        paintTop();
      }
      function finish() {
        over = true;
        clock.stop();
        paintTop();
        ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
        var btns = [{ label: '再来一局', on: start }];
        if (pairs < 10) btns.push({ label: '加到 ' + (pairs + 2) + ' 对', on: function () { pairs += 2; start(); } });
        if (two) {
          var title = score[0] === score[1] ? '打平了' : WHO[score[0] > score[1] ? 0 : 1] + '赢了';
          starter = 1 - starter;
          end.show({ tone: 'win', title: title, sub: WHO[0] + ' ' + score[0] + ' : ' + score[1] + ' ' + WHO[1], buttons: btns });
          ctx.done({ text: title });
          return;
        }
        var key = 'best' + pairs, best = ctx.store.get(key, 0), note;
        if (!best || moves < best) { ctx.store.set(key, moves); note = best ? '新纪录，之前是 ' + best + ' 步' : '第一次的成绩，记下了'; }
        else note = '最佳纪录 ' + best + ' 步';
        end.show({ tone: 'win', title: '全翻开了', sub: moves + ' 步 · 用时 ' + U.fmtTime(clock.ms()), more: U.el('div', { text: note }), buttons: btns });
        ctx.done({ win: true, text: moves + ' 步' });
      }
      function start() {
        S.cancel(flipBack);
        flipBack = 0;
        var faces = memFaces(pairs);
        deck = L.memory.deck(pairs);
        game++;
        up = []; done = []; moves = 0; score = [0, 0]; over = false;
        turn = starter;
        U.clear(grid);
        cardEls = deck.map(function (f, i) {
          var el = memCard(faces[f], 'button');
          el.setAttribute('aria-label', '第 ' + (i + 1) + ' 张牌');
          el.addEventListener('click', function () { tap(i); });
          grid.appendChild(el);
          return el;
        });
        end.hide();
        clock.reset();
        relayout();
        paintTop();
      }

      watchSize(ctx, function (w, h) { dims.w = w; dims.h = h; relayout(); });
      start();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：八张牌自己翻——配上一对、翻错一对、再一对对配完，然后全部扣回去重来 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var faces = memFaces(4, ctx.rng('memory-preview'));
      var deck = [0, 1, 2, 0, 3, 2, 1, 3];
      var cardEls = deck.map(function (f) { return memCard(faces[f], 'div'); });
      var box = U.el('div.w-memory-pv', [U.el('div.w-memory-grid', cardEls)]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) {
        var cw = Math.max(16, Math.floor(Math.min((w - 16 - 18) / 4, (h - 16 - 6) / 2 / 1.2)));
        setVars(box, { cw: cw, ch: Math.round(cw * 1.2), cols: '4' });
      });
      var SCRIPT = [[], [0], [0, 3], [0, 3, 1], [0, 3, 1, 4], [0, 3], [0, 3, 1], [0, 3, 1, 6], [0, 3, 1, 6, 2], [0, 3, 1, 6, 2, 5],
        [0, 3, 1, 6, 2, 5, 4], [0, 3, 1, 6, 2, 5, 4, 7], [0, 3, 1, 6, 2, 5, 4, 7], []];
      var k = ctx.reduced ? 7 : 0;
      function paint() { cardEls.forEach(function (el, i) { el.classList.toggle('is-up', SCRIPT[k].indexOf(i) >= 0); }); }
      paint();
      if (!ctx.reduced) S.every(620, function () { k = (k + 1) % SCRIPT.length; paint(); });
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C8. onestroke 一笔画
   * params: { level: 从第几关开始（从 1 数，默认 1；「七座桥」是第 6 关） }
   * ---------------------------------------------------------------------- */
  var STROKE_WHY = '数一数每个点连着几条线：5、3、3、3，全是奇数。\n\n每路过一个点，要进去一条、出来一条，一次用掉两条线。所以除了起点和终点，别的点连着的线必须是偶数条。\n\n- 连着奇数条线的点有 0 个：从哪儿出发都行\n- 有 2 个：从其中一个出发，到另一个结束\n- 超过 2 个：画不出来\n\n这是 1736 年欧拉回答“哥尼斯堡七桥问题”时发现的规律。';

  /** 一条边的 SVG 路径和长度。带弯度的边画成二次贝塞尔曲线：控制点 = 中点 + 法向量 × 弯度 × 线段长。 */
  function strokeGeom(level, e) {
    var a = level.nodes[e[0]], b = level.nodes[e[1]], bend = e[2] || 0;
    if (!bend) return { d: 'M' + a[0] + ' ' + a[1] + ' L' + b[0] + ' ' + b[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    var cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
    var len = 0, px = a[0], py = a[1];
    for (var i = 1; i <= 20; i++) {
      var t = i / 20, u = 1 - t;
      var x = u * u * a[0] + 2 * u * t * cx + t * t * b[0], y = u * u * a[1] + 2 * u * t * cy + t * t * b[1];
      len += Math.hypot(x - px, y - py);
      px = x; py = y;
    }
    return { d: 'M' + a[0] + ' ' + a[1] + ' Q' + (Math.round(cx * 10) / 10) + ' ' + (Math.round(cy * 10) / 10) + ' ' + b[0] + ' ' + b[1], len: len };
  }

  JN.registerWidget({ id: 'onestroke',
    name: '一笔画',
    rules: '按住一个点，沿着线拖到下一个点（也可以一个点一个点地按）。每条线只能走一次，要把所有的线都走完；中途可以抬手，接着从停下的点继续。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var LEVELS = STROKE_LEVELS, HIT = 11;
      var idx = Math.round(numParam(params.level, 1, LEVELS.length, 1)) - 1;
      var lv = LEVELS[idx], info = L.stroke.analyse(lv);
      var used = [], path = [], at = -1, over = false, stuck = false, dragging = false;
      var fails = 0, revealed = false, hintEdge = -1, hintStart = false;
      var solved = ctx.store.get('solved', []), knows = ctx.store.get('knows', false);
      var geoms = [], edgeEls = [], inkEls = [], nodeEls = [];

      var prevBtn = button('w-onestroke-nav', '‹', function () { go(idx - 1); });
      var nextBtn = button('w-onestroke-nav', '›', function () { go(idx + 1); });
      prevBtn.setAttribute('aria-label', '上一关');
      nextBtn.setAttribute('aria-label', '下一关');
      var nameEl = U.el('b'), countEl = U.el('span.jn-num');
      var svg = U.svg('svg', { class: 'w-onestroke-svg', viewBox: '0 0 100 100' });
      var gBase = U.svg('g'), gInk = U.svg('g'), gNode = U.svg('g'), gDeg = U.svg('g', { class: 'w-onestroke-degs' });
      var rubber = U.svg('line', { class: 'w-onestroke-rubber' });
      [gBase, gInk, rubber, gNode, gDeg].forEach(function (g) { svg.appendChild(g); });
      var wrap = U.el('div.w-onestroke-wrap');
      wrap.appendChild(svg);
      var msg = U.el('div.w-onestroke-msg');
      var undoBtn = button('jn-btn.jn-btn--ghost', '撤销', doUndo);
      var resetBtn = button('jn-btn.jn-btn--ghost', '重来', doReset);
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示', doHint);
      var box = U.el('div.w-onestroke', [
        U.el('div.w-onestroke-top', [prevBtn, U.el('div.w-onestroke-title', [nameEl, countEl]), nextBtn]),
        wrap,
        msg,
        U.el('div.w-onestroke-ctrl', [undoBtn, resetBtn, hintBtn])
      ]);
      var end = makeEnd('onestroke', box);
      root.appendChild(box);

      function say(text) { msg.textContent = text || ''; }
      function rubberOff() { dragging = false; rubber.setAttribute('class', 'w-onestroke-rubber'); }
      function paint() {
        var degrees = revealed || (knows && hintStart);          // 知道规律以后，提示时把每个点连着几条线也标出来
        nodeEls.forEach(function (el, k) {
          el.setAttribute('class', 'w-onestroke-node' + (k === at ? ' is-at' : '') +
            (hintStart && info.starts.indexOf(k) >= 0 ? ' is-start' : '') + (degrees && info.deg[k] % 2 ? ' is-odd' : ''));
          el.setAttribute('r', degrees ? 5.8 : 4.2);
        });
        edgeEls.forEach(function (el, k) {
          el.setAttribute('class', 'w-onestroke-edge' + (used[k] ? ' is-used' : '') + (k === hintEdge ? ' is-hint' : ''));
        });
        svg.setAttribute('class', 'w-onestroke-svg' + (degrees ? ' is-degrees' : ''));
        nameEl.textContent = '第 ' + (idx + 1) + ' 关 ' + lv.name + (solved.indexOf(idx) >= 0 ? ' ✓' : '');
        countEl.textContent = path.length + ' / ' + lv.edges.length + ' 条线';
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === LEVELS.length - 1;
        undoBtn.disabled = over || !path.length;
        resetBtn.disabled = over || at < 0;
        hintBtn.textContent = revealed ? '看解释' : lv.bridge && fails >= 2 ? '画不出来？' : '提示';
        hintBtn.classList.toggle('w-onestroke-ask', !!lv.bridge && !revealed && fails >= 2);
      }

      /** 把第 k 条线从 from 那头开始“画”出来 */
      function showInk(k, from) {
        var el = inkEls[k], len = geoms[k].len;
        el.style.transition = 'none';
        el.style.strokeDashoffset = String(lv.edges[k][0] === from ? len : -len);
        void el.getBoundingClientRect();
        el.style.transition = '';
        el.style.strokeDashoffset = '0';
        el.setAttribute('class', 'w-onestroke-ink is-on');
      }
      function hideInk(k) { inkEls[k].setAttribute('class', 'w-onestroke-ink'); }

      function load(i) {
        idx = i;
        lv = LEVELS[idx];
        info = L.stroke.analyse(lv);
        fails = lv.bridge && knows ? 2 : 0;      // 以前识破过的人，一进来就能直接喊“画不出来”
        revealed = false;
        [gBase, gInk, gNode, gDeg].forEach(function (g) { U.clear(g); });
        geoms = []; edgeEls = []; inkEls = []; nodeEls = [];
        lv.edges.forEach(function (e, k) {
          var g = strokeGeom(lv, e), dash = Math.round(g.len * 100) / 100;
          geoms[k] = { d: g.d, len: dash };
          edgeEls[k] = U.svg('path', { class: 'w-onestroke-edge', d: g.d });
          inkEls[k] = U.svg('path', { class: 'w-onestroke-ink', d: g.d, 'stroke-dasharray': dash + ' ' + dash });
          gBase.appendChild(edgeEls[k]);
          gInk.appendChild(inkEls[k]);
        });
        lv.nodes.forEach(function (p, k) {
          nodeEls[k] = U.svg('circle', { class: 'w-onestroke-node', cx: p[0], cy: p[1], r: 4.2 });
          gNode.appendChild(nodeEls[k]);
          var label = U.svg('text', { class: 'w-onestroke-deg', x: p[0], y: p[1], 'text-anchor': 'middle', 'dominant-baseline': 'central' });
          label.textContent = String(info.deg[k]);
          gDeg.appendChild(label);
        });
        clearPath();
        say('从一个点出发，一笔走完所有的线');
      }
      function clearPath() {
        used = []; path = []; at = -1;
        over = false; stuck = false; hintEdge = -1; hintStart = false;
        rubberOff();
        inkEls.forEach(function (el, k) { hideInk(k); });
        end.hide();
        paint();
      }
      function go(i) {
        if (i < 0 || i >= LEVELS.length) return;
        ctx.sfx('whoosh');
        load(i);
      }

      function point(e) {
        var r = svg.getBoundingClientRect();
        return { x: (e.clientX - r.left) / (r.width || 1) * 100, y: (e.clientY - r.top) / (r.height || 1) * 100 };
      }
      function nearest(p, radius) {
        var best = -1, bd = radius;
        lv.nodes.forEach(function (n, k) {
          var d = Math.hypot(n[0] - p.x, n[1] - p.y);
          if (d <= bd) { bd = d; best = k; }
        });
        return best;
      }
      function freeEdge(a, b) {
        for (var k = 0; k < lv.edges.length; k++) {
          var e = lv.edges[k];
          if (!used[k] && ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) return k;
        }
        return -1;
      }
      function drawRubber(p) {
        if (!dragging || at < 0 || over) { rubber.setAttribute('class', 'w-onestroke-rubber'); return; }
        rubber.setAttribute('x1', lv.nodes[at][0]);
        rubber.setAttribute('y1', lv.nodes[at][1]);
        rubber.setAttribute('x2', Math.round(p.x * 10) / 10);
        rubber.setAttribute('y2', Math.round(p.y * 10) / 10);
        rubber.setAttribute('class', 'w-onestroke-rubber is-on');
      }
      function arrive(k, tapped) {
        if (at < 0) {
          at = k; hintStart = false;
          ctx.sfx('tap'); ctx.haptic(8);
          say('沿着线拖到下一个点，或者直接点下一个点');
          paint();
          return;
        }
        if (k === at) return;
        var e = freeEdge(at, k);
        if (e >= 0) { walk(e, k); return; }
        if (tapped && !path.length) {                   // 还没动笔：换个起点
          at = k;
          ctx.sfx('tap');
          paint();
        }
      }
      function walk(e, to) {
        used[e] = true;
        path.push({ e: e, from: at });
        showInk(e, at);
        at = to;
        hintEdge = -1; hintStart = false;
        ctx.sfx('tick'); ctx.haptic(10);
        if (path.length === lv.edges.length) { win(); return; }
        var open = lv.edges.some(function (ed, k) { return !used[k] && (ed[0] === at || ed[1] === at); });
        if (!open) { deadEnd(); return; }
        say('');
        paint();
      }
      function deadEnd() {
        stuck = true;
        fails++;
        rubberOff();
        say(lv.bridge && fails >= 2 ? '又是死胡同。是你的问题，还是这张图的问题？' : '走进死胡同了，还剩 ' + (lv.edges.length - path.length) + ' 条线。撤销或者重来');
        fx(wrap, 'jn-shake');
        ctx.sfx('bad'); ctx.haptic(40);
        paint();
        if (lv.bridge && fails >= 4) S.after(900, function () { if (lv.bridge && !revealed) reveal(); });
      }
      function win() {
        var lastOne = idx === LEVELS.length - 1;
        over = true;
        rubberOff();
        if (solved.indexOf(idx) < 0) { solved.push(idx); ctx.store.set('solved', solved); }
        paint();
        say('');
        ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
        end.show({
          tone: 'win',
          title: lastOne ? '全部通关' : '一笔画成',
          sub: '第 ' + (idx + 1) + ' 关「' + lv.name + '」，' + lv.edges.length + ' 条线',
          buttons: [
            lastOne ? { label: '回到第一关', on: function () { go(0); } } : { label: '下一关', on: function () { go(idx + 1); } },
            { label: '再画一次', on: clearPath }
          ]
        });
        ctx.done({ win: true, text: '第 ' + (idx + 1) + ' 关' });
      }
      /** 七座桥：揭晓“这一关做不到”，把每个点连着几条线标出来，讲规律 */
      function reveal() {
        revealed = true; over = true; knows = true;
        rubberOff();
        ctx.store.set('knows', true);
        if (solved.indexOf(idx) < 0) { solved.push(idx); ctx.store.set('solved', solved); }
        paint();
        say('每个点上的数字：它连着几条线');
        ctx.sfx('good'); ctx.haptic([20, 40]);
        explain();
        ctx.done({ win: true, text: '看穿了七座桥' });
      }
      function explain() {
        end.show({
          tone: 'win',
          title: '这一关真的画不出来',
          more: U.el('div.w-onestroke-why', { html: JN.md(STROKE_WHY) }),
          buttons: [{ label: '多修一座桥呢', on: function () { go(idx + 1); } }, { label: '看看图', on: function () { end.hide(); } }]
        });
      }

      function doUndo() {
        if (over || !path.length) return;
        var last = path.pop();
        used[last.e] = false;
        hideInk(last.e);
        at = last.from;
        stuck = false; hintEdge = -1;
        ctx.sfx('tap');
        say('');
        paint();
      }
      function doReset() {
        if (over || at < 0) return;
        if (lv.bridge && !stuck && path.length >= 4) fails++;      // 画了一半自己放弃，也算试过一次
        ctx.sfx('whoosh');
        clearPath();
        say('换个点出发试试');
      }
      function doHint() {
        if (revealed) { explain(); return; }
        if (over) return;
        ctx.sfx('tick');
        if (lv.bridge) {
          if (fails >= 2) { reveal(); return; }
          fails++;
          say(fails >= 2 ? '每个点都试过了吗？还是说……' : '这一关的起点不好找，多换几个点试试');
          paint();
          return;
        }
        if (!path.length) {
          if (at >= 0 && info.starts.indexOf(at) < 0) at = -1;
          hintStart = true;
          say(!info.odd.length ? '这张图从哪个点出发都行' : knows ? '从闪的点出发：只有它们连着奇数条线' : '从闪的点出发');
        } else {
          hintEdge = L.stroke.next(lv, used, at);
          if (hintEdge < 0) { say('照现在这样画不完了，撤销几步'); fx(undoBtn, 'jn-shake'); }
          else say('走闪的那条线');
        }
        paint();
      }

      S.on(svg, 'pointerdown', function (e) {
        if (over) return;
        e.preventDefault();
        var p = point(e), k = nearest(p, HIT);
        dragging = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 合成的事件没有真的指针，忽略 */ }
        if (k >= 0) arrive(k, true);
        drawRubber(p);
      });
      S.on(svg, 'pointermove', function (e) {
        if (!dragging || over) return;
        if (e.pointerType === 'mouse' && e.buttons === 0) { rubberOff(); return; }   // 鼠标在画布外松了手
        var p = point(e), k = nearest(p, HIT * 0.8);
        if (k >= 0 && k !== at) arrive(k, false);
        drawRubber(p);
      });
      S.on(svg, 'pointerup', rubberOff);
      S.on(svg, 'pointercancel', rubberOff);

      watchSize(ctx, function (w, h) {
        setVars(box, { side: Math.max(120, Math.floor(Math.min(w - 24, h - (24 + 44 + 22 + 44 + 8 * 3), 460))) });
      });
      load(idx);
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一笔画出一颗五角星，画完擦掉重来（五角星不是关卡，不剧透）。
     * 七座桥那张卡片的预览是另一出戏：走了六座桥，卡在岸上，还剩一座够不着。 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var lv = STROKE_LEVELS[Math.round(numParam(params.level, 1, STROKE_LEVELS.length, 1)) - 1];
      var fig, route, start, k;
      if (lv.bridge) { fig = lv; route = [0, 1, 2, 3, 4, 5]; start = 2; }
      else {
        fig = { nodes: U.range(5).map(function (i) { return polar(40, -90 + 72 * i, 50, 53); }), edges: [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]] };
        route = [0, 1, 2, 3, 4];
        start = 0;
      }
      var seq = [start];                       // 笔尖依次停过的点
      route.forEach(function (e) {
        var cur = seq[seq.length - 1];
        seq.push(fig.edges[e][0] === cur ? fig.edges[e][1] : fig.edges[e][0]);
      });
      var svg = U.svg('svg', { class: 'w-onestroke-svg', viewBox: '0 0 100 100' });
      var bases = [], inks = [], dots = [];
      fig.edges.forEach(function (e, i) {
        var d = strokeGeom(fig, e).d;
        bases[i] = U.svg('path', { class: 'w-onestroke-edge', d: d });
        inks[i] = U.svg('path', { class: 'w-onestroke-ink', d: d });
        svg.appendChild(bases[i]);
      });
      inks.forEach(function (el) { svg.appendChild(el); });
      fig.nodes.forEach(function (p, i) {
        dots[i] = U.svg('circle', { class: 'w-onestroke-node', cx: p[0], cy: p[1], r: 4.2 });
        svg.appendChild(dots[i]);
      });
      var box = U.el('div.w-onestroke-pv');
      box.appendChild(svg);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { side: Math.max(40, Math.floor(Math.min(w, h) * 0.92)) }); });
      var shown = ctx.reduced ? Math.min(3, route.length) : 0;
      function paint() {
        var walked = Math.min(shown, route.length), done = shown >= route.length;
        inks.forEach(function (el, i) { el.setAttribute('class', 'w-onestroke-ink' + (route.indexOf(i) >= 0 && route.indexOf(i) < walked ? ' is-on' : '')); });
        bases.forEach(function (el, i) { el.setAttribute('class', 'w-onestroke-edge' + (done && route.indexOf(i) < 0 ? ' is-hint' : '')); });
        dots.forEach(function (el, i) { el.setAttribute('class', 'w-onestroke-node' + (i === seq[walked] ? (done && lv.bridge ? ' is-odd' : ' is-at') : '')); });
      }
      paint();
      if (!ctx.reduced) {
        k = route.length + 3;
        S.every(560, function () { shown = shown >= k ? 0 : shown + 1; paint(); });
      }
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C9. mindread 读心术（二进制卡片魔术）
   * params: { mode: 'magic'（默认，手机来读你的心）| 'perform'（直接进“换你来表演”） }
   * ---------------------------------------------------------------------- */
  var MIND_WHY = '每张卡片左上角的数是 1、2、4、8、16、32。\n\n1 到 63 的每个数，都能用这几个数加出来，而且加法只有一种。比如 37 = 32 + 4 + 1，所以 37 只印在左上角是 32、4、1 的那三张上。\n\n你每说一次“有”，手机就把那张卡片左上角的数加进去。六张问完，加出来的就是你想的数。\n\n这种用 1、2、4、8……凑数的记法叫**二进制**，电脑里的数都是这么记的。';
  var MIND_HOWTO = '找一位观众，让他在心里想一个 1 到 63 的数。\n\n把卡片一张张给他看，问他“有没有”，替他按下回答。\n\n**你的秘诀**：他每说一次“有”，就悄悄记住那张卡片**左上角**的数，全部加起来。六张问完，加出来的就是他想的数。\n\n这一页只给表演的人看。';

  JN.registerWidget({ id: 'mindread',
    name: '读心术',
    rules: '在心里想一个 1 到 63 的数，别说出来。手机给你看六张卡片，你只回答“有”还是“没有”，它就能说出你想的数。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var perform = params.mode === 'perform';
      var order = [], step = 0, answers = [], rolling = 0;
      var box = U.el('div.w-mindread');
      root.appendChild(box);

      function screen(nodes) {
        S.cancel(rolling);
        rolling = 0;
        U.clear(box);
        U.append(box, nodes);
      }
      function title(text) { return U.el('div.w-mindread-title', { text: text }); }
      function note(text) { return U.el('div.w-mindread-note', { text: text }); }
      function main(text, nodes) { return U.el('div.w-mindread-main' + (text ? '.is-text' : ''), nodes); }
      function strong(label, fn) { return button('jn-btn', label, fn); }
      function soft(label, fn) { return button('jn-btn.jn-btn--ghost', label, fn); }

      function intro() {
        perform = false;
        screen([
          main(false, [
            title('心里想一个数'),
            U.el('div.w-mindread-range.jn-num', { text: '1 ~ 63' }),
            note('想好了别说出来。接下来看六张卡片，只回答“有”或“没有”。')
          ]),
          U.el('div.w-mindread-row', [button('jn-btn.jn-btn--lg', '想好了', begin)])
        ]);
      }
      function begin() {
        order = U.shuffle(U.range(6));      // 六张卡片每次换个顺序出场
        step = 0;
        answers = [];
        ctx.sfx('whoosh');
        showCard();
      }
      function showCard() {
        var nums = L.mind.card(order[step]);
        var card = U.el('div.w-mindread-card', nums.map(function (n, i) {
          return U.el('span.jn-num' + (perform && i === 0 ? '.is-key' : ''), { text: String(n) });
        }));
        screen([
          U.el('div.w-mindread-head', [
            U.el('span', { text: (perform ? '表演中 · ' : '') + '第 ' + (step + 1) + ' 张，共 6 张' }),
            U.el('div.w-mindread-dots', U.range(6).map(function (i) { return U.el('i' + (i < step ? '.is-past' : i === step ? '.is-now' : '')); }))
          ]),
          main(false, [card, U.el('div.w-mindread-ask', { text: perform ? '问观众：你想的数在这张上吗？' : '你想的数，在这张卡片上吗？' })]),
          U.el('div.w-mindread-row', [
            button('jn-btn.jn-btn--ghost.jn-btn--lg', '没有', function () { answer(false); }),
            button('jn-btn.jn-btn--lg', '有', function () { answer(true); })
          ])
        ]);
      }
      function answer(yes) {
        answers[order[step]] = yes;
        ctx.sfx('tap'); ctx.haptic(8);
        step++;
        if (step < 6) showCard();
        else if (perform) performEnd();
        else reveal();
      }
      function reveal() {
        var n = L.mind.reveal(answers);
        if (!n) {
          screen([
            main(false, [title('六张都没有？'), note('那你想的数不在 1 到 63 里，或者有一张看漏了。换个数再来。')]),
            U.el('div.w-mindread-row', [button('jn-btn.jn-btn--lg', '再来一次', intro)])
          ]);
          ctx.sfx('buzz');
          ctx.done({ win: false, text: '没读出来' });
          return;
        }
        var big = U.el('div.w-mindread-big.jn-num', { text: '?' });
        var row = U.el('div.w-mindread-row');
        var ticks = 0;
        function land() {
          big.textContent = String(n);
          big.classList.add('is-final');
          ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
          U.append(row, [soft('揭秘', function () { secret(n); }), strong('再来一次', intro), soft('换你表演', performIntro)]);
          ctx.done({ win: true, text: '读出了 ' + n });
        }
        screen([main(false, [title('你想的是'), big]), row]);
        if (ctx.reduced) { land(); return; }
        rolling = S.every(70, function () {           // 数字乱跳一小会儿再定格
          if (++ticks < 14) {
            big.textContent = String(U.randInt(1, 63));
            ctx.sfx('tick');
            return;
          }
          S.cancel(rolling);
          rolling = 0;
          land();
        });
      }
      function secret(n) {
        var parts = [32, 16, 8, 4, 2, 1].filter(function (v) { return n & v; });
        screen([
          main(true, [
            title('它是怎么知道的'),
            U.el('div.w-mindread-sum.jn-num', { text: n + ' = ' + parts.join(' + ') }),
            U.el('div.w-mindread-bits', [32, 16, 8, 4, 2, 1].map(function (v) {
              return U.el('span.jn-num' + (n & v ? '.is-on' : ''), { text: String(v) });
            })),
            U.el('div.w-mindread-why', { html: JN.md(MIND_WHY) })
          ]),
          U.el('div.w-mindread-row', [soft('再来一次', intro), strong('换你表演', performIntro)])
        ]);
      }
      function performIntro() {
        perform = true;
        screen([
          main(true, [title('换你来表演'), U.el('div.w-mindread-why', { html: JN.md(MIND_HOWTO) })]),
          U.el('div.w-mindread-row', [soft('回到读心术', intro), strong('开始表演', begin)])
        ]);
      }
      function performEnd() {
        var n = L.mind.reveal(answers);
        var big = U.el('div.w-mindread-big.jn-num', { text: '?' });
        var tip = note('先大声说出来，再点下面对一对。');
        var row = U.el('div.w-mindread-row', [button('jn-btn.jn-btn--lg', '对答案', function () {
          big.textContent = String(n);
          big.classList.add('is-final');
          tip.textContent = n ? '和你报的一样吗？' : '六张都说没有：观众想的数不在 1 到 63 里。';
          U.clear(row);
          U.append(row, [soft('回到读心术', intro), strong('再演一次', begin)]);
          ctx.sfx('good'); ctx.haptic(20);
          ctx.done({ text: '表演了一次读心术' });
        })]);
        screen([main(false, [title('现在，报出你的答案'), big, tip]), row]);
      }

      watchSize(ctx, function (w, h) {
        setVars(box, { num: U.clamp(Math.floor(Math.min((w - 40) / 8 / 1.45, (h - 250) / 4 / 2)), 11, 24) });
      });
      if (perform) performIntro(); else intro();
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一张数字卡片，旁边的问号隔一会儿变成一个数 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var picks = [37, 12, 58, 21], at = 0, open = !!ctx.reduced;
      var card = U.el('div.w-mindread-card', L.mind.card(2).slice(0, 16).map(function (n) { return U.el('span.jn-num', { text: String(n) }); }));
      var big = U.el('div.w-mindread-big.jn-num');
      var box = U.el('div.w-mindread-pv', [U.el('div.w-mindread-pvrow', [card, big])]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { u: Math.max(6, Math.floor(Math.min(w / 16, h / 9))) }); });
      function paint() {
        big.textContent = open ? String(picks[at]) : '?';
        big.classList.toggle('is-final', open);
      }
      paint();
      if (!ctx.reduced) S.every(1100, function () {
        open = !open;
        if (!open) at = (at + 1) % picks.length;
        paint();
      });
      return { destroy: function () { S.destroy(); } };
    }
  });

  /* ---------------------------------------------------------------------- *
   * C10. cipher 密码机（凯撒密码）
   * params: { mode: 'decode'（默认，破译一条密文）| 'write'（自己写密文给对方，也能解对方的）,
   *           text: 指定原文（英文，可省略，省略时从内置的句子里随机）, shift: 指定位移 1–25（可省略） }
   * 字母盘：外圈是密文字母（不动），内圈是原文字母；内圈顺时针转 k 格，外圈字母 X 下面对着的就是 X 往回挪 k 位的字母。
   * ---------------------------------------------------------------------- */
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  JN.registerWidget({ id: 'cipher',
    name: '密码机',
    rules: '密文是把每个英文字母在字母表里往后挪了同样的格数。转动字母盘（或者拖滑块、点加减号），直到上面的字读得通，再点“就是它”。外圈是密文字母，内圈是它对应的原文。',
    mount: function (root, params, ctx) {
      var S = makeScope();
      var STEP = 360 / 26;
      var writeMode = params.mode === 'write';
      var plain = '', shift = 1, secret = '', cur = 0, rot = 0;
      var solved = false, hints = 0, custom = false, lastSecs = '', bag = [], drag = null;
      var wShift = 3, cShift = 0;

      /* —— 破译 —— */
      var statusEl = U.el('span.w-cipher-status');
      var timeEl = U.el('span.w-cipher-time.jn-num', { text: '0:00' });
      var textEl = U.el('div.w-cipher-text');
      var outer = U.el('div.w-cipher-ring.is-outer'), inner = U.el('div.w-cipher-ring.is-inner');
      var outerEls = [], innerEls = [];
      ALPHA.split('').forEach(function (ch, i) {
        outerEls[i] = U.el('span', { text: ch });
        innerEls[i] = U.el('span', { text: ch });
        outerEls[i].style.setProperty('--i', String(i));
        innerEls[i].style.setProperty('--i', String(i));
        outer.appendChild(outerEls[i]);
        inner.appendChild(innerEls[i]);
      });
      var hubNum = U.el('b.jn-num', { text: '0' });
      var wheel = U.el('div.w-cipher-wheel', [outer, inner, U.el('div.w-cipher-hub', [U.el('span', { text: '往回挪' }), hubNum, U.el('span', { text: '格' })])]);
      wheel.setAttribute('aria-label', '字母盘：按住转动');
      var range = U.el('input.jn-range.w-cipher-range', { attrs: { type: 'range', min: 0, max: 25, step: 1, value: 0, 'aria-label': '往回挪几格' } });
      var hintBtn = button('jn-btn.jn-btn--ghost', '提示', doHint);
      var okBtn = button('jn-btn.w-cipher-ok', '就是它', confirmGuess);
      var otherBtn = button('jn-btn.jn-btn--ghost', writeMode ? '我来写' : '换一条', function () {
        ctx.sfx('whoosh');
        if (writeMode) show('write'); else nextLine();
      });
      var gameEl = U.el('div.w-cipher-game', [
        U.el('div.w-cipher-panel', [U.el('div.w-cipher-head', [statusEl, timeEl]), textEl]),
        U.el('div.w-cipher-wrap', [wheel]),
        U.el('div.w-cipher-dial', [
          stepBtn('−', '少挪一格', function () { nudge(-1); }),
          range,
          stepBtn('+', '多挪一格', function () { nudge(1); })
        ]),
        U.el('div.w-cipher-ctrl', [hintBtn, okBtn, otherBtn])
      ]);

      /* —— 写密文 —— */
      var wInput = textArea('写一句英文或拼音，比如 WAN FAN CHI SHA', '要加密的话');
      var wShiftEl = U.el('b.jn-num');
      var wOut = U.el('div.w-cipher-out');
      var wMsg = U.el('div.w-cipher-msg');
      var writeEl = U.el('div.w-cipher-write', [
        wInput,
        U.el('div.w-cipher-dial', [
          stepBtn('−', '少挪一格', function () { setWShift(wShift - 1); }),
          U.el('div.w-cipher-shift', ['每个字母往后挪 ', wShiftEl, ' 格']),
          stepBtn('+', '多挪一格', function () { setWShift(wShift + 1); })
        ]),
        wOut,
        wMsg,
        U.el('div.w-cipher-ctrl', [
          button('jn-btn.jn-btn--ghost', '复制密文', function () { copy(/[A-Za-z]/.test(wInput.value) ? caesar(wInput.value.trim(), wShift) : '', wMsg); }),
          button('jn-btn.w-cipher-ok', '交给对方破译', handOver)
        ])
      ]);

      /* —— 解对方的密文（不知道原文，所以只管转，读得通就对了） —— */
      var cInput = textArea('把对方给你的密文打在这里', '要解的密文');
      var cOut = U.el('div.w-cipher-out');
      var cMsg = U.el('div.w-cipher-msg');
      var cRange = U.el('input.jn-range.w-cipher-range', { attrs: { type: 'range', min: 0, max: 25, step: 1, value: 0, 'aria-label': '往回挪几格' } });
      var crackEl = U.el('div.w-cipher-crack', [
        cInput,
        cOut,
        U.el('div.w-cipher-dial', [
          stepBtn('−', '少挪一格', function () { setCShift(cShift - 1); }),
          cRange,
          stepBtn('+', '多挪一格', function () { setCShift(cShift + 1); })
        ]),
        cMsg,
        U.el('div.w-cipher-ctrl', [
          button('jn-btn.jn-btn--ghost', '清空', function () { cInput.value = ''; setCShift(0); }),
          button('jn-btn.jn-btn--ghost', '复制原文', function () { copy(/[A-Za-z]/.test(cInput.value) ? caesar(cInput.value.trim(), -cShift) : '', cMsg); })
        ])
      ]);

      var tabs = segment('w-cipher-tabs', [{ v: 'write', label: '写密文' }, { v: 'crack', label: '解密文' }], 'write', function (v) {
        ctx.sfx('tap');
        show(v);
      });
      var box = U.el('div.w-cipher', [tabs.node, gameEl, writeEl, crackEl]);
      var end = makeEnd('cipher', box);
      var clock = makeClock(S, timeEl);
      root.appendChild(box);

      function stepBtn(label, name, fn) {
        var b = button('w-cipher-step', label, fn);
        b.setAttribute('aria-label', name);
        return b;
      }
      function textArea(placeholder, name) {
        return U.el('textarea.jn-input.w-cipher-input', { attrs: {
          rows: 2, maxlength: 56, placeholder: placeholder, 'aria-label': name,
          autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false'
        } });
      }
      function show(v) {
        gameEl.hidden = v !== 'game';
        writeEl.hidden = v !== 'write';
        crackEl.hidden = v !== 'crack';
        tabs.node.hidden = v === 'game';
        if (v !== 'game') { tabs.set(v); end.hide(); clock.stop(); }
      }
      function copy(text, msgEl) {
        if (!text) { msgEl.textContent = '还没有可以复制的内容'; return; }
        var fail = function () { if (!S.isDead()) msgEl.textContent = '复制不了：长按上面的字，手动复制'; };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              if (S.isDead()) return;
              msgEl.textContent = '已复制';
              ctx.sfx('good');
            }, fail);
          } else fail();
        } catch (e) { fail(); }
      }

      /* —— 破译：逻辑 —— */
      function status(text) { statusEl.textContent = text; }
      function clearHint() {
        outerEls.concat(innerEls).forEach(function (el) { el.classList.remove('is-hint'); });
      }
      function paintGame() {
        var shown = caesar(secret, -cur), present = {};
        textEl.textContent = shown;
        textEl.setAttribute('data-size', shown.length <= 30 ? 'l' : 'm');
        textEl.classList.toggle('is-solved', solved);
        hubNum.textContent = String(cur);
        range.value = String(cur);
        secret.replace(/[A-Z]/g, function (ch) { present[ch] = true; return ch; });
        outerEls.forEach(function (el, i) { el.classList.toggle('is-used', !!present[ALPHA.charAt(i)]); });
        okBtn.disabled = hintBtn.disabled = range.disabled = solved;
      }
      /** r 是连续的“格数”（可以超过 26 或为负）；live 时内圈跟着手指走，不吸附 */
      function setRot(r, live) {
        var next = ((Math.round(r) % 26) + 26) % 26;
        rot = r;
        inner.style.transition = live ? 'none' : '';
        inner.style.transform = 'rotate(' + ((live ? r : Math.round(r)) * STEP).toFixed(2) + 'deg)';
        if (next === cur) return;
        cur = next;
        ctx.sfx('tick'); ctx.haptic(6);
        if (!solved) clock.start();           // 第一次转动才开始计时
        clearHint();
        status(cur ? '往回挪了 ' + cur + ' 格：读得通吗？' : '密文原样');
        paintGame();
      }
      function nudge(d) {
        if (!solved) setRot(Math.round(rot) + d, false);
      }
      function confirmGuess() {
        if (solved) return;
        if (cur !== shift) {
          status(cur ? '这样读不通，再转转' : '这还是密文，先转一转字母盘');
          fx(textEl, 'jn-shake');
          ctx.sfx('bad'); ctx.haptic(30);
          return;
        }
        solved = true;
        clock.stop();
        var secs = (clock.ms() / 1000).toFixed(1) + ' 秒';
        var best = ctx.store.get('best', 0), ms = Math.round(clock.ms());
        var notes = ['用时 ' + secs + '（从第一次转动算起）'];
        if (lastSecs) notes.push('上一条 ' + lastSecs);
        if (!custom && !hints && ms > 0 && (!best || ms < best)) { ctx.store.set('best', ms); if (best) notes.push('最快纪录'); }
        status('原文');
        clearHint();
        paintGame();
        ctx.sfx('win'); ctx.haptic([20, 40, 80]); ctx.confetti();
        end.show({
          tone: 'win',
          title: '破译成功',
          sub: plain,
          more: U.el('div', { text: notes.join(' · ') }),
          buttons: writeMode
            ? [{ label: '回一条密文', on: function () { wInput.value = ''; paintWrite(); show('write'); } }, { label: '看看字母盘', on: function () { end.hide(); } }]
            : [{ label: '下一条', on: nextLine }, { label: '看看字母盘', on: function () { end.hide(); } }]
        });
        lastSecs = secs;
        ctx.done({ win: true, text: '用时 ' + secs });
      }
      /** 提示：告诉他密文的第一个字母其实是什么，并在字母盘上把这两个字母标出来 */
      function doHint() {
        if (solved) return;
        var at = secret.search(/[A-Z]/);
        if (at < 0) return;
        var c = secret.charAt(at), p = plain.charAt(at);
        hints++;
        clearHint();
        outerEls[ALPHA.indexOf(c)].classList.add('is-hint');
        innerEls[ALPHA.indexOf(p)].classList.add('is-hint');
        status('把两个亮起来的字母转到一起：' + c + ' 就是 ' + p);
        ctx.sfx('tick');
      }
      function startGame(text, k, isCustom) {
        plain = text;
        shift = k;
        custom = !!isCustom;
        secret = caesar(plain, shift);
        solved = false; hints = 0; cur = 0;
        setRot(0, false);
        clock.reset();
        end.hide();
        clearHint();
        status(custom ? '对方留的密文：转动字母盘来破译' : '转动字母盘，把密文转成读得通的话');
        paintGame();
        show('game');
      }
      function nextLine() {
        if (!bag.length) bag = U.shuffle(CIPHER_LINES);
        var line = bag.pop();
        if (line === plain && bag.length) { bag.unshift(line); line = bag.pop(); }
        startGame(line, U.randInt(1, 25), false);
      }

      /* —— 写密文 / 解密文：逻辑 —— */
      function paintWrite() {
        var has = /[A-Za-z]/.test(wInput.value);
        wShiftEl.textContent = String(wShift);
        wOut.textContent = has ? caesar(wInput.value, wShift) : '密文会出现在这里。只有英文字母会变，空格和标点不动。';
        wOut.classList.toggle('is-empty', !has);
        wMsg.textContent = has ? '把密文抄给对方，或者直接把手机递过去' : '';
      }
      function setWShift(k) {
        wShift = ((k - 1) % 25 + 25) % 25 + 1;     // 1..25 循环
        ctx.sfx('tick');
        paintWrite();
      }
      function handOver() {
        var text = wInput.value.trim();
        if (!/[A-Za-z]/.test(text)) {
          wMsg.textContent = '先写一句英文或拼音';
          fx(wMsg, 'jn-shake');
          return;
        }
        ctx.sfx('whoosh');
        startGame(text.toUpperCase(), wShift, true);
      }
      function paintCrack() {
        var has = /[A-Za-z]/.test(cInput.value);
        cRange.value = String(cShift);
        cOut.textContent = has ? caesar(cInput.value, -cShift) : '解出来的话会出现在这里。';
        cOut.classList.toggle('is-empty', !has);
        cMsg.textContent = !has ? '' : cShift ? '往回挪了 ' + cShift + ' 格：读得通就对了' : '拖滑块，一格一格试';
      }
      function setCShift(k) {
        cShift = ((k % 26) + 26) % 26;
        ctx.sfx('tick');
        paintCrack();
      }

      /* —— 事件 —— */
      function angleAt(e) {
        var r = wheel.getBoundingClientRect();
        return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      }
      function dragEnd() {
        if (!drag) return;
        drag = null;
        setRot(Math.round(rot), false);      // 松手吸附到整格
      }
      S.on(wheel, 'pointerdown', function (e) {
        if (solved) return;
        e.preventDefault();
        drag = { last: angleAt(e) };
        try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* 合成的事件没有真的指针，忽略 */ }
      });
      S.on(wheel, 'pointermove', function (e) {
        if (!drag || solved) return;
        if (e.pointerType === 'mouse' && e.buttons === 0) { dragEnd(); return; }   // 鼠标在盘外松了手
        var a = angleAt(e), d = a - drag.last;
        d = ((d + 540) % 360) - 180;         // 跨过正左方（±180°）时不跳
        drag.last = a;
        setRot(rot + d / STEP, true);
      });
      S.on(wheel, 'pointerup', dragEnd);
      S.on(wheel, 'pointercancel', dragEnd);
      S.on(range, 'input', function () {
        if (!solved) setRot(Math.round(rot) + (Number(range.value) - cur), false);
      });
      S.on(cRange, 'input', function () { setCShift(Number(cRange.value)); });
      S.on(wInput, 'input', paintWrite);
      S.on(cInput, 'input', paintCrack);

      watchSize(ctx, function (w, h) {
        // 破译界面：上下内边距、文字面板 84、滑块 44、按钮 44、三道间距
        setVars(box, { d: U.clamp(Math.floor(Math.min(w - 24, h - (24 + 84 + 44 + 44 + 8 * 3))), 120, 400) });
      });
      paintWrite();
      paintCrack();
      if (writeMode) show('write');
      else {
        var given = typeof params.text === 'string' && /[A-Za-z]/.test(params.text) ? params.text.trim().slice(0, 56).toUpperCase() : '';
        if (given) startGame(given, Math.round(numParam(params.shift, 1, 25, U.randInt(1, 25))), false);
        else nextLine();
      }
      return { destroy: function () { S.destroy(); } };
    },
    /* 预览：一行密文一格一格转，转到读得通时停一下 */
    preview: function (root, params, ctx) {
      var S = makeScope();
      var PLAIN = 'SLAM DUNK', K = 7;
      var line = U.el('div.w-cipher-pvtext');
      var dial = U.el('div.w-cipher-pvdial.jn-num');
      var box = U.el('div.w-cipher-pv', [U.el('div.w-cipher-pvbox', [line, dial])]);
      root.appendChild(box);
      watchSize(ctx, function (w, h) { setVars(box, { u: Math.max(8, Math.floor(Math.min(w / 8.5, h / 4))) }); });
      var cur = ctx.reduced ? K : 0, rest = 0;
      function paint() {
        line.textContent = caesar(caesar(PLAIN, K), -cur);
        line.classList.toggle('is-solved', cur === K);
        dial.textContent = '往回挪 ' + cur + ' 格';
      }
      paint();
      if (!ctx.reduced) S.every(430, function () {
        if (cur === K) {
          if (++rest < 5) return;
          rest = 0; cur = 0;
        } else cur++;
        paint();
      });
      return { destroy: function () { S.destroy(); } };
    }
  });
})();
