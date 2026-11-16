import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const jsfiles=['app.js','controls.js','cinematic.js'].map(p=>fs.readFileSync(path.join(root,'src',p),'utf8'));

test('all required HTML elements referenced by UI modules exist and HTML IDs are unique',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'Duplicate id values');
 const set=new Set(ids);
 for(const script of jsfiles){
  for(const m of script.matchAll(/\$\('([^']+)'\)/g))assert.ok(set.has(m[1]),'Missing #'+m[1]);
  for(const m of script.matchAll(/document\.getElementById\('([^']+)'\)/g))assert.ok(set.has(m[1]),'Missing #'+m[1]);
 }
});

test('four approved modes are selectable without the removed parkour mode',()=>{
 const modes=[...html.matchAll(/class="mode-card(?: selected)?" data-mode="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(modes,['practice','bots','ffa','tdm']);
 assert.doesNotMatch(html,/parkour|파쿠르/i);
});

test('cinematic, loot prices, touch controls and deploy scripts are included',()=>{
 for(const id of ['cinematic','cinematic-canvas','cinematic-skip','cinematic-done','draw-one','draw-ten','edit-controls','mobile-controls','game'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/700 BDC/);assert.match(html,/6,000 BDC/);
 assert.match(css,/cinematic/);
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 assert.match(deploy,/npm test/);assert.match(deploy,/npm run check/);assert.match(deploy,/cp -r src shared dist/);
});
