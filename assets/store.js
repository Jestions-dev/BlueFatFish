// 本地存储：IndexedDB 放二进制（壁纸文件、自定义图标），chrome.storage.local 放配置

const DB_NAME = 'bluefatfish';
const DB_VERSION = 1;
const STORE = 'assets';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAsset(key, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAsset(key) {
  if (!key) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function delAsset(key) {
  if (!key) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- 默认配置 ----------

export const DEFAULT_LINKS = [];

export const DEFAULT_WALLPAPER = {
  kind: 'toy',
  url: '',
  media: '',
  poster: '',
  dim: 8,
  blur: 0
};

const DEFAULTS = {
  wallpaper: DEFAULT_WALLPAPER,
  clock: { show: true, date: true },
  layout: 'center',
  iconSize: 58,
  lang: 'auto',
  toys: { overlay: false, count: 0 },
  links: DEFAULT_LINKS
};

export async function loadConfig() {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return structuredClone(DEFAULTS);
  return {
    wallpaper: { ...DEFAULT_WALLPAPER, ...(config.wallpaper || {}) },
    clock: { ...DEFAULTS.clock, ...(config.clock || {}) },
    layout: config.layout || DEFAULTS.layout,
    iconSize: Number(config.iconSize) || DEFAULTS.iconSize,
    lang: config.lang || DEFAULTS.lang,
    toys: { ...DEFAULTS.toys, ...(config.toys || {}) },
    links: Array.isArray(config.links) ? config.links : structuredClone(DEFAULT_LINKS)
  };
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

// ---------- 自动找图标 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 有些服务器把 ico 以 application/octet-stream 返回，所以不能只看 MIME，得看文件头
function looksLikeImage(bytes, mime) {
  if (/^image\//i.test(mime || '')) return true;
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return true; // ICO
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true; // WEBP
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return true; // BMP
  // SVG：文本开头是 <svg 或 <?xml
  const head = String.fromCharCode(...b.slice(0, 64)).trim().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype svg')) return true;
  return false;
}

async function fetchBlob(url, timeout = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || blob.size > 512 * 1024) return null;
    const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    if (!looksLikeImage(head, blob.type)) return null;
    return blob;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url, timeout = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    return { html: await res.text(), url: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeout = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseSize(tag) {
  const m = tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i);
  if (!m) return 0;
  let best = 0;
  for (const part of m[1].split(/\s+/)) {
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

// 从 HTML 里收图标链接（大的优先），顺带把 web app manifest 找出来
function collectLinks(html, base) {
  const icons = [];
  let manifest = '';
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = ((tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || /^data:/i.test(href)) continue;

    let abs;
    try {
      abs = new URL(href, base).href;
    } catch {
      continue;
    }

    if (rel.includes('manifest')) {
      manifest = manifest || abs;
      continue;
    }
    if (!/icon/.test(rel)) continue;
    icons.push({ href: abs, size: parseSize(tag) });
  }
  icons.sort((a, b) => b.size - a.size);
  return { icons: icons.map((i) => i.href), manifest };
}

// 常见顶级后缀，用来把 a.b.example.com 收敛到 example.com
const SECOND_LEVEL = /\.(com|net|org|edu|gov|co|ac|or)\.(cn|uk|jp|hk|tw|au|nz|kr|sg)$/i;

function rootOrigin(u) {
  const parts = u.hostname.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return '';
  const tail = '.' + parts.slice(-2).join('.');
  const tail3 = '.' + parts.slice(-3).join('.');
  if (parts.length >= 3 && u.hostname.match(SECOND_LEVEL)) {
    return `${u.protocol}//${tail3}`;
  }
  return `${u.protocol}//${tail}`;
}

// 页面里没写 <link rel=icon> 时的兜底路径，按常见程度排
const FILE_CANDIDATES = [
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/logo.png',
  '/assets/favicon.ico',
  '/static/favicon.ico',
  '/images/favicon.ico',
  '/img/favicon.ico',
  '/public/favicon.ico',
  '/Favicon.ico'
];

/**
 * 找图标的顺序：
 *   1. 页面 <link rel=icon|apple-touch-icon|mask-icon>（按 sizes 从大到小）
 *   2. 页面声明的 web app manifest 里的 icons
 *   3. 常见兜底路径（/favicon.ico、/assets/favicon.ico、/Favicon.ico …）
 *   4. 以上都没戏时，对主域名再来一遍（dash.cloudflare.com → cloudflare.com）
 * 返回 Blob 或 null。
 */
export async function fetchFavicon(pageUrl) {
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;

  const tried = new Set();
  let budget = 22;

  const attempt = async (href, timeout = 4000) => {
    if (!href || tried.has(href) || budget <= 0) return null;
    tried.add(href);
    budget--;
    return await fetchBlob(href, timeout);
  };

  const origins = [u.origin];
  const root = rootOrigin(u);
  if (root && root !== u.origin) origins.push(root);

  // 1) 页面里的图标链接 + manifest
  for (const origin of origins) {
    const page = await fetchHtml(origin + '/');
    if (!page) continue;
    const { icons, manifest } = collectLinks(page.html, page.url || origin + '/');

    for (const href of icons) {
      const b = await attempt(href);
      if (b) return b;
    }

    if (manifest) {
      const mf = await fetchJson(manifest);
      const list = Array.isArray(mf && mf.icons) ? mf.icons.slice() : [];
      list.sort((a, b) => (parseInt(b && b.sizes, 10) || 0) - (parseInt(a && a.sizes, 10) || 0));
      for (const ic of list) {
        if (!ic || !ic.src) continue;
        let abs;
        try {
          abs = new URL(ic.src, manifest).href;
        } catch {
          continue;
        }
        const b = await attempt(abs);
        if (b) return b;
      }
    }
  }

  // 2) 常见路径
  for (const origin of origins) {
    for (const f of FILE_CANDIDATES) {
      const b = await attempt(origin + f);
      if (b) return b;
    }
  }

  return null;
}

/** 清掉所有自动抓取的图标缓存，下次渲染会重新抓 */
export async function clearIconCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      if (typeof cur.key === 'string' && cur.key.startsWith('icon:')) cur.delete();
      cur.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// 给没有图标的标签一个稳定的颜色
export function colorForHost(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 52%)`;
}
