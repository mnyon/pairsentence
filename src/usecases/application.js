import { newState, mergeBlocks, choosePair, decide, reconcile } from '../domain/engine.js';

/* APPLICATION BOUNDARY — all graph writes pass through these use cases.
 * UI receives detached snapshots; domain functions only mutate a private draft.
 * A command checks -> computes -> awaits one durable save -> publishes.
 * Rejected saves publish nothing. Commands are serialized, including sync/undo.
 * Pair tickets make repeated clicks idempotent and old screen actions invalid.
 * Ports: repository.load/save, fragments.random/lookup, validate, now, random.
 * No DOM, animation, browser storage or HTTP knowledge belongs in this module.
 */
export function createApplication({ repository, fragments, validate, now = Date.now, random = Math.random, gentle = false }) {
  let graph = newState(), queue = Promise.resolve(), ticket = null, undoRecord = null, pendingCommands = 0;
  const recentPairs = [], recentIds = [];
  const copy = value => structuredClone(value);
  const serial = operation => {
    pendingCommands++;
    const task = queue.then(operation).finally(()=>{pendingCommands--;});
    queue = task.catch(() => {});
    return task;
  };
  async function commit(draft) {
    validate(draft);
    await repository.save(copy(draft));
    graph = draft;
  }
  const explorationFields = ['seen','failures','quarantineUntil'];
  const issuePair = selected => {
    ticket = selected ? {pair:{...selected,pairId:crypto.randomUUID()},status:'open',edgeId:crypto.randomUUID()} : null;
    return ticket ? copy(ticket.pair) : null;
  };
  return {
    snapshot: () => copy(graph),
    canUndo: () => !!undoRecord,
    load: () => serial(async () => {
      const saved = await repository.load();
      graph = saved ? copy(validate(saved)) : newState();
      graph.stats ||= {decisions:0};
      ticket = null; undoRecord = null;
    }),
    refreshFragments: () => serial(async () => {
      const blocks = await fragments.random(), draft = copy(graph);
      mergeBlocks(draft, blocks); await commit(draft);
      return {count:blocks.length};
    }),
    synchronize: () => serial(async () => {
      const checked = await fragments.lookup(Object.keys(graph.nodes),graph.nodes), draft = copy(graph);
      const deleted = reconcile(draft, checked.blocks, checked.checkedIds);
      draft.lastSync = now(); await commit(draft);
      return {deleted};
    }),
    selectNextPair(previous = []) {
      if(pendingCommands)throw new Error('当前操作正在保存，请稍候');
      // Count fragment IDs: normally keep the last 6–12 rounds out of rotation.
      const recentWindow = Math.min(24, Math.max(12, Math.floor(Object.keys(graph.nodes).length / 8)));
      let selected = choosePair(graph, previous, random, now(), { gentle, avoidPairs: recentPairs, avoidIds: recentIds.slice(-recentWindow) });
      if (!selected) selected = choosePair(graph, previous, random, now(), { gentle, avoidPairs: recentPairs });
      if (!selected) selected = choosePair(graph, previous, random, now(), {gentle});
      if (selected) { recentPairs.push([selected.a, selected.b].sort().join('|')); while (recentPairs.length > 18) recentPairs.shift(); recentIds.push(selected.a, selected.b); while (recentIds.length > 2 * recentWindow + 4) recentIds.shift(); }
      return issuePair(selected);
    },
    submitJudgment: command => serial(async () => {
      if (!ticket || command.pairId !== ticket.pair.pairId) throw new Error('这组片段已切换，请使用当前片段');
      if (ticket.status === 'committed') return {...copy(ticket.result), duplicate:true};
      if (!['link','reject','skip'].includes(command.action) || typeof command.thought !== 'string' || command.thought.length > 3000) throw new Error('判断格式无效');
      const {a,b} = ticket.pair;
      const checked = await fragments.lookup([a,b],graph.nodes), draft = copy(graph);
      const usedSnapshot=[a,b].some(id=>!checked.checkedIds.includes(id));
      reconcile(draft, checked.blocks, checked.checkedIds);
      if (draft.nodes[a]?.deleted || draft.nodes[b]?.deleted) {
        await commit(draft);
        ticket.result = {status:'invalidated'}; ticket.status='committed';
        return copy(ticket.result);
      }
      const key=[a,b].sort().join('|');
      const before = {history:copy(draft.history[key]), decisions:draft.stats.decisions, nodes:{}};
      for (const id of [a,b]) before.nodes[id] = Object.fromEntries(explorationFields.map(key=>[key,draft.nodes[id][key]]));
      const oldIds = new Set(draft.edges.map(e=>e.id));
      decide(draft, ticket.pair, command.action, command.thought, now(), {gentle});
      // Reuse a stable edge ID if a save acknowledgement was lost and the user retries.
      const created = draft.edges.find(e=>!oldIds.has(e.id));
      if (created) created.id = ticket.edgeId;
      await commit(draft);
      undoRecord = {before, a,b, pair:copy(ticket.pair), edgeId:created?.id};
      ticket.result = {status:'committed', action:command.action,usedSnapshot}; ticket.status='committed';
      return copy(ticket.result);
    }),
    undoJudgment: () => serial(async () => {
      if (!undoRecord) throw new Error('没有可撤销的判断');
      const draft = copy(graph), {before,a,b,edgeId,pair:originalPair} = undoRecord;
      if (edgeId) draft.edges = draft.edges.filter(e=>e.id!==edgeId);
      const key = [a,b].sort().join('|');
      if (before.history) draft.history[key]=before.history; else delete draft.history[key];
      draft.stats.decisions = before.decisions;
      // Undo exploration only; never restore stale Siyuan text or resurrect deleted blocks.
      for (const id of [a,b]) for(const key of explorationFields) {
        if (before.nodes[id][key] === undefined) delete draft.nodes[id][key]; else draft.nodes[id][key]=before.nodes[id][key];
      }
      await commit(draft); undoRecord=null; ticket=null;
      const pairStillValid=!draft.nodes[a].deleted&&!draft.nodes[b].deleted;
      return issuePair(pairStillValid ? originalPair : choosePair(draft,[],random,now(),{gentle}));
    }),
    editLink: (id, thought) => serial(async () => {
      if (typeof thought !== 'string' || thought.length>3000) throw new Error('思考描述格式无效');
      const draft=copy(graph), edge=draft.edges.find(e=>e.id===id);
      if(!edge)throw new Error('关联已不存在');
      edge.thought=thought.trim(); await commit(draft); undoRecord=null;
    }),
    removeLink: id => serial(async () => {
      const draft=copy(graph);
      if(!draft.edges.some(e=>e.id===id))throw new Error('关联已不存在');
      draft.edges=draft.edges.filter(e=>e.id!==id); await commit(draft); undoRecord=null;
    }),
    importGraph: value => serial(async () => {
      const draft=copy(validate(value)); draft.stats ||= {decisions:0};
      await commit(draft); undoRecord=null; ticket=null;
    })
  };
}
