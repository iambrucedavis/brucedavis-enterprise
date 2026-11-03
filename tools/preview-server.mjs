// Local-only static preview. No API, credentials, model calls or fixture answers.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve(import.meta.dirname,'..'),port=Number(process.env.PORT || 8768);
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.pdf':'application/pdf','.woff2':'font/woff2','.txt':'text/plain','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost:'+port);
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(req.method!=='GET'||name.includes('..')||name.startsWith('.')||!((!name.includes('/')&&/^[-a-z0-9]+\.(html|css|js|pdf|svg)$/.test(name))||/^(fonts|demos|lab|videos)\//.test(name)))throw Error();
  const data=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':types[extname(name)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>process.stdout.write('Static preview on http://localhost:'+port+'\n'));
