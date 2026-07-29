/**
 * Clinical Regulatory Evidence spine — END-TO-END against in-process PGlite.
 *
 * Applies the REAL migration DDL (20260724_clinical_regulatory_evidence_spine.sql)
 * and proves against real Postgres:
 *   - the schema applies;
 *   - CRUD across sources/studies/findings/outcomes/relationships/lessons works;
 *   - §13 tenant isolation holds — a tenant sees GLOBAL_PUBLIC + its own rows, and
 *     NEVER another tenant's private rows;
 *   - the governance invariants fire: potentially_related must be inferred +
 *     carry confidence; a design lesson can't generalize from a single source.
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
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import * as svc from '../evidence-spine.service';

const ORG_A = 101;
const ORG_B = 202;

// Standing up a WASM Postgres and applying real migration DDL costs seconds, and
// the cost scales with how many other pglite suites are running concurrently.
// vitest's 10s default hook timeout is a load measurement, not a correctness one:
// these hooks went red purely because another pglite suite joined the directory.
beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql');
  await pglite.exec(fs.readFileSync(migration, 'utf8'));
}, 90_000);
afterAll(async () => { await pglite.close(); });

describe('schema + CRUD (real Postgres)', () => {
  it('applies the migration and creates a source → finding → outcome chain', async () => {
    const src = await svc.createSource(ORG_A, {
      sourceType: 'fda_crl', visibilityClass: 'global_public', agency: 'FDA',
      applicationNumber: 'BLA-761000', title: 'Complete Response Letter', product: 'BX-301',
      indication: 'NSCLC', phase: '3',
    });
    expect(src.id).toBeGreaterThan(0);
    expect(src.organizationId).toBeNull();        // global_public → org NULL
    expect(src.sourceType).toBe('fda_crl');

    const finding = await svc.createFinding(ORG_A, {
      sourceId: src.id, findingDomain: 'clinical', findingCategory: 'inadequate_efficacy',
      findingText: 'Single trial insufficient to establish effectiveness.',
      requestedAction: 'Conduct a confirmatory trial.', fdaReviewDiscipline: 'clinical',
      affectedIchE3Section: '11.4', explicitOrInferred: 'explicit',
    });
    expect(finding.sourceId).toBe(src.id);
    expect(finding.findingDomain).toBe('clinical');

    const outcome = await svc.createOutcome(ORG_A, {
      outcomeType: 'crl', sourceId: src.id, applicationIdentifier: 'BLA-761000', outcomeDate: '2026-03-01',
    });
    expect(outcome.outcomeType).toBe('crl');

    const findings = await svc.listFindings(ORG_A, { sourceId: src.id });
    expect(findings).toHaveLength(1);
  });

  it('upserts a canonical study idempotently on its key', async () => {
    const a = await svc.upsertStudy(ORG_A, { canonicalStudyKey: 'BX-301-P3', nctId: 'NCT01', indication: 'NSCLC', phase: '3' });
    const b = await svc.upsertStudy(ORG_A, { canonicalStudyKey: 'BX-301-P3', nctId: 'NCT01', indication: 'NSCLC', phase: '3', studyStatus: 'completed' });
    expect(b.id).toBe(a.id);                       // same row
    expect(b.studyStatus).toBe('completed');       // updated in place
    expect(await svc.listStudies(ORG_A, {})).toHaveLength(1);
  });
}, 30_000);

describe('§13 tenant isolation', () => {
  it('a tenant sees GLOBAL_PUBLIC + its own rows, never another tenant’s private rows', async () => {
    const globalSrc = await svc.createSource(ORG_A, { sourceType: 'fda_crl', visibilityClass: 'global_public', title: 'Public CRL' });
    const aPrivate = await svc.createSource(ORG_A, { sourceType: 'csr', visibilityClass: 'tenant_private', title: 'Org A private CSR' });
    const bPrivate = await svc.createSource(ORG_B, { sourceType: 'csr', visibilityClass: 'tenant_private', title: 'Org B private CSR' });

    // Org B can read the global source and its own, but NOT org A's private one.
    expect(await svc.getSource(ORG_B, globalSrc.id)).not.toBeNull();
    expect(await svc.getSource(ORG_B, bPrivate.id)).not.toBeNull();
    expect(await svc.getSource(ORG_B, aPrivate.id)).toBeNull();      // ← isolation

    // Org A's list excludes org B's private source.
    const aList = await svc.listSources(ORG_A, {});
    const aTitles = aList.map((s) => s.title);
    expect(aTitles).toContain('Org A private CSR');
    expect(aTitles).toContain('Public CRL');
    expect(aTitles).not.toContain('Org B private CSR');            // ← isolation
  });
});

describe('governance invariants', () => {
  it('forces potentially_related edges to be inferred + carry confidence', async () => {
    const s1 = await svc.createSource(ORG_A, { sourceType: 'fda_crl', visibilityClass: 'global_public' });
    const s2 = await svc.createSource(ORG_A, { sourceType: 'csr', visibilityClass: 'global_public' });
    await expect(svc.addRelationship(ORG_A, {
      fromEntityType: 'source', fromEntityId: s1.id, toEntityType: 'source', toEntityId: s2.id,
      relationshipType: 'potentially_related', global: true,   // no confidence → must throw
    })).rejects.toBeInstanceOf(svc.EvidenceSpineError);

    const rel = await svc.addRelationship(ORG_A, {
      fromEntityType: 'source', fromEntityId: s1.id, toEntityType: 'source', toEntityId: s2.id,
      relationshipType: 'potentially_related', confidence: 0.4, global: true,
    });
    expect(rel.isInferred).toBe(true);            // forced true even if caller omits it
  });

  it('refuses to generalize a design lesson from a single source', async () => {
    const s1 = await svc.createSource(ORG_A, { sourceType: 'fda_crl', visibilityClass: 'global_public' });
    await expect(svc.proposeDesignLesson(ORG_A, {
      lessonStatement: 'A single confirmatory trial is always required.',
      supportingSourceIds: [s1.id],                // only one source
    })).rejects.toBeInstanceOf(svc.EvidenceSpineError);

    const s2 = await svc.createSource(ORG_A, { sourceType: 'fda_crl', visibilityClass: 'global_public' });
    const lesson = await svc.proposeDesignLesson(ORG_A, {
      lessonStatement: 'For NSCLC phase 3, single-trial efficacy packages draw efficacy CRLs.',
      supportingSourceIds: [s1.id, s2.id], applicablePhase: '3', modality: 'biologic',
    });
    expect(lesson.humanReviewStatus).toBe('pending');   // never auto-published
    expect(lesson.minimumEvidenceCount).toBe(2);
  });
});
