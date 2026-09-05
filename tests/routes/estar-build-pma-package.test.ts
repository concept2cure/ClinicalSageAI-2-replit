/**
 * PMA_ASSEMBLY — a governed PMA renders as a PMA-shaped package, never as a
 * six-slot 510(k) one.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * POST /api/510k/estar/build resolved any program UUID, loaded that program's
 * governed document (the loader is doc-type agnostic — k510/denovo/pma/cer) and
 * ALWAYS rendered it through renderPdfBuffersFor510k: six fixed 510(k) slots,
 * most stamped "content not found", labelled "510(k) content package (draft)"
 * and placed at m1.5. A Class III sponsor's 67-section 21 CFR 814.20 dossier
 * came back as 02_510kSummary.pdf and 04_SE_Discussion.pdf, registered in the
 * governed export ledger under the wrong name. POST /assemble refused
 * pathway 'pma' outright (400).
 *
 * The route now derives the package family from the governed document's
 * doc_type: a PMA renders one PDF per authored section (in outline order) plus
 * the combined PDF/DOCX, labelled honestly as a draft content package that is
 * NOT an eSTAR. A 510(k) keeps the package it had.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockRender510k,
  mockRenderPerSection,
  mockCombinedPdf,
  mockCombinedDocx,
  mockGovernedConsequence,
  mockResolveRows,
  mockLogAction,
  mockLoadAuthoredSections,
  mockLoadContentLeaves,
  scopeState,
} = vi.hoisted(() => ({
  mockRender510k: vi.fn(async () => ({
    coverLetter: Buffer.from('%PDF-cover'),
    summary: Buffer.from('%PDF-summary'),
    deviceDescription: Buffer.from('%PDF-device'),
    seDiscussion: Buffer.from('%PDF-se'),
    performanceTesting: Buffer.from('%PDF-perf'),
    labeling: Buffer.from('%PDF-label'),
  })),
  /** One PDF per H1 of the editor JSON — the shape the real renderer returns. */
  mockRenderPerSection: vi.fn(async (content: { content: Array<Record<string, any>> }) =>
    content.content
      .filter((n) => n.type === 'heading' && n.attrs?.level === 1)
      .map((n) => ({ title: String(n.content?.[0]?.text ?? ''), buffer: Buffer.from(`%PDF-${n.content?.[0]?.text}`) })),
  ),
  mockCombinedPdf: vi.fn(async () => Buffer.from('%PDF-combined')),
  mockCombinedDocx: vi.fn(async () => Buffer.from('PK-docx')),
  mockGovernedConsequence: vi.fn(async () => ({
    governed: true,
    source_type: 'export_estar_zip',
    artifact_id: 'artifact_pma_1',
    artifact_version: 1,
    artifact_status: 'draft',
    placement_state: 'placed',
    suggested_placement: 'Module 2 / PMA content package (draft)',
    provenance_ref: 'prov_pma_1',
    audit_ref: 'audit_pma_1',
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: 'application/zip',
      filename: 'P240001_pma-content-package-draft.zip',
      data: Buffer.from('zip-data').toString('base64'),
    },
  })),
  mockResolveRows: vi.fn<[], unknown[]>(() => []),
  mockLogAction: vi.fn(async () => undefined),
  mockLoadAuthoredSections: vi.fn(async () => [] as Array<{ title: string; content: string; sectionCode?: string }>),
  mockLoadContentLeaves: vi.fn(
    async () => [] as Array<{ sectionCode: string; title: string; documentType?: string; substantive?: boolean }>,
  ),
  /** The governed document class the scope resolver reports for the program. */
  scopeState: { docType: 'pma' as string | undefined },
}));

vi.mock('../../server/export/renderers', () => ({
  renderPdfBuffersFor510k: mockRender510k,
  renderPdfBuffersPerSection: mockRenderPerSection,
  renderCombinedPdf: mockCombinedPdf,
  renderCombinedDocx: mockCombinedDocx,
}));

vi.mock('../../server/export/stylePacks/config', () => ({
  stylePacks: { '510k_v1': {}, pma_v1: {}, cer_mdr_v1: {} },
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/services/export/governedExportConsequence', () => ({
  createGovernedExportConsequence: mockGovernedConsequence,
}));

const { fakeDb } = vi.hoisted(() => ({ fakeDb: { select: vi.fn() } as any }));
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
}));

vi.mock('../../server/services/pathway-engines/estar/estar-content-leaves', () => ({
  loadDeviceContentLeaves: mockLoadContentLeaves,
  loadAuthoredDeviceSections: mockLoadAuthoredSections,
  resolveDeviceContentScope: async (_org: number, o: { programId?: string; documentId?: number }) =>
    o.programId
      ? { scope: { programId: o.programId }, source: 'governed_program', docType: scopeState.docType }
      : { scope: { documentId: o.documentId }, source: o.documentId !== undefined ? 'legacy_document' : 'legacy_org_wide' },
  sectionsToEditorJson: (sections: Array<{ title: string; content: string }>) => ({
    type: 'doc',
    content: sections.flatMap((s) => [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: s.title }] },
      { type: 'paragraph', content: [{ type: 'text', text: s.content }] },
    ]),
  }),
}));

fakeDb.select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(async () => mockResolveRows()) })),
  })),
}));

import estarRoutes from '../../server/routes/510k-estar-routes';

function getHandler(path: string) {
  const layer = estarRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  if (!layer) throw new Error(`Missing route POST ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(body: Record<string, unknown>) {
  const req = createMockRequest({ body }) as any;
  req.userRole = 'editor';
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);
  return req;
}

const PROGRAM_UUID = '7d1f3b52-4c8e-4a0b-9e2d-1f6a5c3b8d90';
const BODY = 'The implantable monitor is a Class III device intended for continuous cardiac rhythm surveillance.';

/** Three authored sections shaped like the pma:fda pack (key + label). */
const PMA_SECTIONS = [
  { sectionCode: 'A.3', title: 'Cover letter and application type (original / panel-track / 180-day / real-time)', content: BODY },
  { sectionCode: 'G.5', title: 'Statistical analysis plan and results', content: BODY },
  { sectionCode: 'H.1', title: 'Instructions for use / physician labeling', content: BODY },
];

const PMA_LEAVES = [
  { sectionCode: 'A', title: 'A · Administrative information (21 CFR 814.20(b)(1)–(2))', substantive: true },
  { sectionCode: 'C', title: 'C · Complete device description (21 CFR 814.20(b)(4)(i))', substantive: true },
  { sectionCode: 'G.5', title: 'Statistical analysis plan and results', substantive: true },
];

const K510_NAMES = ['01_CoverLetter.pdf', '02_510kSummary.pdf', '03_DeviceDescription.pdf', '04_SE_Discussion.pdf', '05_PerformanceTesting.pdf', '06_Labeling.pdf'];

async function zipNames(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  return Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
}

describe('POST /api/510k/estar/build — a governed PMA program', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopeState.docType = 'pma';
    // Program lookup, then the C1 numeric anchor → governed consequence path.
    mockResolveRows
      .mockReturnValueOnce([{ id: PROGRAM_UUID, name: 'CV-330 Implantable Monitor' }])
      .mockReturnValueOnce([{ id: 4242 }]);
    mockLoadAuthoredSections.mockResolvedValue(PMA_SECTIONS);
  });

  it('renders one PDF per authored 814.20 section plus the combined PDF/DOCX, labelled as a PMA draft — never the six 510(k) slots', async () => {
    const req = makeReq({ meta: { id: 'P240001', ident: PROGRAM_UUID }, useProjectContent: true });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockRenderPerSection).toHaveBeenCalledTimes(1);
    expect(mockCombinedPdf).toHaveBeenCalledWith('cerv2_pma', expect.objectContaining({ type: 'doc' }));
    expect(mockCombinedDocx).toHaveBeenCalledWith('cerv2_pma', expect.objectContaining({ type: 'doc' }));

    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(arg.title).toMatch(/PMA content package \(draft\)/);
    expect(arg.title).not.toMatch(/510\(k\)/);
    expect(arg.filename).toBe('P240001_pma-content-package-draft.zip');
    expect(arg.filename).not.toMatch(/eSTAR/i);
    expect(arg.ctdSection).toBe('m2.5');
    expect(arg.suggestedPlacement).not.toMatch(/510\(k\)/);
    expect(arg.metadata.package).toMatch(/PMA content package draft \(not an eSTAR\)/);
    expect(arg.metadata.package).not.toMatch(/510\(k\)/);
    expect(arg.metadata.officialEstarPdf).toBe(false);
    expect(arg.metadata.programId).toBe(PROGRAM_UUID);

    const names = await zipNames(arg.binaryOutput as Buffer);
    for (const k of K510_NAMES) expect(names).not.toContain(k);
    const pdfs = names.filter((n) => n.endsWith('.pdf') && !n.endsWith('_Combined.pdf'));
    expect(pdfs).toHaveLength(PMA_SECTIONS.length);
    // Outline order and the rule-pack key are in the file name.
    expect(pdfs[0]).toMatch(/^01_A\.3/);
    expect(pdfs[1]).toMatch(/^02_G\.5/);
    expect(pdfs[2]).toMatch(/^03_H\.1/);
    expect(names).toContain('P240001_Combined.pdf');
    expect(names).toContain('P240001_Combined.docx');
    expect(names).toHaveLength(PMA_SECTIONS.length + 2);
  });

  it('a governed 510(k) program renders EVERY authored section, not six fixed slots', async () => {
    // This asserted the six slots for a governed 510(k). The FDA 510(k) rule
    // pack scaffolds 18 sections; the six-slot renderer picks one heading per
    // bucket and stamps "content not found" for the rest, so Form 3514, the
    // indications for use, the technological comparison, biocompatibility,
    // sterilization, software and cybersecurity the client authored were
    // absent from a ZIP registered as a governed artifact, with nothing said.
    scopeState.docType = 'k510';
    const K510_SECTIONS = [
      { sectionCode: 'A1', title: 'FDA Form 3514', content: BODY },
      { sectionCode: 'A3', title: 'Indications for use', content: BODY },
      { sectionCode: 'B2', title: 'Technological comparison', content: BODY },
      { sectionCode: 'D3', title: 'Biocompatibility', content: BODY },
      { sectionCode: 'D6', title: 'Cybersecurity', content: BODY },
    ];
    mockLoadAuthoredSections.mockResolvedValue(K510_SECTIONS);

    const req = makeReq({ meta: { id: 'K240001', ident: PROGRAM_UUID }, useProjectContent: true });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockRenderPerSection).toHaveBeenCalledTimes(1);
    expect(mockCombinedPdf).toHaveBeenCalledWith('cerv2_510k', expect.objectContaining({ type: 'doc' }));
    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    // Still a 510(k) package, by name and ledger placement.
    expect(arg.filename).toBe('K240001_content-package-draft.zip');
    expect(arg.metadata.package).toBe('content package draft (not an eSTAR)');
    const names = await zipNames(arg.binaryOutput as Buffer);
    const pdfs = names.filter((n) => n.endsWith('.pdf') && !n.endsWith('_Combined.pdf'));
    expect(pdfs).toHaveLength(K510_SECTIONS.length);
    expect(pdfs[0]).toMatch(/^01_A1/);
    expect(pdfs[4]).toMatch(/^05_D6/);
    expect(names).toContain('K240001_Combined.pdf');
    // The response says which store answered and how much of it shipped.
    const payload = res.json.mock.calls[0][0];
    expect(payload.deviceContentSource).toBe('governed_program');
    expect(payload.sectionsAuthored).toBe(5);
    expect(payload.sectionsRendered).toBe(5);
    expect(arg.metadata.sectionsRendered).toBe(5);
  });

  it.each([
    ['denovo', 'DN240001_denovo-content-package-draft.zip', /De Novo content package \(draft\)/, 'cerv2_denovo'],
    ['cer', 'CER-01_cer-content-package-draft.zip', /Clinical evaluation report package \(draft\)/, 'cerv2_cer'],
  ])('a governed %s document is cut per section and labelled as itself, never as a 510(k)', async (docType, filename, title, combinedDocType) => {
    // De Novo and CER documents went through the six 510(k) slots and were
    // ledgered as "510(k) content package (draft)" at m1.5.
    scopeState.docType = docType;
    mockLoadAuthoredSections.mockResolvedValue([
      { sectionCode: 'A1', title: 'First authored section', content: BODY },
      { sectionCode: 'A2', title: 'Second authored section', content: BODY },
    ]);
    const id = filename.split('_')[0];
    const req = makeReq({ meta: { id, ident: PROGRAM_UUID }, useProjectContent: true });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockCombinedPdf).toHaveBeenCalledWith(combinedDocType, expect.anything());
    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(arg.filename).toBe(filename);
    expect(arg.title).toMatch(title);
    expect(arg.title).not.toMatch(/510\(k\)/);
    expect(arg.suggestedPlacement).not.toMatch(/510\(k\)/);
    expect(arg.metadata.package).not.toMatch(/^content package draft/);
    const names = await zipNames(arg.binaryOutput as Buffer);
    for (const k of K510_NAMES) expect(names).not.toContain(k);
    expect(names.filter((n) => n.endsWith('.pdf') && !n.endsWith('_Combined.pdf'))).toHaveLength(2);
  });

  it('the LEGACY store keeps the six 510(k) slots those slots were built for', async () => {
    mockLoadAuthoredSections.mockResolvedValue([{ title: 'Device Description', content: BODY }]);
    const req = makeReq({ meta: { id: 'K240002', ident: PROGRAM_UUID }, useProjectContent: true, documentId: 4 });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRender510k).toHaveBeenCalledTimes(1);
    expect(mockRenderPerSection).not.toHaveBeenCalled();
    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(await zipNames(arg.binaryOutput as Buffer)).toEqual(K510_NAMES);
    const payload = res.json.mock.calls[0][0];
    expect(payload.deviceContentSource).toBe('legacy_document');
  });
});

describe('POST /api/510k/estar/assemble — pathway pma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopeState.docType = 'pma';
  });

  it('computes the PMA assembly verdict against the PMA modules', async () => {
    mockLoadContentLeaves.mockResolvedValueOnce(PMA_LEAVES);
    const req = makeReq({ pathway: 'pma', variant: 'device', programId: PROGRAM_UUID });
    const res = createMockResponse() as any;

    await getHandler('/assemble')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.pathway).toBe('pma');
    expect(payload.deviceContentSource).toBe('governed_program');
    expect(payload.estar.summary).toBeDefined();
    expect(payload.estar.sections.map((s: { id: string }) => s.id)).toContain('ssed-summary');
    expect(payload.provenance.modules).toContain('pathway-engines/pma/pma-mapper');
    // Three of eight original-PMA modules authored: the verdict is honest.
    expect(payload.artifactKind).toBe('content-package-draft');
    expect(payload.validationReport.errors.join(' ')).toMatch(/section\(s\) missing/);
  });

  it('a 510(k) carries its device properties in the request; without them the conditional sections stay undetermined', async () => {
    // No route accepted deviceFlags before, so every conditional section was
    // undetermined on every call — and the assembler then ignored undetermined.
    scopeState.docType = 'k510';
    const leaves = [{ sectionCode: 'B1', title: 'Device description', documentType: 'device_description', substantive: true }];
    mockLoadContentLeaves.mockResolvedValueOnce(leaves);
    const without = createMockResponse() as any;
    await getHandler('/assemble')(makeReq({ pathway: '510k', variant: 'device', programId: PROGRAM_UUID }), without);
    expect(without.status).toHaveBeenCalledWith(200);
    const u = without.json.mock.calls[0][0];
    expect(u.estar.summary.undetermined.length).toBeGreaterThan(0);
    expect(u.blockers.join(' ')).toMatch(/applicability is not established/);

    mockLoadContentLeaves.mockResolvedValueOnce(leaves);
    const withFlags = createMockResponse() as any;
    await getHandler('/assemble')(
      makeReq({
        pathway: '510k', variant: 'device', programId: PROGRAM_UUID,
        deviceFlags: { combinationProduct: false, softwareAiMl: false, cyberDevice: false, sterile: false, implantable: false, cliaWaived: false, clinicalData: false },
      }),
      withFlags,
    );
    expect(withFlags.status).toHaveBeenCalledWith(200);
    const w = withFlags.json.mock.calls[0][0];
    expect(w.estar.summary.undetermined).toEqual([]);
    expect(w.blockers.join(' ')).not.toMatch(/applicability is not established/);
  });

  it('accepts the PMA supplement type and scopes the required modules to it', async () => {
    mockLoadContentLeaves.mockResolvedValueOnce([
      { sectionCode: 'A', title: 'A · Administrative information (21 CFR 814.20(b)(1)–(2))', substantive: true },
      { sectionCode: 'D', title: 'D · Manufacturing, processing, packing, storage and installation (814.20(b)(4)(v))', substantive: true },
    ]);
    const req = makeReq({ pathway: 'pma', pmaSubmissionType: '30_day_notice', variant: 'device', programId: PROGRAM_UUID });
    const res = createMockResponse() as any;

    await getHandler('/assemble')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.estar.submissionType).toBe('30_day_notice');
    expect(payload.estar.summary.ready).toBe(true);
  });
});
