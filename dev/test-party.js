#!/usr/bin/env node
/* 锦囊 · G3（聚会与家庭工具）的题库与规则检查。用法：node dev/test-party.js
 * 不需要浏览器：在一个只有 window 的沙箱里依次执行 js/core.js 和 js/widgets/party.js，
 * 然后检查挂在 JN._party 下的题库、词库和不碰 DOM 的规则。有一项不过就以非零状态退出。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox = { console, Math, Date, JSON, setTimeout, clearTimeout, setInterval, clearInterval };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('js/core.js'), sandbox, { filename: 'core.js' });
vm.runInContext(read('js/widgets/party.js'), sandbox, { filename: 'party.js' });
const JN = sandbox.JN;
const P = JN._party;

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else failures.push(msg);
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '：得到 ' + JSON.stringify(a) + '，应为 ' + JSON.stringify(b)); }
function dups(list) {
  const seen = new Set(), out = [];
  list.forEach((x) => { if (seen.has(x)) out.push(x); seen.add(x); });
  return out;
}
const len = (s) => Array.from(s).length;

/* 题库里不许出现的词（任务说明的六个，加上 SPEC 4.1 点名的「补课」） */
const BANNED = ['成绩', '作业', '考试', '排名', '身高', '体重', '补课'];
function clean(texts, where) {
  texts.forEach((t) => {
    ok(typeof t === 'string' && t.trim() === t && t.length > 0, where + ' 有空的或带首尾空格的条目：' + JSON.stringify(t));
    BANNED.forEach((w) => ok(String(t).indexOf(w) < 0, where + ' 出现了不该问的词「' + w + '」：' + t));
  });
}

/* ---------- 组件注册 ---------- */
const IDS = ['tacit', 'wheel', 'whois', 'scoreboard', 'timer', 'sketch', 'storydice'];
IDS.forEach((id) => {
  const d = JN.widgets[id];
  ok(!!d, '没有注册组件 ' + id);
  if (!d) return;
  ok(typeof d.mount === 'function', id + ' 缺 mount');
  ok(typeof d.preview === 'function', id + ' 缺 preview');
  ok(typeof d.name === 'string' && d.name, id + ' 缺 name');
  ok(typeof d.rules === 'string' && d.rules.length > 10, id + ' 缺 rules');
});

/* ---------- 默契考验 ---------- */
{
  const lists = Object.keys(P.TACIT);
  const all = [].concat(...lists.map((k) => P.TACIT[k]));
  ok(all.length >= 80, '默契考验题库不足 80 题：' + all.length);
  ['kid', 'couple', 'any'].forEach((k) => ok(Array.isArray(P.TACIT[k]) && P.TACIT[k].length >= 25, '默契考验「' + k + '」不足 25 题'));
  eq(dups(all.map((q) => q[0])), [], '默契考验有重复的题目');
  all.forEach((q) => {
    const opts = q.slice(1);
    ok(opts.length >= 3 && opts.length <= 4, '选项应为 3–4 个：' + q[0] + '（' + opts.length + '）');
    eq(dups(opts), [], '同一题里选项重复：' + q[0]);
    ok(len(q[0]) <= 16, '题目太长（>16 字），小屏会折成三行：' + q[0]);
    opts.forEach((o) => ok(len(o) <= 12, '选项太长（>12 字）：' + o));
  });
  clean([].concat(...all), '默契考验');
  ['kid', 'couple', 'mix'].forEach((pack) => {
    const src = P.TACIT_PACKS[pack];
    ok(Array.isArray(src) && src.length === 2 && P.TACIT[src[0]] && P.TACIT[src[1]], '题包 ' + pack + ' 指向了不存在的题库');
  });
  ok(P.TACIT_PACKS.kid.indexOf('couple') < 0 && P.TACIT_PACKS.mix.indexOf('couple') < 0, '夫妻题不应出现在亲子包和混合包里');
  eq(P.tacitVerdict(5, 5, '甲', '乙').indexOf('全中') >= 0, true, '5/5 的评语');
  eq(P.tacitVerdict(0, 5, '甲', '乙').indexOf('一题没中') >= 0, true, '0/5 的评语');
  [0, 1, 2, 3, 4, 5].forEach((h) => ok(!/\{\w+\}/.test(P.tacitVerdict(h, 5, '甲', '乙')), '评语里有没替换掉的占位符（' + h + '/5）'));
}

/* ---------- 谁最可能 ---------- */
{
  const all = P.WHOIS.daily.concat(P.WHOIS.wild);
  ok(all.length >= 60, '谁最可能不足 60 句：' + all.length);
  ok(P.WHOIS.daily.length >= 25 && P.WHOIS.wild.length >= 25, '谁最可能的两个题包各自应不少于 25 句');
  eq(dups(all), [], '谁最可能有重复');
  all.forEach((s) => {
    ok(!/^谁/.test(s), '句子前面会自动接“谁最可能”，自己不要再带：' + s);
    ok(!/[？?。]$/.test(s), '句末不要标点（界面会补问号）：' + s);
    ok(len(s) <= 22, '太长（>22 字）：' + s);
  });
  clean(all, '谁最可能');

  const names = ['爸爸', '妈妈', '孩子'];
  const first = (arr) => arr[0];
  let v = P.whoisVerdict(names, [0, 3, 0], first);
  eq(v.top, [1], '全票时得票最多的人');
  ok(v.text.indexOf('妈妈') >= 0 && v.text.indexOf('全票') >= 0, '全票的结论：' + v.text);
  v = P.whoisVerdict(names, [2, 0, 1], first);
  eq(v.top, [0], '多数票时得票最多的人');
  ok(v.text.indexOf('爸爸') >= 0 && v.text.indexOf('2') >= 0, '多数票的结论：' + v.text);
  v = P.whoisVerdict(names, [1, 1, 1], first);
  eq(v.top, [0, 1, 2], '一人一票');
  ok(v.text.indexOf('一人一票') >= 0, '一人一票的结论：' + v.text);
  v = P.whoisVerdict(['甲', '乙', '丙', '丁'], [2, 0, 2, 0], first);
  eq(v.top, [0, 2], '四个人两两打平');
  ok(v.text.indexOf('甲 和 丙') >= 0, '并列的结论：' + v.text);
  v = P.whoisVerdict(['甲', '乙'], [1, 1], first);
  eq(v.top, [0, 1], '两个人各一票');
  v = P.whoisVerdict(['甲', '乙'], [2, 0], first);
  ok(v.text.indexOf('全票') >= 0, '两个人都投给同一个人算全票：' + v.text);
  eq(P.whoisVerdict(names, [0, 0, 0], first).top, [], '没人投票');
  [[3, 0, 0], [2, 1, 0], [1, 1, 1], [0, 1, 2]].forEach((c) => {
    [0, 1, 2].forEach((k) => ok(!/\{\w+\}/.test(P.whoisVerdict(names, c, (arr) => arr[k % arr.length]).text), '结论里有没替换掉的占位符'));
  });
}

/* ---------- 两分钟挑战 ---------- */
{
  ok(P.CHALLENGES.length >= 30, '两分钟挑战不足 30 条：' + P.CHALLENGES.length);
  eq(dups(P.CHALLENGES), [], '两分钟挑战有重复');
  P.CHALLENGES.forEach((c) => ok(len(c) <= 32, '挑战太长（>32 字）：' + c));
  clean(P.CHALLENGES, '两分钟挑战');
}

/* ---------- 你画我猜 ---------- */
{
  const cats = Object.keys(P.WORDS);
  const total = cats.reduce((n, k) => n + P.WORDS[k].length, 0);
  ok(total >= 200, '你画我猜词库不足 200 个：' + total);
  ['basketball', 'animal', 'food', 'action', 'english'].forEach((k) => ok(Array.isArray(P.WORDS[k]) && P.WORDS[k].length >= 30, '分类 ' + k + ' 不足 30 个词'));
  cats.forEach((k) => eq(dups(P.WORDS[k]), [], '分类 ' + k + ' 里有重复的词'));
  const mix = P.wordsFor('mix');
  eq(dups(mix), [], '混合分类（所有中文分类合在一起）里有重复的词');
  ok(mix.length === total - P.WORDS.english.length, '混合分类应当等于所有中文分类之和');
  ok(mix.every((w) => w.indexOf('|') < 0 && !/[A-Za-z]{3,}/.test(w)), '混合分类里混进了英文词');
  P.WORDS.english.forEach((w) => {
    const p = w.split('|');
    ok(p.length === 2 && /^[a-z][a-z ]*[a-z]$/.test(p[0]) && /[一-鿿]/.test(p[1]), '英文词应为「english|中文」：' + w);
  });
  eq(dups(P.WORDS.english.map((w) => w.split('|')[0])), [], '英文词重复');
  mix.forEach((w) => ok(len(w) <= 6, '词太长（>6 字），不好画：' + w));
  eq(P.WORD_CATS.map((c) => c[0]).filter((id) => id !== 'mix').sort(), cats.slice().sort(), '分类清单和词库对不上');
  cats.forEach((k) => ok(P.wordsFor(k) === P.WORDS[k], 'wordsFor(' + k + ') 应返回该分类'));
  clean([].concat(...cats.map((k) => P.WORDS[k])), '你画我猜');
}

/* ---------- 故事骰子 ---------- */
{
  /* 贴纸名以校验脚本里的 ART 清单为准（它和 SPEC 5.3 一致） */
  const py = read('tools/validate_cards.py');
  const m = /ART = \[(.*?)\]/s.exec(py);
  const ART = m ? m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1)) : [];
  ok(ART.length === 70, '没能从 tools/validate_cards.py 读到 70 个贴纸名（读到 ' + ART.length + '）');
  const themes = Object.keys(P.DICE);
  ['any', 'hoop', 'space', 'spy'].forEach((t) => ok(themes.indexOf(t) >= 0, '缺少骰子主题 ' + t));
  let faces = 0;
  themes.forEach((t) => {
    const d = P.DICE[t];
    ok(typeof d.name === 'string' && d.name, '主题 ' + t + ' 缺名字');
    ok(Array.isArray(d.dice) && d.dice.length === 6, '主题 ' + t + ' 应有 6 颗骰子');
    ok(Array.isArray(d.openers) && d.openers.length >= 3, '主题 ' + t + ' 的开头句不足 3 句');
    eq(dups(d.openers), [], '主题 ' + t + ' 的开头句重复');
    const words = [];
    d.dice.forEach((die, i) => {
      ok(Array.isArray(die) && die.length === 6, '主题 ' + t + ' 第 ' + (i + 1) + ' 颗骰子应有 6 个面');
      die.forEach((f) => {
        const p = String(f).split('|');
        faces++;
        words.push(p[0]);
        ok(p.length <= 2 && p[0], '骰子面的写法不对：' + f);
        ok(len(p[0]) <= 9, '骰子面上的词太长（>9 字）：' + p[0]);
        if (p[1]) ok(ART.indexOf(p[1]) >= 0, '主题 ' + t + ' 用了清单里没有的贴纸：' + p[1]);
      });
    });
    eq(dups(words), [], '主题 ' + t + ' 里有重复的面');
    clean(words.concat(d.openers), '故事骰子 ' + t);
  });
  ok(faces === themes.length * 36, '骰子面总数应为 主题数 × 36');
}

/* ---------- 转盘 ---------- */
{
  ['who', 'dinner', 'weekend', 'forfeit'].forEach((k) => {
    const p = P.WHEEL[k];
    ok(p && p.name && p.title, '转盘预设 ' + k + ' 不完整');
    if (!p || k === 'who') return;
    ok(p.items.length >= 6 && p.items.length <= 12, '转盘预设 ' + k + ' 的选项应为 6–12 个：' + p.items.length);
    const labels = p.items.map((s) => s.split('|')[0]);
    eq(dups(labels), [], '转盘预设 ' + k + ' 有重复的选项');
    labels.forEach((l) => ok(len(l) <= 8, '盘面上的词太长（>8 字）：' + l));
    clean([].concat(...p.items.map((s) => s.split('|'))), '转盘 ' + k);
  });
  ['weekend', 'forfeit'].forEach((k) => P.WHEEL[k].items.forEach((s) => ok(s.split('|').length === 2 && len(s.split('|')[1]) >= 6, k + ' 的每一项都要有具体的说明：' + s)));

  /* 指针在正上方：盘面逆时针拨半格（角度为负），指针落在第 0 格中间；顺时针拨半格落在最后一格 */
  const TAU = Math.PI * 2;
  [3, 4, 6, 12].forEach((n) => {
    const seg = TAU / n;
    eq(P.wheelIndex(-seg / 2, n), 0, 'wheelIndex n=' + n + ' 逆时针半格');
    eq(P.wheelIndex(seg / 2, n), n - 1, 'wheelIndex n=' + n + ' 顺时针半格');
    eq(P.wheelIndex(-seg * 1.5, n), 1, 'wheelIndex n=' + n + ' 逆时针一格半');
    eq(P.wheelIndex(-seg / 2 + TAU * 5, n), 0, 'wheelIndex 多转五整圈结果不变');
    eq(P.wheelIndex(-seg / 2 - TAU * 3, n), 0, 'wheelIndex 反向三整圈结果不变');
    for (let k = 0; k < n; k++) eq(P.wheelIndex(-(k + 0.5) * seg, n), k, 'wheelIndex n=' + n + ' 第 ' + k + ' 格中间');
  });
  /* 转很多次，每一格被转到的机会应当大致均等（这里只验证取格子的函数没有偏向） */
  const hits = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60000; i++) hits[P.wheelIndex((i + 0.5) / 60000 * TAU * 7, 6)]++;
  ok(hits.every((h) => h === 10000), '均匀扫过七整圈，六格应各占 1/6：' + hits.join(','));

  /* 减速的解析解：dω/dt = −(K·ω + C0)。验证初值、停下的时刻，以及“转过的角”的导数确实是角速度 */
  const M = P.wheelMotion;
  [8, 10, 15, 20, 26].forEach((w0) => {
    const T = M.stopTime(w0);
    ok(T > 3 && T < 7, 'ω0=' + w0 + ' 应在 3–7 秒内停下：' + T.toFixed(2));
    ok(Math.abs(M.speed(w0, 0) - w0) < 1e-9, 't=0 时角速度应等于 ω0');
    ok(Math.abs(M.speed(w0, T)) < 1e-9, '停下的那一刻角速度应为 0');
    ok(Math.abs(M.travel(w0, 0)) < 1e-12, 't=0 时还没转');
    ok(M.travel(w0, T) > TAU * 1.5, 'ω0=' + w0 + ' 至少转一圈半：' + (M.travel(w0, T) / TAU).toFixed(2) + ' 圈');
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const t = T * i / 20;
      ok(M.travel(w0, t) > prev, '转过的角应一直增加');
      prev = M.travel(w0, t);
      if (i > 0 && i < 20) {
        const d = (M.travel(w0, t + 1e-5) - M.travel(w0, t - 1e-5)) / 2e-5;
        ok(Math.abs(d - M.speed(w0, t)) < 1e-5, '转过的角对时间求导应等于角速度（t=' + t.toFixed(2) + '）');
        const a = (M.speed(w0, t + 1e-5) - M.speed(w0, t - 1e-5)) / 2e-5;
        ok(Math.abs(a + (0.55 * M.speed(w0, t) + 0.7)) < 1e-4, '角加速度应等于 −(K·ω + C0)');
      }
    }
  });
}

/* ---------- 计分板 · 两队计分 ---------- */
{
  const S = P.score;
  let st = S.create(11);
  eq([st.s, st.target, st.flip], [[0, 0], 11, false], '新开一局');
  ok(S.add(st, 0, 2) && S.add(st, 1, 3) && S.add(st, 0, 1), '正常加分');
  eq(st.s, [3, 3], '2+1 对 3');
  ok(!S.add(st, 0, 4) && !S.add(st, 2, 1) && !S.add(st, 0, 0) && !S.add(st, 0, -1), '不合法的加分应被拒绝');
  eq(st.s, [3, 3], '被拒绝的加分不改比分');
  ok(S.undo(st), '撤销');
  eq(st.s, [2, 3], '撤销最后一次 +1');
  ok(S.undo(st) && S.undo(st), '连续撤销');
  eq([st.s, st.hist.length], [[0, 0], 0], '全部撤销回到 0:0');
  ok(!S.undo(st), '没有可撤销的时候返回 false');
  eq(st.s, [0, 0], '空撤销不会减成负数');

  st = S.create(11);
  for (let i = 0; i < 3; i++) S.add(st, 0, 3);
  eq(S.winner(st), -1, '9 分还没赢');
  S.add(st, 1, 2);
  ok(S.add(st, 0, 2), '加到 11 分');
  eq([st.s, S.winner(st)], [[11, 2], 0], '先到 11 分获胜');
  ok(!S.add(st, 1, 3) && !S.add(st, 0, 1), '分出胜负后不能再加分');
  ok(S.undo(st), '获胜的那一球也能撤销');
  eq([st.s, S.winner(st)], [[9, 2], -1], '撤销后比赛继续');
  S.add(st, 0, 3);
  eq([st.s, S.winner(st)], [[12, 2], 0], '9+3 超过 11 也算获胜');
  S.swap(st);
  eq([st.flip, st.s], [true, [12, 2]], '交换场地只换边，不换比分');
  S.reset(st);
  eq([st.s, st.hist, st.flip], [[0, 0], [], true], '清零：比分和记录归零，场地不变');

  st = S.create(21);
  for (let i = 0; i < 6; i++) S.add(st, 1, 3);
  eq(S.winner(st), -1, '21 分制打到 18 还没赢');
  S.add(st, 1, 3);
  eq(S.winner(st), 1, '21 分制打到 21 获胜');
  st = S.create(0);
  for (let i = 0; i < 20; i++) S.add(st, 0, 3);
  eq([st.s[0], S.winner(st)], [60, -1], '不限分时永远没有胜者');
  eq(S.create(15).target, 11, '不认识的目标分回到 11');
  /* 中途把“不限分”改成 11：两边都过线时分高的赢，同分不判 */
  st = S.create(0); st.s = [14, 12]; st.target = 11;
  eq(S.winner(st), 0, '两边都过线，分高的一方获胜');
  st.s = [12, 12];
  eq(S.winner(st), -1, '两边同分不判胜负');
}

/* ---------- 计分板 · 投篮接龙记字 ---------- */
{
  const H = P.horse;
  let st = H.create([0, 2], '输了');
  eq([H.len(st), st.got, H.winner(st)], [2, [0, 0], -1], '两个人、两个字');
  ok(H.miss(st, 0), '记一个字');
  eq([st.got, H.out(st, 0), H.winner(st)], [[1, 0], false, -1], '一个字还没出局');
  H.miss(st, 1);
  ok(H.miss(st, 0), '第二个字');
  eq([st.got, H.out(st, 0), H.alive(st), H.winner(st)], [[2, 1], true, [1], 1], '先凑满“输了”的人出局，另一个人赢');
  ok(!H.miss(st, 0) && !H.miss(st, 1), '分出胜负后不能再记字');
  ok(H.undo(st), '撤销');
  eq([st.got, H.out(st, 0), H.winner(st)], [[1, 1], false, -1], '撤销后回到比赛中');
  ok(!H.miss(st, 5) && !H.miss(st, -1), '不存在的玩家');

  st = H.create([0, 1, 2], 'HORSE');
  eq(H.len(st), 5, 'HORSE 是五个字母');
  for (let i = 0; i < 5; i++) H.miss(st, 1);
  eq([H.out(st, 1), H.alive(st), H.winner(st)], [true, [0, 2], -1], '三个人：一人出局，比赛继续');
  ok(!H.miss(st, 1), '已经出局的人不再记字');
  eq(st.got[1], 5, '出局的人字数不再增加');
  for (let i = 0; i < 4; i++) H.miss(st, 0);
  eq(H.winner(st), -1, '差一个字还没出局');
  H.miss(st, 0);
  eq([H.alive(st), H.winner(st)], [[2], 2], '三个人：剩下的最后一个人赢');
  for (let i = 0; i < 10; i++) H.undo(st);
  eq([st.got, st.hist.length], [[0, 0, 0], 0], '全部撤销');
  ok(!H.undo(st), '没有可撤销的');
  eq(H.len(H.create([0, 2], '请喝水')), 3, '中文按字数算');
}

/* ---------- 计分板 · 罚球赛 ---------- */
{
  const F = P.ft;
  eq(F.stats([]), { made: 0, att: 0, pct: 0, streak: 0, best: 0 }, '还没投');
  eq(F.stats([1, 1, 0, 1]), { made: 3, att: 4, pct: 75, streak: 1, best: 2 }, '4 投 3 中');
  eq(F.stats([1, 1, 0]).pct, 67, '2/3 四舍五入到 67%');
  eq(F.stats([1, 0, 0]).pct, 33, '1/3 四舍五入到 33%');
  eq(F.stats([0, 0, 0]), { made: 0, att: 3, pct: 0, streak: 0, best: 0 }, '一个没进');
  eq(F.stats([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), { made: 10, att: 10, pct: 100, streak: 10, best: 10 }, '十投十中');
  eq(F.stats([0, 1, 1, 1, 0, 1, 1]), { made: 5, att: 7, pct: 71, streak: 2, best: 3 }, '眼下连中 2，最长连中 3');
  eq(F.stats([1, 1, 1, 0]).streak, 0, '刚投丢，眼下连中归零');

  let st = F.create([0, 2], 3);
  [1, 0, 1].forEach((x) => ok(F.shoot(st, x), '第一个人出手'));
  eq([st.res[0], st.cur, F.finished(st, 0), F.over(st)], [[1, 0, 1], 1, true, false], '第一个人投完，自动轮到第二个人');
  F.shoot(st, 1); F.shoot(st, 1);
  eq(F.over(st), false, '第二个人还差一投');
  F.shoot(st, 1);
  eq([F.over(st), F.leaders(st), F.stats(st.res[1]).pct], [true, [1], 100], '第二个人三投三中获胜');
  ok(!F.shoot(st, 1), '都投完了不能再投');
  ok(F.undo(st), '撤销最后一投');
  eq([st.res[1], st.cur, F.over(st)], [[1, 1], 1, false], '撤销后轮到被撤回的那个人');
  F.shoot(st, 0);
  eq(F.leaders(st), [0, 1], '2/3 对 2/3 并列');
  for (let i = 0; i < 6; i++) F.undo(st);
  eq([st.res, st.cur, st.hist.length], [[[], []], 0, 0], '全部撤销回到第一个人');
  ok(!F.undo(st), '没有可撤销的');

  /* 可以随时切换投篮的人（界面上点名字），投完的人会被跳过 */
  st = F.create([0, 1, 2], 2);
  st.cur = 2; F.shoot(st, 1); F.shoot(st, 1);
  eq(st.cur, 0, '最后一位先投完，轮回第一位');
  F.shoot(st, 0); F.shoot(st, 0);
  eq(st.cur, 1, '第一位投完，轮到第二位');
  F.shoot(st, 1); F.shoot(st, 0);
  eq([F.over(st), F.leaders(st)], [true, [2]], '三个人都投完');
  st = F.create([2], 10);
  for (let i = 0; i < 10; i++) F.shoot(st, i % 2);
  eq([F.over(st), F.stats(st.res[0]).pct, F.leaders(st)], [true, 50, [0]], '一个人练投');
}

/* ---------- 卡片：每个组件至少一张，数量正好 ---------- */
{
  const cards = JSON.parse(read('content/w-party.json'));
  eq(cards.length, 15, 'w-party.json 应正好 15 张');
  eq(cards.filter((c) => c.type === 'play').map((c) => c.id), [301, 302, 303, 304, 305, 306].map((n) => 'play-' + n), 'play 的 id');
  eq(cards.filter((c) => c.type === 'trio').map((c) => c.id), [101, 102, 103, 104, 105, 106, 107, 108, 109].map((n) => 'trio-' + n), 'trio 的 id');
  IDS.forEach((id) => ok(cards.some((c) => c.widget === id), '组件 ' + id + ' 没有卡片'));
  cards.forEach((c) => {
    ok(c.format === 'widget' && IDS.indexOf(c.widget) >= 0, c.id + ' 应是本组的互动组件卡片');
    if (c.type === 'trio') ok(c.for === 'three', c.id + ' 是三人局，for 应为 three');
    const p = c.params || {};
    if (c.widget === 'tacit') ok(!!P.TACIT_PACKS[p.pack], c.id + ' 的题包不存在：' + p.pack);
    if (c.widget === 'wheel') ok(!!P.WHEEL[p.preset], c.id + ' 的转盘预设不存在：' + p.preset);
    if (c.widget === 'whois') ok(['mix', 'daily', 'wild'].indexOf(p.pack) >= 0, c.id + ' 的题包不存在：' + p.pack);
    if (c.widget === 'sketch') ok(p.category === 'mix' || !!P.WORDS[p.category], c.id + ' 的词库分类不存在：' + p.category);
    if (c.widget === 'storydice') ok(!!P.DICE[p.theme], c.id + ' 的骰子主题不存在：' + p.theme);
    if (c.widget === 'scoreboard') ok(['score', 'horse', 'ft'].indexOf(p.mode) >= 0, c.id + ' 的计分板模式不存在：' + p.mode);
  });
  const couple = cards.filter((c) => c.params && c.params.pack === 'couple');
  ok(couple.length === 1 && couple[0].audience === 'dad' && couple[0].for === 'wife' && couple[0].scenes.length === 0, '夫妻题包的卡片应是 audience=dad、for=wife、scenes=[]');
}

/* ---------- 汇总 ---------- */
const count = (o) => Object.keys(o).reduce((n, k) => n + o[k].length, 0);
console.log('题库：默契考验 ' + count(P.TACIT) + ' 题（亲子 ' + P.TACIT.kid.length + ' / 通用 ' + P.TACIT.any.length + ' / 夫妻 ' + P.TACIT.couple.length + '），' +
  '谁最可能 ' + count(P.WHOIS) + ' 句，两分钟挑战 ' + P.CHALLENGES.length + ' 条，你画我猜 ' + count(P.WORDS) + ' 个词，' +
  '故事骰子 ' + Object.keys(P.DICE).length + ' 个主题 × 36 面，转盘 ' + Object.keys(P.WHEEL).length + ' 个预设');
if (failures.length) {
  failures.forEach((f) => console.log('  不通过  ' + f));
  console.log('test-party：' + failures.length + ' 项不通过，' + passed + ' 项通过');
  process.exit(1);
}
console.log('test-party：' + passed + ' 项检查全部通过');
