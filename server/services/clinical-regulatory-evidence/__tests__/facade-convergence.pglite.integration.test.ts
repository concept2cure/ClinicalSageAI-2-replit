/**
 * The evidence facade reads the cre_* spine — END-TO-END against PGlite.
 *
 * Until this convergence, the facade (index.ts) read a parallel clinical_*
 * lineage: `searchFindings` was a hardcoded empty stub, and the only real read
 * counted tables no durable path ever created — while CRL ingestion wrote
 * cre_regulatory_findings on the other side of the split. The concrete
 * casualty: the CRL Library surface could never show an ingested letter.
 *
 * These tests apply the REAL spine DDL and prove the sentence that was false
 * before: a finding written through the spine is returned by the facade read
 * the CRL Library consumes — org-scoped, filterable, with honest empties and
 * fail-closed unsupported constraints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) },
  db: null,
}));

import * as spine from '../evidence-spine.service';
import * as facade from '../index';

const ORG_A = 811;
const ORG_B = 922;
const scopeA = { organizationId: ORG_A } as { organizationId: number };
const scopeB = { organizationId: ORG_B } as { organizationId: number };

// Standing up a WASM Postgres and applying real migration DDL costs seconds;
// an implicit 10s budget measures load, not correctness.
beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  await pglite.exec(
    fs.readFileSync(
      path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql'),
      'utf8',
    ),
  );
}, 90_000);
afterAll(async () => {
  await pglite.close();
}, 30_000);

/** An ingested CRL source + one finding, the way crl-ingestion writes them. */
async function ingestCrl(orgId: number, over: Record<string, unknown> = {}) {
  const src = await spine.createSource(orgId, {
    sourceType: 'fda_crl',
    visibilityClass: 'tenant_private',
    agency: 'FDA',
    applicationType: 'NDA',
    applicationNumber: 'NDA-215000',
    title: 'Complete Response Letter',
    documentDate: '2026-05-01',
    extractionStatus: 'extracted',
    ingestionStatus: 'ingested',
  });
  const finding = await spine.createFinding(orgId, {
    sourceId: src.id,
    applicationIdentifier: 'NDA-215000',
    findingDomain: 'clinical',
    findingCategory: 'endpoint validity',
    fdaReviewDiscipline: 'statistical',
    findingText: 'The primary endpoint analysis did not control type I error across the co-primary family.',
    normalizedSummary: 'Multiplicity control inadequate for co-primary endpoints.',
    requestedAction: 'Provide a revised SAP with a gatekeeping procedure.',
    severity: 'major',
    affectedCtdSection: '2.7.3',
    sourcePage: 4,
    sourceExcerpt: 'did not control type I error',
    explicitOrInferred: 'explicit',
    ...over,
  } as Parameters<typeof spine.createFinding>[1]);
  return { src, finding };
}

describe('the sentence that was false before this convergence', () => {
  it('an ingested CRL finding reaches the CRL Library read', async () => {
    const { src } = await ingestCrl(ORG_A);

    const result = await facade.searchFindings(scopeA);

    expect(result.findings.length).toBeGreaterThan(0);
    const f = result.findings[0];
    // The resolved contract, filled from spine rows — not a stub, not a sample.
    expect(f.finding).toBe('Multiplicity control inadequate for co-primary endpoints.');
    expect(f.severity).toBe('high'); // 'major' normalized, verbatim text untouched
    expect(f.discipline).toBe('statistical');
    expect(f.epistemicStatus).toBe('explicit');
    expect(f.verification).toBe('extracted_unreviewed'); // machine output, unreviewed
    expect(f.source.applicationNumber).toBe('NDA-215000');
    expect(f.source.page).toBe(4);
    // The excerpt is the stored verbatim span — a paraphrase attributed to a
    // regulator would be a fabrication.
    expect(f.source.excerpt).toBe('did not control type I error');
    expect(f.source.sourceId).toBe(String(src.id));
  });

  it("does not serve another tenant's findings", async () => {
    const result = await facade.searchFindings(scopeB);
    expect(result.findings).toHaveLength(0);
    // And the empty carries its reason — org B has ingested nothing at all.
    expect(result.insufficientEvidence?.reason).toContain('No regulatory evidence has been ingested');
  });
});

describe('constrained search (§8.1: constraints narrow, never widen)', () => {
  it('applies metadata filters before returning anything', async () => {
    await ingestCrl(ORG_A, {
      findingCategory: 'safety database size',
      fdaReviewDiscipline: 'safety',
      normalizedSummary: 'Safety exposure below ICH E1 minimum.',
    });

    const stat = await facade.searchFindings(scopeA, { discipline: 'statistical' });
    expect(stat.findings.length).toBeGreaterThan(0);
    expect(stat.findings.every(f => f.discipline === 'statistical')).toBe(true);

    const ctd = await facade.searchFindings(scopeA, { ctdSection: '2.7' });
    expect(ctd.findings.every(f => f.mappings.some(m => m.kind === 'ctd' && m.value.startsWith('2.7')))).toBe(true);

    const text = await facade.searchFindings(scopeA, { text: 'type I error' });
    expect(text.findings.length).toBeGreaterThan(0);
  });

  it('distinguishes "nothing matched" from "nothing ingested"', async () => {
    // Letters exist for org A; a filter that matches none returns a plain zero
    // with NO insufficient-evidence envelope — the zero is the answer.
    const result = await facade.searchFindings(scopeA, { category: 'nonexistent category' });
    expect(result.findings).toHaveLength(0);
    expect(result.insufficientEvidence).toBeUndefined();
  });

  it('fails closed on a constraint the corpus index cannot evaluate', async () => {
    // Silently ignoring a constraint would WIDEN results — the §8.1 failure.
    const result = await facade.searchFindings(scopeA, { modality: 'small molecule' });
    expect(result.findings).toHaveLength(0);
    expect(result.insufficientEvidence?.reason).toMatch(/cannot evaluate the constraint/);
    expect(result.insufficientEvidence?.reason).toMatch(/modality/);
  });
});

describe('coverage counts the spine, one unit: sources', () => {
  it('reports the monotonic ladder from real rows', async () => {
    await spine.createSource(ORG_A, {
      sourceType: 'csr',
      title: 'CSR 301',
      extractionStatus: 'verified',
      ingestionStatus: 'ingested',
    });
    await spine.createSource(ORG_A, {
      sourceType: 'protocol',
      title: 'Protocol v3',
      extractionStatus: 'pending',
    });

    const cov = await facade.getCoverage(scopeA);
    expect(cov.scanned).toBeGreaterThanOrEqual(4); // 2 CRLs + CSR + protocol
    // CRLs are scanned but not eligible — they cannot carry a clinical effect.
    expect(cov.eligible).toBeLessThan(cov.scanned);
    expect(cov.structured).toBeLessThanOrEqual(cov.eligible);
    expect(cov.verified).toBeLessThanOrEqual(cov.structured);
    expect(cov.cited).toBeLessThanOrEqual(cov.verified);
    expect(cov.freshness).toBeTruthy();
  });

  it('reports an empty corpus with its reason, never a bare zero', async () => {
    const cov = await facade.getCoverage(scopeB);
    expect(cov.scanned).toBe(0);
    expect(cov.exclusionNote).toContain('nothing has been scanned');
  });
});

describe('finding by id and verified outcomes', () => {
  it('resolves one finding by id, scoped', async () => {
    const { finding } = await ingestCrl(ORG_A);
    const got = await facade.getFinding(scopeA, String(finding.id));
    expect(got?.findingId).toBe(String(finding.id));
    // Another tenant cannot fetch it by guessing the id.
    expect(await facade.getFinding(scopeB, String(finding.id))).toBeNull();
  });

  it('returns an outcome ONLY when one is verified — never inferred from status', async () => {
    const { src } = await ingestCrl(ORG_A);
    await spine.createOutcome(ORG_A, {
      sourceId: src.id,
      applicationIdentifier: 'NDA-215000',
      outcomeType: 'crl',
      outcomeDate: '2026-05-01',
      verificationStatus: 'unverified',
    } as Parameters<typeof spine.createOutcome>[1]);

    // Unverified → null. The UI renders "Not verified"; nothing is asserted.
    expect(await facade.getOutcome(scopeA, 'NDA-215000')).toBeNull();

    await spine.createOutcome(ORG_A, {
      sourceId: src.id,
      applicationIdentifier: 'NDA-215000',
      outcomeType: 'crl',
      outcomeDate: '2026-05-01',
      verificationStatus: 'verified',
    } as Parameters<typeof spine.createOutcome>[1]);

    const outcome = await facade.getOutcome(scopeA, 'NDA-215000');
    expect(outcome?.outcome).toBe('crl');
    expect(outcome?.applicationType).toBe('NDA');
  });
});
