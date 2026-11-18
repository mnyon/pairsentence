import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const plain=source=>source.replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
export function buildPlugin() {
  let app=plain(read('app.js'));
  app=app.replace("$('#export-button').onclick = exportGraph;",'');
  app=app.replace('点击节点回到思源 · 悬停连线查看思考','点击节点回到思源');
  app=app.replace('间-思考图谱-','PairSentence-思考图谱-');
  app=app.replace('createApplication({','createApplication({gentle:true,');
  app=app.replace("$('#link-button').onclick = () => perform('link'); $('#reject-button').onclick = () => perform('reject'); $('#skip-button').onclick = () => perform('skip');",`function beginLink(){
    if(busy||syncing||previewing||!pair)return;
    const editor=$('#thought-dialog');
    if(adapter.isMobile){if(!editor.open)editor.show();document.body.focus({preventScroll:true});editor.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});}
    else{if(!editor.open)editor.showModal();$('#thought').focus();}
  }
  $('#link-button').onclick=beginLink;
  $('#skip-button').onclick=()=>perform('skip');
  $('#confirm-link').onclick=()=>perform('link');
  $('#thought-dialog').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();perform('link');}});`);
  app=app.replace("e.preventDefault(); perform('link');","e.preventDefault(); beginLink();");
  app=app.replace("['link-button','reject-button','skip-button','preview-motion']","['link-button','confirm-link','skip-button','preview-motion']");
  app=app.replace('function nextPair() {',"function nextPair() {\n  if($('#thought-dialog').open)$('#thought-dialog').close();");
  app=app.replace('if(result.duplicate)return;',"if(result.duplicate)return;\n    if($('#thought-dialog').open)$('#thought-dialog').close();");
  const start=app.indexOf('async function showSettings()'),end=app.indexOf("$('#settings-button').onclick=showSettings;");
  app=app.slice(0,start)+`async function showSettings(){
    if(busy||syncing||previewing){toast('请稍候，当前交互正在完成');return;}
    $('#settings-dialog').showModal();
  }
  `+app.slice(end);
  const form=app.indexOf("$('#connection-form').onsubmit="),importStart=app.indexOf('let pendingImport=null;');
  app=app.slice(0,form)+app.slice(importStart);
  app=app.replace("if(standalone&&(!ready||!Object.keys(state.nodes).length))await showSettings();",'');
  app=app.replace('boot();',`const started=boot().catch(error=>toast(error.message));
  return {canClose(){if(busy||syncing||previewing){toast('正在完成当前操作，请稍候');return false;}return true;},
    canReload:()=>!busy&&!syncing&&!previewing&&!$('#thought').value&&!document.querySelector('.edit-thought')&&!pendingImport,
    async reload(){await started;setTheme(localStorage.getItem('pairsentence-theme')||'forest');motionMode=motionPreference();updateMotionButtons();setFocus(localStorage.getItem('pairsentence-focus')==='1');await init();}
  };`);
  app=app.replace('counters(); drawPair(); if (view === \'graph\') drawGraph(); }','counters(); drawPair(); if (view === \'graph\') drawGraph(); throw e; }');
  app=app.replace('请确认思源已启动，并开启了本机 API 服务。','当前工作空间尚未读到足够片段，请检查笔记或重试。');
  app=app.replace('共享图谱 · 实时同步','当前工作空间 · 随思源同步');
  app=app.replace(/function connected\(ok\) \{[\s\S]*?\n\}/,'function connected(ok) {}');
  app=app.replace("$('#sync-button').onclick = () => ready ? sync() : init();",'');
  app=app.replace("$('#sync-button').classList.add('spinning');",'').replace("$('#sync-button').classList.remove('spinning');",'');
  // Native tabs already provide a workspace shell; navigation belongs in one row.
  const focusStart=app.indexOf('function setFocus(focused)'),focusEnd=app.indexOf('async function showSettings()');
  app=app.slice(0,focusStart)+app.slice(focusEnd);
  app=app.replace("setFocus(localStorage.getItem('pairsentence-focus')==='1');",'');
  app=app.replace("$('#page-name').textContent = next === 'pair' ? '发现关联' : '思考图谱';",'');
  app=app.replace("$('#focus-graph').textContent=next==='pair'?'思考图谱 ↗':'返回比对 ↗';",'');
  app=app.replace("$('#settings-dialog').showModal();","switchView('settings');");
  app=app.replace("$('#settings-button').onclick=showSettings;",'');
  app=app.replaceAll("document.querySelectorAll('.paragraph-card')","document.querySelectorAll('#pair-stage .paragraph-card')");
  app=app.replace("$('#settings-dialog').close();toast('图谱已导入');","toast('图谱已导入');");
  app=app.replace("finally{busy=false;$('#confirm-import').disabled=false;}","finally{busy=false;$('#confirm-import').disabled=false;if(!pendingImport)switchView('graph');}");
  app=app.replace("$('#graph-view').hidden = next !== 'graph';", "$('#graph-view').hidden = next !== 'graph'; $('#settings-view').hidden = next !== 'settings';");
  app=app.replace("await playMotion($('#pair-stage'),motionMode,'link',true);", "await playMotion(view==='settings'?$('#settings-preview'):$('#pair-stage'),motionMode,'link',true);");
  app=app.replace('if(busy || syncing || previewing || !pair) return;','if(busy || syncing || previewing || (!pair && view!==\'settings\')) return;');
  const themeStart=app.indexOf("const themes=['forest'"),themeEnd=app.indexOf("$('#settings-export').onclick=exportGraph;");
  app=app.slice(0,themeStart)+`const themes=['auto','forest','sand','ocean','night'];
  function setTheme(theme){
    if(!themes.includes(theme))theme='auto';
    document.body.dataset.theme=theme==='auto'?adapter.hostTheme():theme;
    $('#theme-select').value=theme;
    try{localStorage.setItem('pairsentence-theme',theme);}catch{}
  }
  $('#theme-select').onchange=e=>setTheme(e.target.value);
  setTheme(localStorage.getItem('pairsentence-theme')||'auto');
  `+app.slice(themeEnd);
  app=app.replace("localStorage.getItem('pairsentence-theme')||'forest'", "localStorage.getItem('pairsentence-theme')||'auto'");
  let html=read('index.html').match(/<body>([\s\S]*?)<script type="module"/)[1];
  html=html.replace(/<button id="export-button"[^>]*>[\s\S]*?<\/button>/,'');
  html=html.replace('aria-label="间，首页"','aria-label="PairSentence，首页"').replace('<span class="brand-mark">间</span>','<span class="brand-mark">🌱</span>');
  html=html.replace(/<div class="thought-label">[\s\S]*?<div class="decision-actions">/, '<div class="decision-actions">');
  html=html.replace(/<button id="reject-button"[\s\S]*?<\/button>/,'');
  html=html.replace('先跳过 <span>→</span>','换一组 <span>→</span>');
  html+=`<dialog id="thought-dialog" aria-labelledby="thought-heading"><button class="dialog-close icon-button" aria-label="返回阅读">×</button><h2 id="thought-heading">是什么，让它们相遇？</h2><p>可以留下一句思考，也可以直接保存关联。</p><div class="thought-box"><textarea id="thought" maxlength="3000" rows="3" aria-label="选填的关联思考" placeholder="它们让我想到……"></textarea></div><div class="link-dialog-actions"><button class="quiet-button dialog-done">再读一读</button><button id="confirm-link" class="primary-button">保存关联 ↗</button></div></dialog>`;
  html=html.replace('没有共鸣，就选「暂未发现关联」；想留待以后，就「先跳过」。不必为每次相遇找到答案。','暂时没有共鸣，就「换一组」。不必为每次相遇找到答案。');
  html=html.replace(/<div class="nav-label">[\s\S]*?<\/div>/,'');
  html=html.replace(/    <div class="connection">[^\n]*\r?\n/,'');
  const brand=html.match(/<a class="brand"[\s\S]*?<\/a>/)[0].replace(/<small>[\s\S]*?<\/small>/,'');
  const navigation=html.match(/<nav>[\s\S]*?<\/nav>/)[0].replace('<nav>','<nav aria-label="思考视图">');
  html=html.replace(/  <aside class="sidebar">[\s\S]*?<\/aside>/,'');
  html=html.replace(/<div class="breadcrumb">[\s\S]*?<\/div><div class="top-actions">/,`<div class="workspace-navigation">${brand}${navigation}</div><div class="top-actions">`);
  html=html.replace('<div class="bottom-note"><span>✦</span> 不必寻找标准答案。你的联想，就是连接的意义。','<div class="bottom-note">');
  html=html.replace(/<form id="connection-form">[\s\S]*?<\/form>/,'');
  html=html.replace(/<a class="quiet-button" id="download-standalone"[\s\S]*?<\/a>/,'');
  html=html.replace('连接你的思考空间。','保存与备份。').replaceAll('连接与备份','保存与备份').replace('关闭连接设置','关闭备份设置');
  html=html.replace('<p id="storage-description"></p>','<p id="storage-description">当前工作空间 · 无需填写地址或 Token。图谱、配色及动画偏好随思源数据同步。换设备前，请先在原设备完成同步，再在新设备同步后打开 PairSentence。</p>');
  html=html.replace('图谱可导出为 JSON；换浏览器或移动独立文件前，先保存一份备份。导入会替换当前图谱。','导入 JSON 备份会替换当前图谱，建议先导出备份。若片段不在当前工作空间中，对应关联将暂不可用，思考记录仍会保留。');
  html=html.replace(/<footer>[\s\S]*?<\/footer>/,'');
  html=html.replace(/<button id="settings-button"[\s\S]*?<\/button>/,'');
  html=html.replace('</nav>','<button class="nav-item" data-view="settings"><span>⚙</span>设置</button></nav>');
  const toolbar=html.match(/<div class="motion-toolbar">[\s\S]*?<span id="motion-announcement"[\s\S]*?<\/span><\/div>/)[0]
    .replace('<option value="forest">','<option value="auto">跟随思源</option><option value="forest">')
    .replace('<button data-motion="none"','<button data-motion="flip" aria-pressed="false">▱ 翻页</button><button data-motion="none"');
  html=html.replace(/<div class="motion-toolbar">[\s\S]*?<span id="motion-announcement"[\s\S]*?<\/span><\/div>/,'');
  const settings=html.match(/<dialog id="settings-dialog">[\s\S]*?<\/dialog>/)[0];
  const backup=settings.slice(settings.indexOf('<div class="backup-section">'),-'</dialog>'.length);
  html=html.replace(settings,'');
  html=html.replace('</main>',`<section id="settings-view" class="view settings-view" hidden>
    <div class="page-heading"><div><div class="eyebrow">MAKE IT YOURS</div><h1>设置<span>。</span></h1><p>选一种配色，留一点仪式感。</p></div></div>
    <section class="settings-card"><h2>外观与动效</h2><p>默认跟随思源的亮暗模式，也可以选择喜欢的配色。动效只作反馈，不影响关联判断。</p>${toolbar}
    <div id="settings-preview" class="pair-stage settings-preview" aria-label="动画预览"><article class="paragraph-card"><span class="fragment-number">片段 A</span><p>一个念头，</p></article><article class="paragraph-card"><span class="fragment-number">片段 B</span><p>与另一个念头相遇。</p></article></div></section>
    <section class="settings-card">${backup}<p class="uninstall-note">普通卸载会保留图谱、思考和设置，在同一工作空间重新安装后可继续使用。手动删除插件数据目录会丢失这些记录，建议卸载前先导出备份。思源笔记原文不受影响。</p></section>
    </section></main>`);
  html=html.replace('带走你的思考','数据与备份');
  let css=read('style.css').replace(/:root\b/g,'.ps-root').replace(/(?<![\w.-])body\b/g,'.ps-root');
  css+=`\n.ps-root{position:fixed;inset:0;overflow:auto;overscroll-behavior:contain;background:var(--bg);color:var(--ink);font:14px var(--sans);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.ps-close{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:20;border:1px solid var(--line);border-radius:50%;width:34px;height:34px;background:var(--paper);color:var(--ink);font-size:24px;cursor:pointer}.topbar{padding-right:58px}[hidden]{display:none!important}@media(max-width:600px){.pair-stage{grid-template-columns:1fr}.pair-connector{display:none}.paragraph-card{min-height:220px}.paragraph-content{max-height:38vh}.sidebar{padding-right:55px;gap:8px}.brand>span:last-child{display:none}.ps-close{width:30px;height:30px}.decision-actions{flex-wrap:wrap}.main-decisions{margin-left:auto}.graph-toolbar{flex-wrap:wrap}.topbar{padding-right:17px}}`;
  const core=['engine.js','navigation.js','validation.js','application.js','motion.js'].map(file=>plain(read(file))).join('\n');
  css+=`\n.ps-tab{position:absolute;inset:0;transform:translateZ(0);padding:0}.ps-tab .shell{min-height:100%}.ps-tab .topbar{padding-right:28px}.sidebar nav{margin-top:40px}.bottom-note:has(#undo-button[hidden]){display:none}.ps-tab .sidebar{position:absolute;height:100%;inset:0 auto auto 0}@media(max-width:760px){.sidebar nav{margin-top:0}.ps-tab .sidebar{position:static;height:auto}}`;
  css+=`\n.shell>main{margin-left:0;min-width:0;width:100%}.toast{left:50%}.topbar,.ps-tab .topbar{height:68px;padding:0 32px;gap:20px;flex-shrink:0}.workspace-navigation{display:flex;align-items:center;gap:32px;min-width:0}.workspace-navigation .brand{gap:10px;font-size:14px;flex-shrink:0}.workspace-navigation .brand-mark{width:34px;height:36px;font-size:23px;border-radius:10px 10px 10px 3px}.workspace-navigation nav{display:flex;align-items:center;gap:6px;margin:0}.workspace-navigation .nav-item{width:auto;margin:0;padding:10px 15px;gap:8px;white-space:nowrap;font-size:12px}.workspace-navigation .nav-item>span:first-child{font-size:17px}.workspace-navigation .nav-dot{display:none}.workspace-navigation .count{display:inline-block!important;margin-left:3px;font-size:9px}.view{width:min(1320px,100%)}@media(max-width:760px){.topbar,.ps-tab .topbar{height:auto;min-height:62px;padding:12px 20px;gap:10px;flex-wrap:wrap}.workspace-navigation{gap:18px}.workspace-navigation .brand>span:last-child{display:none}.workspace-navigation .nav-item{font-size:11px;padding:9px 10px}.top-actions{margin-left:auto}.top-actions>#save-status{font-size:9px}.ps-mobile .topbar{padding-right:56px}.view{padding-top:25px}}@media(max-width:480px){.topbar,.ps-tab .topbar{padding-left:16px;padding-right:16px;gap:8px}.workspace-navigation{gap:8px}.workspace-navigation .brand-mark{width:28px;height:30px;font-size:20px}.workspace-navigation nav{gap:2px}.workspace-navigation .nav-item{padding:8px;font-size:10px;gap:5px}.top-actions>#save-status{display:none}.top-actions{gap:4px}.ps-mobile .topbar{padding-right:50px}.workspace-navigation .count{font-size:8px}}`;
  css+='\n'+read('plugin/settings.css')+'\n'+read('plugin/mobile.css');
  const injected=`const standalone=false,userscript=false;const request=(...args)=>adapter.request(...args);\n${core}\n${app}`;
  const icon='data:image/png;base64,'+fs.readFileSync(path.join(root,'plugin/icon.png')).toString('base64');
  return `const PLUGIN_ICON=${JSON.stringify(icon)};\nconst PLUGIN_CSS=${JSON.stringify(css)};\nconst PLUGIN_HTML=${JSON.stringify(html)};\n`+read('plugin/shell.cjs').replace('/* PAIRSENTENCE_APP */',injected).replace('/* PAIRSENTENCE_ADAPTER */',plain(read('plugin/adapter.js'))+'\n'+plain(read('plugin/mobile-input.js')));
}
// A dependency-free ZIP writer (stored entries, UTF-8 names).
export function zipFiles(files) {
  let offset=0;const chunks=[],central=[];
  for(const [name,content] of Object.entries(files)) {
    const data=Buffer.from(content),filename=Buffer.from(name);let crc=0xffffffff;
    for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(20,4);header.writeUInt16LE(20,6);header.writeUInt16LE(0x800,8);header.writeUInt32LE(crc,16);header.writeUInt32LE(data.length,20);header.writeUInt32LE(data.length,24);header.writeUInt16LE(filename.length,28);header.writeUInt32LE(offset,42);
    chunks.push(local,filename,data);central.push(header,filename);offset+=local.length+filename.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const files={'index.js':buildPlugin(),'index.css':'/* Styles are scoped inside the PairSentence view. */\n','plugin.json':read('plugin/plugin.json'),'icon.png':fs.readFileSync(path.join(root,'plugin/icon.png')),'README.md':read('plugin/README.md'),'README.zh-CN.md':read('plugin/README.zh-CN.md')};
  files['LICENSE']=read('LICENSE');
  files['LICENSE-TWEMOJI']=read('plugin/LICENSE-TWEMOJI');
  files['THIRD-PARTY-NOTICES.md']=read('plugin/THIRD-PARTY-NOTICES.md');
  const out=path.join(root,'dist','pairsentence');fs.mkdirSync(out,{recursive:true});
  for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(out,name),data);
  fs.writeFileSync(path.join(root,'dist','package.zip'),zipFiles(files));
  console.log('已生成 dist/pairsentence 和 dist/package.zip');
}
