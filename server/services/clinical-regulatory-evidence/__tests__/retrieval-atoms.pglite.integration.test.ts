/**
 * CRE retrieval atoms — END-TO-END against in-process PGlite (real Postgres, WASM).
 *
 * Proves Phase 5: the normalized CRE entities materialize into `lumen_data_atoms`
 * as the nine lower_snake_case atom types, and the three schema-verified invariants
 * hold against a real engine:
 *   - PER-OWNING-ORG materialization: global-public CRL evidence (org NULL) visible
 *     to a tenant is written under that tenant; a tenant-private design lesson is NOT
 *     visible to another tenant (strict isolation, since org is NOT NULL);
 *   - IDEMPOTENCY: re-running never duplicates (there is no unique index — the
 *     service does delete-then-insert on the business key);
 *   - the §14 GATE: an approved lesson carrying an unsupported claim never becomes
 *     an atom.
 *
 * PGlite here has no pgvector, so the best-effort `::vector` write is expected to
 * no-op (caught, non-fatal) — the embedder is still invoked, which we assert. The
 * embedding SQL itself is identical to the production-proven scripts/embed-atoms.ts.
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
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import { ingestCrl } from '../crl-ingestion.service';
import { proposeDesignLesson, reviewDesignLesson } from '../evidence-spine.service';
import {
  generateAtomsForOrg, persistCsrDerivedAtoms, projectDesignFeature, projectResultObservation,
  countCreAtoms, CRE_ATOM_SOURCE_TYPE,
} from '../retrieval-atoms.service';
import type { StudyDesignFeature, StudyResultObservation } from '../types';

const ORG = 3;
const OTHER = 88;

// lumen_data_atoms mirrors the base consolidated DDL (no vector column — PGlite has no pgvector).
const LUMEN_DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE lumen_data_atoms (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  source_id text,
  atom_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  structured_data jsonb,
  tags text[],
  confidence real NOT NULL DEFAULT 0.7,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const SAMPLE = {
  applicationNumber: 'BLA-761111', agency: 'FDA', applicationType: 'BLA', product: 'BX-301',
  indication: 'NSCLC', phase: '3', documentDate: '2026-02-14', officialUrl: 'https://fda.gov/crl/761111',
  relatedStudyKeys: ['NCT02020202'],
  findings: [
    {
      findingDomain: 'clinical', findingCategory: 'inadequate_efficacy', fdaReviewDiscipline: 'clinical',
      findingText: 'A single adequate and well-controlled trial does not establish effectiveness for this indication.',
      normalizedSummary: 'Single-trial efficacy package insufficient.', requestedAction: 'Conduct a confirmatory trial.',
      affectedIchE3Section: '11.4', sourcePage: 3, explicitOrInferred: 'explicit' as const,
      extractionConfidence: 0.95, relatedStudyKeys: ['NCT02020202'],
    },
    {
      findingDomain: 'biostatistics', findingCategory: 'multiplicity', fdaReviewDiscipline: 'biostatistics',
      findingText: 'The multiplicity strategy did not control the family-wise type I error across key secondary endpoints.',
      requestedAction: 'Provide a pre-specified multiplicity plan.', affectedIchE3Section: '9.7', sourcePage: 4,
      explicitOrInferred: 'explicit' as const, extractionConfidence: 0.9,
    },
  ],
};

/** Seed: one CRL (global-public source + 2 findings + 1 crl outcome) and one
 *  tenant-private, human-approved design lesson with a contradicting source. */
async function seed(): Promise<void> {
  await ingestCrl(ORG, SAMPLE);
  const lesson = await proposeDesignLesson(ORG, {
    lessonStatement: 'A single-arm efficacy package tends to draw an efficacy deficiency in this setting.',
    supportingSourceIds: [1, 2], contradictingSourceIds: [9], minimumEvidenceCount: 2,
    applicablePhase: '3', modality: 'small_molecule', endpointType: 'ORR', evidenceQualityScore: 0.7,
    derivationMethod: 'precedent_aggregation', modelVersion: 'cre-1',
  });
  await reviewDesignLesson(ORG, lesson.id, 'approved');
}

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  await pglite.exec(fs.readFileSync(path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql'), 'utf8'));
  await pglite.exec(LUMEN_DDL);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (1,'system'), (3,'Tenant A'), (88,'Tenant B');`);
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM lumen_data_atoms;
                     DELETE FROM cre_evidence_relationships; DELETE FROM cre_regulatory_findings;
                     DELETE FROM cre_regulatory_outcomes; DELETE FROM cre_design_lessons;
                     DELETE FROM cre_clinical_studies; DELETE FROM cre_evidence_sources;`);
});

describe('generateAtomsForOrg', () => {
  it('materializes all CRE-native atom types for the owning org, invoking the embedder', async () => {
    await seed();
    const calls: string[] = [];
    const fakeEmbed = async (t: string) => { calls.push(t); return [0.1, 0.2, 0.3]; };

    const res = await generateAtomsForOrg(ORG, { embed: fakeEmbed });

    expect(res.byType['fda_regulatory_finding']).toBe(2);
    expect(res.byType['fda_requested_action']).toBe(2);
    expect(res.byType['regulatory_outcome']).toBe(1);
    expect(res.byType['design_lesson']).toBe(1);
    expect(res.byType['contradictory_precedent']).toBe(1);
    expect(res.total).toBe(7);
    expect(calls).toHaveLength(7);                 // embedder invoked once per written atom
    expect(await countCreAtoms(ORG)).toBe(7);
    // every atom is stamped with the CRE source_type marker
    const marker = await pglite.query(
      `SELECT count(*)::int AS n FROM lumen_data_atoms WHERE organization_id = $1 AND source_type = $2`, [ORG, CRE_ATOM_SOURCE_TYPE]);
    expect((marker.rows[0] as { n: number }).n).toBe(7);
  });

  it('is idempotent — a second run does not duplicate atoms', async () => {
    await seed();
    await generateAtomsForOrg(ORG, { embed: null });
    expect(await countCreAtoms(ORG)).toBe(7);
    await generateAtomsForOrg(ORG, { embed: null });   // re-run
    expect(await countCreAtoms(ORG)).toBe(7);          // delete-then-insert, no growth
  });

  it('materializes per-org and preserves tenant isolation', async () => {
    await seed();
    await generateAtomsForOrg(ORG, { embed: null });
    expect(await countCreAtoms(OTHER)).toBe(0);        // nothing yet for the other tenant

    const other = await generateAtomsForOrg(OTHER, { embed: null });
    // Global-public CRL evidence is visible to any tenant → materialized under OTHER…
    expect(other.byType['fda_regulatory_finding']).toBe(2);
    expect(other.byType['regulatory_outcome']).toBe(1);
    // …but the tenant-private design lesson of ORG is NOT.
    expect(other.byType['design_lesson'] ?? 0).toBe(0);
    expect(other.byType['contradictory_precedent'] ?? 0).toBe(0);
    expect(await countCreAtoms(OTHER)).toBe(5);        // 2 findings + 2 actions + 1 outcome
    expect(await countCreAtoms(ORG)).toBe(7);          // ORG untouched
  });

  it('§14 gate — an approved lesson with an unsupported claim never becomes an atom', async () => {
    await seed();
    const bad = await proposeDesignLesson(ORG, {
      lessonStatement: 'This design has an 85% approval probability.',
      supportingSourceIds: [1, 2], minimumEvidenceCount: 2, evidenceQualityScore: 0.7,
    });
    await reviewDesignLesson(ORG, bad.id, 'approved');

    const res = await generateAtomsForOrg(ORG, { embed: null });
    expect(res.skippedUnsupported).toBeGreaterThanOrEqual(1);
    // only the sound lesson is present
    expect(await countCreAtoms(ORG, 'design_lesson')).toBe(1);
  });
});

describe('persistCsrDerivedAtoms', () => {
  it('persists CSR-derived design-feature, result-observation and execution-limitation atoms', async () => {
    const feat: StudyDesignFeature = {
      studyId: 5, featureKey: 'primary_endpoint', value: 'overall survival', sourceId: 10,
      sourceLocation: 'csr_details.primary_endpoint', extractionMethod: 'deterministic',
      extractionConfidence: 1, explicitOrInferred: 'explicit', verificationStatus: 'unverified',
    };
    const obs: StudyResultObservation = {
      studyId: 5, endpoint: 'overall survival', endpointRole: 'primary', estimand: null,
      analysisPopulation: 'ITT', effectMeasure: 'hazard_ratio', effectValue: 0.82, standardError: null,
      ciLower: 0.7, ciUpper: 0.96, pValue: 0.02, directionOfBenefit: 'positive', timepoint: '24m',
      sampleSize: 400, missingness: 0.15, subgroup: null, multiplicityStatus: 'controlled', sourceLocation: 'csr.efficacy',
    };
    const drafts = [
      ...projectDesignFeature(feat, { sourceId: 10, indication: 'NSCLC', phase: '3' }),
      ...projectResultObservation(obs, { sourceId: 10, indication: 'NSCLC' }),
    ];

    const res = await persistCsrDerivedAtoms(ORG, drafts, { embed: null });
    expect(res.byType['csr_design_feature']).toBe(1);
    expect(res.byType['csr_result_observation']).toBe(1);
    expect(res.byType['csr_execution_limitation']).toBe(1);   // missingness recorded
    expect(await countCreAtoms(ORG, 'csr_design_feature')).toBe(1);
    expect(await countCreAtoms(ORG)).toBe(3);

    // idempotent re-persist
    await persistCsrDerivedAtoms(ORG, drafts, { embed: null });
    expect(await countCreAtoms(ORG)).toBe(3);
  });
});
