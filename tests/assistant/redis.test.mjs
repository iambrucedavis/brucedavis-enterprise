import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { admit, configuration } from '../../server/assistant/limits.mjs';
const run=promisify(execFile), cli=process.env.REDIS_TEST_CLI, port=process.env.REDIS_TEST_PORT;
const enabled=Boolean(cli&&port);
const RUN=randomUUID().slice(0,8);
const prefix=name=>'{recruiter:test-'+RUN+'-'+name+'}:';
const base={OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model',UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-token',ASSISTANT_RATE_LIMIT_SECRET:'test-secret-that-is-longer-than-32-characters'};
const req=ip=>new Request('https://site.test/api/recruiter',{headers:{'x-vercel-forwarded-for':ip}});
async function command(parts){const {stdout}=await run(cli,['-p',port,'--json',...parts.map(String)]);return JSON.parse(stdout);}
const fetcher=async(_url,init)=>Response.json({result:await command(JSON.parse(init.body))});
function config(name,extra={}){return {...configuration(base),namespace:'test-'+RUN+'-'+name,...extra};}
function check(name,fn){test(name,{skip:!enabled},fn);}
check('real Redis: visitor quota is shared across calls and instances',async()=>{
 const c=config('visitor');for(let i=0;i<5;i++){const release=await admit(req('192.0.2.10'),c,100,{fetcher});await release();}
 await assert.rejects(admit(req('192.0.2.10'),c,100,{fetcher}),e=>e.code==='rate_limit');
 const keys=await command(['KEYS',prefix('visitor')+'*']);assert(keys.every(k=>!k.includes('192.0.2.10')));
 for(const key of keys){const ttl=await command(['TTL',key]);assert(ttl>0&&ttl<=172800);}
});
check('real Redis: simultaneous requests cannot exceed global concurrency',async()=>{
 const c=config('concurrent',{concurrent:2,minute:10,daily:100,calls:200});
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>admit(req('192.0.2.'+(30+i)),c,100,{fetcher})));
 const allowed=results.filter(x=>x.status==='fulfilled');assert.equal(allowed.length,2);assert(results.filter(x=>x.status==='rejected').every(x=>x.reason.code==='busy'));
 await Promise.all(allowed.map(x=>x.value()));
 const release=await admit(req('192.0.2.99'),c,100,{fetcher});await release();
});
check('real Redis: one visitor cannot hold two active model requests',async()=>{
 const c=config('visitor-lock');const release=await admit(req('192.0.2.11'),c,100,{fetcher});
 await assert.rejects(admit(req('192.0.2.11'),c,100,{fetcher}),e=>e.code==='busy');await release();
});
check('real Redis: global daily call budget is shared and unsupported replies do not spend model calls',async()=>{
 const c=config('calls',{calls:2});for(let i=0;i<2;i++){const release=await admit(req('192.0.2.'+(50+i)),c,100,{fetcher});await release();}
 await assert.rejects(admit(req('192.0.2.53'),c,100,{fetcher}),e=>e.code==='budget');
 const release=await admit(req('192.0.2.53'),c,0,{fetcher});await release();
});
check('real Redis: conservative token allowance cannot be exceeded',async()=>{
 const c=config('tokens',{tokens:1000});for(let i=0;i<2;i++){const release=await admit(req('192.0.2.'+(60+i)),c,400,{fetcher});await release();}
 await assert.rejects(admit(req('192.0.2.63'),c,400,{fetcher}),e=>e.code==='budget');
});
check('real Redis: older release cannot remove a newer visitor lease',async()=>{
 const c=config('release');const release=await admit(req('192.0.2.14'),c,100,{fetcher,uuid:'older-lease'});
 const lock=(await command(['KEYS',prefix('release')+'lock:*']))[0];await command(['SET',lock,'newer-lease','PX',25000]);await release();assert.equal(await command(['GET',lock]),'newer-lease');
});
check('real Redis: expired global lease scores are cleared before admission',async()=>{
 const c=config('expiry',{concurrent:1});await command(['ZADD',prefix('expiry')+'active',Date.now()-1,'expired-lease']);
 const release=await admit(req('192.0.2.15'),c,100,{fetcher});await release();
});
