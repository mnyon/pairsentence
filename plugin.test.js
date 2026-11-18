import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildPlugin,zipFiles} from './plugin/build.mjs';
import {createPluginAdapter} from './plugin/adapter.js';
import {newState,mergeBlocks,decide} from './engine.js';
import {createApplication} from './application.js';
import {validateState} from './validation.js';

function workspace() {
  const files=new Map(),calls=[];let failure=null;
  const blocks=[{id:'20261118000000-aaaaaaa',content:'这是一段足够长的笔记正文，用于验证工作空间中的配对。'},{id:'20261118000000-bbbbbbb',content:'另一段不同的笔记正文，让两个想法建立新的联系。'}];
  return {files,calls,blocks,fail:value=>failure=value,async fetcher(url,options) {
    calls.push(url);
    if(failure==='network')throw new Error('offline');
    if(url==='/api/file/getFile') {
      if(failure==='read')return new Response(JSON.stringify({code:-1,msg:'read failed'}));
      const path=JSON.parse(options.body).path;
      return files.has(path)?Response.json(files.get(path)):new Response('',{status:202});
    }
    if(url==='/api/file/putFile') {
      if(failure==='write')return Response.json({code:-1,msg:'disk full'});
      files.set(options.body.get('path'),JSON.parse(await options.body.get('file').text()));
      return Response.json({code:0});
    }
    if(url==='/api/query/sql')return Response.json({code:0,data:blocks});
    throw new Error(url);
  }};
}

test('right sidebar launcher opens a normal tab before the host can split the dock',async()=>{
  const listeners=new Map(),tabs=[],dockCalls=[];
  let removed=false;
  const document={
    addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);listeners.set(type,fn);},
    removeEventListener(type,fn,capture){removed=listeners.get(type)===fn&&capture===true;listeners.delete(type);}
  };
  class Plugin {
    constructor(){this.name='pairsentence';this.app={};}
    addIcons(){}
    addDock(options){this.dock=options;}
    addTab(options){this.tab=options;}
  }
  const module={exports:{}};
  vm.runInNewContext(buildPlugin(),{module,document,AbortController,fetch,require:()=>({Plugin,getFrontend:()=> 'desktop',openTab:async options=>tabs.push(options),toggleRightDock:value=>dockCalls.push(value),showMessage:message=>assert.fail(message)})});
  const plugin=new module.exports();plugin.onload();
  assert.equal(plugin.dock.config.position,'RightTop');
  assert.equal(plugin.dock.config.show,false);
  const click=type=>{
    const event={button:0,prevented:false,stopped:false,target:{closest:()=>({getAttribute:()=>type})},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    listeners.get('click')(event);
    // Host bubble handlers would open the panel only when not stopped.
    if(!event.stopped)dockCalls.push(type);
    return event;
  };
  const own=click('pairsentencelauncher');await Promise.resolve();
  assert.ok(own.prevented&&own.stopped);assert.equal(tabs.length,1);
  assert.equal(tabs[0].custom.id,'pairsentenceworkspace');
  assert.equal(tabs[0].openNewTab,false);assert.equal(tabs[0].position,undefined);
  assert.equal(dockCalls.length,0);
  click('pairsentencelauncher');assert.equal(tabs.length,2);
  const other=click('outline');assert.equal(other.prevented,false);assert.equal(other.stopped,false);
  assert.deepEqual(dockCalls,['outline']);
  plugin.onunload();assert.ok(removed);assert.equal(listeners.size,0);
});
test('plugin package parses, omits external connections and exposes lifecycle',()=>{
  const source=buildPlugin();assert.doesNotThrow(()=>new vm.Script(source));
  for(const unwanted of ['GM.xmlHttpRequest','添加思源来源','source-token','normalizeSources','127.0.0.1','readConfig('])assert.ok(!source.includes(unwanted),unwanted);
  const module={exports:{}};vm.runInNewContext(source,{module,require:()=>({Plugin:class {}})});
  const plugin=new module.exports();assert.equal(typeof plugin.onDataChanged,'function');assert.equal(typeof plugin.onunload,'function');
  assert.equal(zipFiles({'index.js':source}).readUInt32LE(),0x04034b50);
});
test('workspace files move graph and preferences between fresh device adapters',async()=>{
  const w=workspace(),device1=createPluginAdapter({name:'pairsentence',fetcher:w.fetcher});
  assert.equal(await device1.request('/api/state'),null);
  const graph=newState();mergeBlocks(graph,w.blocks);decide(graph,{a:w.blocks[0].id,b:w.blocks[1].id},'link','跨设备保留的思考');
  await device1.request('/api/state',{method:'PUT',body:JSON.stringify(graph)});
  await device1.save('preferences',{'pairsentence-theme':'night'});
  const device2=createPluginAdapter({name:'pairsentence',fetcher:w.fetcher});
  assert.deepEqual(await device2.request('/api/state'),graph);
  assert.deepEqual(await device2.read('preferences'),{'pairsentence-theme':'night'});
  assert.ok(w.calls.every(url=>url.startsWith('/api/')));
});
test('read failures cannot initialize an empty graph and write failures preserve committed graph',async()=>{
  const w=workspace(),adapter=createPluginAdapter({name:'pairsentence',fetcher:w.fetcher});
  w.fail('read');await assert.rejects(adapter.request('/api/state'),/read failed/);
  await assert.rejects(adapter.request('/api/state',{method:'PUT',body:'{}'}),/先成功读取/);
  w.fail(null);
  const app=createApplication({validate:validateState,repository:{load:()=>adapter.request('/api/state'),save:value=>adapter.request('/api/state',{method:'PUT',body:JSON.stringify(value)})},fragments:{random:async()=>(await adapter.request('/api/blocks')).blocks,lookup:ids=>adapter.request('/api/sync',{body:JSON.stringify({ids})})}});
  await app.load();await app.refreshFragments();const before=app.snapshot(),pair=app.selectNextPair();
  w.fail('write');await assert.rejects(app.submitJudgment({pairId:pair.pairId,action:'link',thought:'保留输入'}),/disk full/);
  assert.deepEqual(app.snapshot(),before);
  w.fail(null);await app.submitJudgment({pairId:pair.pairId,action:'link',thought:'重试成功'});assert.equal(app.snapshot().edges.length,1);
});
test('current workspace checks imported IDs regardless of old source addresses',async()=>{
  const w=workspace(),adapter=createPluginAdapter({name:'pairsentence',fetcher:w.fetcher});
  const ids=[...w.blocks.map(b=>b.id),'20261118000000-missing'];
  const result=await adapter.request('/api/sync',{body:JSON.stringify({ids,sourcesById:{[ids[2]]:['http://127.0.0.1:3684']}})});
  assert.deepEqual(result.checkedIds,ids);
  w.fail('network');await assert.rejects(adapter.request('/api/sync',{body:JSON.stringify({ids})}),/offline/);
  await assert.rejects(adapter.request('/api/sync',{body:JSON.stringify({ids:["' OR 1=1"]})}),/块 ID 无效/);
});
