import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const base='56f5b4dbbdbc570e392f84c2dd536984a22295ee';
const html=readFileSync('index.html','utf8'),js=readFileSync('assistant.js','utf8');
const records=JSON.parse(readFileSync('docs/experience-guide-evidence.json','utf8'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const original=path=>execFileSync('git',['show',base+':'+path]);
test('every curated answer is unchanged and has its reviewed source',()=>{
 assert.equal(records.length,17);
 for(const record of records){
  const block=html.match(new RegExp(`<article data-evidence="${record.id}">([\\s\\S]*?)</article>`))?.[1];
  assert.ok(block,record.id);assert.ok(block.includes('<p>'+esc(record.answer)+'</p>'),record.id);
  assert.ok(block.includes('href="'+record.href+'"'),record.id);
  const [file,hash]=record.href.slice(1).split('#');
  assert.ok(existsSync(file),file);
  if(hash)assert.match(readFileSync(file,'utf8'),new RegExp(`id=["']${hash}["']`));
 }
});
test('all four questions and seven topic links reach native answer disclosures',()=>{
 const links=[...html.matchAll(/href="#(experience-[^"]+)" data-experience-link/g)];
 assert.equal(links.length,14);assert.equal((html.match(/<details id="experience-/g)||[]).length,7);
 for(const [,id]of links)assert.ok(html.includes(`<details id="${id}"><summary>`),id);
 assert.match(js,/target\.open = true/);assert.match(js,/\.focus\(\{ preventScroll: true \}\)/);
 assert.match(js,/hashchange/);assert.match(js,/pageshow/);
});
test('no AI, request form, storage or network client remains in the guide',()=>{
 const guide=html.slice(html.indexOf('<section id="ask-about-experience"'),html.indexOf('</section>',html.indexOf('<section id="ask-about-experience"')));
 assert.doesNotMatch(guide,/<form|<textarea|AI assistant|OpenAI|Redis|chat history/i);
 assert.match(guide,/<h2>Experience guide<\/h2>/);
 assert.match(guide,/Explore prepared answers about my experience, skills, and projects\./);
 assert.match(guide,/I don’t have verified information about that/);
 assert.match(guide,/data-clear-guide/);
 assert.match(js,/Guide cleared\./);
 assert.match(guide,/data-hj-suppress/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|console\./);
 for(const path of ['api/recruiter.mjs','server/assistant/handler.mjs','server/assistant/limits.mjs','.env.example'])assert.equal(existsSync(path),false,path);
 assert.deepEqual(readFileSync('vercel.json'),original('vercel.json'));
});
test('all existing site files and resume bytes remain unchanged outside the added section',()=>{
 const start=html.indexOf('<section id="ask-about-experience"');const end=html.indexOf('</section>',start)+11;
 let stripped=(html.slice(0,start)+html.slice(end)).replace('<link rel="stylesheet" href="assistant.css">\n','').replace('<script src="assistant.js" defer></script>\n','').replace('<p class="assistant-discovery"><a class="text-action" href="#ask-about-experience">Explore my experience →</a></p>\n','');
 assert.equal(stripped,original('index.html').toString());
 const files=execFileSync('git',['ls-tree','-r','--name-only',base]).toString().trim().split('\n');
 for(const path of files.filter(p=>/\.(html|css|js|svg|pdf|docx|json|woff2|mp4|txt)$/.test(p)&&p!=='index.html'&&!p.startsWith('tools/'))){
  assert.equal(execFileSync('git',['hash-object',path]).toString().trim(),execFileSync('git',['rev-parse',base+':'+path]).toString().trim(),path);
 }
});
