// 壁纸引擎：图片 / GIF / 动图 / 视频 / 网页 / 视频站嵌入

import { getAsset } from './store.js';

let currentObjectUrl = null;

function releaseObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

export function guessMedia(url = '') {
  if (/\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(url)) return 'video';
  if (/\.(png|jpe?g|gif|webp|apng|avif|svg|bmp)(\?|#|$)/i.test(url)) return 'image';
  return '';
}

function buildMedia(url, media, poster) {
  const kind = media || guessMedia(url) || 'image';
  if (kind === 'video') {
    const v = document.createElement('video');
    if (poster) v.poster = poster;
    v.src = url;
    v.autoplay = true;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.addEventListener('canplay', () => v.play().catch(() => {}), { once: true });
    // 编解码不支持 / 文件损坏时退到底色，不要留一片黑
    v.addEventListener('error', () => v.classList.add('failed'), { once: true });
    return v;
  }
  const img = document.createElement('img');
  img.src = url;
  img.decoding = 'async';
  img.addEventListener('error', () => img.classList.add('failed'), { once: true });
  return img;
}

function buildFrame(url) {
  const f = document.createElement('iframe');
  f.src = url;
  f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.setAttribute('scrolling', 'no');
  f.setAttribute('tabindex', '-1');
  return f;
}

/**
 * 渲染壁纸。返回 true 表示成功。
 */
export async function applyWallpaper(bgEl, scrimEl, w) {
  bgEl.innerHTML = '';
  releaseObjectUrl();

  const dim = Math.max(0, Math.min(80, Number(w.dim) || 0));
  scrimEl.style.setProperty('--dim', String(dim / 100));

  const blur = Math.max(0, Math.min(30, Number(w.blur) || 0));
  bgEl.style.filter = blur ? `blur(${blur}px)` : 'none';
  bgEl.style.transform = blur ? 'scale(1.06)' : 'none';

  let node = null;

  if (w.kind === 'toy') {
    // 玩具箱模式：背景只留 CSS 的蓝色渐变，鱼在单独的层里跑
    return true;
  }

  if (w.kind === 'asset') {
    const blob = await getAsset(w.assetKey);
    if (!blob) return false;
    currentObjectUrl = URL.createObjectURL(blob);
    node = buildMedia(currentObjectUrl, blob.type.startsWith('video') ? 'video' : 'image');
  } else if (w.kind === 'web' || w.kind === 'embed') {
    if (!w.url) return false;
    node = buildFrame(w.url);
  } else {
    if (!w.url) return false;
    node = buildMedia(w.url, w.media || guessMedia(w.url), w.poster);
  }

  bgEl.appendChild(node);
  return true;
}

/**
 * 判断一个输入是哪种背景来源。
 */
export function detectSource(raw) {
  const text = (raw || '').trim();
  if (!text) return null;

  let u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');

  // B 站
  if (/(^|\.)bilibili\.com$/.test(host)) {
    const bv = (u.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/) || [])[1] || u.searchParams.get('bvid');
    if (bv) {
      return {
        kind: 'embed',
        media: '',
        url: `https://player.bilibili.com/player.html?bvid=${bv}&autoplay=1&muted=1&danmaku=0&high_quality=1&as_wide=1`
      };
    }
  }

  // YouTube
  const ytId =
    host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
    : /(^|\.)youtube\.com$/.test(host) ? (u.searchParams.get('v') || (u.pathname.match(/\/embed\/([^/?#]+)/) || [])[1])
    : '';
  if (ytId) {
    return {
      kind: 'embed',
      media: '',
      url: `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1`
    };
  }

  // 直链媒体
  const media = guessMedia(text);
  if (media) return { kind: 'url', media, url: text };

  // 其余当网页
  return { kind: 'web', media: '', url: text };
}
