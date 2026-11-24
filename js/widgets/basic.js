/* 锦囊 · widgets/basic —— 参考实现（项目负责人维护）
 * 其他组件请照这个结构写：
 *   1. 一个文件一个 IIFE，只通过 JN.registerWidget 对外。
 *   2. DOM 用 JN.util.el 生成，class 一律以 w-<组件 id>- 开头，样式写在对应的 css/widgets-*.css。
 *   3. mount 里创建的计时器、动画帧、全局监听，都要在 destroy 里清掉。
 *   4. 一局结束调用 ctx.done()，并给一个「再来一次」。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;

  /* ------------------------------------------------------------------ *
   * picker 点兵点将：每人按住一根手指，两秒后随机选中一个。
   * params: { names: ['爸爸','妈妈','孩子'], title: '谁先来？' }
   * ------------------------------------------------------------------ */
  JN.registerWidget({
    id: 'picker',
    name: '点兵点将',
    rules: '每人把一根手指按在屏幕上别松开。两秒后，被圈住的那个人就是“天选之人”。',
    mount: function (root, params, ctx) {
      var names = (params.names && params.names.length ? params.names : ['爸爸', '妈妈', '孩子']).slice(0, 5);
      var COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--accent)', '#ff4fa3'];
      var HOLD_MS = 2000;
      var touches = {};          // pointerId -> { node, x, y, color }
      var timer = null;
      var locked = false;        // 已出结果，等手指抬起
      var alive = true;

      var tip = U.el('div.w-picker-tip', { text: params.title || '每人按住一根手指' });
      var sub = U.el('div.w-picker-sub', { text: '至少两根手指，按住不放' });
      var pad = U.el('div.w-picker-pad', [U.el('div.w-picker-msg', [tip, sub])]);
      var soloBtn = U.el('button.jn-btn.jn-btn--ghost.jn-btn--sm', {
        text: '只有一只手？帮我抽一个',
        on: { click: drawByName }
      });
      var result = U.el('div.w-picker-result');
      var bar = U.el('div.w-picker-bar', [soloBtn, result]);
      root.appendChild(pad);
      root.appendChild(bar);

      function count() { return Object.keys(touches).length; }

      function restartCountdown() {
        clearTimeout(timer);
        pad.classList.remove('is-counting');
        if (locked) return;
        if (count() >= 2) {
          // 触发重排，让 CSS 的收缩圈动画从头开始
          void pad.offsetWidth;
          pad.classList.add('is-counting');
          sub.textContent = '别松手……';
          timer = setTimeout(choose, HOLD_MS);
        } else {
          sub.textContent = count() === 1 ? '再来一根手指' : '至少两根手指，按住不放';
        }
      }

      function choose() {
        var ids = Object.keys(touches);
        if (ids.length < 2 || !alive) return;
        locked = true;
        pad.classList.remove('is-counting');
        var win = U.pick(ids);
        ids.forEach(function (id) { touches[id].node.classList.add(id === win ? 'is-win' : 'is-lose'); });
        tip.textContent = '就是你了';
        sub.textContent = '松手再来一次';
        ctx.sfx('win');
        ctx.haptic([30, 60, 120]);
        ctx.done({ text: '选好了' });
      }

      function onDown(e) {
        if (locked && count() === 0) reset();
        if (locked) return;
        e.preventDefault();
        var rect = pad.getBoundingClientRect();
        var used = Object.keys(touches).map(function (k) { return touches[k].color; });
        var color = COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || COLORS[0];
        var node = U.el('div.w-picker-dot');
        node.style.setProperty('--dot', color);
        node.style.left = e.clientX - rect.left + 'px';
        node.style.top = e.clientY - rect.top + 'px';
        pad.appendChild(node);
        touches[e.pointerId] = { node: node, color: color };
        ctx.sfx('pop');
        restartCountdown();
      }
      function onMove(e) {
        var t = touches[e.pointerId];
        if (!t) return;
        var rect = pad.getBoundingClientRect();
        t.node.style.left = e.clientX - rect.left + 'px';
        t.node.style.top = e.clientY - rect.top + 'px';
      }
      function onUp(e) {
        var t = touches[e.pointerId];
        if (!t) return;
        if (t.node.parentNode) t.node.parentNode.removeChild(t.node);
        delete touches[e.pointerId];
        if (locked) { if (count() === 0) reset(); return; }
        restartCountdown();
      }
      function reset() {
        locked = false;
        Object.keys(touches).forEach(function (id) {
          if (touches[id].node.parentNode) touches[id].node.parentNode.removeChild(touches[id].node);
        });
        touches = {};
        tip.textContent = params.title || '每人按住一根手指';
        sub.textContent = '至少两根手指，按住不放';
      }

      function drawByName() {
        var i = 0;
        var steps = 14 + U.randInt(0, names.length - 1);
        soloBtn.disabled = true;
        (function spin() {
          if (!alive) return;
          result.textContent = names[i % names.length];
          result.classList.remove('jn-pop');
          ctx.sfx('tick');
          i++;
          if (i <= steps) timer = setTimeout(spin, 60 + i * 12);
          else {
            result.classList.add('jn-pop');
            ctx.sfx('win');
            ctx.haptic(60);
            soloBtn.disabled = false;
            ctx.done({ text: result.textContent });
          }
        })();
      }

      pad.addEventListener('pointerdown', onDown);
      pad.addEventListener('pointermove', onMove);
      pad.addEventListener('pointerup', onUp);
      pad.addEventListener('pointercancel', onUp);
      pad.addEventListener('pointerleave', onUp);

      return {
        destroy: function () {
          alive = false;
          clearTimeout(timer);
          pad.removeEventListener('pointerdown', onDown);
          pad.removeEventListener('pointermove', onMove);
          pad.removeEventListener('pointerup', onUp);
          pad.removeEventListener('pointercancel', onUp);
          pad.removeEventListener('pointerleave', onUp);
        }
      };
    }
  });
})();
