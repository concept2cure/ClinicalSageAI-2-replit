/**
 * POST /api/labeling-pi/spl does not report a malformed NDC as passing.
 *
 * The route built the SPL with generateSplXml — which dropped the canonical
 * generator's own verdict on the spec — and reported `validation` from
 * validateSplStructure alone, a check of the XML's shape that does not read the
 * NDC. A malformed NDC therefore came back `valid: true`, rendered by the
 * LabelingPi surface as "It passes the structural check", and audited so. The
 * generator's spec errors now count in `validation`, in the response and the
 * audit row.
 *
 * The label store and the audit service are doubles; the route and the SPL
 * generator are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { listLabelingPiSections, logAction } = vi.hoisted(() => ({
  listLabelingPiSections: vi.fn(),
  logAction: vi.fn(),
}));
vi.mock('../../services/labeling/labeling-pi-service', () => ({
  upsertLabelingPiSection: vi.fn(),
  listLabelingPiSections,
  acceptAgencyText: vi.fn(),
  LabelingPiValidationError: class extends Error {},
  LabelingPiConflictError: class extends Error {},
}));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import labelingPiRouter from '../labeling-pi.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 7, id: 55 };
    next();
  });
  a.use('/api/labeling-pi', labelingPiRouter);
  return a;
}

function section(no: string, text: string) {
  return {
    id: 'sec-' + no, organization_id: 7, section_no: no, label: 'Section ' + no,
    status: 'approved', flag: null, program: 'ZX-991',
    content: { heading: no + '  Section', body: [text] },
    negotiation: null, created_by: 55, created_at: 'now', updated_at: 'now',
  };
}

const IDENTITY = {
  productName: 'ZX-991',
  manufacturer: 'Concept2Cure',
  activeIngredients: [{ name: 'larotinib', strength: '50 mg' }],
  version: 1,
  effectiveDate: '2026-10-15',
};

beforeEach(() => {
  logAction.mockReset();
  listLabelingPiSections.mockReset();
  listLabelingPiSections.mockResolvedValue([
    section('1', 'Indications text'), section('2', 'Dosage text'),
    section('4', 'Contraindications text'), section('5', 'Warnings text'),
  ]);
});

describe('POST /api/labeling-pi/spl — a malformed NDC does not pass', () => {
  it('reports the generator’s NDC error in validation, and audits the document as not valid', async () => {
    const r = await request(app()).post('/api/labeling-pi/spl').send({ ...IDENTITY, ndc: 'NDC 12/34' });

    expect(r.status).toBe(200);
    expect(r.body.data.validation.valid, 'a malformed NDC passed the structural check').toBe(false);
    expect(r.body.data.validation.findings.map((f: { message: string }) => f.message)).toContainEqual(
      expect.stringMatching(/^ndcCode must be an NDC/),
    );
    expect(logAction.mock.calls[0][0].details.valid).toBe(false);
  });

  it('control: a well-formed NDC passes', async () => {
    const r = await request(app()).post('/api/labeling-pi/spl').send({ ...IDENTITY, ndc: '0002-1433-80' });
    expect(r.status).toBe(200);
    expect(r.body.data.validation.valid).toBe(true);
  });
});
