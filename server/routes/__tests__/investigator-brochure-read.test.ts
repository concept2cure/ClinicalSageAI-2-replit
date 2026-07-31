/**
 * GET /api/investigator-brochure — ICH E6(R2) §7 IB section-structure read.
 *
 * REAL-STORE contract (GA, 2026-08). The route reads the org's IB readiness through
 * `investigator-brochure-view-assembler.assembleOrgIBSections` (which derives the four
 * IB input domains from the real upstream stores) — the seed-only
 * `c2c_investigator_brochure` blob is retired and never read. Locks: 403 without org;
 * the { data } envelope with the display keys ({ number, title, required, status, gaps,
 * description, depth }); the real per-section verdict passed straight through from the
 * assembler; and fail-closed to the honest deterministic skeleton (never 500, never
 * fabricated content, meta.pendingStore on 42P01) when the assembler errors.
 *
 * The assembler is mocked here; its real SQL + tenant scope are proven in
 * server/services/authoring/__tests__/investigator-brochure-view-assembler.pglite.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Mock the assembler the route reads through. The route still uses the REAL (AI-free,
// DB-free) ib-builder gap engine for its fail-closed skeleton, so ib-builder is NOT mocked.
const assembleOrgIBSections = vi.fn();
vi.mock('../../services/authoring/investigator-brochure-view-assembler', () => ({
  assembleOrgIBSections: (...a: unknown[]) => assembleOrgIBSections(...a),
}));

import ibRouter from '../investigator-brochure.routes';
import {
  flattenSections,
  detectSectionGaps,
  sectionStatus,
  type IBInputDomain,
} from '../../services/authoring/ib-builder';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/investigator-brochure', ibRouter);
  return app;
}

const DISPLAY_KEYS = ['number', 'title', 'required', 'status', 'gaps', 'description', 'depth'];

/** Build the exact row shape the assembler returns for a given domain-availability map. */
function rowsFor(avail: Partial<Record<Exclude<IBInputDomain, 'none'>, boolean>>) {
  const available: Record<IBInputDomain, boolean> = {
    product: !!avail.product,
    nonclinical: !!avail.nonclinical,
    clinical: !!avail.clinical,
    safety: !!avail.safety,
    none: true,
  };
  return flattenSections().map((s) => {
    const gaps = detectSectionGaps(s, available);
    return {
      number: s.number,
      title: s.title,
      required: s.required,
      status: sectionStatus(s, available, gaps),
      gaps,
      description: s.description,
      depth: s.number.includes('.') ? 1 : 0,
    };
  });
}

beforeEach(() => {
  assembleOrgIBSections.mockReset();
});

describe('GET /api/investigator-brochure', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/investigator-brochure');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('returns the real assembled IB readiness view for a provisioned org', async () => {
    const rows = rowsFor({ product: true, nonclinical: true, clinical: true, safety: true });
    assembleOrgIBSections.mockResolvedValueOnce({
      rows,
      availability: { product: true, nonclinical: true, clinical: true, safety: true },
      sources: ['nonclinical_studies', 'clinical_ops.studies', 'adverse_events'],
      source: 'nonclinical_studies+clinical_ops.studies+adverse_events',
      provisioned: true,
      completeness: 100,
      productName: null,
    });

    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(assembleOrgIBSections).toHaveBeenCalledWith(7);

    // Display-key contract on every row.
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const numbers = res.body.data.map((r: { number: string }) => r.number);
    expect(numbers).toEqual(
      expect.arrayContaining(['0', '1', '2', '3', '4', '4.1', '4.2', '4.3', '5', '5.1', '5.2', '5.3', '6', '7']),
    );

    // Real verdicts flow straight through from the assembler: with every domain
    // present, the data-bearing nonclinical/clinical sections render.
    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered'); // Title Page (boilerplate)
    expect(byNum('4').status).toBe('rendered'); // Nonclinical — real evidence present
    expect(byNum('5').status).toBe('rendered'); // Effects in Humans — clinical + safety present
    expect(byNum('4.1').depth).toBe(1);

    // meta reflects the real store provenance.
    expect(res.body.meta.provisioned).toBe(true);
    expect(res.body.meta.source).toContain('nonclinical_studies');
    expect(res.body.meta.availability).toMatchObject({ nonclinical: true, clinical: true });
    expect(res.body.meta.productName).toBeNull();
    expect(typeof res.body.meta.completeness).toBe('number');
  });

  it('renders honest missing verdicts when the org has no real upstream evidence', async () => {
    const rows = rowsFor({});
    assembleOrgIBSections.mockResolvedValueOnce({
      rows,
      availability: { product: false, nonclinical: false, clinical: false, safety: false },
      sources: [],
      source: 'nonclinical_studies',
      provisioned: false,
      completeness: 0,
      productName: null,
    });

    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);

    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered'); // boilerplate still renders
    expect(byNum('4').status).toBe('missing'); // no nonclinical evidence
    expect(byNum('4').gaps.length).toBeGreaterThan(0);
    expect(res.body.meta.provisioned).toBe(false);
  });

  it('fails closed to the skeleton when the store is not provisioned (42P01)', async () => {
    assembleOrgIBSections.mockRejectedValueOnce(
      Object.assign(new Error('relation missing'), { code: '42P01' }),
    );
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(true);
    // Skeleton is honest: boilerplate renders, data-bearing sections are missing.
    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered');
    expect(byNum('4').status).toBe('missing');
  });

  it('fails closed to the skeleton on an unexpected store error (never 500)', async () => {
    assembleOrgIBSections.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});
