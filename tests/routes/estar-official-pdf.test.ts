import { createHash } from 'node:crypto';

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { PDFDocument } from 'pdf-lib';
import { createMockRequest, createMockResponse } from '../setup';

const { mockGovernedConsequence } = vi.hoisted(() => ({
  mockGovernedConsequence: vi.fn(async () => ({
    governed: true,
    source_type: 'export_estar_pdf',
    artifact_id: 'artifact_estar_pdf_1',
    artifact_version: 1,
    artifact_status: 'draft',
    placement_state: 'placed',
    suggested_placement: 'Module 1 / official FDA eSTAR (submittable)',
    provenance_ref: 'prov_estar_pdf_1',
    audit_ref: 'audit_estar_pdf_1',
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: 'application/pdf',
      filename: 'k123_eSTAR.pdf',
      data: Buffer.from('pdf-data').toString('base64'),
    },
  })),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Stub only the registry-backed consequence; the audited-unplaced helper is
// the real one (it writes the EXPORT_GENERATED row these tests observe).
vi.mock('../../server/services/export/governedExportConsequence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createGovernedExportConsequence: mockGovernedConsequence,
}));

// The export routes resolve the project anchor org-scoped before producing
// anything; resolve the tests' meta.projectId to an in-org GA project row.
// The route resolves its project anchor through `requestDb(req)`; mocking
// `server/db` alone stopped intercepting when that changed.
// `fakeDbState.rows` is what every select answers with; the default is the
// in-org GA row above, and the official-fields tests below swap in [] to
// stand for an ident that resolves to nothing in this organization. When
// `fakeDbState.error` is set every select REJECTS with it instead — the read
// failed, which is a different fact from "no row" and must be answered as one.
const { fakeDb, fakeDbState } = vi.hoisted(() => {
  const fakeDbState = { rows: [{ id: 33, deviceName: 'Test Device' }] as unknown[], error: null as unknown };
  return {
    fakeDbState,
    fakeDb: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              if (fakeDbState.error) throw fakeDbState.error;
              return fakeDbState.rows;
            },
          }),
        }),
      }),
    } as any,
  };
});
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

// The governed-records loader is the ONLY DB read the program-data path adds;
// its projection/resolution stay real. Stubbed per test with the records an
// org would hold.
const { mockLoadInputs } = vi.hoisted(() => ({
  mockLoadInputs: vi.fn(async () => ({
    program: null,
    organization: null,
    workspace: null,
    fda510kProject: null,
  })) as ReturnType<typeof vi.fn>,
}));
vi.mock('../../server/services/pathway-engines/estar/estar-administrative-data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadEstarAdministrativeInputs: mockLoadInputs,
}));

/* The REAL logAction resolves an AuditWriteResult and never rejects; a fake
   that resolves `undefined` is a shape the service cannot produce, and the
   unplaced delivery path now (correctly) refuses to hand over an export whose
   audit row did not persist. */
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
}));

/* Retention goes through the canonical vault ingest; the route's contract with
   it is what these tests observe. The ingest's own behaviour is pinned in
   server/services/vault/__tests__. */
const { mockIngest } = vi.hoisted(() => ({ mockIngest: vi.fn() }));
vi.mock('../../server/services/vault/vault-ingest.service', () => ({
  ingestVaultDocument: mockIngest,
}));

/* Only the RESOLVER is stubbed — the seam where an attachment's bytes come out
   of the governed section store or the vault. The planner behind it stays real,
   so the route's attachment tests exercise the actual slot lookup, chapter
   resolution and acceptance rules against the actual template, and only the two
   database reads are replaced. Stubbing the planner would leave the route's
   wiring pinned to nothing. */
const { mockResolverFactory, resolverStub } = vi.hoisted(() => {
  const resolverStub = vi.fn(async () => ({
    ok: true as const,
    bytes: Buffer.from('%PDF-1.7 attachment bytes'),
    fileName: 'Cover Letter.pdf',
    mimeType: 'application/pdf',
  }));
  return { resolverStub, mockResolverFactory: vi.fn(() => resolverStub) };
});
vi.mock('../../server/services/pathway-engines/estar/estar-attachment-plan', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createDeviceAttachmentResolver: mockResolverFactory,
}));

import auditService from '../../server/services/auditService';
import estarRoutes from '../../server/routes/510k-estar-routes';
// The field map is a mutable singleton; tests populate then restore it to
// exercise the "template + verified map present → real official PDF" path
// without committing a real FDA asset.
import { ESTAR_FIELD_MAPS } from '../../server/services/pathway-engines/estar/estar-field-map';

function getHandler(routePath: string) {
  const layer = estarRoutes.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.post,
  );
  if (!layer) throw new Error(`Missing route POST ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(body: any) {
  const req = createMockRequest({ body }) as any;
  req.userRole = 'editor';
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);
  return req;
}

// A synthetic AcroForm PDF standing in for the official eSTAR template.
async function makeSyntheticEstar(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  form.createTextField('DeviceName').addToPage(page, { x: 50, y: 700, width: 240, height: 20 });
  form.createCheckBox('IsIvd').addToPage(page, { x: 50, y: 660, width: 16, height: 16 });
  return doc.save();
}

/** The field map the synthetic template above is verified against. */
const SYNTHETIC_MAP = {
  deviceName: { acroField: 'DeviceName', type: 'text' },
  isIvd: { acroField: 'IsIvd', type: 'checkbox' },
};

/**
 * For one describe block: point ESTAR_TEMPLATE_DIR at a fresh temp dir —
 * EMPTY (the "not vendored" posture) or holding `template` under the 510(k)
 * device descriptor's expected filename — and, when `map` is given, populate
 * the mutable 510k-device field map singleton with it. Both are restored in
 * afterAll, so the blocks cannot leak state into one another.
 */
function useTemplateFixture(opts: { prefix: string; template?: () => Promise<Uint8Array>; map?: object }) {
  let dir: string;
  let priorEnv: string | undefined;
  let priorMap: unknown;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), opts.prefix));
    priorEnv = process.env.ESTAR_TEMPLATE_DIR;
    process.env.ESTAR_TEMPLATE_DIR = dir;
    if (opts.template) {
      await fs.writeFile(path.join(dir, 'eSTAR-510k-non-ivd.pdf'), Buffer.from(await opts.template()));
    }
    priorMap = ESTAR_FIELD_MAPS['510k-device'];
    if (opts.map) ESTAR_FIELD_MAPS['510k-device'] = { ...opts.map } as any;
  });
  afterAll(async () => {
    if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
    else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
    ESTAR_FIELD_MAPS['510k-device'] = priorMap as any;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

describe('POST /api/510k/estar/scaffold-field-map', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enumerates AcroForm fields into a skeleton map from inline template bytes', async () => {
    const templateBase64 = Buffer.from(await makeSyntheticEstar()).toString('base64');
    const req = makeReq({ type: '510k', variant: 'device', templateBase64 });
    const res = createMockResponse() as any;

    await getHandler('/scaffold-field-map')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.descriptorId).toBe('510k-device');
    expect(payload.fillableCount).toBe(2);
    // Skeleton uses the real AcroField names, slugified into placeholder keys.
    const acroFields = Object.values(payload.skeleton).map((s: any) => s.acroField).sort();
    expect(acroFields).toEqual(['DeviceName', 'IsIvd']);
    expect(payload.skeleton.deviceName).toEqual({ acroField: 'DeviceName', type: 'text' });
  });

  it('fails closed (422) when no template is available to scaffold against', async () => {
    // A PreSTAR descriptor: that template is not vendored (version 'unset').
    // De Novo / PMA resolve to the vendored nIVD / IVD PDFs since Phase 3.
    const req = makeReq({ type: 'q_sub', variant: 'ivd' });
    const res = createMockResponse() as any;

    await getHandler('/scaffold-field-map')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'ESTAR_TEMPLATE_UNAVAILABLE' }),
    );
  });
});

describe('POST /api/510k/estar/official', () => {
  function body(extra: Record<string, unknown> = {}) {
    return {
      meta: { id: 'k123', projectId: 33, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      data: { deviceName: 'Acme Monitor', isIvd: true },
      ...extra,
    };
  }

  describe('honest fail-closed (no template / empty map)', () => {
    useTemplateFixture({ prefix: 'estar-official-empty-' });
    beforeEach(() => vi.clearAllMocks());

    it('returns 422 with blockers and officialEstarPdf:false; never persists', async () => {
      const req = makeReq(body());
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
      expect(payload.officialEstarPdf).toBe(false);
      expect(payload.blockers.join(' ')).toMatch(/official template .* is not vendored/i);
      expect(mockGovernedConsequence).not.toHaveBeenCalled();
    });
  });

  describe('end-to-end official PDF when template + verified map present', () => {
    // A synthetic template vendored under the descriptor's expected filename,
    // and the real field-map singleton populated for it (restored after).
    useTemplateFixture({ prefix: 'estar-official-ready-', template: makeSyntheticEstar, map: SYNTHETIC_MAP });
    beforeEach(() => vi.clearAllMocks());

    it('produces a real PDF and asserts officialEstarPdf:true truthfully', async () => {
      const req = makeReq(body());
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
      const arg = mockGovernedConsequence.mock.calls[0][0] as any;
      expect(arg.sourceType).toBe('export_estar_pdf');
      expect(arg.mimeType).toBe('application/pdf');
      expect(arg.metadata.officialEstarPdf).toBe(true);
      expect(arg.metadata.filledFields).toEqual(expect.arrayContaining(['deviceName', 'isIvd']));
      // A genuine, non-empty PDF was handed to the governance plane.
      expect(Buffer.isBuffer(arg.binaryOutput)).toBe(true);
      expect(arg.binaryOutput.length).toBeGreaterThan(0);
      const out = await PDFDocument.load(arg.binaryOutput);
      expect(out.getForm().getTextField('DeviceName').getText()).toBe('Acme Monitor');
    });
  });
});

function getGetHandler(routePath: string) {
  const layer = estarRoutes.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.get,
  );
  if (!layer) throw new Error(`Missing route GET ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeQueryReq(query: any) {
  const req = createMockRequest({}) as any;
  req.query = query;
  req.userRole = 'editor';
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);
  return req;
}

describe('GET /api/510k/estar/readiness (drives the gated UI button)', () => {
  describe('not ready (no template / empty map)', () => {
    useTemplateFixture({ prefix: 'estar-readiness-empty-' });
    beforeEach(() => vi.clearAllMocks());

    it('reports ready:false with blockers and persists nothing', async () => {
      const req = makeQueryReq({ type: '510k', variant: 'device' });
      const res = createMockResponse() as any;

      await getGetHandler('/readiness')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.ready).toBe(false);
      expect(payload.officialEstarPdf).toBe(false);
      expect(Array.isArray(payload.blockers)).toBe(true);
      expect(payload.blockers.length).toBeGreaterThan(0);
      expect(mockGovernedConsequence).not.toHaveBeenCalled();
    });
  });

  describe('ready (template + verified map present)', () => {
    useTemplateFixture({ prefix: 'estar-readiness-ready-', template: makeSyntheticEstar, map: SYNTHETIC_MAP });
    beforeEach(() => vi.clearAllMocks());

    it('reports ready:true with no blockers', async () => {
      const req = makeQueryReq({ type: '510k', variant: 'device' });
      const res = createMockResponse() as any;

      await getGetHandler('/readiness')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.ready).toBe(true);
      expect(payload.officialEstarPdf).toBe(true);
      expect(payload.templateAvailable).toBe(true);
      expect(payload.fieldMapPopulated).toBe(true);
      expect(payload.blockers).toEqual([]);
    });
  });

  // Production coverage now spans the WHOLE eSTAR program, not just 510(k)/De Novo.
  // Each type is accepted (never 400) and fails closed honestly until its official
  // template is vendored — the journey reaches production for every submission type.
  describe('accepts every eSTAR program type (PMA + PreSTAR), failing closed until vendored', () => {
    useTemplateFixture({ prefix: 'estar-readiness-alltypes-' });
    beforeEach(() => vi.clearAllMocks());

    const cases: Array<{ type: string; variant: string; descriptorId: string }> = [
      { type: 'pma', variant: 'device', descriptorId: 'pma-device' },
      { type: 'pma', variant: 'ivd', descriptorId: 'pma-ivd' },
      // PreSTAR types resolve to the shared prestar template regardless of device/ivd.
      { type: 'q_sub', variant: 'device', descriptorId: 'q_sub-prestar' },
      { type: 'ide', variant: 'ivd', descriptorId: 'ide-prestar' },
      { type: '513g', variant: 'device', descriptorId: '513g-prestar' },
    ];

    it.each(cases)('readiness for %s is accepted and fails closed', async ({ type, variant, descriptorId }) => {
      const req = makeQueryReq({ type, variant });
      const res = createMockResponse() as any;

      await getGetHandler('/readiness')(req, res);

      expect(res.status).toHaveBeenCalledWith(200); // accepted — not a 400 rejected type
      const payload = res.json.mock.calls[0][0];
      expect(payload.descriptorId).toBe(descriptorId); // prestar variant resolved internally
      expect(payload.ready).toBe(false);
      expect(payload.blockers.length).toBeGreaterThan(0);
    });
  });
});

// ── WO-8 Phase 2: governed administrative data ───────────────────────────────

/** A synthetic AcroForm with three text fields the Phase 2 tests map onto. */
async function makeAdministrativeEstar(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  form.createTextField('DeviceName').addToPage(page, { x: 50, y: 700, width: 240, height: 20 });
  form.createTextField('CommonName').addToPage(page, { x: 50, y: 660, width: 240, height: 20 });
  form.createTextField('RegulationNumber').addToPage(page, { x: 50, y: 620, width: 240, height: 20 });
  return doc.save();
}

const ADMIN_MAP = {
  deviceTradeName: { acroField: 'DeviceName', type: 'text', caption: 'Device Trade Name' },
  deviceCommonName: { acroField: 'CommonName', type: 'text', caption: 'Common Name' },
  regulationNumber: { acroField: 'RegulationNumber', type: 'text', caption: 'Regulation Number' },
} as const;

const GOVERNED_RECORDS = {
  program: { productName: 'Governed Monitor', productCode: null, predicateDevices: [] },
  organization: { name: 'Acme Org' },
  workspace: null,
  fda510kProject: { deviceName: 'GA Device', regulationNumber: null, productCode: null },
};

describe('POST /api/510k/estar/official with useProgramData:true', () => {
  useTemplateFixture({ prefix: 'estar-official-governed-', template: makeAdministrativeEstar, map: ADMIN_MAP });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInputs.mockResolvedValue(GOVERNED_RECORDS);
  });

  function body(extra: Record<string, unknown> = {}) {
    return {
      meta: { id: 'k123', projectId: 33, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      ...extra,
    };
  }

  it('governed wins, request fills the gap, blanks + ignored keys are reported, provenance is persisted', async () => {
    const req = makeReq(
      body({
        useProgramData: true,
        // deviceTradeName collides with the governed value; bogus is unmapped.
        data: { deviceTradeName: 'Client Override', deviceCommonName: 'Monitor', bogus: 'x' },
      }),
    );
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // The loader was asked for THIS anchor, org-scoped, through the numeric GA id.
    expect(mockLoadInputs).toHaveBeenCalledTimes(1);
    expect(mockLoadInputs.mock.calls[0][1]).toEqual({ organizationId: 2, programUuid: null, fda510kProjectId: 33 });

    const payload = res.json.mock.calls[0][0];
    expect(payload.fieldReport).toEqual({
      mappedCount: 3,
      filledCount: 2,
      blankCount: 1,
      blankKeys: ['regulationNumber'],
      // declaredSource: the key's governed home, named whether or not it was
      // filled and whatever the value came from (the request here).
      fields: [
        { key: 'deviceTradeName', caption: 'Device Trade Name', filled: true, source: 'regulatory_programs.product_name', declaredSource: 'regulatory_programs.product_name' },
        { key: 'deviceCommonName', caption: 'Common Name', filled: true, source: 'request', declaredSource: 'regulatory_programs.common_name' },
        { key: 'regulationNumber', caption: 'Regulation Number', filled: false, source: null, declaredSource: 'regulatory_programs.regulation_number' },
      ],
      /*
       * The governed records project three facts this three-key stand-in map has
       * no box for. Each is REPORTED, never dropped: a payload that said
       * "2 of 3 filled" and nothing else would hide a value the operator holds.
       * Measured through the route on 2026-09-07; the real-template case (the IVD
       * form's missing Indications for Use citation) is pinned in
       * server/services/pathway-engines/estar/__tests__/estar-administrative-data.test.ts.
       */
      advisories: [
        'applicantCompanyName is on file (organizations.name) as "Acme Org", but this form has no field for it and it was not written.',
        'declarationCompanyName is on file (organizations.name) as "Acme Org", but this form has no field for it and it was not written.',
        'declarationDeviceTradeName is on file (regulatory_programs.product_name) as "Governed Monitor", but this form has no field for it and it was not written.',
      ],
      ignoredRequestKeys: ['deviceTradeName', 'bogus'],
      /*
       * deviceCommonName WAS written — it is in filledCount — and the form's own
       * scripts clear it as soon as the applicant touches the classification
       * dropdown, because they rebuild that cell from a source nothing fills.
       * Reporting "2 of 3 filled" without saying so tells a filer a value is on
       * the form when it is about to go. regulationNumber is blank, so it is
       * counted once, under blankKeys — the template cannot take away a cell
       * that holds nothing.
       */
      clearedByTemplateKeys: ['deviceCommonName'],
      substitutedByTemplateKeys: [],
    });

    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(arg.metadata.fieldSources).toEqual({
      deviceTradeName: 'regulatory_programs.product_name',
      deviceCommonName: 'request',
    });
    expect(arg.metadata.filledFields.sort()).toEqual(['deviceCommonName', 'deviceTradeName']);
    // The PDF carries the governed value, not the client's override.
    const out = await PDFDocument.load(arg.binaryOutput);
    expect(out.getForm().getTextField('DeviceName').getText()).toBe('Governed Monitor');
    expect(out.getForm().getTextField('CommonName').getText()).toBe('Monitor');
    expect(out.getForm().getTextField('RegulationNumber').getText()).toBeUndefined();
    // The persisted content names what was written — the resolved data, not the request.
    expect(JSON.parse(arg.contentForArtifact).data).toEqual({
      deviceTradeName: 'Governed Monitor',
      deviceCommonName: 'Monitor',
    });
  });

  it('without useProgramData the loader is never consulted and the response carries no fieldReport', async () => {
    const req = makeReq(body({ data: { deviceTradeName: 'Client Value' } }));
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockLoadInputs).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('fieldReport');
    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(arg.metadata).not.toHaveProperty('fieldSources');
    const out = await PDFDocument.load(arg.binaryOutput);
    expect(out.getForm().getTextField('DeviceName').getText()).toBe('Client Value');
  });

  it('with nothing governed and nothing requested no official eSTAR is produced at all', async () => {
    // This asserted 200 with a field report of filledCount 0 — an honest
    // report, but attached to a blank official FDA form that was registered as
    // a submittable artifact with the placement "Module 1 / official FDA eSTAR
    // (submittable)". A fill that wrote nothing produced no filled form, so the
    // route now refuses rather than reporting emptiness over a real artifact.
    mockLoadInputs.mockResolvedValue({ program: null, organization: null, workspace: null, fda510kProject: null });
    const req = makeReq(body({ useProgramData: true, data: {} }));
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
    expect(payload.officialEstarPdf).toBe(false);
    expect(payload.blockers.join(' ')).toMatch(/wrote no values/);
    // The refusal must not blame the template: the template loaded and the map
    // is populated, so the blocker names the missing VALUES and nothing else.
    expect(payload.templateAvailable).toBe(true);
    expect(payload.fieldMapPopulated).toBe(true);
    // Nothing was persisted: no blank form reached the artifact registry.
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });
});

describe('GET /api/510k/estar/official-fields', () => {
  useTemplateFixture({ prefix: 'estar-official-fields-', map: ADMIN_MAP });
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInputs.mockResolvedValue(GOVERNED_RECORDS);
  });

  it('200: one row per mapped field with value + source; unsourced keys are null/null but name their declared home; no request data', async () => {
    const req = makeQueryReq({ ident: '33', type: '510k', variant: 'device' });
    req.userRole = 'viewer'; // read-only: no editor role needed
    const res = createMockResponse() as any;

    await getGetHandler('/official-fields')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual({
      descriptorId: '510k-device',
      type: '510k',
      variant: 'device',
      mappedCount: 3,
      sourcedCount: 1,
      // A blank row carries declaredSource — the governed store.column where
      // the value is SET — so the surface can point there instead of
      // offering a value the platform does not hold.
      fields: [
        // Each row also carries what the TEMPLATE does to that cell after we
        // write it, from the measured table: 'reproduces' survives, 'blanks' is
        // cleared by the form's own scripts. The preview is the one place a
        // filer reads before producing, so it carries the fact rather than the
        // count alone.
        { key: 'deviceTradeName', caption: 'Device Trade Name', xfaSomPath: null, value: 'Governed Monitor', source: 'regulatory_programs.product_name', declaredSource: 'regulatory_programs.product_name', rebuildOutcome: 'reproduces', rebuildNote: expect.any(String) },
        { key: 'deviceCommonName', caption: 'Common Name', xfaSomPath: null, value: null, source: null, declaredSource: 'regulatory_programs.common_name', rebuildOutcome: 'blanks', rebuildNote: null },
        { key: 'regulationNumber', caption: 'Regulation Number', xfaSomPath: null, value: null, source: null, declaredSource: 'regulatory_programs.regulation_number', rebuildOutcome: 'blanks', rebuildNote: null },
      ],
    });
    expect(mockLoadInputs.mock.calls[0][1]).toEqual({ organizationId: 2, programUuid: null, fda510kProjectId: 33 });
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });

  it('200: the Phase 3 homes are sourced when the program and registration rows hold them', async () => {
    mockLoadInputs.mockResolvedValue({
      ...GOVERNED_RECORDS,
      program: { ...GOVERNED_RECORDS.program, commonName: 'Continuous glucose monitor', regulationNumber: '21 CFR 862.1355' },
      registration: { correspondentCompanyName: 'Corr Co' },
    });
    const req = makeQueryReq({ ident: '33', type: '510k', variant: 'device' });
    const res = createMockResponse() as any;

    await getGetHandler('/official-fields')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.sourcedCount).toBe(3);
    expect(payload.fields[1]).toMatchObject({ key: 'deviceCommonName', value: 'Continuous glucose monitor', source: 'regulatory_programs.common_name' });
    expect(payload.fields[2]).toMatchObject({ key: 'regulationNumber', value: '21 CFR 862.1355', source: 'regulatory_programs.regulation_number' });
  });

  it('404 when the ident resolves to nothing in this organization — and reads no governed data', async () => {
    const prior = fakeDbState.rows;
    fakeDbState.rows = [];
    try {
      const req = makeQueryReq({ ident: '999', type: '510k', variant: 'device' });
      const res = createMockResponse() as any;

      await getGetHandler('/official-fields')(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found in your organization' });
      expect(mockLoadInputs).not.toHaveBeenCalled();
    } finally {
      fakeDbState.rows = prior;
    }
  });

  it('422 ESTAR_FIELD_MAP_NOT_POPULATED when the descriptor has no verified map', async () => {
    // A PreSTAR descriptor has no field map (its template is not vendored);
    // the De Novo / PMA marketing maps are populated since Phase 3.
    const req = makeQueryReq({ ident: '33', type: 'q_sub', variant: 'device' });
    const res = createMockResponse() as any;

    await getGetHandler('/official-fields')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('ESTAR_FIELD_MAP_NOT_POPULATED');
    expect(payload.descriptorId).toBe('q_sub-prestar');
    expect(payload.blockers.join(' ')).toMatch(/field map .* not populated/i);
    expect(mockLoadInputs).not.toHaveBeenCalled();
  });

  it('400 on a bad query (missing ident / unknown variant)', async () => {
    for (const query of [{ type: '510k', variant: 'device' }, { ident: '33', variant: 'nope' }]) {
      const req = makeQueryReq(query);
      const res = createMockResponse() as any;
      await getGetHandler('/official-fields')(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Invalid query');
    }
  });
});

// ── A failed anchor read is an ERROR, never "not found" ─────────────────────
//
// resolveProjectAnchor used to swallow every database failure into null, so a
// connection reset answered 404 'Project not found in your organization' — an
// error rendered as an empty result. Only schema absence (42703 undefined
// column, 42P01 undefined table — a database without the migration) may still
// read as "no row"; everything else propagates and the route answers 500 with
// its own envelope, never the failure text.
describe('resolveProjectAnchor — a failed read is an error, never "not found"', () => {
  const PROGRAM_UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
  /** query_canceled — a real database failure with nothing to do with the schema. */
  const dbFailure = () => Object.assign(new Error('boom: canceling statement due to statement timeout'), { code: '57014' });
  /** undefined_table — the database without the migration; still "no row". */
  const missingTable = () => Object.assign(new Error('relation "fda_510k_projects" does not exist'), { code: '42P01' });

  /** Each route that resolves the anchor, called with an ident, and the 500 envelope it owns. */
  const routes = [
    {
      route: 'GET /official-fields',
      error: 'ESTAR_OFFICIAL_FIELDS_FAILED',
      message: 'Failed to resolve the official eSTAR field sources. The problem has been logged.',
      call: async (ident: string) => {
        const res = createMockResponse() as any;
        await getGetHandler('/official-fields')(makeQueryReq({ ident, type: '510k', variant: 'device' }), res);
        return res;
      },
    },
    {
      route: 'POST /official',
      error: 'GOVERNED_EXPORT_FAILED',
      message: 'Official eSTAR export failed and was not delivered. The problem has been logged.',
      call: async (ident: string) => {
        const meta = /^\d+$/.test(ident) ? { id: 'k123', projectId: Number(ident) } : { id: 'k123', ident };
        const res = createMockResponse() as any;
        await getHandler('/official')(makeReq({ meta, type: '510k', variant: 'device', useProgramData: true, data: {} }), res);
        return res;
      },
    },
  ];
  // Both resolver branches: the numeric (fda_510k_projects) read and the program (regulatory_programs) read.
  const idents = [{ label: 'numeric', ident: '33' }, { label: 'program uuid', ident: PROGRAM_UUID }];
  const cases = routes.flatMap((r) => idents.map((i) => ({ ...r, ...i })));

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInputs.mockResolvedValue(GOVERNED_RECORDS);
  });
  afterEach(() => {
    fakeDbState.error = null;
  });

  it.each(cases)('$route ($label ident): 500 $error — never 404 — when the read throws; nothing read or written', async ({ call, ident, error, message }) => {
    fakeDbState.error = dbFailure();
    const res = await call(ident);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ error, message });
    // The failure text never reaches the body.
    expect(JSON.stringify(payload)).not.toMatch(/boom|statement timeout|57014/);
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockLoadInputs).not.toHaveBeenCalled();
  });

  it.each(routes)('$route: schema absence (42P01) is still "no row" — 404, exactly as for an unknown ident', async ({ call }) => {
    fakeDbState.error = missingTable();
    const res = await call(PROGRAM_UUID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Project not found in your organization' });
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });
});

// ── Roadmap item 3: the delivered eSTAR is retained before it is delivered ───

/**
 * The bytes CDRH ingests used to be produced, hashed, base64'd into the
 * response and forgotten. Now they are admitted into the program's governed
 * vault first, and a retention that should have happened and did not withholds
 * the file rather than being reported beside it.
 */
describe('POST /api/510k/estar/official — retention of the delivered artifact', () => {
  useTemplateFixture({ prefix: 'estar-official-retain-', template: makeAdministrativeEstar, map: ADMIN_MAP });

  const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
  const priorRows = [{ id: 33, deviceName: 'Test Device' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInputs.mockResolvedValue(GOVERNED_RECORDS);
    fakeDbState.rows = [{ id: PROGRAM, name: 'BX-204 CGM' }];
    mockIngest.mockImplementation(async (args: any) => ({
      ok: true,
      document: {
        id: 'vault-doc-1',
        contentHash: createHash('sha256').update(args.fileBuffer).digest('hex'),
      },
      filing: { folderId: 'k510/administrative', placementStatus: 'suggested' },
    }));
  });
  afterAll(() => {
    fakeDbState.rows = priorRows;
  });

  function officialReq(extra: Record<string, unknown> = {}) {
    return makeReq({
      meta: { id: 'k123', ident: PROGRAM, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: 'BX-204' },
      ...extra,
    });
  }

  it('retains the delivered bytes and reports where they went', async () => {
    const req = officialReq();
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.retention).toMatchObject({
      retained: true,
      documentId: 'vault-doc-1',
      documentCode: 'eSTAR-510k-device',
      placementStatus: 'suggested',
    });
    /* The retained hash is the hash of the file the caller was handed. */
    const delivered = Buffer.from(payload.downloadable_output_ref.data, 'base64');
    expect(payload.retention.contentHash).toBe(createHash('sha256').update(delivered).digest('hex'));
    expect(payload.retention.version).toBe(`sha256-${payload.retention.contentHash.slice(0, 16)}`);
    /* Into THIS program's vault, as platform-generated bytes. */
    expect(mockIngest.mock.calls[0][0]).toMatchObject({
      organizationId: 2,
      programId: PROGRAM,
      mimeType: 'application/pdf',
      origin: 'platform-generated',
    });
  });

  it('withholds the file when the vault could not retain it', async () => {
    mockIngest.mockResolvedValue({
      ok: false,
      status: 500,
      code: 'STORAGE_WRITE_FAILED',
      message: 'The document could not be stored.',
    });
    const req = officialReq();
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('ESTAR_NOT_RETAINED');
    expect(body).not.toHaveProperty('downloadable_output_ref');
    /* The reason is stated without leaking the vault's internals. */
    expect(body.message).not.toContain('STORAGE_WRITE_FAILED');
  });

  it('says plainly when a legacy project has no vault, and still delivers', async () => {
    fakeDbState.rows = priorRows;
    const req = makeReq({
      meta: { id: 'k123', projectId: 33, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: 'BX-204' },
    });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.retention.retained).toBe(false);
    expect(payload.retention.reason).toMatch(/no program vault/);
    expect(payload.downloadable_output_ref.data.length).toBeGreaterThan(0);
    expect(mockIngest).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * WHAT THE ROUTE TELLS THE CALLER ABOUT VALUES THE FORM WILL NOT KEEP.
 *
 * `fillEstarSubmission` names them on `erasedFields`, and NO production caller
 * read it: on the verbatim path `describeOfficialFill` returns `fieldReport:
 * null`, so the 200 body said nothing, and `officialMetadata` carried
 * filledFields/skippedFields but never erasedFields, so the registered artifact
 * record was silent too. These pin it through the route, on both paths.
 * ─────────────────────────────────────────────────────────────────────────── */

describe('POST /api/510k/estar/official — erased values reach the caller (verbatim path)', () => {
  // The REAL vendored template and the REAL field map — no fixture. This is the
  // artifact CDRH ingests, filled by the code that ships.
  const haveTemplate = fsSync.existsSync(
    path.resolve(process.cwd(), 'assets/estar-templates/eSTAR-510k-non-ivd.pdf'),
  );

  beforeEach(() => vi.clearAllMocks());

  function officialReq(data: Record<string, unknown>) {
    return makeReq({
      meta: { id: 'k123', projectId: 33, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      data,
    });
  }

  it.skipIf(!haveTemplate)('names the erased keys in the 200 body AND in the registered metadata', async () => {
    const req = officialReq({ deviceTradeName: 'BX-204 CGM', deviceCommonName: 'Continuous glucose monitor' });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    // No governed resolution ran, so there is no fieldReport — which is exactly
    // why the erasure has to be said here, on its own.
    expect(payload.fieldReport).toBeUndefined();
    expect(payload.erasedFields).toEqual(['deviceCommonName']);

    const arg = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(arg.metadata.filledFields.sort()).toEqual(['deviceCommonName', 'deviceTradeName']);
    expect(arg.metadata.erasedFields).toEqual(['deviceCommonName']);
  });

  it.skipIf(!haveTemplate)('reports an EMPTY erased list rather than omitting it (assessed ≠ unassessed)', async () => {
    const req = officialReq({ deviceTradeName: 'BX-204 CGM' });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].erasedFields).toEqual([]);
    expect((mockGovernedConsequence.mock.calls[0][0] as any).metadata.erasedFields).toEqual([]);
  });

  it.skipIf(!haveTemplate)('REFUSES 422 when every written value is one the form erases (P3)', async () => {
    const req = officialReq({ deviceCommonName: 'Continuous glucose monitor' });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
    expect(payload.officialEstarPdf).toBe(false);
    expect(payload.blockers.join(' ')).toContain('deviceCommonName');
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it.skipIf(!haveTemplate)('REFUSES 422 on the reviewer\'s non-string declaring entity (P1, over HTTP)', async () => {
    // `data: z.record(z.unknown())` accepts this from a plain JSON body, and the
    // writer's toText() ends `return String(value)` — so the DoC cell really did
    // come back reading "Declaring Entity GmbH" with filled:true, blockers:[].
    const req = officialReq({
      deviceTradeName: 'BX-204 CGM',
      applicantCompanyName: 'Acme Devices, Inc.',
      declarationCompanyName: ['Declaring Entity GmbH'],
    });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
    expect(payload.blockers.join(' ')).toContain('Declaring Entity GmbH');
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockIngest).not.toHaveBeenCalled();
  });
});

describe('POST /api/510k/estar/official — erased values reach the caller (governed path)', () => {
  useTemplateFixture({ prefix: 'estar-official-erased-', template: makeAdministrativeEstar, map: ADMIN_MAP });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInputs.mockResolvedValue({
      ...GOVERNED_RECORDS,
      program: { ...GOVERNED_RECORDS.program, commonName: 'Continuous glucose monitor' },
    });
  });

  it('says the same thing beside the fieldReport, and in the metadata', async () => {
    const req = makeReq({
      meta: { id: 'k123', projectId: 33, title: 'Official eSTAR' },
      type: '510k',
      variant: 'device',
      useProgramData: true,
      data: {},
    });
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    // The report already said it under its own heading; the top-level list is
    // what the verbatim path has instead, and the two must never disagree.
    expect(payload.fieldReport.clearedByTemplateKeys).toEqual(['deviceCommonName']);
    expect(payload.erasedFields).toEqual(['deviceCommonName']);
    expect((mockGovernedConsequence.mock.calls[0][0] as any).metadata.erasedFields).toEqual([
      'deviceCommonName',
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /official with attachments — roadmap item 4, slice 5
// ---------------------------------------------------------------------------
//
// The eSTAR this route produced populated 0 of the template's 113 attachment
// slots. These are the route half of the join: what it accepts, what reaches
// the governed record, and — the larger half — what it refuses rather than
// omitting quietly from a 200.

const REAL_TEMPLATE_DIR = path.resolve(process.cwd(), 'assets/estar-templates');
const REAL_NIVD = path.join(REAL_TEMPLATE_DIR, 'eSTAR-510k-non-ivd.pdf');
const COVER_LETTER_SLOT = 'root.CoverLetter.CLAddAttachment110';

describe.skipIf(!fsSync.existsSync(REAL_NIVD))(
  'POST /api/510k/estar/official with attachments — the real vendored eSTAR',
  () => {
    const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
    const priorRows = [{ id: 33, deviceName: 'Test Device' }];
    let priorEnv: string | undefined;

    beforeAll(() => {
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = REAL_TEMPLATE_DIR;
    });
    afterAll(() => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      fakeDbState.rows = priorRows;
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockResolverFactory.mockReturnValue(resolverStub);
      resolverStub.mockResolvedValue({
        ok: true,
        bytes: Buffer.from('%PDF-1.7 attachment bytes'),
        fileName: 'Cover Letter.pdf',
        mimeType: 'application/pdf',
      });
      fakeDbState.rows = [{ id: PROGRAM, name: 'BX-204 CGM' }];
      mockIngest.mockImplementation(async (args: any) => ({
        ok: true,
        document: {
          id: 'vault-doc-1',
          contentHash: createHash('sha256').update(args.fileBuffer).digest('hex'),
        },
        filing: { folderId: 'k510/administrative', placementStatus: 'suggested' },
      }));
    });

    function attachReq(attachments: unknown[]) {
      return makeReq({
        meta: { id: 'k123', ident: PROGRAM, title: 'Official eSTAR' },
        type: '510k',
        variant: 'device',
        data: { deviceTradeName: 'BX-204' },
        attachments,
      });
    }

    it('files the document and says where it went', async () => {
      const req = attachReq([
        { slot: COVER_LETTER_SLOT, source: { kind: 'authored_section', sectionCode: 'A.1' } },
      ]);
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.attachmentReport.requested).toBe(1);
      expect(payload.attachmentReport.refused).toEqual([]);
      expect(payload.attachmentReport.manifest).toBe(
        '***Start***<<Cover Letter.pdf|/CHAPTER 1/CH1.01/>>',
      );
      expect(payload.attachmentReport.attached[0]).toMatchObject({
        slot: COVER_LETTER_SLOT,
        chapter: '/CHAPTER 1/CH1.01/',
        fileName: 'Cover Letter.pdf',
        description: 'Administrative Documentation | Cover Letter',
      });
    });

    it('the governed record names what was filed, not only the form', async () => {
      /* The delivered-bytes hash proves the FORM was not altered and says
         nothing about which documents it routes. "What did we file into
         section 5" has to be answerable from the record, not from a response
         body nobody keeps.

         A program-uuid anchor has no PM-spine `projects` row, so this export
         goes down the audited-unplaced path and its record IS the audit row —
         which is exactly why the check reads the row rather than the response. */
      const req = attachReq([
        { slot: COVER_LETTER_SLOT, source: { kind: 'authored_section', sectionCode: 'A.1' } },
      ]);
      await getHandler('/official')(req, createMockResponse() as any);

      const details = (auditService.logAction as any).mock.calls.at(-1)[0].details;
      expect(details.attachments).toHaveLength(1);
      expect(details.attachments[0]).toMatchObject({
        slot: COVER_LETTER_SLOT,
        chapter: '/CHAPTER 1/CH1.01/',
        fileName: 'Cover Letter.pdf',
        sha256: createHash('sha256').update(Buffer.from('%PDF-1.7 attachment bytes')).digest('hex'),
      });
      // The bytes themselves are deliberately NOT in the record.
      expect(details.attachments[0]).not.toHaveProperty('bytes');
    });

    it('reads the tenant and the program from the REQUEST, never from the body', async () => {
      const req = attachReq([
        { slot: COVER_LETTER_SLOT, source: { kind: 'vault_document', documentId: PROGRAM } },
      ]);
      await getHandler('/official')(req, createMockResponse() as any);

      expect(mockResolverFactory).toHaveBeenCalledTimes(1);
      expect(mockResolverFactory.mock.calls[0][0]).toMatchObject({
        organizationId: 2,
        programUuid: PROGRAM,
      });
    });

    it('hands the resolver a client it can actually query with', async () => {
      /* `DeviceContentClient` is the raw `query(text, params)` surface, and
         `loadAuthoredDeviceSections` calls `client.query(...)` on it directly.
         This route once passed `requestDb(req)` — a Drizzle instance, whose
         `.query` is the relational-query namespace OBJECT — which satisfied the
         structural type and threw "client.query is not a function" on the first
         `authored_section` attachment. Every other test in this describe mocks
         the resolver factory away, so this is the only place the contract is
         checked.

         The invariant is the shape, not the identity: omitting `client` is
         valid and is what ships (the resolver then defaults to the shared pool,
         as the three other loadAuthoredDeviceSections callers in this file do,
         and every one of its queries re-asserts org_id in SQL). Anything passed
         explicitly must expose the raw-query FUNCTION. Either is fine; a
         Drizzle instance is not. */
      const req = attachReq([
        { slot: COVER_LETTER_SLOT, source: { kind: 'authored_section', sectionCode: 'A.1' } },
      ]);
      await getHandler('/official')(req, createMockResponse() as any);

      const { client } = mockResolverFactory.mock.calls[0][0] as { client?: { query?: unknown } };
      expect(
        client === undefined || typeof client.query === 'function',
        client === undefined
          ? 'unreachable'
          : `the attachment resolver was handed a client whose .query is a ${typeof client.query}, ` +
            'not a function — loadAuthoredDeviceSections calls client.query(text, params) directly',
      ).toBe(true);
    });

    it('refuses the export, with the reason, when a section is not fileable', async () => {
      resolverStub.mockResolvedValue({
        ok: false,
        reason: 'Section "A.1" (Cover Letter) is authored but not finalized.',
      });
      const req = attachReq([
        { slot: COVER_LETTER_SLOT, source: { kind: 'authored_section', sectionCode: 'A.1' } },
      ]);
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
      expect(payload.blockers.join(' ')).toContain('authored but not finalized');
      // The report travels on the refusal, so the operator sees WHICH one.
      expect(payload.attachmentReport.refused[0].slot).toBe(COVER_LETTER_SLOT);
      // And nothing was delivered, registered, audited or retained.
      expect(mockGovernedConsequence).not.toHaveBeenCalled();
      expect(auditService.logAction).not.toHaveBeenCalled();
      expect(mockIngest).not.toHaveBeenCalled();
    });

    it('refuses a slot the template does not declare', async () => {
      const req = attachReq([
        { slot: 'root.Invented.XXAddAttachment999', source: { kind: 'authored_section', sectionCode: 'A.1' } },
      ]);
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json.mock.calls[0][0].blockers.join(' ')).toMatch(/declares no attachment slot/);
    });

    it('rejects a malformed attachment request at the schema, before any work', async () => {
      const req = attachReq([{ slot: COVER_LETTER_SLOT, source: { kind: 'nonsense' } }]);
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockResolverFactory).not.toHaveBeenCalled();
    });

    it('does not inflate the administrative field report by one', async () => {
      /* The user-facing count. `fieldReportClause` renders "N of M
         administrative fields filled", and a filer reads it to decide whether
         the form is done. The attachment manifest IS a field the fill writes,
         so counting it would make that line read 2 of 20 when one
         administrative value was written — or, with every governed record
         present, 21 of 20.

         It does not, and the reason is structural rather than a subtraction
         somewhere: ESTAR_ATTACHMENT_MANIFEST_KEY is deliberately not a member
         of any map in ESTAR_FIELD_MAPS, and reportOfficialEstarFill only walks
         the resolved map's own fields. That was asserted in a docblock and by
         nothing else. */
      const req = makeReq({
        meta: { id: 'k123', ident: PROGRAM, title: 'Official eSTAR' },
        type: '510k',
        variant: 'device',
        useProgramData: true,
        data: { deviceTradeName: 'BX-204' },
        attachments: [
          { slot: COVER_LETTER_SLOT, source: { kind: 'authored_section', sectionCode: 'A.1' } },
        ],
      });
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const report = res.json.mock.calls[0][0].fieldReport;
      expect(report.mappedCount).toBe(Object.keys(ESTAR_FIELD_MAPS['510k-device']).length);
      expect(report.blankKeys).not.toContain('attachmentManifest');
      expect(report.fields.map((f: any) => f.key)).not.toContain('attachmentManifest');
      expect(report.filledCount + report.blankCount).toBe(report.mappedCount);
      // And the attachment really was filed — the report is not empty by accident.
      expect(res.json.mock.calls[0][0].attachmentReport.attached).toHaveLength(1);
    });

    it('never builds a resolver when no attachment was asked for', async () => {
      const req = makeReq({
        meta: { id: 'k123', ident: PROGRAM, title: 'Official eSTAR' },
        type: '510k',
        variant: 'device',
        data: { deviceTradeName: 'BX-204' },
      });
      const res = createMockResponse() as any;

      await getHandler('/official')(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockResolverFactory).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0]).not.toHaveProperty('attachmentReport');
    });
  },
);
