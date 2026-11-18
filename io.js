import {normalizeSources,createSourcePool} from './sources.js';
// The same app runs behind the optional development server or directly from one HTML file.
export const userscript = typeof GM !== 'undefined' && typeof GM.getValue === 'function' && typeof GM.xmlHttpRequest === 'function';
export const standalone = userscript || (typeof location !== 'undefined' && (location.protocol === 'file:' || globalThis.PAIRSENTENCE_STANDALONE === true));
const fields = 'id, root_id, parent_id, box, hpath, content, markdown, type, created, updated';
let dbPromise;
function database() {
  return dbPromise ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('pairsentence', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('local');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('浏览器未允许本地保存，请使用普通浏览窗口'));
  });
}
export async function localData(key, value) {
  if(userscript) {
    const storageKey=`pairsentence:${key}`;
    if(value===undefined)return await GM.getValue(storageKey,null);
    await GM.setValue(storageKey,value);return value;
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local', value === undefined ? 'readonly' : 'readwrite');
    const r = value === undefined ? tx.objectStore('local').get(key) : tx.objectStore('local').put(value, key);
    tx.oncomplete = () => resolve(r.result ?? null);
    tx.onerror = () => reject(new Error('本地保存失败，请导出备份后检查浏览器存储空间'));
    tx.onabort = () => reject(new Error('本地保存中断，请导出备份'));
  });
}
export { validateState } from './validation.js';
import { validateState } from './validation.js';
export async function readConfig() {
  if(!standalone)return request('/api/config');
  const sources=normalizeSources(await localData('connection') || {url:'http://127.0.0.1:6806',token:''});
  return {...sources[0],sources};
}
export async function writeConfig(config) {
  const sources=normalizeSources(config),result={...sources[0],sources};
  if(!standalone)return request('/api/config',{method:'PUT',body:JSON.stringify(result)});
  await localData('connection', result);
  return result;
}
export async function queryDirect(stmt, config) {
  const connection = config || await readConfig();
  let r;
  try {
    const endpoint=new URL(connection.url);
    if(!['http:','https:'].includes(endpoint.protocol)||!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw new Error('仅允许连接本机思源');
    const options={
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Token ${connection.token}`},
      body:JSON.stringify({stmt})
    };
    if(userscript) {
      const result=await new Promise((resolve,reject)=>GM.xmlHttpRequest({
        method:options.method,url:endpoint.origin+'/api/query/sql',headers:options.headers,data:options.body,
        timeout:15000,anonymous:true,
        onload:resolve,onerror:()=>reject(new Error('网络请求失败')),ontimeout:()=>reject(new Error('请求超时')),onabort:()=>reject(new Error('请求中断'))
      }));
      r={ok:result.status>=200&&result.status<300,status:result.status,json:async()=>JSON.parse(result.responseText)};
    } else r=await fetch(endpoint.origin+'/api/query/sql',{...options,signal:AbortSignal.timeout(15000)});
  } catch { throw new Error('无法直连思源：请确认思源已启动；如浏览器询问本地网络访问，请允许'); }
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? '连接未授权，请检查思源 API Token' : `思源返回错误 ${r.status}`);
  const value = await r.json();
  if (value.code !== 0) throw new Error(value.msg || '思源查询失败');
  if (value.data !== null && !Array.isArray(value.data)) throw new Error('思源返回格式异常，本次未更新数据');
  return value.data || [];
}
export async function request(url, options) {
  if (!standalone) {
    const r = await fetch(url, { ...options, headers:{'Content-Type':'application/json', ...options?.headers} });
    const v = await r.json(); if (!r.ok) throw new Error(v.error || '请求失败'); return v;
  }
  if (url === '/api/state') {
    if (options?.method === 'PUT') { const value = validateState(JSON.parse(options.body)); await localData('graph', value); return {ok:true}; }
    return localData('graph');
  }
  const pool=createSourcePool({query:queryDirect,readSources:async()=>(await readConfig()).sources});
  if(url==='/api/test-source'){
    const source=normalizeSources({sources:[JSON.parse(options.body)]})[0];
    await queryDirect('SELECT id FROM blocks LIMIT 1',source);return {ok:true};
  }
  if (url === '/api/blocks') return pool.random();
  if (url === '/api/sync') {
    const { ids,sourcesById } = JSON.parse(options.body);
    if (!Array.isArray(ids) || ids.some(id => !/^[\w-]{1,80}$/.test(id))) throw new Error('块 ID 无效');
    return pool.lookup(ids,sourcesById);
  }
  throw new Error('未知操作');
}
