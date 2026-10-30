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
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
// 2026-09-28: `db` is the Drizzle view of the same PGlite (set in beforeAll), so the
// registry's confirmed-write role check (resolveSignerOrgRole, which reads
// organization_users through Drizzle) reads a real membership row seeded below.
const drizzleHolder = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock('../../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) },
  get db() {
    return drizzleHolder.db;
  },
}));
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

const CTX = { organizationId: 42, userId: 1, humanConfirmed: true };

beforeAll(async () => {
  pglite = new PGlite();
  const here = path.dirname(fileURLToPath(import.meta.url));
  await pglite.exec(fs.readFileSync(path.resolve(here, '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql'), 'utf8'));
  // Public-reference reads use the later source-scope/version/text columns.
  await pglite.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN client_program_id UUID;
    ALTER TABLE cre_evidence_sources ADD COLUMN is_current BOOLEAN DEFAULT TRUE;
    ALTER TABLE cre_evidence_sources ADD COLUMN extracted_text TEXT;`);
  // The confirming principal (CTX) is an editor ('member') of the acting org —
  // project_csr_evidence is confirm-class and the registry reads this row.
  await pglite.exec(`CREATE TABLE organization_users (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', persona TEXT)`);
  await pglite.query('INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)', [
    CTX.organizationId, CTX.userId, 'member',
  ]);
  drizzleHolder.db = drizzle(pglite);
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
    // Provenance envelope: FDA-CRL sourced, precedent-not-prediction caveat.
    expect(r.provenance.lineageObjectType).toBe('regulatory_finding');
    expect(r.provenance.caveats.join(' ')).toMatch(/precedent, not a prediction/i);
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
    expect(r.provenance?.sourceType).toBeTruthy();          // carries an auditable provenance envelope
    expect(r.provenance.citation.identifier).toBe('NSCLC');
  });

  it('reaches public source catalog metadata through the registered handler and applies query', async () => {
    const source = await createSource(CTX.organizationId, { sourceType: 'csr', visibilityClass: 'global_public',
      title: 'Cadazolid CSR synopsis', officialUrl: 'https://www.fda.gov/example',
      metadata: { publicReference: { schemaVersion: 1, documentClass: 'csr_synopsis', studyFamily: 'AC-061A201',
        evidenceRole: 'external_reference', clientStudyEvidence: false, trainingApproved: false,
        permittedUse: { retrieval: 'review_required', basis: 'Catalog-only source; review outstanding.', sourceUrl: 'https://www.fda.gov/example' } } } });
    const result = await call('search_clinical_regulatory_evidence', { query: 'Cadazolid', entity_types: ['sources'] });
    expect(result.ok).toBe(true);
    expect(result.sources.sources).toEqual([expect.objectContaining({ sourceId: source.id, documentClass: 'csr_synopsis',
      evidenceRole: 'external_reference', trainingApproved: false, contentAccess: 'review_required' })]);
    expect((await call('search_clinical_regulatory_evidence', { query: 'unrelated', entity_types: ['sources'] })).sources.sources).toEqual([]);
    expect((await call('search_clinical_regulatory_evidence', {})).sources.sources).toHaveLength(1);
  });

  it('refuses invalid page requests before reading report content', async () => {
    expect((await call('search_clinical_regulatory_evidence', { page_start: 2 })).error).toMatch(/invalid evidence search input/i);
    expect((await call('search_clinical_regulatory_evidence', { source_id: 1, page_end: 5 })).error).toMatch(/invalid evidence search input/i);
  });

  it('reads retained pages through the registered handler with actual original-byte verification', async () => {
    const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    const original = Buffer.from('%PDF-1.7\nPublic reference test fixture\n%%EOF');
    const text = 'Read-only public reference text.';
    const checksum = hash(original);
    const artifactPath = `server/data/public-csr-reference/originals/${checksum}.pdf`;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-public-tool-'));
    fs.mkdirSync(path.dirname(path.join(root, artifactPath)), { recursive: true });
    fs.writeFileSync(path.join(root, artifactPath), original);
    const currentDirectory = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const source = await createSource(CTX.organizationId, { sourceType: 'fda_review_memo', visibilityClass: 'global_public',
        title: 'Public reference reading example', officialUrl: 'https://www.fda.gov/example.pdf', checksum,
        storedArtifactRef: `repository:${artifactPath}`, ingestionStatus: 'ingested', extractionStatus: 'extracted',
        metadata: { publicReference: { schemaVersion: 1, documentClass: 'regulatory_review', studyFamily: 'TEST-1',
          evidenceRole: 'external_reference', clientStudyEvidence: false, trainingApproved: false,
          permittedUse: { retrieval: 'allowed', basis: 'Test-only disposition.', sourceUrl: 'https://www.fda.gov/example.pdf' },
          retention: { status: 'retained', artifactPath, sha256: checksum, bytes: original.length },
          extraction: { status: 'extracted_unreviewed', textSha256: hash(text), pageCount: 1,
            pages: [{ page: 1, start: 0, end: text.length, sha256: hash(text) }] } } } });
      await pool.query('UPDATE cre_evidence_sources SET extracted_text=$2 WHERE id=$1', [source.id, text]);
      const result = await call('search_clinical_regulatory_evidence', { source_id: source.id });
      expect(result.ok).toBe(true);
      expect(result.source.pages[0]).toMatchObject({ page: 1, text, truncated: false });
      expect(result.source).toMatchObject({ retentionStatus: 'original_verified', sourceSha256: checksum,
        documentClass: 'regulatory_review', clientStudyEvidence: false, trainingApproved: false });
      expect(result.provenance.citation).toMatchObject({ identifier: String(source.id), url: 'https://www.fda.gov/example.pdf' });
    } finally { currentDirectory.mockRestore(); fs.rmSync(root, { recursive: true, force: true }); }
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
