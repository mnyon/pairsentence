import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { buildStandalone, buildUserscript } from './build.mjs';
import { validateState } from './io.js';
import { newState, mergeBlocks, decide } from './engine.js';

test('standalone bundle is self-contained, valid JavaScript and contains no local secrets',()=>{
  const html=buildStandalone();
  assert.ok(!html.includes('type="module"'));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/<link[^>]+stylesheet/.test(html));
  assert.ok(!html.includes('fonts.googleapis.com'));
  const sample=new URL('./sample.js',import.meta.url);
  const token=fs.existsSync(sample)?fs.readFileSync(sample,'utf8').match(/TOKEN:\s*'([^']+)'/)?.[1]:null;
  if(token)assert.ok(!html.includes(token));
  const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('backup accepts real graph round trips and rejects corrupt or unsafe references',()=>{
  const s=newState();mergeBlocks(s,[{id:'a',content:'甲'},{id:'b',content:'乙'}]);decide(s,{a:'a',b:'b'},'link','一句思考');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  const dangling=structuredClone(s);delete dangling.nodes.b;assert.throws(()=>validateState(dangling));
  const badThought=structuredClone(s);badThought.edges[0].thought={};assert.throws(()=>validateState(badThought));
  const badHistory=structuredClone(s);badHistory.history['a|b'].until='never';assert.throws(()=>validateState(badHistory));
  assert.throws(()=>validateState(JSON.parse('{"version":1,"nodes":{"__proto__":{"id":"__proto__","content":"bad"}},"edges":[],"history":{}}')));
});

test('userscript is parseable, scoped to Bilibili, lazily mounted, and contains no credentials',()=>{
  const script=buildUserscript();assert.doesNotThrow(()=>new vm.Script(script));
  assert.ok(script.includes('// @match        https://*.bilibili.com/*'));
  assert.ok(!script.includes('// @match        *://*/*'));
  assert.ok(script.includes('// @noframes'));
  for(const grant of ['GM.getValue','GM.setValue','GM.xmlHttpRequest','GM.registerMenuCommand'])assert.ok(script.includes(`// @grant        ${grant}`));
  assert.ok(script.includes("attachShadow({mode:'closed'})"));
  assert.ok(!script.includes('edge-.ps-root'));
  assert.ok(script.includes('.edge-body'));
  assert.ok(script.includes('lifecycle=start('));
  assert.ok(!script.includes('unsafeWindow'));
  const sample=new URL('./sample.js',import.meta.url);
  const token=fs.existsSync(sample)?fs.readFileSync(sample,'utf8').match(/TOKEN:\s*'([^']+)'/)?.[1]:null;if(token)assert.ok(!script.includes(token));
});
