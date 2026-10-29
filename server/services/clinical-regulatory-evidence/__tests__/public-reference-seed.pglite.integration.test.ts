import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { compileReferenceSeed, COLLECTION_DIRECTORY, SEED_MIGRATION, SUPERSEDED_SEED_MIGRATIONS } from '../../../../scripts/cre/prepare-public-reference-seed.mjs';
import { searchPublicReferenceSources, readPublicReferencePages } from '../public-reference-sources';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, COLLECTION_DIRECTORY, 'manifest.json'), 'utf8'));
const compiled = compileReferenceSeed(manifest, root);
const V1 = 'migrations/20261027_cdi_public_reference_seed.sql';

test('committed seed reproduces from every retained original and page derivative', () => {
  assert.equal(compiled.sql, fs.readFileSync(path.join(root, SEED_MIGRATION), 'utf8'));
  assert.equal(compiled.summary.retainedDocuments, 22);
  assert.equal(compiled.summary.catalogOnlyDocuments, 56);
  assert.equal(compiled.summary.totalSourceRecords, 78);
  assert.equal(compiled.summary.retainedPdfPages, 718);
  assert.equal(compiled.rows.filter(r => r.source_type === 'csr' && r.ingestion_status === 'ingested').length, 0,
    'FDA reviews and a paper must never inflate the sponsor CSR count');
  assert.ok(compiled.rows.every(r => r.metadata.publicReference.clientStudyEvidence === false));
  const sponsorFollowup = compiled.rows.filter(r => r.metadata.publicReference.studyFamily === 'gsk-varicella100388'
    && r.metadata.publicReference.acquisition?.sourceAttachmentIdentifier);
  assert.equal(sponsorFollowup.length, 7);
  assert.equal(sponsorFollowup.filter(r => r.metadata.publicReference.documentClass === 'redacted_csr').length, 2);
  assert.equal(sponsorFollowup.reduce((n, r) => n + r.metadata.publicReference.acquisition.pageCount, 0), 13517);
  assert.equal(sponsorFollowup.reduce((n, r) => n + r.metadata.publicReference.acquisition.bytes, 0), 714554972);
  for (const row of sponsorFollowup) {
    const reference = row.metadata.publicReference;
    assert.equal(reference.acquisition.newIndependentStudyCount, 0);
    assert.match(reference.acquisition.sha256, /^[0-9a-f]{64}$/);
    assert.equal(reference.acquisition.status, 'original_retained_outside_application');
    assert.equal(reference.permittedUse.retrieval, 'review_required');
    assert.equal(reference.retention, undefined);
    assert.equal(reference.extraction, undefined);
    assert.equal(row.stored_artifact_ref, null);
    assert.equal(row.extracted_text, null);
    assert.equal(row.page_count, null);
    assert.equal(row.ingestion_status, 'pending');
    assert.equal(row.extraction_status, 'pending');
  }
});

test('original mismatch and path substitution cannot manufacture retention', () => {
  const broken = globalThis.structuredClone(manifest);
  broken.records[0].bytes++;
  assert.throws(() => compileReferenceSeed(broken, root), /Original integrity mismatch/);
  broken.records[0] = { ...manifest.records[0], originalPath: '/tmp/unrelated.pdf' };
  assert.throws(() => compileReferenceSeed(broken, root), /content addressed/);
});

test('catalog-only, restricted and training-approved documents cannot be admitted', () => {
  const broken = globalThis.structuredClone(manifest);
  broken.records[0].permittedUse.retrieval = 'review_required';
  assert.throws(() => compileReferenceSeed(broken, root), /Only permitted reference originals/);
  broken.records[0] = { ...manifest.records[0], trainingApproved: true };
  assert.throws(() => compileReferenceSeed(broken, root), /must not be training-approved/);
  broken.records[0] = manifest.records[0];
  broken.catalog = [{ ...manifest.catalog[0], permittedUse: { ...manifest.catalog[0].permittedUse, retrieval: 'allowed' } }];
  assert.throws(() => compileReferenceSeed(broken, root), /Catalog-only sources cannot claim admitted/);
});

test('duplicate keys, duplicate originals and missing pages fail before producing SQL', () => {
  const broken = globalThis.structuredClone(manifest);
  broken.records.push(broken.records[0]);
  assert.throws(() => compileReferenceSeed(broken, root), /Duplicate source key/);
  broken.records[broken.records.length - 1] = { ...broken.records[0], sourceKey: 'different-key-same-original' };
  assert.throws(() => compileReferenceSeed(broken, root), /Same original/);
  broken.records.pop(); broken.records[0].pageCount++;
  assert.throws(() => compileReferenceSeed(broken, root), /Page count mismatch/);
});

test('version 1 is frozen as the deploy set applied it: a seed is never corrected in place', () => {
  const files = Object.entries(SUPERSEDED_SEED_MIGRATIONS);
  assert.deepEqual(files.map(([file]) => file), [V1]);
  for (const [file, digest] of files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), digest, file);
  }
});

test('version 2 names no tenant study, and the compiler refuses one that does (P-66)', () => {
  assert.equal(manifest.targetStudyId, undefined);
  assert.equal(manifest.supersedesCollectionId, 'cdi-csr-reference-2026-10-27-v1');
  for (const row of compiled.rows) {
    assert.equal(row.metadata.publicReference.fit, undefined, row.source_record_identifier);
    assert.equal(row.supersedes_record_identifier,
      row.source_record_identifier.replace(manifest.collectionId, manifest.supersedesCollectionId));
  }
  assert.ok(!compiled.sql.includes('NCT05330182'), 'the tenant study must not be in the seed');
  const tailored = globalThis.structuredClone(manifest);
  tailored.records[0].fit = { targetStudyId: 'NCT05330182', rationale: 'x', limitations: [] };
  assert.throws(() => compileReferenceSeed(tailored, root), /carries no tenant fit/);
  assert.throws(() => compileReferenceSeed({ ...globalThis.structuredClone(manifest), targetStudyId: 'NCT05330182' }, root),
    /names no target study/);
});

test('real CRE migrations: version 2 supersedes version 1 on every replay, keeps tenant data and every withdrawal', async () => {
  const db = new PGlite();
  try {
    for (const file of [
      'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
      'migrations/20260726_cre_source_program_scope.sql',
      'migrations/20260829_cre_source_versioning.sql',
      'migrations/20261001_cre_evidence_sources_capture_immutability.sql',
      'migrations/20261008c_data_room_source_text.sql',
    ]) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
    const v1 = fs.readFileSync(path.join(root, V1), 'utf8');
    await db.query(`INSERT INTO cre_evidence_sources (organization_id,source_type,title) VALUES (77,'csr','Private client CSR')`);
    await db.exec(v1);
    // A version 1 source withdrawn before version 2 ran stays withdrawn and gains no successor.
    const withdrawn = compiled.rows[1].supersedes_record_identifier;
    await db.query(`UPDATE cre_evidence_sources SET is_current=FALSE,
      metadata=jsonb_set(metadata,'{publicReference,permittedUse,retrieval}','"restricted"')
      WHERE source_record_identifier=$1`, [withdrawn]);
    // Every deploy re-runs both files, in set order.
    for (let deploy = 0; deploy < 2; deploy++) { await db.exec(v1); await db.exec(compiled.sql); }
    const v1Rows = await db.query<{ n: number; current: number; fit: number }>(`SELECT count(*)::int n,
        count(*) FILTER (WHERE is_current)::int current, count(*) FILTER (WHERE metadata->'publicReference' ? 'fit')::int fit
      FROM cre_evidence_sources WHERE source_record_identifier LIKE 'cdi-csr-reference-2026-10-27-v1:%'`);
    assert.deepEqual(v1Rows.rows[0], { n: compiled.rows.length, current: 0, fit: compiled.rows.length });
    const v2Rows = await db.query<{ n: number; current: number; linked: number }>(`SELECT count(*)::int n,
        count(*) FILTER (WHERE s.is_current)::int current,
        count(*) FILTER (WHERE p.source_record_identifier = replace(s.source_record_identifier,
          'cdi-csr-reference-2026-10-29-v2:', 'cdi-csr-reference-2026-10-27-v1:'))::int linked
      FROM cre_evidence_sources s LEFT JOIN cre_evidence_sources p ON p.id = s.previous_version_id
      WHERE s.source_record_identifier LIKE 'cdi-csr-reference-2026-10-29-v2:%'`);
    assert.deepEqual(v2Rows.rows[0], { n: compiled.rows.length - 1, current: compiled.rows.length - 1, linked: compiled.rows.length - 1 });
    const current = await db.query<{ n: number }>(`SELECT count(*)::int n FROM cre_evidence_sources
      WHERE organization_id IS NULL AND is_current AND metadata->'publicReference' ? 'fit'`);
    assert.equal(current.rows[0].n, 0, 'a current public reference names a study');
    const privateRows = await db.query(`SELECT title,metadata FROM cre_evidence_sources WHERE organization_id=77`);
    assert.deepEqual(privateRows.rows, [{ title: 'Private client CSR', metadata: {} }]);

    // Readers choose the current version: the reader AnA uses reads version 2.
    const executor = { query: async (sql: string, params?: unknown[]) => db.query(sql, params) };
    const found = await searchPublicReferenceSources(77, { query: 'ZINPLAVA' }, executor);
    const medicalReview = found.sources.find(source => source.documentClass === 'regulatory_clinical_review');
    assert.ok(medicalReview, 'The seeded retained source must be reachable through the same reader AnA uses');
    assert.match(String(medicalReview.sourceRecordIdentifier), /^cdi-csr-reference-2026-10-29-v2:/);
    assert.ok(!JSON.stringify(found).includes('NCT05330182'));
    assert.deepEqual((await searchPublicReferenceSources(77, { query: 'NCT05330182' }, executor)).sources, []);
    const page = await readPublicReferencePages(77, { sourceId: medicalReview.sourceId, pageStart: 12 }, { executor });
    assert.equal(page.retentionStatus, 'original_verified');
    assert.equal(page.pages[0].reviewStatus, 'ocr_unreviewed');
    assert.ok(page.pages[0].text.includes('Bezlotoxumab'));
    assert.equal(page.clientStudyEvidence, false);

    // A version 2 source withdrawn after admission stays withdrawn on replay.
    const first = compiled.rows[0].source_record_identifier;
    await db.query(`UPDATE cre_evidence_sources SET is_current=FALSE,
      metadata=jsonb_set(metadata,'{publicReference,permittedUse,retrieval}','"restricted"')
      WHERE source_record_identifier=$1`, [first]);
    await db.exec(v1); await db.exec(compiled.sql);
    const retired = await db.query(`SELECT is_current,metadata->'publicReference'->'permittedUse'->>'retrieval' AS permission
      FROM cre_evidence_sources WHERE source_record_identifier=$1`, [first]);
    assert.deepEqual(retired.rows, [{ is_current: false, permission: 'restricted' }]);
    await db.query(`UPDATE cre_evidence_sources SET extracted_text='tampered' WHERE source_record_identifier=$1`, [first]);
    await assert.rejects(db.exec(compiled.sql), /CDI seed integrity\/count mismatch/);
  } finally { await db.close(); }
}, 120_000);
