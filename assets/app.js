// Blue Fat Fish 新标签页 —— 主逻辑

import {
  loadConfig,
  saveConfig,
  putAsset,
  getAsset,
  fetchFavicon,
  clearIconCache,
  hostOf,
  colorForHost,
  DEFAULT_WALLPAPER
} from './store.js';
import { applyWallpaper, detectSource } from './wallpaper.js';
import { createToyBox } from './toys.js';

const $ = (id) => document.getElementById(id);

const bgEl = $('bg');
const scrimEl = $('scrim');
const gridEl = $('grid');
const timeEl = $('time');
const dateEl = $('date');
const clockEl = $('clock');
const drawer = $('drawer');
const toastEl = $('toast');

let config = await loadConfig();
const iconPromises = new Map(); // host -> Promise<{url}|null>
const assetUrls = new Map(); // assetKey -> objectURL（上传的图标复用，避免每次重绘都新建）
const objectUrls = new Set();

// ---------------- 工具 ----------------

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function fallbackText(title = '') {
  const t = String(title).trim();
  if (!t) return '·';
  if (/^[\x00-\x7f]+$/.test(t)) return t[0].toUpperCase();
  return [...t].slice(0, 2).join('');
}

function fitFontSize(len) {
  const base =
    len <= 1 ? 26 : len === 2 ? 22 : len === 3 ? 17 : len === 4 ? 13 : 10;
  const scale = (config.iconSize || 58) / 58;
  return Math.max(8, Math.round(base * scale));
}

function stableId() {
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------------- 壁纸 ----------------

function applyVisual() {
  const w = config.wallpaper || {};
  const dim = Math.max(0, Math.min(80, Number(w.dim) || 0));
  const blur = Math.max(0, Math.min(30, Number(w.blur) || 0));
  scrimEl.style.setProperty('--dim', String(dim / 100));
  bgEl.style.filter = blur ? `blur(${blur}px)` : 'none';
  bgEl.style.transform = blur ? 'scale(1.06)' : 'none';
}

async function renderWallpaper() {
  const ok = await applyWallpaper(bgEl, scrimEl, config.wallpaper);
  await applyToys();
  if (!ok) {
    config.wallpaper = structuredClone(DEFAULT_WALLPAPER);
    await applyWallpaper(bgEl, scrimEl, config.wallpaper);
  }
  applyVisual();
}

function wallpaperLabel() {
  const w = config.wallpaper || {};
  if (w.kind === 'toy') return '当前：玩具箱（蓝色 + 大肥鱼）';
  if (w.kind === 'asset') return '当前：本地上传的' + (w.media === 'video' ? '视频' : '图片');
  if (w.kind === 'web') return '当前：网页背景';
  if (w.kind === 'embed') return '当前：视频站嵌入';
  return '当前：' + (w.media === 'video' ? '视频链接' : '图片链接');
}

// ---------------- 图标 ----------------

function paintLetter(box, text, color) {
  box.textContent = text;
  box.classList.add('letter');
  const base = color || 'rgba(255,255,255,.18)';
  // 占位图标用一点渐变，别是一块死板的纯色
  box.style.background = /^(#|rgb)/i.test(base)
    ? `linear-gradient(145deg, ${base}, ${shade(base, 0.78)})`
    : base;
  box.style.fontSize = fitFontSize([...text].length) + 'px';
}

// 把颜色压暗一点，用于渐变的第二段
function shade(color, k) {
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  }
  const h = String(color).match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  }
  const hsl = String(color).match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/i);
  if (hsl) return `hsl(${hsl[1]}, ${hsl[2]}%, ${Math.max(12, Math.round(Number(hsl[3]) * k))}%)`;
  return color;
}

function paintImage(box, url) {
  box.classList.remove('letter');
  box.style.background = 'rgba(255,255,255,.9)';
  box.style.fontSize = '';
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.onerror = () => {
    box.innerHTML = '';
  };
  box.appendChild(img);
}

function autoIcon(link) {
  const host = hostOf(link.url);
  if (!host) return Promise.resolve(null);
  if (!iconPromises.has(host)) {
    iconPromises.set(
      host,
      (async () => {
        let blob = await getAsset('icon:' + host);
        if (!blob) {
          blob = await fetchFavicon(link.url);
          if (blob) await putAsset('icon:' + host, blob);
        }
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.add(url);
        return { url };
      })()
    );
  }
  return iconPromises.get(host);
}

async function fillIcon(box, link) {
  const icon = link.icon || {};

  if (icon.type === 'text') {
    return paintLetter(box, icon.text || fallbackText(link.title), icon.color || colorForHost(hostOf(link.url)));
  }

  if (icon.type === 'image' && icon.assetKey) {
    let url = assetUrls.get(icon.assetKey);
    if (!url) {
      const blob = await getAsset(icon.assetKey);
      if (blob) {
        url = URL.createObjectURL(blob);
        assetUrls.set(icon.assetKey, url);
        objectUrls.add(url);
      }
    }
    if (url) return paintImage(box, url);
  }

  if (icon.type === 'url' && icon.url) {
    return paintImage(box, icon.url);
  }

  // 自动：先用文字占位，抓到图标再替换
  paintLetter(box, fallbackText(link.title), colorForHost(hostOf(link.url)));
  const got = await autoIcon(link);
  if (got) paintImage(box, got.url);
}

// ---------------- 网格 ----------------

const PAD_X = 32;
const PAD_Y = 112;

function cellSize() {
  const icon = config.iconSize || 58;
  return { w: icon + 50, h: icon + 54 };
}

function cellKey(c, r) {
  return c + ',' + r;
}

function cellPos(c, r) {
  const { w, h } = cellSize();
  return { x: PAD_X + c * w, y: PAD_Y + r * h };
}

function cellFromPos(x, y) {
  const { w, h } = cellSize();
  return { c: Math.round((x - PAD_X) / w), r: Math.max(0, Math.round((y - PAD_Y) / h)) };
}

function isFreeLayout(layout) {
  return layout === 'free' || layout === 'freeGrid';
}

// 给没位置的图标分配网格单元，顺便去重
function assignCells() {
  const { w } = cellSize();
  const cols = Math.max(1, Math.floor((window.innerWidth - PAD_X * 2) / w));
  const used = new Set();
  let next = 0;

  for (const link of config.links) {
    const c = link.cell;
    if (c && Number.isInteger(c.c) && Number.isInteger(c.r) && !used.has(cellKey(c.c, c.r))) {
      used.add(cellKey(c.c, c.r));
      continue;
    }
    while (used.has(cellKey(next % cols, Math.floor(next / cols)))) next++;
    link.cell = { c: next % cols, r: Math.floor(next / cols) };
    used.add(cellKey(link.cell.c, link.cell.r));
    next++;
  }
}

// 目标格被占了就往外找最近的一个空格
function nearestFreeCell(cell, self) {
  const used = new Set();
  for (const l of config.links) {
    if (l !== self && l.cell) used.add(cellKey(l.cell.c, l.cell.r));
  }
  if (!used.has(cellKey(cell.c, cell.r))) return cell;

  for (let radius = 1; radius < 40; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        const c = cell.c + dc;
        const r = cell.r + dr;
        if (r < 0) continue;
        if (!used.has(cellKey(c, r))) return { c, r };
      }
    }
  }
  return cell;
}

function defaultFreePos(i) {
  const { w, h } = cellSize();
  const cols = Math.max(1, Math.floor((window.innerWidth - PAD_X * 2) / w));
  return { x: PAD_X + (i % cols) * w, y: PAD_Y + Math.floor(i / cols) * h };
}

function makeTileDraggable(tile, link, layout) {
  let drag = null;

  tile.addEventListener('pointerdown', (e) => {
    if (!isFreeLayout(config.layout) || e.button !== 0) return;
    e.preventDefault();
    const r = tile.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: 0, x0: e.clientX, y0: e.clientY };
    tile.setPointerCapture(e.pointerId);
    tile.classList.add('dragging');
  });

  tile.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = e.clientX - drag.dx;
    const y = e.clientY - drag.dy;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    tile.style.left = x + 'px';
    tile.style.top = y + 'px';
  });

  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    tile.classList.remove('dragging');
    if (moved <= 3) return;

    tile.dataset.skipClick = '1';
    setTimeout(() => delete tile.dataset.skipClick, 400);

    if (layout === 'free') {
      link.pos = { x: Math.round(parseFloat(tile.style.left) || 0), y: Math.round(parseFloat(tile.style.top) || 0) };
    } else {
      const drop = cellFromPos(parseFloat(tile.style.left) || 0, parseFloat(tile.style.top) || 0);
      const oldCell = link.cell;
      const occupant = config.links.find(
        (l) => l !== link && l.cell && l.cell.c === drop.c && l.cell.r === drop.r
      );
      link.cell = drop;
      // 目标格有人：两个换位置，而不是把对方挤走
      if (occupant && oldCell) occupant.cell = oldCell;
      saveConfig(config);
      renderGrid();
      return;
    }

    saveConfig(config);
  };

  tile.addEventListener('pointerup', end);
  tile.addEventListener('pointercancel', end);

  tile.addEventListener(
    'click',
    (e) => {
      if (tile.dataset.skipClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}

function makeTile(link, index, layout) {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = link.url || '#';
  a.title = link.title || link.url || '';
  if (isFreeLayout(layout)) a.draggable = false;

  const box = document.createElement('div');
  box.className = 'tile-icon';

  const label = document.createElement('div');
  label.className = 'tile-label';
  label.textContent = link.title || hostOf(link.url) || '未命名';

  a.append(box, label);

  if (layout === 'free') {
    const pos = link.pos && Number.isFinite(link.pos.x) ? link.pos : defaultFreePos(index);
    link.pos = pos;
    a.style.left = pos.x + 'px';
    a.style.top = pos.y + 'px';
    makeTileDraggable(a, link, layout);
  } else if (layout === 'freeGrid') {
    const p = cellPos(link.cell.c, link.cell.r);
    a.style.left = p.x + 'px';
    a.style.top = p.y + 'px';
    makeTileDraggable(a, link, layout);
  }

  fillIcon(box, link);
  return a;
}

function applyIconSize() {
  const size = Math.max(36, Math.min(96, Number(config.iconSize) || 58));
  document.documentElement.style.setProperty('--icon', size + 'px');
}

function renderGrid() {
  const layout = config.layout || 'center';
  applyIconSize();

  gridEl.className = 'grid ' + layout;
  const stageEl = document.querySelector('.stage');
  if (stageEl) stageEl.classList.toggle('anchored', layout !== 'center');
  gridEl.innerHTML = '';

  if (layout === 'freeGrid') assignCells();

  if (!config.links.length) {
    const add = document.createElement('button');
    add.className = 'tile tile-add';
    add.type = 'button';
    const plus = document.createElement('span');
    plus.className = 'plus';
    plus.textContent = '+';
    const tip = document.createElement('span');
    tip.className = 'tile-label';
    tip.textContent = '添加标签';
    add.append(plus, tip);
    if (isFreeLayout(layout)) {
      const p = layout === 'free' ? defaultFreePos(0) : cellPos(0, 0);
      add.style.left = p.x + 'px';
      add.style.top = p.y + 'px';
    }
    add.addEventListener('click', openDrawer);
    gridEl.appendChild(add);
    return;
  }

  config.links.forEach((link, i) => gridEl.appendChild(makeTile(link, i, layout)));
}

// ---------------- 时钟 ----------------

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function tick() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  timeEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  dateEl.textContent = `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
}

function applyClockVisibility() {
  clockEl.classList.toggle('hide', !config.clock.show);
  dateEl.classList.toggle('hide', !config.clock.date);
}

// ---------------- 大肥鱼 ----------------

function greetText() {
  const h = new Date().getHours();
  if (h < 5) return '这个点还没睡？';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  if (h < 23) return '晚上好';
  return '夜深了，早点睡';
}

// 未来的 DSH 插件通过 background.js 广播过来：随便挑一条鱼说话
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'bff:react' && toyBox) {
    toyBox.say(msg.text || greetText(), msg.ms);
  }
});

// ---------------- 玩具箱 ----------------

const toysEl = $('toys');
let toyBox = null;
let toyCountNow = 0;

function autoToyCount() {
  return Math.max(5, Math.min(12, Math.round(window.innerWidth / 150)));
}

function toysEnabled() {
  const t = config.toys || {};
  return (config.wallpaper && config.wallpaper.kind === 'toy') || !!t.overlay;
}

function desiredToyCount() {
  const t = config.toys || {};
  if (t.count > 0) return Math.min(12, t.count);
  const base = autoToyCount();
  // 自定义壁纸可能本身就在动（视频/网页），少放两条
  return config.wallpaper && config.wallpaper.kind === 'toy' ? base : Math.max(2, base - 2);
}

async function applyToys() {
  const on = toysEnabled();
  toysEl.classList.toggle('hide', !on);

  if (!on) {
    if (toyBox) {
      toyBox.destroy();
      toyBox = null;
      toyCountNow = 0;
    }
    return;
  }

  const want = desiredToyCount();
  if (toyBox && toyCountNow === want) return;
  if (toyBox) {
    toyBox.destroy();
    toyBox = null;
  }
  toyCountNow = want;
  toyBox = await createToyBox(toysEl, { count: want });
}

// ---------------- 设置面板 ----------------

function renderLinkList() {
  const list = $('linkList');
  list.innerHTML = '';

  config.links.forEach((link, index) => {
    link.icon = link.icon || { type: 'auto' };

    const row = document.createElement('div');
    row.className = 'link-row';

    const prev = document.createElement('div');
    prev.className = 'prev';

    const fields = document.createElement('div');
    fields.className = 'lr-fields';

    const title = document.createElement('input');
    title.type = 'text';
    title.placeholder = '标题';
    title.value = link.title || '';

    const url = document.createElement('input');
    url.type = 'text';
    url.placeholder = 'https://';
    url.value = link.url || '';

    const iconRow = document.createElement('div');
    iconRow.className = 'lr-iconrow';

    const typeSel = document.createElement('select');
    for (const [v, t] of [
      ['auto', '自动图标'],
      ['text', '文字图标'],
      ['image', '上传图标']
    ]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      typeSel.appendChild(o);
    }
    typeSel.value = link.icon.type || 'auto';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.maxLength = 8;
    textInput.placeholder = '文字（可多字）';
    textInput.value = link.icon.text || '';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = toHexColor(link.icon.color) || '#3b6cf6';

    const upBtn = document.createElement('input');
    const fileBtn = document.createElement('button');
    fileBtn.className = 'mini';
    fileBtn.textContent = '上传';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;

    iconRow.append(typeSel, textInput, colorInput, fileBtn, file);

    const actions = document.createElement('div');
    actions.className = 'lr-actions';
    const up = document.createElement('button');
    up.textContent = '↑';
    const down = document.createElement('button');
    down.textContent = '↓';
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    actions.append(up, down, del);

    fields.append(title, url, iconRow);
    row.append(prev, fields, actions);
    list.appendChild(row);

    const refreshPreview = () => {
      prev.textContent = '';
      const tmp = document.createElement('div');
      tmp.className = 'tile-icon';
      tmp.style.width = '40px';
      tmp.style.height = '40px';
      tmp.style.borderRadius = '10px';
      prev.appendChild(tmp);
      fillIcon(tmp, link);
    };

    const syncTypeUI = () => {
      const isText = link.icon.type === 'text';
      textInput.classList.toggle('hide', !isText);
      colorInput.classList.toggle('hide', !isText);
      fileBtn.classList.toggle('hide', link.icon.type !== 'image');
    };
    syncTypeUI();
    refreshPreview();

    let timer = null;
    const commit = (patch, { reRender = true } = {}) => {
      Object.assign(link, patch);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await saveConfig(config);
        if (reRender) renderGrid();
      }, 320);
    };

    title.addEventListener('input', () => commit({ title: title.value }));
    url.addEventListener('input', () => {
      const host = hostOf(url.value);
      if (!link.icon.color && host) link.icon.color = colorForHost(host);
      commit({ url: url.value });
    });

    typeSel.addEventListener('change', () => {
      link.icon.type = typeSel.value;
      if (typeSel.value === 'text' && !link.icon.text) {
        link.icon.text = fallbackText(link.title);
        textInput.value = link.icon.text;
      }
      syncTypeUI();
      commit({}, { reRender: true });
      refreshPreview();
    });

    textInput.addEventListener('input', () => {
      link.icon.text = textInput.value;
      commit({});
      refreshPreview();
    });

    colorInput.addEventListener('input', () => {
      link.icon.color = colorInput.value;
      commit({});
      refreshPreview();
    });

    fileBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const key = `icon:${stableId()}`;
      await putAsset(key, f);
      link.icon = { type: 'image', assetKey: key, text: '', color: '' };
      await saveConfig(config);
      refreshPreview();
      renderGrid();
      toast('图标已更新');
    });

    up.addEventListener('click', async () => {
      if (index === 0) return;
      [config.links[index - 1], config.links[index]] = [config.links[index], config.links[index - 1]];
      await saveConfig(config);
      renderLinkList();
      renderGrid();
    });

    down.addEventListener('click', async () => {
      if (index === config.links.length - 1) return;
      [config.links[index + 1], config.links[index]] = [config.links[index], config.links[index + 1]];
      await saveConfig(config);
      renderLinkList();
      renderGrid();
    });

    del.addEventListener('click', async () => {
      if (link.icon && link.icon.assetKey) {
        // 自定义图标留着也无妨，删掉更干净
        try {
          await import('./store.js').then((m) => m.delAsset(link.icon.assetKey));
        } catch {}
      }
      config.links.splice(index, 1);
      await saveConfig(config);
      renderLinkList();
      renderGrid();
    });
  });
}

function toHexColor(color) {
  if (!color) return '';
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (!m) return '';
  const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
  const hex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b);
}

function openDrawer() {
  drawer.classList.add('open');
  renderLinkList();
}

function closeDrawer() {
  drawer.classList.remove('open');
}

// ---------------- 事件绑定 ----------------

function bindSettings() {
  $('openSettings').addEventListener('click', openDrawer);
  $('closeSettings').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  $('pickWall').addEventListener('click', () => $('fileInput').click());

  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const key = `wp:${Date.now()}`;
    await putAsset(key, file);
    config.wallpaper = {
      kind: 'asset',
      assetKey: key,
      media: file.type.startsWith('video') ? 'video' : 'image',
      url: '',
      poster: '',
      dim: config.wallpaper.dim,
      blur: config.wallpaper.blur
    };
    await saveConfig(config);
    await renderWallpaper();
    $('wallName').textContent = wallpaperLabel();
    toast('壁纸已更新');
    e.target.value = '';
  });

  $('applyWallUrl').addEventListener('click', async () => {
    const src = detectSource($('wallUrl').value);
    if (!src) return toast('看不懂这个地址');
    config.wallpaper = {
      kind: src.kind,
      media: src.media,
      url: src.url,
      assetKey: '',
      poster: '',
      dim: config.wallpaper.dim,
      blur: config.wallpaper.blur
    };
    await saveConfig(config);
    await renderWallpaper();
    $('wallName').textContent = wallpaperLabel();
    toast(src.kind === 'web' ? '已设为网页背景（被拒绝嵌入会白屏）' : '壁纸已更新');
  });

  $('toyWall').addEventListener('click', async () => {
    config.wallpaper = {
      kind: 'toy',
      url: '',
      media: '',
      assetKey: '',
      poster: '',
      dim: config.wallpaper.dim,
      blur: config.wallpaper.blur
    };
    await saveConfig(config);
    await renderWallpaper();
    $('wallName').textContent = wallpaperLabel();
    toast('已切换到玩具箱背景');
  });

  $('resetWall').addEventListener('click', async () => {
    config.wallpaper = structuredClone(DEFAULT_WALLPAPER);
    await saveConfig(config);
    await renderWallpaper();
    $('wallName').textContent = wallpaperLabel();
    toast('已恢复默认背景');
  });

  const dimInput = $('wallDim');
  const blurInput = $('wallBlur');
  dimInput.value = config.wallpaper.dim ?? 0;
  blurInput.value = config.wallpaper.blur ?? 0;
  $('dimVal').textContent = dimInput.value;
  $('blurVal').textContent = blurInput.value;

  dimInput.addEventListener('input', () => {
    $('dimVal').textContent = dimInput.value;
    config.wallpaper.dim = Number(dimInput.value);
    applyVisual();
  });
  dimInput.addEventListener('change', () => saveConfig(config));

  blurInput.addEventListener('input', () => {
    $('blurVal').textContent = blurInput.value;
    config.wallpaper.blur = Number(blurInput.value);
    applyVisual();
  });
  blurInput.addEventListener('change', () => saveConfig(config));

  $('addLink').addEventListener('click', async () => {
    config.links.push({ id: stableId(), title: '', url: '', icon: { type: 'auto' } });
    await saveConfig(config);
    renderLinkList();
    renderGrid();
    const rows = $('linkList').querySelectorAll('.link-row');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('input').focus();
  });

  $('refreshIcons').addEventListener('click', async () => {
    iconPromises.clear();
    await clearIconCache();
    renderGrid();
    renderLinkList();
    toast('已清空图标缓存，正在重新抓取');
  });

  $('showClock').checked = config.clock.show;
  $('showDate').checked = config.clock.date;
  $('showClock').addEventListener('change', async (e) => {
    config.clock.show = e.target.checked;
    applyClockVisibility();
    await saveConfig(config);
  });
  const sizeRange = $('iconSize');
  const sizeLabel = $('iconSizeVal');
  sizeRange.value = String(config.iconSize || 58);
  sizeLabel.textContent = sizeRange.value;
  sizeRange.addEventListener('input', () => {
    config.iconSize = Number(sizeRange.value);
    sizeLabel.textContent = sizeRange.value;
    applyIconSize();
    renderGrid();
  });
  sizeRange.addEventListener('change', () => saveConfig(config));

  const layoutSel = $('layoutSel');
  layoutSel.value = config.layout || 'center';
  layoutSel.addEventListener('change', async () => {
    config.layout = layoutSel.value;
    await saveConfig(config);
    renderGrid();
  });

  $('showDate').addEventListener('change', async (e) => {
    config.clock.date = e.target.checked;
    applyClockVisibility();
    await saveConfig(config);
  });


  const overlayBox = $('showToysOverlay');
  const countRange = $('toyCount');
  const countLabel = $('toyCountVal');

  overlayBox.checked = !!(config.toys && config.toys.overlay);
  countRange.value = String((config.toys && config.toys.count) || 0);
  countLabel.textContent = (config.toys && config.toys.count) || '自动';

  overlayBox.addEventListener('change', async (e) => {
    config.toys = config.toys || {};
    config.toys.overlay = e.target.checked;
    await saveConfig(config);
    applyToys();
  });

  countRange.addEventListener('input', () => {
    const v = Number(countRange.value);
    countLabel.textContent = v ? String(v) : '自动';
    config.toys = config.toys || {};
    config.toys.count = v;
    applyToys();
  });
  countRange.addEventListener('change', () => saveConfig(config));

}

// ---------------- 启动 ----------------

async function boot() {
  await renderWallpaper();
  $('wallName').textContent = wallpaperLabel();
  renderGrid();
  applyClockVisibility();
  tick();
  setInterval(tick, 1000);
  bindSettings();
  if (toyBox) setTimeout(() => toyBox.say(greetText(), 4600), 900);
}

boot();
