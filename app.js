import { newState, components, activeEdges } from './engine.js';
import { createApplication } from './application.js';
import { request, standalone, userscript, readConfig, writeConfig, queryDirect, validateState } from './io.js';
import { motionPreference, saveMotion, playMotion, motionNames } from './motion.js';
import {normalizeSources} from './sources.js';
import {blockHref} from './navigation.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let state = newState(), pair = null, view = 'pair', graphTab = 'flat', busy = false, syncing = false, ready = false;
let sessionCount = 0, sessionLinks = 0, undo = null;
let toastTimer;
let offlineSources=[],onlineSources=null;
let motionMode = motionPreference(), previewing = false;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400); }
async function api(url, options) {
  const result=await request(url, options);
  if(result?.succeeded){offlineSources=result.warnings||[];onlineSources=new Set(result.succeeded);}
  if(result?.warnings?.length)$('#save-status').textContent='部分来源离线 · 已保留原有图谱';
  return result;
}
// Composition root: only application use cases own mutable graph state.
// `state` below is a detached read model; views must never write into it.
const application = createApplication({
  validate:validateState,
  repository:{
    async load() {
      const saved=await api('/api/state');
      // Read recovery from the previous prototype once; new failed commands are never
      // written into recovery, so a reload cannot silently commit a failed judgment.
      let recovery=null;try{recovery=localStorage.getItem('pairsentence-recovery');}catch{}
      return recovery ? validateState(JSON.parse(recovery)) : saved;
    },
    async save(value) {
      $('#save-status').textContent='正在保存…';
      try {
        await api('/api/state',{method:'PUT',body:JSON.stringify(value)});
        $('#save-status').textContent='所有思考已保存';
        try{localStorage.removeItem('pairsentence-recovery');}catch{}
      } catch(error) {
        $('#save-status').textContent='保存失败 · 请重试';
        error.saveFailure=true;throw error;
      }
    }
  },
  fragments:{
    async random(){return (await api('/api/blocks')).blocks;},
    lookup:(ids,nodes={})=>api('/api/sync',{method:'POST',body:JSON.stringify({ids,sourcesById:Object.fromEntries(ids.map(id=>[id,nodes[id]?.sourceUrls||[]]))})})
  }
});
function updateReadModel(){state=application.snapshot();counters();$('#undo-button').hidden=!application.canUndo();}
function reportFailure(error, fallback='操作未完成，请重试') {
  if(!error.saveFailure)connected(false);
  toast(error.saveFailure ? '保存失败，内容已保留，请重试' : `${error.message}，${fallback}`);
}
function connected(ok) {
  const cached=onlineSources?.size===0,partial=offlineSources.length>0;
  $('#connection-dot').classList.toggle('offline',!ok||cached||partial);
  $('#connection-text').innerHTML=`${!ok?'思源暂未连接':cached?'使用本地快照':partial?'部分来源离线':'思源已连接'}<small>${!ok||cached?'保留图谱 · 可继续比较':partial?'离线片段使用上次同步内容':'共享图谱 · 实时同步'}</small>`;
}
function updateSnapshotWarnings(){
  if(!pair)return;
  document.querySelectorAll('.paragraph-card').forEach((card,i)=>{
    const n=state.nodes[i===0?pair.a:pair.b];
    card.querySelector('.snapshot-note').hidden=!(onlineSources&&(!n.sourceUrls?.length?onlineSources.size===0:!n.sourceUrls.some(url=>onlineSources.has(url))));
  });
}
function title(n) { return n.hpath?.split('/').filter(Boolean).pop() || '未命名文档'; }
function date(raw) { const s = String(raw || ''); return /^\d{14}$/.test(s) ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : '时间未知'; }
function jump(n, label = '在思源中打开') {
  return `<a class="jump-link" href="${esc(blockHref(n))}" target="_blank" rel="noopener noreferrer" title="${esc(label)}">${esc(label)} <span>↗</span></a>`;
}
function nodeCard(n, index) {
  return `<article class="paragraph-card card-${index}"><div class="card-top"><span class="fragment-number">片段 ${index === 0 ? 'A' : 'B'}</span><span class="snapshot-note" hidden title="来源当前未连接，仍可比较并保存关联">上次同步快照</span><span class="card-corner">↗</span></div><div class="paragraph-content">${esc(n.content)}</div><div class="card-source"><div class="source-title"><span class="document-icon">▤</span><span title="${esc(n.hpath)}">${esc(title(n))}</span></div><div class="source-bottom"><span>更新于 ${date(n.updated)}</span>${jump(n)}</div></div></article>`;
}
function counters() {
  $('#session-count').textContent = String(sessionCount).padStart(2, '0'); $('#session-links').textContent = String(sessionLinks).padStart(2, '0');
  $('#nav-count').textContent = activeEdges(state).length;
}
function drawPair() {
  $('#decision-panel').hidden = !pair;
  if (!pair) {
    $('#pair-stage').innerHTML = `<div class="loading-state"><span class="rest-symbol">✳</span><h3>${ready ? '这一轮，已经探索得很充分。' : '暂时未能打捞片段'}</h3><p>${ready ? '换一批笔记，给新的联想留一个入口。' : '请确认思源已启动，并开启了本机 API 服务。'}</p><button id="retry-button" class="primary-button">${ready ? '打捞更多片段' : '重新连接'} ↗</button></div>`;
    $('#retry-button').onclick = refill; return;
  }
  const a = state.nodes[pair.a], b = state.nodes[pair.b];
  $('#pair-stage').innerHTML = nodeCard(a, 0) + '<div class="pair-connector"><span>⌁</span><i></i></div>' + nodeCard(b, 1);
  updateSnapshotWarnings();
  $('#pair-mode').textContent = ({ explore:'自由相遇 · 探索新的可能', attach:'延伸脉络 · 给片段一个归处', bridge:'交汇时刻 · 让两条脉络相遇' })[pair.kind];
}
async function refill() {
  if (busy || syncing || previewing) return;
  busy = true;
  $('#pair-stage').innerHTML = '<div class="loading-state"><span class="spinner"></span><h3>正在寻找下一次相遇</h3><p>从思源中打捞新的片段…</p></div>';
  $('#decision-panel').hidden = true;
  try { await application.refreshFragments(); updateReadModel(); ready = true; connected(true); nextPair(); }
  catch (e) { reportFailure(e); drawPair(); }
  finally { busy = false; }
}
function nextPair() {
  const previous = pair ? [pair.a, pair.b] : [];
  pair = application.selectNextPair(previous); $('#thought').value = ''; drawPair(); counters();
}
async function perform(action) {
  if (busy || syncing || previewing || !pair) return;
  busy = true;
  setDecisionDisabled(true);$('#thought').disabled=true;
  const submittedPair={...pair}, thought=$('#thought').value;
  try {
    const result=await application.submitJudgment({pairId:submittedPair.pairId,action,thought});
    updateReadModel();connected(true);
    updateSnapshotWarnings();
    if(result.status==='invalidated'){toast('这个片段已被删除，已为你换一组');nextPair();return;}
    if(result.duplicate)return;
    undo = { pair:submittedPair, thought, sessionCount, sessionLinks };
    sessionCount++; if (action === 'link') sessionLinks++;
    // Visuals are downstream of the committed result; an animation failure cannot
    // turn a saved judgment into a failed submission or invite duplicate retries.
    try{await playMotion($('#pair-stage'), motionMode, action);}catch{ /* Continue with the saved result. */ }
    // Keep bringing fresh material into long sessions instead of cycling a fixed pool.
    if (sessionCount % 12 === 0) {
      try { await application.refreshFragments();updateReadModel(); }
      catch { toast('新片段暂未加载，继续探索已有片段'); }
    }
    nextPair();
    if (action === 'link') toast('关联已建立，一条新的思路正在生长');
  } catch (e) { reportFailure(e,'本次判断尚未提交'); }
  finally { busy = false; setDecisionDisabled(false);$('#thought').disabled=false; }
}
async function sync() {
  if (syncing || busy || previewing || !ready) return;
  syncing = true; $('#sync-button').classList.add('spinning');
  try {
    const displayed = pair && [state.nodes[pair.a]?.content,state.nodes[pair.a]?.updated,state.nodes[pair.b]?.content,state.nodes[pair.b]?.updated].join('|');
    const {deleted}=await application.synchronize();
    updateReadModel();connected(true);
    if (pair && (state.nodes[pair.a]?.deleted || state.nodes[pair.b]?.deleted)) nextPair();
    else if (view === 'pair' && pair && displayed !== [state.nodes[pair.a]?.content,state.nodes[pair.a]?.updated,state.nodes[pair.b]?.content,state.nodes[pair.b]?.updated].join('|')) {
      // Patch only changed text; keep DOM, scroll offsets, focus and animation state.
      document.querySelectorAll('.paragraph-card').forEach((card,i)=>{
        const node=state.nodes[i===0?pair.a:pair.b], content=card.querySelector('.paragraph-content');
        if(content.textContent!==node.content)content.textContent=node.content;
        card.querySelector('.source-bottom>span').textContent=`更新于 ${date(node.updated)}`;
      });
    }
    if (view === 'graph' && !$('#graph-content .edit-thought')) drawGraph();
    updateSnapshotWarnings();
    if (deleted) toast(`${deleted} 个段落已删除，对应关系已断开`);
  } catch (e) { reportFailure(e); }
  finally { syncing = false; $('#sync-button').classList.remove('spinning'); }
}
function switchView(next) {
  if(busy || previewing)return;
  view = next;
  for (const el of document.querySelectorAll('[data-view]')) el.classList.toggle('active', el.dataset.view === next);
  $('#pair-view').hidden = next !== 'pair'; $('#graph-view').hidden = next !== 'graph'; $('#page-name').textContent = next === 'pair' ? '发现关联' : '思考图谱';
  if (next === 'graph') drawGraph();
  $('#focus-graph').textContent=next==='pair'?'思考图谱 ↗':'返回比对 ↗';
}
function graphGroups() { const connectedIds = new Set(activeEdges(state).flatMap(e => [e.a, e.b])); return components(state).filter(g => g.some(id => connectedIds.has(id))); }
function graphNode(n, i) { return `<div class="flat-node"><span class="node-index">${String(i + 1).padStart(2,'0')}</span><div><div class="flat-source">${esc(title(n))} <span>· ${date(n.updated)}</span></div><p>${esc(n.content)}</p>${jump(n, '回到这个段落')}</div></div>`; }
function thoughtCard(e) {
  return `<div class="edge-thought" data-edge="${esc(e.id)}"><div class="edge-thread">⌁</div><div class="edge-body"><div class="edge-meta"><span>片段 ${esc(title(state.nodes[e.a]))} <b>↔</b> ${esc(title(state.nodes[e.b]))}</span><button class="edit-edge" data-id="${esc(e.id)}" title="编辑思考">编辑</button><button class="delete-edge" data-id="${esc(e.id)}" title="移除关联及其思考批注">移除关联</button></div><p>${e.thought ? esc(e.thought) : '<span class="no-thought">两个片段在这里相遇。点击编辑，补上一句思考。</span>'}</p></div></div>`;
}
function constellation(groups, edges) {
  const width = 1000, height = Math.max(480, Math.ceil(groups.length / 3) * 300);
  const positions = new Map();
  groups.forEach((g, gi) => {
    const cols = Math.min(3, groups.length), cx = (gi % cols + .5) * width / cols, cy = Math.floor(gi / cols) * 300 + (groups.length <= 3 ? 225 : 155);
    g.forEach((id, i) => { const angle = i * 2.399963; const radius = g.length === 2 ? 65 : 28 + Math.sqrt(i) * Math.min(26, 110 / Math.sqrt(g.length)); positions.set(id, [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]); });
  });
  return `<div class="map-panel"><div class="map-caption"><span class="live-dot"></span>每一个点，都是一段曾与你共鸣的文字 <small>点击节点回到思源 · 悬停连线查看思考</small></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="关系星图">${edges.map(e => { const a = positions.get(e.a), b = positions.get(e.b); if (!a || !b) return ''; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="map-edge"><title>${esc(e.thought || '已建立关联')}</title></line>`; }).join('')}${[...positions].map(([id, p]) => `<a href="${esc(blockHref(state.nodes[id]))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(title(state.nodes[id]))}"><circle cx="${p[0]}" cy="${p[1]}" r="8" class="map-node"><title>${esc(state.nodes[id].content)}</title></circle><text x="${p[0]+13}" y="${p[1]+4}">${esc(title(state.nodes[id]).slice(0, 9))}</text></a>`).join('')}</svg></div>`;
}
function drawGraph() {
  const edges = activeEdges(state), groups = graphGroups(), linked = new Set(edges.flatMap(e => [e.a,e.b]));
  $('#graph-stats').innerHTML = `<div><span>相连的片段</span><strong>${linked.size}<small> 个</small></strong></div><div><span>你建立的关联</span><strong>${edges.length}<small> 条</small></strong></div><div><span>正在生长的脉络</span><strong>${groups.length}<small> 组</small></strong></div><div><span>最大的一片星群</span><strong>${groups[0]?.length || 0}<small> 个片段</small></strong></div>`;
  const search = $('#graph-search').value.trim().toLowerCase();
  const filtered = groups.filter(g => g.some(id => `${state.nodes[id].content} ${state.nodes[id].hpath}`.toLowerCase().includes(search)) || edges.some(e => g.includes(e.a) && e.thought.toLowerCase().includes(search)));
  if (!groups.length) { $('#graph-content').innerHTML = `<div class="graph-empty"><div class="empty-constellation">·<span>⌁</span>·</div><h2>你的第一条脉络，正等待发生。</h2><p>在两个片段之间留下一次联想，<br>它们就会在这里，成为一个新的起点。</p><button id="start-explore" class="primary-button">去发现关联 ↗</button></div>`; $('#start-explore').onclick = () => switchView('pair'); return; }
  if (!filtered.length) { $('#graph-content').innerHTML = '<div class="graph-empty"><h3>还没有匹配的片段或思考</h3><p>试试另一个关键词。</p></div>'; return; }
  if (graphTab === 'map') { $('#graph-content').innerHTML = constellation(filtered, edges); return; }
  $('#graph-content').innerHTML = filtered.map((g, gi) => {
    const ge = edges.filter(e => g.includes(e.a));
    // Chronological edges + each node shown once gives a readable, lossless flat projection.
    const rendered = new Set(); let content = '', n = 0;
    for (const e of ge.toSorted((a,b) => a.created - b.created)) {
      if (!rendered.has(e.a)) { content += graphNode(state.nodes[e.a], n++); rendered.add(e.a); }
      content += thoughtCard(e);
      if (!rendered.has(e.b)) { content += graphNode(state.nodes[e.b], n++); rendered.add(e.b); }
    }
    return `<section class="component-section"><div class="component-heading"><div><span class="component-star">✳</span><h2>脉络 ${String(gi+1).padStart(2,'0')}</h2><span>${g.length} 个片段 <b>·</b> ${ge.length} 条关联</span></div><span class="component-status">持续生长中</span></div><div class="component-content">${content}</div></section>`;
  }).join('');
  document.querySelectorAll('.edit-edge').forEach(button => button.onclick = () => {
    const e = state.edges.find(e => e.id === button.dataset.id), container = button.closest('.edge-body');
    container.innerHTML = `<label class="edit-label">编辑这条关联的思考<textarea class="edit-thought" maxlength="3000">${esc(e.thought)}</textarea></label><div class="edit-actions"><button class="quiet-button cancel-edit">取消</button><button class="primary-button save-edit">保存思考</button></div>`;
    container.querySelector('textarea').focus();
    container.querySelector('.cancel-edit').onclick = drawGraph;
    container.querySelector('.save-edit').onclick = async () => {
      if(busy || syncing)return;busy=true;
      const saveButton=container.querySelector('.save-edit');saveButton.disabled=true;
      try{await application.editLink(e.id,container.querySelector('textarea').value);updateReadModel();undo=null;drawGraph();toast('思考已更新');}
      catch(error){reportFailure(error);}
      finally{busy=false;saveButton.disabled=false;}
    };
  });
  document.querySelectorAll('.delete-edge').forEach(button => button.onclick = async () => {
    if(busy || syncing)return;
    if (button.dataset.confirm !== 'yes') { button.dataset.confirm = 'yes'; button.textContent = '确认断开关联？'; return; }
    busy=true;button.disabled=true;
    try{await application.removeLink(button.dataset.id);updateReadModel();undo=null;drawGraph();toast('关联已移除，脉络已重新计算');}
    catch(error){reportFailure(error);}
    finally{busy=false;button.disabled=false;}
  });
}
$('#link-button').onclick = () => perform('link'); $('#reject-button').onclick = () => perform('reject'); $('#skip-button').onclick = () => perform('skip');
$('#sync-button').onclick = () => ready ? sync() : init();
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => switchView(b.dataset.view));
document.querySelectorAll('[data-graph-tab]').forEach(b => b.onclick = () => { if(busy)return;graphTab = b.dataset.graphTab; document.querySelectorAll('[data-graph-tab]').forEach(el => el.classList.toggle('selected', el === b)); drawGraph(); });
$('#graph-search').oninput = () => {if(!busy)drawGraph();};
$('#about-button').onclick = () => $('#about-dialog').showModal();
document.querySelectorAll('.dialog-close,.dialog-done').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#undo-button').onclick = async () => {
  if (!undo || busy || syncing || previewing) return;
  busy=true;setDecisionDisabled(true);
  try{
    const u=undo;const restoredPair=await application.undoJudgment();updateReadModel();
    sessionCount=u.sessionCount;sessionLinks=u.sessionLinks;undo=null;
    // Issue a fresh pair ticket; never reuse the already consumed submission ID.
    pair=restoredPair;
    drawPair();$('#thought').value=pair?.a===u.pair.a&&pair?.b===u.pair.b?u.thought:'';counters();toast('已撤销上一步');
  }catch(error){reportFailure(error);}
  finally{busy=false;setDecisionDisabled(false);}
};
function exportGraph() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `间-思考图谱-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#export-button').onclick = exportGraph;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && view === 'pair' && !document.querySelector('dialog[open]')) { e.preventDefault(); perform('link'); } });
window.addEventListener('focus', () => { if (ready) sync(); });
setInterval(sync, 45000);
async function init() {
  if (busy || syncing || previewing) return; busy = true;
  try {
    await application.load();updateReadModel();undo=null;pair=null;
    await application.refreshFragments();updateReadModel();
    await application.synchronize();updateReadModel();ready=true;connected(true);
    nextPair(); if (view === 'graph') drawGraph();
  } catch (e) { reportFailure(e); counters(); drawPair(); if (view === 'graph') drawGraph(); }
  finally { busy = false; }
}
function setDecisionDisabled(disabled) { for(const id of ['link-button','reject-button','skip-button','preview-motion']) $('#'+id).disabled=disabled; }
function updateMotionButtons() {
  document.querySelectorAll('[data-motion]').forEach(b=>{const selected=b.dataset.motion===motionMode;b.setAttribute('aria-pressed',String(selected));});
  $('#preview-motion').hidden=motionMode==='none';
}
async function previewMotion() {
  if(busy || syncing || previewing || !pair) return;
  previewing=true; setDecisionDisabled(true);
  try { await playMotion($('#pair-stage'),motionMode,'link',true); $('#motion-announcement').textContent=`${motionNames[motionMode]}动画预览完成，未建立关联`; }
  finally { previewing=false;setDecisionDisabled(false); }
}
document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>{if(busy || previewing)return;motionMode=b.dataset.motion;saveMotion(motionMode);updateMotionButtons();previewMotion();});
$('#preview-motion').onclick=previewMotion; updateMotionButtons();
function setFocus(focused) {
  document.body.classList.toggle('focused',focused);
  $('.sidebar').inert=focused;
  $('#focus-button').setAttribute('aria-expanded',String(!focused));
  $('#focus-button').setAttribute('aria-label',focused?'展开侧栏，退出专注模式':'收起侧栏，进入专注模式');
  $('#focus-button').title=focused?'展开侧栏':'专注模式';
  $('#focus-graph').hidden=!focused;
  try{localStorage.setItem('pairsentence-focus',focused?'1':'0');}catch{}
}
$('#focus-button').onclick=()=>setFocus(!document.body.classList.contains('focused'));
$('#focus-graph').onclick=()=>{switchView(view==='pair'?'graph':'pair');$('#focus-graph').textContent=view==='pair'?'思考图谱 ↗':'返回比对 ↗';};
try{setFocus(localStorage.getItem('pairsentence-focus')==='1');}catch{}
async function showSettings() {
  if(busy || syncing || previewing) {toast('请稍候，当前交互正在完成');return;}
  try {const config=await readConfig();renderSources(config.sources);}
  catch(e){toast(e.message);}
  $('#storage-description').textContent=userscript?'油猴版 · 首次填写思源 API Token。图谱与连接配置保存在此脚本的扩展存储中，切换 Bilibili 页面后仍可继续使用。':standalone?'独立文件版 · 无需安装。打开思源，首次填写 API Token 即可；图谱保存在当前浏览器中。':'开发服务版 · 图谱保存在项目 data/graph.json。可下载无需安装的独立文件，并通过备份迁移图谱。';
  $('#connection-form').hidden=false;
  $('#download-standalone').hidden=standalone;
  $('#settings-dialog').showModal();
}
function renderSources(sources){
  $('#source-list').innerHTML='';sources.forEach(addSourceRow);
}
function addSourceRow(source={url:'http://127.0.0.1:3684',token:''}){
  const row=document.createElement('div');row.className='source-config';
  row.innerHTML=`<label class="settings-label">思源地址<input class="source-url" type="url" required value="${esc(source.url)}" spellcheck="false"></label><label class="settings-label">API Token<input class="source-token" type="password" autocomplete="off" value="${esc(source.token)}" placeholder="思源 → 设置 → 关于 → API Token"></label><label class="source-toggle"><input class="source-enabled" type="checkbox" ${source.enabled!==false?'checked':''}> 启用此来源</label><div class="source-actions"><button type="button" class="quiet-button test-source">测试连接</button><span class="source-health" role="status">${source.enabled===false?'已断开 · 图谱保留':'未检测'}</span></div><button type="button" class="quiet-button remove-source">断开 / 清理…</button><div class="source-removal" hidden></div>`;
  let revision=0;
  row.querySelectorAll('input').forEach(input=>input.oninput=()=>{revision++;row.querySelector('.source-health').textContent='配置已修改 · 未检测';row.querySelector('.source-removal').hidden=true;});
  row.testConnection=async()=>{
    const status=row.querySelector('.source-health'),button=row.querySelector('.test-source'),version=++revision;
    if(!row.querySelector('.source-enabled').checked){status.textContent='已断开 · 图谱保留';return false;}
    status.textContent='检测中…';button.disabled=true;
    try{
      const candidate=normalizeSources({sources:[rowConfig(row)]})[0];
      await api('/api/test-source',{method:'POST',body:JSON.stringify(candidate)});
      if(revision===version)status.textContent='● 已连接';return true;
    }catch(error){if(revision===version)status.textContent=`连接失败：${error.message}`;return false;}
    finally{button.disabled=false;}
  };
  row.querySelector('.test-source').onclick=row.testConnection;
  row.querySelector('.remove-source').onclick=()=>showSourceRemoval(row);
  $('#source-list').append(row);
}
function rowConfig(row){return {url:row.querySelector('.source-url').value.trim(),token:row.querySelector('.source-token').value,enabled:row.querySelector('.source-enabled').checked};}
async function showSourceRemoval(row){
  if(busy||syncing)return;
  let url;try{url=normalizeSources({sources:[rowConfig(row)]})[0].url;}catch(error){toast(error.message);return;}
  const saved=await readConfig();
  if(!saved.sources.some(s=>s.url===url)){
    if(document.querySelectorAll('.source-config').length>1){row.remove();return;}
    toast('此来源尚未保存，可取消勾选后保存为断开状态');return;
  }
  const impact=application.sourceImpact(url),panel=row.querySelector('.source-removal');
  panel.hidden=false;
  panel.innerHTML=`<p>断开后保留所有内容；也可清理仅属于此来源的 ${impact.fragments} 个片段、${impact.links} 条关联，其中 ${impact.thoughts} 条含思考。共享片段与来源不明的旧片段保留。清理无法撤销，建议先导出备份。</p><button type="button" class="quiet-button keep-source-data">断开并保留图谱</button><button type="button" class="quiet-button clean-source-data">确认断开并清理独有数据</button><button type="button" class="quiet-button cancel-source-removal">取消</button>`;
  panel.querySelector('.cancel-source-removal').onclick=()=>panel.hidden=true;
  async function disconnect(clean){
    if(busy||syncing)return;busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      // Disconnect first. If graph save fails the data is retained and clean-up can be retried.
      const config=await readConfig();config.sources=config.sources.map(s=>s.url===url?{...s,enabled:false}:s);await writeConfig(config);
      row.querySelector('.source-enabled').checked=false;row.querySelector('.source-health').textContent='已断开 · 图谱保留';
      if(clean){await application.cleanSource(url);updateReadModel();undo=null;nextPair();if(view==='graph')drawGraph();row.querySelector('.source-health').textContent='已断开 · 独有数据已清理';}
      panel.hidden=true;toast(clean?'独有数据已清理，共享内容已保留':'已断开来源，图谱完整保留');
    }catch(error){reportFailure(error);}
    finally{busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  panel.querySelector('.keep-source-data').onclick=()=>disconnect(false);
  panel.querySelector('.clean-source-data').onclick=()=>disconnect(true);
}
$('#add-source').onclick=()=>{if(document.querySelectorAll('.source-config').length<8)addSourceRow();};
$('#settings-button').onclick=showSettings;
const themes=['forest','sand','ocean','night'];
function setTheme(theme){if(!themes.includes(theme))theme='forest';document.body.dataset.theme=theme;$('#theme-select').value=theme;try{localStorage.setItem('pairsentence-theme',theme);}catch{}}
$('#theme-select').onchange=e=>setTheme(e.target.value);
try{setTheme(localStorage.getItem('pairsentence-theme')||'forest');}catch{setTheme('forest');}
$('#settings-export').onclick=exportGraph;
$('#connection-form').onsubmit=async e=>{
  e.preventDefault();if(busy||syncing)return;$('#connect-button').disabled=true;$('#settings-result').textContent='正在保存配置…';
  try {
    // Validate and test before replacing a working connection.
    const rows=[...document.querySelectorAll('.source-config')],sources=normalizeSources({sources:rows.map(rowConfig)});
    // Saving remains possible while one source is offline; every query reports health.
    await writeConfig({sources});
    const statuses=await Promise.all(rows.map(row=>row.testConnection()));
    $('#settings-result').textContent=`配置已保存 · ${statuses.filter(Boolean).length} 个来源已连接；离线来源的快照和图谱保留`;
    await init();
  } catch(error){$('#settings-result').textContent=error.message;}
  finally{$('#connect-button').disabled=false;}
};
let pendingImport=null;
$('#import-button').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{if(file.size>25_000_000)throw new Error('备份超过 25 MB');pendingImport=validateState(JSON.parse(await file.text()));$('#import-summary').textContent=`将导入 ${Object.keys(pendingImport.nodes).length} 个片段、${pendingImport.edges.length} 条关联，并替换当前图谱。建议先导出当前备份。`;$('#import-confirmation').hidden=false;}
  catch(error){toast(error.message);}
  finally{e.target.value='';}
};
$('#cancel-import').onclick=()=>{pendingImport=null;$('#import-confirmation').hidden=true;};
$('#confirm-import').onclick=async()=>{
  if(!pendingImport||busy||syncing)return;
  busy=true;$('#confirm-import').disabled=true;
  try{
    await application.importGraph(pendingImport);updateReadModel();pendingImport=null;undo=null;sessionCount=0;sessionLinks=0;
    $('#import-confirmation').hidden=true;nextPair();if(view==='graph')drawGraph();$('#settings-dialog').close();toast('图谱已导入');
  }catch(error){reportFailure(error);}
  finally{busy=false;$('#confirm-import').disabled=false;}
  if(ready)sync();
};
async function boot(){await init();if(standalone&&(!ready||!Object.keys(state.nodes).length))await showSettings();}
boot();
