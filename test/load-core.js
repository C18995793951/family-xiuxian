// 在 Node 中加载模拟核心（与浏览器内联的是同一组文件）
const path = require('path');
const FILES = ['config', 'rng', 'history', 'characters', 'cultivation', 'world', 'events', 'encounters', 'sim', 'actions', 'sect', 'saga', 'arsenal', 'dayao', 'guide', 'deeds', 'propose', 'intent', 'hooks', 'npc', 'director', 'save', 'api'];
module.exports = function loadCore() {
  for (const f of FILES) require(path.join(__dirname, '..', 'src', 'core', f + '.js'));
  return globalThis.FX;
};
module.exports.FILES = FILES;
