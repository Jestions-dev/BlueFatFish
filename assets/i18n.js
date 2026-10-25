// 轻量 i18n：所有界面文案走 chrome.i18n，语言包在 _locales/

export function t(key, subs) {
  const msg = chrome.i18n.getMessage(key, subs);
  return msg || key;
}

export function uiLocale() {
  try {
    return chrome.i18n.getUILanguage() || 'en';
  } catch {
    return 'en';
  }
}

/**
 * 把 HTML 里带 data-i18n / data-i18n-ph / data-i18n-title 的元素翻译掉。
 * 属性优先级：data-i18n（文本）、data-i18n-ph（placeholder）、data-i18n-title（title）。
 */
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
