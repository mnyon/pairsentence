import test from 'node:test';
import assert from 'node:assert/strict';
import {blockHref} from '../src/adapters/siyuan/navigation.js';
test('blocks always use native navigation, including imported HTTP source metadata',()=>{
  const id='20240915104811-7qrz7op';
  for(const sourceUrls of [undefined,['http://127.0.0.1:6806'],['http://127.0.0.1:3684']]){
    assert.equal(blockHref({id,sourceUrls}),`siyuan://blocks/${id}`);
  }
  assert.equal(blockHref({id:'a?b#c'}),'siyuan://blocks/a%3Fb%23c');
  assert.throws(()=>blockHref({}));
});
