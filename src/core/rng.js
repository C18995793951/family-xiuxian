/* ============================================================
 * rng —— 可序列化种子随机数（sfc32）。核心内所有随机都经由这里，
 * 状态保存在 state.rng.s 中，随存档保存。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function seedState(seed) {
    const f = xmur3(String(seed));
    const s = [f(), f(), f(), f()];
    const r = { algo: 'sfc32', s };
    for (let i = 0; i < 15; i++) nextU32(r);
    return r;
  }

  function nextU32(r) {
    const s = r.s;
    let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
    return t;
  }

  // 以下函数都接收 rng 状态对象（state.rng）
  const R = {
    seedState,
    next(r) { return nextU32(r) / 4294967296; },
    chance(r, p) { return R.next(r) < p; },
    int(r, min, max) { return min + Math.floor(R.next(r) * (max - min + 1)); },
    range(r, min, max) { return min + R.next(r) * (max - min); },
    pick(r, arr) { return arr[Math.floor(R.next(r) * arr.length)]; },
    normal(r, mean, sd) {
      // Box–Muller，固定消耗两次随机数
      const u = Math.max(R.next(r), 1e-12);
      const v = R.next(r);
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    weighted(r, items, wf) {
      let total = 0;
      for (const it of items) total += Math.max(0, wf(it));
      if (total <= 0) return null;
      let x = R.next(r) * total;
      for (const it of items) {
        x -= Math.max(0, wf(it));
        if (x < 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(r, arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(R.next(r) * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
  };

  FX.RNG = R;

  /* ---------- 通用工具（纯函数）---------- */
  FX.U = {
    clamp(x, a, b) { return x < a ? a : x > b ? b : x; },
    round1(x) { return Math.round(x * 10) / 10; },
    sum(arr, f) { let s = 0; for (const x of arr) s += f ? f(x) : x; return s; },
    // FNV-1a 32 位哈希，用于存档校验和与状态哈希
    hash(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    },
    fill(tpl, params) {
      return tpl.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
