import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyGeneratedCsr } from './verify_lmn201_comprehensive.mjs';
const generator=fileURLToPath(new URL('./generate_lmn201_comprehensive.mjs',import.meta.url));
test('cross-domain reconciliation and corruption detection',()=>{
  const dir=mkdtempSync(join(tmpdir(),'csr-verify-'));
  try{
    const run=spawnSync(process.execPath,[generator,dir],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=verifyGeneratedCsr(dir);
    assert.equal(report.participants,500);
    assert.equal(report.domains,25);
    assert.deepEqual(report.globalCureCounts,{LMN201:190,CONTROL:140});
    assert.equal(report.clinicalVerificationEstablished,false);
    const dm=join(dir,'DM.csv');
    const original=readFileSync(dm,'utf8');
    writeFileSync(dm,original.replace('DEMO-LMN201-0001','INVALID-PATIENT'));
    assert.throws(()=>verifyGeneratedCsr(dir),/unknown participant/);
    writeFileSync(dm,original);
    const source=join(dir,'csr_source_v1_500_synthetic.json');
    writeFileSync(source,readFileSync(source,'utf8')+' ');
    assert.throws(()=>verifyGeneratedCsr(dir),/checksum mismatch/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
