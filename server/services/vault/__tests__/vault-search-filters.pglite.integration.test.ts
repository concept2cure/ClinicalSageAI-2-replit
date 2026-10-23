/** D2, Veeva gap 7 slice B (VR-18): metadata filters on the one Vault search.
 * Runs the canonical search vector, the unmodified search query and the filter
 * builder on PGlite, the same harness as the paging test. Each filter narrows
 * the page AND the total; values OR within a dimension and AND across; filters
 * with no text browse; a filter never widens program or tenant scope; the SQL
 * form of "within a CTD section" answers exactly as `ctdCodeWithin` does. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { searchVaultDocuments, type VaultSearchParams } from '../vault-search';
import { ctdWithinSql, type VaultDocumentFilters } from '../vault-document-filter';
import { ctdCodeWithin, normalizeCtdCode } from '../../../../shared/regulatory/section-code';

let db: JourneyDb;
const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Doc {
  n: number; type: string; classification?: string; kind?: string | null; folder?: string | null;
  placement?: string; ctd?: string | null; updated: string; program?: string; organization?: number;
  supersedes?: number; deleted?: boolean; code?: string; text?: string;
}
async function document(d: Doc) {
  await db.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text,
     classification,evidence_kind,folder_id,placement_status,ctd_section,created_at,updated_at,supersedes_id,deleted_at,version)
    VALUES ($1,$2,$3,$4,$5,$6,'doc.pdf',$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17)`, [
    id(d.n), d.program ?? PROGRAM, d.organization ?? ORG, d.code ?? `F-${d.n}`, `Document ${d.n}`, d.type,
    String(d.n).padStart(64, 'f'), d.text ?? 'Stability data for the batch.', d.classification ?? 'INTERNAL',
    d.kind ?? null, d.folder ?? null, d.placement ?? 'unfiled', d.ctd ?? null, d.updated,
    d.supersedes ? id(d.supersedes) : null, d.deleted ? '2026-10-20T00:00:00Z' : null, d.supersedes ? '2.0' : '1.0']);
}

const run = (filters: VaultDocumentFilters | undefined, options: Partial<VaultSearchParams> = {}) => searchVaultDocuments(db.pool, {
  organizationId: ORG, userId: Number(AUTHOR.id), programId: PROGRAM, q: '', limit: 50, offset: 0, includeSuperseded: false,
  filters, ...options,
});
const ids = (r: Awaited<ReturnType<typeof run>>) => r.results.map((h) => h.id).sort();
const of = (...ns: number[]) => ns.map(id).sort();

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL, migrations: [
    'migrations/20260906_vault_documents_fulltext.sql',
    'migrations/20261006_document_data_dispositions.sql',
    'migrations/20260731c_canonical_documents.sql',
  ] });
  await document({ n: 1, type: 'CSR', classification: 'CONFIDENTIAL', kind: 'csr', folder: 'module-5', placement: 'confirmed', ctd: '5.3.5.1', updated: '2026-10-01T00:00:00Z' });
  await document({ n: 2, type: 'SAR', kind: 'report', folder: 'module-3', placement: 'suggested', ctd: '3.2.P.5.1', updated: '2026-10-02T00:00:00Z' });
  await document({ n: 3, type: 'MODULE_3', classification: 'CONTROLLED', kind: 'cmc', placement: 'unfiled', ctd: 'm3.2.p.5', updated: '2026-10-03T00:00:00Z', text: 'Specification of the drug product.' });
  // A folder with an unfiled status is unfiled, as the tree counts it.
  await document({ n: 4, type: 'MODULE_3', classification: 'CONTROLLED', kind: 'cmc', folder: 'module-3', placement: 'unfiled', ctd: '3.2.P.50', updated: '2026-10-04T00:00:00Z' });
  // A family: 5 is superseded by 6.
  await document({ n: 5, type: 'CSR', kind: 'csr', folder: 'module-5', placement: 'confirmed', ctd: '5.3.5.2', updated: '2026-10-05T00:00:00Z', code: 'FAM' });
  await document({ n: 6, type: 'CSR', kind: 'csr', folder: 'module-5', placement: 'confirmed', ctd: '5.3.5.2', updated: '2026-10-06T00:00:00Z', code: 'FAM', supersedes: 5 });
  // Outside this program, outside this organisation, deleted.
  await document({ n: 7, type: 'CSR', kind: 'csr', updated: '2026-10-07T00:00:00Z', program: PROGRAM_B });
  await document({ n: 8, type: 'CSR', kind: 'csr', updated: '2026-10-08T00:00:00Z', program: OTHER_PROGRAM, organization: 2 });
  await document({ n: 9, type: 'CSR', kind: 'csr', updated: '2026-10-09T00:00:00Z', deleted: true });
  // A lifecycle record on 2 (approved) and on 1 (in review); one in another org names 3.
  await db.pool.query(`INSERT INTO canonical_documents (canonical_id, organization_id, title, document_type, stage, source_refs) VALUES
    ('c-2', ${ORG}, 'Document 2', 'SAR', 'approved', '{"vault_documents":{"nativeId":"${id(2)}"}}'),
    ('c-1', ${ORG}, 'Document 1', 'CSR', 'in_review', '{"vault_documents":{"nativeId":"${id(1)}"}}'),
    ('c-x', 2, 'Foreign', 'MODULE_3', 'approved', '{"vault_documents":{"nativeId":"${id(3)}"}}')`);
}, 60_000);
afterAll(async () => { try { assertNoSchemaGaps(db); } finally { await db?.close(); } });

describe('metadata filters narrow the page and the total', () => {
  it('document type', async () => {
    const r = await run({ documentTypes: ['CSR'] });
    expect(r.mode).toBe('browse');
    expect(ids(r)).toEqual(of(1, 6));
    expect(r.total).toBe(2);
  });

  it('classification', async () => {
    const r = await run({ classifications: ['CONTROLLED'] });
    expect(ids(r)).toEqual(of(3, 4));
    expect(r.total).toBe(2);
  });

  it('evidence kind', async () => {
    const r = await run({ evidenceKinds: ['report'] });
    expect(ids(r)).toEqual(of(2));
    expect(r.total).toBe(1);
  });

  it('folder', async () => {
    const r = await run({ folderIds: ['module-3'] });
    expect(ids(r)).toEqual(of(2, 4));
  });

  it('filing status, as the tree defines it', async () => {
    expect(ids(await run({ placementStatuses: ['unfiled'] }))).toEqual(of(3, 4));
    expect(ids(await run({ placementStatuses: ['suggested'] }))).toEqual(of(2));
    expect(ids(await run({ placementStatuses: ['confirmed'] }))).toEqual(of(1, 6));
  });

  it('CTD section, by whole segments: 3.2.P.5 holds 3.2.P.5.1 and m3.2.p.5, not 3.2.P.50', async () => {
    const r = await run({ ctdSections: ['3.2.P.5'] });
    expect(ids(r)).toEqual(of(2, 3));
    expect(ids(await run({ ctdSections: ['5'] }))).toEqual(of(1, 6));
  });

  it('lifecycle stage, in this organisation only; none is "not sent for review"', async () => {
    expect(ids(await run({ lifecycleStages: ['approved'] }))).toEqual(of(2));
    expect(ids(await run({ lifecycleStages: ['approved', 'in_review'] }))).toEqual(of(1, 2));
    // 3's only record is another organisation's, so 3 has none here.
    expect(ids(await run({ lifecycleStages: ['none'] }))).toEqual(of(3, 4, 6));
  });

  it('OR within a dimension, AND across dimensions', async () => {
    expect(ids(await run({ documentTypes: ['CSR', 'SAR'] }))).toEqual(of(1, 2, 6));
    const r = await run({ documentTypes: ['CSR', 'MODULE_3'], classifications: ['CONTROLLED'] });
    expect(ids(r)).toEqual(of(3, 4));
    expect(r.total).toBe(2);
  });

  it('a filter and a text query together: both must hold', async () => {
    const r = await run({ documentTypes: ['MODULE_3'] }, { q: 'specification' });
    expect(r.mode).toBe('search');
    expect(ids(r)).toEqual(of(3));
    expect(r.total).toBe(1);
  });
});

describe('browse: filters with no text', () => {
  it('orders the newest version first and carries the metadata a row shows', async () => {
    const r = await run({ placementStatuses: ['unfiled', 'suggested'] });
    expect(r.results.map((h) => h.id)).toEqual([id(4), id(3), id(2)]);
    const two = r.results.find((h) => h.id === id(2))!;
    expect(two).toMatchObject({ evidenceKind: 'report', classification: 'INTERNAL', lifecycleStage: 'approved', snippet: null, updatedAt: '2026-10-02T00:00:00.000Z' });
  });

  it('keeps current versions only unless asked, and pages with a real total', async () => {
    expect(ids(await run({ ctdSections: ['5.3.5.2'] }))).toEqual(of(6));
    expect(ids(await run({ ctdSections: ['5.3.5.2'] }, { includeSuperseded: true }))).toEqual(of(5, 6));
    const page = await run({ documentTypes: ['CSR', 'SAR', 'MODULE_3'] }, { limit: 2, offset: 2 });
    expect(page.total).toBe(5);
    expect(page.results.map((h) => h.id)).toEqual([id(3), id(2)]);
  });

  it('never widens scope: another program, another organisation and deleted rows stay out', async () => {
    expect(ids(await run({ documentTypes: ['CSR'] }))).not.toContain(id(7));
    const library = await run({ documentTypes: ['CSR'] }, { programId: null });
    expect(ids(library)).toEqual(of(1, 6, 7));
    // A narrowing list that names a program the actor cannot reach adds nothing.
    expect(ids(await run({ documentTypes: ['CSR'] }, { programId: null, allowedProgramIds: [OTHER_PROGRAM] }))).toEqual([]);
    expect(ids(await run({ documentTypes: ['CSR'] }, { programId: null, allowedProgramIds: [PROGRAM_B] }))).toEqual(of(7));
  });
});

describe('the SQL form of "within a CTD section" is ctdCodeWithin', () => {
  const pairs: Array<[string | null, string]> = [
    ['3.2.P.5', '3.2.P.5'], ['3.2.P.5.1', '3.2.P.5'], ['3.2.P.50', '3.2.P.5'], ['m3.2.p.5.1', '3.2.P.5'],
    ['3.2.p.5', '3.2.P.5'], [' 3.2.P.5.1 ', '3.2.P.5'], ['3.2', '3.2.P.5'], ['3.0', '3'], ['3.0', '3.0'],
    ['4.2.1', '3'], ['32.P', '3'], ['3.2.P.5 Control', '3.2.P.5'], ['3.2.P.5.foo bar', '3.2.P.5'],
    ['banana', '3'], [null, '3'], ['', '3'], ['M2.7.3', '2.7'], ['2.7.30', '2.7.3'],
  ];
  it.each(pairs)('%j within %j', async (stored, ancestor) => {
    const expected = ctdCodeWithin(stored, ancestor);
    // The route normalises the ancestor before binding it (parseVaultFilters).
    const a = normalizeCtdCode(ancestor)!;
    const { rows } = await db.pool.query(
      `SELECT ${ctdWithinSql('x', '$2', '$3')} AS within FROM (SELECT $1::text AS ctd_section) x`,
      [stored, [a], [`${a}.%`]],
    );
    expect(Boolean((rows[0] as { within: boolean | null }).within)).toBe(expected);
  });
});

describe('facet counts (VR-18 "with counts")', () => {
  const bucket = (facets: Record<string, Array<{ value: string | null; count: number }>> | undefined, key: string) =>
    Object.fromEntries((facets?.[key] ?? []).map((b) => [String(b.value), b.count]));

  it('are absent unless asked', async () => {
    expect((await run({ documentTypes: ['CSR'] })).facets).toBeUndefined();
  });

  it('count each value over the other filters, so a chosen type still shows the other types', async () => {
    const r = await run({ documentTypes: ['CSR'], classifications: ['INTERNAL'] }, { facets: true });
    // Type is counted without its own filter, so over INTERNAL alone: doc 6 (CSR) and doc 2 (SAR).
    expect(bucket(r.facets, 'documentType')).toEqual({ CSR: 1, SAR: 1 });
    // Classification is counted without its own filter (CSR only): docs 1 and 6.
    expect(bucket(r.facets, 'classification')).toEqual({ CONFIDENTIAL: 1, INTERNAL: 1 });
    expect(r.total).toBe(1);
  });

  it('each bucket equals COUNT(*) over the same predicate with that value chosen', async () => {
    const r = await run({ placementStatuses: ['unfiled', 'suggested', 'confirmed'] }, { facets: true });
    for (const [key, dimension] of [['documentType', 'documentTypes'], ['evidenceKind', 'evidenceKinds'], ['lifecycleStage', 'lifecycleStages'], ['folderId', 'folderIds']] as const) {
      for (const b of r.facets?.[key] ?? []) {
        if (b.value === null) continue;
        const chosen = await run({ placementStatuses: ['unfiled', 'suggested', 'confirmed'], [dimension]: [b.value] });
        expect(chosen.total, `${key}=${b.value}`).toBe(b.count);
      }
    }
    expect(bucket(r.facets, 'placementStatus')).toEqual({ unfiled: 2, suggested: 1, confirmed: 2 });
    expect(bucket(r.facets, 'lifecycleStage')).toEqual({ none: 3, approved: 1, in_review: 1 });
  });

  it('keep scope: the library counts no folder, and nothing from another program or organisation', async () => {
    const lib = await run({ documentTypes: ['CSR'] }, { programId: null, facets: true });
    expect(lib.facets?.folderId).toBeUndefined();
    expect(bucket(lib.facets, 'evidenceKind')).toEqual({ csr: 3 });
    const one = await run({ documentTypes: ['CSR'] }, { facets: true });
    expect(bucket(one.facets, 'evidenceKind')).toEqual({ csr: 2 });
  });
});
