import { describe, expect, it } from 'vitest';
import { critiqueDocument } from '../writing-precision-gate';
import type { CsrClaimReceipt, CsrEvidenceFact } from '../csr-claim-reconciliation';

const hash='a'.repeat(64);
const fact: CsrEvidenceFact={factId:'T14.2.1',sourceId:'vault:analysis',
 sourceSha256:hash,sourceLocation:'Table 14.2.1 row 1',status:'qualified',
 analysisPopulation:'ITT',endpoint:'Global cure',numerator:190,denominator:250,
 estimate:0.76,method:'observed proportion',unit:'proportion'};
const claim: CsrClaimReceipt={claimId:'11.4.1',section:'11.4',factId:'T14.2.1',
 sourceSha256:hash,analysisPopulation:'ITT',endpoint:'Global cure',
 numerator:190,denominator:250,estimate:0.76,method:'observed proportion',unit:'proportion'};
const sections=[{title:'11.4 Efficacy',text:'The global cure results require independent clinical review.'}];
describe('existing AnA document critique CSR evidence integration',()=>{
 it('does not silently pass a CSR without numerical source receipts',()=>{
  const result=critiqueDocument(sections,{documentType:'csr'});
  expect(result.csrEvidence?.status).toBe('not_assessed');
  expect(result.verdict).toBe('revise');
 });
 it('reconciles qualified source-bound claims without implying approval',()=>{
  const result=critiqueDocument(sections,{documentType:'csr',csrClaims:[claim],csrEvidence:[fact]});
  expect(result.csrEvidence?.status).toBe('reconciled_pending_human_review');
  expect(result.csrEvidence?.checkedClaims).toBe(1);
 });
 it('blocks denominator drift and withdrawn source evidence',()=>{
  const drift=critiqueDocument(sections,{documentType:'csr',csrClaims:[{...claim,denominator:249}],csrEvidence:[fact]});
  expect(drift.csrEvidence?.status).toBe('blocked');
  expect(drift.verdict).toBe('revise');
  expect(drift.csrEvidence?.findings.some(f=>f.code==='NUMERIC_MISMATCH')).toBe(true);
  const withdrawn=critiqueDocument(sections,{documentType:'csr',csrClaims:[claim],csrEvidence:[{...fact,status:'withdrawn'}]});
  expect(withdrawn.verdict).toBe('revise');
 });
 it('does not impose CSR-only evidence requirements on a protocol',()=>{
  const result=critiqueDocument(sections,{documentType:'protocol'});
  expect(result.csrEvidence).toBeUndefined();
 });
});
