/** Real lineage SQL and migrations. Native HTTP/RLS proof is kept separately. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let db: PGlite;
const exec = {
  async query<R = Record<string, unknown>>(sql: string, params?: unknown[]) {
    const result = await db.query<R>(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (sql: string, params?: unknown[]) => exec.query(sql, params) } }));

import { enforceAuthorLineage, UnverifiedMachineFormattingError } from '../lineage-gate';
import { summarizeDocumentAttribution, listDocumentSpans, SpanLineageError } from '../span-lineage.service';

const ORG = 789;
const REQUESTER = '101';
const EDITOR = '202';
const ORIGINAL = "<h1>QA saved study report</h1>\n<p>This is stored test content for browser verification, not clinical evidence.</p>\n<table>\n<thead>\n<tr>\n<th>Field</th>\n<th>Stored value</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Purpose</td>\n<td>UI verification only</td>\n</tr>\n<tr>\n<td>Source</td>\n<td>Saved CSR output</td>\n</tr>\n</tbody></table>\n";
const FORMATTED = "<img src=\"/api/authoring/images/file_1791929751823_ngzjr1\" alt=\"qa-governed-figure\"><h1>QA saved study report</h1><p>This is stored test content for browser verification, not clinical evidence.</p><table style=\"min-width: 50px;\"><colgroup><col style=\"min-width: 25px;\"><col style=\"min-width: 25px;\"></colgroup><tbody><tr><th colspan=\"1\" rowspan=\"1\"><p>Field</p></th><th colspan=\"1\" rowspan=\"1\"><p>Stored value</p></th></tr><tr><td colspan=\"1\" rowspan=\"1\"><p>Purpose</p></td><td colspan=\"1\" rowspan=\"1\"><p>UI verification only</p></td></tr><tr><td colspan=\"1\" rowspan=\"1\"><p>Source</p></td><td colspan=\"1\" rowspan=\"1\"><p>Saved CSR output</p></td></tr></tbody></table><p></p>";
const SENTENCE = 'The visit schedule remains unchanged for the study population.';
const OTHER = 'No new safety signals emerged during the treatment period.';
const ref = (documentId: string) => ({ documentTable: 'authoring_sections', documentId });
type RawSpan = { char_start: number; char_end: number; span_text_sha256: string; provenance_kind: string;
  machine_author_id: string | null; asserted_by: string | null; asserted_at: Date | null;
  signature_id: string | null; created_by: string | null; usage: string; confidence: number | null };
const raw = async (documentId: string) => (await exec.query<RawSpan>(
  `SELECT char_start,char_end,span_text_sha256,provenance_kind,machine_author_id,asserted_by,
          asserted_at,signature_id,created_by,usage,confidence
     FROM document_span_lineage WHERE organization_id=$1 AND document_id=$2 AND deleted_at IS NULL
     ORDER BY char_start,char_end`, [ORG, documentId])).rows;

async function imported(documentId: string, content: string) {
  await enforceAuthorLineage(exec, ORG, ref(documentId), content, REQUESTER, { machineDraft: { authorId: 'workflow_import' } });
}
async function saved(documentId: string, previousContent: string, content: string) {
  const options = { previousContent };
  return enforceAuthorLineage(exec, ORG, ref(documentId), content, EDITOR, options);
}
const contains = (span: RawSpan, content: string, value: string) =>
  content.slice(span.char_start, span.char_end).includes(value);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id serial PRIMARY KEY,name text);
    INSERT INTO organizations (id,name) VALUES (${ORG},'Formatting proof');`);
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
  for (const migration of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'db/migrations/20260803_document_span_lineage.sql', 'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql']) await db.exec(fs.readFileSync(path.join(repository, migration), 'utf8'));
}, 90_000);
afterAll(async () => { await db?.close(); });

describe('retained lineage survives supported formatting without manufacturing human review', () => {
  it('preserves the exact QA imported prose across figure insertion and TipTap table normalization', async () => {
    const id = 'format-qa';
    await imported(id, ORIGINAL);
    const initial = await raw(id);
    expect(initial.map(span => [span.char_start,span.char_end])).toEqual([[0,87],[88,322]]);
    await exec.query(`UPDATE document_span_lineage SET usage='derived',confidence=0.84
      WHERE organization_id=$1 AND document_id=$2`, [ORG,id]);
    expect(await saved(id, ORIGINAL, FORMATTED)).toEqual({ clausesInAcceptedText: 0 });
    const rows = await raw(id);
    const machine = rows.filter(span => span.provenance_kind==='machine_draft');
    for (const value of ['QA saved study report','browser verification','not clinical evidence','Stored value','UI verification only','Saved CSR output']) {
      expect(machine.some(span => contains(span,FORMATTED,value)), value).toBe(true);
      expect(rows.filter(span => span.provenance_kind==='author_assertion').some(span => contains(span,FORMATTED,value)), value).toBe(false);
    }
    for (const span of machine) expect(span).toMatchObject({machine_author_id:'workflow_import',created_by:REQUESTER,
      asserted_by:null,asserted_at:null,signature_id:null,usage:'derived',confidence:0.84});
    expect(rows.filter(span => span.provenance_kind==='author_assertion').some(span => contains(span,FORMATTED,'<img'))).toBe(true);
    const summary = await summarizeDocumentAttribution(ORG,ref(id),FORMATTED.length,exec);
    expect(summary.byKind.machineDraftedUnaccepted).toBeGreaterThan(0);
    expect(summary.byKind.machineDrafted).toBe(0);
  });

  it('retains original acceptance, signature, usage and confidence across formatting by another editor', async () => {
    const id = 'format-accepted';
    const prior = `<p>${SENTENCE}</p>`;
    const next = `<p><strong>${SENTENCE}</strong></p>`;
    await enforceAuthorLineage(exec,ORG,ref(id),prior,REQUESTER,{acceptedMachineText:[{authorId:'ana',text:prior}]});
    const signature = 'c0a01272-038f-4a9b-a3a4-dd7061989c64';
    await exec.query(`UPDATE document_span_lineage SET signature_id=$1,usage='summarized',confidence=0.91
      WHERE organization_id=$2 AND document_id=$3`,[signature,ORG,id]);
    const before = await raw(id);
    expect(await saved(id,prior,next)).toEqual({clausesInAcceptedText:0});
    const after = await raw(id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({provenance_kind:'accepted_machine_draft',asserted_by:REQUESTER,
      asserted_at:before[0].asserted_at,signature_id:signature,created_by:REQUESTER,usage:'summarized',confidence:0.91});
    expect(after[0].span_text_sha256).not.toBe(before[0].span_text_sha256);
  });

  it('records newly accepted independent machine prose beside retained acceptance in the same current clause', async () => {
    const id = 'format-fresh-acceptance-remainder';
    const prior = `<p>${SENTENCE}</p>`;
    const next = `<p><strong>${SENTENCE}</strong></p><p>${OTHER}</p>`;
    await enforceAuthorLineage(exec,ORG,ref(id),prior,REQUESTER,{acceptedMachineText:[{authorId:'ana',text:prior}]});
    const options = {previousContent:prior,acceptedMachineText:[{authorId:'ana',text:`<p>${OTHER}</p>`}]};
    const result = await enforceAuthorLineage(exec,ORG,ref(id),next,EDITOR,options);
    expect(result.clausesInAcceptedText).toBe(1);
    const rows = await raw(id);
    expect(rows.some(span => span.provenance_kind==='accepted_machine_draft' && span.asserted_by===REQUESTER && contains(span,next,SENTENCE))).toBe(true);
    expect(rows.some(span => span.provenance_kind==='accepted_machine_draft' && span.asserted_by===EDITOR && contains(span,next,OTHER))).toBe(true);
    expect(rows.some(span => span.provenance_kind==='author_assertion' && contains(span,next,OTHER))).toBe(false);
  });

});

describe('machine and human remainder retain exact prose and cell meaning', () => {
  it('attributes genuinely changed clauses to the editor and retains unchanged imported clauses', async () => {
    const id = 'format-changed';
    const prior = `${SENTENCE} ${OTHER}`;
    const changed = SENTENCE.replace('unchanged','revised');
    const next = `<p>${changed}</p><p><strong>${OTHER}</strong></p>`;
    await imported(id,prior);
    await saved(id,prior,next);
    const rows = await raw(id);
    expect(rows.some(span => span.provenance_kind==='machine_draft' && contains(span,next,OTHER))).toBe(true);
    expect(rows.some(span => span.provenance_kind==='author_assertion' && contains(span,next,OTHER))).toBe(false);
    expect(rows.some(span => span.provenance_kind==='author_assertion' && span.asserted_by===EDITOR && contains(span,next,changed))).toBe(true);
  });

  it('bounds repeated prose to verified original occurrences and refuses changed scientific characters', async () => {
    const id = 'format-repeat';
    const prior = 'The dose was 5*10 mg/kg during treatment.';
    const next = `<p><strong>${prior}</strong></p><p>${prior}</p><p>The dose was 510 mg/kg during treatment.</p>`;
    await imported(id,prior);
    await saved(id,prior,next);
    const rows = await raw(id);
    expect(rows.filter(span => span.provenance_kind==='machine_draft')).toHaveLength(1);
    expect(rows.filter(span => span.provenance_kind==='author_assertion').some(span => contains(span,next,'510 mg/kg'))).toBe(true);
    expect(rows.filter(span => span.provenance_kind==='machine_draft').some(span => contains(span,next,'510 mg/kg'))).toBe(false);
  });

  it('keeps exact untouched table cells while treating changed units or meaning as changed complete values', async () => {
    const id = 'format-cell-value';
    const prior = '<table><tr><th>Dose</th><th>Conclusion</th><th>Visit</th></tr>'
      + '<tr><td>100 mg</td><td>Safety</td><td>Week twelve</td></tr></table>';
    const next = '<table><tbody><tr><th><p>Dose</p></th><th><p>Conclusion</p></th><th><p>Visit</p></th></tr>'
      + '<tr><td><p>100 mg/kg</p></td><td><p>Safety not demonstrated</p></td><td><p>Week twelve</p></td></tr></tbody></table>';
    await imported(id,prior);
    await saved(id,prior,next);
    const rows = await raw(id);
    const machine = rows.filter(span => span.provenance_kind==='machine_draft');
    const author = rows.filter(span => span.provenance_kind==='author_assertion');
    expect(machine.some(span => contains(span,next,'Week twelve'))).toBe(true);
    expect(machine.some(span => contains(span,next,'100 mg'))).toBe(false);
    expect(machine.some(span => contains(span,next,'Safety'))).toBe(false);
    expect(author.some(span => contains(span,next,'100 mg/kg'))).toBe(true);
    expect(author.some(span => contains(span,next,'Safety not demonstrated'))).toBe(true);
  });

});

describe('prior integrity and unsupported-markup refusals are atomic', () => {
  it('fails closed and rolls back instead of converting a corrupt prior machine receipt into human authority', async () => {
    const id = 'format-corrupt';
    await imported(id,SENTENCE);
    await exec.query('UPDATE document_span_lineage SET span_text_sha256=$1 WHERE organization_id=$2 AND document_id=$3', ['0'.repeat(64),ORG,id]);
    const before = await raw(id);
    await db.exec('BEGIN');
    try { await expect(saved(id,SENTENCE,`<p><strong>${SENTENCE}</strong></p>`)).rejects.toBeInstanceOf(SpanLineageError); }
    finally { await db.exec('ROLLBACK'); }
    expect(await raw(id)).toEqual(before);
    expect((await listDocumentSpans(ORG,ref(id),exec)).every(span => span.provenanceKind==='machine_draft')).toBe(true);
  });

  it('preserves an unknown original requester instead of naming the current saver', async () => {
    const id = 'format-unknown-requester';
    await imported(id,SENTENCE);
    await exec.query('UPDATE document_span_lineage SET created_by=NULL WHERE organization_id=$1 AND document_id=$2',[ORG,id]);
    const next = `<p><strong>${SENTENCE}</strong></p>`;
    await saved(id,SENTENCE,next);
    expect(await raw(id)).toEqual([expect.objectContaining({provenance_kind:'machine_draft',created_by:null,asserted_by:null})]);
  });

  it.each([
    `<p title="Additional statement">${SENTENCE}</p>`,
    `<p data-custom="Unknown reader semantics">${SENTENCE}</p>`,
    `<figure><p>${SENTENCE}</p></figure>`,
    `<p><xmp>${SENTENCE}</xmp></p>`,
  ])('refuses unverified caller markup atomically rather than creating a human claim: %s', async next => {
    const id = `format-unsafe-${next.indexOf('>')}`;
    await imported(id,SENTENCE);
    const before = await raw(id);
    await db.exec('BEGIN');
    try { await expect(saved(id,SENTENCE,next)).rejects.toMatchObject({
      name:UnverifiedMachineFormattingError.name,status:422,code:'MACHINE_LINEAGE_FORMATTING_UNVERIFIED'}); }
    finally { await db.exec('ROLLBACK'); }
    expect(await raw(id)).toEqual(before);
  });
});
