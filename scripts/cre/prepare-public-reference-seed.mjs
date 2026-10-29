#!/usr/bin/env node
/** Compile a curated release into the existing CRE source store. No network,
 * model calls, new tables, private-record writes or implied scientific review.
 * See docs/evidence/D2/2026-10-27-cdi-csr-seed/README.md: What already exists.
 *
 * A seed is never corrected in place (CLAUDE.md Rule 1): every file of the
 * deploy set re-runs on every deploy, and a source a deploy admitted is a
 * record. A correction is a new collection version. Its manifest names the
 * version it supersedes (`supersedesCollectionId`), and its migration gives each
 * current source of that version a successor (previous_version_id) and retires
 * it (is_current = FALSE), the versioning of
 * migrations/20260829_cre_source_versioning.sql. The superseded migration stays
 * byte for byte (SUPERSEDED_SEED_MIGRATIONS pins it).
 *
 * P-66 (2026-10-29): a public reference names no tenant's study. Version 1
 * carried a `fit` naming one tenant's study as every source's target, visible to
 * every tenant. Version 2 drops it, and the compiler refuses one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const COLLECTION_DIRECTORY = 'server/data/public-csr-reference';
export const SEED_MIGRATION = 'migrations/20261029_cdi_public_reference_seed_v2.sql';
/** Earlier versions, each frozen at the sha256 the deploy set applied. */
export const SUPERSEDED_SEED_MIGRATIONS = Object.freeze({
  'migrations/20261027_cdi_public_reference_seed.sql': '44d3486272db966b7a79d24485b9bf643e44926adbc2ea455ea640496441d19b',
});
const SHA = /^[a-f0-9]{64}$/;
const SOURCE_TYPES = new Set(['csr', 'protocol', 'sap', 'fda_review_memo', 'trial_registry', 'publication']);
const RETRIEVAL = new Set(['allowed', 'review_required', 'restricted']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
function assert(value, message) { if (!value) throw new Error(message); }
function https(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
function readAsset(root, relative) {
  const resolved = fs.realpathSync(path.resolve(root, relative));
  const base = fs.realpathSync(path.resolve(root, COLLECTION_DIRECTORY));
  assert(resolved.startsWith(`${base}${path.sep}`), `Asset escapes reference collection: ${relative}`);
  return fs.readFileSync(resolved);
}

export function compileReferenceSeed(manifest, root) {
  assert(manifest.schemaVersion === 1 && Array.isArray(manifest.records) && Array.isArray(manifest.catalog), 'Invalid reference manifest');
  assert(/^[a-z0-9-]+$/.test(manifest.collectionId), 'Invalid collection identity');
  const supersedes = manifest.supersedesCollectionId ?? null;
  assert(supersedes === null || (/^[a-z0-9-]+$/.test(supersedes) && supersedes !== manifest.collectionId), 'Invalid superseded collection identity');
  // P-66: no tenant's study is a public reference's target, at either level.
  assert(manifest.targetStudyId === undefined, 'A public reference collection names no target study (P-66)');
  const keys = new Set();
  const originals = new Set();
  const rows = [];
  const prepare = (record, retained) => {
    assert(typeof record.sourceKey === 'string' && /^[a-z0-9-]+$/.test(record.sourceKey), 'Invalid source key');
    assert(!keys.has(record.sourceKey), `Duplicate source key: ${record.sourceKey}`); keys.add(record.sourceKey);
    assert(SOURCE_TYPES.has(record.sourceType), `Unsupported source type: ${record.sourceType}`);
    assert(typeof record.title === 'string' && record.title.length > 0 && https(record.officialUrl), 'Source title and official HTTPS URL are required');
    assert(record.documentClass && record.studyFamily, 'Document scope and study family are required');
    assert(record.trainingApproved === false && record.clientStudyEvidence === false, 'Reference must not be training-approved or client evidence');
    assert(record.fit === undefined, `A public reference carries no tenant fit (P-66): ${record.sourceKey}`);
    assert(RETRIEVAL.has(record.permittedUse?.retrieval) && record.permittedUse.basis && https(record.permittedUse.sourceUrl), 'Explicit permitted-use disposition is required');
    const reference = {
      schemaVersion: 1, documentClass: record.documentClass, studyFamily: record.studyFamily,
      evidenceRole: 'external_reference', clientStudyEvidence: false, trainingApproved: false,
      permittedUse: record.permittedUse,
    };
    let text = null;
    let pages = null;
    if (retained) {
      assert(record.permittedUse.retrieval === 'allowed', 'Only permitted reference originals belong in this public release');
      assert(SHA.test(record.sha256), 'Invalid original SHA-256');
      assert(!originals.has(record.sha256), 'Same original must not be counted twice'); originals.add(record.sha256);
      assert(record.originalPath === `${COLLECTION_DIRECTORY}/originals/${record.sha256}.pdf`, 'Original path must be content addressed');
      assert(record.pagesPath === `${COLLECTION_DIRECTORY}/pages/${record.sha256}.jsonl`, 'Page path must match original identity');
      const bytes = readAsset(root, record.originalPath);
      assert(bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.length === record.bytes && sha256(bytes) === record.sha256, `Original integrity mismatch: ${record.sourceKey}`);
      const nativePages = readAsset(root, record.pagesPath).toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
      assert(Number.isInteger(record.pageCount) && record.pageCount > 0 && nativePages.length === record.pageCount, 'Page count mismatch');
      pages = [];
      let offset = 0;
      const pieces = [];
      nativePages.forEach((page, index) => {
        assert(page.page === index + 1 && typeof page.text === 'string' && !page.text.includes('\u0000'), 'Invalid page identity or text');
        assert(sha256(page.text) === page.sha256, `Page integrity mismatch: ${record.sourceKey} page ${page.page}`);
        if (index) { pieces.push('\n\f\n'); offset += 3; }
        pages.push({ page: page.page, start: offset, end: offset + page.text.length,
          sha256: page.sha256, extractionMethod: page.extractionMethod, reviewStatus: page.reviewStatus });
        pieces.push(page.text); offset += page.text.length;
      });
      text = pieces.join('');
      reference.retention = { status: 'retained', artifactPath: record.originalPath, sha256: record.sha256, bytes: record.bytes };
      reference.extraction = { status: 'extracted_unreviewed', textSha256: sha256(text), pages, pageCount: pages.length };
    } else {
      assert(record.permittedUse.retrieval !== 'allowed', 'Catalog-only sources cannot claim admitted content');
      assert(!record.originalPath && !record.pagesPath, 'Catalog cannot claim application-retained bytes');
      reference.acquisition = record.acquisition ?? { status: 'catalog_only' };
    }
    const row = {
      source_type: record.sourceType, source_record_identifier: `${manifest.collectionId}:${record.sourceKey}`,
      title: record.title, sponsor: record.sponsor ?? null, product: record.product ?? null,
      agency: record.agency ?? null, indication: record.indication ?? null,
      therapeutic_area: record.therapeuticArea ?? null, phase: record.phase ?? null,
      trial_registry_identifier: record.trialRegistryIdentifier ?? null,
      official_url: record.officialUrl,
      stored_artifact_ref: retained ? `repository:${record.originalPath}` : null,
      checksum: retained ? record.sha256 : null,
      version: record.version ?? manifest.collectionId,
      ingestion_status: retained ? 'ingested' : 'pending', extraction_status: retained ? 'extracted' : 'pending',
      provenance: { collectionId: manifest.collectionId, acquiredAt: record.acquiredAt ?? '2026-10-27',
        sourceUrl: record.officialUrl, archiveMember: record.archiveMember ?? null,
        originalUnchanged: retained, sourceClass: 'external_reference', scientificReview: 'not_assessed',
        tableSemanticsVerified: false, modelTrainingRun: false },
      metadata: { publicReference: reference }, extracted_text: text,
      char_count: text === null ? null : text.length, page_count: pages?.length ?? null,
      ...(supersedes ? { supersedes_record_identifier: `${supersedes}:${record.sourceKey}` } : {}),
    };
    row.metadata.publicReference.seedPayloadSha256 = sha256(JSON.stringify(row));
    rows.push(row);
  };
  manifest.records.forEach(record => prepare(record, true));
  manifest.catalog.forEach(record => prepare(record, false));
  assert(rows.length > 0, 'Refusing empty seed');
  const payload = JSON.stringify(rows);
  const delimiter = '$cdi_reference_payload$';
  assert(!payload.includes(delimiter), 'SQL delimiter occurs in source text');
  // Supersession pieces, present only when the manifest names a version it replaces.
  const sup = supersedes ? {
    header: `
-- Supersedes ${supersedes}, which is never corrected in place (CLAUDE.md Rule 1). Each of its
-- current sources gains a successor here (previous_version_id) and is retired (is_current = FALSE);
-- readers choose is_current = TRUE. A source of it withdrawn before this version ran stays
-- withdrawn and gains none.`,
    column: ', previous_version_id', value: ', predecessor.id', field: ', supersedes_record_identifier text',
    join: `
  LEFT JOIN public.cre_evidence_sources predecessor
    ON predecessor.organization_id IS NULL
   AND predecessor.source_record_identifier=r.supersedes_record_identifier`,
    only: `
    -- A source withdrawn before this version ran stays withdrawn.
    AND (predecessor.id IS NULL OR predecessor.is_current)`,
    retire: `
  -- Retire what this version succeeds (TRUE to FALSE only; the capture guard refuses the reverse).
  UPDATE public.cre_evidence_sources predecessor SET is_current=FALSE
   WHERE predecessor.is_current
     AND predecessor.id IN (
       SELECT s.previous_version_id FROM public.cre_evidence_sources s
       JOIN jsonb_array_elements(payload) r ON s.source_record_identifier=r->>'source_record_identifier'
       WHERE s.organization_id IS NULL AND s.previous_version_id IS NOT NULL);
  SELECT count(*) INTO withdrawn_count
  FROM jsonb_array_elements(payload) r
  JOIN public.cre_evidence_sources predecessor
    ON predecessor.organization_id IS NULL
   AND predecessor.source_record_identifier=r->>'supersedes_record_identifier'
  WHERE NOT predecessor.is_current
    AND NOT EXISTS (
      SELECT 1 FROM public.cre_evidence_sources s
      WHERE s.organization_id IS NULL AND s.source_record_identifier=r->>'source_record_identifier');
  SELECT count(*) INTO still_current
  FROM public.cre_evidence_sources s
  WHERE s.organization_id IS NULL AND s.is_current
    AND s.source_record_identifier LIKE '${supersedes}:%';
  IF still_current > 0 THEN
    RAISE EXCEPTION 'CDI seed supersession incomplete: % source(s) of ${supersedes} are still current', still_current;
  END IF;`,
  } : { header: '', column: '', value: '', field: '', join: '', only: '', retire: '' };
  const sql = `-- Generated by scripts/cre/prepare-public-reference-seed.mjs; edit the versioned manifest, not this payload.
-- Existing CRE sources only. No tenant rows, model training, findings, outcomes or design lessons.
-- Original files are content-addressed release assets. Catalog records remain pending.
-- Replays never overwrite a retained source. Any conflicting record fails the count/integrity assertion.
-- An absent cre_evidence_sources skips with a NOTICE; the CRE spine precedes this file on every applier.
-- Collection ${manifest.collectionId}. A public reference names no tenant's study (P-66, 2026-10-29):
-- no source here carries a fit, and a current public reference that does fails this file.${sup.header}
DO $cdi_reference_seed$
DECLARE
  payload jsonb := ${delimiter}${payload}${delimiter}::jsonb;
  actual_count integer;
  withdrawn_count integer := 0;
  still_current integer := 0;
  fit_count integer;
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources absent - CDI reference seed skipped';
    RETURN;
  END IF;
  LOCK TABLE public.cre_evidence_sources IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO public.cre_evidence_sources (
    organization_id, visibility_class, source_type, source_record_identifier,
    title, sponsor, product, agency, indication, therapeutic_area, phase,
    trial_registry_identifier, official_url, stored_artifact_ref, checksum, version,
    ingestion_status, extraction_status, provenance, metadata,
    extracted_text, char_count, page_count, text_extracted_at, is_current${sup.column}
  )
  SELECT NULL, 'global_public', r.source_type, r.source_record_identifier,
    r.title, r.sponsor, r.product, r.agency, r.indication, r.therapeutic_area, r.phase,
    r.trial_registry_identifier, r.official_url, r.stored_artifact_ref, r.checksum, r.version,
    r.ingestion_status, r.extraction_status, r.provenance, r.metadata,
    r.extracted_text, r.char_count, r.page_count,
    CASE WHEN r.extraction_status='extracted' THEN '2026-10-27T00:00:00Z'::timestamptz ELSE NULL END, TRUE${sup.value}
  FROM jsonb_to_recordset(payload) AS r(
    source_type text, source_record_identifier text, title text, sponsor text, product text,
    agency text, indication text, therapeutic_area text, phase text, trial_registry_identifier text,
    official_url text, stored_artifact_ref text, checksum text, version text,
    ingestion_status text, extraction_status text, provenance jsonb, metadata jsonb,
    extracted_text text, char_count integer, page_count integer${sup.field}
  )${sup.join}
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cre_evidence_sources existing
    WHERE existing.organization_id IS NULL
      AND existing.source_record_identifier=r.source_record_identifier
  )${sup.only};${sup.retire}
  SELECT count(*) INTO actual_count
  FROM public.cre_evidence_sources s
  JOIN jsonb_array_elements(payload) r ON s.source_record_identifier=r->>'source_record_identifier'
  WHERE s.organization_id IS NULL AND s.visibility_class='global_public'
    AND s.client_program_id IS NULL AND s.client_workspace_id IS NULL
    AND s.source_type=r->>'source_type'
    AND s.title IS NOT DISTINCT FROM r->>'title'
    AND s.version=r->>'version'
    AND s.checksum IS NOT DISTINCT FROM r->>'checksum'
    AND s.stored_artifact_ref IS NOT DISTINCT FROM r->>'stored_artifact_ref'
    AND s.extracted_text IS NOT DISTINCT FROM r->>'extracted_text'
    AND NOT (s.metadata->'publicReference' ? 'fit')
    -- Lifecycle and rights can be withdrawn after admission; a replay must
    -- neither restore them nor make a legitimate withdrawal block deployment.
    AND s.metadata->'publicReference'->>'seedPayloadSha256'
      =r->'metadata'->'publicReference'->>'seedPayloadSha256';
  IF actual_count + withdrawn_count <> jsonb_array_length(payload) THEN
    RAISE EXCEPTION 'CDI seed integrity/count mismatch: expected %, found % (% withdrawn before this version)',
      jsonb_array_length(payload), actual_count, withdrawn_count;
  END IF;
  SELECT count(*) INTO fit_count
  FROM public.cre_evidence_sources s
  WHERE s.organization_id IS NULL AND s.visibility_class='global_public' AND s.is_current
    AND s.metadata->'publicReference' ? 'fit';
  IF fit_count > 0 THEN
    RAISE EXCEPTION 'P-66: % current public reference(s) carry a fit naming a study', fit_count;
  END IF;
END
$cdi_reference_seed$;
`;
  return { sql, rows, summary: { collectionId: manifest.collectionId, retainedDocuments: manifest.records.length,
    catalogOnlyDocuments: manifest.catalog.length, totalSourceRecords: rows.length,
    retainedPdfPages: manifest.records.reduce((sum, r) => sum + r.pageCount, 0),
    originalBytes: manifest.records.reduce((sum, r) => sum + r.bytes, 0),
    modelTrainingRun: false, productionImportVerified: false } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.slice(2);
  assert(check.every(arg => arg === '--check'), 'Usage: node scripts/cre/prepare-public-reference-seed.mjs [--check]');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, COLLECTION_DIRECTORY, 'manifest.json'), 'utf8'));
  const { sql, summary } = compileReferenceSeed(manifest, root);
  const output = path.join(root, SEED_MIGRATION);
  if (check.includes('--check')) assert(fs.readFileSync(output, 'utf8') === sql, 'Committed migration differs from verified manifest/assets');
  else fs.writeFileSync(output, sql);
  // A superseded version is frozen: the deploy set re-runs it as it was applied.
  for (const [file, digest] of Object.entries(SUPERSEDED_SEED_MIGRATIONS)) {
    assert(sha256(fs.readFileSync(path.join(root, file))) === digest, `Superseded seed changed in place: ${file}`);
  }
  console.log(JSON.stringify({ ...summary, migration: SEED_MIGRATION, migrationSha256: sha256(sql), mode: check.length ? 'verified' : 'generated' }, null, 2));
}
