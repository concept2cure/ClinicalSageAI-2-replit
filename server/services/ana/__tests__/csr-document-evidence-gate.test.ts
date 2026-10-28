import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCsrDocumentEvidence } from '../csr-document-evidence-gate';
const text='Illustrative result';
const hash=createHash('sha256').update(text).digest('hex');
const fact={factId:'F1',sourceId:'S1',sourceSha256:'a'.repeat(64),sourceLocation:'Table 1',status:'qualified' as const,analysisPopulation:'ITT',endpoint:'Cure',numerator:1,denominator:2};
const entry=(id:string)=>({snapshot:{sectionId:id,savedContent:text,anaRunId:'R1'},binding:{sectionId:id,sectionSha256:hash,anaRunId:'R1',claimIds:[id+'C']},claims:[{claimId:id+'C',section:id,factId:'F1',sourceSha256:fact.sourceSha256,analysisPopulation:'ITT',endpoint:'Cure',numerator:1,denominator:2}]});
describe('CSR document evidence gate',()=>{
 it('checks the complete manifest',()=>{
  expect(verifyCsrDocumentEvidence(['A','B'],[entry('A'),entry('B')],[fact])).toMatchObject({status:'reconciled_pending_human_review',checkedSections:2,checkedClaims:2});
 });
 it('rejects missing sections',()=>{
  expect(verifyCsrDocumentEvidence(['A','B'],[entry('A')],[fact]).issues).toContainEqual({sectionId:'B',code:'MISSING_SECTION'});
 });
 it('rejects duplicate and unexpected sections',()=>{
  expect(verifyCsrDocumentEvidence(['A'],[entry('A'),entry('A')],[fact]).status).toBe('blocked');
  expect(verifyCsrDocumentEvidence(['A'],[entry('A'),entry('B')],[fact]).status).toBe('blocked');
 });
 it('rejects changed content, missing binding and withdrawn evidence',()=>{
  const changed=entry('A');changed.snapshot.savedContent+='!';
  expect(verifyCsrDocumentEvidence(['A'],[changed],[fact]).status).toBe('blocked');
  const missing={...entry('A'),binding:null};
  expect(verifyCsrDocumentEvidence(['A'],[missing],[fact]).status).toBe('blocked');
  expect(verifyCsrDocumentEvidence(['A'],[entry('A')],[{...fact,status:'withdrawn'}]).status).toBe('blocked');
 });
 it('rejects empty manifest and content',()=>{
  expect(verifyCsrDocumentEvidence([],[],[fact]).status).toBe('blocked');
  const empty=entry('A');empty.snapshot.savedContent='';
  expect(verifyCsrDocumentEvidence(['A'],[empty],[fact]).status).toBe('blocked');
 });
 it('rejects a reused claim identifier across different sections',()=>{
  const first=entry('A');
  const second=entry('B');
  second.claims[0].claimId=first.claims[0].claimId;
  second.binding.claimIds=[first.claims[0].claimId];
  const result=verifyCsrDocumentEvidence(['A','B'],[first,second],[fact]);
  expect(result.status).toBe('blocked');
  expect(result.issues).toContainEqual({sectionId:'B',code:'DUPLICATE_DOCUMENT_CLAIM'});
 });
 it('rejects duplicate source fact identifiers in the document ledger',()=>{
  const result=verifyCsrDocumentEvidence(['A'],[entry('A')],[fact,{...fact}]);
  expect(result.status).toBe('blocked');
  expect(result.issues).toContainEqual({sectionId:'',code:'DUPLICATE_EVIDENCE_FACT'});
 });

});
