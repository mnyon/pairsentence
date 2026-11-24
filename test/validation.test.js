import test from 'node:test';
import assert from 'node:assert/strict';
import {validateState} from '../src/domain/validation.js';
import {newState,mergeBlocks,decide} from '../src/domain/engine.js';

test('backup accepts real graph round trips and rejects corrupt or unsafe references',()=>{
  const s=newState();mergeBlocks(s,[{id:'a',content:'甲'},{id:'b',content:'乙'}]);decide(s,{a:'a',b:'b'},'link','一句思考');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  const dangling=structuredClone(s);delete dangling.nodes.b;assert.throws(()=>validateState(dangling));
  const badThought=structuredClone(s);badThought.edges[0].thought={};assert.throws(()=>validateState(badThought));
  const badHistory=structuredClone(s);badHistory.history['a|b'].until='never';assert.throws(()=>validateState(badHistory));
  assert.throws(()=>validateState(JSON.parse('{"version":1,"nodes":{"__proto__":{"id":"__proto__","content":"bad"}},"edges":[],"history":{}}')));
});

