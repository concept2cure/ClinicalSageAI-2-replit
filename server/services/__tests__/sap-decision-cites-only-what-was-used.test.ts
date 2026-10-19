/**
 * The decision a SAP generation records cites only what the generator used,
 * and the capture makes no call that records nothing.
 *
 * captureFromSapGeneration recorded evidenceSources
 * ['sap_generator_service', 'historical_comparator_data'] in the decision's
 * context. The generator reads no historical comparator data: what it had was
 * a count of csr_reports rows, read across tenants, which only switched its
 * Phase 3 method template (removed the same day). And for a SAP with a source
 * artifact it looped over the recorded assumptions calling
 * createContradictionLink() with no arguments — a no-op that returns null —
 * "to create contradiction-readiness links" that were never created.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));
vi.mock('../contradiction-engine-service', () => ({
  contradictionEngineService: { detectAssumptionDrift: async () => [] },
}));
vi.mock('../governance-boundary-service', () => ({
  GovernanceBoundaryService: { getInstance: () => ({}) },
}));

import { OperatingSystemIntegration } from '../operating-system-integration';
import { AssumptionRegistryService } from '../assumption-registry-service';

const SAP = {
  organizationId: 3,
  projectId: 12,
  indication: 'NSCLC',
  phase: 'Phase 3',
  sampleSize: 450,
  dropoutRate: 0.1,
  primaryEndpoint: 'Overall survival',
  sourceArtifactId: 17,
  createdById: 41,
};

let rowId = 0;
beforeEach(() => {
  rowId = 0;
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string) => {
    rowId += 1;
    const id = `00000000-0000-0000-0000-${String(rowId).padStart(12, '0')}`;
    return { rows: [{ id, organization_id: 3, project_id: 12, created_at: new Date(), updated_at: new Date(), sql }], rowCount: 1 };
  });
});

/** The decision_context bound into the decision_records INSERT. */
const decisionContext = (): Record<string, unknown> => {
  const insert = H.query.mock.calls.find(([sql]) => /INSERT INTO decision_records/.test(String(sql)));
  expect(insert, 'no decision was recorded').toBeDefined();
  return JSON.parse(String((insert![1] as unknown[])[13]));
};

describe('captureFromSapGeneration', () => {
  it('cites the generator and the request it was given — no historical comparator data', async () => {
    await OperatingSystemIntegration.getInstance().captureFromSapGeneration(SAP);
    const { evidenceSources } = decisionContext();
    expect(evidenceSources, 'the SAP decision cites data the generator never read').not.toContain('historical_comparator_data');
    expect(evidenceSources).toEqual(['sap_generator_service', 'sap_generation_request']);
  });

  it('makes no contradiction-link call that records nothing', async () => {
    const link = vi.spyOn(AssumptionRegistryService.prototype, 'createContradictionLink');
    await OperatingSystemIntegration.getInstance().captureFromSapGeneration(SAP);
    expect(link, 'createContradictionLink() was called with no arguments, once per assumption').not.toHaveBeenCalled();
    link.mockRestore();
  });
});
