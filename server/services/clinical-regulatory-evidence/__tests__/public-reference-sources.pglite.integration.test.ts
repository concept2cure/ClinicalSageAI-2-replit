/** The public CSR extension uses the real CRE table and public SELECT policy.
 * No network, model, private tenant document or manufactured scientific result.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
import { publicReferenceToolInputSchema, readPublicReferencePages, searchPublicReferenceSources,
  verifyPublicReferenceOriginal } from '../public-reference-sources';

let pg: PGlite;
let temporaryRoot: string;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from('%PDF-1.7\nPublic source integrity fixture\n%%EOF');
const checksum = hash(bytes);
const artifactPath = `server/data/public-csr-reference/originals/${checksum}.pdf`;
const executor = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows }) };
const verifiedOriginal = vi.fn(async () => undefined);
const dependencies = { executor, verifyOriginal: verifiedOriginal };

function sourceFixture(pageTexts = ['First page: study design.', 'Second page: safety observations.']) {
  const text = pageTexts.join('\n\f\n');
  let start = 0;
  const pages = pageTexts.map((content, index) => {
    const page = { page: index + 1, start, end: start + content.length, sha256: hash(content) };
    start = page.end + 3;
    return page;
  });
  return { text, reference: {
    schemaVersion: 1, documentClass: 'redacted_csr', studyFamily: 'STUDY-1',
    evidenceRole: 'external_reference', clientStudyEvidence: false, trainingApproved: false,
    permittedUse: { retrieval: 'allowed', basis: 'Test disposition only', sourceUrl: 'https://www.fda.gov/test-source' },
    retention: { status: 'retained', artifactPath, sha256: checksum, bytes: bytes.length },
    extraction: { status: 'extracted_unreviewed', textSha256: hash(text), pageCount: pages.length, pages },
    fit: { targetStudyId: 'NCT05330182', rationale: 'External reference comparison only.', limitations: ['Not client results.'] },
  } };
}
async function insert(options: { title?: string; organizationId?: number; visibility?: string; sourceType?: string;
  programId?: string; workspaceId?: number; current?: boolean; deleted?: boolean; reference?: unknown; text?: string } = {}) {
  const fixture = sourceFixture();
  const result = await pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,visibility_class,source_type,title,indication,phase,official_url,stored_artifact_ref,
      checksum,ingestion_status,extraction_status,metadata,extracted_text,client_program_id,client_workspace_id,is_current,deleted_at)
    VALUES ($1,$2,$3,$4,'C. difficile','2','https://www.fda.gov/source.pdf',$5,$6,'ingested','extracted',$7::jsonb,$8,$9,$10,$11,$12)
    RETURNING id`, [options.organizationId ?? null, options.visibility ?? 'global_public', options.sourceType ?? 'csr',
    options.title ?? 'Public study report', `repository:${artifactPath}`, checksum,
    JSON.stringify({ publicReference: options.reference ?? fixture.reference, unrelatedPrivateMetadata: 'DO NOT RETURN' }),
    options.text ?? fixture.text, options.programId ?? null, options.workspaceId ?? null, options.current ?? true,
    options.deleted ? '2026-10-01' : null]);
  return result.rows[0].id;
}
async function replaceReference(id: number, update: (reference: ReturnType<typeof sourceFixture>['reference']) => void) {
  const reference = sourceFixture().reference;
  update(reference);
  await pg.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{publicReference}',$2::jsonb) WHERE id=$1`,
    [id, JSON.stringify(reference)]);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(path.resolve('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN client_program_id UUID;
    ALTER TABLE cre_evidence_sources ADD COLUMN is_current BOOLEAN DEFAULT TRUE;
    ALTER TABLE cre_evidence_sources ADD COLUMN extracted_text TEXT;
    CREATE ROLE public_reference_reader;
    GRANT USAGE ON SCHEMA public TO public_reference_reader;
    GRANT SELECT ON cre_evidence_sources TO public_reference_reader;`);
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'c2c-public-reference-'));
});
beforeEach(async () => {
  await pg.exec('RESET ROLE; ALTER TABLE cre_evidence_sources DISABLE ROW LEVEL SECURITY; DELETE FROM cre_evidence_sources');
  verifiedOriginal.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await pg.close(); await rm(temporaryRoot, { recursive: true, force: true }); });

describe('public reference catalog and explicit scope', () => {
  it('filters the actual query, preserves synopsis scope, and never returns source text or raw metadata', async () => {
    const synopsis = sourceFixture().reference; synopsis.documentClass = 'csr_synopsis';
    const selected = await insert({ title: 'Cadazolid synopsis', reference: synopsis });
    await insert({ title: 'Unrelated report' });
    const result = await searchPublicReferenceSources(42, { query: 'Cadazolid' }, executor);
    expect(result.sources.map(source => source.sourceId)).toEqual([selected]);
    expect(result.sources[0]).toMatchObject({ documentClass: 'csr_synopsis', evidenceRole: 'external_reference',
      clientStudyEvidence: false, trainingApproved: false, retentionStatus: 'recorded_retained' });
    expect(JSON.stringify(result)).not.toMatch(/study design|safety observations|DO NOT RETURN/);
  });

  it('fails closed when a catalog row has invalid or incomplete reference metadata', async () => {
    await insert({ title: 'Valid report' });
    await insert({ title: 'Broken manifest', reference: { schemaVersion: 1, evidenceRole: 'external_reference' } });
    await expect(searchPublicReferenceSources(42, {}, executor)).rejects.toMatchObject({
      code: 'SOURCE_MANIFEST_INVALID',
    });
  });

  it('escapes LIKE wildcards instead of treating a percent sign as an unbounded search', async () => {
    const selected = await insert({ title: '100% report' });
    await insert({ title: '1000 report' });
    expect((await searchPublicReferenceSources(42, { query: '100%' }, executor)).sources.map(source => source.sourceId)).toEqual([selected]);
  });

  it('treats SQL-shaped search inputs as literal values across every optional filter', async () => {
    const selected = await insert({ title: "Safety report' OR TRUE --" });
    await insert({ title: 'Unrelated report' });
    await insert({ title: "Private report' OR TRUE --", organizationId: 91 });
    const quoted = await searchPublicReferenceSources(42, { query: "' OR TRUE --" }, executor);
    expect(quoted.sources.map(source => source.sourceId)).toEqual([selected]);
    for (const input of [{ indication: "' OR TRUE --" }, { phase: "' OR TRUE --" }]) {
      expect((await searchPublicReferenceSources(42, input, executor)).sources).toEqual([]);
    }
  });

  it('finds recorded study applicability without claiming that the reference is client evidence', async () => {
    const fixture = sourceFixture(); fixture.reference.fit.rationale = 'LMN-201 reporting comparison only.';
    const selected = await insert({ reference: fixture.reference });
    for (const query of ['NCT05330182', 'LMN-201']) {
      const result = await searchPublicReferenceSources(42, { query }, executor);
      expect(result.sources.map(source => source.sourceId)).toEqual([selected]);
      expect(result.sources[0].clientStudyEvidence).toBe(false);
    }
  });

  it('paginates stable source ids and applies indication/phase filters', async () => {
    const one = await insert(); const two = await insert(); await insert();
    const first = await searchPublicReferenceSources(42, { indication: 'difficile', phase: '2', limit: 1 }, executor);
    expect(first.sources.map(source => source.sourceId)).toEqual([one]);
    expect(first).toMatchObject({ hasMore: true, nextOffset: 1 });
    const second = await searchPublicReferenceSources(42, { limit: 1, offset: first.nextOffset! }, executor);
    expect(second.sources.map(source => source.sourceId)).toEqual([two]);
    expect((await searchPublicReferenceSources(42, { phase: '3' }, executor)).sources).toEqual([]);
  });

  it('rejects private, ambiguously scoped, retired, deleted and client-document records in SQL', async () => {
    const good = await insert();
    const refused = [
      await insert({ organizationId: 42, visibility: 'tenant_private' }),
      await insert({ organizationId: 77, visibility: 'global_public' }),
      await insert({ visibility: 'tenant_private' }),
      await insert({ programId: '11111111-1111-4111-8111-111111111111' }),
      await insert({ workspaceId: 4 }), await insert({ current: false }),
      await insert({ deleted: true }), await insert({ sourceType: 'client_document' }),
    ];
    expect((await searchPublicReferenceSources(42, {}, executor)).sources.map(source => source.sourceId)).toEqual([good]);
    for (const sourceId of refused) await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(verifiedOriginal).not.toHaveBeenCalled();
  });

  it('works under the real explicit-public SELECT policy with RLS enforced', async () => {
    const good = await insert(); await insert({ organizationId: 77, visibility: 'tenant_private' });
    await pg.exec('ALTER TABLE cre_evidence_sources ENABLE ROW LEVEL SECURITY; ALTER TABLE cre_evidence_sources FORCE ROW LEVEL SECURITY; SET ROLE public_reference_reader');
    expect((await searchPublicReferenceSources(42, {}, executor)).sources.map(source => source.sourceId)).toEqual([good]);
    expect((await readPublicReferencePages(42, { sourceId: good }, dependencies)).pages).toHaveLength(1);
    await pg.exec('RESET ROLE');
  });

  it('allows catalog-only discovery while refusing unretained text', async () => {
    const fixture = sourceFixture();
    const catalog: Record<string, unknown> = { ...fixture.reference };
    delete catalog.retention; delete catalog.extraction;
    const sourceId = await insert({ reference: catalog });
    expect((await searchPublicReferenceSources(42, {}, executor)).sources[0]).toMatchObject({ retentionStatus: 'not_retained', extractionStatus: 'not_extracted' });
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'SOURCE_INTEGRITY_FAILED' });
  });
});

describe('admitted page reads', () => {
  it('returns exact page locations, source hashes and unreviewed external-evidence status', async () => {
    const sourceId = await insert();
    const result = await readPublicReferencePages(42, { sourceId, pageStart: 2 }, dependencies);
    expect(result.pages).toEqual([expect.objectContaining({ page: 2, text: 'Second page: safety observations.',
      sourceStart: sourceFixture().reference.extraction.pages[1].start, citationUrl: 'https://www.fda.gov/source.pdf#page=2', truncated: false })]);
    expect(result).toMatchObject({ sourceSha256: checksum, retentionStatus: 'original_verified', extractionStatus: 'extracted_unreviewed',
      clientStudyEvidence: false, trainingApproved: false, truncated: false });
    expect(result.note).toMatch(/not the client study results/i);
    expect(verifiedOriginal).toHaveBeenCalledTimes(1);
  });

  it('preserves a page-specific OCR method and unreviewed status', async () => {
    const fixture = sourceFixture();
    const reference = { ...fixture.reference, extraction: { ...fixture.reference.extraction,
      pages: fixture.reference.extraction.pages.map(page => ({ ...page,
        extractionMethod: 'tesseract 5.3.4 / eng / psm3 / local-offline', reviewStatus: 'ocr_unreviewed' })) } };
    const sourceId = await insert({ reference });
    const result = await readPublicReferencePages(42, { sourceId }, dependencies);
    expect(result.pages[0]).toMatchObject({ extractionMethod: 'tesseract 5.3.4 / eng / psm3 / local-offline', reviewStatus: 'ocr_unreviewed' });
    expect(result.extractionStatus).toBe('extracted_unreviewed');
  });

  it('names the exact FDA ZIP member and PDF page instead of appending a PDF fragment to an archive', async () => {
    const sourceId = await insert();
    const archiveUrl = 'https://www.fda.gov/media/168273/download?attachment=';
    const archiveMember = 'clinical-review/review-memo.pdf';
    await pg.query(`UPDATE cre_evidence_sources SET official_url=$2,provenance=$3::jsonb WHERE id=$1`,
      [sourceId, archiveUrl, JSON.stringify({ archiveMember })]);
    const result = await readPublicReferencePages(42, { sourceId, pageStart: 2 }, dependencies);
    expect(result.archiveMember).toBe(archiveMember);
    expect(result.pages[0]).toMatchObject({ page: 2, citationUrl: archiveUrl,
      citation: { url: archiveUrl, archiveMember, pdfPage: 2, sourceSha256: checksum,
        retainedArtifactRef: `repository:${artifactPath}` } });
    expect(result.pages[0].citationUrl).not.toContain('#page=');
  });

  it.each(['review_required', 'restricted'])('lists %s metadata but refuses text before reading the file', async retrieval => {
    const fixture = sourceFixture(); fixture.reference.permittedUse.retrieval = retrieval;
    const sourceId = await insert({ reference: fixture.reference });
    expect((await searchPublicReferenceSources(42, {}, executor)).sources[0].permittedUse.retrieval).toBe(retrieval);
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'SOURCE_USE_NOT_ALLOWED' });
    expect(verifiedOriginal).not.toHaveBeenCalled();
  });

  it('refuses altered text, page hashes, unmapped text and wrong retention identity', async () => {
    const sourceId = await insert();
    await pg.query('UPDATE cre_evidence_sources SET extracted_text=extracted_text||$2 WHERE id=$1', [sourceId, 'tampered']);
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'SOURCE_INTEGRITY_FAILED' });
    await pg.query('UPDATE cre_evidence_sources SET extracted_text=$2 WHERE id=$1', [sourceId, sourceFixture().text]);
    await replaceReference(sourceId, reference => { reference.extraction.pages[1].sha256 = '0'.repeat(64); });
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'PAGE_INTEGRITY_FAILED' });
    await replaceReference(sourceId, reference => { reference.extraction.pages[1].end--; });
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'PAGE_INTEGRITY_FAILED' });
    await replaceReference(sourceId, reference => { reference.retention.sha256 = '0'.repeat(64); });
    await expect(readPublicReferencePages(42, { sourceId }, dependencies)).rejects.toMatchObject({ code: 'SOURCE_INTEGRITY_FAILED' });
    expect(verifiedOriginal).not.toHaveBeenCalled();
  });

  it('requires the allowed status and current source again after original-file verification', async () => {
    const sourceId = await insert();
    await expect(readPublicReferencePages(42, { sourceId }, { executor, verifyOriginal: async () => {
      await replaceReference(sourceId, reference => { reference.permittedUse.retrieval = 'restricted'; });
    } })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });

  it('caps returned characters and identifies truncation without splitting Unicode', async () => {
    const fixture = sourceFixture(['x'.repeat(15999) + '🧬more', 'Second requested page']);
    const sourceId = await insert({ reference: fixture.reference, text: fixture.text });
    const result = await readPublicReferencePages(42, { sourceId, pageEnd: 2 }, dependencies);
    expect(result.truncated).toBe(true);
    expect(result.pages[0]).toMatchObject({ truncated: true, returnedEnd: 15999 });
    expect(result.pages.map(page => page.text).join('').length).toBeLessThanOrEqual(16000);
    expect(result.pages[0].text).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(result.pages[0].pageSha256).toBe(fixture.reference.extraction.pages[0].sha256);
  });

  it('rejects invalid page windows, out-of-range pages and unbounded search inputs', async () => {
    const sourceId = await insert();
    await expect(readPublicReferencePages(42, { sourceId, pageStart: 3 }, dependencies)).rejects.toMatchObject({ code: 'PAGE_OUT_OF_RANGE' });
    for (const input of [{ page_start: 1 }, { source_id: sourceId, page_start: 2, page_end: 1 },
      { source_id: sourceId, page_end: 5 }, { limit: 0 }, { limit: 1.5 }, { limit: 101 }, { query: 'x'.repeat(301) },
      { source_offset: -1 }, { entity_types: ['anything'] }, { source_id: '1' }]) {
      expect(publicReferenceToolInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('deployed original verification', () => {
  it('checks actual PDF bytes and refuses a changed or missing file', async () => {
    const directory = path.join(temporaryRoot, 'server/data/public-csr-reference/originals');
    await mkdir(directory, { recursive: true });
    const file = path.join(temporaryRoot, artifactPath);
    await writeFile(file, bytes);
    vi.spyOn(process, 'cwd').mockReturnValue(temporaryRoot);
    await expect(verifyPublicReferenceOriginal(sourceFixture().reference.retention as never)).resolves.toBeUndefined();
    await writeFile(file, Buffer.alloc(bytes.length, 65));
    await expect(verifyPublicReferenceOriginal(sourceFixture().reference.retention as never)).rejects.toMatchObject({ code: 'ORIGINAL_INTEGRITY_FAILED' });
    await rm(file);
    await expect(verifyPublicReferenceOriginal(sourceFixture().reference.retention as never)).rejects.toMatchObject({ code: 'ORIGINAL_UNAVAILABLE' });
  });

  it('refuses traversal and a checksum-named symlink outside the permitted directory', async () => {
    const retention = sourceFixture().reference.retention;
    await expect(verifyPublicReferenceOriginal({ ...retention, artifactPath: '../../anything' } as never)).rejects.toMatchObject({ code: 'ORIGINAL_PATH_INVALID' });
    const outside = path.join(temporaryRoot, 'outside.pdf');
    const inside = path.join(temporaryRoot, artifactPath);
    await mkdir(path.dirname(inside), { recursive: true }); await writeFile(outside, bytes); await symlink(outside, inside);
    vi.spyOn(process, 'cwd').mockReturnValue(temporaryRoot);
    await expect(verifyPublicReferenceOriginal(retention as never)).rejects.toMatchObject({ code: 'ORIGINAL_PATH_INVALID' });
    await rm(inside);
  });
});
