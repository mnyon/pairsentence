import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageFiles} from '../plugin/build.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const jsFiles = dir => fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.js'));
const importsOf = text => [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]);

test('domain and use cases never reach for host, DOM or transport globals', () => {
  const hostApis = /\b(document|window|localStorage|sessionStorage|fetch|XMLHttpRequest|matchMedia|AbortSignal|navigator|indexedDB|siyuan)\b/;
  for (const dir of ['src/domain', 'src/usecases']) for (const file of jsFiles(dir)) {
    const found = source(`${dir}/${file}`).match(hostApis);
    assert.equal(found, null, `${dir}/${file} 不应引用宿主或浏览器 API：${found?.[0]}`);
  }
});
test('imports point inward: domain <- use cases <- ui / adapters', () => {
  const inward = {
    'src/domain': specifier => specifier.startsWith('./') || specifier.includes('/domain/'),
    'src/usecases': specifier => specifier.startsWith('./') || specifier.includes('/domain/') || specifier.includes('/usecases/')
  };
  for (const [dir, allowed] of Object.entries(inward)) for (const file of jsFiles(dir)) {
    for (const specifier of importsOf(source(`${dir}/${file}`))) assert.ok(allowed(specifier), `${dir}/${file} 的导入越界：${specifier}`);
  }
});
test('build manifest reads existing sources and tests live under test/', () => {
  const build = source('plugin/build.mjs');
  const referenced = [...build.matchAll(/read\('(src\/[^']+)'\)/g)].map(match => match[1]);
  const core = [...(build.match(/const core=\[([^\]]+)\]/)?.[1] || '').matchAll(/'([^']+)'/g)].map(match => `src/${match[1]}`);
  assert.ok(referenced.length >= 7, '构建清单应列出所有分层源文件');
  for (const file of [...referenced, ...core]) assert.ok(fs.existsSync(path.join(root, file)), `构建清单缺少文件：${file}`);
  assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.test.js')), [], '测试文件不应留在仓库根目录');
});
test('package READMEs come from the Chinese and English sources with absolute images', () => {
  const files = packageFiles(), manifest = JSON.parse(source('plugin/plugin.json'));
  const imageBase = `${String(manifest.url).replace(/\/+$/, '').replace('https://github.com/', 'https://raw.githubusercontent.com/')}/main/docs/images/`;
  for (const name of ['README.md', 'README.zh-CN.md']) {
    assert.ok(files[name].includes(imageBase), `${name} 应使用绝对图片地址`);
    assert.ok(!/\]\(docs\/images\//.test(files[name]), `${name} 不应残留相对 Markdown 图片`);
    assert.ok(!/src="docs\/images\//.test(files[name]), `${name} 不应残留相对 HTML 图片`);
  }
  assert.ok(files['README.md'].includes('Meet two note blocks at random'), '包内默认说明应为英文');
  assert.ok(files['README.zh-CN.md'].includes('随机得到两个笔记块'), '包内中文说明应来自 README.md');
  assert.deepEqual(manifest.readme, {default: 'README.md', 'zh-CN': 'README.zh-CN.md'});
  assert.ok(source('README.md').includes('docs/images/discover.png'), '中文 README 仍使用相对路径');
  assert.ok(source('README.en.md').includes('docs/images/discover.png'), '英文 README 仍使用相对路径');
});
