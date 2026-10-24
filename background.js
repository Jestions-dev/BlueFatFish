// Blue Fat Fish —— 对外的桥
// 只接受 manifest 里 externally_connectable 声明的本机页面（localhost / 127.0.0.1）。
// 未来的 DSH 插件在本地页面里这样调：
//   chrome.runtime.sendMessage('<扩展ID>', { type: 'ping' }, (res) => console.log(res));

const PROTOCOL = 'bff/1';
const EMOTIONS = ['greeting'];

const ok = (data = {}) => ({ ok: true, protocol: PROTOCOL, ...data });
const fail = (error) => ({ ok: false, protocol: PROTOCOL, error: String(error) });

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e) => sendResponse(fail((e && e.message) || e)));
  return true; // 表示会异步回复
});

async function handle(msg) {
  if (!msg || typeof msg.type !== 'string') return fail('message.type is required');

  switch (msg.type) {
    case 'ping':
      return ok({ name: 'Blue Fat Fish', version: chrome.runtime.getManifest().version });

    case 'emotions':
      return ok({ emotions: EMOTIONS });

    case 'open': {
      if (!isUrl(msg.url)) return fail('invalid url');
      const tab = await chrome.tabs.create({ url: msg.url, active: msg.active !== false });
      return ok({ tabId: tab.id });
    }

    case 'navigate': {
      if (!isUrl(msg.url)) return fail('invalid url');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id == null) return fail('no active tab');
      await chrome.tabs.update(tab.id, { url: msg.url });
      return ok({ tabId: tab.id });
    }

    case 'newtab': {
      const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
      return ok({ tabId: tab.id });
    }

    case 'react': {
      // 广播给所有扩展页面（新标签页），让大肥鱼做个表情
      const payload = {
        type: 'bff:react',
        emotion: typeof msg.emotion === 'string' ? msg.emotion : 'greeting',
        text: typeof msg.text === 'string' ? msg.text.slice(0, 80) : '',
        ms: Number.isFinite(msg.ms) ? Math.max(800, Math.min(15000, msg.ms)) : 4000
      };
      let delivered = 0;
      try {
        await chrome.runtime.sendMessage(payload);
        delivered = 1;
      } catch {
        delivered = 0; // 当前没有开着的新标签页
      }
      return ok({ delivered });
    }

    default:
      return fail('unknown type: ' + msg.type);
  }
}

function isUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' || x.protocol === 'chrome-extension:';
  } catch {
    return false;
  }
}
