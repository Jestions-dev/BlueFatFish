// 轻量 i18n：默认跟随浏览器语言，也可以在设置里强制指定。
// 系统语言走 chrome.i18n（_locales），手动覆盖走 generated 的 CATALOGS。

import { CATALOGS } from './locales.js';

let override = 'auto';

export function setLang(value) {
  override = value === 'zh' || value === 'en' ? value : 'auto';
}

export function currentLang() {
  return override;
}

export function t(key, subs) {
  if (override !== 'auto') {
    const msg = CATALOGS[override] && CATALOGS[override][key];
    if (msg) return msg;
  }
  const sys = chrome.i18n.getMessage(key, subs);
  if (sys) return sys;
  return (CATALOGS.en && CATALOGS.en[key]) || key;
}

export function uiLocale() {
  if (override === 'zh') return 'zh-CN';
  if (override === 'en') return 'en-US';
  try {
    return chrome.i18n.getUILanguage() || 'en';
  } catch {
    return 'en';
  }
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
}
