// A kernel API address is a data source, not a browser navigation URL.
// SiYuan's native block protocol avoids cross-site navigation to its HTTP server.
// It does not encode a workspace: the desktop app selects the receiving instance.
export function blockHref(fragment) {
  if(typeof fragment?.id!=='string'||!fragment.id)throw new Error('缺少段落 ID');
  return `siyuan://blocks/${encodeURIComponent(fragment.id)}`;
}
