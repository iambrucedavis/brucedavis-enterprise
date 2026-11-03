import { UNSUPPORTED, SOURCE_PATHS } from './evidence.mjs';
import { candidatesFor, selectionPayload, approvedSelection } from './selection.mjs';
import { configuration, admit, ServiceError } from './limits.mjs';

const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function json(body,status=200,extra={}) { return new Response(JSON.stringify(body),{status,headers:{...HEADERS,...extra}}); }
function unsupported() { return json({status:'unsupported',answer:UNSUPPORTED,sources:[]}); }
async function questionBody(request) {
  if ((request.headers.get('content-type')||'').toLowerCase().split(';')[0].trim() !== 'application/json') throw new ServiceError('invalid_request');
  const length=Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 8192) throw new ServiceError('too_long');
  const reader=request.body?.getReader(); if (!reader) throw new ServiceError('invalid_request');
  let bytes=0;const chunks=[];
  try {
    while (true) { const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new ServiceError('too_long');}chunks.push(value); }
  } finally { reader.releaseLock(); }
  const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new ServiceError('invalid_request');}
  if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.question !== 'string') throw new ServiceError('invalid_request');
  if (body.question.length > 1000) throw new ServiceError('too_long');
  const question=body.question.trim();
  if (!question || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(question)) throw new ServiceError('invalid_request');
  return question;
}
export function createHandler({env=process.env,fetcher=fetch,admission=admit}={}) {
  return async function handle(request) {
    if (request.method !== 'POST') return json({error:'method_not_allowed'},405,{Allow:'POST'});
    const origin=request.headers.get('origin');
    const url=new URL(request.url);
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'invalid_request'},403);
    let release;
    try {
      const question=await questionBody(request);
      const config=configuration(env);
      const candidates=candidatesFor(question);
      const payload=candidates.length ? selectionPayload(question,candidates,config.model) : null;
      // Conservative token reservation: UTF-8 payload bytes + framing allowance
      // and max output. Never refund on errors, so failures cannot bypass budget.
      const reservation=payload ? Buffer.byteLength(JSON.stringify(payload),'utf8')+512+192 : 0;
      if (reservation > 24000) throw new ServiceError('unavailable');
      release=await admission(request,config,reservation,{fetcher});
      if (!candidates.length) return unsupported();
      const response=await fetcher('https://api.openai.com/v1/responses',{
        method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'error'
      });
      // Discard provider bodies on failure. They can contain user content.
      if (!response.ok) throw new ServiceError('unavailable');
      const raw=await response.text();if(raw.length>32000)throw new ServiceError('unavailable');
      let data;try{data=JSON.parse(raw);}catch{throw new ServiceError('unavailable');}
      const records=approvedSelection(data,candidates);
      if(!records.length) return unsupported();
      if(records.some(record=>!SOURCE_PATHS.has(record.href)))return unsupported();
      return json({status:'answered',answer:records.map(record=>record.answer).join('\n\n'),sources:records.map(({id,title,href})=>({id,title,href}))});
    } catch(error) {
      const code=error instanceof ServiceError ? error.code : 'unavailable';
      const status=code==='too_long'?413:code==='invalid_request'?400:['rate_limit','budget','busy'].includes(code)?429:503;
      const retryAfter=error instanceof ServiceError ? error.retryAfter : 0;
      return json({error:code,...(retryAfter?{retryAfter}:{})},status,retryAfter?{'Retry-After':String(retryAfter)}:{});
    } finally { if(release) await release(); }
  };
}
