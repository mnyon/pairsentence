import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const plain=source=>source.replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');

// Bundle maintained plugin sources directly; no alternate distribution transforms.
// File order defines the concatenation order; keep it topological.
export function buildPlugin() {
  const css=read('src/ui/style.css')+'\n'+read('src/ui/settings.css')+'\n'+read('src/ui/mobile.css');
  const html=read('src/ui/view.html');
  const icon='data:image/png;base64,'+fs.readFileSync(path.join(root,'plugin/icon.png')).toString('base64');
  const core=['domain/engine.js','adapters/siyuan/navigation.js','domain/validation.js','usecases/application.js','ui/motion.js'].map(file=>plain(read(`src/${file}`))).join('\n');
  const view=core+'\n'+plain(read('src/ui/app.js'));
  return 'const PLUGIN_ICON='+JSON.stringify(icon)+';\nconst PLUGIN_CSS='+JSON.stringify(css)+';\nconst PLUGIN_HTML='+JSON.stringify(html)+';\n'+read('src/plugin/shell.cjs')
    .replace('/* PAIRSENTENCE_VIEW */',view)
    .replace('/* PAIRSENTENCE_ADAPTER */',plain(read('src/adapters/siyuan/adapter.js'))+'\n'+plain(read('src/adapters/host/mobile-input.js')));
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
// Package READMEs are generated from the repository README files: the bundle
// carries no docs/images, so relative image paths would break in the listing.
export function packageFiles() {
  const manifest=JSON.parse(read('plugin/plugin.json'));
  const repo=String(manifest.url||'').replace(/\/+$/,'');
  const imageBase=/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repo)?repo.replace('https://github.com/','https://raw.githubusercontent.com/')+'/main/':'';
  const localized=file=>read(file).replaceAll('docs/images/',`${imageBase}docs/images/`);
  return {
    'index.js':buildPlugin(),
    'index.css':'/* Styles are scoped inside the PairSentence view. */\n',
    'plugin.json':read('plugin/plugin.json'),
    'icon.png':fs.readFileSync(path.join(root,'plugin/icon.png')),
    'README.md':localized('README.en.md'),
    'README.zh-CN.md':localized('README.md'),
    'LICENSE':read('LICENSE'),
    'LICENSE-TWEMOJI':read('plugin/LICENSE-TWEMOJI'),
    'THIRD-PARTY-NOTICES.md':read('plugin/THIRD-PARTY-NOTICES.md')
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const files=packageFiles();
  const out=path.join(root,'dist','pairsentence');
  fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
  for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(out,name),data);
  fs.writeFileSync(path.join(root,'dist','package.zip'),zipFiles(files));
  console.log('已生成 dist/pairsentence 和 dist/package.zip');
}
