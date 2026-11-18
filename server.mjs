import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandalone, buildUserscript } from './build.mjs';
import {normalizeSources,createSourcePool} from './sources.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.existsSync(path.join(root,'sample.js')) ? fs.readFileSync(path.join(root, 'sample.js'), 'utf8') : '';
const base = process.env.SIYUAN_URL || sample.match(/SIYUAN_URL:\s*'([^']+)'/)?.[1] || 'http://127.0.0.1:6806';
const token = process.env.SIYUAN_TOKEN || sample.match(/TOKEN:\s*'([^']+)'/)?.[1] || '';
const port = Number(process.env.PORT || 4173);
const dataDir = path.join(root, 'data');
const stateFile = path.join(dataDir, 'graph.json');
const configFile=path.join(dataDir,'sources.json');
const readSources=()=>normalizeSources(fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{url:base,token});
async function query(stmt,source={url:base,token}) {
  const r = await fetch(source.url + '/api/query/sql', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${source.token}` },
    body: JSON.stringify({ stmt }), signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(r.status===401||r.status===403?'连接未授权，请检查思源 API Token':`思源连接失败（${r.status}）`);
  const value = await r.json();
  if (value.code !== 0) throw new Error(value.msg || '思源查询失败');
  if (value.data !== null && !Array.isArray(value.data)) throw new Error('思源返回了无法识别的数据');
  return value.data || [];
}
const fields = 'id, root_id, parent_id, box, hpath, content, markdown, type, created, updated';
const pool=createSourcePool({query,readSources});
function send(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 12_000_000) throw new Error('数据过大'); }
  return JSON.parse(s || '{}');
}
http.createServer(async (req, res) => {
  try {
    if (!['127.0.0.1', 'localhost'].includes((req.headers.host || '').split(':')[0])) return send(res, 403, { error: '仅允许本机访问' });
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return send(res, 403, { error: '来源不允许' });
    const url = new URL(req.url, `http://localhost:${port}`);
    if(url.pathname==='/api/test-source'&&req.method==='POST'){
      const source=normalizeSources({sources:[await body(req)]})[0];await query('SELECT id FROM blocks LIMIT 1',source);
      return send(res,200,{ok:true});
    }
    if(url.pathname==='/api/config'){
      if(req.method==='GET')return send(res,200,{sources:readSources()});
      if(req.method==='PUT'){
        const sources=normalizeSources(await body(req));
        fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(configFile+'.tmp',JSON.stringify({sources},null,2));fs.renameSync(configFile+'.tmp',configFile);
        return send(res,200,{sources});
      }
    }
    if(url.pathname==='/PairSentence.user.js'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
      return res.end(buildUserscript());
    }
    if (url.pathname === '/PairSentence.html' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Content-Disposition':'attachment; filename="PairSentence.html"' });
      return res.end(buildStandalone());
    }
    if (url.pathname === '/api/blocks' && req.method === 'GET') {
      return send(res, 200, await pool.random());
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const { ids,sourcesById } = await body(req);
      if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => !/^[\w-]{1,80}$/.test(id))) return send(res, 400, { error: '块 ID 无效' });
      return send(res, 200, await pool.lookup(ids,sourcesById));
    }
    if (url.pathname === '/api/state') {
      if (req.method === 'GET') return send(res, 200, fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null);
      if (req.method === 'PUT') {
        const state = await body(req);
        if (state.version !== 1 || !state.nodes || !Array.isArray(state.edges) || !state.history) return send(res, 400, { error: '图数据格式无效' });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2));
        fs.renameSync(stateFile + '.tmp', stateFile);
        return send(res, 200, { ok: true });
      }
    }
    const files = { '/': 'index.html', '/app.js': 'app.js', '/navigation.js':'navigation.js', '/engine.js': 'engine.js', '/sources.js':'sources.js', '/application.js':'application.js', '/io.js':'io.js', '/motion.js':'motion.js', '/style.css': 'style.css' };
    const file = files[url.pathname];
    if (!file || req.method !== 'GET') return send(res, 404, { error: '未找到' });
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(root, file)));
  } catch (e) { send(res, 502, { error: e.message }); }
}).listen(port, '127.0.0.1', () => console.log(`PairSentence is ready: http://127.0.0.1:${port}`));
