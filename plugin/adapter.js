// Use the workspace's plugin-data directory, which SiYuan includes in data sync.
// Raw file APIs distinguish missing files from failed reads; loadData cannot.
export function createPluginAdapter({name, fetcher = fetch, signal}) {
  const fields='id, root_id, parent_id, box, hpath, content, markdown, type, created, updated';
  const directory=`/data/storage/petal/${name}`;
  let loaded=false;
  async function call(url, options={}) {
    const response=await fetcher(url,{...options,signal:AbortSignal.any([signal || new AbortController().signal,AbortSignal.timeout(15000)])});
    if(!response.ok && !(url==='/api/file/getFile' && response.status===202))throw new Error(`思源请求失败 (${response.status})`);
    return response;
  }
  async function read(key) {
    const r=await call('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:`${directory}/${key}.json`})});
    if(r.status===202)return null;
    const value=await r.json();
    if(value && typeof value.code==='number')throw new Error(value.msg||'插件数据读取失败');
    return value;
  }
  async function save(key,value) {
    const form=new FormData();form.append('path',`${directory}/${key}.json`);
    form.append('file',new Blob([JSON.stringify(value)],{type:'application/json'}),`${key}.json`);
    const result=await (await call('/api/file/putFile',{method:'POST',body:form})).json();
    if(result.code!==0)throw new Error(result.msg||'插件数据保存失败');
  }
  async function query(stmt) {
    const result=await (await call('/api/query/sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stmt})})).json();
    if(result.code!==0 || (result.data!==null&&!Array.isArray(result.data)))throw new Error(result.msg||'片段查询失败');
    return result.data||[];
  }
  return {read,save,async request(url,options) {
    if(url==='/api/state') {
      if(options?.method==='PUT'){if(!loaded)throw new Error('请先成功读取已有图谱，再保存');const value=JSON.parse(options.body);await save('graph',value);return {ok:true};}
      loaded=false;
      const value=await read('graph');loaded=true;return value;
    }
    if(url==='/api/blocks')return {blocks:await query(`SELECT ${fields} FROM blocks WHERE type = 'p' AND length(trim(content)) > 15 ORDER BY random() LIMIT 160`)};
    if(url==='/api/sync') {
      const {ids}=JSON.parse(options.body);
      if(!Array.isArray(ids)||ids.some(id=>!/^[-\w]{1,80}$/.test(id)))throw new Error('块 ID 无效');
      const blocks=[];
      for(let i=0;i<ids.length;i+=100)blocks.push(...await query(`SELECT ${fields} FROM blocks WHERE id IN (${ids.slice(i,i+100).map(id=>`'${id}'`).join(',')})`));
      return {blocks,checkedIds:ids};
    }
    throw new Error('未知操作');
  }};
}
