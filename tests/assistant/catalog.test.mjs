import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EVIDENCE, BY_ID } from '../../server/assistant/evidence.mjs';

test('every evidence citation resolves to a real reviewed page or anchor',()=>{
 assert.equal(new Set(EVIDENCE.map(x=>x.id)).size,EVIDENCE.length);
 for(const record of EVIDENCE){
  const [file,anchor]=record.href.slice(1).split('#');const source=readFileSync(new URL('../../'+file,import.meta.url),'utf8');
  if(anchor)assert(source.includes('id="'+anchor+'"'),record.id+' unresolved anchor');
  assert(!/https?:|javascript:|\/\//.test(record.href));
 }
});
test('primary download remains the approved supplied resume',()=>{
 const hash=createHash('sha256').update(readFileSync(new URL('../../bruce-davis-resume.pdf',import.meta.url))).digest('hex');assert.equal(hash,'d44431f375742c92fb6829a330fcb86b9b21d788bb1af5e4e5ba8302073f9338');
});
test('catalog preserves important employer and personal-project boundaries',()=>{
 assert.match(BY_ID.get('bank-rollout').answer,/11\+ teams and 40\+ engineers/);
 assert.match(BY_ID.get('bank-rollout').answer,/production rollout/);
 assert.match(BY_ID.get('wells-requirements').answer,/does not establish a completed migration/);
 assert.match(BY_ID.get('veradigm-app').answer,/separate from his CyberArk pilot/);
 assert.match(BY_ID.get('veradigm-pilot').answer,/not a production rollout/);
 assert.match(BY_ID.get('microsoft-onboarding').answer,/not a completed pilot or production rollout/);
 assert.match(BY_ID.get('microsoft-onboarding').answer,/separate from the Copilot pilot and his personal Day One/);
 for(const id of ['pam-prototype','design-prototype','change-prototype'])assert.match(BY_ID.get(id).answer,/synthetic/);
});
test('client contains no chat persistence or unsafe dynamic HTML insertion',()=>{
 const source=readFileSync(new URL('../../assistant.js',import.meta.url),'utf8');
 assert(!/localStorage|sessionStorage|indexedDB|innerHTML|outerHTML|insertAdjacentHTML|console\./.test(source));
 assert.match(source,/pagehide/);assert.match(source,/AbortController/);
});
