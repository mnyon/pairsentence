const {Plugin, getFrontend, openTab, openMobileFileById, showMessage, toggleRightDock} = require('siyuan');

module.exports = class PairSentencePlugin extends Plugin {
  onload() {
    this.disposed=false;
    this.controller=new AbortController();
    this.preferences={};
    this.pendingData=false;
    this.adapter=createPluginAdapter({name:this.name,signal:this.controller.signal});
    this.adapter.hostTheme=()=>{
      const mode=globalThis.siyuan?.config?.appearance?.mode;
      const dark=mode!==undefined?Number(mode)===1:document.documentElement.dataset.themeMode==='dark'||matchMedia('(prefers-color-scheme: dark)').matches;
      return dark?'night':'forest';
    };
    const request=this.adapter.request;
    this.adapter.request=(url,options)=>{
      if(this.pendingData&&!this.reloading&&options?.method==='PUT')throw new Error('思源同步数据已更新，请清空未提交的思考后重新打开 PairSentence');
      return request(url,options);
    };
    this.preferenceQueue=Promise.resolve();
    this.addIcons(`<symbol id="iconPairSentence" viewBox="0 0 160 160"><image href="${PLUGIN_ICON}" width="160" height="160"/></symbol>`);
    this.isMobile=['mobile','browser-mobile'].includes(getFrontend());
    this.adapter.isMobile=this.isMobile;
    if(!this.isMobile){
      const plugin=this;
      // The dock API creates an entry plus a panel. Capture our entry before the
      // host opens that panel: this plugin uses the dock only as a tab launcher.
      this.dockClick=event=>{
        const entry=event.target.closest?.('.dock__item');
        if(entry?.getAttribute('data-type')!==this.name+'launcher'||event.button>0)return;
        event.preventDefault();event.stopImmediatePropagation();
        this.open().catch(e=>showMessage(e.message));
      };
      document.addEventListener('click',this.dockClick,true);
      this.addDock({type:'launcher',config:{position:'RightTop',size:{width:240,height:0},icon:'iconPairSentence',title:'PairSentence',show:false},data:{},
        init(){
          // A previously saved open panel can be restored at startup. Close it
          // after the host has finished its synchronous panel construction.
          queueMicrotask(()=>{if(!plugin.disposed)toggleRightDock(false);});
        }
      });
      this.addTab({type:'workspace',init(){
        plugin.tabElement=this.element;
        Object.assign(this.element.style,{position:'relative',height:'100%',overflow:'hidden'});
        plugin.prepare(this.element).catch(e=>showMessage(e.message));
      },destroy(){
        if(plugin.tabElement===this.element){plugin.host?.remove();plugin.tabElement=null;}
      }});
    }
  }
  onLayoutReady() {
    this.layoutReady=true;
    if(globalThis.siyuan?.config?.readonly || globalThis.siyuan?.isPublish)return;
    if(this.isMobile)this.addTopBar({icon:'iconPairSentence',title:'PairSentence',position:'right',callback:()=>this.open().catch(e=>showMessage(e.message))});
  }
  async open() {
    if(!this.isMobile){
      if(this.disposed)return;
      await openTab({app:this.app,custom:{id:this.name+'workspace',icon:'iconPairSentence',title:'PairSentence'},openNewTab:false});
      if(this.pendingData&&this.host)await this.reload();
      return;
    }
    return this.prepare();
  }
  async prepare(parent) {
    if(this.disposed||this.opening)return;
    this.opening=true;
    try {
      if(!this.host) {
        const preferences=await this.adapter.read('preferences');
        if(this.disposed)return;
        this.preferences=preferences||{};
        this.mount(parent);
      }
      if(this.isMobile){if(!this.host.open)this.host.showModal();}
      else if(parent)parent.append(this.host);
      if(this.pendingData)await this.reload();
      this.root.focus();
    } finally {this.opening=false;}
  }
  mount(parent) {
    const host=document.createElement(this.isMobile?'dialog':'div');
    host.setAttribute('aria-label','PairSentence');
    host.style.cssText=this.isMobile?'border:0;padding:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;background:transparent;':'position:absolute;inset:0;overflow:hidden;';
    const container=document.createElement('div');host.append(container);
    const shadow=container.attachShadow({mode:'open'});
    const style=document.createElement('style');style.textContent=PLUGIN_CSS;
    const root=document.createElement('div');root.className='ps-root'+(this.isMobile?' ps-mobile':' ps-tab');root.tabIndex=-1;
    root.innerHTML=PLUGIN_HTML;
    // Keep mobile thoughts in the reading flow so the source fragments remain
    // available without dismissing a modal or a keyboard opening automatically.
    if(this.isMobile)root.querySelector('#decision-panel').append(root.querySelector('#thought-dialog'));
    const close=document.createElement('button');close.className='ps-close';close.textContent='×';close.title='返回思源';close.setAttribute('aria-label','收起 PairSentence，返回思源');
    close.onclick=()=>this.close();if(this.isMobile)root.append(close);shadow.append(style,root);(parent||document.body).append(host);
    this.host=host;this.root=root;
    const cleanupMobileInputs=this.isMobile?bindMobileInputs(root):()=>{};
    host.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    root.querySelector('.brand').onclick=e=>e.preventDefault();
    root.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a[href^="siyuan://blocks/"]');if(!anchor)return;
      event.preventDefault();if(this.isMobile&&!this.close())return;
      const id=decodeURIComponent(anchor.getAttribute('href').split('/').pop());
      if(['mobile','browser-mobile'].includes(getFrontend()))openMobileFileById(this.app,id);
      else openTab({app:this.app,doc:{id}});
    });
    const listeners=[],intervals=[],timeouts=[];
    const scopedDocument={body:root,createElement:tag=>document.createElement(tag),querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),addEventListener:(...args)=>root.addEventListener(...args)};
    const scopedWindow={addEventListener:(type,fn)=>{const wrapped=()=>{if(this.isVisible()&&!this.disposed){if(this.pendingData)this.reload();else fn();}};window.addEventListener(type,wrapped);listeners.push([type,wrapped]);}};
    const storage={getItem:key=>this.preferences[key]??null,setItem:(key,value)=>{
      if(this.preferences[key]===String(value))return;
      this.preferences[key]=String(value);
      const snapshot={...this.preferences};
      this.preferenceQueue=this.preferenceQueue.then(()=>{if(!this.disposed)return this.adapter.save('preferences',snapshot);}).catch(e=>showMessage(`偏好保存失败：${e.message}`));
    },removeItem:key=>{delete this.preferences[key];}};
    this.cleanup=()=>{cleanupMobileInputs();for(const [type,fn] of listeners)window.removeEventListener(type,fn);intervals.forEach(clearInterval);timeouts.forEach(clearTimeout);root.getAnimations({subtree:true}).forEach(a=>a.cancel());host.remove();};
    this.lifecycle=startPairSentence(scopedDocument,scopedWindow,storage,(fn,ms)=>{const id=setInterval(()=>{if(this.isVisible()&&!this.pendingData&&!this.disposed)fn();},ms);intervals.push(id);return id;},(fn,ms)=>{const id=setTimeout(()=>{if(!this.disposed)fn();},ms);timeouts.push(id);return id;},this.adapter);
  }
  isVisible(){return !!this.host?.isConnected&&(this.isMobile?this.host.open:this.host.getClientRects().length>0);}
  close() {
    if(!this.lifecycle?.canClose())return false;
    if(this.root.querySelector('dialog[open]'))return false;
    this.host.close();return true;
  }
  async reload() {
    if(!this.lifecycle||this.reloading||this.disposed)return;
    if(!this.lifecycle.canReload()){showMessage('收到同步数据，请完成当前操作并清空未提交的思考，再收起并打开 PairSentence 以加载。');return;}
    this.reloading=true;
    try {
      await this.preferenceQueue;
      const preferences=await this.adapter.read('preferences');
      if(this.disposed)return;
      this.preferences=preferences||{};
      await this.lifecycle.reload();
      this.pendingData=false;
    } catch(e){showMessage(`同步数据读取失败：${e.message}`);}
    finally{this.reloading=false;}
  }
  onDataChanged() {
    this.pendingData=true;
    if(this.isVisible())return this.reload();
  }
  onunload() {
    if(this.dockClick)document.removeEventListener('click',this.dockClick,true);
    this.disposed=true;this.controller?.abort();this.cleanup?.();this.host=null;this.lifecycle=null;
  }
};

function startPairSentence(document,window,localStorage,setInterval,setTimeout,adapter) {
/* PAIRSENTENCE_APP */
}

/* PAIRSENTENCE_ADAPTER */
