/**
 * CSR adapter — END-TO-END against in-process PGlite.
 *
 * Proves Phase 2: a live CSR (csr_reports + csr_details) maps into the unified
 * spine non-destructively — one cre_evidence_source (referencing, not copying,
 * the corpus row), one canonical cre_clinical_studies identity, and a
 * DESCRIBES_STUDY edge — idempotently; and that §4.3 design features are
 * extracted deterministically WITH provenance (never guessed).
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
// The adapter + spine read `pool`; gatherCsrEffectEvidence reads a Drizzle `db`
// we don't exercise here (stubbed so the import resolves).
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { adaptCsrReport, extractDesignFeatures } from '../csr-adapter.service';
import { listSources, listStudies, listRelationshipsFor } from '../evidence-spine.service';

const ORG = 7;

// Minimal live-corpus DDL (only the columns the adapter reads).
const CORPUS_DDL = `
CREATE TABLE csr_reports (
  id serial PRIMARY KEY, organization_id int NOT NULL, report_id text NOT NULL, report_title text,
  title text, sponsor text, indication text, phase text, study_id text, sample_size int,
  duration_weeks int, study_design text, primary_endpoint text, secondary_endpoints text,
  nct_id text, regulatory_agency text, content jsonb, metadata jsonb, deleted_at timestamptz
);
CREATE TABLE csr_details (
  id serial PRIMARY KEY, report_id int NOT NULL, study_design text, primary_endpoint text,
  secondary_endpoints text, inclusion_criteria text, exclusion_criteria text, sample_size int,
  dropout_rate real, blinding text, randomization text, statistical_methods text,
  endpoints jsonb, results jsonb, metadata jsonb
);
`;

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql');
  await pglite.exec(fs.readFileSync(migration, 'utf8'));
  await pglite.exec(CORPUS_DDL);
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM cre_evidence_relationships; DELETE FROM cre_clinical_studies;
                     DELETE FROM cre_evidence_sources; DELETE FROM csr_details; DELETE FROM csr_reports;`);
});

async function seedCsr(over: Record<string, unknown> = {}) {
  const rep = await pglite.query(
    `INSERT INTO csr_reports (organization_id, report_id, report_title, sponsor, indication, phase,
       study_id, sample_size, duration_weeks, study_design, primary_endpoint, secondary_endpoints, nct_id, regulatory_agency)
     VALUES (7,'CSR-001','Pivotal NSCLC study','Acme Bio','NSCLC','3','S-01',420,52,'randomized, double-blind',
             'Overall survival','Progression-free survival; ORR','NCT01234567','FDA') RETURNING id`,
  );
  const id = (rep.rows[0] as { id: number }).id;
  await pglite.query(
    `INSERT INTO csr_details (report_id, study_design, primary_endpoint, secondary_endpoints, inclusion_criteria,
       exclusion_criteria, sample_size, dropout_rate, blinding, randomization, statistical_methods)
     VALUES ($1,'randomized, double-blind, placebo-controlled','Overall survival','Progression-free survival; ORR',
             'Adults with stage IV NSCLC','Prior immunotherapy',420,0.12,'double-blind','1:1 stratified','Stratified Cox PH')`,
    [id],
  );
  return id;
}

describe('adaptCsrReport', () => {
  it('maps a CSR into a source + canonical study + describes_study edge', async () => {
    const csrId = await seedCsr();
    const res = await adaptCsrReport(ORG, csrId);
    expect(res).not.toBeNull();
    expect(res!.source.sourceType).toBe('csr');
    expect(res!.source.visibilityClass).toBe('tenant_private');
    expect(res!.source.linkedCsrReportId).toBe(csrId);        // references corpus, not copied
    expect(res!.study.canonicalStudyKey).toBe('NCT01234567'); // NCT preferred as identity
    expect(res!.study.nctId).toBe('NCT01234567');
    expect(res!.featureCount).toBeGreaterThan(4);

    const edges = await listRelationshipsFor(ORG, 'source', res!.source.id);
    expect(edges.some((e) => e.relationshipType === 'describes_study')).toBe(true);
  });

  it('is idempotent — adapting the same CSR twice does not duplicate', async () => {
    const csrId = await seedCsr();
    const a = await adaptCsrReport(ORG, csrId);
    const b = await adaptCsrReport(ORG, csrId);
    expect(b!.source.id).toBe(a!.source.id);
    expect(await listSources(ORG, {})).toHaveLength(1);
    expect(await listStudies(ORG, {})).toHaveLength(1);
  });

  it('returns null for a CSR not visible to the org', async () => {
    const csrId = await seedCsr();
    expect(await adaptCsrReport(999, csrId)).toBeNull();       // different org → not visible
  });
});

describe('extractDesignFeatures (deterministic, provenance-bearing)', () => {
  it('extracts endpoints/design/size with source location + explicit flag', () => {
    const report: any = {
      id: 1, report_id: 'CSR-001', report_title: 'x', sponsor: 'Acme', indication: 'NSCLC', phase: '3',
      study_id: 'S-01', sample_size: 420, duration_weeks: 52, study_design: 'randomized',
      primary_endpoint: 'Overall survival', secondary_endpoints: 'PFS; ORR', nct_id: 'NCT01', regulatory_agency: 'FDA',
      content: null, metadata: null,
    };
    const detail: any = {
      study_design: 'randomized, double-blind', primary_endpoint: 'Overall survival',
      secondary_endpoints: 'PFS; ORR', inclusion_criteria: 'stage IV', exclusion_criteria: 'prior IO',
      sample_size: 420, dropout_rate: 0.12, blinding: 'double-blind', randomization: '1:1',
      statistical_methods: 'Cox PH', endpoints: null, results: null, metadata: null,
    };
    const feats = extractDesignFeatures(report, detail, 10, 20);
    const byKey = (k: string) => feats.filter((f) => f.featureKey === k);

    expect(byKey('primary_endpoint')[0].value).toBe('Overall survival');
    expect(byKey('secondary_endpoint')).toHaveLength(2);      // split on ';'
    expect(byKey('sample_size')[0].value).toBe(420);
    // Every feature carries provenance and is explicit (present in a column).
    for (const f of feats) {
      expect(f.sourceId).toBe(10);
      expect(f.studyId).toBe(20);
      expect(f.extractionMethod).toBe('deterministic');
      expect(f.explicitOrInferred).toBe('explicit');
      expect(f.sourceLocation).toBeTruthy();
    }
  });

  it('emits nothing for absent fields (never guesses)', () => {
    const report: any = { id: 1, report_id: 'CSR-002', primary_endpoint: null, secondary_endpoints: null,
      study_design: null, sample_size: null, duration_weeks: null, phase: null };
    const feats = extractDesignFeatures(report, null, 1, 1);
    expect(feats).toHaveLength(0);
  });
});
