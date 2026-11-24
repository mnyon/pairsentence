import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMobileInputs} from '../src/adapters/host/mobile-input.js';

test('mobile input taps enable native focus before IME activation and clean up listeners',()=>{
  for(const platform of ['JSAndroid','JSHarmony','browser']){
    const handlers=new Map(),calls=[];
    const root={addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:(type,fn)=>{assert.equal(handlers.get(type),fn);handlers.delete(type);}};
    const bridge={setWebViewFocusable:value=>calls.push(['focusable',value]),showKeyboard:()=>calls.push('keyboard')};
    const cleanup=bindMobileInputs(root,platform==='browser'?{}:{[platform]:bridge});
    assert.deepEqual(calls,[]); // Opening the editor alone does not summon the IME.
    const input={tagName:'TEXTAREA',focus:options=>calls.push(['focus',options])};
    const event={target:{closest:()=>input}};
    handlers.get('touchstart')(event);handlers.get('click')(event);
    assert.deepEqual(calls,platform==='browser'?[['focus',{preventScroll:true}]]:[['focusable',true],['focusable',true],['focus',{preventScroll:true}],'keyboard']);
    calls.length=0;
    for(const restricted of [{disabled:true},{readOnly:true},{tagName:'INPUT',type:'file'}]){
      Object.assign(input,{disabled:false,readOnly:false,tagName:'TEXTAREA'},restricted);
      handlers.get('touchstart')(event);handlers.get('click')(event);
    }
    handlers.get('click')({target:{closest:()=>null}});
    assert.deepEqual(calls,[]);
    cleanup();assert.equal(handlers.size,0);
  }
});
