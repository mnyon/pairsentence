import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from './application.js';
import {newState, mergeBlocks} from './engine.js';
import {validateState} from './io.js';

function fixture() {
  let disk=newState(), fail=false, gate=null, calls=0;
  let source=['a','b','c','d'].map(id=>({id,content:`${id} 原始段落`,type:'p'}));
  mergeBlocks(disk,source);
  const app=createApplication({validate:validateState,random:()=>.1,now:()=>123456,
    repository:{load:async()=>structuredClone(disk),save:async value=>{calls++;if(gate)await gate;if(fail)throw new Error('disk full');disk=structuredClone(value);}},
    fragments:{random:async()=>structuredClone(source),lookup:async ids=>({blocks:structuredClone(source.filter(n=>ids.includes(n.id))),checkedIds:ids})}
  });
  return {app,get disk(){return disk;},get calls(){return calls;},set fail(v){fail=v;},set gate(v){gate=v;},set source(v){source=v;}};
}

test('gentle passing survives reload and undo restores pair history without node penalties',async()=>{
  const graph=newState();mergeBlocks(graph,['a','b','c'].map(id=>({id,content:id})));
  let disk=graph;
  const ports={gentle:true,validate:validateState,random:()=>.1,now:()=>123456,
    repository:{load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value);}},
    fragments:{lookup:async ids=>({blocks:ids.map(id=>disk.nodes[id]),checkedIds:ids})}};
  const app=createApplication(ports);await app.load();const pair=app.selectNextPair();
  const before=app.snapshot();await app.submitJudgment({pairId:pair.pairId,action:'skip',thought:''});
  const key=[pair.a,pair.b].sort().join('|');assert.equal(disk.history[key].skips,1);
  const resumed=createApplication(ports);await resumed.load();assert.equal(resumed.snapshot().history[key].skips,1);
  await app.undoJudgment();assert.deepEqual(app.snapshot(),before);assert.equal(disk.history[key],undefined);
});
test('judgment failure publishes nothing; same ticket retries a whole judgment once',async()=>{
  const f=fixture();await f.app.load();const p=f.app.selectNextPair(),before=f.app.snapshot();f.fail=true;
  const cmd={pairId:p.pairId,action:'link',thought:'完整思考'};
  await assert.rejects(f.app.submitJudgment(cmd),/disk full/);
  assert.deepEqual(f.app.snapshot(),before);assert.deepEqual(f.disk,before);assert.equal(f.app.canUndo(),false);
  f.fail=false;await f.app.submitJudgment(cmd);
  const saved=f.app.snapshot();assert.equal(saved.edges.length,1);assert.equal(saved.edges[0].thought,'完整思考');assert.equal(saved.stats.decisions,1);
  assert.deepEqual(saved,f.disk);
  const duplicate=await f.app.submitJudgment(cmd);assert.equal(duplicate.duplicate,true);assert.equal(f.app.snapshot().stats.decisions,1);
});
test('save completes before publication; duplicate clicks serialize and stale pair IDs fail',async()=>{
  const f=fixture();await f.app.load();const p=f.app.selectNextPair();let release;f.gate=new Promise(r=>release=r);
  const command={pairId:p.pairId,action:'reject',thought:''};
  const first=f.app.submitJudgment(command),second=f.app.submitJudgment(command);
  await new Promise(r=>setImmediate(r));assert.equal(f.app.snapshot().stats.decisions,0);
  assert.throws(()=>f.app.selectNextPair(),/正在保存/);
  release();await first;assert.equal((await second).duplicate,true);assert.equal(f.calls,1);
  f.app.selectNextPair();await assert.rejects(f.app.submitJudgment(command),/已切换/);
});
test('sync and import failures preserve published state; snapshots cannot change graph',async()=>{
  const f=fixture();await f.app.load();const before=f.app.snapshot();const exposed=f.app.snapshot();exposed.nodes.a.content='非法界面写入';assert.deepEqual(f.app.snapshot(),before);
  f.source=[{id:'a',content:'新的正文'}];f.fail=true;
  await assert.rejects(f.app.synchronize());assert.deepEqual(f.app.snapshot(),before);
  await assert.rejects(f.app.importGraph(newState()));assert.deepEqual(f.app.snapshot(),before);
  f.fail=false;await f.app.synchronize();assert.equal(f.app.snapshot().nodes.a.content,'新的正文');assert.equal(f.app.snapshot().nodes.b.deleted,true);
});
test('deleted fragments save invalidation but never create a judgment',async()=>{
  const f=fixture();await f.app.load();const p=f.app.selectNextPair();f.source=[];
  const result=await f.app.submitJudgment({pairId:p.pairId,action:'link',thought:'无效'});
  assert.equal(result.status,'invalidated');assert.equal(f.disk.edges.length,0);assert.equal(f.disk.stats.decisions,0);assert.equal(f.disk.nodes[p.a].deleted,true);
});
test('undo failure keeps undo available; successful undo preserves latest text and deletion',async()=>{
  const f=fixture();await f.app.load();const p=f.app.selectNextPair();await f.app.submitJudgment({pairId:p.pairId,action:'link',thought:'测试'});
  f.source=[{id:p.a,content:'同步后的正文'}];await f.app.synchronize();const before=f.app.snapshot();f.fail=true;
  await assert.rejects(f.app.undoJudgment());assert.deepEqual(f.app.snapshot(),before);assert.equal(f.app.canUndo(),true);
  f.fail=false;await f.app.undoJudgment();const after=f.app.snapshot();assert.equal(after.edges.length,0);assert.equal(after.stats.decisions,0);assert.equal(after.nodes[p.a].content,'同步后的正文');assert.equal(after.nodes[p.b].deleted,true);
});
test('editing and removal are atomic and a rejected command does not poison later commands',async()=>{
  const f=fixture();await f.app.load();const p=f.app.selectNextPair();await f.app.submitJudgment({pairId:p.pairId,action:'link',thought:'原思考'});const id=f.app.snapshot().edges[0].id;
  f.fail=true;await assert.rejects(f.app.editLink(id,'新思考'));await assert.rejects(f.app.removeLink(id));assert.equal(f.app.snapshot().edges[0].thought,'原思考');
  f.fail=false;await f.app.editLink(id,'新思考');assert.equal(f.disk.edges[0].thought,'新思考');await f.app.removeLink(id);assert.equal(f.disk.edges.length,0);
});

test('large libraries avoid fragments from recent rounds even with deterministic random',async()=>{
  const state=newState();mergeBlocks(state,Array.from({length:80},(_,i)=>({id:`n${i}`,content:'相同内容用来验证候选新鲜感'})));
  const app=createApplication({validate:validateState,random:()=>.1,repository:{load:async()=>state,save:async()=>{}},fragments:{}});
  await app.load();const seen=new Set();
  for(let i=0;i<7;i++){const p=app.selectNextPair();assert.ok(p);assert.equal(seen.has(p.a),false);assert.equal(seen.has(p.b),false);seen.add(p.a);seen.add(p.b);}
});
test('unverified cached fragments can create a saved relationship while all sources are offline',async()=>{
  const state=newState();mergeBlocks(state,[{id:'a',content:'离线正文甲'},{id:'b',content:'离线正文乙'}]);let saved;
  const app=createApplication({validate:validateState,repository:{load:async()=>state,save:async s=>saved=s},fragments:{lookup:async()=>({blocks:[],checkedIds:[]})}});
  await app.load();const p=app.selectNextPair();const result=await app.submitJudgment({pairId:p.pairId,action:'link',thought:'即使离线也保留思考'});
  assert.equal(result.usedSnapshot,true);assert.equal(saved.edges.length,1);assert.equal(saved.nodes.a.deleted,false);assert.equal(saved.nodes.a.content,'离线正文甲');
});
test('source cleanup is atomic, retains shared and unknown fragments, removes dangling history',async()=>{
  const s=newState();mergeBlocks(s,[{id:'a',content:'独有',sourceUrls:['one']},{id:'b',content:'共享',sourceUrls:['one','two']},{id:'c',content:'旧节点未知来源'}]);
  s.edges=[{id:'edge1',a:'a',b:'b',thought:'要清理',created:1},{id:'edge2',a:'b',b:'c',thought:'要保留',created:2}];s.history['a|b']={action:'link',until:999};
  let fail=true,saved;
  const app=createApplication({validate:validateState,repository:{load:async()=>s,save:async d=>{if(fail)throw new Error('save failed');saved=d;}},fragments:{}});
  await app.load();assert.deepEqual(app.sourceImpact('one'),{fragments:1,links:1,thoughts:1});
  await assert.rejects(app.cleanSource('one'));assert.deepEqual(app.snapshot(),s);
  fail=false;await app.cleanSource('one');assert.equal(saved.nodes.a,undefined);assert.ok(saved.nodes.b&&saved.nodes.c);assert.deepEqual(saved.nodes.b.sourceUrls,['two']);assert.equal(saved.edges.length,1);assert.equal(saved.edges[0].thought,'要保留');assert.deepEqual(saved.history,{});
});
