// 大肥鱼玩具箱：一堆在屏幕里弹来弹去、可以抓起来甩的 GIF
// 无重力；撞墙按分量反弹；有空气阻尼，会自己停下来；拖着能撞飞别的鱼。
// 每条鱼带一个气泡：点一下（不拖动）会说话，也可以从外部让它说话。

const TOY_DIR = 'assets/toys/';

const MAX_SPEED = 2400;
const SUBSTEP = 1 / 120;
const RESTITUTION = 1;
const AIR_DRAG = 0.5;
const STOP_BELOW = 7;
const TAP_SLOP = 8;

const SFX_QUACK = 'assets/sfx/quack.mp3';

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export async function createToyBox(layerEl, { count = 10 } = {}) {
  let index = [];
  try {
    const res = await fetch(chrome.runtime.getURL(TOY_DIR + 'index.json'));
    index = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(index) || !index.length) return null;

  const items = [];
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // 不重复随机抽样
  const order = index.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const idx of order.slice(0, Math.min(count, order.length))) {
    const meta = index[idx];
    const size = Math.round(rand(112, 168));
    const r = size * 0.42;

    const img = document.createElement('img');
    img.className = 'toy';
    img.src = chrome.runtime.getURL(TOY_DIR + meta.file);
    img.alt = meta.name || '';
    img.draggable = false;
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    layerEl.appendChild(img);

    const bubble = document.createElement('div');
    bubble.className = 'toy-bubble';
    layerEl.appendChild(bubble);

    let x = 0;
    let y = 0;
    let ok = false;
    for (let t = 0; t < 120 && !ok; t++) {
      x = rand(r + 8, W() - r - 8);
      y = rand(r + 8, H() - r - 8);
      ok = items.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 12);
    }

    const dir = rand(0, Math.PI * 2);
    const spd = rand(70, 190);
    items.push({
      el: img,
      bubble,
      x, y, r,
      vx: Math.cos(dir) * spd,
      vy: Math.sin(dir) * spd,
      m: r * r,
      inv: 1 / (r * r),
      timer: 0,
      // 捏的挤压：sx/sy 当前值，tsx/tsy 目标值，svx/svy 速度
      sx: 1, sy: 1, svx: 0, svy: 0, tsx: 1, tsy: 1
    });
  }

  // 每次刷新随机挑一条可以捏的鱼
  const special = items.length ? items[(Math.random() * items.length) | 0] : null;
  if (special) {
    special.el.dataset.special = '1';
    special.el.title = '捏我';
  }

  let quackAudio = null;
  function quack() {
    try {
      if (!quackAudio) {
        quackAudio = new Audio(chrome.runtime.getURL(SFX_QUACK));
        quackAudio.volume = 0.55;
      }
      quackAudio.currentTime = 0;
      quackAudio.play().catch(() => {});
    } catch {
      /* 没声音也不影响用 */
    }
  }

  function say(it, text, ms = 3000) {
    if (!it || !text) return;
    it.bubble.textContent = text;
    it.bubble.classList.add('show');
    clearTimeout(it.timer);
    it.timer = setTimeout(() => it.bubble.classList.remove('show'), ms);
  }

  // ---------- 拖拽 / 点一下 ----------
  let drag = null;

  function onDown(ev) {
    const it = items.find((o) => o.el === ev.target);
    if (!it) return;
    ev.preventDefault();
    drag = {
      it,
      dx: ev.clientX - it.x,
      dy: ev.clientY - it.y,
      hist: [{ t: performance.now(), x: it.x, y: it.y }],
      t0: performance.now(),
      moved: 0,
      x0: ev.clientX,
      y0: ev.clientY
    };
    it.vx = it.vy = 0;
    if (it === special) {
      it.tsx = 1.18;
      it.tsy = 0.58;
    }
    it.el.classList.add('grabbed');
    it.el.setPointerCapture?.(ev.pointerId);
  }

  function onMove(ev) {
    if (!drag) return;
    const it = drag.it;
    it.x = ev.clientX - drag.dx;
    it.y = ev.clientY - drag.dy;
    drag.moved = Math.max(drag.moved, Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0));

    const now = performance.now();
    drag.hist.push({ t: now, x: it.x, y: it.y });
    // 只留最近 120ms，算速度用
    while (drag.hist.length > 2 && now - drag.hist[0].t > 120) drag.hist.shift();

    const first = drag.hist[0];
    const last = drag.hist[drag.hist.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt > 0.008) {
      it.vx = clamp((last.x - first.x) / dt);
      it.vy = clamp((last.y - first.y) / dt);
    }

    // 拖的时候把别的鱼撞开（会传速度，不只是挤开）
    resolveAll(it);
  }

  function onUp() {
    if (!drag) return;
    const it = drag.it;
    const h = drag.hist;
    const first = h[0];
    const last = h[h.length - 1];
    const dt = (last.t - first.t) / 1000;

    const shortTap = drag.moved < TAP_SLOP && performance.now() - drag.t0 < 350;
    if (shortTap) {
      // 只捏得动那一条：短按松手，出小黄鸭 + 气泡；其他鱼短按没反应
      it.vx = 0;
      it.vy = 0;
      if (it === special) {
        quack();
        say(it, '叽！', 1600);
      }
    } else if (dt > 0.008) {
      it.vx = clamp((last.x - first.x) / dt);
      it.vy = clamp((last.y - first.y) / dt);
    }

    it.tsx = 1;
    it.tsy = 1;
    it.el.classList.remove('grabbed');
    drag = null;
  }

  function clamp(v) {
    return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
  }

  layerEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // ---------- 物理 ----------
  function resolveAll(immovable = null) {
    const n = items.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;

        const ia = a === immovable ? 0 : a.inv;
        const ib = b === immovable ? 0 : b.inv;
        const invSum = ia + ib;
        if (invSum === 0) continue;

        const overlap = min - dist;
        a.x -= nx * overlap * (ia / invSum);
        a.y -= ny * overlap * (ia / invSum);
        b.x += nx * overlap * (ib / invSum);
        b.y += ny * overlap * (ib / invSum);

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;

        const jImp = (-(1 + RESTITUTION) * vn) / invSum;
        a.vx -= jImp * nx * ia;
        a.vy -= jImp * ny * ia;
        b.vx += jImp * nx * ib;
        b.vy += jImp * ny * ib;
      }
    }
  }

  function step(dt) {
    const w = W();
    const h = H();

    for (const it of items) {
      // 挤压的弹簧回弹（被拖着的也要弹，所以放在 continue 之前）
      const K = 220;
      const C = 14;
      it.svx += (-K * (it.sx - it.tsx) - C * it.svx) * dt;
      it.svy += (-K * (it.sy - it.tsy) - C * it.svy) * dt;
      it.sx += it.svx * dt;
      it.sy += it.svy * dt;

      if (drag && drag.it === it) continue;

      const k = Math.exp(-AIR_DRAG * dt);
      it.vx *= k;
      it.vy *= k;
      if (it.vx * it.vx + it.vy * it.vy < STOP_BELOW * STOP_BELOW) {
        it.vx = 0;
        it.vy = 0;
      }

      it.x += it.vx * dt;
      it.y += it.vy * dt;

      // 撞墙：速度分量反向，位置贴回墙内
      if (it.x - it.r < 0) { it.x = it.r; it.vx = Math.abs(it.vx); }
      if (it.x + it.r > w) { it.x = w - it.r; it.vx = -Math.abs(it.vx); }
      if (it.y - it.r < 0) { it.y = it.r; it.vy = Math.abs(it.vy); }
      if (it.y + it.r > h) { it.y = h - it.r; it.vy = -Math.abs(it.vy); }
    }

    resolveAll(drag ? drag.it : null);

    if (drag) {
      const it = drag.it;
      it.x = Math.max(it.r, Math.min(w - it.r, it.x));
      it.y = Math.max(it.r, Math.min(h - it.r, it.y));
    }
  }

  function render() {
    for (const it of items) {
      it.el.style.transform =
        `translate3d(${(it.x - it.r).toFixed(2)}px, ${(it.y - it.r).toFixed(2)}px, 0) ` +
        `scale(${it.sx.toFixed(3)}, ${it.sy.toFixed(3)})`;
      it.bubble.style.transform =
        `translate3d(${it.x.toFixed(2)}px, ${(it.y - it.r - 10).toFixed(2)}px, 0) translate(-50%, -100%)`;
    }
  }

  let raf = 0;
  let acc = 0;
  let prev = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - prev) / 1000;
    prev = now;
    if (dt > 0.1) dt = 0.1; // 切标签页回来别炸
    acc += dt;
    let guard = 0;
    while (acc >= SUBSTEP && guard++ < 8) {
      step(SUBSTEP);
      acc -= SUBSTEP;
    }
    render();
  }

  function start() {
    if (raf) return;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onResize() {
    const w = W();
    const h = H();
    for (const it of items) {
      it.x = Math.max(it.r, Math.min(w - it.r, it.x));
      it.y = Math.max(it.r, Math.min(h - it.r, it.y));
    }
  }
  window.addEventListener('resize', onResize);

  render();
  start();

  return {
    /** 随机挑一条鱼说话（外部 react 接口用），顺便弹一下让人看出是哪条 */
    say(text, ms = 4000) {
      if (!items.length) return;
      const it = items[(Math.random() * items.length) | 0];
      say(it, text, ms);
      it.vx += rand(-90, 90);
      it.vy += rand(-90, 90);
    },
    destroy() {
      stop();
      for (const it of items) clearTimeout(it.timer);
      layerEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      layerEl.innerHTML = '';
    }
  };
}
