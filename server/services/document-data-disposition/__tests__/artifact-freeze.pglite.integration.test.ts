/** Legacy artifact providers and queued delete/insert jobs obey the same receipt. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { artifactDataEligibleSql, artifactOriginalFileAvailableSql } from '../eligibility';
import { createDispositionHarness, type DispositionHarness } from './disposition-fixture';

let h: DispositionHarness;
beforeAll(async () => { h = await createDispositionHarness(); });
afterAll(async () => { await h.close(); });

describe('artifact rendition eligibility and freezing', () => {
  it.each(['keep_data','remove_data'] as const)('%s governs linked artifacts and refuses late extraction or identity relabeling', async choice => {
    const f = await h.seed();
    await f.apply(choice);
    const rows = (await h.pg.query(`SELECT ${artifactDataEligibleSql('a')} AS data,${artifactOriginalFileAvailableSql('a')} AS binary
      FROM concept2cure_artifacts a WHERE a.id=$1`,[f.artifact])).rows;
    expect(rows).toEqual([{data:choice==='keep_data',binary:false}]);
    await expect(h.pg.query('UPDATE concept2cure_artifacts SET content=$2 WHERE id=$1',[f.artifact,'Late extraction'])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query(`UPDATE concept2cure_artifacts SET artifact_id='mutant-alias',metadata='{}',project_id=NULL WHERE id=$1`,[f.artifact])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query(`INSERT INTO concept2cure_artifacts (organization_id,artifact_id,content,metadata)
      VALUES ($1,'fresh-artifact','Resurrected rendition',$2)`,[f.org,JSON.stringify({fileId:f.upload})])).rejects.toMatchObject({code:'55000'});
  });

  it('denies linked artifacts even if their project scope subsequently becomes unavailable', async () => {
    const f = await h.seed();
    await f.apply('remove_data');
    await h.pg.query('UPDATE projects SET regulatory_program_id=NULL WHERE organization_id=$1',[f.org]);
    const rows=(await h.pg.query(`SELECT ${artifactDataEligibleSql('a')} AS data FROM concept2cure_artifacts a WHERE a.id=$1`,[f.artifact])).rows;
    expect(rows).toEqual([{data:false}]);
  });

  it('refuses a fresh artifact identity pointing at a fresh same-byte raw upload', async () => {
    const f = await h.seed();
    await f.apply('remove_data');
    const upload = randomUUID();
    await h.pg.query(`INSERT INTO file_uploads VALUES ($1,$2,$3,$4,'processed')`,[upload,f.org,'a'.repeat(64),`uploads/org-${f.org}/${upload}`]);
    await expect(h.pg.query(`INSERT INTO concept2cure_artifacts (organization_id,artifact_id,content,metadata)
      VALUES ($1,'fresh-artifact','Resurrected rendition',$2)`,[f.org,JSON.stringify({fileId:upload})])).rejects.toMatchObject({code:'55000'});
  });
});

describe('frozen extraction deletion', () => {
  it.each(['keep_data','remove_data'] as const)('%s preserves related extraction and citation rows while unrelated DELETE remains available', async choice => {
    const f = await h.seed();
    const other = await h.seed();
    await f.apply(choice);
    const scopedDeletes = [
      'DELETE FROM lumen_data_atoms WHERE organization_id=$1',
      'DELETE FROM vault.document_chunks WHERE document_id IN (SELECT id FROM vault.documents WHERE organization_id=$1)',
      'DELETE FROM vault.document_catalog WHERE document_id IN (SELECT id FROM vault.documents WHERE organization_id=$1)',
      'DELETE FROM rag_chunks WHERE document_id IN (SELECT id FROM rag_documents WHERE organization_id=$1)',
      'DELETE FROM rag_documents WHERE organization_id=$1',
      'DELETE FROM concept2cure_artifacts WHERE organization_id=$1',
      'DELETE FROM authoring_citations WHERE tenant_id=$1',
    ];
    for (const sql of scopedDeletes) {
      await expect(h.pg.query(sql,[f.org])).rejects.toMatchObject({code:'55000'});
      expect((await h.pg.query(sql,[other.org])).affectedRows).toBeGreaterThan(0);
    }
    expect((await f.service.preview(f.scope)).counts).toEqual({extractedTexts:3,chunks:2,atoms:3,catalogValues:2,citations:2,downstreamReferences:1});
  });
});
