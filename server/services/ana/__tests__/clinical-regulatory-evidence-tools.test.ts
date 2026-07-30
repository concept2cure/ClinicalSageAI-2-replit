/**
 * AnA Clinical Regulatory Evidence tools — END-TO-END through the registered
 * handlers against in-process PGlite.
 *
 * Proves the AnA path a user triggers ("what did FDA object to on this endpoint",
 * "stress-test this protocol", "trace this recommendation") actually EXECUTES:
 * tool input → registered handler → the CRE spine / studyDesignEvidenceService →
 * real SQL — and preserves the honesty guarantees (no binary verdict, findings-
 * driven scenarios, inspectable chain).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));
// benchmarkDesign reuses the CSR effect extractor (Drizzle); stub it here.
// projectOrgCsrReports is stubbed so the project_csr_evidence handler test can
// assert output shaping without standing up the full csr_reports corpus.
const projectOrgCsrReports = vi.fn();
vi.mock('../../clinical-regulatory-evidence/csr-adapter.service', () => ({
  gatherResultObservations: vi.fn(async () => ({ observations: [], withStructuredEffect: 0, scanned: 0, note: 'stubbed' })),
  projectOrgCsrReports: (...a: unknown[]) => projectOrgCsrReports(...a),
}));

import { getToolHandler } from '../AnaToolExecutor';
import { createSource, createFinding, upsertStudy, addRelationship } from '../../clinical-regulatory-evidence/evidence-spine.service';

const CTX = { organizationId: 42, userId: 1 };

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  await pglite.exec(fs.readFileSync(path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql'), 'utf8'));
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM cre_evidence_relationships; DELETE FROM cre_regulatory_findings;
                     DELETE FROM cre_regulatory_outcomes; DELETE FROM cre_clinical_studies; DELETE FROM cre_evidence_sources;`);
});

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX as never));
}

describe('explain_design_risk', () => {
  it('returns objection precedent + citations, never an acceptance claim', async () => {
    const src = await createSource(CTX.organizationId, { sourceType: 'fda_crl', visibilityClass: 'global_public', agency: 'FDA' });
    await createFinding(CTX.organizationId, {
      sourceId: src.id, findingDomain: 'clinical', findingText: 'Overall survival benefit not demonstrated.',
      requestedAction: 'Conduct a confirmatory trial.', affectedIchE3Section: '11.4', sourcePage: 9,
    });
    const r = await call('explain_design_risk', { feature: 'Overall survival', indication: 'NSCLC' });
    expect(r.ok).toBe(true);
    expect(r.negativePrecedent.length).toBeGreaterThan(0);
    expect(r.citations[0].ichE3).toBe('11.4');
    expect(JSON.stringify(r)).not.toMatch(/will accept|approval probability/i);
  });

  it('is honest when no evidence exists', async () => {
    const r = await call('explain_design_risk', { feature: 'Novel biomarker' });
    expect(r.evidenceQuality).toBe('insufficient');
    expect(r.note).toMatch(/insufficient structured evidence/i);
  });
});

describe('stress_test_protocol', () => {
  it('selects scenarios driven by the findings on record', async () => {
    const src = await createSource(CTX.organizationId, { sourceType: 'fda_crl', visibilityClass: 'global_public' });
    await createFinding(CTX.organizationId, { sourceId: src.id, findingDomain: 'biostatistics', findingText: 'Multiplicity control was inadequate across secondary endpoints.' });
    const r = await call('stress_test_protocol', { indication: 'NSCLC' });
    expect(r.ok).toBe(true);
    expect(r.scenarios.map((s: { key: string }) => s.key)).toContain('multiplicity_penalty');
  });
});

describe('trace_design_recommendation', () => {
  it('returns the inspectable evidence chain for an entity', async () => {
    const src = await createSource(CTX.organizationId, { sourceType: 'csr', visibilityClass: 'tenant_private' });
    const study = await upsertStudy(CTX.organizationId, { canonicalStudyKey: 'S-1', indication: 'NSCLC' });
    await addRelationship(CTX.organizationId, {
      fromEntityType: 'source', fromEntityId: src.id, toEntityType: 'study', toEntityId: study.id,
      relationshipType: 'describes_study',
    });
    const r = await call('trace_design_recommendation', { entity_type: 'source', entity_id: src.id });
    expect(r.ok).toBe(true);
    expect(r.chain.length).toBe(1);
    expect(r.chain[0].relationshipType).toBe('describes_study');
  });

  it('validates input', async () => {
    const r = await call('trace_design_recommendation', { entity_type: 'source' });
    expect(r.error).toMatch(/entity_id/i);
  });
});

describe('search_clinical_regulatory_evidence', () => {
  it('returns spine entities scoped to the org + global', async () => {
    await upsertStudy(CTX.organizationId, { canonicalStudyKey: 'S-2', indication: 'NSCLC', phase: '3' });
    const r = await call('search_clinical_regulatory_evidence', { indication: 'NSCLC', entity_types: ['studies'] });
    expect(r.ok).toBe(true);
    expect(r.studies.length).toBe(1);
    expect(r.note).toMatch(/not a prediction/i);
  });
});

describe('compare_proposed_design_to_precedent', () => {
  it('returns a benchmark with a provenance envelope and no verdict', async () => {
    const r = await call('compare_proposed_design_to_precedent', { indication: 'NSCLC', phase: '3', endpoint: 'Overall survival' });
    expect(r.ok).toBe(true);
    expect(r.benchmark).toHaveProperty('provenance');
    expect(r.note).toMatch(/not a verdict/i);
  });
});

describe('project_csr_evidence', () => {
  beforeEach(() => projectOrgCsrReports.mockReset());

  it('projects the acting org and reports counts with an honest reference-only note', async () => {
    projectOrgCsrReports.mockResolvedValue({ total: 3, projected: 2, alreadyPresent: 1, failed: 0, studyCount: 2 });
    const r = await call('project_csr_evidence', { limit: 100 });
    expect(r.ok).toBe(true);
    expect(projectOrgCsrReports).toHaveBeenCalledWith(42, { limit: 100 });
    expect(r.message).toMatch(/Projected 2 new CSR/);
    expect(r.note).toMatch(/no text copied, no findings minted/i);
  });

  it('is honest when the workspace has no CSRs to project', async () => {
    projectOrgCsrReports.mockResolvedValue({ total: 0, projected: 0, alreadyPresent: 0, failed: 0, studyCount: 0 });
    const r = await call('project_csr_evidence', {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/No CSR reports found/i);
  });
});
