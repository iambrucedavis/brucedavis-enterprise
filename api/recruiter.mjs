import { createHandler } from '../server/assistant/handler.mjs';
// Native Vercel Node.js Web Request/Response handler. No framework migration.
export const POST = createHandler();
export function GET() {
  return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{Allow:'POST','Content-Type':'application/json','Cache-Control':'no-store'}});
}
