/**
 * A skipped m3.regional step says WHY it was skipped.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Module 3 holds a 3.2.R regional template for four regions (REGIONAL_SUBSECTIONS
 * in module3-extensions: US, EU, JP, CA). The run route accepts THIRTEEN —
 * RegionSchema is z.enum(['US','EU','JP','CA','UK','CN','AU','CH','BR','IN','KR',
 * 'SG','GLOBAL']) since the Move-7 widening, which deliberately let regions
 * through that the narrow RegionCode union never named.
 *
 * For the other nine, composeRegional finds no matching subsection and returns
 * an empty array. The m3.regional step turned that into `return null`, and
 * runStep's only skip story was `skipped (no inputs)`.
 *
 * So a run for region UK with a full set of CMC sources reported that its
 * regional step was skipped FOR WANT OF INPUT. Two different things were being
 * said with one sentence:
 *
 *   - the caller supplied no sources            → the caller's doing
 *   - the product has no 3.2.R for this region  → the product's gap
 *
 * and the second was reported as the first. 3.2.R is a required part of a real
 * submission; a reviewer reading "skipped (no inputs)" on a run whose inputs were
 * plainly present has been told the wrong thing about their own submission, and
 * the remedy that message implies — supply more sources — cannot ever work.
 * The packaging layer already draws exactly this line with
 * isPackagerBuildableRegion and falls back to a derived manifest; the compose
 * layer did not.
 *
 * The step now reports the region and the four regions that do have a template.
 * `skipped (no inputs)` still means what it always meant.
 *
 * Mocking strategy mirrors tests/unit/submission-package-orchestrator-moves-3-5-6
 * — an in-memory pool and a gateway-ready validator, so the run reaches the
 * regional step without a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  poolQuery:
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(),
  validateEctdPackageHardened: vi.fn(),
}));

vi.mock('../../server/db.js', () => {
  const pool = { query: (...a: unknown[]) => hoisted.poolQuery(...(a as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/db', () => {
  const pool = { query: (...a: unknown[]) => hoisted.poolQuery(...(a as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/services/ectd/ectd-validator-hardening.js', () => ({
  validateEctdPackageHardened: (...a: unknown[]) => hoisted.validateEctdPackageHardened(...a),
}));
vi.mock('../../server/services/ectd/ectd-validator-hardening', () => ({
  validateEctdPackageHardened: (...a: unknown[]) => hoisted.validateEctdPackageHardened(...a),
}));

import {
  runOrchestrator,
  type OrchestratorInputs,
} from '../../server/services/submission-package-orchestrator';
import {
  REGIONS_WITH_REGIONAL_TEMPLATE,
  hasRegionalTemplate,
} from '../../server/services/module3-extensions';
import type { HardenedValidationResult } from '../../server/services/ectd/ectd-validator-hardening';

/** Every region the run route accepts — RegionSchema in submission-orchestrator.ts. */
const ROUTE_REGIONS = [
  'US',
  'EU',
  'JP',
  'CA',
  'UK',
  'CN',
  'AU',
  'CH',
  'BR',
  'IN',
  'KR',
  'SG',
  'GLOBAL',
] as const;

function gatewayReady(): HardenedValidationResult {
  return {
    valid: true,
    score: 100,
    findings: [],
    summary: {
      errors: 0,
      warnings: 0,
      infos: 0,
      sectionsPresent: 1,
      sectionsRequired: 1,
      sectionsMissing: [],
    },
    timestamp: new Date().toISOString(),
    regional: [],
    sequence: [],
    dtd: [],
    hardenedScore: 100,
    gatewayReady: true,
  };
}

function inputs(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return {
    organizationId: 1,
    submissionId: 'sub-regional',
    applicationNumber: 'IND999001',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [
      {
        id: 'src-1',
        sourceType: 'drug_product',
        // Enough to compose, and deliberately NOT complete — the point is the
        // skip reason, not the completeness score.
        sourcePayload: { dosageFormDescription: 'tablet', strength: '10 mg' },
        organizationId: 1,
        projectId: 42,
      } as unknown as OrchestratorInputs['cmcSources'][number],
    ],
    nonclinicalStudies: [],
    clinicalStudyData: [],
    csrInputs: [],
    indication: 'oncology',
    drugProductName: 'Compound-X',
    drugSubstanceName: 'X-API',
    projectId: 42,
    userId: 7,
    useAI: false,
    ...over,
  };
}

async function regionalStep(over: Partial<OrchestratorInputs>) {
  const { run } = await runOrchestrator(inputs(over));
  return run.steps.find(s => s.key === 'm3.regional')!;
}

beforeEach(() => {
  hoisted.poolQuery.mockReset();
  hoisted.validateEctdPackageHardened.mockReset();
  hoisted.poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  hoisted.validateEctdPackageHardened.mockResolvedValue(gatewayReady());
});

describe('m3.regional distinguishes "no inputs" from "no template for this region"', () => {
  it("the template set is derived from the templates, and covers four of the route's thirteen regions", () => {
    // Derived, not restated, so adding a 3.2.R template moves this on its own.
    expect([...REGIONS_WITH_REGIONAL_TEMPLATE].sort()).toEqual(['CA', 'EU', 'JP', 'US']);

    const unsupported = ROUTE_REGIONS.filter(r => !hasRegionalTemplate(r));
    expect(unsupported).toEqual(['UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL']);
  });

  it('a region WITH a template composes its regional section', async () => {
    const step = await regionalStep({ region: 'US' });
    expect(step.status).toBe('complete');
    expect(step.outputRef).toMatch(/^m3\.regional:[1-9]/);
  });

  it('a region with NO template is skipped naming the region — not "no inputs"', async () => {
    // Sources ARE present. Under the old behaviour this read "skipped (no
    // inputs)", which is the assertion that matters most here.
    const step = await regionalStep({ region: 'UK' });
    expect(step.status).toBe('skipped');
    expect(step.outputRef).not.toBe('skipped (no inputs)');
    expect(step.outputRef).toContain('UK');
    expect(step.outputRef).toContain('no 3.2.R template');
    // And it names where regional content DOES exist, so the reader's next
    // question is answered in the same sentence.
    expect(step.outputRef).toMatch(/CA\/EU\/JP\/US/);
  });

  it.each(['CN', 'BR', 'SG'] as const)(
    'region %s is reported the same way — the fix is not UK-specific',
    async region => {
      const step = await regionalStep({ region });
      expect(step.status).toBe('skipped');
      expect(step.outputRef).toContain(region);
      expect(step.outputRef).toContain('no 3.2.R template');
    }
  );

  it('GLOBAL is reported as not-applicable, NOT as a missing template', async () => {
    // GLOBAL is not a jurisdiction — region-identity defines its twelve canonical
    // regions as "taxonomy Region minus GLOBAL" — and 3.2.R is regional
    // information for a specific agency. So there is nothing to author for it,
    // and calling it a missing template would invent a gap. It is the one
    // accepted region where zero regional sections is the complete and correct
    // answer.
    const step = await regionalStep({ region: 'GLOBAL' });
    expect(step.status).toBe('skipped');
    expect(step.outputRef).toContain('GLOBAL is not a jurisdiction');
    expect(step.outputRef).not.toContain('no 3.2.R template');
    expect(step.outputRef).toContain('This is not a gap');
  });

  it('"skipped (no inputs)" still means exactly that when no sources were supplied', async () => {
    // The original meaning must survive: a supported region with nothing to
    // compose from is the caller's doing, and is still reported that way.
    const step = await regionalStep({ region: 'US', cmcSources: [] });
    expect(step.status).toBe('skipped');
    expect(step.outputRef).toBe('skipped (no inputs)');
  });

  it('an unsupported region with no sources is also "no inputs" — the caller is told the nearer cause', async () => {
    // Both conditions hold. Reporting the missing template would send the caller
    // after a product gap when the thing actually stopping them is that they
    // supplied nothing to compose.
    const step = await regionalStep({ region: 'UK', cmcSources: [] });
    expect(step.status).toBe('skipped');
    expect(step.outputRef).toBe('skipped (no inputs)');
  });
});
