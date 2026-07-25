/**
 * studyDesignEvidenceService — END-TO-END against in-process PGlite.
 *
 * Proves Phase 3 evidence composition + the §8/§12/§14 honesty guardrails:
 *   - endpoint risk returns precedent (supporting vs objection), never a binary
 *     "FDA will accept", and is honest when there is no evidence;
 *   - benchmarkDesign withholds distributions below the study threshold and
 *     carries a §14 provenance envelope;
 *   - dose strategy NEVER emits a dose number and always flags a governing
 *     calculation + expert review;
 *   - regulatory-stress selects scenarios FROM findings (which tests, not values).
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
// The CSR effect extractor is exercised in Phase 2 + the study-design module's own
// tests; here we isolate the composition logic, so stub the effect adapter.
vi.mock('../csr-adapter.service', () => ({
  gatherResultObservations: vi.fn(async () => ({ observations: [], withStructuredEffect: 0, scanned: 0, note: 'stubbed' })),
}));

import * as sde from '../study-design-evidence.service';
import { createSource, createFinding, upsertStudy } from '../evidence-spine.service';

const ORG = 5;
const CORPUS_DDL = `
CREATE TABLE csr_reports (id serial PRIMARY KEY, organization_id int NOT NULL, report_id text, report_title text,
  title text, sponsor text, indication text, phase text, study_id text, sample_size int, duration_weeks int,
  study_design text, primary_endpoint text, secondary_endpoints text, nct_id text, regulatory_agency text,
  content jsonb, metadata jsonb, deleted_at timestamptz);
CREATE TABLE csr_details (id serial PRIMARY KEY, report_id int NOT NULL, study_design text, primary_endpoint text,
  secondary_endpoints text, inclusion_criteria text, exclusion_criteria text, sample_size int, dropout_rate real,
  blinding text, randomization text, statistical_methods text, endpoints jsonb, results jsonb, metadata jsonb);
`;

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  await pglite.exec(fs.readFileSync(path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql'), 'utf8'));
  await pglite.exec(CORPUS_DDL);
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM cre_regulatory_findings; DELETE FROM cre_evidence_sources;
                     DELETE FROM cre_clinical_studies; DELETE FROM csr_details; DELETE FROM csr_reports;`);
});

async function seedCrlWithFinding(text: string, category: string, extra: Record<string, unknown> = {}) {
  const src = await createSource(ORG, { sourceType: 'fda_crl', visibilityClass: 'global_public', agency: 'FDA' });
  return createFinding(ORG, {
    sourceId: src.id, findingDomain: 'clinical', findingCategory: category, findingText: text,
    affectedIchE3Section: '11.4', sourcePage: 12, ...extra,
  });
}

describe('assessEndpointRegulatoryRisk (§12 — no binary verdict)', () => {
  it('returns objection precedent and never claims FDA will accept', async () => {
    await seedCrlWithFinding('Overall survival benefit not demonstrated; single trial insufficient.', 'inadequate_efficacy',
      { requestedAction: 'Conduct a confirmatory trial.' });
    const r = await sde.assessEndpointRegulatoryRisk(ORG, 'Overall survival', { indication: 'NSCLC' });
    expect(r.negativePrecedent.length).toBeGreaterThan(0);
    expect(r.evidenceQuality).not.toBe('insufficient');
    expect(r.citations[0].ichE3).toBe('11.4');
    expect(JSON.stringify(r)).not.toMatch(/will accept|approval probability|FDA approved/i);
  });

  it('is honest when there is no evidence (absence ≠ acceptance)', async () => {
    const r = await sde.assessEndpointRegulatoryRisk(ORG, 'Novel digital biomarker', {});
    expect(r.evidenceQuality).toBe('insufficient');
    expect(r.note).toMatch(/insufficient structured evidence/i);
    expect(r.unansweredQuestions[0]).toMatch(/absence of objection is not evidence of acceptance/i);
  });
});

describe('benchmarkDesign (§14 provenance + honest thresholds)', () => {
  it('withholds distributions below the study threshold and carries a provenance envelope', async () => {
    await upsertStudy(ORG, { canonicalStudyKey: 'S1', indication: 'NSCLC', phase: '3' });
    const r = await sde.benchmarkDesign(ORG, { indication: 'NSCLC', phase: '3' });
    expect(r.numberOfStudies).toBe(1);
    expect(r.designDistributions).toBeNull();              // < 5 studies → withheld
    expect(r.unresolvedDataLimitations.length).toBeGreaterThan(0);
    expect(r.provenance).toHaveProperty('numerator');
    expect(r.provenance).toHaveProperty('denominator');
    expect(r.provenance.verificationStatus).toBe('unverified');
  });
});

describe('assessDoseStrategy (§8 — never a dose number)', () => {
  it('always requires a governing calculation + expert review and emits no dose value', async () => {
    const r = await sde.assessDoseStrategy(ORG, { indication: 'NSCLC', phase: '2' });
    expect(r.requiresGoverningCalculation).toBe(true);
    expect(r.expertReviewWarning).toMatch(/governing calculation/i);
    expect(r.note).toMatch(/no dose value is emitted/i);
    expect(JSON.stringify(r)).not.toMatch(/\bmg\b/i);      // no dose magnitude anywhere
  });
});

describe('simulateDesignWithRegulatoryStress (§8 — findings select scenarios)', () => {
  it('selects stress scenarios driven by the findings on record', async () => {
    await seedCrlWithFinding('High dropout rate undermines the missing-data assumption.', 'missing_data');
    await seedCrlWithFinding('Multiplicity control across secondary endpoints was inadequate.', 'multiplicity');
    const plan = await sde.simulateDesignWithRegulatoryStress(ORG, { indication: 'NSCLC' });
    const keys = plan.scenarios.map((s) => s.key);
    expect(keys).toContain('higher_dropout');
    expect(keys).toContain('multiplicity_penalty');
    for (const s of plan.scenarios) expect(s.drivenBy.length).toBeGreaterThan(0);  // each traces to a finding
  });

  it('runs only the default grid when no findings select a scenario', async () => {
    const plan = await sde.simulateDesignWithRegulatoryStress(ORG, { indication: 'RareDisease' });
    expect(plan.scenarios).toHaveLength(0);
    expect(plan.note).toMatch(/default effect-sensitivity grid/i);
  });
});
