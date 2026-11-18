import test from 'node:test';
import assert from 'node:assert/strict';

test('GM adapter stores independently and checks transport/business failures before reconciling',async()=>{
  const old=globalThis.GM,values=new Map();let failSave=false,status=200,code=0,calls=[];
  globalThis.GM={
    getValue:async(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,
    setValue:async(key,value)=>{if(failSave)throw new Error('GM storage failed');values.set(key,structuredClone(value));},
    xmlHttpRequest:options=>{calls.push(options);queueMicrotask(()=>options.onload({status,responseText:JSON.stringify({code,msg:code?'query failed':'',data:[{id:'a',content:'测试'}]})}));}
  };
  try{
    const io=await import('./io.js?userscript-adapter-test');
    assert.equal(io.userscript,true);assert.equal(io.standalone,true);
    await io.writeConfig({url:'http://127.0.0.1:6806',token:'test-token'});
    const rows=await io.queryDirect('SELECT id FROM blocks');assert.equal(rows[0].id,'a');
    assert.equal(calls[0].url,'http://127.0.0.1:6806/api/query/sql');assert.equal(calls[0].anonymous,true);assert.equal(calls[0].headers.Authorization,'Token test-token');
    await assert.rejects(io.writeConfig({url:'https://www.bilibili.com',token:'x'}));
    status=403;await assert.rejects(io.queryDirect('SELECT id FROM blocks'),/未授权/);
    status=200;code=-1;await assert.rejects(io.queryDirect('SELECT id FROM blocks'),/query failed/);
    failSave=true;await assert.rejects(io.localData('graph',{version:1}),/storage failed/);assert.equal(values.has('pairsentence:graph'),false);
  }finally{if(old===undefined)delete globalThis.GM;else globalThis.GM=old;}
});
