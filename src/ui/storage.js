/* ============================================================
 * 存储适配器（ui 一侧）：IndexedDB 为主，失败降级 localStorage；
 * 导出：下载 .json 或复制压缩文本；导入：选择文件或粘贴文本。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const DB = 'family-xiuxian', STORE = 'saves', LS = 'family-xiuxian:';

  const Store = { kind: 'none', db: null, lsWarnBytes: 4 * 1024 * 1024 * 0.9 };

  Store.init = () => new Promise((resolve) => {
    const fallback = () => {
      try { localStorage.setItem(LS + '_probe', '1'); localStorage.removeItem(LS + '_probe'); Store.kind = 'ls'; } catch (e) { Store.kind = 'none'; }
      resolve(Store.kind);
    };
    try {
      if (!G.indexedDB) return fallback();
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => { Store.db = req.result; Store.kind = 'idb'; resolve('idb'); };
      req.onerror = () => fallback();
      req.onblocked = () => fallback();
    } catch (e) { fallback(); }
  });

  const tx = (mode, fn) => new Promise((resolve, reject) => {
    const t = Store.db.transaction(STORE, mode);
    const os = t.objectStore(STORE);
    const r = fn(os);
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  });

  Store.put = async (key, text) => {
    if (Store.kind === 'idb') { await tx('readwrite', (os) => os.put(text, key)); return { ok: true }; }
    if (Store.kind === 'ls') {
      try { localStorage.setItem(LS + key, text); } catch (e) { return { ok: false, error: '浏览器存储已满，请导出存档' }; }
      return { ok: true, warn: text.length * 2 > Store.lsWarnBytes ? '存档接近 4MB，建议导出备份' : null };
    }
    return { ok: false, error: '浏览器不允许本地存储，请使用导出或复制文本保存' };
  };
  Store.get = async (key) => {
    if (Store.kind === 'idb') return (await tx('readonly', (os) => os.get(key))) || null;
    if (Store.kind === 'ls') return localStorage.getItem(LS + key);
    return null;
  };
  Store.del = async (key) => {
    if (Store.kind === 'idb') return tx('readwrite', (os) => os.delete(key));
    if (Store.kind === 'ls') localStorage.removeItem(LS + key);
  };
  // 关闭页面时同步写一份（IndexedDB 是异步的，来不及；尽力写入 localStorage）
  Store.putSync = (key, text) => { try { localStorage.setItem(LS + 'unload-' + key, text); } catch (e) { /* 尽力而为 */ } };
  Store.getSync = (key) => { try { return localStorage.getItem(LS + 'unload-' + key); } catch (e) { return null; } };
  Store.delSync = (key) => { try { localStorage.removeItem(LS + 'unload-' + key); } catch (e) { /* 忽略 */ } };

  /* ---------- 文本编码 ---------- */
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  Store.encodeText = async (json) => {
    const bytes = new TextEncoder().encode(json);
    if (G.CompressionStream) { try { return 'FXZ1:' + b64(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* 降级 */ } }
    return 'FXB1:' + b64(bytes);
  };
  Store.decodeText = async (text) => {
    text = String(text).trim();
    if (text.startsWith('{')) return text;
    if (text.startsWith('FXB1:')) return new TextDecoder().decode(unb64(text.slice(5)));
    if (text.startsWith('FXZ1:')) {
      if (!G.DecompressionStream) throw new Error('此浏览器不支持解压，请改用 .json 文件导入');
      return new TextDecoder().decode(await pipe(unb64(text.slice(5)), new DecompressionStream('deflate-raw')));
    }
    throw new Error('无法识别的存档文本（应以 FXZ1: / FXB1: 或 { 开头）');
  };
  Store.download = (name, text, type) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) { return false; }
  };
  Store.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  };

  FX.Store = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
