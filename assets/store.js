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
  toys: { overlay: false, count: 0 },
  links: DEFAULT_LINKS
};

export async function loadConfig() {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return structuredClone(DEFAULTS);
  return {
    wallpaper: { ...DEFAULT_WALLPAPER, ...(config.wallpaper || {}) },
    clock: { ...DEFAULTS.clock, ...(config.clock || {}) },
    toys: { ...DEFAULTS.toys, ...(config.toys || {}) },
    links: Array.isArray(config.links) ? config.links : structuredClone(DEFAULT_LINKS)
  };
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

// ---------- 自动找图标 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBlob(url, timeout = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || blob.size > 512 * 1024) return null;
    if (!/^image\//.test(blob.type)) return null;
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
    if (!/text\/html/i.test(ct)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickIconHrefs(html, base) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    const tag = m[0];
    const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!/icon/i.test(rel)) continue;
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || /^data:/i.test(href)) continue;
    try {
      out.push(new URL(href, base).href);
    } catch {}
  }
  return out;
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

/**
 * 尝试找出某个网页的图标。先看页面里的 <link rel=icon>，再退回 /favicon.ico，
 * 最后再试一次主域名（dash.cloudflare.com → cloudflare.com）。
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
  const attempt = async (href) => {
    if (!href || tried.has(href)) return null;
    tried.add(href);
    return await fetchBlob(href);
  };

  const origins = [u.origin];
  const root = rootOrigin(u);
  if (root && root !== u.origin) origins.push(root);

  for (const origin of origins) {
    const html = await fetchHtml(origin + '/');
    if (html) {
      for (const href of pickIconHrefs(html, origin + '/')) {
        const b = await attempt(href);
        if (b) return b;
      }
    }
  }

  const files = [
    '/favicon.ico',
    '/favicon.png',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png'
  ];
  for (const origin of origins) {
    for (const f of files) {
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
