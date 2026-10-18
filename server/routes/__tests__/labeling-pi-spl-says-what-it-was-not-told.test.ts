/**
 * POST /api/labeling-pi/spl carries the version and effective date the caller
 * states, and says — in the response and in the audit row — which document
 * elements were not stated and what the SPL carries in their place.
 *
 * Until 2026-10-15 the route passed no version and no effective date, so every
 * SPL it built was "versionNumber 1, effective today". The generator began
 * returning `warnings` naming each such element; the route dropped them, so
 * neither the caller nor the audit trail was told. A version or date the
 * generator refuses ("version must be an integer ≥ 1", "effectiveDate must be
 * a calendar date") could not be sent at all, and once sent would have reached
 * the catch-all as a 500 — a refused input reported as a server failure.
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
};

beforeEach(() => {
  logAction.mockReset();
  listLabelingPiSections.mockReset();
  listLabelingPiSections.mockResolvedValue([
    section('1', 'Indications text'), section('2', 'Dosage text'),
    section('4', 'Contraindications text'), section('5', 'Warnings text'),
  ]);
});

describe('POST /api/labeling-pi/spl — what the SPL was not told', () => {
  it('names the version and effective date it was not given, in the response and the audit row', async () => {
    const r = await request(app()).post('/api/labeling-pi/spl').send(IDENTITY);

    expect(r.status).toBe(200);
    expect(r.body.data.warnings).toEqual([
      expect.stringMatching(/^version not stated — the document carries versionNumber 1/),
      expect.stringMatching(/^effective date not stated — the document carries \d{8}/),
    ]);
    const entry = logAction.mock.calls[0][0];
    expect(entry.action).toBe('LABELING_SPL_GENERATED');
    expect(entry.details.warnings).toEqual(r.body.data.warnings);
  });

  it('carries a stated version and effective date into the document, and warns of nothing', async () => {
    const r = await request(app()).post('/api/labeling-pi/spl')
      .send({ ...IDENTITY, version: 3, effectiveDate: '2026-03-01' });

    expect(r.status).toBe(200);
    expect(r.body.data.xml).toContain('<versionNumber value="3"');
    expect(r.body.data.xml).toContain('<effectiveTime value="20260301"');
    expect(r.body.data.warnings).toEqual([]);
    expect(logAction.mock.calls[0][0].details.warnings).toEqual([]);
  });

  it.each([
    [{ version: 0 }, 'version must be an integer ≥ 1'],
    [{ version: 2.5 }, 'version must be an integer ≥ 1'],
    [{ version: 'two' }, 'version must be an integer ≥ 1'],
    [{ effectiveDate: '2026-02-30' }, 'effectiveDate must be a calendar date (YYYY-MM-DD)'],
  ])('refuses %j with a 400 that names the input, and records nothing', async (bad, message) => {
    const r = await request(app()).post('/api/labeling-pi/spl').send({ ...IDENTITY, ...bad });

    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: 'VALIDATION', message });
    expect(logAction).not.toHaveBeenCalled();
  });
});
