import { describe, expect, it } from 'vitest';
import { readWorkflowImportResult } from '../../authoringHandoff';
import type { AuthoringSourceImportData, AuthoringSourceImportPreviewData, WorkflowImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';

const programId = '11111111-1111-4111-8111-111111111111';
const docId = '22222222-2222-4222-8222-222222222222';
const fingerprint = 'ab'.repeat(32);
const source: WorkflowImportSource = { kind: 'csr', jobId: 44, sectionNumbers: ['11', '12'] };
const origin: WorkflowImportOrigin = { kind: 'csr', id: '44', programId, title: 'Retained CSR', version: null,
  documentType: null, sectionCode: null, fingerprint, conversion: 'ich-e3-sections', selection: source, gaps: [],
  sourceScope: { level: 'project', projectId: 42, programId: null }, association: { mode: 'recorded', reason: null },
  sectionOrigins: ['11.1', '12.1'].map(code => ({ code, sourceRowId: `csr_section_outputs:${code}`, contentSha256: fingerprint,
    originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' })) };
const preview: AuthoringSourceImportPreviewData = { preview: true, origin, fingerprint,
  sections: origin.sectionOrigins.map(s => ({ code: s.code, title: s.code, contentSha256: s.contentSha256 })), gaps: [], warnings: [],
  target: { programId, projectId: 42 }, association: { mode: 'recorded', required: false, reasonRequired: false,
    sourceProgramId: null, sourceProjectId: 42, targetProgramId: programId } };
const section = (code: string, index: number) => ({ id: `section-${index}`, doc_id: docId, tenant_id: 7, code,
  title: `Working section ${code}`, content: `<p>Reviewed work for ${code}.</p>`, order_index: index });
function copy(): AuthoringSourceImportData {
  return { doc: { id: docId, title: 'Edited working CSR', client_program_id: programId, tenant_id: 7,
    provenance: { source: 'import', importSource: origin } }, sections: [section('11.1', 1), section('12.1', 2)],
    origin, warnings: [], reused: true };
}
const read = (data: AuthoringSourceImportData) => readWorkflowImportResult({ success: true, data }, programId, source, preview);

describe('a verified reused workflow copy keeps its actual saved structure', () => {
  it.each(['renamed', 'added', 'removed', 'reordered'] as const)('admits legitimate %s saved sections without replacing them with the source preview', change => {
    const data = copy();
    if (change === 'renamed') data.sections[0] = { ...data.sections[0], code: 'reviewed.efficacy', title: 'Reviewed efficacy' };
    if (change === 'added') data.sections.push(section('review.notes', 3));
    if (change === 'removed') data.sections = data.sections.slice(1);
    if (change === 'reordered') data.sections.reverse();
    expect(read(data)).toBe(data);
    expect(read(data)?.sections).toBe(data.sections);
  });

  it('keeps the preview section-set check for a newly created copy', () => {
    const created = { ...copy(), reused: false };
    expect(read(created)).toBe(created);
    created.sections.push(section('unexpected.section', 3));
    expect(read(created)).toBeNull();
  });
});

describe('reused source receipts still require exact saved identity and valid rows', () => {
  it.each(['foreign-document', 'foreign-tenant', 'duplicate-id', 'duplicate-code', 'empty-id', 'empty-code'] as const)('refuses %s section rows', problem => {
    const data = copy();
    if (problem === 'foreign-document') data.sections[0].doc_id = 'another-document';
    if (problem === 'foreign-tenant') data.sections[0].tenant_id = 8;
    if (problem === 'duplicate-id') data.sections[1].id = data.sections[0].id;
    if (problem === 'duplicate-code') data.sections[1].code = ' 11.1 ';
    if (problem === 'empty-id') data.sections[0].id = '';
    if (problem === 'empty-code') data.sections[0].code = ' ';
    expect(read(data)).toBeNull();
  });

  it.each(['missing-provenance', 'foreign-provenance', 'changed-provenance', 'missing-program', 'foreign-program'] as const)('refuses %s on the saved document', problem => {
    const data = copy();
    if (problem === 'missing-provenance') delete data.doc.provenance;
    if (problem === 'foreign-provenance') data.doc.provenance = { source: 'import', importSource: { ...origin, selection: { kind: 'csr', jobId: 45, sectionNumbers: ['11', '12'] } } };
    if (problem === 'changed-provenance') data.doc.provenance = { source: 'import', importSource: { ...origin, fingerprint: 'cd'.repeat(32) } };
    if (problem === 'missing-program') delete data.doc.client_program_id;
    if (problem === 'foreign-program') data.doc.client_program_id = 'another-program';
    expect(read(data)).toBeNull();
  });

  it('refuses changed source fingerprints and selections even when the saved rows are valid', () => {
    const data = copy();
    data.origin = { ...origin, fingerprint: 'cd'.repeat(32) };
    expect(read(data)).toBeNull();
    data.origin = { ...origin, selection: { kind: 'csr', jobId: 44, sectionNumbers: ['13'] } };
    expect(read(data)).toBeNull();
  });
});
