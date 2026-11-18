// SOURCE ADAPTER: several kernels feed one graph. IDs and existing links stay intact.
// A failed/removed source is never evidence of deletion. No token enters a block.
export function normalizeSources(config) {
  const list=Array.isArray(config?.sources)?config.sources:[config];
  if(!list.length||list.length>8)throw new Error('请设置 1–8 个思源来源');
  const seen=new Set();
  return list.map(source=>{
    const u=new URL(source.url);
    if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw new Error('请填写本机思源地址');
    const canonical=u.origin.replace('localhost','127.0.0.1');
    if(seen.has(canonical))throw new Error('来源地址重复');seen.add(canonical);
    return {url:u.origin,token:String(source.token||'').trim(),enabled:source.enabled!==false};
  });
}
export function createSourcePool({query,readSources}) {
  async function collect(operation){
    const configured=await readSources(),sources=configured.filter(s=>s.enabled!==false);
    const results=await Promise.allSettled(sources.map(async source=>({source,blocks:await operation(source)})));
    const blocks=new Map(), succeeded=[],warnings=[];
    results.forEach((result,i)=>{
      if(result.status==='rejected'){warnings.push(`${sources[i].url} 暂不可用`);return;}
      const {source,blocks:rows}=result.value;succeeded.push(source.url);
      for(const b of rows){
        const previous=blocks.get(b.id);
        // Duplicate block IDs represent the same fragment. First configured source wins text.
        if(previous)previous.sourceUrls.push(source.url);
        else blocks.set(b.id,{...b,sourceUrls:[source.url]});
      }
    });
    // Returning uncertainty allows cached fragments to remain usable even when
    // every source is offline or deliberately disconnected.
    return {blocks:[...blocks.values()],succeeded,warnings,allOnline:sources.length>0&&sources.length===configured.length&&succeeded.length===sources.length};
  }
  return {
    random:()=>collect(source=>query("SELECT id, root_id, parent_id, box, hpath, content, markdown, type, created, updated FROM blocks WHERE type = 'p' AND length(trim(content)) > 15 ORDER BY random() LIMIT 80",source)),
    async lookup(ids,sourcesById={}){
      const result=await collect(async source=>{
        const rows=[];
        for(let i=0;i<ids.length;i+=100)rows.push(...await query(`SELECT id, root_id, parent_id, box, hpath, content, markdown, type, created, updated FROM blocks WHERE id IN (${ids.slice(i,i+100).map(id=>`'${id}'`).join(',')})`,source));
        return rows;
      });
      const found=new Set(result.blocks.map(b=>b.id)), online=new Set(result.succeeded);
      return {...result,checkedIds:ids.filter(id=>found.has(id)||(result.allOnline&&(sourcesById[id]||[]).every(url=>online.has(url))))};
    }
  };
}
