import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
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

vi.mock('../../server/services/export/governedExportConsequence', () => ({
  createGovernedExportConsequence: mockGovernedConsequence,
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
    const req = makeReq({ type: 'de_novo', variant: 'ivd' });
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
    let emptyDir: string;
    let priorEnv: string | undefined;

    beforeAll(async () => {
      emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-official-empty-'));
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = emptyDir;
    });

    afterAll(async () => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      await fs.rm(emptyDir, { recursive: true, force: true });
    });

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
    let templateDir: string;
    let priorEnv: string | undefined;

    beforeAll(async () => {
      templateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-official-ready-'));
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = templateDir;
      // Vendor a synthetic template under the descriptor's expected filename.
      await fs.writeFile(
        path.join(templateDir, 'eSTAR-510k-non-ivd.pdf'),
        Buffer.from(await makeSyntheticEstar()),
      );
      // Populate the real field map for this descriptor (restored in afterAll).
      ESTAR_FIELD_MAPS['510k-device'] = {
        deviceName: { acroField: 'DeviceName', type: 'text' },
        isIvd: { acroField: 'IsIvd', type: 'checkbox' },
      };
    });

    afterAll(async () => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      ESTAR_FIELD_MAPS['510k-device'] = {};
      await fs.rm(templateDir, { recursive: true, force: true });
    });

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
    let emptyDir: string;
    let priorEnv: string | undefined;

    beforeAll(async () => {
      emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-readiness-empty-'));
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = emptyDir;
    });

    afterAll(async () => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      await fs.rm(emptyDir, { recursive: true, force: true });
    });

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
    let templateDir: string;
    let priorEnv: string | undefined;

    beforeAll(async () => {
      templateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-readiness-ready-'));
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = templateDir;
      await fs.writeFile(
        path.join(templateDir, 'eSTAR-510k-non-ivd.pdf'),
        Buffer.from(await makeSyntheticEstar()),
      );
      ESTAR_FIELD_MAPS['510k-device'] = {
        deviceName: { acroField: 'DeviceName', type: 'text' },
        isIvd: { acroField: 'IsIvd', type: 'checkbox' },
      };
    });

    afterAll(async () => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      ESTAR_FIELD_MAPS['510k-device'] = {};
      await fs.rm(templateDir, { recursive: true, force: true });
    });

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
    let emptyDir: string;
    let priorEnv: string | undefined;

    beforeAll(async () => {
      emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-readiness-alltypes-'));
      priorEnv = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = emptyDir;
    });
    afterAll(async () => {
      if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
      await fs.rm(emptyDir, { recursive: true, force: true });
    });
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
