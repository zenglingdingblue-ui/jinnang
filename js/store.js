/* 锦囊 · store（外壳工程师 A）
 * 外壳自己的状态，和对卡片数据的全部查询，都挂在 JN.S 上。不碰 DOM。
 *
 * 状态 S.state：
 *   { v, mode:'me'|'together', fav:{id:时间戳}, done:{id:时间戳},
 *     filter:{ type:'all'|类型id, scenes:[场景...], mins:0|2|10 }, onboarded, doneHinted }
 * 存进 JN.store 的 'state' 键的只有 mode、fav、done、onboarded、doneHinted。
 * 筛选（filter）只活在这一次使用里，不落盘：每次重新打开应用都从「全部」开始，第一张是今日锦囊。
 *
 * 总线事件（JN.bus）：
 *   'mode'    模式变了            'filter'  筛选变了
 *   'records' 收藏或做过变了 { id, kind:'fav'|'done'|'all', on }
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN) return;
  const U = JN.util;
  const S = (JN.S = {});

  /* ---------------- 数据 ---------------- */
  const BY_ID = {};
  const ALL = [];
  (Array.isArray(window.JN_CARDS) ? window.JN_CARDS : []).forEach((c) => {
    if (!c || typeof c.id !== 'string' || !c.title || BY_ID[c.id]) return;
    BY_ID[c.id] = c;
    ALL.push(c);
  });
  ALL.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  S.all = ALL;
  S.byId = (id) => BY_ID[id] || null;

  /** 只给爸爸看的卡片：一起看模式下，整个界面都不能出现 */
  S.isDadOnly = (c) => c.audience === 'dad' || c.type === 'insight' || c.for === 'wife' || c.for === 'self';

  /* ---------------- 状态 ---------------- */
  const SCENE_IDS = JN.SCENES.map((s) => s.id);
  const TYPE_IDS = JN.TYPES.map((t) => t.id);
  function blank() {
    return { v: 1, mode: 'me', fav: {}, done: {}, filter: { type: 'all', scenes: [], mins: 0 }, onboarded: false, doneHinted: false };
  }
  function cleanMap(m) {
    const out = {};
    if (m && typeof m === 'object') Object.keys(m).forEach((k) => { if (typeof m[k] === 'number' && m[k] > 0) out[k] = m[k]; });
    return out;
  }
  function load() {
    const st = blank();
    const raw = JN.store.get('state', null);
    if (!raw || typeof raw !== 'object') return st;
    st.mode = raw.mode === 'together' ? 'together' : 'me';
    st.fav = cleanMap(raw.fav);
    st.done = cleanMap(raw.done);
    st.onboarded = !!raw.onboarded;
    st.doneHinted = !!raw.doneHinted;
    return st;                        // 筛选不读回来：冷启动永远是「全部」
  }
  S.state = load();
  S.save = () => {
    const st = S.state;
    JN.store.set('state', { v: 1, mode: st.mode, fav: st.fav, done: st.done, onboarded: st.onboarded, doneHinted: st.doneHinted });
  };

  /* ---------------- 模式与可见性 ---------------- */
  S.together = () => S.state.mode === 'together';
  S.visible = (c) => !!c && !(S.together() && S.isDadOnly(c));
  S.pool = () => (S.together() ? ALL.filter((c) => !S.isDadOnly(c)) : ALL.slice());
  S.setMode = (mode) => {
    mode = mode === 'together' ? 'together' : 'me';
    if (S.state.mode === mode) return false;
    S.state.mode = mode;
    if (mode === 'together' && S.state.filter.type === 'insight') S.state.filter.type = 'all';
    S.save();
    JN.bus.emit('mode', mode);
    return true;
  };
  /** 这张卡片的来源现在能不能露出来。话匣子、一起做、三人局的来源多半是亲子沟通的研究和指南，
   *  孩子看到会觉得「又有目的」：一起看模式下，卡面上的来源行、来源抽屉、来源汇总都不出现它们的。 */
  const SHY_REF_TYPES = ['talk', 'do', 'trio'];
  S.refsVisible = (c) => !!c && !(S.together() && SHY_REF_TYPES.indexOf(c.type) >= 0);
  /** 当前模式下能出现的类型（一起看时没有「锦囊」） */
  S.types = () => JN.TYPES.filter((t) => !(S.together() && t.id === 'insight'));

  /* ---------------- 筛选 ---------------- */
  S.match = (c, f) => {
    f = f || S.state.filter;
    if (f.type && f.type !== 'all' && c.type !== f.type) return false;
    if (f.scenes && f.scenes.length && !(c.scenes || []).some((s) => f.scenes.indexOf(s) >= 0)) return false;
    if (f.mins && !(c.mins <= f.mins)) return false;
    return true;
  };
  S.filterActive = (f) => { f = f || S.state.filter; return f.type !== 'all' || f.scenes.length > 0 || !!f.mins; };
  /** 除了类型以外，还有几个筛选条件开着（筛选按钮上的小数字） */
  S.filterExtra = () => S.state.filter.scenes.length + (S.state.filter.mins ? 1 : 0);
  S.setFilter = (patch) => {
    const f = S.state.filter;
    if (patch.type != null) f.type = patch.type === 'all' || TYPE_IDS.indexOf(patch.type) >= 0 ? patch.type : 'all';
    if (patch.scenes) f.scenes = patch.scenes.filter((s) => SCENE_IDS.indexOf(s) >= 0);
    if (patch.mins != null) f.mins = patch.mins === 2 || patch.mins === 10 ? patch.mins : 0;
    if (S.together() && f.type === 'insight') f.type = 'all';
    S.save();
    JN.bus.emit('filter', f);
  };
  S.resetFilter = () => S.setFilter({ type: 'all', scenes: [], mins: 0 });
  S.count = (f) => S.pool().filter((c) => S.match(c, f)).length;

  /* ---------------- 今日锦囊与当天牌序（SPEC 2.3） ---------------- */
  S.dayKey = (d) => {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  S.dayOfYear = (d) => {
    d = d || new Date();
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5);
  };
  /** 今日锦囊：当前模式的卡片按固定种子排一个固定顺序，取「今年第几天」那一张 */
  S.today = (d) => {
    const pool = S.pool();
    if (!pool.length) return null;
    const fixed = U.shuffle(pool, U.rng('jinnang-today|' + S.state.mode));
    return fixed[(S.dayOfYear(d) - 1 + fixed.length * 2) % fixed.length];
  };

  /** 尽量让相邻两张不是同一种类型：按剩余数量加权随机；哪一类占了剩下的一半以上，就必须先出它 */
  function spread(list, rnd, lastType) {
    const types = [];
    const buckets = {};
    list.forEach((c) => {
      if (!buckets[c.type]) { buckets[c.type] = []; types.push(c.type); }
      buckets[c.type].push(c);
    });
    const out = [];
    let last = lastType || null;
    for (let rem = list.length; rem > 0; rem--) {
      let maxT = null, maxN = 0, total = 0;
      const elig = [];
      for (let i = 0; i < types.length; i++) {
        const n = buckets[types[i]].length;
        if (!n) continue;
        if (n > maxN) { maxN = n; maxT = types[i]; }
        if (types[i] !== last) { elig.push(types[i]); total += n; }
      }
      let pick = last;
      if (elig.length) {
        if (maxT !== last && maxN * 2 > rem) pick = maxT;
        else {
          let r = rnd() * total;
          pick = elig[elig.length - 1];
          for (let j = 0; j < elig.length; j++) { r -= buckets[elig[j]].length; if (r < 0) { pick = elig[j]; break; } }
        }
      }
      out.push(buckets[pick].shift());
      last = pick;
    }
    return out;
  }
  S._spread = spread;

  let deckCache = { key: '', deck: [] };
  /** 当前模式 + 当前筛选下的牌序：今日锦囊在最前（它符合筛选的话），其余按当天日期打乱 */
  S.deck = (d) => {
    const f = S.state.filter;
    const day = S.dayKey(d);
    const key = [day, S.state.mode, f.type, f.scenes.join(','), f.mins].join('|');
    if (deckCache.key === key) return deckCache.deck;
    const seed = 'jinnang-deck|' + day + '|' + S.state.mode;
    const today = S.today(d);
    const rest = U.shuffle(S.pool(), U.rng(seed)).filter((c) => c !== today && S.match(c, f));
    const head = today && S.match(today, f) ? today : null;
    const deck = (head ? [head] : []).concat(spread(rest, U.rng(seed + '|spread'), head && head.type));
    deckCache = { key: key, deck: deck };
    return deck;
  };

  /* ---------------- 收藏与做过 ---------------- */
  S.isFav = (id) => !!S.state.fav[id];
  S.isDone = (id) => !!S.state.done[id];
  function setRecord(kind, id, on) {
    const map = S.state[kind];
    if (!BY_ID[id] || !!map[id] === !!on) return false;
    if (on) map[id] = Date.now(); else delete map[id];
    S.save();
    JN.bus.emit('records', { id: id, kind: kind, on: !!on });
    return true;
  }
  S.setFav = (id, on) => setRecord('fav', id, on);
  S.setDone = (id, on) => setRecord('done', id, on);
  S.toggleFav = (id) => { const on = !S.isFav(id); setRecord('fav', id, on); return on; };
  S.toggleDone = (id) => { const on = !S.isDone(id); setRecord('done', id, on); return on; };
  /** 收藏或做过的卡片，新的在前；只含当前模式看得到的 */
  S.records = (kind) => {
    const map = S.state[kind] || {};
    return Object.keys(map)
      .filter((id) => BY_ID[id] && S.visible(BY_ID[id]))
      .sort((a, b) => map[b] - map[a])
      .map((id) => ({ card: BY_ID[id], at: map[id] }));
  };
  S.clearRecords = () => {
    S.state.fav = {};
    S.state.done = {};
    S.state.doneHinted = false;
    S.save();
    // 小游戏自己存的成绩（jn.w.<组件id>.*）也一起清掉
    try {
      const ls = window.localStorage;
      const keys = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf('jn.w.') === 0) keys.push(k.slice(3)); }
      keys.forEach((k) => JN.store.remove(k));
    } catch (e) { /* 隐私模式：没有可清的 */ }
    JN.bus.emit('records', { id: null, kind: 'all', on: false });
  };

  /** 进度：做过多少（只数当前模式看得到的卡片） */
  S.progress = () => {
    const pool = S.pool();
    const by = {};
    let done = 0;
    pool.forEach((c) => {
      const row = by[c.type] || (by[c.type] = { total: 0, done: 0 });
      row.total++;
      if (S.state.done[c.id]) { row.done++; done++; }
    });
    return {
      total: pool.length,
      done: done,
      types: S.types().map((t) => ({ type: t, total: (by[t.id] || {}).total || 0, done: (by[t.id] || {}).done || 0 }))
    };
  };

  /* ---------------- 搜索（标题、正文、sub、tags） ---------------- */
  const hay = {};
  function fold(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function index(c) {
    if (hay[c.id]) return hay[c.id];
    const type = JN.typeOf(c.type);
    return (hay[c.id] = {
      title: fold(c.title),
      side: fold([c.sub || '', (c.tags || []).join(' '), type ? type.name : '', (c.scenes || []).join(' ')].join(' ')),
      body: fold(c.body)
    });
  }
  S.search = (q, limit) => {
    const terms = fold(q).split(' ').filter(Boolean);
    if (!terms.length) return [];
    const out = [];
    S.pool().forEach((c) => {
      const h = index(c);
      let score = 0;
      for (let i = 0; i < terms.length; i++) {
        const t = terms[i];
        let s = 0;
        if (h.title.indexOf(t) >= 0) s += h.title.indexOf(t) === 0 ? 7 : 5;
        if (h.side.indexOf(t) >= 0) s += 3;
        if (h.body.indexOf(t) >= 0) s += 2;
        if (!s) return;
        score += s;
      }
      out.push({ card: c, score: score });
    });
    out.sort((a, b) => b.score - a.score || (a.card.id < b.card.id ? -1 : 1));
    return out.slice(0, limit || 60).map((r) => r.card);
  };

  /* ---------------- 救场、场景、工具箱、来源 ---------------- */
  // 只在特定场合才成立的场景。救场选「不限」时，只标了这些场景的卡片不抽
  // （比如在饭桌上抽到“把导航换成你的声音”，或者爸爸出差时才用得上的那几张）。
  const NARROW_SCENES = ['睡前', '车上', '出游', '出差', '球场'];
  S.rescueList = (scene) =>
    S.pool().filter((c) => {
      const sc = c.scenes || [];
      if (sc.indexOf('救场') < 0) return false;
      if (scene) return sc.indexOf(scene) >= 0;
      const rest = sc.filter((s) => s !== '救场');
      return !rest.length || rest.some((s) => NARROW_SCENES.indexOf(s) < 0);
    });
  S.sceneCount = (scene) => S.pool().filter((c) => (c.scenes || []).indexOf(scene) >= 0).length;
  S.typeCount = (type) => S.pool().filter((c) => c.type === type).length;
  /** 某个组件的第一张卡片（当前模式看得到的里面，按 id 顺序） */
  S.firstCardOfWidget = (wid) => S.pool().filter((c) => c.format === 'widget' && c.widget === wid)[0] || null;

  const LV_ORDER = ['实证', '指南', '官方', '权威媒体', '专家意见', '个案', '常识', '经典'];
  S.LV_ORDER = LV_ORDER;
  S.LV_NOTE = {
    '实证': '有研究数据支持',
    '指南': '专业机构的指南',
    '官方': '官方机构的说法',
    '权威媒体': '权威媒体的报道',
    '专家意见': '专家的经验，不是研究结论',
    '个案': '个别案例，仅供参考',
    '常识': '公认的知识',
    '经典': '流传已久的经典题目或玩法'
  };
  S.safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '');
  /** 全部参考来源：从当前模式看得到的卡片里去重汇总（一起看时再去掉话匣子、一起做、三人局的） */
  S.allRefs = () => {
    const map = {};
    const list = [];
    S.pool().forEach((c) => {
      if (!S.refsVisible(c)) return;
      (c.refs || []).forEach((r) => {
        if (!r || !r.t) return;
        const key = S.safeUrl(r.u) || 't:' + r.t;
        let row = map[key];
        if (!row) { row = map[key] = { t: r.t, u: S.safeUrl(r.u), lv: r.lv || '', cards: [] }; list.push(row); }
        if (row.cards.indexOf(c.id) < 0) row.cards.push(c.id);
      });
    });
    const rank = (lv) => { const i = LV_ORDER.indexOf(lv); return i < 0 ? 99 : i; };
    list.sort((a, b) => rank(a.lv) - rank(b.lv) || a.t.localeCompare(b.t, 'zh-Hans-CN'));
    return list;
  };

  /* ---------------- 文案小工具 ---------------- */
  S.minsLabel = (m) => (!m ? '' : m >= 60 ? Math.round(m / 6) / 10 + ' 小时' : m + ' 分钟');
  /** 卡片徽标里的「对象」。只给爸爸的卡片写明只给爸爸（子类已经写了「给太太」「给自己」的就不重复） */
  S.forLabel = (c) => {
    const sub = c.sub || '';
    if (c.for === 'wife') return sub.indexOf('太太') >= 0 ? '' : '给太太看';
    if (c.for === 'self') return sub.indexOf('自己') >= 0 ? '' : '给自己';
    if (S.isDadOnly(c)) return '只给爸爸';
    return c.for === 'three' ? '三个人' : '两个人';
  };
  S.plain = (text) => String(text == null ? '' : text).replace(/\*\*(.+?)\*\*/g, '$1');
  /** 分享文字：【锦囊】标题\n正文\n\n链接 */
  S.shareText = (c) => '【锦囊】' + c.title + '\n' + S.plain(c.body) + '\n\n' + S.linkOf(c);
  /** 分享出去的链接。谁都能看的卡片带上 mode=together：收到的多半是孩子或家人，打开就该是「一起看」，看不到爸爸提示；
   *  只给爸爸的卡片不带（它在一起看里本来就打不开）。 */
  S.linkOf = (c) => String(window.location.href).split('#')[0] + '#c=' + c.id + (S.isDadOnly(c) ? '' : '&mode=together');
  S.ago = (ts) => {
    const now = new Date();
    const d = new Date(ts);
    const mins = Math.floor((now - d) / 6e4);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + ' 分钟前';
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return days + ' 天前';
    return (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + ' 年 ') + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  };
})();
