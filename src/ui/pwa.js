/*
 * 手机网页版（ui 一侧）：只有网页版（页里有 manifest、经 http(s) 打开）才注册离线缓存、
 * 申请持久存储、接住浏览器的“安装到主屏幕”提示。单文件版里这些都不动，只给出网址。
 */
(function (G) {
  'use strict';
  const FX = G.FX || (G.FX = {});
  const PWA = (FX.PWA = {
    url: 'https://c18995793951.github.io/family-xiuxian/',
    web: false, standalone: false, ios: false, wechat: false, canPrompt: false, persisted: null, onchange: null,
  });
  let deferred = null;
  const changed = () => { if (typeof PWA.onchange === 'function') PWA.onchange(); };
  try {
    const nav = G.navigator || {};
    PWA.web = !!(G.document && G.document.querySelector('link[rel="manifest"]')) && /^https?:$/.test(G.location.protocol);
    PWA.standalone = !!((G.matchMedia && G.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true);
    PWA.ios = /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    PWA.wechat = /MicroMessenger/i.test(nav.userAgent || '');
    if (PWA.web) {
      if (nav.serviceWorker) nav.serviceWorker.register('sw.js').catch(() => {});
      if (nav.storage && nav.storage.persist) nav.storage.persist().then((ok) => { PWA.persisted = ok; changed(); }).catch(() => {});
      G.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; PWA.canPrompt = true; changed(); });
      G.addEventListener('appinstalled', () => { deferred = null; PWA.canPrompt = false; PWA.standalone = true; changed(); });
    }
  } catch (e) { /* 老浏览器：当普通网页用 */ }
  PWA.prompt = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null; PWA.canPrompt = false; changed();
    return !!(r && r.outcome === 'accepted');
  };
  // 手机上把存档文件直接分享出去（微信、网盘等）；浏览器不支持就返回 false
  PWA.canShareFile = () => {
    try { return !!(G.navigator.canShare && G.File && G.navigator.canShare({ files: [new G.File(['{}'], 'a.json', { type: 'application/json' })] })); } catch (e) { return false; }
  };
  PWA.shareFile = async (name, text) => {
    try {
      const file = new G.File([text], name, { type: 'application/json' });
      await G.navigator.share({ files: [file], title: name });
      return true;
    } catch (e) { return e && e.name === 'AbortError' ? null : false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
