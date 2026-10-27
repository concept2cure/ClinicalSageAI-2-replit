import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { compileReferenceSeed, COLLECTION_DIRECTORY, SEED_MIGRATION } from '../../../../scripts/cre/prepare-public-reference-seed.mjs';
import { searchPublicReferenceSources, readPublicReferencePages } from '../public-reference-sources';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, COLLECTION_DIRECTORY, 'manifest.json'), 'utf8'));
const compiled = compileReferenceSeed(manifest, root);

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

test('real CRE migration applies twice, preserves tenant data and respects later withdrawal', async () => {
  const db = new PGlite();
  try {
    for (const file of [
      'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
      'migrations/20260726_cre_source_program_scope.sql',
      'migrations/20260829_cre_source_versioning.sql',
      'migrations/20261008c_data_room_source_text.sql',
    ]) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
    await db.query(`INSERT INTO cre_evidence_sources (organization_id,source_type,title) VALUES (77,'csr','Private client CSR')`);
    await db.exec(compiled.sql); await db.exec(compiled.sql);
    const counts = await db.query<{ n: number }>(`SELECT count(*)::int n FROM cre_evidence_sources WHERE organization_id IS NULL`);
    assert.equal(counts.rows[0].n, compiled.rows.length);
    const privateRows = await db.query(`SELECT title,metadata FROM cre_evidence_sources WHERE organization_id=77`);
    assert.deepEqual(privateRows.rows, [{ title: 'Private client CSR', metadata: {} }]);
    const executor = { query: async (sql: string, params?: unknown[]) => db.query(sql, params) };
    const found = await searchPublicReferenceSources(77, { query: 'ZINPLAVA' }, executor);
    const medicalReview = found.sources.find(source => source.documentClass === 'regulatory_clinical_review');
    assert.ok(medicalReview, 'The seeded retained source must be reachable through the same reader AnA uses');
    const page = await readPublicReferencePages(77, { sourceId: medicalReview.sourceId, pageStart: 12 }, { executor });
    assert.equal(page.retentionStatus, 'original_verified');
    assert.equal(page.pages[0].reviewStatus, 'ocr_unreviewed');
    assert.ok(page.pages[0].text.includes('Bezlotoxumab'));
    assert.equal(page.clientStudyEvidence, false);
    const first = compiled.rows[0].source_record_identifier;
    await db.query(`UPDATE cre_evidence_sources SET is_current=FALSE,
      metadata=jsonb_set(metadata,'{publicReference,permittedUse,retrieval}','"restricted"')
      WHERE source_record_identifier=$1`, [first]);
    await db.exec(compiled.sql);
    const retired = await db.query(`SELECT is_current,metadata->'publicReference'->'permittedUse'->>'retrieval' AS permission
      FROM cre_evidence_sources WHERE source_record_identifier=$1`, [first]);
    assert.deepEqual(retired.rows, [{ is_current: false, permission: 'restricted' }]);
    await db.query(`UPDATE cre_evidence_sources SET extracted_text='tampered' WHERE source_record_identifier=$1`, [first]);
    await assert.rejects(db.exec(compiled.sql), /CDI seed integrity\/count mismatch/);
  } finally { await db.close(); }
}, 90_000);
