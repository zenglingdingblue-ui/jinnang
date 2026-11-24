/* 锦囊 · core
 * 所有模块共用的小工具、设置、音效、彩带和「互动组件」注册表。
 * 外壳（app.js）和每个组件（js/widgets/*.js）都只依赖这里暴露的 window.JN。
 * 这个文件由项目负责人维护，其他人不要改；缺什么能力请在交付说明里提出来。
 */
(function () {
  'use strict';

  var JN = (window.JN = window.JN || {});
  JN.version = '1.0.0';

  /* ------------------------------------------------------------------ *
   * 常量：卡片类型与场景（外壳、校验脚本、内容都以此为准）
   * ------------------------------------------------------------------ */
  JN.TYPES = [
    { id: 'talk', name: '话匣子', icon: 'i-t-talk', blurb: '一句话打开话头' },
    { id: 'play', name: '一起玩', icon: 'i-t-play', blurb: '手机上的小对决、小游戏' },
    { id: 'puzzle', name: '烧脑', icon: 'i-t-puzzle', blurb: '一起解一道题' },
    { id: 'show', name: '给他看', icon: 'i-t-show', blurb: '让人“哇”一声的东西' },
    { id: 'do', name: '一起做', icon: 'i-t-do', blurb: '放下手机做的小事' },
    { id: 'trio', name: '三人局', icon: 'i-t-trio', blurb: '三个人一起的' },
    { id: 'insight', name: '锦囊', icon: 'i-t-insight', blurb: '只给爸爸看的提示' }
  ];
  JN.SCENES = [
    { id: '救场', icon: 'i-s-rescue' },
    { id: '车上', icon: 'i-s-car' },
    { id: '饭桌', icon: 'i-s-table' },
    { id: '球场', icon: 'i-s-court' },
    { id: '睡前', icon: 'i-s-bed' },
    { id: '周末', icon: 'i-s-weekend' },
    { id: '出游', icon: 'i-s-trip' },
    { id: '出差', icon: 'i-s-away' }
  ];
  JN.typeOf = function (id) {
    for (var i = 0; i < JN.TYPES.length; i++) if (JN.TYPES[i].id === id) return JN.TYPES[i];
    return null;
  };

  JN.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ------------------------------------------------------------------ *
   * util
   * ------------------------------------------------------------------ */
  var U = (JN.util = {});

  /** el('div.card.big#main', {text:'你好', on:{click:fn}, style:{...}, attrs:{...}, html:'<b>可信内容</b>'}, [子节点...]) */
  U.el = function (spec, props, children) {
    var m = /^([a-z0-9]+)?(.*)$/i.exec(spec || 'div');
    var node = document.createElement(m[1] || 'div');
    var rest = m[2] || '';
    var idm = /#([\w-]+)/.exec(rest);
    if (idm) node.id = idm[1];
    var cls = rest.replace(/#[\w-]+/, '').split('.').filter(Boolean);
    if (cls.length) node.className = cls.join(' ');
    if (Array.isArray(props) || props instanceof Node || typeof props === 'string') {
      children = props;
      props = null;
    }
    if (props) {
      if (props.text != null) node.textContent = props.text;
      if (props.html != null) node.innerHTML = props.html;
      if (props.style) for (var k in props.style) node.style[k] = props.style[k];
      if (props.attrs) for (var a in props.attrs) if (props.attrs[a] != null) node.setAttribute(a, props.attrs[a]);
      if (props.on) for (var e in props.on) node.addEventListener(e, props.on[e]);
      if (props.cls) node.className += (node.className ? ' ' : '') + props.cls;
    }
    U.append(node, children);
    return node;
  };
  U.append = function (node, children) {
    if (children == null) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  };
  U.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  /** svg('circle', {cx:10, cy:10, r:4}) */
  U.svg = function (tag, attrs, children) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) for (var a in attrs) if (attrs[a] != null) node.setAttribute(a, attrs[a]);
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  };
  /** 图标：icon('heart') -> <svg class="jn-ic"><use href="#i-heart"/></svg>（名字见 docs/SPEC.md 图标表） */
  U.icon = function (name, cls) {
    var s = U.svg('svg', { class: 'jn-ic' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', viewBox: '0 0 24 24' });
    s.appendChild(U.svg('use', { href: '#' + (name.indexOf('i-') === 0 ? name : 'i-' + name) }));
    return s;
  };
  /** 插画贴纸：art('ball') -> <svg class="jn-art"><use href="#art-ball"/></svg>（名字见 docs/SPEC.md 插画表） */
  U.art = function (name, cls) {
    var s = U.svg('svg', { class: 'jn-art' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', viewBox: '0 0 120 120' });
    s.appendChild(U.svg('use', { href: '#art-' + name }));
    return s;
  };
  U.hasSymbol = function (id) { return !!document.getElementById(id); };

  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.range = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; };

  /** 带种子的随机数发生器：var rnd = U.rng('任意字符串或数字'); rnd() -> [0,1)。不传种子则每次不同。 */
  U.rng = function (seed) {
    var h;
    if (seed == null) h = (Math.random() * 4294967296) >>> 0;
    else {
      var s = String(seed);
      h = 1779033703 ^ s.length;
      for (var i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      h = h >>> 0;
    }
    return function () {
      h = (h + 0x6d2b79f5) >>> 0;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** 整数随机，含两端 */
  U.randInt = function (lo, hi, rnd) { rnd = rnd || Math.random; return lo + Math.floor(rnd() * (hi - lo + 1)); };
  U.pick = function (arr, rnd) { rnd = rnd || Math.random; return arr[Math.floor(rnd() * arr.length)]; };
  /** 返回打乱后的新数组（不改原数组） */
  U.shuffle = function (arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /** fmtTime(65000) -> '1:05'；fmtTime(12345, true) -> '12.35'（秒，两位小数） */
  U.fmtTime = function (ms, precise) {
    if (precise) return (ms / 1000).toFixed(2);
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };
  U.escape = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  /** 极简 markdown：转义后支持 **粗体**、换行、以「- 」开头的列表、空行分段。返回安全的 HTML 字符串。 */
  JN.md = function (text) {
    if (!text) return '';
    var blocks = String(text).replace(/\r/g, '').split(/\n{2,}/);
    return blocks.map(function (b) {
      var lines = b.split('\n');
      var isList = lines.every(function (l) { return /^\s*[-•]\s+/.test(l); });
      var fmt = function (l) { return U.escape(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); };
      if (isList) return '<ul>' + lines.map(function (l) { return '<li>' + fmt(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(fmt).join('<br>') + '</p>';
    }).join('');
  };

  /* ------------------------------------------------------------------ *
   * 本地存储（带前缀、JSON、任何异常都静默回退）
   * ------------------------------------------------------------------ */
  var mem = {};
  JN.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem('jn.' + key);
        return raw == null ? (key in mem ? mem[key] : fallback) : JSON.parse(raw);
      } catch (e) { return key in mem ? mem[key] : fallback; }
    },
    set: function (key, value) {
      mem[key] = value;
      try { window.localStorage.setItem('jn.' + key, JSON.stringify(value)); } catch (e) { /* 隐私模式等：只留内存 */ }
    },
    remove: function (key) {
      delete mem[key];
      try { window.localStorage.removeItem('jn.' + key); } catch (e) { /* noop */ }
    }
  };

  /* ------------------------------------------------------------------ *
   * 设置
   * ------------------------------------------------------------------ */
  JN.settings = Object.assign({ sfx: true, haptic: true }, JN.store.get('settings', {}));
  JN.setSetting = function (key, value) {
    JN.settings[key] = value;
    JN.store.set('settings', JN.settings);
    JN.bus.emit('settings', JN.settings);
  };

  /* ------------------------------------------------------------------ *
   * 事件总线
   * ------------------------------------------------------------------ */
  var handlers = {};
  JN.bus = {
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); return function () { JN.bus.off(name, fn); }; },
    off: function (name, fn) { handlers[name] = (handlers[name] || []).filter(function (f) { return f !== fn; }); },
    emit: function (name, data) { (handlers[name] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }
  };

  /* ------------------------------------------------------------------ *
   * 音效（WebAudio 合成，不需要任何音频文件）与震动
   * 名字：tap good bad win tick buzz pop whoosh
   * ------------------------------------------------------------------ */
  var actx = null;
  function audio() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { actx = null; }
    return actx;
  }
  function tone(freq, start, dur, type, gain) {
    var ac = audio();
    if (!ac) return;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ac.currentTime + start);
    g.gain.setValueAtTime(0.0001, ac.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, ac.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(ac.currentTime + start);
    o.stop(ac.currentTime + start + dur + 0.03);
  }
  var SOUNDS = {
    tap: function () { tone(520, 0, 0.05, 'triangle', 0.08); },
    pop: function () { tone(760, 0, 0.07, 'sine', 0.1); },
    tick: function () { tone(980, 0, 0.03, 'square', 0.04); },
    good: function () { tone(660, 0, 0.09, 'triangle'); tone(880, 0.08, 0.14, 'triangle'); },
    bad: function () { tone(220, 0, 0.16, 'sawtooth', 0.07); tone(170, 0.12, 0.2, 'sawtooth', 0.07); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.2, 'triangle'); }); },
    buzz: function () { tone(140, 0, 0.35, 'square', 0.06); },
    whoosh: function () { tone(300, 0, 0.12, 'sine', 0.05); tone(600, 0.05, 0.12, 'sine', 0.05); }
  };
  JN.sfx = function (name) {
    if (!JN.settings.sfx) return;
    var ac = audio();
    if (!ac) return;
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    try { (SOUNDS[name] || SOUNDS.tap)(); } catch (e) { /* noop */ }
  };
  JN.haptic = function (pattern) {
    if (!JN.settings.haptic) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern == null ? 12 : pattern); } catch (e) { /* noop */ }
  };

  /* ------------------------------------------------------------------ *
   * 彩带
   * ------------------------------------------------------------------ */
  JN.confetti = function (opts) {
    if (JN.reduced) return;
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'jn-confetti';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    document.body.appendChild(canvas);
    var g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    var colors = opts.colors || ['#FFD166', '#FF7A45', '#4D7CFE', '#00C2A8', '#FF4FA3', '#FFFFFF'];
    var n = opts.count || 90;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      var sp = 7 + Math.random() * 9;
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.62,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.5,
        c: colors[i % colors.length]
      });
    }
    var t0 = performance.now();
    (function frame(now) {
      var t = now - t0;
      g.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save();
        g.globalAlpha = Math.max(0, 1 - t / 1700);
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      });
      if (t < 1700) requestAnimationFrame(frame);
      else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    })(t0);
  };

  /* ------------------------------------------------------------------ *
   * toast（外壳可以用自己的实现覆盖 JN.toast）
   * ------------------------------------------------------------------ */
  JN.toast = function (msg, ms) {
    var host = document.getElementById('jn-toasts');
    if (!host) {
      host = U.el('div#jn-toasts');
      host.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(96px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;z-index:9000';
      document.body.appendChild(host);
    }
    var t = U.el('div.jn-toast', { text: msg });
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, ms || 1800);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, (ms || 1800) + 350);
  };

  /* ------------------------------------------------------------------ *
   * 互动组件（widget）注册表
   *
   * JN.registerWidget({
   *   id: 'make24',                 // 唯一，小写字母数字
   *   name: '算 24 点',             // 舞台标题
   *   rules: '用四个数和加减乘除算出 24。',   // 可选：一两句规则，外壳会放在「规则」按钮里
   *   mount(root, params, ctx) { ...; return { destroy() { ... } }; },   // 必须：完整可玩的版本
   *   preview(root, params, ctx) { ...; return { destroy() { ... } }; }  // 可选：卡片上自动播放的小动画，不接收触摸
   * });
   *
   * ctx：
   *   ctx.done(result)   玩完一局时调用一次。result 可省略，或 { win: true, text: '用时 12 秒' }
   *   ctx.confetti()     放彩带        ctx.sfx(name)  音效      ctx.haptic(ms)  震动
   *   ctx.store.get(key, fallback) / ctx.store.set(key, value)   按组件 id 隔离的本地存储
   *   ctx.rng(seed)      带种子的随机函数（同 JN.util.rng）
   *   ctx.size()         { w, h } 当前可用区域（像素）
   *   ctx.onResize(fn)   可用区域变化时回调
   *   ctx.reduced        用户是否要求减少动效
   *   ctx.isPreview      是否处在卡片预览里
   * ------------------------------------------------------------------ */
  JN.widgets = JN.widgets || {};
  JN.registerWidget = function (def) {
    if (!def || !def.id || typeof def.mount !== 'function') {
      console.warn('[锦囊] 组件定义不完整', def);
      return;
    }
    if (JN.widgets[def.id]) console.warn('[锦囊] 组件 id 重复：' + def.id);
    JN.widgets[def.id] = def;
  };

  JN.makeCtx = function (widgetId, root, hooks) {
    hooks = hooks || {};
    var resizeFns = [];
    var ro = null;
    var onWin = U.debounce(function () { fire(); }, 80);
    function fire() {
      var s = ctx.size();
      resizeFns.forEach(function (f) { try { f(s); } catch (e) { console.error(e); } });
    }
    var doneCalled = false;
    var ctx = {
      id: widgetId,
      isPreview: !!hooks.preview,
      reduced: JN.reduced,
      done: function (result) {
        if (hooks.preview) return;
        if (hooks.onDone) hooks.onDone(result || {}, !doneCalled);
        doneCalled = true;
      },
      confetti: function (o) { if (!hooks.preview) JN.confetti(o); },
      sfx: function (n) { if (!hooks.preview) JN.sfx(n); },
      haptic: function (p) { if (!hooks.preview) JN.haptic(p); },
      store: {
        get: function (k, fb) { return JN.store.get('w.' + widgetId + '.' + k, fb); },
        set: function (k, v) { JN.store.set('w.' + widgetId + '.' + k, v); }
      },
      rng: U.rng,
      size: function () { return { w: root.clientWidth, h: root.clientHeight }; },
      onResize: function (fn) {
        resizeFns.push(fn);
        if (resizeFns.length === 1) {
          if (window.ResizeObserver) { ro = new ResizeObserver(function () { fire(); }); ro.observe(root); }
          else window.addEventListener('resize', onWin);
        }
      },
      _dispose: function () {
        resizeFns = [];
        if (ro) { ro.disconnect(); ro = null; }
        window.removeEventListener('resize', onWin);
      }
    };
    return ctx;
  };

  /** 外壳和测试页用它来挂载组件。返回 { destroy() }，出错时在 root 里显示一句提示而不是白屏。 */
  JN.mountWidget = function (id, root, params, hooks) {
    hooks = hooks || {};
    var def = JN.widgets[id];
    var ctx = JN.makeCtx(id, root, hooks);
    var inst = null;
    U.clear(root);
    root.classList.add('jn-widget-root');
    root.setAttribute('data-widget', id);
    try {
      if (!def) throw new Error('没有找到组件 ' + id);
      var fn = hooks.preview ? def.preview : def.mount;
      if (!fn) throw new Error('组件 ' + id + ' 没有 ' + (hooks.preview ? 'preview' : 'mount'));
      inst = fn.call(def, root, params || {}, ctx) || null;
    } catch (err) {
      console.error('[锦囊] 组件出错 ' + id, err);
      U.clear(root);
      root.appendChild(U.el('div.jn-widget-error', { text: hooks.preview ? '' : '这个小游戏出了点问题，换一张试试。' }));
      if (hooks.onError) hooks.onError(err);
    }
    return {
      def: def,
      destroy: function () {
        try { if (inst && inst.destroy) inst.destroy(); } catch (e) { console.error(e); }
        ctx._dispose();
        U.clear(root);
        root.classList.remove('jn-widget-root');
        root.removeAttribute('data-widget');
      }
    };
  };
})();
