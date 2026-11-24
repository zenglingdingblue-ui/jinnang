/* 锦囊 · app-views（外壳工程师 A）
 * 三个页面：发现、收藏、我的。挂在 JN.views 上，每个页面一个 render(box)：整页重画。
 * 页面里出现的卡片一律经过 JN.S 的可见性过滤（一起看模式下不会出现只给爸爸的内容）。
 * 需要外壳配合的动作都走 JN.app（gotoCard / browse / openStage / env / sw …），在点击时才取用。
 */
(function () {
  'use strict';
  const JN = window.JN;
  if (!JN || !JN.card) return;
  const U = JN.util;
  const S = JN.S;
  const ui = JN.ui;
  const C = JN.card;
  const V = (JN.views = {});
  const app = () => JN.app || {};

  function btn(spec, label, icon, onClick, attrs) {
    return U.el('button.' + spec, { attrs: Object.assign({ type: 'button' }, attrs || {}), on: { click: onClick } }, [
      icon ? ui.icon(icon) : null,
      U.el('span', { text: label })
    ]);
  }
  function pageHead(title, sub) {
    return U.el('header.page__head', [U.el('h1.page__title', { text: title }), sub ? U.el('p.page__sub', { text: sub }) : null]);
  }

  /* ================= 发现 ================= */
  V.discover = {
    query: '',
    render(box) {
      const self = this;
      U.clear(box);
      const input = U.el('input.jn-input.search__input', {
        attrs: { type: 'search', placeholder: '搜标题、内容、标签', 'aria-label': '搜索卡片', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search' }
      });
      input.value = self.query;
      const clear = U.el('button.search__clear', { attrs: { type: 'button', 'aria-label': '清空搜索', hidden: '' } }, [ui.icon('close')]);
      const results = U.el('div.search__results', { attrs: { hidden: '', 'aria-live': 'polite' } });
      const browse = U.el('div.discover__browse');

      function run() {
        const q = input.value;
        self.query = q;
        const has = !!q.trim();
        clear.hidden = !has;
        results.hidden = !has;
        browse.hidden = has;
        if (!has) { U.clear(results); return; }
        const list = S.search(q, 60);
        U.clear(results);
        if (!list.length) {
          results.appendChild(ui.empty('没有找到「' + q.trim().slice(0, 12) + '」', '换个词试试：篮球、车上、数学、睡前……'));
          return;
        }
        results.appendChild(U.el('p.search__count', { text: '找到 ' + list.length + ' 张' + (list.length >= 60 ? '（只列出前 60 张）' : '') }));
        const ul = U.el('div.clist');
        list.forEach((c) => ul.appendChild(ui.cardRow(c, { onClick: (card) => app().gotoCard(card.id) })));
        results.appendChild(ul);
      }
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      clear.addEventListener('click', () => { input.value = ''; run(); input.focus(); });

      // 类型入口
      const types = U.el('div.tiles');
      S.types().forEach((t) => {
        types.appendChild(U.el('button.tile', { attrs: { type: 'button', 'data-type': t.id }, on: { click: () => { JN.sfx('tap'); app().browse({ type: t.id, scenes: [], mins: 0 }); } } }, [
          U.el('span.tile__ic', { attrs: { 'aria-hidden': 'true' } }, [ui.typeIcon(t.id)]),
          U.el('span.tile__name', { text: t.name }),
          U.el('span.tile__blurb', { text: t.blurb }),
          U.el('span.tile__n.jn-num', { text: S.typeCount(t.id) + ' 张' })
        ]));
      });
      // 场景入口
      const scenes = U.el('div.scenes');
      JN.SCENES.forEach((sc) => {
        const n = S.sceneCount(sc.id);
        scenes.appendChild(U.el('button.scene', { attrs: { type: 'button', 'data-scene': sc.id }, on: { click: () => { JN.sfx('tap'); app().browse({ type: 'all', scenes: [sc.id], mins: 0 }); } } }, [
          ui.sceneIcon(sc.id),
          U.el('span.scene__name', { text: sc.id }),
          U.el('span.scene__n.jn-num', { text: String(n) })
        ]));
      });
      // 工具箱：所有已注册的互动组件，点了直接进舞台
      const ids = Object.keys(JN.widgets || {});
      const tools = U.el('div.tools');
      ids.forEach((id) => {
        const def = JN.widgets[id];
        const first = S.firstCardOfWidget(id);
        tools.appendChild(U.el('button.tool', { attrs: { type: 'button', 'data-widget': id }, on: { click: () => app().openStage(first ? first.id : null, id) } }, [
          U.el('span.tool__name', { text: def.name || id }),
          first ? U.el('span.tool__sub', { text: first.title }) : null,
          ui.icon('play', 'tool__go')
        ]));
      });

      U.append(browse, [
        ui.section('按类型', types),
        ui.section('按场景', scenes),
        ui.section('工具箱', [
          U.el('p.sec__note', { text: ids.length ? '所有小游戏和小工具，点了直接开始。' : '小游戏还没装进来。' }),
          ids.length ? tools : null
        ])
      ]);
      U.append(box, [
        pageHead('发现'),
        U.el('div.search', [ui.icon('search', 'search__ic'), input, clear]),
        results,
        browse
      ]);
      run();
    }
  };

  /* ================= 收藏 ================= */
  V.saved = {
    tab: 'fav',
    render(box) {
      const self = this;
      U.clear(box);
      const fav = S.records('fav');
      const done = S.records('done');
      const seg = U.el('div.jn-seg.saved__seg', { attrs: { role: 'tablist' } });
      [['fav', '收藏', fav.length], ['done', '做过', done.length]].forEach((it) => {
        seg.appendChild(U.el('button', {
          text: it[1] + (it[2] ? ' ' + it[2] : ''),
          attrs: { type: 'button', role: 'tab', 'data-tab': it[0], 'aria-selected': String(self.tab === it[0]) },
          cls: self.tab === it[0] ? 'is-on' : '',
          on: { click: () => { if (self.tab !== it[0]) { self.tab = it[0]; JN.sfx('tick'); self.render(box); } } }
        }));
      });
      const list = self.tab === 'fav' ? fav : done;
      const body = U.el('div.clist');
      list.forEach((r) => {
        const isFav = self.tab === 'fav';
        const act = U.el('button.crow__act', { attrs: { type: 'button', 'aria-label': isFav ? '取消收藏' : '取消做过' } }, [ui.icon(isFav ? 'heart-fill' : 'check-fill')]);
        act.addEventListener('click', () => {
          JN.sfx('tap');
          if (isFav) S.setFav(r.card.id, false); else S.setDone(r.card.id, false);
        });
        body.appendChild(ui.cardRow(r.card, {
          sub: ui.cardSub(r.card) + ' · ' + S.ago(r.at),
          act: act,
          onClick: (card) => app().gotoCard(card.id)
        }));
      });
      U.append(box, [
        pageHead('收藏'),
        seg,
        list.length ? body : self.tab === 'fav'
          ? ui.empty('还没有收藏', '刷到想留着的，点右边的心。')
          : ui.empty('还没有做过的', '聊过、玩过、做过一张，点右边的「做过」记一笔。')
      ]);
    }
  };

  /* ================= 我的 ================= */
  function progressSec() {
    const p = S.progress();
    const pct = p.total ? p.done / p.total : 0;
    const R = 34;
    const CIRC = 2 * Math.PI * R;
    const ring = U.svg('svg', { class: 'ring', viewBox: '0 0 80 80', 'aria-hidden': 'true' }, [
      U.svg('circle', { class: 'ring__bg', cx: 40, cy: 40, r: R }),
      U.svg('circle', { class: 'ring__fg', cx: 40, cy: 40, r: R, 'stroke-dasharray': CIRC.toFixed(1), 'stroke-dashoffset': (CIRC * (1 - pct)).toFixed(1), transform: 'rotate(-90 40 40)' })
    ]);
    const rows = U.el('div.prog__rows');
    p.types.forEach((r) => {
      if (!r.total) return;
      const bar = U.el('span.prog__bar', [U.el('i')]);
      bar.firstChild.style.width = Math.round((r.done / r.total) * 100) + '%';
      rows.appendChild(U.el('div.prog__row', { attrs: { 'data-type': r.type.id } }, [
        U.el('span.prog__name', { text: r.type.name }),
        bar,
        U.el('span.prog__n.jn-num', { text: r.done + ' / ' + r.total })
      ]));
    });
    return ui.section('做过的', [
      U.el('div.prog__head', [
        ring,
        U.el('div.prog__sum', [
          U.el('div.prog__big', [U.el('span.jn-big', { text: String(p.done) }), U.el('span.prog__of', { text: ' / ' + p.total + ' 张' })]),
          U.el('p.jn-muted', { text: p.done ? (p.done >= p.total && p.total ? '全做过了。厉害。' : '不用赶进度，想起来翻一张就好。') : '还没开始。挑一张，今天就用。' })
        ])
      ]),
      rows
    ], 'sec--prog');
  }

  function settingsSec() {
    return ui.section('设置', U.el('div.rows', [
      ui.toggle('音效', '操作时的小声音，翻页不出声', JN.settings.sfx, (v) => { JN.setSetting('sfx', v); if (v) JN.sfx('pop'); }),
      ui.toggle('震动', navigator.vibrate ? '点按时轻轻震一下' : '这台设备的浏览器不支持震动', JN.settings.haptic, (v) => { JN.setSetting('haptic', v); if (v) JN.haptic(24); })
    ]));
  }

  /** 设计师的插图还没到时的退路：用几个方块画一部小手机，把要点的那个按钮标出来 */
  function mockPhone(kind) {
    return U.el('div.mock.mock--' + kind, { attrs: { 'aria-hidden': 'true' } }, [
      U.el('span.mock__bar', [U.el('i'), U.el('i'), U.el('i.mock__hot', { text: kind === 'ios' ? '↑' : '⋮' })]),
      U.el('span.mock__menu', [U.el('i'), U.el('i.mock__hot', { text: '添加到主屏幕' }), U.el('i')])
    ]);
  }
  function installSec() {
    const env = app().env ? app().env() : {};
    if (env.standalone) {
      return ui.section('安装到主屏幕', U.el('div.jn-panel.install__ok', [
        ui.icon('check'), U.el('span', { text: '已经装在主屏幕上了。以后从图标打开，断网也能用。' })
      ]));
    }
    const guide = U.el('div.install__guide');
    const steps = {
      ios: ['用 Safari 打开这个页面', '点底部工具栏的「分享」按钮', '往下滑，选「添加到主屏幕」', '点右上角的「添加」'],
      android: ['用 Chrome 打开这个页面', '点右上角的「⋮」菜单', '选「添加到主屏幕」或「安装应用」', '在弹出的确认框里点「安装」']
    };
    function paint(kind) {
      U.clear(guide);
      guide.appendChild(U.el('div.install__fig', [ui.graphic('g-install-' + kind, 240, 180) || mockPhone(kind)]));
      guide.appendChild(U.el('ol.install__steps', steps[kind].map((s) => U.el('li', { text: s }))));
    }
    const first = env.android ? 'android' : 'ios';
    const pick = ui.chips([{ value: 'ios', label: 'iPhone / iPad' }, { value: 'android', label: '安卓' }], first, false, paint);
    paint(first);
    return ui.section('安装到主屏幕', [
      U.el('p.sec__note', { text: '装好以后它就像一个普通应用：从主屏幕的图标打开，全屏，没有网也能用。' }),
      env.wechat ? U.el('p.install__tip', { text: '现在是在微信里打开的。先点右上角「···」，选「在浏览器打开」，再按下面的步骤装。' }) : null,
      env.canPrompt ? btn('jn-btn.jn-btn--block.install__btn', '安装到主屏幕', 'install', () => { JN.sfx('tap'); app().promptInstall(); }) : null,
      pick.el,
      guide
    ], 'sec--install');
  }

  function offlineSec() {
    const sw = (app().sw && app().sw()) || { state: 'unsupported' };
    const text = {
      unsupported: '这个浏览器不支持离线缓存，需要联网使用。',
      file: '现在是直接打开文件的方式，离线缓存没有启用（放到网站上才会生效）。',
      pending: '正在把内容存到这台手机里……',
      ready: '离线可用。' + (sw.count ? '已经存好 ' + sw.count + ' 个文件。' : ''),
      update: '有新内容已经准备好，点「更新」换上。',
      error: '离线缓存没有装上。联网时不影响使用。'
    }[sw.state] || '';
    const online = navigator.onLine !== false;
    return ui.section('离线与版本', [
      U.el('div.jn-panel.offline', { attrs: { 'data-state': sw.state } }, [
        U.el('div.offline__line', [ui.icon(sw.state === 'ready' ? 'check' : 'offline'), U.el('span', { text: text })]),
        U.el('div.offline__meta.jn-muted', {
          text: '版本 ' + JN.version + (sw.version ? ' · 内容 ' + sw.version : '') + ' · ' + S.all.length + ' 张卡片 · 现在' + (online ? '有网络' : '没有网络')
        })
      ]),
      sw.state === 'update'
        ? btn('jn-btn.jn-btn--block', '更新', 'refresh', () => app().applyUpdate())
        : sw.state === 'unsupported' || sw.state === 'file' ? null
          : btn('jn-btn.jn-btn--ghost.jn-btn--block.offline__check', '检查更新', 'refresh', () => { JN.sfx('tap'); app().checkUpdate(); })
    ], 'sec--offline');
  }

  function refsSec() {
    const refs = S.allRefs();
    return ui.section('参考来源', [
      U.el('p.sec__note', { text: '有出处的内容都标了来源，证据是什么强度就标什么强度。' }),
      btn('row.row--link', '全部参考来源 · ' + refs.length + ' 条', 'book', () => {
        JN.sfx('tap');
        ui.sheet({ title: '全部参考来源', name: 'allrefs', cls: 'sheet--tall', body: refs.length ? [C.refList(refs, { count: true }), C.lvLegend(refs)] : [U.el('p.jn-muted', { text: '现在的卡片里还没有带来源的。' })] });
      })
    ]);
  }

  function aboutSec() {
    const lines = [
      '这是给一家人用的小工具：365 个小主意。冷场的时候翻一张，能马上说出口，或者马上一起做。',
      '它不说教。给孩子看的每一张，好玩就是全部目的。',
      '所有记录——收藏、做过、小游戏的成绩——都只存在这台手机里。没有账号，没有统计，不上传任何东西。',
      '健康和发育相关的内容，只是给家长看的读物，不能代替医生面诊。',
      '有来源的内容都标了来源；证据有多强就标多强，是研究、是指南，还是某位专家的经验，照实写。'
    ];
    return ui.section('关于与说明', U.el('div.jn-panel.about', [
      U.el('div.about__brand', [ui.graphic('g-logo', 120, 120, 'about__logo'), U.el('strong', { text: '锦囊' })]),
      U.el('div.about__text', lines.map((t) => U.el('p', { text: t })))
    ]), 'sec--about');
  }

  function clearSec() {
    const box = U.el('div.clear');
    function idle() {
      U.clear(box);
      box.appendChild(btn('jn-btn.jn-btn--line.jn-btn--block.clear__btn', '清空记录', 'trash', ask));
    }
    function ask() {
      JN.sfx('tap');
      U.clear(box);
      const n = Object.keys(S.state.fav).length + Object.keys(S.state.done).length;
      box.appendChild(U.el('div.jn-panel.clear__ask', { attrs: { role: 'alertdialog', 'aria-label': '确认清空记录' } }, [
        U.el('p.clear__q', { text: '确定清空？' }),
        U.el('p.jn-muted', { text: '会清掉全部收藏、做过的记录（现在共 ' + n + ' 条）和小游戏里的成绩，不能恢复。设置不受影响。' }),
        U.el('div.clear__btns', [
          btn('jn-btn.jn-btn--ghost.clear__no', '算了', null, idle),
          btn('jn-btn.jn-btn--danger.clear__yes', '清空', 'trash', () => { S.clearRecords(); JN.sfx('whoosh'); ui.toast('已经清空'); })
        ])
      ]));
      const no = box.querySelector('.clear__no');
      try { box.scrollIntoView({ block: 'nearest' }); if (no) no.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    idle();
    return ui.section('记录', [U.el('p.sec__note', { text: '收藏和做过的记录只存在这台手机里。' }), box], 'sec--clear');
  }

  V.me = {
    render(box) {
      U.clear(box);
      U.append(box, [pageHead('我的'), progressSec(), settingsSec(), installSec(), offlineSec(), refsSec(), aboutSec(), clearSec()]);
    }
  };
})();
