/**
 * DOCX fidelity binds to a persisted owned current artifact/version, not prose
 * the caller can substitute. Actual handler + SQL + disposition migration +
 * real tenant-workspace DOCX bytes. OCR text is a controlled extraction fixture;
 * these tests do not qualify the extraction engine or scientific source review.
 */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph } from 'docx';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDispositionHarness, insertCapturedSuccessor, type DispositionHarness, type DispositionFixture,
} from '../../document-data-disposition/__tests__/disposition-fixture.js';

const state = vi.hoisted(() => {
  const value: {
    query?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    text: string;
    afterExtraction?: () => Promise<void>;
    extractionError?: Error;
  } = { text: '' };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (!value.query) throw new Error('Test database not initialized');
    return value.query(sql, params);
  });
  const pool = { query, connect: vi.fn(async () => ({ query, release: () => undefined })) };
  const extract = vi.fn(async () => {
    if (value.extractionError) throw value.extractionError;
    await value.afterExtraction?.();
    return { text: value.text, method: 'controlled-test-extraction' };
  });
  return { value, pool, extract };
});
vi.mock('../../../db', () => ({ getPool: () => state.pool, pool: state.pool, db: {} }));
vi.mock('../../../db.js', () => ({ getPool: () => state.pool, pool: state.pool, db: {} }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: state.extract }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { sealVerifiedVersion } from '../verifiedSealService.js';
import { diffDocumentStructure } from '../../document-analysis.js';

const TEXT = '3.2.P.8 Stability\nShelf life is 24 months at 25°C.\nPrimary batches were evaluated.';
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
let harness: DispositionHarness;
let fixture: DispositionFixture;
let versionId: number;
let projectId: number;
let docxPath: string;
let docxBytes: Buffer;
const directories: string[] = [];

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE concept2cure_artifacts ADD COLUMN version integer;
    ALTER TABLE concept2cure_artifacts ADD COLUMN title text;
    ALTER TABLE projects ADD COLUMN client_workspace_id integer;
    CREATE TABLE concept2cure_artifact_versions (
      id serial PRIMARY KEY, artifact_id integer NOT NULL, organization_id integer NOT NULL,
      version integer NOT NULL, content text, content_hash text, UNIQUE (artifact_id,version));
  `);
  docxBytes = await Packer.toBuffer(new Document({ sections: [{ children: TEXT.split('\n').map(text => new Paragraph(text)) }] }));
});
afterAll(async () => {
  state.value.query = undefined;
  await harness.close();
  await Promise.all(directories.map(dir => fs.rm(dir, { recursive: true, force: true })));
});
beforeEach(async () => {
  fixture = await harness.seed();
  projectId = Number((await harness.pg.query<{ project_id: number }>(
    'SELECT project_id FROM concept2cure_artifacts WHERE id=$1', [fixture.artifact],
  )).rows[0].project_id);
  await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3,version=2,title=$4 WHERE id=$1',
    [fixture.artifact, TEXT, digest(TEXT), 'Stability']);
  versionId = Number((await harness.pg.query<{ id: number }>(`INSERT INTO concept2cure_artifact_versions
    (artifact_id,organization_id,version,content,content_hash) VALUES ($1,$2,2,$3,$4) RETURNING id`,
  [fixture.artifact, fixture.org, TEXT, digest(TEXT)])).rows[0].id);
  const dir = path.resolve('tmp/docbuilder', `org-${fixture.org}`, randomUUID());
  directories.push(dir);
  await fs.mkdir(dir, { recursive: true });
  docxPath = path.join(dir, 'stability.docx');
  await fs.writeFile(docxPath, docxBytes);
  state.value.query = harness.db.query;
  state.value.text = TEXT;
  state.value.afterExtraction = undefined;
  state.value.extractionError = undefined;
  state.pool.query.mockClear();
  state.pool.connect.mockClear();
  state.extract.mockClear();
});

const selectors = () => ({ artifact_id: fixture.artifactNativeId, version_number: 2 });
const context = () => ({ organizationId: fixture.org, projectId, projectRef: String(projectId), userId: 42 });
async function run(input: Record<string, unknown> = {}, ctx: Record<string, unknown> = context()) {
  return JSON.parse(await getToolHandler('verify_docx_against_source')!(
    { input_docx_path: docxPath, ...selectors(), ...input }, ctx as never,
  ));
}
async function snapshot() {
  return Promise.all(['concept2cure_artifacts', 'concept2cure_artifact_versions', 'document_data_dispositions'].map(async table =>
    (await harness.pg.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
}
async function refuses(code: string, input: Record<string, unknown> = {}, ctx: Record<string, unknown> = context()) {
  const before = await snapshot();
  const result = await run({ expected_text: TEXT, ...input }, ctx);
  expect(result, 'a successful caller-text diff must not bypass a persisted-target refusal').toMatchObject({ ok: false, code });
  expect(result.error).toEqual(expect.any(String));
  expect(result.target).toBeUndefined();
  expect(result.sealEligible).toBe(false);
  expect(state.extract).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
  expect(state.pool.query.mock.calls.every(([sql]) => !/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER)\b/i.test(sql))).toBe(true);
  return result;
}
function nonsealable(result: Record<string, unknown>) {
  expect(result).toMatchObject({ sourceVerified: false, sourceQualification: 'unassessed', sealEligible: false });
}
async function storedText(text: string) {
  await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3 WHERE id=$1', [fixture.artifact, text, digest(text)]);
  await harness.pg.query('UPDATE concept2cure_artifact_versions SET content=$2,content_hash=$3 WHERE id=$1', [versionId, text, digest(text)]);
  state.value.text = text;
}

describe('registered DOCX verifier compares server-loaded persisted current text', () => {
  it('needs no caller text and binds every resolved identity and exact file/text digest', async () => {
    const before = await snapshot();
    const result = await run({ required_strings: ['3.2.P.8 Stability'] });
    expect(result).toMatchObject({
      ok: true, artifactVerified: true, scope: 'persisted_artifact_fidelity', comparisonBasis: 'persisted_artifact',
      sourceDiffPerformed: true, docxSha256: digest(docxBytes), docxSizeBytes: docxBytes.length,
      extractedTextSha256: digest(TEXT), comparisonTextSha256: digest(TEXT),
      target: { organizationId: fixture.org, projectId, artifactPk: fixture.artifact,
        artifactId: fixture.artifactNativeId, versionId, version: 2, contentSha256: digest(TEXT) },
    });
    nonsealable(result);
    expect(result.divergence).toMatchObject({ additions: 0, deletions: 0 });
    expect(await snapshot()).toEqual(before);
    expect(state.pool.query.mock.calls.filter(([sql]) => sql.includes('concept2cure_artifact_versions')).length).toBeGreaterThanOrEqual(2);
  });

  it('accepts identical optional caller text without upgrading source qualification', async () => {
    const result = await run({ expected_text: TEXT });
    expect(result.ok).toBe(true);
    expect(result.comparisonBasis).toBe('persisted_artifact');
    nonsealable(result);
  });

  it('rejects forged caller text even when it exactly matches the DOCX extraction', async () => {
    state.value.text = 'Forged substituted stability report';
    await refuses('VERIFICATION_TEXT_CONFLICT', { expected_text: state.value.text });
  });

  it('cannot pass substantive divergence just because headings are present', async () => {
    state.value.text = TEXT.replace('24 months', '36 months');
    const result = await run({ required_strings: ['3.2.P.8 Stability'] });
    expect(result).toMatchObject({ ok: false, artifactVerified: false, sourceDiffPerformed: true });
    expect(result.divergence.additions + result.divergence.deletions).toBeGreaterThan(0);
    expect(result.missingRequiredStrings).toEqual([]);
    expect(result.extractedTextSha256).toBe(digest(state.value.text));
    expect(result.comparisonTextSha256).toBe(digest(TEXT));
    nonsealable(result);
  });

  it('reports a missing required string despite exact persisted text fidelity', async () => {
    const result = await run({ required_strings: ['Unrecorded batch release date'] });
    expect(result).toMatchObject({ ok: false, artifactVerified: false, missingRequiredStrings: ['Unrecorded batch release date'] });
    expect(result.divergence).toMatchObject({ additions: 0, deletions: 0 });
    nonsealable(result);
  });

  it('detects a changed dose even when the dose heading and units remain present', async () => {
    await storedText('2 DOSAGE\nDose is 0.5 mg once daily.');
    state.value.text = '2 DOSAGE\nDose is 5 mg once daily.';
    const result = await run({ required_strings: ['2 DOSAGE', 'mg once daily'] });
    expect(result).toMatchObject({ ok: false, artifactVerified: false, missingRequiredStrings: [] });
    expect(result.divergence.additions + result.divergence.deletions).toBeGreaterThan(0);
    nonsealable(result);
  });

  it('passes exact repeated headings despite the heuristic summary reporting a modified section', async () => {
    const text = '3 DOSAGE\nTake 5 mg daily.\n3 DOSAGE\nTake 10 mg daily.';
    await storedText(text);
    const heuristic = diffDocumentStructure(text, text);
    expect(heuristic.summary.modified).toBeGreaterThan(0);
    expect(heuristic.flat).toMatchObject({ additions: 0, deletions: 0 });
    const result = await run();
    expect(result).toMatchObject({ ok: true, artifactVerified: true });
    expect(result.divergence).toMatchObject({ additions: 0, deletions: 0 });
    nonsealable(result);
  });

  it.each([
    ['omitted duplicate', 'Dose 5 mg\nDose 5 mg\nMonitor daily', 'Dose 5 mg\nMonitor daily'],
    ['reordered duplicate', 'Dose 5 mg\nMonitor daily\nDose 5 mg', 'Dose 5 mg\nDose 5 mg\nMonitor daily'],
  ])('refuses an %s line despite matching unordered line sets', async (_label, text, extracted) => {
    await storedText(text);
    state.value.text = extracted;
    expect(new Set(text.split('\n'))).toEqual(new Set(extracted.split('\n')));
    const result = await run();
    expect(result).toMatchObject({ ok: false, artifactVerified: false });
    expect(result.divergence.additions + result.divergence.deletions).toBeGreaterThan(0);
    nonsealable(result);
  });

  it('refuses a newline-heavy mismatch above the line-product budget before allocating LCS', async () => {
    await storedText(Array.from({ length: 1_100 }, (_, index) => `Source line ${index}`).join('\n'));
    state.value.text = Array.from({ length: 1_100 }, (_, index) => `Changed line ${index}`).join('\n');
    const result = await run();
    expect(result).toMatchObject({ ok: false, code: 'VERIFICATION_DIFF_LIMIT', sealEligible: false });
    expect(result.target).toBeUndefined();
  });

  it('permits an exact newline-heavy match without allocating a quadratic mismatch diff', async () => {
    await storedText(Array.from({ length: 1_100 }, (_, index) => `Source line ${index}`).join('\n'));
    const result = await run();
    expect(result).toMatchObject({ ok: true, artifactVerified: true });
    expect(result.divergence).toMatchObject({ additions: 0, deletions: 0 });
    nonsealable(result);
  });
});

describe('explicit malformed target selectors fail before OCR or database access', () => {
  it.each([
    ['blank id', { artifact_id: '' }], ['spaces id', { artifact_id: '   ' }],
    ['null id', { artifact_id: null }], ['number id', { artifact_id: 1 }], ['object id', { artifact_id: {} }],
    ['missing id', { artifact_id: undefined }], ['missing version', { version_number: undefined }],
    ['null version', { version_number: null }], ['string version', { version_number: '2' }],
    ['zero version', { version_number: 0 }], ['negative version', { version_number: -1 }],
    ['fraction version', { version_number: 2.5 }], ['overflow version', { version_number: 2_147_483_648 }],
    ['NaN version', { version_number: NaN }], ['infinite version', { version_number: Infinity }],
  ])('%s cannot silently request the legacy caller-text path', async (_label, input) => {
    await refuses('INVALID_VERIFICATION_TARGET', input);
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it.each([
    ['missing project', { projectId: undefined, projectRef: null }], ['missing project reference', { projectId: null, projectRef: null }],
    ['string project', { projectId: '1' }], ['zero project', { projectId: 0 }],
    ['fraction project', { projectId: 1.5 }], ['overflow project', { projectId: 2_147_483_648 }],
    ['negative organization', { organizationId: -1 }], ['fraction organization', { organizationId: 1.5 }],
    ['overflow organization', { organizationId: 2_147_483_648 }], ['string organization', { organizationId: '1001' }],
  ])('refuses %s honestly', async (_label, ctx) => {
    await refuses('INVALID_VERIFICATION_TARGET', {}, { ...context(), ...ctx });
    expect(state.pool.query).not.toHaveBeenCalled();
  });
});

describe('canonical v2 programs resolve only through their existing unique owned anchor', () => {
  const programContext = () => ({ ...context(), projectId: null, projectRef: fixture.program });

  it('compares persisted text in an existing tenant-owned UUID program anchor', async () => {
    const before = await snapshot();
    const result = await run({}, programContext());
    expect(result).toMatchObject({ ok: true, artifactVerified: true,
      target: { organizationId: fixture.org, projectId, artifactPk: fixture.artifact, versionId, contentSha256: digest(TEXT) } });
    nonsealable(result);
    expect(await snapshot()).toEqual(before);
  });
  it('refuses a missing UUID program', async () => {
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...programContext(), projectRef: randomUUID() });
  });
  it('refuses a UUID program belonging to another organization', async () => {
    const foreign = await harness.seed();
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...programContext(), projectRef: foreign.program });
  });
  it('refuses a deleted UUID program even while its artifact and anchor persist', async () => {
    await harness.pg.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [fixture.program]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, programContext());
  });
  it('refuses a UUID program with no anchor rather than creating one', async () => {
    await harness.pg.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=$1', [projectId]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, programContext());
  });
  it('refuses ambiguous UUID anchors rather than selecting whichever appears first', async () => {
    await harness.pg.query('INSERT INTO projects (organization_id,regulatory_program_id) VALUES ($1,$2)', [fixture.org, fixture.program]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, programContext());
  });
  it('refuses an anchor owned by another organization', async () => {
    await harness.pg.query('UPDATE projects SET organization_id=$2 WHERE id=$1', [projectId, fixture.org + 1_000_000]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, programContext());
  });
  it('refuses a populated integer context that conflicts with the UUID anchor', async () => {
    const other = Number((await harness.pg.query<{ id: number }>('INSERT INTO projects (organization_id) VALUES ($1) RETURNING id', [fixture.org])).rows[0].id);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...programContext(), projectId: other });
  });
  it('reports an anchor-read outage without treating the program as absent', async () => {
    state.value.query = async (sql, params) => {
      if (sql.includes('client_workspace_id')) throw new Error('Anchor lookup unavailable');
      return harness.db.query(sql, params);
    };
    await refuses('VERIFICATION_UNAVAILABLE', {}, programContext());
  });
  it.each(['replaced', 'ambiguous', 'deleted_program'] as const)('rechecks a %s UUID anchor after extraction', async change => {
    state.value.afterExtraction = async () => {
      if (change === 'replaced') await harness.pg.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=$1', [projectId]);
      if (change !== 'deleted_program') await harness.pg.query('INSERT INTO projects (organization_id,regulatory_program_id) VALUES ($1,$2)', [fixture.org, fixture.program]);
      if (change === 'deleted_program') await harness.pg.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [fixture.program]);
    };
    const result = await run({}, programContext());
    expect(result).toMatchObject({ ok: false, code: 'VERIFICATION_TARGET_CHANGED', sealEligible: false });
    expect(result.target).toBeUndefined();
    expect(state.extract).toHaveBeenCalledTimes(1);
  });
});

describe('owned current artifact/version and real disposition policy are mandatory', () => {
  it('refuses another organization artifact', async () => {
    const foreign = await harness.seed();
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', { artifact_id: foreign.artifactNativeId });
  });
  it('refuses an artifact in another project of the same organization', async () => {
    const other = Number((await harness.pg.query<{ id: number }>('INSERT INTO projects (organization_id) VALUES ($1) RETURNING id', [fixture.org])).rows[0].id);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...context(), projectId: other, projectRef: String(other) });
  });
  it('ignores input project_id as authority and cannot override the context project', async () => {
    const other = Number((await harness.pg.query<{ id: number }>('INSERT INTO projects (organization_id) VALUES ($1) RETURNING id', [fixture.org])).rows[0].id);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', { project_id: projectId }, { ...context(), projectId: other, projectRef: String(other) });
  });
  it('refuses conflicting integer projectId and numeric projectRef context', async () => {
    const other = Number((await harness.pg.query<{ id: number }>('INSERT INTO projects (organization_id) VALUES ($1) RETURNING id', [fixture.org])).rows[0].id);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...context(), projectRef: String(other) });
  });
  it('refuses a project owned by another organization', async () => {
    const foreign = await harness.seed();
    const row = (await harness.pg.query<{ project_id: number }>('SELECT project_id FROM concept2cure_artifacts WHERE id=$1', [foreign.artifact])).rows[0];
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', {}, { ...context(), projectId: row.project_id, projectRef: String(row.project_id) });
  });
  it('refuses an unavailable project even if artifact rows still name it', async () => {
    await harness.pg.query('DELETE FROM projects WHERE id=$1', [projectId]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it('refuses a missing external artifact ID', async () => {
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', { artifact_id: 'artifact_missing' });
  });
  it('does not treat an internal numeric ID string as the selected external ID', async () => {
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', { artifact_id: String(fixture.artifact) });
  });
  it('refuses a selected version that exists only under a different artifact', async () => {
    await harness.pg.query('UPDATE concept2cure_artifact_versions SET artifact_id=$2 WHERE id=$1', [versionId, fixture.artifact + 1_000_000]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it('refuses a selected version belonging to another organization', async () => {
    await harness.pg.query('UPDATE concept2cure_artifact_versions SET organization_id=$2 WHERE id=$1', [versionId, fixture.org + 1_000_000]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it('refuses a missing selected version', async () => {
    await harness.pg.query('DELETE FROM concept2cure_artifact_versions WHERE id=$1', [versionId]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it('refuses an older version even when the old and new text hashes coincide', async () => {
    await harness.pg.query(`INSERT INTO concept2cure_artifact_versions (artifact_id,organization_id,version,content,content_hash)
      VALUES ($1,$2,1,$3,$4)`, [fixture.artifact, fixture.org, TEXT, digest(TEXT)]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE', { version_number: 1 });
  });
  it('refuses head content different from the selected persisted version', async () => {
    await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3 WHERE id=$1', [fixture.artifact, 'Revised head', digest('Revised head')]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it.each(['artifact', 'version', 'both'] as const)('refuses corrupt %s hashes rather than trusting equal stored digests', async target => {
    if (target !== 'version') await harness.pg.query('UPDATE concept2cure_artifacts SET content_hash=$2 WHERE id=$1', [fixture.artifact, 'f'.repeat(64)]);
    if (target !== 'artifact') await harness.pg.query('UPDATE concept2cure_artifact_versions SET content_hash=$2 WHERE id=$1', [versionId, 'f'.repeat(64)]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it.each(['artifact', 'version'] as const)('refuses a missing %s hash', async target => {
    const table = target === 'artifact' ? 'concept2cure_artifacts' : 'concept2cure_artifact_versions';
    await harness.pg.query(`UPDATE ${table} SET content_hash=NULL WHERE id=$1`, [target === 'artifact' ? fixture.artifact : versionId]);
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it.each(['remove_data', 'supersede'] as const)('refuses a rendition excluded by a real %s disposition', async choice => {
    await fixture.apply(choice, choice === 'supersede' ? { replacementId: await insertCapturedSuccessor(fixture) } : {});
    await refuses('VERIFICATION_TARGET_UNAVAILABLE');
  });
  it('can compare retained current text after keep_data without claiming scientific verification', async () => {
    await fixture.apply('keep_data');
    const result = await run();
    expect(result.ok).toBe(true);
    expect(result.target.contentSha256).toBe(digest(TEXT));
    nonsealable(result);
  });
});

describe('failed reads and extraction-time changes never leave usable target proof', () => {
  it.each(['projects', 'concept2cure_artifact_versions', 'document_data_dispositions'])('fails closed when the %s read fails', async fragment => {
    state.value.query = async (sql, params) => {
      if (sql.includes(fragment)) throw new Error('Database unavailable (private driver detail)');
      return harness.db.query(sql, params);
    };
    const result = await refuses('VERIFICATION_UNAVAILABLE');
    expect(result.error).not.toContain('private driver detail');
  });
  it.each(['head', 'version', 'version_number', 'removed_version', 'replacement_version', 'removed_project', 'withdrawal'] as const)(
    'refuses a %s change made during extraction', async change => {
      state.value.afterExtraction = async () => {
        if (change === 'head') await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3 WHERE id=$1', [fixture.artifact, 'Changed', digest('Changed')]);
        if (change === 'version') await harness.pg.query('UPDATE concept2cure_artifact_versions SET content=$2,content_hash=$3 WHERE id=$1', [versionId, 'Changed', digest('Changed')]);
        if (change === 'version_number') await harness.pg.query('UPDATE concept2cure_artifacts SET version=3 WHERE id=$1', [fixture.artifact]);
        if (change === 'removed_version') await harness.pg.query('DELETE FROM concept2cure_artifact_versions WHERE id=$1', [versionId]);
        if (change === 'replacement_version') {
          await harness.pg.query('DELETE FROM concept2cure_artifact_versions WHERE id=$1', [versionId]);
          await harness.pg.query(`INSERT INTO concept2cure_artifact_versions (artifact_id,organization_id,version,content,content_hash)
            VALUES ($1,$2,2,$3,$4)`, [fixture.artifact, fixture.org, TEXT, digest(TEXT)]);
        }
        if (change === 'removed_project') await harness.pg.query('DELETE FROM projects WHERE id=$1', [projectId]);
        if (change === 'withdrawal') await fixture.apply('remove_data');
      };
      const result = await run({ expected_text: TEXT });
      expect(result).toMatchObject({ ok: false, code: 'VERIFICATION_TARGET_CHANGED', sealEligible: false });
      expect(result.target).toBeUndefined();
      expect(state.extract).toHaveBeenCalledTimes(1);
    },
  );
  it('reports a failed extractor rather than inventing fidelity', async () => {
    state.value.extractionError = new Error('Extractor unavailable');
    const result = await run();
    expect(result).toMatchObject({ ok: false, code: 'VERIFICATION_UNAVAILABLE', sealEligible: false });
    expect(result.target).toBeUndefined();
  });
  it('fails closed if the recheck database read fails after successful extraction', async () => {
    state.value.afterExtraction = async () => { state.value.query = async () => { throw new Error('Recheck unavailable'); }; };
    const result = await run();
    expect(result).toMatchObject({ ok: false, code: 'VERIFICATION_UNAVAILABLE', sealEligible: false });
    expect(result.target).toBeUndefined();
  });
});

describe('caller strings are scoped findings and cannot qualify verified seals', () => {
  it.each([
    ['caller_text_fidelity', 'caller_supplied_text', { expected_text: TEXT }],
    ['required_strings_only', 'required_strings', { required_strings: ['3.2.P.8 Stability'] }],
  ])('marks %s explicitly unbound, even with forged positive qualifiers', async (scope, comparisonBasis, input) => {
    const result = await run({ artifact_id: undefined, version_number: undefined, ...input,
      artifactVerified: true, sourceVerified: true, sealEligible: true, target: { artifactId: fixture.artifactNativeId } });
    expect(result).toMatchObject({ ok: true, scope, comparisonBasis, artifactVerified: false });
    expect(result.target).toBeUndefined();
    nonsealable(result);
    expect(state.pool.query).not.toHaveBeenCalled();
  });
  it.each(['persisted', 'caller_text', 'required_strings'] as const)('does not let a copied %s report become seal proof', async mode => {
    const result = await run(mode === 'persisted' ? {} : { artifact_id: undefined, version_number: undefined,
      ...(mode === 'caller_text' ? { expected_text: TEXT } : { required_strings: ['3.2.P.8 Stability'] }) });
    expect(result.ok).toBe(true);
    const connect = vi.fn(async () => { throw new Error('Seal must not reach transaction'); });
    await expect(sealVerifiedVersion({
      organizationId: fixture.org, projectId, userId: 42, signerName: 'Jane Roe', title: 'Stability', content: TEXT,
      manifestation: { printedName: 'Jane Roe', meaning: 'APPROVER', reasonForChange: 'Review recorded stability results.' },
      verification: result,
    }, { connect })).rejects.toMatchObject({ code: 'VERIFICATION_SCOPE_INSUFFICIENT' });
    expect(connect).not.toHaveBeenCalled();
  });
  it('retains workspace isolation even when persisted selectors are valid', async () => {
    const before = await snapshot();
    const result = await run({ expected_text: TEXT, input_docx_path: `tmp/docbuilder/org-${fixture.org + 1}/foreign/report.docx` });
    expect(result.error).toMatch(/organization.*workspace/i);
    expect(result.target).toBeUndefined();
    expect(state.extract).not.toHaveBeenCalled();
    expect(state.pool.query).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
});
