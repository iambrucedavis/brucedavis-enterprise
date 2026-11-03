// Local-only preview/test harness. It is not included in Vercel's build inputs.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { Readable } from 'node:stream';
import { createHandler } from '../server/assistant/handler.mjs';
import { EVIDENCE, BY_ID, UNSUPPORTED } from '../server/assistant/evidence.mjs';
import { candidatesFor } from '../server/assistant/selection.mjs';
const root=resolve(import.meta.dirname,'..'), fixtures=process.argv.includes('--fixtures');
const port=Number(process.env.PORT || 8768), attempts=new Map();
const real=createHandler();
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.pdf':'application/pdf','.woff2':'font/woff2','.txt':'text/plain','.mp4':'video/mp4'};
function send(res,status,body,headers={}) { if(!res.destroyed){res.writeHead(status,{'Cache-Control':'no-store',...headers});res.end(body);} }
async function fixture(request) {
 const {question}=await request.json();
 if(question.length>1000)return Response.json({error:'too_long'},{status:413});
 if(question.includes('loading-test'))await new Promise(resolve=>setTimeout(resolve,2200));
 if(question.includes('rate-test'))return Response.json({error:'rate_limit',retryAfter:1},{status:429});
 if(question.includes('unavailable-test'))return Response.json({error:'unavailable'},{status:503});
 if(question.includes('retry-test')){const count=attempts.get(question)||0;attempts.set(question,count+1);if(!count)return Response.json({error:'unavailable'},{status:503});}
 if(question.includes('unsafe-source-test'))return Response.json({status:'answered',answer:'Unsafe test',sources:[{id:'bad',title:'Bad link',href:'javascript:alert(1)'}]});
 let records=candidatesFor(question);
 if(question.includes('applications and early solutions'))records=['veradigm-app','microsoft-onboarding'].map(id=>BY_ID.get(id));
 else if(question.includes('written business requirements'))records=[BY_ID.get('wells-requirements')];
 else if(question.includes('teams and project risks') || question.includes('projects has Bruce managed'))records=[BY_ID.get('bank-rollout')];
 if(!records.length)return Response.json({status:'unsupported',answer:UNSUPPORTED,sources:[]});
 records=records.slice(0,2);
 return Response.json({status:'answered',answer:records.map(record=>record.answer).join('\n\n'),sources:records.map(({id,title,href})=>({id,title,href}))});
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost:'+port);
  if(url.pathname==='/api/recruiter'){
   const web=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await (fixtures?fixture(web):real(web));send(res,response.status,Buffer.from(await response.arrayBuffer()),Object.fromEntries(response.headers));return;
  }
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(name.includes('..') || name.startsWith('.') || !((!name.includes('/') && /^[-a-z0-9]+\.(html|css|js|pdf|svg)$/.test(name)) || /^(fonts|demos|lab|videos)\//.test(name))){send(res,404,'Not found');return;}
  let data=await readFile(resolve(root,name));
  if(fixtures&&name==='index.html')data=Buffer.from(data.toString().replace('<body class="tpm-page">','<body class="tpm-page"><p style="padding:12px 20px;background:#20242B;color:#FAF8F5">Local UI test fixtures — not connected to a live AI model.</p>'));
  send(res,200,data,{'Content-Type':types[extname(name)]||'application/octet-stream'});
 } catch { send(res,404,'Not found'); }
});
server.listen(port,'127.0.0.1',()=>process.stdout.write('Local '+(fixtures?'fixture':'preview')+' server on http://localhost:'+port+'\n'));
