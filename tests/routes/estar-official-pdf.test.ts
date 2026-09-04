import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
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

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

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
      ignoredRequestKeys: ['deviceTradeName', 'bogus'],
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

  // With nothing governed and nothing requested the fill writes NO field, so
  // the only PDF it could hand back is the untouched official template. That
  // used to answer 200 with a field report of three blanks and register the
  // blank form as a submittable artifact; it now refuses. A report saying
  // "0 of 3 filled" is still a blank official FDA form the client can file.
  it('with nothing governed and nothing requested it REFUSES — no blank official form, and nothing is registered', async () => {
    mockLoadInputs.mockResolvedValue({ program: null, organization: null, workspace: null, fda510kProject: null });
    const req = makeReq(body({ useProgramData: true, data: {} }));
    const res = createMockResponse() as any;

    await getHandler('/official')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('ESTAR_NOT_PRODUCIBLE');
    expect(payload.officialEstarPdf).toBe(false);
    // The refusal says why: the fill wrote nothing, so the output would be the
    // blank template. The template and its map are both fine — it is the
    // VALUES that are missing, and the blocker must not blame the template.
    expect(payload.templateAvailable).toBe(true);
    expect(payload.fieldMapPopulated).toBe(true);
    expect(payload.blockers.join(' ')).toContain('the fill wrote no values');
    // No artifact, no governed export consequence: nothing was produced.
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
        { key: 'deviceTradeName', caption: 'Device Trade Name', xfaSomPath: null, value: 'Governed Monitor', source: 'regulatory_programs.product_name', declaredSource: 'regulatory_programs.product_name' },
        { key: 'deviceCommonName', caption: 'Common Name', xfaSomPath: null, value: null, source: null, declaredSource: 'regulatory_programs.common_name' },
        { key: 'regulationNumber', caption: 'Regulation Number', xfaSomPath: null, value: null, source: null, declaredSource: 'regulatory_programs.regulation_number' },
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
      message: 'Official eSTAR export failed before consequence persistence. The problem has been logged.',
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
