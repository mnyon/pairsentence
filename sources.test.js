import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSources,createSourcePool} from './sources.js';
test('legacy connection migrates without resetting graph and duplicate addresses fail',()=>{
  assert.equal(normalizeSources({url:'http://127.0.0.1:6806',token:'old'})[0].token,'old');
  assert.throws(()=>normalizeSources({sources:[{url:'http://localhost:6806'},{url:'http://127.0.0.1:6806'}]}));
});
test('sources mix in one pool, deduplicate IDs and never leak tokens into fragments',async()=>{
  const sources=[{url:'http://127.0.0.1:6806',token:'secret-a'},{url:'http://127.0.0.1:3684',token:'secret-b'}];
  let offline=false;
  const pool=createSourcePool({readSources:async()=>sources,query:async(stmt,s)=>{
    if(offline&&s===sources[1])throw new Error('offline');
    return s===sources[0]?[{id:'a',content:'甲'},{id:'shared',content:'共用'}]:[{id:'b',content:'乙'},{id:'shared',content:'副本'}];
  }});
  const random=await pool.random();assert.equal(random.blocks.length,3);assert.equal(random.blocks.find(b=>b.id==='shared').sourceUrls.length,2);assert.equal(JSON.stringify(random).includes('secret-'),false);
  offline=true;const checked=await pool.lookup(['a','b','gone'],{b:[sources[1].url]});
  assert.deepEqual(checked.checkedIds,['a']);assert.equal(checked.warnings.length,1);
  offline=false;const complete=await pool.lookup(['a','b','gone']);assert.ok(complete.checkedIds.includes('gone'));
  const removed=await pool.lookup(['gone'],{gone:['http://127.0.0.1:9999']});assert.equal(removed.checkedIds.length,0);
});
test('all sources offline or disconnected returns uncertainty, never deletions',async()=>{
  let sources=[{url:'http://127.0.0.1:6806',enabled:true}];let calls=0;
  const pool=createSourcePool({readSources:async()=>sources,query:async()=>{calls++;throw new Error('offline');}});
  const offline=await pool.lookup(['a']);assert.deepEqual(offline.checkedIds,[]);assert.equal(offline.warnings.length,1);
  sources=[{...sources[0],enabled:false}];calls=0;
  const disconnected=await pool.lookup(['a']);assert.equal(calls,0);assert.deepEqual(disconnected.checkedIds,[]);assert.equal(disconnected.allOnline,false);
  sources.push({url:'http://127.0.0.1:3684',enabled:true});
  const partiallyDisconnected=await pool.lookup(['old-unknown']);assert.deepEqual(partiallyDisconnected.checkedIds,[]);
});
