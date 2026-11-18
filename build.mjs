import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const readSource = file => fs.readFileSync(path.join(root,file),'utf8');
const bundleSources = () => ['engine.js','sources.js','navigation.js','validation.js','io.js','application.js','motion.js','app.js'].map(file => `\n// ===== ${file} =====\n` + readSource(file).replace(/^import .*?;\r?\n/gm,'').replace(/^export \{.*?\} from .*?;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
export function buildStandalone() {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const css = read('style.css').replace(/@import[^;]+;/g, '');
  const js = bundleSources();
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return read('index.html').replace('<link rel="stylesheet" href="/style.css">', `<style>${css}</style>`)
    .replace('<script type="module" src="/app.js"></script>', `<script>globalThis.PAIRSENTENCE_STANDALONE=true;\n(async()=>{\n${safeJs}\n})();</script>`)
    .replace('href="/" aria-label="间，首页"', 'href="#" aria-label="间，首页"');
}
export function buildUserscript() {
  const css=readSource('style.css').replace(/@import[^;]+;/g,'').replace(/:root\b/g,'.ps-root').replace(/(?<![\w.-])body\b/g,'.ps-root');
  const html=readSource('index.html').match(/<body>([\s\S]*?)<script type="module"/)[1];
  const shell=readSource('userscript-shell.js').replace(/^export /gm,'');
  return `// ==UserScript==
// @name         间 · PairSentence（思源关联探索）
// @namespace    https://pairsentence.local/
// @version      0.5.2
// @description  在 Bilibili 按需打开思源段落关联空间；本机连接、脚本存储、可导入导出
// @match        https://www.bilibili.com/*
// @match        https://*.bilibili.com/*
// @run-at       document-idle
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        GM.registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// @connect      ::1
// ==/UserScript==

/* FILE MAP / 维护导航
 * 00 Host shell: lazy launcher, scoped view, lifecycle and preferences
 * 10 engine.js: domain rules (draft-only mutation)
 * 20 io.js: GM storage and localhost-only network adapter
 * 30 application.js: serialized use cases; save before publishing
 * 40 motion.js: visuals only
 * 50 app.js: UI read model and dependency composition
 * Generated from these named sources by node build.mjs; edit sources then rebuild.
 * No credentials or notebook data are embedded. One active tool window at a time.
 */
(()=>{
'use strict';
${shell}
installUserscript({css:${JSON.stringify(css)},html:${JSON.stringify(html)},start(document,window,localStorage,setInterval){
${bundleSources()}
return {canClose(){if(busy||syncing||previewing){toast('正在完成当前操作，请稍候再收起');return false;}return true;}};
}});
})();
`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(root,'dist'), {recursive:true});
  fs.writeFileSync(path.join(root,'dist','PairSentence.html'), buildStandalone());
  fs.writeFileSync(path.join(root,'dist','PairSentence.user.js'), buildUserscript());
  console.log('已生成 dist/PairSentence.html 和 dist/PairSentence.user.js（不含 Token 或笔记数据）');
}
