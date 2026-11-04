/** Common Authoring renderer: ALL document classes, not a CSR-specific path.
 * Test-only adapters make asynchronous mutations deterministic. XML bytes are
 * rendered by production code; Word/PDF adapters expose renderer input, NOT
 * native Office/PDF fidelity. No real signatures, patients or provider calls.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, it, vi } from 'vitest';
import type { RenderExportArgs } from '../authoring-export';

const h = vi.hoisted(() => ({
  onPresentation: null as null | (() => void | Promise<void>),
  onSource: null as null | (() => void | Promise<void>),
  onImages: null as null | (() => void | Promise<void>),
  onCrossRefs: null as null | (() => void),
  onCitations: null as null | (() => void | Promise<void>),
  onPack: null as null | (() => void | Promise<void>),
  onPdf: null as null | (() => void | Promise<void>),
  presentation: null as null | Record<string, unknown>,
  sourceReads: [] as Array<{ doc: Record<string, unknown>; tenant: number; actor: unknown }>,
  releaseReads: [] as unknown[],
  presentationCalls: 0,
  pdfCalls: 0,
}));
vi.mock('../../../../shared/part11/signature-method', () => ({ describeSignatureMethod: () => 'Synthetic verified method' }));
// The actual sectionsDigest implementation is loaded. Its unrelated full-
// snapshot schema is unused by these renderer tests, never simulated as valid.
vi.mock('../../../../shared/authoring/peer-review', () => ({
  authoringSavedSnapshotSchema: { parse: () => { throw Error('Full review schema is outside this test'); } },
}));
vi.mock('../draft-source-references', () => ({
  verifySavedDraftSourceReferences: async (doc: Record<string, unknown>, _q: unknown, tenant: number, actor: unknown) => {
    await h.onSource?.();
    h.sourceReads.push(structuredClone({ doc, tenant, actor }));
  },
}));
vi.mock('../workflow-import-governance', () => ({
  assertWorkflowImportRelease: async (_q: unknown, input: unknown) => { h.releaseReads.push(structuredClone(input)); },
  verifyWorkflowImportWorkingCopy: async () => null,
}));
vi.mock('../../company-documents/correspondence-rendering', () => ({
  readCorrespondencePresentation: async () => { h.presentationCalls++; await h.onPresentation?.(); return h.presentation; },
  correspondenceTemplate: (profile: unknown) => profile,
}));
vi.mock('../../conversion-slots', () => ({ isConversionCapacityError: () => false }));
vi.mock('../../../export/authoring-images.js', () => ({
  resolveAuthoringImages: async () => { await h.onImages?.(); return new Map(); },
}));
vi.mock('@shared/authoring/cross-references', () => ({
  crossReferenceLookupFor: () => { h.onCrossRefs?.(); return new Map(); },
  crossReferenceAnchorId: (id: string) => id,
}));
vi.mock('../../../export/authoring-section-content.js', () => ({
  sectionContentToBlocks: (content: string | null) => [content ?? ''],
  countPendingSuggestions: () => ({ insertions: 0, deletions: 0 }),
  collectCitedSourceIds: () => [], collectCaptionTargets: () => [],
}));
vi.mock('@shared/authoring/citations', () => ({
  citationLookupFor: () => new Map(),
  makeCitationRegistry: () => ({ cite: () => ({ found: false }), entries: () => [] }),
}));
vi.mock('@shared/authoring/captions', () => ({ makeCaptionNumbering: () => ({}) }));
vi.mock('../../clinical-regulatory-evidence/source-usage.service.js', () => ({
  listCitationSources: async () => { await h.onCitations?.(); return []; },
}));
vi.mock('docx', () => {
  class Node { constructor(readonly value: unknown) {} }
  return { Document: Node, Paragraph: Node, TextRun: Node, Header: Node, Footer: Node,
    HeadingLevel: { TITLE: 'title', HEADING_1: 'h1' },
    Packer: { toBuffer: async (doc: unknown) => { await h.onPack?.(); return Buffer.from(JSON.stringify(doc)); } } };
});
vi.mock('../../../export/authoring-blocks-to-docx.js', () => ({
  blocksToDocx: (_ns: unknown, blocks: string[]) => blocks.map(text => ({ text })),
  orderedListNumbering: () => ({}), referenceListParagraphs: () => [],
  sectionHeadingParagraph: (_ns: unknown, section: { code: string; title: string }) => ({ heading: `${section.code} ${section.title}` }),
}));
vi.mock('../../pdf-converter', () => ({
  convertDocxToPdf: async (content: Buffer) => { h.pdfCalls++; await h.onPdf?.(); return { pdf: Buffer.from(content) }; },
}));
vi.mock('../../templates/templateRenderAdapter', () => ({
  templateSpecToDocxStyle: (profile: Record<string, unknown>) => ({ fonts: { body: 'Synthetic' }, fontSizes: { body: 11 }, profile }),
}));
vi.mock('../../docx/docxFactory', () => ({
  regulatoryLetterheadSection: (style: unknown, _doc: unknown, _cover: unknown, banner: string) => ({ style, banner }),
}));

import { renderAuthoringExport, sectionsDigest, WORKING_COPY_SIGNATURE_STATEMENT } from '../authoring-export';

const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const make = (format: RenderExportArgs['format'] = 'xml', title = 'Protocol') : RenderExportArgs => {
  const sections = [
    { id: 'section-a', code: '1', title: 'Scope', content: 'Saved scope revision A' },
    { id: 'section-b', code: '2', title: 'Methods', content: 'Saved methods revision A' },
  ];
  return { executor: { query: async () => ({ rows: [] }) }, tenantId: 7,
    doc: { id: 'doc-a', title, module: 'M2', status: 'FROZEN',
      created_at: new Date('2026-10-01T00:00:00Z'), client_program_id: 'program-a',
      provenance: { source: 'manual', proof: { revision: 'A' } } },
    sections, format, actor: { id: '5', email: 'author@example.test' },
    signatures: [{ signer_email: 'reviewer@example.test', signer_name: 'Synthetic reviewer', meaning: 'APPROVER',
      reason: 'Synthetic approval', method: 'pin', content_hash: sectionsDigest(sections),
      covered_freeze_version: 'freeze-a', pin_verified: true, signed_at: new Date('2026-10-02T09:00:00Z') }],
  };
};
const output = async (args: RenderExportArgs) => (await renderAuthoringExport(args)).fileContent.toString('utf8');
const mutate = (args: RenderExportArgs) => {
  args.doc.title = 'Replacement document'; args.sections[0].content = 'UNREVIEWED REPLACEMENT';
  args.sections[0].title = 'Replacement heading'; args.sections.reverse();
};
beforeEach(() => {
  h.onPresentation = h.onSource = h.onImages = h.onCrossRefs = h.onCitations = h.onPack = h.onPdf = null;
  h.presentation = null; h.sourceReads.length = h.releaseReads.length = 0;
  h.presentationCalls = h.pdfCalls = 0;
});

it('renders an unchanged document and an accurate artifact hash without changing inputs', async () => {
  const args = make(); const before = structuredClone({ doc: args.doc, sections: args.sections, signatures: args.signatures });
  const result = await renderAuthoringExport(args);
  assert.match(result.fileContent.toString(), /Saved scope revision A/);
  assert.match(result.fileContent.toString(), /Verification: this signature covers/);
  assert.equal(hash(result.fileContent), result.artifactSha256);
  assert.deepEqual({ doc: args.doc, sections: args.sections, signatures: args.signatures }, before);
});
for (const kind of ['Protocol', 'IND summary', 'CMC manufacturing', 'Investigator brochure', 'Device clinical evaluation', 'Quality SOP', 'Agency response', 'Clinical study report']) {
  it(`pins the same input boundary for ${kind}, with no CSR-only admission`, async () => {
    const args = make('xml', kind);
    h.onPresentation = () => mutate(args);
    const result = await renderAuthoringExport(args);
    assert.equal(result.fileName, kind.replace(/[^a-zA-Z0-9]/g, '_') + '.xml');
    assert.match(result.fileContent.toString(), /Saved scope revision A/);
    assert.doesNotMatch(result.fileContent.toString(), /UNREVIEWED REPLACEMENT|Replacement heading/);
  });
}
it('keeps XML content and its signature verdict on the same captured revision', async () => {
  const args = make();
  // Cross-reference preparation is AFTER computing the signature manifest.
  h.onCrossRefs = () => mutate(args);
  const result = await output(args);
  assert.match(result, /Verification: this signature covers/);
  assert.match(result, /Saved scope revision A/);
  assert.doesNotMatch(result, /UNREVIEWED REPLACEMENT/);
});
for (const format of ['docx', 'pdf'] as const) {
  it(`keeps ${format} body, section headings and manifest in one revision across asset resolution`, async () => {
    const args = make(format, 'Manufacturing procedure');
    h.onImages = () => mutate(args);
    const result = await output(args);
    assert.match(result, /Saved scope revision A/);
    assert.match(result, /1 Scope/);
    assert.doesNotMatch(result, /UNREVIEWED REPLACEMENT|Replacement heading/);
  });
}
it('does not let a later array replacement remove or insert sections during source verification', async () => {
  const args = make();
  h.onSource = () => { args.sections.splice(0, 2, { id: 'other', code: '9', title: 'Unreviewed', content: 'NEW SECTION' }); };
  const result = await output(args);
  assert.match(result, /Saved scope revision A/); assert.match(result, /Saved methods revision A/);
  assert.doesNotMatch(result, /NEW SECTION/);
});
it('pins nested provenance and actor scope before the first asynchronous read', async () => {
  const args = make();
  h.onPresentation = () => {
    (args.doc.provenance as { proof: { revision: string } }).proof.revision = 'B';
    args.doc.client_program_id = 'other-program'; args.actor!.id = '99'; args.tenantId = 88;
  };
  await output(args);
  assert.deepEqual(h.sourceReads[0].doc.provenance, { source: 'manual', proof: { revision: 'A' } });
  assert.equal(h.sourceReads[0].doc.client_program_id, 'program-a');
  assert.deepEqual(h.sourceReads[0].actor, { id: '5', email: 'author@example.test' });
  assert.equal(h.sourceReads[0].tenant, 7);
});
it('captures signature identities and mutable Date instances, not only the signatures array', async () => {
  const args = make();
  h.onPresentation = () => {
    args.signatures![0].signer_name = 'Different signer';
    (args.signatures![0].signed_at as Date).setUTCFullYear(2030);
    (args.doc.created_at as Date).setUTCFullYear(2030);
  };
  const result = await output(args);
  assert.match(result, /Synthetic reviewer/); assert.match(result, /2026-10-02 09:00:00 UTC/);
  assert.doesNotMatch(result, /Different signer|2030/);
});
it('does not silently adopt a changed working-copy warning during preparation', async () => {
  const args = make('docx'); args.workingCopy = { banner: 'UNCONTROLLED revision A' };
  h.onImages = () => { args.workingCopy!.banner = 'CONTROLLED replacement'; };
  const result = await output(args);
  assert.match(result, /UNCONTROLLED revision A/); assert.doesNotMatch(result, /CONTROLLED replacement/);
  assert.ok(result.includes(WORKING_COPY_SIGNATURE_STATEMENT)); assert.doesNotMatch(result, /Synthetic reviewer/);
});
it('captures a QMS controlled-copy manifest deeply instead of relabeling a later approval', async () => {
  const args = make('docx'); args.controlledCopy = { banner: 'CONTROLLED revision A', manifest: [['Approved revision A']] };
  h.onCitations = () => { args.controlledCopy!.manifest[0][0] = 'Different approval'; args.controlledCopy!.banner = 'Another revision'; };
  const result = await output(args);
  assert.match(result, /Approved revision A/); assert.match(result, /CONTROLLED revision A/);
  assert.doesNotMatch(result, /Different approval|Another revision/);
});
it('pins internally resolved correspondence presentation and ignores a caller override', async () => {
  const args = make('docx');
  args.companyPresentation = { profileName: 'Untrusted caller brand' } as unknown as RenderExportArgs['companyPresentation'];
  h.presentation = { profileName: 'Retained company revision A' };
  h.onImages = () => { h.presentation!.profileName = 'Later company revision B'; };
  const result = await output(args);
  assert.match(result, /Retained company revision A/);
  assert.doesNotMatch(result, /Untrusted caller brand|Later company revision B/);
});
it('rejects an unsupported format before any source or branding lookup', async () => {
  const args = { ...make(), format: 'pptx' } as unknown as RenderExportArgs;
  await assert.rejects(renderAuthoringExport(args), error =>
    (error as { code?: string }).code === 'EXPORT_SNAPSHOT_UNAVAILABLE');
  assert.equal(h.presentationCalls, 0); assert.equal(h.pdfCalls, 0);
});
it('rejects contradictory copy modes rather than combining controlled and uncontrolled labels', async () => {
  const args = make('docx'); args.workingCopy = { banner: 'UNCONTROLLED' };
  args.controlledCopy = { banner: 'CONTROLLED', manifest: [['Approval']] };
  await assert.rejects(renderAuthoringExport(args), error =>
    (error as { code?: string }).code === 'EXPORT_SNAPSHOT_UNAVAILABLE');
  assert.equal(h.presentationCalls, 0);
});
it('refuses uncopyable provenance with a safe message instead of losing fields', async () => {
  const args = make(); args.doc.provenance = { secret: 'PRIVATE_CREDENTIAL', f: () => 'not saved JSON' };
  await assert.rejects(renderAuthoringExport(args), error => {
    assert.equal((error as { code?: string }).code, 'EXPORT_SNAPSHOT_UNAVAILABLE');
    assert.doesNotMatch(String(error), /PRIVATE_CREDENTIAL|not saved JSON/);
    return true;
  });
  assert.equal(h.presentationCalls, 0);
});
it('retains source refusal and never renders around unavailable evidence', async () => {
  const refusal = new Error('SYNTHETIC_SOURCE_REFUSAL');
  h.onSource = () => { throw refusal; };
  await assert.rejects(renderAuthoringExport(make()), error => error === refusal);
  assert.equal(h.pdfCalls, 0);
});
it('retains formatted-PDF refusal instead of falling back to text', async () => {
  h.onPdf = () => { throw Error('Synthetic conversion failure'); };
  await assert.rejects(renderAuthoringExport(make('pdf')), error =>
    (error as { code?: string }).code === 'PDF_RENDERER_UNAVAILABLE');
});
it('keeps null content distinct from empty content in the unchanged source digest', async () => {
  const args = make(); args.sections[0].content = null;
  args.signatures![0].content_hash = sectionsDigest(args.sections);
  const result = await renderAuthoringExport(args);
  assert.match(result.fileContent.toString(), /<content><!\[CDATA\[\]\]><\/content>/);
  assert.equal(hash(result.fileContent), result.artifactSha256);
});
it('two overlapping exports do not share a mutable document snapshot', async () => {
  const args = make(); const releases: Array<() => void> = [];
  h.onPresentation = () => new Promise<void>(resolve => { releases.push(resolve); });
  const first = renderAuthoringExport(args);
  args.doc.title = 'Revision B'; args.sections[0].content = 'Revision B content';
  args.signatures = [];
  const second = renderAuthoringExport(args);
  assert.equal(releases.length, 2);
  releases[1](); releases[0]();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.fileName, 'Protocol.xml'); assert.match(a.fileContent.toString(), /Saved scope revision A/);
  assert.equal(b.fileName, 'Revision_B.xml'); assert.match(b.fileContent.toString(), /Revision B content/);
});
