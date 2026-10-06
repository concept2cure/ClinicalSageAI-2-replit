/** The actual migration and shared consumer predicates run against real SQL. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  atomDataEligibleSql, atomOriginalFileAvailableSql,
  capturedBinaryAvailableSql, capturedDataEligibleSql, capturedDispositionChoiceSql,
  uploadedBinaryAvailableSql, vaultBinaryAvailableSql, vaultDataEligibleSql, vaultDispositionChoiceSql,
  ragDataEligibleSql,ragOriginalFileAvailableSql,
} from '../eligibility';
import { createDispositionHarness, insertCapturedSuccessor, type DispositionFixture, type DispositionHarness } from './disposition-fixture';

let h: DispositionHarness;
beforeAll(async () => { h = await createDispositionHarness(); });
afterAll(async () => { await h.close(); });
const HASH = 'a'.repeat(64);

async function projections(f: DispositionFixture) {
  return {
    captured: (await h.pg.query(`SELECT s.id, ${capturedDataEligibleSql('s')} AS data, ${capturedBinaryAvailableSql('s')} AS binary,
      ${capturedDispositionChoiceSql('s')} AS choice FROM cre_evidence_sources s WHERE organization_id=$1 ORDER BY id`, [f.org])).rows,
    vault: (await h.pg.query(`SELECT v.id::text, ${vaultDataEligibleSql('v')} AS data, ${vaultBinaryAvailableSql('v')} AS binary,
      ${vaultDispositionChoiceSql('v')} AS choice FROM vault.documents v WHERE organization_id=$1 ORDER BY id`, [f.org])).rows,
  };
}

describe('consumer disposition projections', () => {
  it('keep_data withdraws captured and vault binaries while preserving extracted data', async () => {
    const f = await h.seed();
    await f.apply('keep_data');
    const result = await projections(f);
    expect(result.captured).toEqual([{ id: f.capture, data: true, binary: false, choice: 'keep_data' }]);
    expect(result.vault).toEqual([{ id: f.vault, data: true, binary: false, choice: 'keep_data' }]);
    const atoms = (await h.pg.query(`SELECT ${atomDataEligibleSql('a')} AS data, ${atomOriginalFileAvailableSql('a')} AS binary
      FROM lumen_data_atoms a WHERE organization_id=$1`, [f.org])).rows;
    expect(atoms).toEqual(Array(3).fill({ data: true, binary: false }));
  });

  it('remove_data excludes current data and binaries without deleting historical identities', async () => {
    const f = await h.seed();
    await f.apply('remove_data', { targetType: 'vault_document', targetId: f.vault });
    const result = await projections(f);
    expect(result.captured).toEqual([{ id: f.capture, data: false, binary: false, choice: 'remove_data' }]);
    expect(result.vault).toEqual([{ id: f.vault, data: false, binary: false, choice: 'remove_data' }]);
  });

  it('supersede excludes the predecessor and keeps the named successor eligible', async () => {
    const f = await h.seed();
    const successor = await insertCapturedSuccessor(f);
    await f.apply('supersede', { replacementId: successor });
    const result = await projections(f);
    expect(result.captured).toEqual([
      { id: f.capture, data: false, binary: false, choice: 'supersede' },
      { id: Number(successor), data: true, binary: true, choice: null },
    ]);
  });

  it('projects the later terminal decision by sequence when chained decisions share a timestamp', async () => {
    const f = await h.seed();
    await f.apply('keep_data');
    expect((await projections(f)).captured[0]).toMatchObject({ data: true, choice: 'keep_data' });
    await f.apply('remove_data');
    const result = await projections(f);
    expect(result.captured).toEqual([{ id: f.capture, data: false, binary: false, choice: 'remove_data' }]);
    expect(result.vault).toEqual([{ id: f.vault, data: false, binary: false, choice: 'remove_data' }]);
    const atoms = (await h.pg.query(`SELECT ${atomDataEligibleSql('a')} AS data FROM lumen_data_atoms a WHERE organization_id=$1`, [f.org])).rows;
    expect(atoms).toEqual(Array(3).fill({ data: false }));
  });

  it('keeps matching bytes eligible in another organization or another program', async () => {
    const f = await h.seed();
    const other = await h.seed();
    const otherProgram = randomUUID();
    await h.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [otherProgram, f.org]);
    const otherSource = (await h.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,checksum,provenance,metadata,is_current)
      VALUES ($1,$2,'client_document',$3,'{}','{}',true) RETURNING id`, [f.org, otherProgram, HASH])).rows[0].id;
    await f.apply('remove_data');
    const rows = (await h.pg.query(`SELECT s.id, ${capturedDataEligibleSql('s')} AS data, ${capturedBinaryAvailableSql('s')} AS binary
      FROM cre_evidence_sources s WHERE s.id = ANY($1::integer[]) ORDER BY s.id`, [[f.capture, other.capture, otherSource]])).rows;
    expect(rows).toEqual([
      { id: f.capture, data: false, binary: false }, { id: other.capture, data: true, binary: true }, { id: otherSource, data: true, binary: true },
    ]);
  });

  it('keeps unrelated upload binaries available while excluding linked originals', async () => {
    const f = await h.seed();
    const other = await h.seed();
    await f.apply('keep_data');
    const rows = (await h.pg.query(`SELECT id,${uploadedBinaryAvailableSql('u')} AS binary FROM file_uploads u
      WHERE id = ANY($1::text[]) ORDER BY id`, [[f.upload, other.upload]])).rows;
    expect(rows).toEqual([{ id: f.upload, binary: false }, { id: other.upload, binary: true }].sort((a, b) => a.id.localeCompare(b.id)));
  });

});

describe('binary scope and late RAG writes', () => {
  it.each(['keep_data','remove_data'] as const)('%s cannot resurrect binary access through a fresh upload ID holding the same bytes',async choice=> {
    const f=await h.seed(); const other=await h.seed();
    await f.apply(choice);
    const newUpload=randomUUID();
    await h.pg.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status) VALUES ($1,$2,$3,$4,'uploaded')`,[newUpload,f.org,HASH,`uploads/org-${f.org}/${newUpload}`]);
    const rows=(await h.pg.query(`SELECT id,${uploadedBinaryAvailableSql('u')} AS binary FROM file_uploads u WHERE u.id=ANY($1::text[])`,[[newUpload,other.upload]])).rows;
    expect(rows.find(r=>r.id===newUpload)).toMatchObject({binary:false});
    expect(rows.find(r=>r.id===other.upload)).toMatchObject({binary:true});
  });

  it('uses the programme tenant for a legacy NULL-org Vault version and refuses contradictory tenant metadata',async ()=> {
    const f=await h.seed();
    await h.pg.query('UPDATE vault.documents SET organization_id=NULL WHERE id=$1',[f.vault]);
    const preview=await f.service.preview({...f.scope,targetType:'vault_document',targetId:f.vault});
    expect(preview.linkedIds.vaultDocumentIds).toEqual([f.vault]);
    await f.service.apply({...f.scope,targetType:'vault_document',targetId:f.vault,choice:'keep_data',reason:'Withdraw original while retaining extraction',previewToken:preview.previewToken});
    const projected=(await h.pg.query(`SELECT ${vaultDataEligibleSql('v')} AS data,${vaultBinaryAvailableSql('v')} AS binary FROM vault.documents v WHERE v.id=$1`,[f.vault])).rows;
    expect(projected).toEqual([{data:true,binary:false}]);
    await expect(h.pg.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1',[f.vault,'Late OCR'])).rejects.toMatchObject({code:'55000'});
    const contradictory=await h.seed();
    await h.pg.query('UPDATE vault.documents SET organization_id=$2 WHERE id=$1',[contradictory.vault,contradictory.org+10000]);
    await expect(contradictory.service.preview({...contradictory.scope,targetType:'vault_document',targetId:contradictory.vault})).rejects.toMatchObject({code:'UNVERIFIED_SCOPE'});
  });

  it.each(['keep_data','remove_data'] as const)('%s freezes both RAG metadata and late RAG chunks while projecting retained binary availability',async choice=> {
    const f=await h.seed();
    const parent=(await h.pg.query<{id:string}>('SELECT id FROM rag_documents WHERE organization_id=$1',[f.org])).rows[0];
    await f.apply(choice);
    const rows=(await h.pg.query(`SELECT ${ragDataEligibleSql('r')} AS data,${ragOriginalFileAvailableSql('r')} AS binary FROM rag_documents r WHERE r.id=$1`,[parent.id])).rows;
    expect(rows).toEqual([{data:choice==='keep_data',binary:false}]);
    await expect(h.pg.query('INSERT INTO rag_chunks (document_id,content) VALUES ($1,$2)',[parent.id,'Late reindex text'])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE rag_chunks SET content=$2 WHERE document_id=$1',[parent.id,'Late reindex text'])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE rag_documents SET document_id=$2 WHERE id=$1',[parent.id,'relabelled-source'])).rejects.toMatchObject({code:'55000'});
  });

  it('recognizes every supported atom alias and tolerates malformed numeric source IDs', async () => {
    const f = await h.seed();
    const excluded: Array<[string, string, Record<string, unknown>]> = [
      ['cre_evidence_source', String(f.capture), {}], ['captured_source', String(f.capture), {}],
      ['chat_upload', `cre_source:${f.capture}`, {}], ['chat_upload', `upload:${f.upload}`, {}],
      ['clinical_regulatory_evidence', 'different', { sourceId: f.capture }],
      ['clinical_regulatory_evidence', 'supporting-lesson', { supportingSourceIds: [f.capture] }],
      ['clinical_regulatory_evidence', 'contradicting-lesson', { contradictingSourceIds: [f.capture] }],
      ['vault_document', f.vault, {}], ['vault_documents', f.vault, {}],
      ...['artifact','data_room_upload','chat_upload','concept2cure_artifact','concept2cure_artifacts','upload','file_upload','file_uploads','uploaded_document','uploaded-file']
        .map((kind): [string, string, Record<string, unknown>] => [kind, String(f.artifact), {}]),
    ];
    const ids: number[] = [];
    for (const [kind, id, structured] of excluded) {
      ids.push((await h.pg.query<{ id: number }>('INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,structured_data) VALUES ($1,$2,$3,$4) RETURNING id',
        [f.org, kind, id, JSON.stringify(structured)])).rows[0].id);
    }
    for (const [kind, id] of [['cre_evidence_source', 'not-numeric'], ['cre_evidence_source', '999999'], ['unrelated', String(f.capture)]]) {
      ids.push((await h.pg.query<{ id: number }>('INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,structured_data) VALUES ($1,$2,$3,$4) RETURNING id',
        [f.org, kind, id, '{}'])).rows[0].id);
    }
    await f.apply('remove_data');
    const rows = (await h.pg.query(`SELECT ${atomDataEligibleSql('a')} AS data FROM lumen_data_atoms a WHERE id = ANY($1::integer[]) ORDER BY id`, [ids])).rows;
    expect(rows.map(row => row.data)).toEqual([...excluded.map(() => false), true, true, true]);
  });
});

describe('append-only disposition migration', () => {
  it('refuses reparenting a disposed atom, chunk, catalog row or citation into an eligible identity', async () => {
    const f = await h.seed();
    const other = await h.seed();
    await f.apply('remove_data');
    await expect(h.pg.query(`UPDATE lumen_data_atoms SET source_type='unrelated',source_id='mutant-alias',structured_data='{}'
      WHERE organization_id=$1`,[f.org])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE vault.document_chunks SET document_id=$2 WHERE document_id=$1',[f.vault,other.vault])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE vault.document_catalog SET document_id=$2 WHERE document_id=$1',[f.vault,other.vault])).rejects.toMatchObject({code:'55000'});
    const parents=(await h.pg.query<{id:string;organization_id:number}>('SELECT id,organization_id FROM rag_documents WHERE organization_id=ANY($1::int[])',[[f.org,other.org]])).rows;
    await expect(h.pg.query('UPDATE rag_chunks SET document_id=$2 WHERE document_id=$1',[parents.find(r=>r.organization_id===f.org)!.id,parents.find(r=>r.organization_id===other.org)!.id])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE authoring_citations SET source=$2,reference_id=$3 WHERE tenant_id=$1',[f.org,'unrelated','mutant-alias'])).rejects.toMatchObject({code:'55000'});
    expect((await f.service.preview(f.scope)).counts).toEqual({extractedTexts:3,chunks:2,atoms:3,catalogValues:2,citations:2,downstreamReferences:1});
  });

  it('replays with one trigger of each kind and blocks update, delete and truncate', async () => {
    const f = await h.seed();
    const { disposition } = await f.apply();
    const triggers = (await h.pg.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.document_data_dispositions'::regclass
      AND NOT tgisinternal ORDER BY tgname`)).rows;
    expect(triggers).toEqual([
      { tgname: 'document_data_dispositions_append_only' }, { tgname: 'document_data_dispositions_identity_guard' }, { tgname: 'document_data_dispositions_no_truncate' },
    ]);
    await expect(h.pg.query('UPDATE public.document_data_dispositions SET reason=$2 WHERE id=$1', [disposition.id, 'Changed without consent'])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('DELETE FROM public.document_data_dispositions WHERE id=$1', [disposition.id])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('TRUNCATE public.document_data_dispositions')).rejects.toMatchObject({ code: '55000' });
    expect(await f.records()).toHaveLength(1);
  });

  it('enforces source identity and a monotonic disposition chain at the database door', async () => {
    const f = await h.seed();
    await f.apply();
    const copy = `INSERT INTO public.document_data_dispositions
      (id,organization_id,program_id,captured_source_id,vault_document_id,choice,reason,actor_id,source_sha256,
       preview_hash,linked_ids,replacement_captured_source_id,replacement_vault_document_id,impact_snapshot,audit_receipt)
      SELECT gen_random_uuid(),organization_id,program_id,captured_source_id,vault_document_id,choice,reason,actor_id,
       source_sha256,preview_hash,linked_ids,replacement_captured_source_id,replacement_vault_document_id,impact_snapshot,audit_receipt
      FROM public.document_data_dispositions WHERE organization_id=$1`;
    await expect(h.pg.query(copy, [f.org])).rejects.toMatchObject({ code: '23514' });
    await expect(h.pg.query(copy.replace('gen_random_uuid(),organization_id,program_id', 'gen_random_uuid(),organization_id+10000,program_id'), [f.org]))
      .rejects.toMatchObject({ code: '23514' });
    expect(await f.records()).toHaveLength(1);
  });

  it.each(['keep_data','remove_data'] as const)('%s freezes linked OCR, atoms, chunks and catalog writes and refuses same-byte resurrection', async choice => {
    const f = await h.seed();
    await f.apply(choice);
    await expect(h.pg.query('UPDATE cre_evidence_sources SET extraction_status=\'reconciled\' WHERE id=$1', [f.capture])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('UPDATE vault.documents SET extracted_text=\'New OCR\' WHERE id=$1', [f.vault])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('UPDATE vault.document_catalog SET key_data=\'{}\' WHERE document_id=$1', [f.vault])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('UPDATE vault.document_chunks SET chunk_text=\'Changed text\' WHERE document_id=$1', [f.vault])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query('INSERT INTO vault.document_chunks (document_id,chunk_text) VALUES ($1,\'Late extraction\')', [f.vault])).rejects.toMatchObject({ code: '55000' });
    for (const [type, id] of [['captured_source', String(f.capture)], ['chat_upload', `cre_source:${f.capture}`], ['chat_upload', `upload:${f.upload}`], ['artifact', String(f.artifact)]]) {
      await expect(h.pg.query('INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,content) VALUES ($1,$2,$3,\'Late OCR value\')', [f.org,type,id])).rejects.toMatchObject({ code: '55000' });
    }
    await expect(h.pg.query(`INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,structured_data,content)
      VALUES ($1,'clinical_regulatory_evidence','late-lesson',$2,'Late derived guidance')`,[f.org,JSON.stringify({supportingSourceIds:[f.capture]})])).rejects.toMatchObject({code:'55000'});
    await expect(h.pg.query('UPDATE lumen_data_atoms SET content=\'Changed extract\' WHERE organization_id=$1', [f.org])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query(`INSERT INTO cre_evidence_sources (organization_id,client_program_id,source_type,checksum)
      VALUES ($1,$2,'client_document',$3)`, [f.org,f.program,HASH])).rejects.toMatchObject({ code: '55000' });
    await expect(h.pg.query(`INSERT INTO vault.documents (id,organization_id,program_id,content_hash,processing_status,extracted_text)
      VALUES ($1,$2,$3,$4,'INDEXED','Re-uploaded OCR')`, [randomUUID(),f.org,f.program,HASH])).rejects.toMatchObject({ code: '55000' });
    expect((await f.service.preview(f.scope)).counts).toEqual({ extractedTexts: 3, chunks: 2, atoms: 3, catalogValues: 2, citations: 2, downstreamReferences: 1 });
  });
});
