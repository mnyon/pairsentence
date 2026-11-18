/* HOST ADAPTER — Bilibili is only a launch surface.
 * Closed Shadow DOM isolates styles. Privileged requests/storage remain inside
 * the userscript closure; no token, graph, GM bridge or command is put on window.
 * The document facade scopes existing view code to this tool, not the host page.
 * Closing preserves the draft; hidden tools do not poll or react to host focus.
 */
export function installUserscript({css,html,start}) {
  const hostDocument=globalThis.document,hostWindow=globalThis.window;
  if(hostDocument.getElementById('pairsentence-userscript-host'))return;
  const host=hostDocument.createElement('div');host.id='pairsentence-userscript-host';
  host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;';
  const shadow=host.attachShadow({mode:'closed'});
  const style=hostDocument.createElement('style');style.textContent=css+`
    :host{color-scheme:light}.ps-root{all:initial;position:fixed;inset:0;display:block;background:var(--bg);color:var(--ink);font:14px var(--sans);overflow:auto;overscroll-behavior:contain;pointer-events:auto;z-index:2;-webkit-font-smoothing:antialiased}
    .ps-root[hidden]{display:none!important}.ps-root .topbar{padding-right:86px}.ps-close{position:fixed;right:22px;top:17px;z-index:10;background:#edf2e8;border:1px solid #d9e4d1;border-radius:50%;width:32px;height:32px;font-size:23px;color:#6a805b;cursor:pointer}.ps-launcher{all:initial;position:fixed;right:22px;bottom:26px;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;border:1px solid #ffffff50;border-radius:16px 16px 16px 5px;background:#32664f;color:#f7f7e9;padding:12px 17px;font:14px 'Microsoft YaHei',sans-serif;box-shadow:0 5px 25px #17372435;z-index:1;transition:box-shadow .2s,transform .2s,left .22s,right .22s,top .22s,bottom .22s}.ps-launcher.ps-dragging{cursor:grabbing;transition:none;box-shadow:0 10px 30px #17372455;transform:scale(1.04)}.ps-launcher:hover{background:#28583f;transform:translateY(-2px)}.ps-launcher:focus-visible,.ps-close:focus-visible{outline:2px solid #92b381;outline-offset:4px}.ps-launcher small{font-size:10px;opacity:.7;margin-left:8px}.ps-root .sidebar{z-index:5}@media(max-width:760px){.ps-root .topbar{padding-right:63px}.ps-close{right:15px;top:80px;width:28px;height:28px;font-size:20px}.ps-launcher{right:16px;bottom:20px;padding:11px 14px}.ps-launcher small{display:none}}
  `;
  shadow.append(style);
  const dockStyle=hostDocument.createElement('style');dockStyle.textContent=`
    .ps-launcher.ps-docked{box-sizing:border-box;width:40px;height:48px;padding:0;display:grid;place-items:center;font:21px 'Microsoft YaHei',sans-serif;opacity:.72;box-shadow:0 3px 14px #17372422;border-radius:12px 0 0 12px}
    .ps-launcher.ps-docked[data-side=left]{border-radius:0 12px 12px 0}.ps-launcher.ps-docked small{display:none}.ps-launcher.ps-docked:hover,.ps-launcher.ps-docked:focus-visible{opacity:1;transform:none}.ps-launcher.ps-docked.ps-dragging{opacity:1;transform:scale(1.05)}
    @media(prefers-reduced-motion:reduce){.ps-launcher{transition:none}}
  `;shadow.append(dockStyle);
  const launcher=hostDocument.createElement('button');launcher.className='ps-launcher ps-docked';launcher.innerHTML='间 <small>给想法一个相遇</small>';launcher.title='点击打开 · 拖动调整位置，松开吸附侧边';launcher.setAttribute('aria-label','打开间 · PairSentence，可拖动并吸附侧边');
  const root=hostDocument.createElement('div');root.className='ps-root';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','间 · PairSentence 思考空间');root.tabIndex=-1;
  shadow.append(launcher,root);hostDocument.documentElement.append(host);
  let initialized=false,opening=false,lifecycle=null,previousFocus=null;
  const preferences=new Map();
  // Synchronous view preferences are mirrored to GM, never Bilibili localStorage.
  const preferencesStore={getItem:key=>preferences.get(key)??null,setItem:(key,value)=>{preferences.set(key,String(value));GM.setValue(`pairsentence:preference:${key}`,String(value)).catch(()=>{});},removeItem:key=>{preferences.delete(key);}};
  const focusListeners=[];
  const scopedWindow={addEventListener(type,handler){if(type==='focus'){focusListeners.push(handler);hostWindow.addEventListener(type,()=>{if(!root.hidden)handler();});}}};
  const scopedDocument={body:root,createElement:tag=>hostDocument.createElement(tag),querySelector:selector=>root.querySelector(selector),querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener:(type,handler)=>root.addEventListener(type,handler)};
  const interval=(handler,ms)=>hostWindow.setInterval(()=>{if(!root.hidden)handler();},ms);
  let drag=null,position={side:'right',ratio:.82},positionTouched=false;
  function saveLauncherPosition(side,ratio){positionTouched=true;position={side,ratio};GM.setValue('pairsentence:launcher-position',{side,ratio}).catch(()=>{});}
  function applyLauncherPosition(side='right',ratio=.82){
    side=side==='left'?'left':'right';ratio=Number.isFinite(ratio)?ratio:.82;
    const margin=16,height=launcher.offsetHeight||48,max=Math.max(0,hostWindow.innerHeight-height-margin*2),top=Math.min(Math.max(0,hostWindow.innerHeight-height),margin+Math.round(max*Math.max(0,Math.min(1,ratio))));
    launcher.dataset.side=side;launcher.style.top=`${top}px`;launcher.style.bottom='auto';launcher.style[side]='0px';launcher.style[side==='left'?'right':'left']='auto';
  }
  function finishDrag(clientX,clientY){
    if(!drag)return false;const moved=drag.moved;drag=null;
    if(!moved){launcher.classList.remove('ps-dragging');return false;}
    // Read the pointer's final layout coordinates, not an in-flight CSS transform.
    const left=Number.parseFloat(launcher.style.left)||0,top=Number.parseFloat(launcher.style.top)||0,width=launcher.offsetWidth,height=launcher.offsetHeight;
    const side=left+width/2<hostWindow.innerWidth/2?'left':'right',max=Math.max(1,hostWindow.innerHeight-height-32),ratio=Math.max(0,Math.min(1,(top-16)/max));
    launcher.classList.remove('ps-dragging');
    applyLauncherPosition(side,ratio);saveLauncherPosition(side,ratio);return true;
  }
  launcher.addEventListener('pointerdown',event=>{if(event.button!==undefined&&event.button!==0)return;delete launcher.dataset.dragged;const r=launcher.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:r.left,top:r.top,moved:false};try{launcher.setPointerCapture?.(event.pointerId);}catch{}event.preventDefault();});
  launcher.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>6)drag.moved=true;if(!drag.moved)return;launcher.classList.add('ps-dragging');const x=Math.max(0,Math.min(hostWindow.innerWidth-launcher.offsetWidth,drag.left+dx)),y=Math.max(0,Math.min(hostWindow.innerHeight-launcher.offsetHeight,drag.top+dy));launcher.style.left=`${x}px`;launcher.style.top=`${y}px`;launcher.style.right='auto';launcher.style.bottom='auto';event.preventDefault();});
  launcher.addEventListener('pointerup',event=>{if(finishDrag(event.clientX,event.clientY))launcher.dataset.dragged='yes';});
  launcher.addEventListener('pointercancel',event=>{if(finishDrag(event.clientX,event.clientY))launcher.dataset.dragged='yes';});
  launcher.addEventListener('lostpointercapture',()=>{if(drag&&finishDrag())launcher.dataset.dragged='yes';});
  hostWindow.addEventListener('resize',()=>{if(drag){drag=null;launcher.classList.remove('ps-dragging');}applyLauncherPosition(position.side,position.ratio);});
  function close(){
    if(lifecycle&&!lifecycle.canClose())return;
    if(root.querySelector('dialog[open]'))return;
    root.hidden=true;launcher.hidden=false;launcher.setAttribute('aria-expanded','false');
    (previousFocus?.isConnected?previousFocus:launcher).focus();
  }
  async function open(){
    if(opening)return;
    if(!root.hidden){root.focus();return;}
    opening=true;previousFocus=hostDocument.activeElement;
    root.hidden=false;launcher.hidden=true;launcher.setAttribute('aria-expanded','true');
    try{
      if(!initialized){
        for(const key of ['pairsentence-motion','pairsentence-focus','pairsentence-theme']){const value=await GM.getValue(`pairsentence:preference:${key}`,null);if(value!==null)preferences.set(key,value);}
        root.innerHTML=html;
        const closeButton=hostDocument.createElement('button');closeButton.className='ps-close';closeButton.textContent='×';closeButton.title='收起，返回 Bilibili';closeButton.setAttribute('aria-label','收起工具，返回 Bilibili');closeButton.onclick=close;root.append(closeButton);
        const brand=root.querySelector('.brand');brand.href='#';brand.onclick=event=>event.preventDefault();
        lifecycle=start(scopedDocument,scopedWindow,preferencesStore,interval);
        initialized=true;
      }else focusListeners.forEach(handler=>handler());
      root.focus();
    }catch(error){root.textContent=`打开失败：${error.message}。请刷新页面重试。`;const retry=hostDocument.createElement('button');retry.textContent='返回 Bilibili';retry.onclick=()=>{root.hidden=true;launcher.hidden=false;};root.append(retry);}
    finally{opening=false;}
  }
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!root.querySelector('dialog[open]')){event.preventDefault();close();}
    if(event.key==='Tab'){
      const dialog=root.querySelector('dialog[open]');
      const items=[...(dialog||root).querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[hidden],[inert]')&&el.getClientRects().length);
      const first=items[0],last=items.at(-1),active=shadow.activeElement;
      if(items.length&&(event.shiftKey&&(active===first||active===root)||!event.shiftKey&&(active===last||active===root))){event.preventDefault();(event.shiftKey?last:first).focus();}
    }
    event.stopPropagation();
  });
  launcher.onclick=event=>{if(launcher.dataset.dragged==='yes'&&event.detail!==0){event.preventDefault();delete launcher.dataset.dragged;return;}open();};launcher.setAttribute('aria-expanded','false');
  applyLauncherPosition();
  (async()=>{try{const saved=await GM.getValue('pairsentence:launcher-position',null);if(!positionTouched&&saved){position={side:saved.side==='left'?'left':'right',ratio:Number.isFinite(saved.ratio)?Math.max(0,Math.min(1,saved.ratio)):.82};applyLauncherPosition(position.side,position.ratio);}}catch{}})();
  GM.registerMenuCommand('打开间 · PairSentence',open);
  GM.registerMenuCommand('收起间 · PairSentence',close);
}
