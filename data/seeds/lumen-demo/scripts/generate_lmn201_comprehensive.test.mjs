import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const generator = new URL('./generate_lmn201_comprehensive.mjs', import.meta.url);
test('generates 500 reconciled, deterministic synthetic participants across 25 domains', () => {
  const a=mkdtempSync(join(tmpdir(),'csr500a-')), b=mkdtempSync(join(tmpdir(),'csr500b-'));
  try {
    for(const dir of [a,b]) {
      const run=spawnSync(process.execPath,[generator.pathname,dir],{encoding:'utf8'});
      assert.equal(run.status,0,run.stderr);
    }
    const source=JSON.parse(readFileSync(join(a,'csr_source_v1_500_synthetic.json'),'utf8'));
    const manifest=JSON.parse(readFileSync(join(a,'manifest.json'),'utf8'));
    assert.equal(source.format,'concept2cure.csr-source.v1');
    assert.equal(source.participants.length,500);
    assert.equal(new Set(source.participants.map(p=>p.subjectId)).size,500);
    assert.deepEqual(source.studyData.treatmentArms.map(x=>x.randomized),[250,250]);
    assert.deepEqual(source.studyData.efficacy.map(x=>x.value),[190/250,140/250]);
    assert.equal(Object.keys(manifest.domains).length,25);
    assert.equal(source.studyData.adverseEvents.length,manifest.domains.AE);
    assert.equal(manifest.sourceSha256,createHash('sha256').update(readFileSync(join(a,'csr_source_v1_500_synthetic.json'))).digest('hex'));
    assert.equal(readFileSync(join(a,'csr_source_v1_500_synthetic.json'),'utf8'),readFileSync(join(b,'csr_source_v1_500_synthetic.json'),'utf8'));
    assert.deepEqual(readdirSync(a).sort(),readdirSync(b).sort());
    assert.match(source.studyInfo.title,/SYNTHETIC/);
    assert.match(source.studyInfo.sponsor,/FICTIONAL DEMO/);
    assert.ok(source.studyData.efficacy.every(e=>e.pValue===undefined&&e.ci===undefined));
  } finally { rmSync(a,{recursive:true,force:true});rmSync(b,{recursive:true,force:true}); }
});
