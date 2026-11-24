import {newState,components,activeEdges} from '../domain/engine.js';
import {createApplication} from '../usecases/application.js';
import {validateState} from '../domain/validation.js';
import {motionPreference,saveMotion,playMotion,motionNames} from './motion.js';
import {blockHref} from '../adapters/siyuan/navigation.js';

// Thought-book helpers shared by the list and reader views. Exported for tests.
export function dayText(ts) { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '时间未知' : `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }
export function clockText(ts) { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
export function thoughtParts(edge) {
  const text = String(edge.thought || '').trim();
  if (!text) return { title: '', body: '', empty: true };
  const lines = text.split(/\r?\n/);
  return { title: (lines.shift() || '').trim() || text, body: lines.join('\n').trim(), empty: false };
}
export function edgeNumbers(edges) { return new Map(edges.slice().sort((a, b) => a.created - b.created || String(a.id).localeCompare(String(b.id))).map((edge, index) => [edge.id, index + 1])); }
export function padNumber(value) { return String(value).padStart(3, '0'); }
export function startPairSentence(document,window,localStorage,setInterval,setTimeout,adapter) {
const request=(...args)=>adapter.request(...args);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let state = newState(), pair = null, view = 'pair', graphTab = 'list', readerEdgeId = null, readerEditing = false, busy = false, syncing = false, ready = false;
let sessionCount = 0, sessionLinks = 0, undo = null;
let toastTimer;

let motionMode = motionPreference(), previewing = false;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400); }
async function api(url, options) { return request(url, options); }
// Composition root: only application use cases own mutable graph state.
// `state` below is a detached read model; views must never write into it.
const application = createApplication({gentle:true,
  validate:validateState,
  repository:{
    async load() {
      const saved=await api('/api/state');
      return saved;
    },
    async save(value) {
      $('#save-status').textContent='正在保存…';
      try {
        await api('/api/state',{method:'PUT',body:JSON.stringify(value)});
        $('#save-status').textContent='所有思考已保存';

      } catch(error) {
        $('#save-status').textContent='保存失败 · 请重试';
        error.saveFailure=true;throw error;
      }
    }
  },
  fragments:{
    async random(){return (await api('/api/blocks')).blocks;},
    lookup:ids=>api('/api/sync',{method:'POST',body:JSON.stringify({ids})})
  }
});
function updateReadModel(){state=application.snapshot();counters();$('#undo-button').hidden=!application.canUndo();}
function reportFailure(error, fallback='操作未完成，请重试') {

  toast(error.saveFailure ? '保存失败，内容已保留，请重试' : `${error.message}，${fallback}`);
}

function title(n) { return n.hpath?.split('/').filter(Boolean).pop() || '未命名文档'; }
function date(raw) { const s = String(raw || ''); return /^\d{14}$/.test(s) ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : '时间未知'; }
function jump(n, label = '在思源中打开') {
  return `<a class="jump-link" href="${esc(blockHref(n))}" target="_blank" rel="noopener noreferrer" title="${esc(label)}">${esc(label)} <span>↗</span></a>`;
}
function nodeCard(n, index) {
  return `<article class="paragraph-card card-${index}"><div class="card-top"><span class="fragment-number">片段 ${index === 0 ? 'A' : 'B'}</span><span class="card-corner">↗</span></div><div class="paragraph-content">${esc(n.content)}</div><div class="card-source"><div class="source-title"><span class="document-icon">▤</span><span title="${esc(n.hpath)}">${esc(title(n))}</span></div><div class="source-bottom"><span>更新于 ${date(n.updated)}</span>${jump(n)}</div></div></article>`;
}
function counters() {
  $('#session-count').textContent = String(sessionCount).padStart(2, '0'); $('#session-links').textContent = String(sessionLinks).padStart(2, '0');
  $('#nav-count').textContent = activeEdges(state).length;
}
function drawPair() {
  $('#decision-panel').hidden = !pair;
  if (!pair) {
    $('#pair-stage').innerHTML = `<div class="loading-state"><span class="rest-symbol">✳</span><h3>${ready ? '这一轮，已经探索得很充分。' : '暂时未能打捞片段'}</h3><p>${ready ? '换一批笔记，给新的联想留一个入口。' : '当前工作空间尚未读到足够片段，请检查笔记或重试。'}</p><button id="retry-button" class="primary-button">${ready ? '打捞更多片段' : '重新连接'} ↗</button></div>`;
    $('#retry-button').onclick = refill; return;
  }
  const a = state.nodes[pair.a], b = state.nodes[pair.b];
  $('#pair-stage').innerHTML = nodeCard(a, 0) + '<div class="pair-connector"><span>⌁</span><i></i></div>' + nodeCard(b, 1);

  $('#pair-mode').textContent = ({ explore:'自由相遇 · 探索新的可能', attach:'延伸脉络 · 给片段一个归处', bridge:'交汇时刻 · 让两条脉络相遇' })[pair.kind];
}
async function refill() {
  if (busy || syncing || previewing) return;
  busy = true;
  $('#pair-stage').innerHTML = '<div class="loading-state"><span class="spinner"></span><h3>正在寻找下一次相遇</h3><p>从思源中打捞新的片段…</p></div>';
  $('#decision-panel').hidden = true;
  try { await application.refreshFragments(); updateReadModel(); ready = true;  nextPair(); }
  catch (e) { reportFailure(e); drawPair(); }
  finally { busy = false; }
}
function nextPair() {
  if($('#thought-dialog').open)$('#thought-dialog').close();
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
    updateReadModel();

    if(result.status==='invalidated'){toast('这个片段已被删除，已为你换一组');nextPair();return;}
    if(result.duplicate)return;
    if($('#thought-dialog').open)$('#thought-dialog').close();
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
  syncing = true;
  try {
    const displayed = pair && [state.nodes[pair.a]?.content,state.nodes[pair.a]?.updated,state.nodes[pair.b]?.content,state.nodes[pair.b]?.updated].join('|');
    const {deleted}=await application.synchronize();
    updateReadModel();
    if (pair && (state.nodes[pair.a]?.deleted || state.nodes[pair.b]?.deleted)) nextPair();
    else if (view === 'pair' && pair && displayed !== [state.nodes[pair.a]?.content,state.nodes[pair.a]?.updated,state.nodes[pair.b]?.content,state.nodes[pair.b]?.updated].join('|')) {
      // Patch only changed text; keep DOM, scroll offsets, focus and animation state.
      document.querySelectorAll('#pair-stage .paragraph-card').forEach((card,i)=>{
        const node=state.nodes[i===0?pair.a:pair.b], content=card.querySelector('.paragraph-content');
        if(content.textContent!==node.content)content.textContent=node.content;
        card.querySelector('.source-bottom>span').textContent=`更新于 ${date(node.updated)}`;
      });
    }
    if (view === 'graph' && !$('#graph-content .thought-edit-area')) drawGraph();

    if (deleted) toast(`${deleted} 个段落已删除，对应关系已断开`);
  } catch (e) { reportFailure(e); }
  finally { syncing = false;  }
}
function switchView(next) {
  if(busy || previewing)return;
  view = next;
  if (next !== 'graph') { readerEdgeId = null; readerEditing = false; }
  for (const el of document.querySelectorAll('[data-view]')) el.classList.toggle('active', el.dataset.view === next);
  $('#pair-view').hidden = next !== 'pair'; $('#graph-view').hidden = next !== 'graph'; $('#settings-view').hidden = next !== 'settings';
  if (next === 'graph') drawGraph();

}
function graphGroups() { const connectedIds = new Set(activeEdges(state).flatMap(e => [e.a, e.b])); return components(state).filter(g => g.some(id => connectedIds.has(id))); }
function componentNumbers() { const map = new Map(); graphGroups().forEach((group, index) => group.forEach(id => map.set(id, index + 1))); return map; }
function filteredEdges(edges) {
  const search = $('#graph-search').value.trim().toLowerCase();
  if (!search) return edges;
  return edges.filter(edge => {
    const a = state.nodes[edge.a], b = state.nodes[edge.b];
    return [edge.thought || '', a?.content || '', b?.content || '', a?.hpath || '', b?.hpath || ''].some(text => String(text).toLowerCase().includes(search));
  });
}
function constellation(groups, edges) {
  const width = 1000, height = Math.max(480, Math.ceil(groups.length / 3) * 300);
  const positions = new Map();
  groups.forEach((g, gi) => {
    const cols = Math.min(3, groups.length), cx = (gi % cols + .5) * width / cols, cy = Math.floor(gi / cols) * 300 + (groups.length <= 3 ? 225 : 155);
    g.forEach((id, i) => { const angle = i * 2.399963; const radius = g.length === 2 ? 65 : 28 + Math.sqrt(i) * Math.min(26, 110 / Math.sqrt(g.length)); positions.set(id, [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]); });
  });
  return `<div class="map-panel"><div class="map-caption"><span class="live-dot"></span>每一个点，都是一段曾与你共鸣的文字 <small>点击节点回到思源</small></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="关系星图">${edges.map(e => { const a = positions.get(e.a), b = positions.get(e.b); if (!a || !b) return ''; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="map-edge"><title>${esc(e.thought || '已建立关联')}</title></line>`; }).join('')}${[...positions].map(([id, p]) => `<a href="${esc(blockHref(state.nodes[id]))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(title(state.nodes[id]))}"><circle cx="${p[0]}" cy="${p[1]}" r="8" class="map-node"><title>${esc(state.nodes[id].content)}</title></circle><text x="${p[0]+13}" y="${p[1]+4}">${esc(title(state.nodes[id]).slice(0, 9))}</text></a>`).join('')}</svg></div>`;
}
function drawGraph() {
  const edges = activeEdges(state), toolbar = $('#graph-toolbar');
  if (readerEdgeId && !edges.some(edge => edge.id === readerEdgeId)) { readerEdgeId = null; readerEditing = false; }
  if (toolbar) toolbar.hidden = !!readerEdgeId;
  if (readerEdgeId) { renderThoughtReader(edges.find(edge => edge.id === readerEdgeId), edges); return; }
  const groups = graphGroups(), search = $('#graph-search').value.trim().toLowerCase();
  if (!groups.length) { $('#graph-content').innerHTML = `<div class="graph-empty"><div class="empty-constellation">·<span>⌁</span>·</div><h2>你的第一条脉络，正等待发生。</h2><p>在两个片段之间留下一次联想，<br>它们就会在这里，成为一个新的起点。</p><button id="start-explore" class="primary-button">去发现关联 ↗</button></div>`; $('#start-explore').onclick = () => switchView('pair'); return; }
  if (graphTab === 'map') {
    const filtered = groups.filter(g => g.some(id => `${state.nodes[id].content} ${state.nodes[id].hpath}`.toLowerCase().includes(search)) || edges.some(e => g.includes(e.a) && e.thought.toLowerCase().includes(search)));
    if (!filtered.length) { $('#graph-content').innerHTML = '<div class="graph-empty"><h3>还没有匹配的联想或片段</h3><p>试试另一个关键词。</p></div>'; return; }
    $('#graph-content').innerHTML = constellation(filtered, edges); return;
  }
  renderThoughtList(edges);
}
function renderThoughtList(edges) {
  const list = filteredEdges(edges).slice().sort((a, b) => b.created - a.created);
  if (!list.length) { $('#graph-content').innerHTML = '<div class="graph-empty"><h3>还没有匹配的联想或片段</h3><p>试试另一个关键词。</p></div>'; return; }
  const numbers = edgeNumbers(edges), componentOf = componentNumbers();
  let html = '', lastDay = '';
  for (const edge of list) {
    const day = dayText(edge.created);
    if (day !== lastDay) { html += `<div class="thought-day">${esc(day)}</div>`; lastDay = day; }
    const parts = thoughtParts(edge), component = componentOf.get(edge.a) || componentOf.get(edge.b);
    html += `<article class="thought-entry${parts.empty ? ' is-empty' : ''}" data-edge="${esc(edge.id)}" tabindex="0" role="button" aria-label="阅读联想 ${padNumber(numbers.get(edge.id))}"><div class="thought-meta"><span>联想 ${padNumber(numbers.get(edge.id))}</span><span>${esc(clockText(edge.created))}</span></div><h3>${esc(parts.empty ? '还没有写下联想' : parts.title)}</h3><div class="thought-foot"><span class="thought-sources">${esc(title(state.nodes[edge.a]))} · ${esc(title(state.nodes[edge.b]))}</span>${component ? `<span class="thought-component">脉络 ${String(component).padStart(2,'0')}</span>` : ''}</div></article>`;
  }
  $('#graph-content').innerHTML = html;
  document.querySelectorAll('.thought-entry').forEach(card => {
    const open = () => { if (busy) return; readerEdgeId = card.dataset.edge; readerEditing = false; drawGraph(); };
    card.onclick = open;
    card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
  });
}
function renderThoughtReader(edge, edges) {
  const parts = thoughtParts(edge), numbers = edgeNumbers(edges), componentOf = componentNumbers();
  const visible = filteredEdges(edges).slice().sort((a, b) => b.created - a.created);
  const index = visible.findIndex(item => item.id === edge.id);
  const component = componentOf.get(edge.a) || componentOf.get(edge.b);
  const body = parts.body ? parts.body.split(/\r?\n/).filter(line => line.trim()).map(line => `<p>${esc(line)}</p>`).join('') : '';
  const actions = '<div class="thought-reader-actions"><button id="thought-edit" class="quiet-button">编辑思考</button><button id="thought-remove" class="quiet-button">移除联想</button></div>';
  const editor = '<div class="thought-editor"><textarea id="thought-edit-area" class="thought-edit-area" maxlength="3000" aria-label="编辑这条联想的思考">'+esc(edge.thought)+'</textarea><div class="thought-editor-actions"><button id="thought-cancel" class="quiet-button">取消</button><button id="thought-save" class="primary-button">保存联想</button></div></div>';
  const sources = [edge.a, edge.b].map(id => state.nodes[id]).filter(Boolean).map(node => `<div class="thought-source"><div class="thought-source-head"><span>${esc(title(node))}</span>${jump(node, '回到这个片段')}</div><p>${esc(node.content)}</p></div>`).join('');
  $('#graph-content').innerHTML = `<div class="thought-reader"><button id="thought-back" class="thought-back">← 返回联想列表</button><div class="thought-reader-card"><div class="thought-reader-meta"><span>联想 ${padNumber(numbers.get(edge.id))} / ${padNumber(edges.length)}</span><span>${esc(dayText(edge.created))} · ${esc(clockText(edge.created))}</span>${component ? `<span class="thought-component">脉络 ${String(component).padStart(2,'0')}</span>` : ''}</div>${readerEditing ? editor : `<h2 class="thought-reader-title${parts.empty ? ' is-empty' : ''}">${esc(parts.empty ? '还没有写下联想' : parts.title)}</h2>${body}${parts.empty ? '<p class="thought-empty">还没有写下联想。点击「编辑思考」补上一句。</p>' : ''}${actions}`}<div class="thought-source-panel"><div class="thought-source-title">来源片段</div>${sources}</div><div class="thought-reader-nav"><button id="thought-prev" class="thought-nav-button"${readerEditing || index <= 0 ? ' disabled' : ''}>← 上一条</button><button id="thought-next" class="thought-nav-button"${readerEditing || index < 0 || index >= visible.length - 1 ? ' disabled' : ''}>下一条 →</button></div><div class="thought-progress"><span style="width:${index >= 0 && visible.length ? ((index + 1) / visible.length * 100) : 0}%"></span></div></div></div>`;
  $('#thought-back').onclick = () => { if (busy) return; readerEdgeId = null; readerEditing = false; drawGraph(); };
  const go = id => { if (readerEditing || busy) return; readerEdgeId = id; drawGraph(); };
  if (index > 0) $('#thought-prev').onclick = () => go(visible[index - 1].id);
  if (index >= 0 && index < visible.length - 1) $('#thought-next').onclick = () => go(visible[index + 1].id);
  if (readerEditing) {
    $('#thought-cancel').onclick = () => { readerEditing = false; drawGraph(); };
    $('#thought-save').onclick = async () => {
      const button = $('#thought-save');
      if (busy || syncing) return;
      const value = $('#thought-edit-area').value;
      busy = true; button.disabled = true;
      try { await application.editLink(edge.id, value); updateReadModel(); undo = null; readerEditing = false; drawGraph(); toast('思考已更新'); }
      catch (error) { reportFailure(error); }
      finally { busy = false; button.disabled = false; }
    };
    $('#thought-edit-area').focus();
  } else {
    $('#thought-edit').onclick = () => { if (busy || syncing) return; readerEditing = true; drawGraph(); };
    $('#thought-remove').onclick = async event => {
      const button = event.currentTarget;
      if (busy || syncing) return;
      if (button.dataset.confirm !== 'yes') { button.dataset.confirm = 'yes'; button.textContent = '确认移除联想？'; return; }
      busy = true; button.disabled = true;
      try { await application.removeLink(edge.id); updateReadModel(); undo = null; readerEdgeId = null; readerEditing = false; drawGraph(); toast('联想已移除，脉络已重新计算'); }
      catch (error) { reportFailure(error); }
      finally { busy = false; button.disabled = false; }
    };
  }
}
function beginLink(){
    if(busy||syncing||previewing||!pair)return;
    const editor=$('#thought-dialog');
    if(adapter.isMobile){if(!editor.open)editor.show();document.body.focus({preventScroll:true});editor.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});}
    else{if(!editor.open)editor.showModal();$('#thought').focus();}
  }
  $('#link-button').onclick=beginLink;
  $('#skip-button').onclick=()=>perform('skip');
  $('#confirm-link').onclick=()=>perform('link');
  $('#thought-dialog').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();perform('link');}});

document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => switchView(b.dataset.view));
document.querySelectorAll('[data-graph-tab]').forEach(b => b.onclick = () => { if(busy)return;readerEdgeId = null; readerEditing = false; graphTab = b.dataset.graphTab; document.querySelectorAll('[data-graph-tab]').forEach(el => el.classList.toggle('selected', el === b)); drawGraph(); });
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
  a.href = url; a.download = `PairSentence-联想簿-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && view === 'pair' && !document.querySelector('dialog[open]')) { e.preventDefault(); beginLink(); } });
document.addEventListener('keydown', e => {
  if (view !== 'graph' || !readerEdgeId || readerEditing || busy || syncing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (e.target.closest?.('input,textarea,[contenteditable="true"],dialog[open]')) return;
  const visible = filteredEdges(activeEdges(state)).slice().sort((a, b) => b.created - a.created), index = visible.findIndex(edge => edge.id === readerEdgeId);
  if (index < 0) return;
  const move = direction => { const next = visible[index + direction]; if (!next) return; e.preventDefault(); readerEdgeId = next.id; drawGraph(); };
  if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'ArrowRight') move(1);
});
window.addEventListener('focus', () => { if (ready) sync(); });
setInterval(sync, 45000);
async function init() {
  if (busy || syncing || previewing) return; busy = true;
  try {
    await application.load();updateReadModel();undo=null;pair=null;
    await application.refreshFragments();updateReadModel();
    await application.synchronize();updateReadModel();ready=true;
    nextPair(); if (view === 'graph') drawGraph();
  } catch (e) { reportFailure(e); counters(); drawPair(); if (view === 'graph') drawGraph(); throw e; }
  finally { busy = false; }
}
function setDecisionDisabled(disabled) { for(const id of ['link-button','confirm-link','skip-button','preview-motion']) $('#'+id).disabled=disabled; }
function updateMotionButtons() {
  document.querySelectorAll('[data-motion]').forEach(b=>{const selected=b.dataset.motion===motionMode;b.setAttribute('aria-pressed',String(selected));});
  $('#preview-motion').hidden=motionMode==='none';
}
async function previewMotion() {
  if(busy || syncing || previewing || (!pair && view!=='settings')) return;
  previewing=true; setDecisionDisabled(true);
  try { await playMotion(view==='settings'?$('#settings-preview'):$('#pair-stage'),motionMode,'link',true); $('#motion-announcement').textContent=`${motionNames[motionMode]}动画预览完成，未建立关联`; }
  finally { previewing=false;setDecisionDisabled(false); }
}
document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>{if(busy || previewing)return;motionMode=b.dataset.motion;saveMotion(motionMode);updateMotionButtons();previewMotion();});
$('#preview-motion').onclick=previewMotion; updateMotionButtons();

const themes=['auto','forest','sand','ocean','night'];
  function setTheme(theme){
    if(!themes.includes(theme))theme='auto';
    document.body.dataset.theme=theme==='auto'?adapter.hostTheme():theme;
    $('#theme-select').value=theme;
    try{localStorage.setItem('pairsentence-theme',theme);}catch{}
  }
  $('#theme-select').onchange=e=>setTheme(e.target.value);
  setTheme(localStorage.getItem('pairsentence-theme')||'auto');
  $('#settings-export').onclick=exportGraph;
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
    $('#import-confirmation').hidden=true;nextPair();if(view==='graph')drawGraph();toast('图谱已导入');
  }catch(error){reportFailure(error);}
  finally{busy=false;$('#confirm-import').disabled=false;if(!pendingImport)switchView('graph');}
  if(ready)sync();
};
async function boot(){await init();}
const started=boot().catch(error=>toast(error.message));
  return {canClose(){if(busy||syncing||previewing){toast('正在完成当前操作，请稍候');return false;}return true;},
    canReload:()=>!busy&&!syncing&&!previewing&&!$('#thought').value&&!document.querySelector('.thought-edit-area')&&!pendingImport,
    async reload(){await started;setTheme(localStorage.getItem('pairsentence-theme')||'auto');motionMode=motionPreference();updateMotionButtons();await init();}
  };

}
