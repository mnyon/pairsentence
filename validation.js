export function validateState(value) {
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const safeId = id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
  if (!object(value) || value.version !== 1 || !object(value.nodes) || !Array.isArray(value.edges) || !object(value.history)) throw new Error('这不是有效的 PairSentence 图谱备份');
  for (const [id, n] of Object.entries(value.nodes)) if (!safeId(id) || !object(n) || n.id !== id || typeof n.content !== 'string') throw new Error('备份中的段落格式不正确');
  const seen = new Set();
  for (const e of value.edges) {
    if (!object(e) || !safeId(e.id) || !safeId(e.a) || !safeId(e.b) || e.a === e.b || !Object.hasOwn(value.nodes, e.a) || !Object.hasOwn(value.nodes, e.b) || typeof e.thought !== 'string' || !Number.isFinite(e.created) || seen.has(e.id)) throw new Error('备份中的关联格式不正确');
    seen.add(e.id);
  }
  for (const [key,h] of Object.entries(value.history)) if (!/^[-\w]+\|[-\w]+$/.test(key) || !object(h) || !Number.isFinite(h.until) || !['link','reject','skip'].includes(h.action) || (h.skips!==undefined&&(!Number.isInteger(h.skips)||h.skips<0||h.skips>20))) throw new Error('备份中的比对记录格式不正确');
  if (value.stats && (!object(value.stats) || !Number.isFinite(value.stats.decisions))) throw new Error('备份中的统计格式不正确');
  return value;
}
