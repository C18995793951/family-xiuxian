/* ============================================================
 * xin —— 心境（0.11）
 * 闭关是修为的来路，出门是心境的来路，两样缺一不可：
 *  · 闭关、修炼一年耗心境 10 点；心境越枯，修得越慢（0 时只有平常的五成半）；
 *  · 游历、赶路、遇事、交游都添心境；心境通明时修得快三成，冲关多一成把握；
 *  · 冲关失败心神受挫，心境跌一截。
 * 只记在主角身上（s.player.xin），NPC 不算。旧存档没有这个字段时按 60（不加不减）。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});
  const K = () => FX.CONFIG.xin;
  const U = FX.U;

  const Xin = {};
  Xin.get = (s) => (s.player && typeof s.player.xin === 'number' ? s.player.xin : K().start);
  Xin.set = (s, v) => { if (s.player) s.player.xin = Math.round(U.clamp(v, 0, 100) * 10) / 10; };
  // 加减心境，返回实际变化
  Xin.add = (s, v) => {
    if (!s.player || !v) return 0;
    const before = Xin.get(s);
    Xin.set(s, before + v);
    return Math.round((Xin.get(s) - before) * 10) / 10;
  };
  Xin.factor = (x) => Math.round((K().speedMin + (K().speedMax - K().speedMin) * U.clamp(x, 0, 100) / 100) * 100) / 100;
  Xin.name = (x) => (x >= 80 ? '通明' : x >= 55 ? '平和' : x >= 30 ? '滞涩' : '枯槁');
  Xin.breakBonus = (x) => Math.round((x - 50) / K().breakDiv);
  // 修炼若干天：心境渐耗
  Xin.cultivate = (s, days) => Xin.add(s, -K().decayPerYear * days / FX.CONFIG.daysPerYear);
  // 游历若干天：野外比城里开阔，越险越磨人；头一回游历的地方另加
  Xin.explore = (s, place, days) => {
    const k = K();
    const town = ['town', 'city', 'sect', 'clan'].includes(place.type);
    let v = Math.min(k.exploreCap, days * k.explorePerDay) * (town ? k.townMult : 1 + (place.danger || 0) * k.dangerBonus);
    const seen = (s.player.explored = s.player.explored || []);
    if (!seen.includes(place.id)) { seen.push(place.id); v += k.newPlace; }
    return Xin.add(s, v);
  };
  Xin.travel = (s, days, fresh) => Xin.add(s, Math.min(K().travelCap, days * K().travelPerDay) + (fresh ? K().newPlace : 0));
  // 给界面看的一句话
  Xin.view = (s) => {
    const x = Xin.get(s);
    const f = Xin.factor(x);
    const b = Xin.breakBonus(x);
    const hint = x < K().low ? '闭关日久，心境枯滞，修炼只有平常的 ' + Math.round(f * 100) + '%。出去游历一两个月再回来，会快得多。'
      : x >= 80 ? '心境通明，此时闭关、冲关都正好。'
      : '';
    return { value: Math.round(x), name: Xin.name(x), factor: f, breakBonus: b, hint, low: x < K().low };
  };

  FX.Xin = Xin;
})(typeof globalThis !== 'undefined' ? globalThis : this);
