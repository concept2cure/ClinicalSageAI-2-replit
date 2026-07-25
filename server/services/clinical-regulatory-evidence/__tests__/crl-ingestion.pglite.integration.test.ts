/**
 * FDA CRL ingestion — END-TO-END against in-process PGlite.
 *
 * Proves Phase 4 (§9): one CRL maps into the shared spine — one GLOBAL_PUBLIC
 * fda_crl source, a linked study identity, MULTIPLE normalized findings that keep
 * their source evidence, a CRL outcome, and the typed relationships
 * (reviewed_in_application, deficiency_applies_to_study) — NOT a separate
 * crl_deficiencies universe. Findings are global-public (org NULL) and readable
 * by any tenant.
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
import { listFindings, listOutcomes, listRelationshipsFor, getSource } from '../evidence-spine.service';

const ORG = 3;
const OTHER_ORG = 88;

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

const SAMPLE = {
  applicationNumber: 'BLA-761111', agency: 'FDA', applicationType: 'BLA', product: 'BX-301',
  indication: 'NSCLC', phase: '3', documentDate: '2026-02-14', officialUrl: 'https://fda.gov/crl/761111',
  relatedStudyKeys: ['NCT02020202'],
  findings: [
    {
      findingDomain: 'clinical', findingCategory: 'inadequate_efficacy', fdaReviewDiscipline: 'clinical',
      findingText: 'A single adequate and well-controlled trial does not establish effectiveness for this indication.',
      normalizedSummary: 'Single-trial efficacy package insufficient.', requestedAction: 'Conduct a confirmatory trial.',
      affectedIchE3Section: '11.4', sourcePage: 3, sourceExcerpt: 'a single trial is insufficient…',
      explicitOrInferred: 'explicit' as const, extractionConfidence: 0.95, relatedStudyKeys: ['NCT02020202'],
    },
    {
      findingDomain: 'biostatistics', findingCategory: 'multiplicity', fdaReviewDiscipline: 'biostatistics',
      findingText: 'The multiplicity strategy did not control the family-wise type I error across key secondary endpoints.',
      requestedAction: 'Provide a pre-specified multiplicity plan.', affectedIchE3Section: '9.7', sourcePage: 4,
      explicitOrInferred: 'explicit' as const, extractionConfidence: 0.9,
    },
  ],
};

describe('ingestCrl', () => {
  it('maps a CRL into a global-public source + findings + outcome + typed edges', async () => {
    const res = await ingestCrl(ORG, SAMPLE);
    expect(res.source.sourceType).toBe('fda_crl');
    expect(res.source.visibilityClass).toBe('global_public');
    expect(res.source.organizationId).toBeNull();          // public FDA record
    expect(res.source.applicationNumber).toBe('BLA-761111');
    expect(res.findings).toHaveLength(2);
    expect(res.outcomes).toHaveLength(1);
    expect(res.outcomes[0].outcomeType).toBe('crl');
    expect(res.linkedStudyIds).toHaveLength(1);

    // Findings keep source evidence.
    const clinical = res.findings.find((f) => f.findingDomain === 'clinical')!;
    expect(clinical.sourcePage).toBe(3);
    expect(clinical.affectedIchE3Section).toBe('11.4');
    expect(clinical.requestedAction).toMatch(/confirmatory trial/i);
    expect(clinical.relatedStudyIds).toHaveLength(1);

    // Typed relationships: reviewed_in_application (both) + deficiency_applies_to_study (clinical).
    const edges = await listRelationshipsFor(ORG, 'finding', clinical.id);
    const types = edges.map((e) => e.relationshipType);
    expect(types).toContain('reviewed_in_application');
    expect(types).toContain('deficiency_applies_to_study');
  });

  it('makes findings visible to ANY tenant (global-public)', async () => {
    const res = await ingestCrl(ORG, SAMPLE);
    // A different org reads the same public findings + source.
    expect(await getSource(OTHER_ORG, res.source.id)).not.toBeNull();
    const otherView = await listFindings(OTHER_ORG, { sourceId: res.source.id });
    expect(otherView).toHaveLength(2);
    const outcomes = await listOutcomes(OTHER_ORG, { applicationIdentifier: 'BLA-761111' });
    expect(outcomes).toHaveLength(1);
  });

  it('rejects an empty ingest (never a source with no findings)', async () => {
    await expect(ingestCrl(ORG, { applicationNumber: 'BLA-1', findings: [] })).rejects.toThrow(/at least one finding/i);
    await expect(ingestCrl(ORG, { applicationNumber: '', findings: SAMPLE.findings })).rejects.toThrow(/applicationNumber/i);
  });
});
