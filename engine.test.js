import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, mergeBlocks, components, decide, choosePair, reconcile, activeEdges, DAY, pairKey } from './engine.js';
function fixture() { const s = newState(); mergeBlocks(s, ['a','b','c','d','e','f'].map(id => ({id,content:`${id} 一段值得思考的内容`,type:'p'}))); return s; }

test('gentle passing cools only the pair, progressively, without quarantining fragments',()=>{
  const s=fixture(), now=Date.now();
  decide(s,{a:'a',b:'b'},'skip','',now,{gentle:true});
  const first=s.history['a|b'].until-now;
  decide(s,{a:'a',b:'b'},'skip','',now+first,{gentle:true});
  assert.equal(s.history['a|b'].skips,2);
  assert.ok(s.history['a|b'].until-(now+first)>first);
  assert.equal(s.nodes.a.failures,0);assert.equal(s.nodes.a.quarantineUntil,undefined);
  s.nodes.a.quarantineUntil=now+DAY;s.stats.decisions=1;
  const pair=choosePair(s,[],()=>.5,now,{gentle:true,avoidIds:['b','d','e','f']});
  assert.deepEqual([pair.a,pair.b],['a','c']);
  const until=s.history['a|b'].until;
  assert.equal(choosePair(s,[],()=>.5,until-1,{gentle:true,avoidIds:['c','d','e','f']}),null);
  assert.ok(choosePair(s,[],()=>.5,until+1,{gentle:true,avoidIds:['c','d','e','f']}));
});
test('bridging components merges them; internal pairs are never suggested', () => {
  const s = fixture(); decide(s,{a:'a',b:'b'},'link'); decide(s,{a:'c',b:'d'},'link');
  const p = choosePair(s, [], () => .1);
  assert.equal(p.kind,'bridge');
  decide(s, p,'link','两个脉络在这里交汇');
  assert.equal(components(s)[0].length,4);
  for(let i=0;i<40;i++) { const next = choosePair(s); assert.ok(next); assert.notEqual(components(s).findIndex(g=>g.includes(next.a)),components(s).findIndex(g=>g.includes(next.b))); }
});
test('three rejections quarantine isolated nodes; skips do not count; linked nodes stay available', () => {
  const s = fixture(), now = Date.now();
  decide(s,{a:'a',b:'b'},'skip','',now); assert.equal(s.nodes.a.failures,0);
  for (const b of ['b','c','d']) decide(s,{a:'a',b},'reject','',now);
  assert.equal(s.nodes.a.quarantineUntil,now+DAY);
  for(let i=0;i<20;i++) { const p=choosePair(s,[],Math.random,now); assert.ok(p.a!=='a'&&p.b!=='a'); }
  const t=fixture(); decide(t,{a:'a',b:'b'},'link','',now);
  for(const b of ['c','d','e']) decide(t,{a:'a',b},'reject','',now);
  assert.equal(t.nodes.a.quarantineUntil,0);
});
test('synchronization updates text, splits deleted bridges, restores original IDs without losing thought', () => {
  const s=fixture(); decide(s,{a:'a',b:'b'},'link','first'); decide(s,{a:'b',b:'c'},'link','second');
  reconcile(s,[{id:'a',content:'新内容'}],['a','b']);
  assert.equal(s.nodes.a.content,'新内容'); assert.equal(activeEdges(s).length,0); assert.equal(components(s)[0].length,1);
  assert.equal(s.edges.length,2);
  reconcile(s,[{id:'b',content:'恢复'}],['b']);
  assert.equal(components(s)[0].length,3); assert.equal(activeEdges(s)[1].thought,'second');
});
test('rejected and skipped pairs respect their cooldowns; duplicate links are prevented',()=>{
  const s=newState(); mergeBlocks(s,[{id:'a',content:'A'},{id:'b',content:'B'}]); const now=Date.now();
  decide(s,{a:'a',b:'b'},'reject','',now); assert.equal(choosePair(s,[],Math.random,now),null);
  assert.ok(choosePair(s,[],Math.random,now+8*DAY));
  decide(s,{a:'a',b:'b'},'link','test',now); decide(s,{a:'b',b:'a'},'link','duplicate',now);
  assert.equal(s.edges.length,1); assert.equal(pairKey('a','b'),pairKey('b','a'));
  assert.equal(choosePair(s),null);
});
