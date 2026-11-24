export const DAY = 86400000;
export const pairKey = (a, b) => [a, b].sort().join('|');
export function newState() { return { version: 1, nodes: {}, edges: [], history: {}, stats: { decisions: 0 } }; }
export function components(state) {
  const ids = Object.keys(state.nodes).filter(id => !state.nodes[id].deleted);
  const parent = new Map(ids.map(id => [id, id]));
  const find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  for (const e of state.edges) if (parent.has(e.a) && parent.has(e.b)) parent.set(find(e.a), find(e.b));
  const groups = new Map();
  for (const id of ids) { const p = find(id); if (!groups.has(p)) groups.set(p, []); groups.get(p).push(id); }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}
export function mergeBlocks(state, blocks) {
  for (const b of blocks) {
    const previous=state.nodes[b.id];
    state.nodes[b.id] = { ...previous, ...b, deleted: false, failures: previous?.failures || 0 };
    if(previous?.sourceUrls||b.sourceUrls)state.nodes[b.id].sourceUrls=[...new Set([...(previous?.sourceUrls||[]),...(b.sourceUrls||[])])];
  }
}
export function reconcile(state, blocks, checkedIds) {
  mergeBlocks(state, blocks);
  const found = new Set(blocks.map(b => b.id));
  let deleted = 0;
  for (const id of checkedIds) if (!found.has(id) && state.nodes[id] && !state.nodes[id].deleted) { state.nodes[id].deleted = true; deleted++; }
  return deleted;
}
export function activeEdges(state) { return state.edges.filter(e => state.nodes[e.a] && state.nodes[e.b] && !state.nodes[e.a].deleted && !state.nodes[e.b].deleted); }
export function choosePair(state, previous = [], rng = Math.random, now = Date.now(), options = {}) {
  const groups = components(state);
  const groupOf = new Map(groups.flatMap((g, i) => g.map(id => [id, i])));
  const linked = new Set(activeEdges(state).flatMap(e => [e.a, e.b]));
  let ids = Object.keys(state.nodes).filter(id => !state.nodes[id].deleted && (options.gentle || !(state.nodes[id].quarantineUntil > now)));
  // Keep long-running sessions responsive. Sample both the frontier and component
  // representatives afresh each round; nothing is permanently excluded by this cap.
  if (ids.length > 240) {
    const eligible = new Set(ids);
    const shuffle = list => { const a = [...list]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
    const frontier = shuffle(ids.filter(id => !linked.has(id))).slice(0, 100);
    const representatives = shuffle(groups).flatMap(g => shuffle(g.filter(id => eligible.has(id))).slice(0, 2)).slice(0, 100);
    ids = [...new Set([...frontier, ...representatives, ...shuffle(ids)])].slice(0,240);
  }
  if (state.stats.decisions === 0 && !options.avoidIds?.length && !options.avoidPairs?.length && ids.length >= 2) {
    const i = Math.floor(rng() * ids.length);
    let j = Math.floor(rng() * (ids.length - 1));
    if (j >= i) j++;
    return { a: ids[i], b: ids[j], kind: 'explore' };
  }
  const tokens = s => new Set((s || '').toLowerCase().match(/[a-z]{3,}|[\u4e00-\u9fff]{2}/g) || []);
  const tokenSets = new Map(ids.map(id => [id, tokens(state.nodes[id].content)]));
  const existing = new Set(activeEdges(state).map(e => pairKey(e.a, e.b)));
  const avoidPairs = new Set(options.avoidPairs || []), avoidIds = new Set(options.avoidIds || []);
  const buckets = { bridge: [], attach: [], explore: [] };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], key = pairKey(a, b), history = state.history[key];
    if (existing.has(key) || avoidPairs.has(key) || (history && history.until > now && !(options.gentle && history.action==='reject')) || key === pairKey(...previous)) continue;
    if (avoidIds.has(a) || avoidIds.has(b)) continue;
    if (groupOf.get(a) === groupOf.get(b)) continue;
    const al = linked.has(a), bl = linked.has(b);
    const kind = al && bl ? 'bridge' : al || bl ? 'attach' : 'explore';
    // A small textual hint orders candidates; human judgement alone creates links.
    const at = tokenSets.get(a), bt = tokenSets.get(b);
    let overlap = 0; for (const t of at) if (bt.has(t)) overlap++;
    const unseen = (!state.nodes[a].seen ? 1 : 0) + (!state.nodes[b].seen ? 1 : 0);
    const size = groups[groupOf.get(a)].length + groups[groupOf.get(b)].length;
    const exposure = (state.nodes[a].seen || 0) + (state.nodes[b].seen || 0);
    const score = rng() * 3 + Math.min(overlap, 5) * .15 + unseen * 1.2 - Math.log2(1 + exposure) * .6 + (kind === 'bridge' ? Math.log2(size) * .05 : 0) - (options.gentle ? Math.log2(1+(history?.skips||0))*.6 : 0);
    buckets[kind].push({ a, b, kind, score });
  }
  const roll = rng();
  const order = roll < .2 ? ['bridge', 'explore', 'attach'] : roll < .55 ? ['attach', 'explore', 'bridge'] : ['explore', 'attach', 'bridge'];
  for (const kind of order) if (buckets[kind].length) return buckets[kind].reduce((a, b) => a.score > b.score ? a : b);
  return null;
}
export function decide(state, pair, action, thought = '', now = Date.now(), options = {}) {
  const { a, b } = pair;
  if (!state.nodes[a] || !state.nodes[b] || state.nodes[a].deleted || state.nodes[b].deleted) throw new Error('段落已不存在，请换一组');
  for (const id of [a, b]) state.nodes[id].seen = (state.nodes[id].seen || 0) + 1;
  const key = pairKey(a, b);
  state.stats.decisions++;
  const skips=action==='skip' ? Math.min(20,(state.history[key]?.skips||0)+1) : 0;
  // Gentle passing affects this combination only, never either fragment's eligibility.
  state.history[key] = options.gentle&&action==='skip'
    ? {action,skips,until:now+Math.min(DAY,10*60000*2**(skips-1))}
    : { action, until: now + (action === 'skip' ? 10 * 60000 : 7 * DAY) };
  if (action === 'link') {
    if (state.edges.some(e => pairKey(e.a, e.b) === key)) return;
    state.edges.push({ id: globalThis.crypto.randomUUID(), a, b, thought: thought.trim(), created: now });
    for (const id of [a, b]) { state.nodes[id].failures = 0; state.nodes[id].quarantineUntil = 0; }
  } else if (action === 'reject') {
    const linked = new Set(activeEdges(state).flatMap(e => [e.a, e.b]));
    for (const id of [a, b]) if (!linked.has(id)) {
      const n = state.nodes[id]; n.failures = (n.failures || 0) + 1;
      if (n.failures >= 3) { n.quarantineUntil = now + DAY; n.failures = 0; }
    }
  }
}
